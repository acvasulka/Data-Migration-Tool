// One-shot migration: upgrade existing projects.fmx_credentials from Base64
// `email:password` to AES-256-GCM encrypted blobs. Idempotent — rows that
// already decrypt under FMX_CRED_KEY are skipped.
//
// Run locally against prod with service-role access:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FMX_CRED_KEY=... node scripts/migrate-fmx-creds.mjs
//
// Requires @supabase/supabase-js (already a project dep).

import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '../api/_lib/crypto.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function looksLikeOldBase64(value) {
  // Old format: base64 of "email:password" — decoded string contains ":" and no
  // binary bytes. New format decrypts successfully under FMX_CRED_KEY.
  try {
    const s = Buffer.from(value, 'base64').toString('utf8');
    return s.includes(':') && /^[\x20-\x7E]+$/.test(s);
  } catch {
    return false;
  }
}

async function main() {
  if (!process.env.FMX_CRED_KEY) {
    console.error('FMX_CRED_KEY is required');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, fmx_credentials')
    .not('fmx_credentials', 'is', null);
  if (error) { console.error(error); process.exit(1); }

  let migrated = 0, skipped = 0, errored = 0;
  for (const row of data) {
    // Skip if it already decrypts under the new key.
    try {
      decrypt(row.fmx_credentials);
      skipped++;
      continue;
    } catch { /* fall through — treat as legacy */ }

    if (!looksLikeOldBase64(row.fmx_credentials)) {
      console.warn(`[${row.id}] value is neither valid AES-GCM nor legacy base64 — leaving alone`);
      errored++;
      continue;
    }

    const plaintext = Buffer.from(row.fmx_credentials, 'base64').toString('utf8');
    const upgraded = encrypt(plaintext);
    const { error: updErr } = await supabase
      .from('projects')
      .update({ fmx_credentials: upgraded })
      .eq('id', row.id);
    if (updErr) { console.error(`[${row.id}] update failed:`, updErr); errored++; continue; }
    migrated++;
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} errored=${errored}`);
}

main().catch(e => { console.error(e); process.exit(1); });

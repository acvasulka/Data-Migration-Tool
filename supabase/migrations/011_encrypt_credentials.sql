-- Hardens access to fmx_credentials after moving to AES-256-GCM encryption.
-- The column keeps its name but now stores base64(iv || tag || ciphertext)
-- produced by api/_lib/crypto.js. Decryption requires FMX_CRED_KEY on the server.
--
-- Run this after deploying the API changes and running scripts/migrate-fmx-creds.mjs.

-- Revoke direct read access to the credential columns from the anon/authenticated
-- roles so even a leaked anon key cannot exfiltrate ciphertext. Server code uses
-- the service_role key (SUPABASE_SERVICE_ROLE_KEY) which bypasses these grants.
revoke select (fmx_credentials) on projects from anon, authenticated;

-- The plaintext email is kept readable for UI display (it's not a secret on its own).
-- If you want to restrict that too, uncomment:
-- revoke select (fmx_api_email) on projects from anon, authenticated;

-- Optional: an RLS policy already limits project rows to the owner / members.
-- Nothing else is needed here — the column-level revoke above prevents SELECT
-- of fmx_credentials even when the row is otherwise visible.

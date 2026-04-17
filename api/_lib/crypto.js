import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM envelope encryption for at-rest credentials.
// Blob layout (base64 of): [12-byte IV][16-byte auth tag][ciphertext]
// FMX_CRED_KEY is a base64-encoded 32-byte key stored as an environment variable
// on the server. It never ships to the browser.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const raw = process.env.FMX_CRED_KEY;
  if (!raw) throw new Error('FMX_CRED_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FMX_CRED_KEY must decode to 32 bytes');
  }
  return key;
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(blob) {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Ciphertext malformed');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encodeEmailPassword(email, password) {
  return encrypt(`${email}:${password}`);
}

export function decodeEmailPassword(blob) {
  const plaintext = decrypt(blob);
  const idx = plaintext.indexOf(':');
  if (idx === -1) throw new Error('Decrypted credential missing separator');
  return { email: plaintext.slice(0, idx), password: plaintext.slice(idx + 1) };
}

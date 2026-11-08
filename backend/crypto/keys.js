// Loads key material from file paths. Nothing here logs or returns a key body;
// only fingerprints leave this module.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

function load(envVar) {
  const p = process.env[envVar];
  if (!p) throw new Error(`${envVar} is not set. Run: node scripts/secure-keys.js`);
  if (!existsSync(p)) throw new Error(`${envVar} points to a missing file: ${p}`);
  return readFileSync(p, 'utf8');
}

// Lazy accessors: the API never needs the recipient private key, and the
// receiver never needs the sender private key. Missing material fails only
// when a role that needs it runs, which is itself a useful signal.
export const senderSigningKey    = () => load('SECURE_SENDER_PRIVATE_KEY');
export const senderVerifyKey     = () => load('SECURE_SENDER_PUBLIC_KEY');
export const recipientEncryptKey = () => load('SECURE_RECIPIENT_PUBLIC_KEY');
export const recipientDecryptKey = () => load('SECURE_RECIPIENT_PRIVATE_KEY');

/** First 16 hex chars of SHA-256 over the DER body. Safe to log and publish. */
export function fingerprint(pem) {
  const body = String(pem).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return createHash('sha256').update(Buffer.from(body, 'base64')).digest('hex').slice(0, 16);
}

export function keyInfo() {
  const out = { keyId: process.env.SECURE_KEY_ID || 'clinic-2026-q4', keys: {} };
  const probe = [
    ['senderSigning', 'SECURE_SENDER_PRIVATE_KEY'],
    ['senderVerify', 'SECURE_SENDER_PUBLIC_KEY'],
    ['recipientEncrypt', 'SECURE_RECIPIENT_PUBLIC_KEY'],
    ['recipientDecrypt', 'SECURE_RECIPIENT_PRIVATE_KEY'],
  ];
  for (const [name, envVar] of probe) {
    try {
      out.keys[name] = { present: true, fingerprint: fingerprint(load(envVar)) };
    } catch {
      out.keys[name] = { present: false, fingerprint: null };
    }
  }
  return out;
}
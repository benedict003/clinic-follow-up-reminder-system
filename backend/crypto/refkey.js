// Pseudonymous record reference: stable for a given follow-up, not reversible
// without the key, so a partner database leak does not disclose which clinic
// record it refers to.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

let cached = null;

function refKey() {
  if (cached) return cached;
  const p = process.env.SECURE_REF_KEY_FILE;
  if (!p) throw new Error('SECURE_REF_KEY_FILE is not set. Run: node scripts/secure-keys.js');
  const buf = Buffer.from(readFileSync(p, 'utf8').trim(), 'base64');
  if (buf.length !== 32) throw new Error('SECURE_REF_KEY_FILE must hold 32 base64-encoded bytes.');
  cached = buf;
  return cached;
}

export function recordRef(followUpId) {
  return 'R-' + crypto.createHmac('sha256', refKey())
    .update(`followup:${followUpId}`).digest('hex').slice(0, 12);
}

export function refKeyId() {
  return process.env.SECURE_REF_KEY_ID || 'ref-2026-01';
}
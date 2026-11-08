// Generates the four key pairs and the HMAC reference key.
// Refuses to overwrite by default: a silently replaced private key would look
// like the same identity while breaking every previously sealed envelope.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.SECURE_KEY_DIR || 'keys';
const force = process.argv.includes('--force');
mkdirSync(dir, { recursive: true });

const names = [
  'recipient-private.pem', 'recipient-public.pem',
  'sender-private.pem', 'sender-public.pem', 'ref.key',
];

if (!force && names.some(n => existsSync(join(dir, n)))) {
  console.error(`Key material already exists in ${dir}. Re-run with --force only if you mean to rotate.`);
  process.exit(1);
}

const rsa = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ed = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// RSA key transport is used for the per-message key wrap; Ed25519 signs the envelope.
writeFileSync(join(dir, 'recipient-private.pem'), rsa.privateKey, { mode: 0o600 });
writeFileSync(join(dir, 'recipient-public.pem'), rsa.publicKey);
writeFileSync(join(dir, 'sender-private.pem'), ed.privateKey, { mode: 0o600 });
writeFileSync(join(dir, 'sender-public.pem'), ed.publicKey);
writeFileSync(join(dir, 'ref.key'), randomBytes(32).toString('base64') + '\n', { mode: 0o600 });

console.log(`keys written to ${dir}`);
for (const n of names) console.log(`  ${n}`);
console.log('private keys and ref.key are gitignored; public keys are safe to publish.');
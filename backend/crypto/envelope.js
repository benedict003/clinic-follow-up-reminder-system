// Hybrid envelope: AES-256-GCM for the payload, RSA-OAEP-SHA256 to wrap the
// per-message key, Ed25519 to authenticate the whole envelope.
//
//   v1.<b64url(header)>.<b64url(ciphertext)>.<b64url(tag)>.<b64url(signature)>
import crypto from 'node:crypto';

export const ALG = 'RSA-OAEP-256';
export const ENC = 'AES-256-GCM';
export const SIG = 'Ed25519';
export const MAX_CLOCK_SKEW_MS = 120000;

export class EnvelopeError extends Error {
  constructor(code, message, httpStatus = 422) {
    super(message);
    this.name = 'EnvelopeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const OAEP = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256',
};

const REQUIRED_HEADER = ['keyId', 'messageId', 'sender', 'recipient',
                         'issuedAt', 'exp', 'iv', 'wrappedKey'];

/**
 * Seal a payload for one recipient.
 * A fresh 32-byte data key and a fresh 12-byte IV per call. Reusing either with
 * the same key destroys GCM confidentiality entirely, so neither is ever
 * accepted from a caller.
 */
export function seal({
  payload,
  sender,
  recipient,
  keyId,
  recipientPublicKeyPem,
  signingPrivateKeyPem,
  ttlMs = 300000,
  now = Date.now(),
}) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const header = {
    v: 1,
    alg: ALG,
    enc: ENC,
    sig: SIG,
    keyId,
    messageId: crypto.randomUUID(),
    sender,
    recipient,
    issuedAt: new Date(now).toISOString(),
    exp: new Date(now + ttlMs).toISOString(),
    iv: b64u(iv),
    wrappedKey: b64u(crypto.publicEncrypt({ key: recipientPublicKeyPem, ...OAEP }, dek)),
  };

  const headerB64 = b64u(Buffer.from(JSON.stringify(header), 'utf8'));

  // The header is authenticated data: changing recipient, keyId, iv or
  // wrappedKey breaks the tag even if an attacker re-signs the envelope.
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  cipher.setAAD(Buffer.from(`v1.${headerB64}`, 'utf8'));
  const body = Buffer.concat([cipher.update(Buffer.from(payload, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  const ctB64 = b64u(body);
  const tagB64 = b64u(tag);
  const signingInput = `v1.${headerB64}.${ctB64}.${tagB64}`;
  const sig = crypto.sign(null, Buffer.from(signingInput, 'utf8'), signingPrivateKeyPem);

  return {
    envelope: `${signingInput}.${b64u(sig)}`,
    header,
    messageId: header.messageId,
    issuedAt: header.issuedAt,
    exp: header.exp,
    plaintextBytes: Buffer.byteLength(payload, 'utf8'),
    ciphertextBytes: body.length,
    payloadSha256: sha256(payload),
  };
}

/**
 * Open and verify an envelope. The order is deliberate:
 *   structure -> header parse -> version -> algorithm allowlist -> signature
 *   -> audience -> window -> unwrap -> AEAD
 *
 * The allowlist runs before the signature so a downgrade attempt costs one string
 * comparison. The signature runs before any asymmetric operation on
 * attacker-supplied ciphertext. Replay is recorded by the caller only after this
 * succeeds.
 */
export function open({
  envelope,
  recipientPrivateKeyPem,
  senderPublicKeyPem,
  expectRecipient,
  now = Date.now(),
}) {
  const parts = String(envelope ?? '').split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new EnvelopeError('MALFORMED_ENVELOPE',
      'Envelope must have five dot-separated parts and start with v1.', 400);
  }
  const [, headerB64, ctB64, tagB64, sigB64] = parts;

  // Parse first. `header` must be assigned before any field is read: reading it
  // above this line is a temporal dead zone error, not a validation failure, and
  // it would present as a 500 for every envelope including malformed ones.
  let header;
  try {
    header = JSON.parse(unb64u(headerB64).toString('utf8'));
  } catch {
    throw new EnvelopeError('MALFORMED_HEADER', 'Envelope header is not valid JSON.', 400);
  }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    throw new EnvelopeError('MALFORMED_HEADER', 'Envelope header must be a JSON object.', 400);
  }

  if (Number(header.v) !== 1) {
    throw new EnvelopeError('MALFORMED_HEADER', 'Unsupported envelope version.', 400);
  }
  for (const k of REQUIRED_HEADER) {
    if (typeof header[k] !== 'string' || header[k].length === 0) {
      throw new EnvelopeError('MALFORMED_HEADER', `Header is missing "${k}".`, 400);
    }
  }

  if (header.alg !== ALG || header.enc !== ENC || header.sig !== SIG) {
    throw new EnvelopeError('ALGORITHM_NOT_ALLOWED',
      `Only ${ALG} / ${ENC} / ${SIG} are accepted.`, 400);
  }

  const signingInput = `v1.${headerB64}.${ctB64}.${tagB64}`;
  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      null, Buffer.from(signingInput, 'utf8'), senderPublicKeyPem, unb64u(sigB64));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    throw new EnvelopeError('SIGNATURE_INVALID',
      'Sender signature does not verify against the pinned public key.', 422);
  }

  if (expectRecipient && header.recipient !== expectRecipient) {
    throw new EnvelopeError('AUDIENCE_MISMATCH',
      `Envelope is addressed to "${header.recipient}", not "${expectRecipient}".`, 422);
  }

  const issued = Date.parse(header.issuedAt);
  const exp = Date.parse(header.exp);
  if (!Number.isFinite(issued) || !Number.isFinite(exp)) {
    throw new EnvelopeError('MALFORMED_HEADER', 'issuedAt and exp must be ISO timestamps.', 400);
  }
  if (now > exp) {
    throw new EnvelopeError('ENVELOPE_EXPIRED', 'Envelope has expired.', 410);
  }
  if (issued - now > MAX_CLOCK_SKEW_MS) {
    throw new EnvelopeError('NOT_YET_VALID', 'issuedAt is too far in the future.', 422);
  }

  let dek;
  try {
    dek = crypto.privateDecrypt({ key: recipientPrivateKeyPem, ...OAEP }, unb64u(header.wrappedKey));
  } catch {
    throw new EnvelopeError('KEY_UNWRAP_FAILED',
      'The payload key could not be unwrapped with this receiver key.', 422);
  }

  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, unb64u(header.iv));
    decipher.setAAD(Buffer.from(`v1.${headerB64}`, 'utf8'));
    decipher.setAuthTag(unb64u(tagB64));
    plaintext = Buffer.concat([decipher.update(unb64u(ctB64)), decipher.final()]).toString('utf8');
  } catch {
    throw new EnvelopeError('INTEGRITY_CHECK_FAILED',
      'Authentication tag mismatch: the ciphertext or its authenticated metadata was altered.', 422);
  }

  return {
    header,
    plaintext,
    messageId: header.messageId,
    issuedAt: header.issuedAt,
    payloadSha256: sha256(plaintext),
    plaintextBytes: Buffer.byteLength(plaintext, 'utf8'),
  };
}

export { b64u, unb64u, sha256 };
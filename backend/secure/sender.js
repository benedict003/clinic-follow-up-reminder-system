import https from 'node:https';
import { readFileSync } from 'node:fs';
import { pool } from '../db.js';
import { seal, EnvelopeError } from '../crypto/envelope.js';
import { senderSigningKey, recipientEncryptKey } from '../crypto/keys.js';
import { recordRef } from '../crypto/refkey.js';

const SENDER = process.env.SECURE_SENDER_NAME || 'clinic-api';
const RECIPIENT = process.env.SECURE_RECIPIENT_NAME || 'records-office';
const KEY_ID = process.env.SECURE_KEY_ID || 'clinic-2026-q4';
const TTL_MS = Number(process.env.SECURE_TTL_MS || 300000);
const PARTNER_URL = process.env.SECURE_PARTNER_URL || 'https://localhost:4443/receive';
// Reading the pinned CA at import time made a Module 14 certificate a
// precondition for the API to start, so Module 14 could break Module 13.
let _caCache = null;
function partnerCa() {
  if (_caCache) return _caCache;
  const p = process.env.SECURE_PARTNER_CA;
  if (!p) {
    throw new EnvelopeError('PARTNER_CA_NOT_CONFIGURED',
      'SECURE_PARTNER_CA is not set. Run: node scripts/secure-keys.js', 500);
  }
  _caCache = readFileSync(p, 'utf8');
  return _caCache;
}

const log = (event, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'secure', event, ...extra }));


/** The exact record that leaves the system. Identity and clinical reason never appear. */
export function minimizedRecord(fu) {
  return {
    recordRef: recordRef(fu.id),
    dueDate: String(fu.due_date).slice(0, 10),
    status: fu.status,
    action: 'send_reminder',
  };
}

export const WITHHELD = ['patient_name', 'patient_id', 'reason', 'created_by', 'contact_number'];

export async function preview(followUpId) {
  const [rows] = await pool.execute(
    'SELECT id, status, due_date FROM follow_ups WHERE id = ?', [followUpId]);
  if (!rows[0]) throw new EnvelopeError('FOLLOW_UP_NOT_FOUND', 'Follow-up not found.', 404);
  const record = minimizedRecord(rows[0]);
  return {
    followUpId: rows[0].id,
    fields: Object.entries(record).map(([name, value]) => ({ name, value })),
    withheld: WITHHELD,
    plaintextBytes: Buffer.byteLength(JSON.stringify(record), 'utf8'),
    disclosable: rows[0].status === 'scheduled',
    status: rows[0].status,
  };
}

function postEnvelope(envelope) {
  const url = new URL(PARTNER_URL);
  const body = JSON.stringify({ envelope });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      servername: url.hostname,
      ca: partnerCa(),           // validate against the pinned partner CA
      rejectUnauthorized: true, // stated explicitly so it cannot be quietly disabled
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
      timeout: 8000,
    }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* record raw below */ }
        resolve({ status: res.statusCode, body: parsed, raw: text.slice(0, 400) });
      });
    });
    req.on('timeout', () => req.destroy(new EnvelopeError('PARTNER_TIMEOUT', 'Partner did not answer within 8 s.', 504)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function sendSecureRecord(followUpId, actor) {
  const [rows] = await pool.execute(
    'SELECT id, status, due_date FROM follow_ups WHERE id = ?', [followUpId]);
  const fu = rows[0];
  if (!fu) throw new EnvelopeError('FOLLOW_UP_NOT_FOUND', 'Follow-up not found.', 404);
  // Same rule service.js applies before a reminder is queued: only a scheduled
  // record may leave the clinic.
  if (fu.status !== 'scheduled') {
    throw new EnvelopeError('FOLLOW_UP_NOT_DISCLOSABLE',
      `A ${fu.status} follow-up cannot be disclosed.`, 409);
  }
  const record = minimizedRecord(fu);
  const payload = JSON.stringify(record);

  const sealed = seal({
    payload, sender: SENDER, recipient: RECIPIENT, keyId: KEY_ID,
    recipientPublicKeyPem: recipientEncryptKey(),
    signingPrivateKeyPem: senderSigningKey(),
    ttlMs: TTL_MS,
  });

  await pool.execute(
    `INSERT INTO secure_outbox
       (follow_up_id, message_id, sender, recipient, alg, enc, sig, key_id,
        plaintext_bytes, ciphertext_bytes, payload_sha256, status, issued_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'sealed',?,?)`,
    [fu.id, sealed.messageId, SENDER, RECIPIENT, sealed.header.alg, sealed.header.enc,
     sealed.header.sig, KEY_ID, sealed.plaintextBytes, sealed.ciphertextBytes,
     sealed.payloadSha256, new Date(sealed.issuedAt), new Date()]
  );

  log('envelope.sealed', {
    messageId: sealed.messageId, followUpId: fu.id, keyId: KEY_ID,
    plaintextBytes: sealed.plaintextBytes, ciphertextBytes: sealed.ciphertextBytes,
    sha256: sealed.payloadSha256.slice(0, 12), actor: actor?.username ?? null,
  });

  const meta = {
    messageId: sealed.messageId,
    algorithm: { key: sealed.header.alg, payload: sealed.header.enc, signature: sealed.header.sig },
    keyId: KEY_ID,
    issuedAt: sealed.issuedAt,
    expiresAt: sealed.exp,
    plaintextBytes: sealed.plaintextBytes,
    ciphertextBytes: sealed.ciphertextBytes,
    payloadSha256: sealed.payloadSha256,
    transport: {
      url: PARTNER_URL,
      caPinned: process.env.SECURE_PARTNER_CA,
      rejectUnauthorized: true,
    },
  };

  try {
    const res = await postEnvelope(sealed.envelope);
    const ok = res.status === 200 && Boolean(res.body?.receipt);
    await pool.execute(
      'UPDATE secure_outbox SET status=?, http_status=?, error_code=?, detail=? WHERE message_id=?',
      [ok ? 'delivered' : 'rejected', res.status,
       ok ? null : (res.body?.error?.code ?? 'PARTNER_REJECTED'),
       ok ? null : String(res.body?.error?.message ?? res.raw).slice(0, 400),
       sealed.messageId]
    );
    log(ok ? 'envelope.delivered' : 'envelope.rejected',
      { messageId: sealed.messageId, httpStatus: res.status, code: res.body?.error?.code ?? null });
        return {
      ok: Boolean(ok),
      status: res.status,
      record,
      envelope: meta,
      receipt: ok ? (res.body?.receipt ?? null) : null,
      error: ok ? null : (res.body?.error ?? { code: 'PARTNER_REJECTED', message: res.raw }),
    };
  } catch (e) {
    const code = e?.code || e?.cause?.code || 'PARTNER_UNREACHABLE';
    await pool.execute(
      'UPDATE secure_outbox SET status=?, error_code=?, detail=? WHERE message_id=?',
      ['failed', code, String(e?.message || e).slice(0, 400), sealed.messageId]
    );
    log('envelope.failed',
      { messageId: sealed.messageId, code, message: String(e?.message || e).slice(0, 200) });
    return {
      ok: false, status: 0, record, envelope: meta, receipt: null,
      error: { code, message: e?.message || 'Partner unreachable.' },
    };
  }
}

export async function history(limit = 25) {
  // LIMIT cannot be a bound parameter on every server, so the value is clamped to
  // an integer and interpolated. It never reaches SQL as text.
  const n = Math.max(1, Math.min(100, Number(limit) || 25));
  const [rows] = await pool.query(
    `SELECT id, follow_up_id, message_id, sender, recipient, enc, sig, key_id,
            plaintext_bytes, ciphertext_bytes, payload_sha256, status, http_status,
            error_code, issued_at, created_at
       FROM secure_outbox ORDER BY id DESC LIMIT ${n}`);
  return rows;
}
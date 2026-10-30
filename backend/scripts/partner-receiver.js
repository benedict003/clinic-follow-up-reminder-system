// Stand-in for the partner service. Terminates TLS, verifies the envelope,
// refuses replays, and answers with a receipt that contains no plaintext.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { open, EnvelopeError } from '../crypto/envelope.js';
import { recipientDecryptKey, senderVerifyKey, fingerprint } from '../crypto/keys.js';
import { pool } from '../db.js';

const PORT = Number(process.env.SECURE_PARTNER_PORT || 4443);
const RECIPIENT = process.env.SECURE_RECIPIENT_NAME || 'records-office';

const log = (event, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'partner', event, ...extra }));

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        reject(new EnvelopeError('BODY_TOO_LARGE', 'Envelope too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Fail loudly at startup rather than mid-request.
for (const v of ['SECURE_PARTNER_CERT', 'SECURE_PARTNER_CERT_KEY']) {
  if (!process.env[v]) { console.error(`${v} is not set.`); process.exit(1); }
}

const server = https.createServer({
  cert: readFileSync(process.env.SECURE_PARTNER_CERT),
  key: readFileSync(process.env.SECURE_PARTNER_CERT_KEY),
  minVersion: 'TLSv1.2',
}, async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'partner-receiver', recipient: RECIPIENT });
  }
  if (req.method !== 'POST' || req.url !== '/receive') {
    return json(res, 404, { error: 'Not found.' });
  }

  try {
    const body = JSON.parse(await readBody(req));
    if (typeof body?.envelope !== 'string') {
      return json(res, 400, { error: { code: 'MALFORMED_BODY', message: 'Expect { "envelope": "<string>" }.' } });
    }

    const result = open({
      envelope: body.envelope,
      recipientPrivateKeyPem: recipientDecryptKey(),
      senderPublicKeyPem: senderVerifyKey(),
      expectRecipient: RECIPIENT,
    });

    // Replay control is the unique index: it survives a restart and holds
    // under concurrent deliveries, neither of which an in-memory set would.
    try {
      await pool.execute(
        `INSERT INTO secure_inbox
           (message_id, sender, recipient, key_id, payload_sha256, plaintext_bytes, issued_at, received_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [result.messageId, result.header.sender, result.header.recipient,
         result.header.keyId, result.payloadSha256, result.plaintextBytes,
         new Date(result.issuedAt), new Date()]
      );
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        throw new EnvelopeError('REPLAY_DETECTED', 'This messageId has already been accepted.', 409);
      }
      throw e;
    }

    log('receive.accepted', {
      messageId: result.messageId,
      sender: result.header.sender,
      keyId: result.header.keyId,
      bytes: result.plaintextBytes,
      sha256: result.payloadSha256.slice(0, 12),
    });

    return json(res, 200, {
      receipt: {
        messageId: result.messageId,
        recipient: RECIPIENT,
        receivedAt: new Date().toISOString(),
        payloadSha256: result.payloadSha256,
        bytes: result.plaintextBytes,
      },
    });
  } catch (e) {
    const status = e instanceof EnvelopeError ? e.httpStatus : 500;
    const code = e instanceof EnvelopeError ? e.code : 'INTERNAL_ERROR';
    log('receive.rejected', { code, status, message: String(e?.message || e).slice(0, 200) });
    return json(res, status, { error: { code, message: e?.message || 'Rejected.' } });
  }
});

server.on('error', err => { log('server.error', { message: err.message }); process.exit(1); });
server.on('listening', () => log('partner.started', {
  port: PORT,
  recipient: RECIPIENT,
  certFingerprint: fingerprint(readFileSync(process.env.SECURE_PARTNER_CERT, 'utf8')),
}));

server.listen(PORT, '127.0.0.1');
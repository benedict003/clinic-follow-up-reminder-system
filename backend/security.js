// backend/security.js
//
// Module 15 hardening, kept in one place so each control can be pointed at and
// tested: correlation ids, a consistent error contract, security headers, rate
// limiting and the request access log.
//
// Design constraint that shapes all of it: the Flutter client reads `error` as a
// plain string (clinic_api.dart). So `error` stays a string and the machine
// fields are added beside it, never replacing it. Existing clients keep working;
// new clients can branch on `code`.
import { createHash, randomUUID } from 'node:crypto';

const SAFE_INBOUND_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Structured one-line JSON log. Never pass request bodies or headers into it. */
export function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'http', event, ...fields }));
}

/** True when the request reached us over TLS (directly or via a trusted proxy). */
export function isSecureRequest(req) {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

// ── correlation id + access log ────────────────────────────────────────────
export function requestContext(req, res, next) {
  const inbound = req.headers['x-request-id'];
  req.id = typeof inbound === 'string' && SAFE_INBOUND_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  // originalUrl, snapshotted here. Express trims req.url while a mounted router
  // handles the request, so reading req.path at finish time logged "/follow-ups"
  // instead of "/api/clinical/follow-ups" — two different routers would then
  // produce the same log path and correlation would be ambiguous. The query
  // string is dropped on purpose: the board's search box carries patient names.
  const path = String(req.originalUrl || req.url || '').split('?')[0];

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    log(res.statusCode >= 500 ? 'request.failed' : 'request.complete', {
      requestId: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      actor: req.session?.user?.username ?? null,
      role: req.session?.user?.role ?? null,
    });
    if (durationMs > 2000) {
      log('request.slow', { requestId: req.id, method: req.method, path, durationMs });
    }
  });
  next();
}

// ── security headers ───────────────────────────────────────────────────────
// The API only ever returns JSON, so its policy can be maximally strict. The
// Flutter Web bundle needs more room: CanvasKit is a wasm module that spawns
// blob workers, so 'wasm-unsafe-eval' and blob: are required. 'unsafe-eval' is
// kept for the JavaScript renderer fallback and is recorded as a limitation in
// the report rather than silently assumed away.
const CSP_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const CSP_APP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy', req.path.startsWith('/api') ? CSP_API : CSP_APP);
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// ── error contract ─────────────────────────────────────────────────────────
const CODE_BY_STATUS = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'BODY_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/** Body-parser failures carry their own vocabulary; translate, do not echo. */
function fromBodyParser(err) {
  switch (err?.type) {
    case 'entity.parse.failed':
      return { status: 400, code: 'MALFORMED_JSON', message: 'The request body is not valid JSON.' };
    case 'entity.too.large':
      return { status: 413, code: 'BODY_TOO_LARGE', message: 'The request body is too large (limit 64 KB).' };
    case 'charset.unsupported':
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Only UTF-8 request bodies are accepted.' };
    case 'encoding.unsupported':
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'That content encoding is not supported.' };
    default:
      return null;
  }
}

export function errorHandler(err, req, res, _next) {
  const requestId = req.id ?? null;
  const parsed = fromBodyParser(err);
  // `httpStatus` is honoured because Module 14's EnvelopeError carries its
  // intended status there, not in `status`. Reading only `status` turned every
  // deliberate 404/409/422 from the exchange layer into a generic 500, which
  // told the clinician nothing and hid the real cause of a refused envelope.
  const status = parsed?.status ?? err?.status ?? err?.httpStatus ?? err?.statusCode ?? 500;
  // A deliberate client-facing error may name its own code: EnvelopeError uses
  // FOLLOW_UP_NOT_DISCLOSABLE and friends. Only accepted below 500, so a driver
  // error such as ER_DUP_ENTRY can never be echoed to a caller as an API code.
  const envelopeCode = status < 500 && typeof err?.code === 'string'
    && /^[A-Z][A-Z0-9_]{2,40}$/.test(err.code) ? err.code : null;
  const code = parsed?.code ?? err?.apiCode ?? envelopeCode
    ?? CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR';
  const clientSafe = parsed?.message ?? (status >= 500
    ? 'The request could not be completed. Quote the request id when reporting this.'
    : (err?.message || 'The request could not be completed.'));

  if (status >= 500) {
    // Diagnostic detail belongs in the protected log, never in the response.
    log('http.server_error', {
      requestId,
      method: req.method,
      path: String(req.originalUrl || req.url || '').split('?')[0],
      actor: req.session?.user?.username ?? null,
      name: err?.name ?? 'Error',
      message: String(err?.message ?? err).slice(0, 300),
      stack: String(err?.stack ?? '').split('\n').slice(0, 6).join(' | ').slice(0, 800),
    });
  } else if (status !== 401 && status !== 403) {
    // 401/403 are logged by the guard that produced them, with more context.
    log('http.client_error', {
      requestId, status, code, method: req.method,
      path: String(req.originalUrl || req.url || '').split('?')[0],
    });
  }

  if (res.headersSent) return;
  res.status(status).json({ error: clientSafe, code, requestId });
}

/** Express 4/5 both fall through to the error handler for unknown paths. */
export function notFoundHandler(req, _res, next) {
  const e = new Error(`No API endpoint at ${req.method} ${req.path}.`);
  e.status = 404;
  e.apiCode = 'NOT_FOUND';
  next(e);
}

// ── rate limiting ──────────────────────────────────────────────────────────
/**
 * Fixed-window limiter. Keyed maps are per-limiter and pruned on a timer, so a
 * flood of distinct keys cannot grow memory without bound.
 *
 * key: 'ip' | 'username' | function. A username key is the useful one for login:
 * it stops one account being guessed at, and does not let one noisy client lock
 * out an entire clinic behind a shared address.
 */
export function rateLimit({ name, windowMs = 60_000, max = 10, key = 'ip' }) {
  const hits = new Map();
  const pruner = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (pruner.unref) pruner.unref();

  const keyOf = (req) => {
    if (typeof key === 'function') return key(req);
    if (key === 'username') {
      const u = String(req.body?.username ?? '').trim().toLowerCase();
      // Unauthenticated body may be absent or the wrong shape; fall back to IP so
      // the limiter still applies.
      return u ? `u:${u}` : `ip:${req.ip ?? 'unknown'}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
  };

  return (req, res, next) => {
    const k = keyOf(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      // The key can contain a username, so only a hash of it is logged.
      log('security.rate_limited', {
        requestId: req.id,
        limiter: name,
        keyFingerprint: createHash('sha256').update(k).digest('hex').slice(0, 12),
        retryAfterSeconds: retryAfter,
      });
      const e = new Error('Too many attempts. Try again in a moment.');
      e.status = 429;
      e.apiCode = 'RATE_LIMITED';
      return next(e);
    }
    next();
  };
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { pool } from './db.js';
import { cfg } from './config.js';

export const hash = t => createHash('sha256').update(t).digest('hex');

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, encoded] = String(stored).split(':');
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(encoded, 'hex');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  } catch { return false; }
}

/** Attaches req.session (or null) from the cookie. Never rejects. */
export async function attachSession(req, _res, next) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)cfr_session=([a-f0-9]{64})(?:;|$)/);
  req.session = null;
  if (m) {
    const [rows] = await pool.execute(
      `SELECT s.token_hash, s.csrf_token, u.id, u.username, u.name, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
      [hash(m[1]), Date.now()]
    );
    if (rows[0]) {
      req.session = {
        tokenHash: rows[0].token_hash,
        csrfToken: rows[0].csrf_token,
        user: { id: rows[0].id, username: rows[0].username, name: rows[0].name, role: rows[0].role },
      };
    }
  }
  next();
}

export function requireLogin(req, _res, next) {
  if (!req.session) { const e = new Error('Authentication required.'); e.status = 401; return next(e); }
  next();
}

export function requireRole(role, message) {
  return (req, _res, next) => {
    if (req.session?.user.role !== role) {
      const e = new Error(message || 'You do not have access to this.'); e.status = 403; return next(e);
    }
    next();
  };
}

/** Same-origin in production; a same-hostname development allowance only. */
export function originCheck(req, _res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();                       // native / curl: no Origin header
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    const e = new Error('Cross-site requests are not allowed.'); e.status = 403; return next(e);
  }
  let parsed;
  try { parsed = new URL(origin); } catch {
    const e = new Error('Invalid request origin.'); e.status = 403; return next(e);
  }
  const host = new URL(`http://${req.headers.host}`).hostname;
  const devSameHost = cfg.devCors && parsed.hostname === host;
  if (!devSameHost && parsed.host !== req.headers.host) {
    const e = new Error('Cross-site requests are not allowed.'); e.status = 403; return next(e);
  }
  next();
}

/** POST/PUT/DELETE need X-CSRF-Token matching the session. */
export function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.headers['x-csrf-token'];
  const held = req.session?.csrfToken;
  if (typeof sent !== 'string' || typeof held !== 'string' ||
      sent.length !== held.length ||
      !timingSafeEqual(Buffer.from(sent), Buffer.from(held))) {
    const e = new Error('Invalid CSRF token.'); e.status = 403; return next(e);
  }
  next();
}

export function sessionCookie(value, { clear = false } = {}) {
  return `cfr_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : cfg.sessionAge / 1000}`;
}
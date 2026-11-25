// backend/routes.js
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { cfg } from './config.js';
import { hash, passwordHash, verifyPassword, sessionCookie, requireRole, DUMMY_PASSWORD_HASH } from './auth.js';
import { log, isSecureRequest } from './security.js';
import {
  acknowledgeAlerts, createFollowUp, enqueue, findJobDetail, listFollowUps,
  listJobs, retryJob,
} from './service.js';

export const routes = Router();

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const doctorOnly = requireRole('doctor', 'Only a doctor can resolve a reminder job.');

// ── login (wired separately in server.js, exported here for clarity) ───────
export async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    const e = new Error('Enter a valid username and password.'); e.status = 400; e.apiCode = 'INVALID_CREDENTIALS_SHAPE'; throw e;
  }
  // Bound the input before it reaches scrypt: a megabyte of password would cost
  // real CPU for no benefit. express.json already caps the body at 64 KB.
  if (username.length > 100 || password.length > 200) {
    const e = new Error('Enter a valid username and password.'); e.status = 400; e.apiCode = 'INVALID_CREDENTIALS_SHAPE'; throw e;
  }

  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ? AND active = 1', [username.trim()]
  );
  const user = rows[0];

  // One failure path for both "no such user" and "wrong password": the same
  // message, and the same scrypt work. Anything else turns login into a
  // username-enumeration oracle.
  const ok = user
    ? verifyPassword(password, user.password_hash)
    : (verifyPassword(password, DUMMY_PASSWORD_HASH), false);

  if (!ok) {
    log('auth.login.failed', {
      requestId: req.id,
      username: String(username).trim().slice(0, 60),
      reason: user ? 'bad_password' : 'no_such_user',
    });
    const e = new Error('Invalid username or password.'); e.status = 401; e.apiCode = 'INVALID_CREDENTIALS'; throw e;
  }

  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  await pool.execute('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  await pool.execute(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?,?,?,?)',
    [hash(token), user.id, csrfToken, Date.now() + cfg.sessionAge]
  );
  log('auth.login.succeeded', { requestId: req.id, userId: user.id, role: user.role });
  res.status(200)
    .set('Set-Cookie', sessionCookie(token, { secure: isSecureRequest(req) }))
    .json({ user: { id: user.id, username: user.username, name: user.name, role: user.role }, csrfToken });
}

// ── session ───────────────────────────────────────────────────────────────
routes.get('/session', (req, res) =>
  res.json({ user: req.session.user, csrfToken: req.session.csrfToken }));

routes.post('/logout', wrap(async (req, res) => {
  await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [req.session.tokenHash]);
  res.set('Set-Cookie', sessionCookie('', { clear: true, secure: isSecureRequest(req) })).json({ ok: true });
}));

// ── patients & follow-ups ─────────────────────────────────────────────────
routes.get('/patients', wrap(async (_req, res) => {
  const [rows] = await pool.execute('SELECT id, name, category FROM patients ORDER BY name LIMIT 200');
  res.json({ patients: rows });
}));

routes.get('/follow-ups', wrap(async (req, res) =>
  res.json({ followUps: await listFollowUps({ status: req.query.status || '' }) })));

routes.post('/follow-ups', wrap(async (req, res) =>
  res.status(201).json({ followUp: await createFollowUp(req.body, req.session.user) })));

// ── reminder jobs ─────────────────────────────────────────────────────────
routes.get('/reminder-jobs', wrap(async (req, res) =>
  res.json(await listJobs({ status: req.query.status || '', limit: req.query.limit },
    req.session.user))));

routes.get('/reminder-jobs/:id', wrap(async (req, res) =>
  // The actor decides which alerts are visible: doctor-directed alerts are not
  // returned to a nurse.
  res.json(await findJobDetail(Number(req.params.id), req.session.user))));

routes.post('/reminder-jobs', wrap(async (req, res) => {
  const { job, created } = await enqueue(req.body, req.session.user);
  res.status(created ? 201 : 200).json({ job, deduplicated: !created });
}));

routes.post('/reminder-jobs/:id/retry', doctorOnly, wrap(async (req, res) =>
  res.json(await retryJob(Number(req.params.id), req.body?.reason, req.session.user))));

routes.post('/reminder-jobs/:id/acknowledge', doctorOnly, wrap(async (req, res) =>
  res.json(await acknowledgeAlerts(Number(req.params.id), req.session.user))));
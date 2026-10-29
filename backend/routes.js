// backend/routes.js
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { cfg } from './config.js';
import { hash, passwordHash, verifyPassword, sessionCookie, requireRole } from './auth.js';
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
    const e = new Error('Enter a valid username and password.'); e.status = 400; throw e;
  }
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ? AND active = 1', [username.trim()]
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    const e = new Error('Invalid username or password.'); e.status = 401; throw e;
  }
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  await pool.execute('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  await pool.execute(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?,?,?,?)',
    [hash(token), user.id, csrfToken, Date.now() + cfg.sessionAge]
  );
  res.status(200)
    .set('Set-Cookie', sessionCookie(token))
    .json({ user: { id: user.id, username: user.username, name: user.name, role: user.role }, csrfToken });
}

// ── session ───────────────────────────────────────────────────────────────
routes.get('/session', (req, res) =>
  res.json({ user: req.session.user, csrfToken: req.session.csrfToken }));

routes.post('/logout', wrap(async (req, res) => {
  await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [req.session.tokenHash]);
  res.set('Set-Cookie', sessionCookie('', { clear: true })).json({ ok: true });
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
  res.json(await findJobDetail(Number(req.params.id)))));

routes.post('/reminder-jobs', wrap(async (req, res) => {
  const { job, created } = await enqueue(req.body, req.session.user);
  res.status(created ? 201 : 200).json({ job, deduplicated: !created });
}));

routes.post('/reminder-jobs/:id/retry', doctorOnly, wrap(async (req, res) =>
  res.json(await retryJob(Number(req.params.id), req.body?.reason, req.session.user))));

routes.post('/reminder-jobs/:id/acknowledge', doctorOnly, wrap(async (req, res) =>
  res.json(await acknowledgeAlerts(Number(req.params.id), req.session.user))));
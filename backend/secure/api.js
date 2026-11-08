// Module 14 endpoints.
//
// auth.js attaches { tokenHash, csrfToken, user } to req.session. Nothing sets
// req.actor, so gating on it returned 401 on every send while GETs worked.
import { preview, sendSecureRecord, history, WITHHELD } from './sender.js';
import { keyInfo } from '../crypto/keys.js';
import { refKeyId } from '../crypto/refkey.js';

function actorOf(req) {
  return req.session?.user ?? null;
}

function doctorOnly(req, res, next) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'Authentication required.' });
  if (actor.role !== 'doctor') {
    return res.status(403).json({ error: 'Only a doctor can disclose a record to the partner.' });
  }
  req.actor = actor;
  next();
}

export function attachSecureApi(app) {
  const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

  app.get('/api/secure/keyinfo', (_req, res) => {
    res.json({ ...keyInfo(), refKeyId: refKeyId(), withheld: WITHHELD });
  });

  // Read-only and already minimised: a nurse may preview what would leave.
  app.get('/api/secure/preview/:followUpId', wrap(async (req, res) => {
    res.json(await preview(Number(req.params.followUpId)));
  }));

  app.post('/api/secure/send/:followUpId', doctorOnly, wrap(async (req, res) => {
    const out = await sendSecureRecord(Number(req.params.followUpId), req.actor);
    res.status(out.ok ? 200 : (out.status || 502)).json(out);
  }));

  // Names which records left the clinic, so gated like the action creating it.
  app.get('/api/secure/messages', doctorOnly, wrap(async (req, res) => {
    res.json({ messages: await history(Number(req.query.limit || 25)) });
  }));

  console.log(JSON.stringify({
    ts: new Date().toISOString(), src: 'secure', event: 'secure.routes.mounted',
    routes: ['keyinfo', 'preview', 'send', 'messages'], gated: ['send', 'messages'],
  }));
}
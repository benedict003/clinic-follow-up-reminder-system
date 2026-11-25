// backend/server.js
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cfg } from './config.js';
import { attachSession, csrfProtection, originCheck, requireLogin } from './auth.js';
import { routes, login } from './routes.js';
import { startWorker } from './worker.js';
import {
  requestContext, securityHeaders, rateLimit, errorHandler, notFoundHandler,
} from './security.js';

const app = express();
app.disable('x-powered-by');

// Module 15 controls, applied in this order on purpose:
//   1. correlation id, so every later log line and error can be traced;
//   2. security headers, so even an early rejection carries them;
//   3. rate limits, before any handler does work.
app.use(requestContext);
app.use(securityHeaders);

// Generous ceiling that exists to bound abuse, not to shape normal use: a single
// clinician working the board stays far below it.
app.use('/api', rateLimit({ name: 'api-burst', windowMs: 60_000, max: 300 }));

if (cfg.devCors) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers',
        'Content-Type, Accept, X-CSRF-Token, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  console.log('DEV_CORS enabled — cross-origin access allowed for development only');
}

app.use(express.json({ limit: '64kb' }));

// Flutter Web release build. Must be built with --base-href=/app/.
const webRoot = join(process.cwd(), 'public', 'app');
if (existsSync(webRoot)) {
  app.use('/app', express.static(webRoot, { index: 'index.html' }));
}

app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', attachSession);

// PUBLIC liveness. Before requireLogin, so a client can tell "backend down" from
// "not signed in". The login screen probes exactly this.
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'clinic-follow-up-reminders',
  time: new Date().toISOString(),
  uptimeSeconds: Math.round(process.uptime()),
}));

// PUBLIC login: the one write with no session, so it is origin-checked, then
// rate limited per username — the control that actually stops password guessing
// without letting one noisy client lock out a shared clinic address.
const loginLimiter = rateLimit({ name: 'login-username', windowMs: 60_000, max: 10, key: 'username' });
app.post('/api/login', originCheck, loginLimiter, login);

app.use('/api', requireLogin);
app.use('/api', csrfProtection);
app.use('/api', routes);

// Module 14 mounted after the shared guards and before the catch-all. The import
// is guarded so a Module 14 problem cannot stop Module 13 from serving.
let secureMounted = false;
let secureError = null;
try {
  const { attachSecureApi } = await import('./secure/api.js');
  attachSecureApi(app);
  secureMounted = true;
} catch (e) {
  secureError = String(e?.message || e).slice(0, 200);
  console.error(JSON.stringify({
    ts: new Date().toISOString(), src: 'secure',
    event: 'secure.mount_failed', message: secureError,
  }));
}

// Module 15: the clinical workflow. Same guards (session + CSRF) because it is
// mounted after them, and the same guarded import so a workflow problem cannot
// take the reminder queue or the exchange path down with it.
let clinicalMounted = false;
let clinicalError = null;
try {
  const { router: clinical } = await import('./clinical.js');
  app.use('/api/clinical', clinical);
  clinicalMounted = true;
} catch (e) {
  clinicalError = String(e?.message || e).slice(0, 200);
  console.error(JSON.stringify({
    ts: new Date().toISOString(), src: 'clinical',
    event: 'clinical.mount_failed', message: clinicalError,
  }));
}

// Unknown paths go through the same error contract as everything else, so a
// client never has to parse two different error shapes.
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`listening on 127.0.0.1:${cfg.port}`);
  console.log(JSON.stringify({
    ts: new Date().toISOString(), src: 'server',
    event: 'secure.mount_state', mounted: secureMounted, error: secureError,
  }));
  console.log(JSON.stringify({
    ts: new Date().toISOString(), src: 'server',
    event: 'clinical.mount_state', mounted: clinicalMounted, error: clinicalError,
  }));
  startWorker();
});
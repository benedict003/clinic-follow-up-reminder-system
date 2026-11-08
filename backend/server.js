// backend/server.js
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cfg } from './config.js';
import { attachSession, csrfProtection, originCheck, requireLogin } from './auth.js';
import { routes, login } from './routes.js';
import { startWorker } from './worker.js';

const app = express();
app.disable('x-powered-by');

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

// PUBLIC login: the one write with no session, so it is origin-checked.
app.post('/api/login', originCheck, login);

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

app.use((_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

app.use((err, _req, res, _next) => {
  if (err && !err.status) console.error(err);
  res.status(err?.status || 500)
     .json({ error: err?.status ? err.message : 'The request could not be completed.' });
});

app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`listening on 127.0.0.1:${cfg.port}`);
  console.log(JSON.stringify({
    ts: new Date().toISOString(), src: 'server',
    event: 'secure.mount_state', mounted: secureMounted, error: secureError,
  }));
  startWorker();
});
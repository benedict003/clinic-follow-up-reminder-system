// backend/server.js
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cfg } from './config.js';
import { attachSession, csrfProtection, originCheck } from './auth.js';
import { routes, login } from './routes.js';
import { startWorker } from './worker.js';

const app = express();
app.disable('x-powered-by');
// ── DEV ONLY: lets `flutter run -d chrome` (a different port) call this API. ──
// Enabled only when DEV_CORS=true. Never set in .env.example's committed value.
if (cfg.devCors) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      // Cannot be "*" — credentials are in play.
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods',
        'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers',
        'Content-Type, Accept, X-CSRF-Token, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    // Answer the preflight here, or requireLogin returns 401 with no CORS headers.
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  console.log('DEV_CORS enabled — cross-origin access allowed for development only');
}
app.use(express.json({ limit: '64kb' }));

// Flutter Web build, served same-origin (no CORS involved).
const webRoot = join(process.cwd(), 'public', 'app');
if (existsSync(webRoot)) {
  app.use('/app', express.static(webRoot, { index: 'index.html' }));
}

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', attachSession);
app.post('/api/login', originCheck, login);
app.use('/api', (req, res, next) => {
  const { requireLogin } = req.app.locals.auth;
  requireLogin(req, res, next);
});
app.use('/api', csrfProtection);
app.use('/api', routes);

// JSON errors only
app.use((req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, _req, res, _next) => {
  if (err && !err.status) console.error(err);
  res.status(err?.status || 500).json({ error: err?.status ? err.message : 'The request could not be completed.' });
});

app.locals.auth = await import('./auth.js');

app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`listening on 127.0.0.1:${cfg.port}`);
  startWorker();
});
// backend/server.js
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cfg } from './config.js';
import { attachSession, csrfProtection, originCheck, requireLogin } from './auth.js';
import { routes, login } from './routes.js';
import { startWorker, stopWorker, workerRunning } from './worker.js';
import { attachObservability, installShutdown, recordRequest } from './observability.js';
import { serveApp, compressJson } from './delivery.js';
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
  // express.static sent 2.95 MB of JavaScript uncompressed and gave every file the
  // same Cache-Control. serveApp fixes both and records why in delivery.js.
  app.use('/app', serveApp(webRoot));
}

// JSON compression for the API. Patient records are not cacheable, but they are
// compressible, and the board payload is not small.
app.use('/api', compressJson());

app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', attachSession);

// Rate limits sit after attachSession on purpose: the useful key is the signed-in
// user, and that does not exist one line earlier. Before Module 16 they were
// mounted above it, so key 'user' degraded to the address and every workstation
// behind one NAT shared a single budget (measured: 2,262 refused requests in one
// run, all under one key fingerprint).
// Probes must never be refused: a 429 to a readiness check reads as an outage.
// originalUrl, not path: inside app.use('/api', ...) Express trims req.url, so a
// comparison against '/health' silently never matched and a monitoring probe was
// refused with 429 under load — measured at the end of the first full run.
const isProbe = (req) => {
  const p = String(req.originalUrl || req.url || '').split('?')[0];
  return p === '/api/health' || p === '/api/ready' || p === '/api/metrics';
};

// Per authenticated user. This is the limit a clinician could ever notice.
app.use('/api', rateLimit({
  name: 'api-user', windowMs: 60_000, max: cfg.rateLimit.userPerMinute,
  key: 'user', skip: isProbe,
}));

// Per address, set well above the user limit. Its job is to stop one host
// opening many sessions and flooding, not to shape ordinary work.
app.use('/api', rateLimit({
  name: 'api-address', windowMs: 60_000, max: cfg.rateLimit.addressPerMinute,
  key: 'ip', skip: isProbe,
}));

// PUBLIC liveness, readiness and metrics live in observability.js so the three
// questions (alive / able to serve / how is it going) stay visibly separate.
attachObservability(app, {
  routeMounts: () => ({ secure: secureMounted, clinical: clinicalMounted }),
  workerState: () => ({ running: workerRunning(), pollMs: cfg.pollMs }),
});

// PUBLIC login: the one write with no session, so it is origin-checked, then
// rate limited per username — the control that actually stops password guessing
// without letting one noisy client lock out a shared clinic address.
const loginLimiter = rateLimit({ name: 'login-username', windowMs: 60_000, max: cfg.rateLimit.loginPerMinute, key: 'username' });
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

const server = app.listen(cfg.port, '127.0.0.1', () => {
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

// SIGTERM/SIGINT drain instead of dropping in-flight work. Without this, a
// restart during a write leaves the client with a reset connection and the
// database with a transaction that may or may not have committed.
installShutdown({
  server,
  stopWorker,
  log: (event, fields) => console.log(JSON.stringify({
    ts: new Date().toISOString(), src: 'server', event, ...fields,
  })),
});
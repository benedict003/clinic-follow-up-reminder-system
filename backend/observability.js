// backend/observability.js
//
// Module 16: the operational surface.
//
// Three endpoints, deliberately different from each other:
//
//   /api/health   liveness  — is this process alive and serving? Cheap, no I/O.
//   /api/ready    readiness — can it serve a request that touches its dependencies?
//                             Checks the database, the worker and the route mounts.
//   /api/metrics  numbers   — counters and latency, so a person can answer
//                             "is it slower than yesterday?" without a profiler.
//
// The distinction matters in an incident: a failed readiness check means take it
// out of rotation and look at the dependency, while a failed liveness check means
// restart it. Conflating them produces the classic outage where every pod
// restarts because the database is down.
import { pool } from './db.js';
import { createHash } from 'node:crypto';

const startedAt = Date.now();

/** In-process counters. Reset on restart, which is why uptime is reported with them. */
export const metrics = {
  requests: 0,
  byStatus: Object.create(null),
  byPath: Object.create(null),
  durationMsSum: 0,
  durationMsMax: 0,
  // Latency buckets in ms; enough to see a distribution move without a library.
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  bucketCounts: Object.create(null),
  worker: { attempts: 0, failures: 0, lastAttemptAt: null },
  dbErrors: 0,
};

for (const b of metrics.buckets) metrics.bucketCounts[b] = 0;

/**
 * Records one finished request.
 *
 * Path is collapsed to its route shape first: /api/clinical/follow-ups/123 and
 * /456 must not create two entries, or the card grows without bound and every
 * metric about "the record endpoint" is wrong.
 */
export function recordRequest(req, res, durationMs) {
  metrics.requests += 1;
  const status = res.statusCode;
  metrics.byStatus[status] = (metrics.byStatus[status] ?? 0) + 1;
  metrics.durationMsSum += durationMs;
  if (durationMs > metrics.durationMsMax) metrics.durationMsMax = Math.round(durationMs);
  for (const b of metrics.buckets) {
    if (durationMs <= b) { metrics.bucketCounts[b] += 1; break; }
  }
  if (status >= 500) metrics.dbErrors += 0; // kept for shape; DB errors counted below
  const shape = routeShape(req.path);
  metrics.byPath[shape] = (metrics.byPath[shape] ?? 0) + 1;
}

/** '/api/clinical/follow-ups/123/contact' -> '/api/clinical/follow-ups/:id/contact' */
export function routeShape(path) {
  return String(path)
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[a-f0-9]{64}(?=\/|$)/g, '/:token');
}

function percentilesFromBuckets() {
  const total = metrics.requests || 1;
  const out = {};
  let cumulative = 0;
  for (const b of metrics.buckets) {
    cumulative += metrics.bucketCounts[b];
    out[b] = Number(((cumulative / total) * 100).toFixed(1));
  }
  return out;
}

async function checkDatabase() {
  const t0 = process.hrtime.bigint();
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return {
      ok: rows[0]?.ok === 1,
      ms: Number(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2),
    };
  } catch (e) {
    metrics.dbErrors += 1;
    return { ok: false, error: String(e?.code || e?.message || e).slice(0, 120) };
  }
}

function poolStats() {
  // mysql2 exposes the pool's internal counters; they are the honest answer to
  // "are we saturating the database connections?".
  const p = pool.pool ?? pool;
  return {
    size: pool.pool?._allConnections?.length ?? null,
    free: pool.pool?._freeConnections?.length ?? null,
    queueing: pool.pool?._connectionQueue?.length ?? null,
    limit: p.config?.connectionLimit ?? null,
  };
}

/**
 * @param {object} deps  What readiness should verify, injected so this module does
 *                       not import the server and create a cycle.
 */
export function attachObservability(app, deps) {
  const { routeMounts, workerState } = deps;

  // Liveness: no I/O on purpose. If this touches the database, a database blip
  // restarts a healthy process.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'clinic-follow-up-reminders',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Readiness: every dependency that a request needs, checked now.
  app.get('/api/ready', async (_req, res) => {
    const db = await checkDatabase();
    const mounts = routeMounts();
    const worker = workerState();
    const ready = db.ok && mounts.secure && mounts.clinical;

    res.status(ready ? 200 : 503).json({
      ready,
      checks: {
        database: db,
        routes: mounts,
        worker,
      },
      pool: poolStats(),
      uptimeSeconds: Math.round(process.uptime()),
      // Not a secret: a build identifier so an operator knows which binary answered.
      build: process.env.BUILD_ID || 'dev',
    });
  });

  app.get('/api/metrics', (_req, res) => {
    res.json({
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      requests: metrics.requests,
      byStatus: metrics.byStatus,
      byPath: metrics.byPath,
      latency: {
        sumMs: Math.round(metrics.durationMsSum),
        maxMs: metrics.durationMsMax,
        meanMs: metrics.requests ? Number((metrics.durationMsSum / metrics.requests).toFixed(2)) : null,
        // Cumulative share of requests at or under each bucket, so p50/p95 can be
        // read off directly.
        cumulativePercentByBucket: percentilesFromBuckets(),
      },
      worker: metrics.worker,
      dbErrors: metrics.dbErrors,
      pool: poolStats(),
      memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    });
  });

  return app;
}

/**
 * Graceful shutdown.
 *
 * Order matters: stop accepting new connections, let in-flight requests finish,
 * stop the worker so it cannot claim a job it will not complete, then close the
 * pool. A process killed mid-transaction leaves a job claimed as `running` until
 * the stuck-job reclaim picks it up, which is recoverable but noisy.
 */
export function installShutdown({ server, stopWorker, log }) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const t0 = Date.now();
    log('shutdown.begin', { signal, uptimeSeconds: Math.round(process.uptime()) });

    // Hard ceiling: if draining hangs, exit anyway rather than becoming a zombie
    // that a supervisor has to SIGKILL.
    const force = setTimeout(() => {
      log('shutdown.forced', { afterMs: Date.now() - t0 });
      process.exit(1);
    }, 15000);
    if (force.unref) force.unref();

    try {
      if (stopWorker) stopWorker();
      await new Promise((resolve) => server.close(resolve));
      log('shutdown.server_closed', { afterMs: Date.now() - t0 });
      await pool.end();
      log('shutdown.complete', { afterMs: Date.now() - t0 });
      clearTimeout(force);
      process.exit(0);
    } catch (e) {
      log('shutdown.error', { message: String(e?.message || e).slice(0, 200) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

/** Stable fingerprint of a token, for logs. Never log the token itself. */
export const fingerprintOf = (value) =>
  createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

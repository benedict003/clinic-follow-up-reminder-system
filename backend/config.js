const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export const cfg = Object.freeze({
  port: num(process.env.PORT, 3400, 1024, 65535),
  db: Object.freeze({
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306, 1, 65535),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clinic_followup_lab',
  }),
  endpoint: process.env.INTEGRATION_ENDPOINT || 'http://127.0.0.1:4699/notify',
  pollMs: num(process.env.INTEGRATION_POLL_MS, 2000, 250, 60000),
  maxAttempts: num(process.env.INTEGRATION_MAX_ATTEMPTS, 4, 1, 10),
  timeoutMs: num(process.env.INTEGRATION_TIMEOUT_MS, 3000, 500, 30000),
  baseBackoffMs: num(process.env.INTEGRATION_BACKOFF_MS, 500, 50, 30000),
  maxBackoffMs: num(process.env.INTEGRATION_MAX_BACKOFF_MS, 4000, 500, 120000),
  stuckAfterMs: num(process.env.INTEGRATION_STUCK_MS, 60000, 5000, 600000),
  devCors: process.env.DEV_CORS === 'true',
  alertRole: 'doctor',
  sessionAge: 8 * 60 * 60 * 1000,
});

/** Loopback-only: pointing at a real host becomes a startup failure. */
export function assertLocalEndpoint() {
  let u;
  try { u = new URL(cfg.endpoint); }
  catch { throw new Error('INTEGRATION_ENDPOINT is not a valid URL.'); }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)) {
    throw new Error('INTEGRATION_ENDPOINT must be a loopback address. Refusing to start.');
  }
  return u;
}
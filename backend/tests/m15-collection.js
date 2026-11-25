// backend/tests/m15-collection.js
//
// Module 15 integration-test collection. Equivalent to a Postman collection,
// but scripted so it is repeatable and writes machine-readable evidence.
//
//   node --env-file=.env tests/m15-collection.js --label 01-baseline
//   node --env-file=.env tests/m15-collection.js --label 02-hardened
//
// What it does, in order:
//   1. Creates and migrates an isolated database (clinic_followup_m15), so the
//      lab database is never touched. Test data is fictional.
//   2. Starts a controllable stub integration gateway on 127.0.0.1:4799 that can
//      answer ok / 503 / 500 / never-answer, for the dependency and timeout cases.
//   3. Starts the API on 127.0.0.1:3411 pointed at that database and stub.
//   4. Runs every case, recording prediction, expected result, actual result,
//      pass/fail and duration.
//   5. Writes docs/lab/module15/evidence/<label>/ with one JSON per case, a
//      summary, and the captured server log.
//
// Exit code is always 0: a baseline run is expected to contain failures, and the
// record of those failures is the evidence. The summary carries the counts.
import http from 'node:http';
import mysql from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');
const repoDir = join(backendDir, '..');

// ── configuration ──────────────────────────────────────────────────────────
const labelArg = process.argv.indexOf('--label');
const LABEL = labelArg > -1 ? process.argv[labelArg + 1] : 'run';
const TEST_DB = 'clinic_followup_m15';
const API_PORT = 3411;
const STUB_PORT = 4799;
const BASE = `http://127.0.0.1:${API_PORT}`;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}/notify`;
const LAB_PASSWORD = process.env.LAB_PASSWORD || 'lab-password-2026';
const EVIDENCE = join(repoDir, 'docs', 'lab', 'module15', 'evidence', LABEL);

const dbCfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: false,
};

rmSync(EVIDENCE, { recursive: true, force: true });
mkdirSync(EVIDENCE, { recursive: true });

// ── evidence ───────────────────────────────────────────────────────────────
const results = [];
const serverLog = [];

function record(entry) {
  results.push(entry);
  writeFileSync(join(EVIDENCE, `${String(results.length).padStart(2, '0')}-${entry.id}.json`),
    JSON.stringify(entry, null, 2));
  const mark = entry.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${entry.id.padEnd(4)} ${String(entry.ms).padStart(5)} ms  ${entry.title}`);
  if (!entry.pass) {
    console.log(`      expected: ${JSON.stringify(entry.expected)}`);
    console.log(`      actual:   ${JSON.stringify(entry.actual)}`);
    if (entry.note) console.log(`      note:     ${entry.note}`);
  }
}

/** Compares only what the case declares, so unrelated additions do not fail it. */
function judge(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

// ── tiny HTTP client ───────────────────────────────────────────────────────
let session = { cookie: '', csrf: '' };

async function call(method, path, opts = {}) {
  const headers = { accept: 'application/json', ...(opts.headers || {}) };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] = 'application/json';
  }
  if (opts.cookie !== null) {
    const cookie = opts.cookie ?? session.cookie;
    if (cookie) headers.cookie = cookie;
  }
  if (opts.csrf !== null) {
    const csrf = opts.csrf ?? session.csrf;
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  if (opts.origin) headers.origin = opts.origin;
  const t0 = performance.now();
  const res = await fetch(`${opts.base ?? BASE}${path}`, { method, headers, body });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON is recorded as text */ }
  return { status: res.status, headers: res.headers, data, text, ms,
    setCookie: res.headers.get('set-cookie') || '' };
}

/** Runs one case and records it. `check` returns {expected, actual, pass}. */
async function testCase(id, topic, title, fn) {
  const startedAt = new Date().toISOString();
  let out;
  try {
    out = await fn();
  } catch (e) {
    out = { expected: 'case completes', actual: `threw: ${e.message}`, pass: false, ms: 0 };
  }
  record({ id, label: LABEL, topic, title, startedAt, ...out });
}

// ── stub integration gateway ───────────────────────────────────────────────
let stubMode = 'ok';
const stubHits = [];

function startStub() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      stubHits.push({ at: new Date().toISOString(), mode: stubMode,
        path: req.url, bytes: body.length,
        correlationId: req.headers['x-correlation-id'] || null });
      if (stubMode === 'ok') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, delivered: true }));
        return;
      }
      if (stubMode === '503') {
        res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '0' });
        res.end(JSON.stringify({ ok: false, error: 'maintenance' }));
        return;
      }
      if (stubMode === '500') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'boom' }));
        return;
      }
      // 'timeout': accept the request and never answer, so the worker's abort
      // signal is the only thing that ends the attempt.
    });
  });
  return new Promise((resolve) => server.listen(STUB_PORT, '127.0.0.1', () => resolve(server)));
}

// ── database setup ─────────────────────────────────────────────────────────
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function statementsOf(file) {
  // schema.sql opens with CREATE DATABASE ... CHARACTER SET ... and USE. The
  // harness owns the database name, so those statements are dropped as whole
  // units — filtering line by line would leave the CHARACTER SET continuation
  // behind as an orphan statement.
  return file
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const first = s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'))[0] || '';
      return !/^(CREATE\s+DATABASE|USE\s)/i.test(first);
    });
}

async function prepareDatabase() {
  const admin = await mysql.createConnection(dbCfg);
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const db = await mysql.createConnection({ ...dbCfg, database: TEST_DB });
  const files = ['schema.sql', 'schema-14.sql', 'schema-clinic.sql'];
  for (const f of files) {
    const raw = (await import('node:fs')).readFileSync(join(backendDir, f), 'utf8');
    for (const stmt of statementsOf(raw)) {
      try {
        await db.query(stmt);
      } catch (e) {
        // schema-clinic.sql is idempotent by design; a duplicate here is a real
        // failure and must be visible.
        throw new Error(`${f}: ${e.code || ''} ${e.message}\n${stmt.slice(0, 120)}`);
      }
    }
  }

  const now = new Date().toISOString();
  const today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };

  await db.query(
    'INSERT INTO users (username, name, role, password_hash) VALUES (?,?,?,?),(?,?,?,?)',
    ['doctor1', 'Fictional Doctor', 'doctor', hashPassword(LAB_PASSWORD),
      'nurse1', 'Fictional Nurse', 'nurse', hashPassword(LAB_PASSWORD)]);

  await db.query(
    'INSERT INTO patients (id, name, category, contact_number) VALUES (?,?,?,?),(?,?,?,?)',
    ['T-0001', 'Fictional Test Patient A', 'student', '+63 900 000 0001',
      'T-0002', 'Fictional Test Patient B', 'employee', '+63 900 000 0002']);

  // Fixtures are per-case on purpose: a contact changes status, a reschedule
  // bumps the version, and a reminder may only be queued for a scheduled record.
  const fixtures = [
    ['T-0001', shift(-3), 'Overdue recheck (contact cases)'],   // 1
    ['T-0001', shift(4), 'Wound review (reschedule cases)'],    // 2
    ['T-0002', shift(2), 'Closed-outcome cases'],               // 3
    ['T-0002', shift(0), 'Idempotency case'],                   // 4
    ['T-0001', shift(0), 'Dependency 503 case'],                // 5
    ['T-0002', shift(0), 'Timeout case'],                       // 6
    ['T-0001', shift(0), 'Recovery case'],                      // 7
    ['T-0002', shift(-1), 'Overdue for the board'],             // 8
  ];
  for (const [pid, due, reason] of fixtures) {
    await db.query(
      'INSERT INTO follow_ups (patient_id, due_date, reason, created_by, created_at) VALUES (?,?,?,1,?)',
      [pid, due, reason, now]);
  }
  const [ids] = await db.query('SELECT id FROM follow_ups ORDER BY id');
  await db.end();
  return ids.map((r) => Number(r.id));
}

// ── API process ────────────────────────────────────────────────────────────
function startApi() {
  const child = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DB_NAME: TEST_DB,
      PORT: String(API_PORT),
      INTEGRATION_ENDPOINT: STUB_URL,
      INTEGRATION_POLL_MS: '250',
      INTEGRATION_TIMEOUT_MS: '700',
      INTEGRATION_MAX_ATTEMPTS: '3',
      INTEGRATION_BACKOFF_MS: '150',
      INTEGRATION_MAX_BACKOFF_MS: '300',
      DEV_CORS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (buf) => {
    const text = buf.toString();
    for (const line of text.split('\n')) if (line.trim()) serverLog.push(line.trim());
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return child;
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`API did not become healthy on ${BASE}`);
}

async function waitForJob(id, predicate, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const r = await call('GET', `/api/reminder-jobs/${id}`);
    last = r;
    if (r.data?.job && predicate(r.data.job)) return r.data.job;
    await new Promise((res) => setTimeout(res, 250));
  }
  return last?.data?.job ?? null;
}

// ── cases ──────────────────────────────────────────────────────────────────
async function run(ids) {
  const [FU_CONTACT, FU_RESCHED, FU_CLOSE, FU_IDEM, FU_503, FU_TIMEOUT, FU_RECOVER, FU_BOARD] = ids;

  // ── functional contract ────────────────────────────────────────────────
  await testCase('F1', 'contract', 'Health endpoint answers before authentication', async () => {
    const r = await call('GET', '/api/health', { cookie: null });
    const expected = { status: 200, ok: true };
    const actual = { status: r.status, ok: r.data?.ok };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F2', 'authentication', 'Doctor signs in and receives a session cookie and CSRF token', async () => {
    const r = await call('POST', '/api/login', {
      cookie: null, csrf: null, origin: BASE,
      json: { username: 'doctor1', password: LAB_PASSWORD },
    });
    const cookie = (r.setCookie.match(/cfr_session=[a-f0-9]{64}/) || [''])[0];
    const expected = { status: 200, hasCookie: true, hasCsrf: true, role: 'doctor' };
    const actual = { status: r.status, hasCookie: Boolean(cookie),
      hasCsrf: typeof r.data?.csrfToken === 'string', role: r.data?.user?.role };
    if (cookie) session = { cookie, csrf: r.data.csrfToken };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F3', 'contract', 'Follow-up board returns the documented envelope', async () => {
    const r = await call('GET', '/api/clinical/follow-ups?scope=open');
    const d = r.data ?? {};
    const row = (d.followUps ?? [])[0] ?? {};
    const expected = { status: 200, hasScope: true, hasCounts: true,
      countKeys: ['overdue', 'dueToday', 'upcoming', 'open', 'closed'],
      rowKeys: ['id', 'patientName', 'dueDate', 'reason', 'status', 'daysFromToday'] };
    const actual = { status: r.status, hasScope: typeof d.scope === 'string',
      hasCounts: typeof d.counts === 'object',
      countKeys: Object.keys(d.counts ?? {}),
      rowKeys: ['id', 'patientName', 'dueDate', 'reason', 'status', 'daysFromToday']
        .filter((k) => k in row) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F4', 'contract', 'Follow-up detail returns record, patient, history and jobs', async () => {
    const r = await call('GET', `/api/clinical/follow-ups/${FU_CONTACT}`);
    const d = r.data ?? {};
    const expected = { status: 200, keys: ['followUp', 'patient', 'events', 'jobs'] };
    const actual = { status: r.status,
      keys: ['followUp', 'patient', 'events', 'jobs'].filter((k) => k in d) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F5', 'functional', 'Contact attempt "reached" moves the record to reminded', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_CONTACT}/contact`,
      { json: { outcome: 'reached', note: 'Spoke to the patient.' } });
    const expected = { status: 200, status_: 'reminded', attempts: 1 };
    const actual = { status: r.status, status_: r.data?.followUp?.status,
      attempts: r.data?.followUp?.contactAttempts };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F6', 'functional', 'Reschedule moves the date and increments the revision', async () => {
    const before = await call('GET', `/api/clinical/follow-ups/${FU_RESCHED}`);
    const v0 = before.data?.followUp?.version;
    const target = new Date(); target.setDate(target.getDate() + 10);
    const dueDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/reschedule`,
      { json: { dueDate, note: 'Patient asked for a later date.' } });
    const expected = { status: 200, versionBumped: true, dueDate };
    const actual = { status: r.status, versionBumped: r.data?.followUp?.version === v0 + 1,
      dueDate: r.data?.followUp?.dueDate };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('F7', 'functional', 'Doctor closes a follow-up with an outcome', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_CLOSE}/close`,
      { json: { outcome: 'attended', note: 'Attended at the clinic.' } });
    const expected = { status: 200, status_: 'closed', outcome: 'attended' };
    const actual = { status: r.status, status_: r.data?.followUp?.status,
      outcome: r.data?.followUp?.closeOutcome };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  // ── invalid input ──────────────────────────────────────────────────────
  await testCase('V1', 'invalid', 'Unknown contact outcome is rejected', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/contact`,
      { json: { outcome: 'maybe_later' } });
    const expected = { status: 400 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('V2', 'invalid', 'Malformed due date is rejected', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/reschedule`,
      { json: { dueDate: '26/11/2026' } });
    const expected = { status: 400 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('V3', 'invalid', 'Rescheduling into the past is rejected', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/reschedule`,
      { json: { dueDate: '2020-01-01' } });
    const expected = { status: 400 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('V4', 'invalid', 'Malformed JSON body returns a consistent error contract', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/contact`, {
      headers: { 'content-type': 'application/json' },
      body: '{"outcome": "reached",,}',
    });
    const expected = { status: 400, code: 'MALFORMED_JSON', hasRequestId: true,
      leaksParserText: false };
    const actual = { status: r.status, code: r.data?.code ?? null,
      hasRequestId: Boolean(r.data?.requestId),
      leaksParserText: /Unexpected token|position|JSON at/i.test(String(r.data?.error ?? '')) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('V5', 'invalid', 'Oversized body is rejected with a bounded error', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/note`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(70000) }),
    });
    const expected = { status: 413, code: 'BODY_TOO_LARGE', hasRequestId: true };
    const actual = { status: r.status, code: r.data?.code ?? null,
      hasRequestId: Boolean(r.data?.requestId) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('V6', 'invalid', 'Closing as lost-to-follow-up requires a note', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_BOARD}/close`,
      { json: { outcome: 'lost_to_follow_up' } });
    const expected = { status: 400 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  // ── authentication ─────────────────────────────────────────────────────
  await testCase('A1', 'authentication', 'No session is refused on a protected route', async () => {
    const r = await call('GET', '/api/clinical/follow-ups', { cookie: null });
    const expected = { status: 401, code: 'UNAUTHENTICATED' };
    const actual = { status: r.status, code: r.data?.code ?? null };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('A2', 'authentication', 'A forged session cookie is refused', async () => {
    const r = await call('GET', '/api/clinical/follow-ups', { cookie: `cfr_session=${'a'.repeat(64)}` });
    const expected = { status: 401 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('A3', 'authentication', 'A write without a CSRF token is refused', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/note`,
      { csrf: null, json: { note: 'no csrf' } });
    const expected = { status: 403 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('A4', 'authentication', 'A write with the wrong CSRF token is refused', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RESCHED}/note`,
      { csrf: 'b'.repeat(64), json: { note: 'wrong csrf' } });
    const expected = { status: 403 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('A5', 'authentication', 'A cross-site Origin is refused', async () => {
    const r = await call('POST', `/api/login`, {
      cookie: null, csrf: null, origin: 'http://attacker.example',
      json: { username: 'doctor1', password: LAB_PASSWORD },
    });
    const expected = { status: 403 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('A6', 'authentication', 'A session revoked server-side no longer authenticates', async () => {
    // Log in a second client, delete its session row, then use its cookie.
    const login = await call('POST', '/api/login', {
      cookie: null, csrf: null, origin: BASE,
      json: { username: 'nurse1', password: LAB_PASSWORD },
    });
    const cookie = (login.setCookie.match(/cfr_session=[a-f0-9]{64}/) || [''])[0];
    const admin = await mysql.createConnection({ ...dbCfg, database: TEST_DB });
    await admin.query('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', ['nurse1']);
    await admin.end();
    const r = await call('GET', '/api/clinical/follow-ups', { cookie });
    const expected = { status: 401 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  // ── authorization ──────────────────────────────────────────────────────
  await testCase('Z1', 'authorization', 'A nurse cannot close a follow-up', async () => {
    const login = await call('POST', '/api/login', {
      cookie: null, csrf: null, origin: BASE,
      json: { username: 'nurse1', password: LAB_PASSWORD },
    });
    const nurse = { cookie: (login.setCookie.match(/cfr_session=[a-f0-9]{64}/) || [''])[0],
      csrf: login.data.csrfToken };
    const r = await call('POST', `/api/clinical/follow-ups/${FU_IDEM}/close`,
      { cookie: nurse.cookie, csrf: nurse.csrf, json: { outcome: 'attended' } });
    const expected = { status: 403, code: 'FORBIDDEN_ROLE' };
    const actual = { status: r.status, code: r.data?.code ?? null };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('Z2', 'authorization', 'A nurse may still record a contact attempt', async () => {
    const login = await call('POST', '/api/login', {
      cookie: null, csrf: null, origin: BASE,
      json: { username: 'nurse1', password: LAB_PASSWORD },
    });
    const nurse = { cookie: (login.setCookie.match(/cfr_session=[a-f0-9]{64}/) || [''])[0],
      csrf: login.data.csrfToken };
    const r = await call('POST', `/api/clinical/follow-ups/${FU_RECOVER}/contact`,
      { cookie: nurse.cookie, csrf: nurse.csrf, json: { outcome: 'voicemail' } });
    const expected = { status: 200 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  // ── not found ──────────────────────────────────────────────────────────
  await testCase('N1', 'not-found', 'An unknown follow-up id returns 404', async () => {
    const r = await call('GET', '/api/clinical/follow-ups/999999');
    const expected = { status: 404 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('N2', 'not-found', 'An unknown API path returns 404 with the error contract', async () => {
    const r = await call('GET', '/api/does-not-exist');
    const expected = { status: 404, hasError: true, hasRequestId: true };
    const actual = { status: r.status, hasError: typeof r.data?.error === 'string',
      hasRequestId: Boolean(r.data?.requestId) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  // ── duplicate submissions and idempotency ──────────────────────────────
  let idemJobId = null;
  await testCase('D1', 'duplicate', 'Queueing the same reminder twice is idempotent', async () => {
    stubMode = 'ok';
    const first = await call('POST', '/api/reminder-jobs',
      { json: { followUpId: FU_IDEM } });
    const second = await call('POST', '/api/reminder-jobs',
      { json: { followUpId: FU_IDEM } });
    idemJobId = first.data?.job?.id ?? null;
    const expected = { firstStatus: 201, secondStatus: 200, deduplicated: true,
      sameJob: true };
    const actual = { firstStatus: first.status, secondStatus: second.status,
      deduplicated: second.data?.deduplicated === true,
      sameJob: first.data?.job?.id === second.data?.job?.id };
    return { expected, actual, pass: judge(expected, actual), ms: first.ms + second.ms };
  });

  await testCase('D2', 'duplicate', 'Closing the same follow-up twice returns 409', async () => {
    const r = await call('POST', `/api/clinical/follow-ups/${FU_CLOSE}/close`,
      { json: { outcome: 'declined', note: 'second attempt' } });
    const expected = { status: 409 };
    const actual = { status: r.status };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('D3', 'duplicate', 'Registering an existing patient id returns 409', async () => {
    const first = await call('POST', '/api/clinical/patients',
      { json: { id: 'T-0001', name: 'Duplicate attempt', category: 'student' } });
    const expected = { status: 409 };
    const actual = { status: first.status };
    return { expected, actual, pass: judge(expected, actual), ms: first.ms };
  });

  // ── dependency failure, timeout, recovery ──────────────────────────────
  await testCase('R1', 'reliability', 'A 503 from the gateway is retried to the limit, then escalated', async () => {
    stubMode = '503';
    const queue = await call('POST', '/api/reminder-jobs', { json: { followUpId: FU_503 } });
    const jobId = queue.data?.job?.id;
    const job = await waitForJob(jobId, (j) => j.status === 'needs_human', 15000);
    const expected = { status: 'needs_human', attempts: 3, boundedByMaxAttempts: true };
    const actual = { status: job?.status, attempts: job?.attempts,
      boundedByMaxAttempts: job ? job.attempts <= job.maxAttempts : false };
    return { expected, actual, pass: judge(expected, actual), ms: 0,
      note: `job #${jobId} correlation ${job?.correlationId}` };
  });

  await testCase('R2', 'reliability', 'A gateway that never answers times out and is bounded', async () => {
    stubMode = 'timeout';
    const queue = await call('POST', '/api/reminder-jobs', { json: { followUpId: FU_TIMEOUT } });
    const jobId = queue.data?.job?.id;
    const job = await waitForJob(jobId, (j) => j.status === 'needs_human', 20000);
    const detail = await call('GET', `/api/reminder-jobs/${jobId}`);
    const attempts = detail.data?.attempts ?? [];
    const expected = { status: 'needs_human', timedOut: true, attemptsWithinLimit: true };
    const actual = { status: job?.status,
      timedOut: attempts.some((a) => a.errorCode === 'TIMEOUT' || /TIMEOUT/.test(a.outcome)),
      attemptsWithinLimit: job ? job.attempts <= job.maxAttempts : false };
    return { expected, actual, pass: judge(expected, actual), ms: 0,
      note: `job #${jobId}; attempt codes ${attempts.map((a) => a.errorCode).join(',')}` };
  });

  await testCase('R3', 'reliability', 'The same path succeeds once the gateway recovers', async () => {
    stubMode = 'ok';
    const queue = await call('POST', '/api/reminder-jobs', { json: { followUpId: FU_RECOVER } });
    const jobId = queue.data?.job?.id;
    const job = await waitForJob(jobId, (j) => j.status === 'succeeded', 12000);
    const expected = { status: 'succeeded' };
    const actual = { status: job?.status };
    return { expected, actual, pass: judge(expected, actual), ms: 0,
      note: `job #${jobId}` };
  });

  await testCase('Z3', 'authorization', 'A nurse does not receive doctor-only automation alerts', async () => {
    // The job escalated in R1 holds a doctor alert. cfg.alertRole is doctor.
    const doctorView = await call('GET', '/api/reminder-jobs?status=needs_human');
    const jobId = (doctorView.data?.jobs ?? [])[0]?.id;
    const login = await call('POST', '/api/login', {
      cookie: null, csrf: null, origin: BASE,
      json: { username: 'nurse1', password: LAB_PASSWORD },
    });
    const nurse = { cookie: (login.setCookie.match(/cfr_session=[a-f0-9]{64}/) || [''])[0] };
    const asDoctor = await call('GET', `/api/reminder-jobs/${jobId}`);
    const asNurse = await call('GET', `/api/reminder-jobs/${jobId}`, { cookie: nurse.cookie });
    const expected = { doctorSeesAlerts: true, nurseAlertCount: 0 };
    const actual = { doctorSeesAlerts: (asDoctor.data?.alerts ?? []).length > 0,
      nurseAlertCount: (asNurse.data?.alerts ?? []).length };
    return { expected, actual, pass: judge(expected, actual), ms: asDoctor.ms + asNurse.ms,
      note: `job #${jobId}` };
  });

  // ── security headers ───────────────────────────────────────────────────
  await testCase('S1', 'hardening', 'Security headers are present on API responses', async () => {
    const r = await call('GET', '/api/health', { cookie: null });
    const h = r.headers;
    const expected = {
      nosniff: 'nosniff',
      frame: 'DENY',
      referrer: 'no-referrer',
      csp: true,
      permissions: true,
      requestId: true,
    };
    const actual = {
      nosniff: h.get('x-content-type-options'),
      frame: h.get('x-frame-options'),
      referrer: h.get('referrer-policy'),
      csp: Boolean(h.get('content-security-policy')),
      permissions: Boolean(h.get('permissions-policy')),
      requestId: Boolean(h.get('x-request-id')),
    };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('S2', 'hardening', 'An inbound correlation id is preserved for tracing', async () => {
    const id = 'm15-trace-0123456789';
    const r = await call('GET', '/api/health', { cookie: null, headers: { 'x-request-id': id } });
    const expected = { echoed: id };
    const actual = { echoed: r.headers.get('x-request-id') };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('S3', 'hardening', 'Repeated failed logins are rate limited', async () => {
    let last = null;
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      last = await call('POST', '/api/login', {
        cookie: null, csrf: null, origin: BASE,
        json: { username: 'probe-flood', password: `wrong-${i}` },
      });
      statuses.push(last.status);
      if (last.status === 429) break;
    }
    const expected = { limited: true, status: 429, hasRetryAfter: true };
    const actual = { limited: statuses.includes(429), status: last.status,
      hasRetryAfter: Boolean(last.headers.get('retry-after')) };
    return { expected, actual, pass: judge(expected, actual), ms: last.ms,
      note: `status sequence ${statuses.join(',')}` };
  });

  await testCase('S4', 'hardening', 'Login timing does not reveal whether a username exists', async () => {
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const real = [];
    const ghost = [];
    for (let i = 0; i < 5; i++) {
      real.push((await call('POST', '/api/login', {
        cookie: null, csrf: null, origin: BASE,
        json: { username: 'doctor1', password: `wrong-${i}` },
      })).ms);
      ghost.push((await call('POST', '/api/login', {
        cookie: null, csrf: null, origin: BASE,
        json: { username: `ghost-${i}`, password: `wrong-${i}` },
      })).ms);
    }
    const mr = median(real);
    const mg = median(ghost);
    const delta = Math.abs(mr - mg);
    const expected = { deltaUnderMs: 15, classification: 'indistinguishable' };
    const actual = { deltaUnderMs: delta <= 15 ? true : delta,
      classification: delta <= 15 ? 'indistinguishable' : 'distinguishable',
      realMedianMs: mr, ghostMedianMs: mg };
    return { expected, actual, pass: delta <= 15, ms: mr + mg,
      note: `real ${real.join('/')} ms vs ghost ${ghost.join('/')} ms` };
  });

  await testCase('S5', 'hardening', 'A non-numeric path parameter is a client error, not a server error', async () => {
    // Baseline: /api/secure/preview/abc answered 500 (NaN reached the driver).
    const r = await call('GET', '/api/secure/preview/abc');
    const body = String(r.text ?? '');
    const expected = { status: 400, code: 'INVALID_PARAMETER', hasRequestId: true,
      leaksInternals: false };
    const actual = { status: r.status, code: r.data?.code ?? null,
      hasRequestId: Boolean(r.data?.requestId),
      leaksInternals: /ER_|at Object\.|TypeError|SELECT .* FROM/i.test(body) };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });

  await testCase('S6', 'hardening', 'A refusal from the exchange layer keeps its declared status and code', async () => {
    // The closed fixture may not be disclosed. Baseline: 500, because
    // EnvelopeError carries its status in `httpStatus` and the old handler only
    // read `status`, so every deliberate refusal became a generic server error.
    const r = await call('POST', `/api/secure/send/${FU_CLOSE}`, { json: {} });
    const expected = { status: 409, code: 'FOLLOW_UP_NOT_DISCLOSABLE' };
    const actual = { status: r.status, code: r.data?.code ?? null };
    return { expected, actual, pass: judge(expected, actual), ms: r.ms };
  });
}

// ── log hygiene, computed after the run ────────────────────────────────────
function logHygiene() {
  const text = serverLog.join('\n');
  const passwordPresent = text.includes(LAB_PASSWORD);
  const csrfPresent = text.includes(session.csrf) && session.csrf.length > 0;
  const privateKeyPresent = /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text);
  const requestIds = (text.match(/"requestId":"[^"]+"/g) || []).length;
  record({
    id: 'L1', label: LABEL, topic: 'hardening',
    title: 'Logs contain no password, token or key material',
    startedAt: new Date().toISOString(),
    expected: { passwordPresent: false, csrfPresent: false, privateKeyPresent: false,
      hasCorrelationIds: true },
    actual: { passwordPresent, csrfPresent, privateKeyPresent,
      hasCorrelationIds: requestIds > 0, requestIdLines: requestIds,
      logLines: serverLog.length },
    pass: !passwordPresent && !csrfPresent && !privateKeyPresent && requestIds > 0,
    ms: 0,
  });
}

// ── main ───────────────────────────────────────────────────────────────────
let api = null;
let stub = null;

try {
  console.log(`Module 15 collection · label=${LABEL}`);
  const ids = await prepareDatabase();
  console.log(`isolated database ${TEST_DB} ready, fixtures #${ids.join(', #')}`);
  stub = await startStub();
  api = startApi();
  await waitForHealth();
  console.log(`API listening on ${BASE}, stub gateway on ${STUB_URL}`);
  await run(ids);
  logHygiene();
} catch (e) {
  console.error('harness error:', e?.stack || e);
  record({
    id: 'X1', label: LABEL, topic: 'harness', title: 'Collection completed',
    startedAt: new Date().toISOString(),
    expected: 'collection runs to the end', actual: `aborted: ${e.message}`,
    pass: false, ms: 0,
  });
} finally {
  if (api) api.kill('SIGKILL');
  if (stub) stub.close();
  await new Promise((r) => setTimeout(r, 400));

  const passed = results.filter((r) => r.pass).length;
  const summary = {
    label: LABEL,
    ranAt: new Date().toISOString(),
    build: { node: process.version, platform: `${process.platform} ${process.arch}` },
    database: TEST_DB,
    api: BASE,
    stub: STUB_URL,
    total: results.length,
    passed,
    failed: results.length - passed,
    byTopic: results.reduce((acc, r) => {
      const t = acc[r.topic] ?? { total: 0, passed: 0 };
      t.total += 1;
      if (r.pass) t.passed += 1;
      acc[r.topic] = t;
      return acc;
    }, {}),
    cases: results.map((r) => ({ id: r.id, topic: r.topic, title: r.title, pass: r.pass,
      ms: r.ms, expected: r.expected, actual: r.actual })),
    stubHits,
  };
  writeFileSync(join(EVIDENCE, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(EVIDENCE, 'server-log.txt'), serverLog.join('\n'));

  const table = results.map((r) => `| ${r.id} | ${r.topic} | ${r.title} | ${r.pass ? 'pass' : 'FAIL'} | ${r.ms} |`).join('\n');
  writeFileSync(join(EVIDENCE, 'results.md'),
    `# Module 15 collection — ${LABEL}\n\n` +
    `Ran ${summary.ranAt} against ${TEST_DB} on ${BASE}.\n\n` +
    `**${passed}/${results.length} passed, ${results.length - passed} failed.**\n\n` +
    `| ID | Topic | Case | Verdict | ms |\n| --- | --- | --- | --- | --- |\n${table}\n`);

  console.log(`\n${passed}/${results.length} passed, ${results.length - passed} failed`);
  console.log(`evidence: docs/lab/module15/evidence/${LABEL}/`);
  process.exit(0);
}

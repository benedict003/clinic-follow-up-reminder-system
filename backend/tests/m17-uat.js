// backend/tests/m17-uat.js
//
// Module 17: user acceptance testing and the final portfolio checks.
//
// Two kinds of check live here, and they answer different questions:
//
//   1. SPEC CONFORMANCE. Every path in docs/openapi.yaml must exist in the running
//      service. A specification that has drifted from the code is worse than no
//      specification, because it is trusted.
//   2. UAT SCENARIOS. Eight stakeholder-level scenarios, written as acceptance
//      criteria in docs/lab/module17/UAT-PLAN.md and executed here in the order a
//      clinic would meet them, as the role that owns each decision.
//
// The harness owns clinic_followup_m17 and its own API process on 3417, so it
// cannot disturb the lab database or a demonstration in progress.
//
//   node --env-file=.env tests/m17-uat.js --label 01-uat
//
// What it does NOT do: pretend a stakeholder sat in the room. Each scenario records
// what the system did. The acceptance decision belongs to the office and is left as
// a blank, signed line in UAT-RESULTS.md.
import http from 'node:http';
import mysql from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');
const repoDir = join(backendDir, '..');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const LABEL = arg('label', '01-uat');
const TEST_DB = 'clinic_followup_m17';
const PORT = 3417;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = process.env.LAB_PASSWORD || 'lab-password-2026';
const OUT = join(repoDir, 'docs', 'lab', 'module17', 'evidence', LABEL);

const dbCfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { label: LABEL, ranAt: new Date().toISOString(), spec: {}, scenarios: [], findings: [] };

// ── HTTP ───────────────────────────────────────────────────────────────────
const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });

function request(method, path, { cookie, csrf, body } = {}) {
  return new Promise((resolve) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { accept: 'application/json' };
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
      headers.origin = BASE;
    }
    const t0 = process.hrtime.bigint();
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path, agent, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(text); } catch { /* non-JSON */ }
        resolve({
          status: res.statusCode,
          data,
          text,
          ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6),
          setCookie: res.headers['set-cookie'] || [],
        });
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: null, text: String(e.message), ms: 0, setCookie: [] }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function signIn(username) {
  const res = await request('POST', '/api/login', { body: { username, password: PASSWORD } });
  const cookie = (res.setCookie.join('; ').match(/cfr_session=[a-f0-9]{64}/) || [])[0];
  return { cookie, csrf: res.data?.csrfToken, status: res.status, user: res.data?.user };
}

// ── database ───────────────────────────────────────────────────────────────
const hashPassword = (p) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(p, salt, 64).toString('hex')}`;
};

function statementsOf(text) {
  return text.split(';').map((s) => s.trim()).filter(Boolean).filter((s) => {
    const first = s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'))[0] || '';
    return !/^(CREATE\s+DATABASE|USE\s)/i.test(first);
  });
}

async function prepare() {
  const admin = await mysql.createConnection(dbCfg);
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const db = await mysql.createConnection({ ...dbCfg, database: TEST_DB });
  for (const f of ['schema.sql', 'schema-14.sql', 'schema-clinic.sql']) {
    for (const stmt of statementsOf(readFileSync(join(backendDir, f), 'utf8'))) await db.query(stmt);
  }
  const now = new Date().toISOString();
  await db.query(
    'INSERT INTO users (username, name, role, password_hash) VALUES (?,?,?,?),(?,?,?,?)',
    ['doctor1', 'Fictional Doctor', 'doctor', hashPassword(PASSWORD),
      'nurse1', 'Fictional Nurse', 'nurse', hashPassword(PASSWORD)]);

  const today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
  await db.query(
    'INSERT INTO patients (id, name, category, contact_number) VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?)',
    ['U-0001', 'Fictional UAT Patient A', 'student', '+63 900 100 0001',
      'U-0002', 'Fictional UAT Patient B', 'employee', '+63 900 100 0002',
      'U-0003', 'Fictional UAT Patient C', 'student', null]);
  // One record per scenario that mutates, so scenarios cannot disturb each other.
  await db.query(
    `INSERT INTO follow_ups (patient_id, due_date, reason, created_by, created_at) VALUES
       ('U-0001', ?, 'Blood pressure review for UAT-2', 1, ?),
       ('U-0002', ?, 'Wound review for UAT-3', 1, ?),
       ('U-0001', ?, 'Medication review for UAT-4', 1, ?),
       ('U-0003', ?, 'No contact number, for UAT-5', 1, ?),
       ('U-0002', ?, 'Idempotency check for UAT-6', 1, ?),
       ('U-0001', ?, 'Disclosure check for UAT-7', 1, ?)`,
    [shift(-2), now, shift(5), now, shift(0), now, shift(1), now, shift(0), now, shift(3), now]);

  const [ids] = await db.query('SELECT id FROM follow_ups ORDER BY id');
  await db.end();
  return ids.map((r) => Number(r.id));
}

// ── API process ────────────────────────────────────────────────────────────
let api = null;
const log = [];

function startApi() {
  const child = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
    cwd: backendDir,
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(PORT), INTEGRATION_POLL_MS: '60000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (b) => { for (const l of b.toString().split('\n')) if (l.trim()) log.push(l.trim()); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return child;
}

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* starting */ }
    await sleep(250);
  }
  throw new Error('API did not start');
}

// ── 1. spec conformance ────────────────────────────────────────────────────
/**
 * Every documented operation must exist. The distinguishing signal is the
 * notFound handler's message: an unknown route answers "No API endpoint at ...",
 * while a real endpoint that rejects the request answers something else.
 */
async function checkSpec() {
  // A throwaway session: /api/logout is a documented operation, and probing it with
  // the session the scenarios rely on destroys that session. Found the hard way —
  // the first run reported five 401s that were the harness, not the product.
  const probe = await signIn('doctor1');
  const yaml = readFileSync(join(repoDir, 'docs', 'openapi.yaml'), 'utf8');
  const ops = [];
  let currentPath = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const pathMatch = raw.match(/^ {2}(\/api[^:]*):\s*$/);
    if (pathMatch) { currentPath = pathMatch[1]; continue; }
    const methodMatch = raw.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) ops.push({ path: currentPath, method: methodMatch[1].toUpperCase() });
  }

  const checks = [];
  for (const op of ops) {
    // Substitute a plausible id so the route is reached rather than the 404 handler.
    const concrete = op.path.replace(/\{[^}]+\}/g, '1');
    const res = await request(op.method, concrete, op.method === 'POST'
      ? { cookie: probe.cookie, csrf: probe.csrf, body: {} }
      : { cookie: probe.cookie || undefined });
    const isUnknownRoute = res.status === 404 && /No API endpoint at/i.test(String(res.data?.error ?? ''));
    checks.push({ method: op.method, path: op.path, status: res.status, exists: !isUnknownRoute });
  }

  results.spec = {
    documentedOperations: ops.length,
    existing: checks.filter((c) => c.exists).length,
    missing: checks.filter((c) => !c.exists),
    conforms: checks.every((c) => c.exists),
  };
  console.log(`spec: ${results.spec.existing}/${ops.length} documented operations exist${results.spec.conforms ? '' : ' — MISSING'}`);
}

// ── 2. UAT scenarios ───────────────────────────────────────────────────────
function record(scenario) {
  results.scenarios.push(scenario);
  const mark = scenario.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${scenario.id}  ${scenario.title}`);
  if (!scenario.pass) console.log(`      observed: ${JSON.stringify(scenario.observed)}`);
}

async function runScenarios(ids, doctor, nurse) {
  const [fuBp, fuWound, fuMeds, fuNoPhone, fuIdem, fuDisclose] = ids;

  // UAT-1 ─ a clinician finds the work for today without being told where to look.
  {
    const board = await request('GET', '/api/clinical/worklist', { cookie: doctor.cookie });
    const c = board.data?.counts ?? {};
    const ok = board.status === 200
      && Number(c.overdue) >= 1
      && Array.isArray(board.data?.overdue)
      && Array.isArray(board.data?.dueToday)
      && typeof board.data?.today === 'string';
    record({
      id: 'UAT-1', title: 'A clinician can see today\'s work on arrival',
      role: 'doctor', acceptance: 'The first screen names who is late and who is due today.',
      pass: ok, ms: board.ms,
      observed: { status: board.status, counts: c, overdueRows: (board.data?.overdue ?? []).length, today: board.data?.today },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-2 ─ a nurse records what happened on a call, and the record says so.
  {
    const attempt = await request('POST', `/api/clinical/follow-ups/${fuBp}/contact`,
      { cookie: nurse.cookie, csrf: nurse.csrf, body: { outcome: 'reached', note: 'UAT: spoke to the patient.' } });
    const detail = await request('GET', `/api/clinical/follow-ups/${fuBp}`, { cookie: nurse.cookie });
    const ev = (detail.data?.events ?? []).find((e) => e.kind === 'contacted');
    const ok = attempt.status === 200
      && attempt.data?.followUp?.status === 'reminded'
      && ev?.outcome === 'reached'
      && ev?.actorName === 'Fictional Nurse';
    record({
      id: 'UAT-2', title: 'A nurse records a contact attempt and the record shows who and what',
      role: 'nurse', acceptance: 'Reaching the patient moves the record to Reminded and appends an audit row naming the nurse.',
      pass: ok, ms: attempt.ms + detail.ms,
      observed: { status: attempt.status, newStatus: attempt.data?.followUp?.status, event: ev ? { kind: ev.kind, outcome: ev.outcome, actor: ev.actorName, role: ev.actorRole } : null },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-3 ─ an unanswered call does not pretend the patient was told.
  {
    const attempt = await request('POST', `/api/clinical/follow-ups/${fuWound}/contact`,
      { cookie: nurse.cookie, csrf: nurse.csrf, body: { outcome: 'no_answer' } });
    const ok = attempt.status === 200 && attempt.data?.followUp?.status === 'scheduled'
      && attempt.data?.followUp?.contactAttempts === 1;
    record({
      id: 'UAT-3', title: 'An unanswered call leaves the record scheduled with the attempt counted',
      role: 'nurse', acceptance: 'Only "reached" advances the status; the attempt is still recorded.',
      pass: ok, ms: attempt.ms,
      observed: { status: attempt.status, recordStatus: attempt.data?.followUp?.status, attempts: attempt.data?.followUp?.contactAttempts },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-4 ─ rescheduling supersedes a reminder instead of chasing the patient twice.
  {
    const queued = await request('POST', '/api/reminder-jobs',
      { cookie: doctor.cookie, csrf: doctor.csrf, body: { followUpId: fuMeds } });
    const target = new Date(); target.setDate(target.getDate() + 9);
    const due = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const moved = await request('POST', `/api/clinical/follow-ups/${fuMeds}/reschedule`,
      { cookie: doctor.cookie, csrf: doctor.csrf, body: { dueDate: due, note: 'UAT: patient asked for a later date.' } });
    const job = await request('GET', `/api/reminder-jobs/${queued.data?.job?.id}`, { cookie: doctor.cookie });
    const ok = queued.status === 201
      && moved.status === 200
      && moved.data?.followUp?.dueDate === due
      && moved.data?.supersededJobs >= 1
      && job.data?.job?.status === 'obsolete';
    record({
      id: 'UAT-4', title: 'Rescheduling supersedes the queued reminder',
      role: 'doctor', acceptance: 'A moved date increments the revision and marks the old reminder obsolete, so the patient is not chased twice.',
      pass: ok, ms: queued.ms + moved.ms + job.ms,
      observed: { queueStatus: queued.status, rescheduleStatus: moved.status, newDue: moved.data?.followUp?.dueDate, superseded: moved.data?.supersededJobs, jobStatus: job.data?.job?.status },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-5 ─ the system refuses to disclose a closed record, and says why.
  {
    const closed = await request('POST', `/api/clinical/follow-ups/${fuNoPhone}/close`,
      { cookie: doctor.cookie, csrf: doctor.csrf, body: { outcome: 'lost_to_follow_up', note: 'UAT: three attempts, no contact number on file.' } });
    const send = await request('POST', `/api/secure/send/${fuNoPhone}`, { cookie: doctor.cookie, csrf: doctor.csrf, body: {} });
    const ok = closed.status === 200
      && send.status === 409
      && send.data?.code === 'FOLLOW_UP_NOT_DISCLOSABLE';
    record({
      id: 'UAT-5', title: 'A closed record cannot be disclosed, and the refusal is explained',
      role: 'doctor', acceptance: 'The send is refused with a code and a sentence a clinician can act on, not a generic server error.',
      pass: ok, ms: closed.ms + send.ms,
      observed: { closeStatus: closed.status, sendStatus: send.status, code: send.data?.code, message: send.data?.error },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-6 ─ a nurse cannot close a record, and the refusal is not a UI trick.
  {
    const refused = await request('POST', `/api/clinical/follow-ups/${fuIdem}/close`,
      { cookie: nurse.cookie, csrf: nurse.csrf, body: { outcome: 'attended' } });
    const ok = refused.status === 403 && refused.data?.code === 'FORBIDDEN_ROLE'
      && typeof refused.data?.requestId === 'string';
    record({
      id: 'UAT-6', title: 'Only a doctor can close a follow-up',
      role: 'nurse', acceptance: 'The server refuses the role, not just the interface, and returns a traceable request id.',
      pass: ok, ms: refused.ms,
      observed: { status: refused.status, code: refused.data?.code, requestId: refused.data?.requestId },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-7 ─ the disclosure preview shows exactly what would leave, and what would not.
  {
    const preview = await request('GET', `/api/secure/preview/${fuDisclose}`, { cookie: doctor.cookie });
    const fields = (preview.data?.fields ?? []).map((f) => f.name);
    const withheld = preview.data?.withheld ?? [];
    const ok = preview.status === 200
      && fields.includes('recordRef')
      && !fields.includes('patient_name')
      && withheld.includes('patient_name')
      && withheld.includes('contact_number')
      && typeof preview.data?.plaintextBytes === 'number';
    record({
      id: 'UAT-7', title: 'The disclosure shows the exact bytes that would leave, and what stays',
      role: 'doctor', acceptance: 'A clinician can see the minimised payload before deciding, including the field list that never leaves.',
      pass: ok, ms: preview.ms,
      observed: { status: preview.status, sentFields: fields, withheldCount: withheld.length, plaintextBytes: preview.data?.plaintextBytes },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }

  // UAT-8 ─ the system tells a person what to do when it cannot reach its server.
  {
    const missing = await request('GET', '/api/clinical/follow-ups/abc', { cookie: doctor.cookie });
    const unknown = await request('GET', '/api/does-not-exist', { cookie: doctor.cookie });
    const ok = missing.status === 400
      && missing.data?.code === 'INVALID_PARAMETER'
      && unknown.status === 404
      && typeof unknown.data?.requestId === 'string'
      && !/at Object\.|SELECT .* FROM|TypeError/.test(String(unknown.text));
    record({
      id: 'UAT-8', title: 'Bad input and unknown routes answer safely and traceably',
      role: 'both', acceptance: 'A caller gets a code and a request id, and nothing internal leaks.',
      pass: ok, ms: missing.ms + unknown.ms,
      observed: { badParamStatus: missing.status, badParamCode: missing.data?.code, unknownRouteStatus: unknown.status, hasRequestId: typeof unknown.data?.requestId === 'string' },
      disposition: ok ? 'Accepted' : 'Defect raised',
    });
  }
}

// ── main ───────────────────────────────────────────────────────────────────
try {
  console.log(`Module 17 UAT run · label=${LABEL}`);
  const ids = await prepare();
  console.log(`isolated database ${TEST_DB}: fixtures #${ids.join(', #')}`);

  api = startApi();
  await waitForHealth();
  console.log(`API on ${BASE}`);

  const doctor = await signIn('doctor1');
  const nurse = await signIn('nurse1');
  if (doctor.status !== 200 || nurse.status !== 200) throw new Error('could not sign in both roles');

  await checkSpec();
  // Fresh sessions after the probe, so no scenario inherits its side effects.
  const doctorRun = await signIn('doctor1');
  const nurseRun = await signIn('nurse1');
  await runScenarios(ids, doctorRun, nurseRun);

  results.summary = {
    scenarios: results.scenarios.length,
    accepted: results.scenarios.filter((s) => s.pass).length,
    defects: results.scenarios.filter((s) => !s.pass).length,
    specConforms: results.spec.conforms,
  };
} catch (e) {
  console.error('harness error:', e?.stack || e);
  results.error = String(e?.message || e);
} finally {
  if (api) { try { api.kill('SIGKILL'); } catch { /* gone */ } }
  await sleep(300);

  writeFileSync(join(OUT, 'uat.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(OUT, 'server-log.txt'), log.join('\n'));

  const rows = results.scenarios.map((s) =>
    `| ${s.id} | ${s.title} | ${s.role} | ${s.pass ? 'Pass' : 'FAIL'} | ${s.ms} ms | ${s.disposition} |`).join('\n');
  writeFileSync(join(OUT, 'results.md'),
    `# Module 17 UAT — ${LABEL}\n\nRan ${results.ranAt} against ${TEST_DB}.\n\n`
    + `Spec conformance: ${results.spec.existing ?? 0}/${results.spec.documentedOperations ?? 0} documented operations exist.\n\n`
    + `**${results.summary?.accepted ?? 0}/${results.summary?.scenarios ?? 0} scenarios accepted, `
    + `${results.summary?.defects ?? 0} defects.**\n\n`
    + `| ID | Scenario | Role | Verdict | Time | Disposition |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n`);

  console.log(`\n${rows}`);
  console.log(`\n${results.summary?.accepted}/${results.summary?.scenarios} accepted · spec ${results.summary?.specConforms ? 'conforms' : 'DRIFTED'}`);
  console.log(`evidence: docs/lab/module17/evidence/${LABEL}/`);
  process.exit(0);
}

// docs/lab/module17/capture-screens.js
//
// Captures the interface evidence for the UAT session.
//
// Each capture corresponds to a scenario the office is being asked to accept, so
// the reviewer sees the screen the acceptance decision is about — not a gallery.
// Scenario IDs match docs/lab/module17/UAT-PLAN.md and the JSON in
// evidence/02-uat-retest/uat.json.
//
//   cd backend && node --env-file=.env server.js     # in one terminal
//   node docs/lab/module17/capture-screens.js
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const OUT = join(here, 'screens');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = process.env.M17_ORIGIN || 'http://localhost:3400';
const APP = `${ORIGIN}/app/`;
const API = ORIGIN;
const DOCTOR = { user: 'doctor1', pass: process.env.LAB_PASSWORD || 'lab-password-2026' };
const NURSE = { user: 'nurse1', pass: DOCTOR.pass };
const PORT = 9370;

mkdirSync(OUT, { recursive: true });
rmSync(join(OUT, '.chrome-profile'), { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
let nextId = 1;
let SESSION = null;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const useSession = sessionId === undefined && !/^(Target|Browser)\./.test(method) ? SESSION : sessionId;
  const msg = { id, method, params };
  if (useSession) msg.sessionId = useSession;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 30000);
  });
}

const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

async function setViewport(width, height = 800) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
}

const FIND_JS = (pattern, nth = 0) => `(() => {
  const re = ${pattern};
  const nodes = [...document.querySelectorAll('flt-semantics, input, textarea, [role="button"], [aria-label]')];
  const hits = [];
  for (const n of nodes) {
    const label = (n.getAttribute('aria-label') || '').trim();
    const text = (n.textContent || '').trim();
    const ph = (n.getAttribute('placeholder') || '').trim();
    if (!re.test(label) && !re.test(text) && !re.test(ph)) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    hits.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) });
  }
  hits.sort((a, b) => a.w * a.h - b.w * b.h);
  return hits[${nth}] ?? null;
})()`;

async function tap(pattern, { nth = 0, wait = 900, optional = false } = {}) {
  let hit = await evaluate(FIND_JS(pattern, nth));
  if (!hit) { await sleep(700); hit = await evaluate(FIND_JS(pattern, nth)); }
  if (!hit) {
    if (optional) return false;
    const visible = await evaluate(`[...document.querySelectorAll('flt-semantics')].map(n => (n.getAttribute('aria-label')||n.textContent||'').trim()).filter(Boolean).slice(0,30)`);
    throw new Error(`nothing matches ${pattern}. Visible: ${JSON.stringify(visible)}`);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await sleep(wait);
  return hit;
}

const shots = [];

async function shot(file, { scenario, caption, expectText, expectAbsent } = {}) {
  if (expectText) {
    const present = await evaluate(`document.body.innerText.includes(${JSON.stringify(expectText)})`);
    if (!present) throw new Error(`${file}: expected "${expectText}" on screen, was not there`);
  }
  if (expectAbsent) {
    const present = await evaluate(`document.body.innerText.includes(${JSON.stringify(expectAbsent)})`);
    if (present) throw new Error(`${file}: "${expectAbsent}" was on screen but must not be`);
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(join(OUT, file), buf);
  shots.push({ file, scenario, caption });
  console.log(`  ✔ ${file}  (${Math.round(buf.length / 1024)} KB) — ${scenario}: ${caption}`);
  await sleep(200);
}

async function atLoginScreen() {
  return Boolean(await evaluate(`document.body.innerText.includes('Staff sign in')`));
}

async function signOut() {
  for (let i = 0; i < 4 && !(await atLoginScreen()); i += 1) {
    // A pushed route sits above the shell; More is only reachable once they are
    // all popped.
    const popped = await tap('/Back|Navigate up/i', { wait: 900, optional: true });
    if (!popped) {
      await tap('/^More$/', { wait: 1200, optional: true });
      await tap('/Sign out/i', { wait: 2500, optional: true });
    }
  }
  if (!(await atLoginScreen())) throw new Error('could not reach the sign-in screen to switch roles');
}

async function signIn(creds) {
  if (!(await atLoginScreen())) await signOut();
  await tap('/Username/i', { wait: 600 });
  await send('Input.insertText', { text: creds.user });
  await sleep(200);
  await tap('/Password/i', { wait: 600 });
  await send('Input.insertText', { text: creds.pass });
  await sleep(200);
  await tap('/^Sign in$/', { wait: 4500 });
}

let chrome = null;

async function main() {
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, '.chrome-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* starting */ }
  }
  if (!wsUrl) throw new Error('Chrome did not open a debugging port');

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  SESSION = sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await setViewport(1280, 800);
  await send('Page.navigate', { url: APP });
  await sleep(7000);
  await evaluate(`(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); })()`);
  await sleep(1800);

  // ── UAT-1 ────────────────────────────────────────────────────────────────
  console.log('UAT-1');
  await signIn(DOCTOR);
  await shot('17-01-uat1-worklist.png', {
    scenario: 'UAT-1', caption: 'the worklist a clinician lands on, naming who is late',
    expectText: 'Clinic follow-up worklist',
  });

  // ── UAT-2 ────────────────────────────────────────────────────────────────
  console.log('UAT-2');
  await tap('/^Follow-ups/', { wait: 2500 });
  await shot('17-02-uat2-board.png', {
    scenario: 'UAT-2', caption: 'the board before a contact attempt: the row a nurse picks up',
    expectText: 'records',
  });
  await tap('/days? overdue/i', { wait: 2500 });
  await tap('/Log contact/i', { wait: 1500 });
  await shot('17-03-uat2-contact-sheet.png', {
    scenario: 'UAT-2', caption: 'the contact vocabulary: only "reached" moves the record to Reminded',
    expectText: 'What happened on the call?',
  });
  await tap('/Patient reached/i', { wait: 2500 });
  await shot('17-04-uat2-record-reminded.png', {
    scenario: 'UAT-2', caption: 'after the attempt: status Reminded, and an audit row naming the nurse',
    expectText: 'Record history',
  });

  // ── UAT-3 ────────────────────────────────────────────────────────────────
  console.log('UAT-3 (nurse role)');
  await signIn(NURSE);
  await tap('/^Follow-ups/', { wait: 2500 });
  await shot('17-05-uat3-nurse-board.png', {
    scenario: 'UAT-3', caption: 'the same board as a nurse: no close action offered',
    expectText: 'records',
  });

  // ── UAT-6 ────────────────────────────────────────────────────────────────
  await tap('/days? overdue/i', { wait: 2500 });
  await shot('17-06-uat6-nurse-forbidden.png', {
    scenario: 'UAT-6', caption: 'the nurse view of a record: record and reschedule offered, close absent with an explanation in its place',
    expectText: 'Record history',
    expectAbsent: 'Close this follow-up',
  });

  // ── UAT-7 ────────────────────────────────────────────────────────────────
  console.log('UAT-7 (doctor, disclosure)');
  await signIn(DOCTOR);
  await tap('/^More$/', { wait: 1500 });
  await tap('/Server & session/i', { wait: 2000 });
  await tap('/Secure exchange/i', { wait: 3500 });
  await shot('17-07-uat7-disclosure.png', {
    scenario: 'UAT-7', caption: 'the disclosure screen: the withheld field list and the key fingerprints this process holds',
    expectText: 'This process holds',
  });

  // ── UAT-8 ────────────────────────────────────────────────────────────────
  console.log('UAT-8 (adverse: server stopped)');
  await send('Page.navigate', { url: APP });
  await sleep(7000);
  await evaluate(`(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); })()`);
  await sleep(1800);
  const resumed = await evaluate(`document.body.innerText.includes('Clinic follow-up worklist')`);
  if (!resumed) throw new Error('the app did not resume signed in after the reload');
  await tap('/^Follow-ups/', { wait: 2500 });
  const onBoard = await evaluate(`document.body.innerText.includes('All open') || document.body.innerText.includes('records')`);
  if (!onBoard) throw new Error('could not reach the board before killing the API');

  const table = execSync('netstat -ano').toString().split(String.fromCharCode(10));
  const port = new URL(API).port || '3400';
  const row = table.find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
  if (!row) throw new Error(`could not find the API process on port ${port}`);
  execSync(`taskkill /F /PID ${row.trim().split(' ').filter(Boolean).pop()}`);
  console.log('  API stopped');
  await sleep(2500);

  await tap('/Reload/i', { wait: 4500 });
  const rendered = await evaluate(`document.body.innerText.includes('Try again') || document.body.innerText.includes('Cannot reach')`);
  if (!rendered) throw new Error('the failure state did not render after Reload');
  await shot('17-08-uat8-failure.png', {
    scenario: 'UAT-8', caption: 'adverse case: the server is gone, and the screen says what to do in words a clinician can act on',
    expectText: 'Try again',
  });

  // ── UAT-4/5 narrow, after restart ────────────────────────────────────────
  console.log('restarting the API for the narrow capture');
  spawn(process.execPath, ['--env-file=.env', 'server.js'], {
    cwd: join(repo, 'backend'),
    env: { ...process.env, DB_NAME: process.env.M17_DB || 'clinic_followup_lab', PORT: new URL(API).port || '3400' },
    detached: true, stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
  }

  await send('Page.navigate', { url: APP });
  await sleep(7000);
  await evaluate(`(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); })()`);
  await sleep(1500);
  await setViewport(380, 800);
  await signIn(DOCTOR);
  await tap('/^Follow-ups/', { wait: 2500 });
  await shot('17-09-uat5-board-380.png', {
    scenario: 'UAT-5', caption: 'the board at 380: the phone-width check the office asked about',
    expectText: 'records',
  });

  writeFileSync(join(OUT, 'captures.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    app: APP,
    database: process.env.M17_DB || 'clinic_followup_lab',
    note: 'One capture per UAT scenario. UAT-4 and UAT-5 are API-level decisions with no distinct screen; see 17-09 for the narrow-width presentation the office asked about.',
    captures: shots,
  }, null, 2));
  console.log(`\n${shots.length} captures written`);
}

main()
  .then(() => { if (chrome) chrome.kill(); process.exit(0); })
  .catch((e) => { console.error('capture failed:', e.message); if (chrome) chrome.kill(); process.exit(1); });

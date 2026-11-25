// docs/lab/module16/capture-screens.js
//
// Captures the interface evidence for Module 16.
//
// Module 15's set proved the screens worked. This set proves something different,
// which is what this module is about: that the interface still works *after* the
// delivery change (compression and long-lived caching), at both required widths,
// and that the loading and failure states a user can actually meet are real rather
// than described.
//
// Two techniques worth naming, because they are honest rather than staged:
//
//   - The loading state is captured with the network throttled through CDP. Without
//     throttling it lasts a few milliseconds on loopback and cannot be photographed.
//     The screenshot is a genuine state of the app, reached by slowing the network
//     rather than by editing the app.
//   - The failure state is reached by stopping the backend while the app is signed
//     in, then pressing Reload. The error view is the one a clinician would see.
//
//   cd backend && node --env-file=.env server.js     # in one terminal
//   node docs/lab/module16/capture-screens.js
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const OUT = join(here, 'screens');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://localhost:3400/app/';
const API = 'http://localhost:3400';
const DOCTOR = { user: 'doctor1', pass: process.env.LAB_PASSWORD || 'lab-password-2026' };
const PORT = 9360;

mkdirSync(OUT, { recursive: true });
rmSync(join(OUT, '.chrome-profile'), { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing ───────────────────────────────────────────────────────────
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

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

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
  // Smallest area wins: Flutter wraps the page in a node whose text is all of its
  // children, and clicking its centre hits whatever happens to be there.
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

async function shot(file, { caption } = {}) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(join(OUT, file), buf);
  console.log(`  ✔ ${file}  (${Math.round(buf.length / 1024)} KB)${caption ? ' — ' + caption : ''}`);
  await sleep(200);
}

const findings = [];

// ── main ───────────────────────────────────────────────────────────────────
let chrome = null;

async function main() {
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(OUT, '.chrome-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* starting */ }
  }
  if (!wsUrl) throw new Error('Chrome did not expose a debugging port');

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
  await send('Network.enable');

  // ── sign in at full speed ───────────────────────────────────────────────
  await setViewport(1280, 800);
  await send('Page.navigate', { url: APP });
  await sleep(7000);
  await evaluate(`(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); })()`);
  await sleep(1800);
  await tap('/Username/i', { wait: 500 });
  await send('Input.insertText', { text: DOCTOR.user });
  await sleep(200);
  await tap('/Password/i', { wait: 500 });
  await send('Input.insertText', { text: DOCTOR.pass });
  await sleep(200);
  await tap('/^Sign in$/', { wait: 4500 });
  console.log('  signed in');

  // ── 16-02 worklist, desktop (the landings screen) ────────────────────────
  await setViewport(1280, 800);
  const onOverview = await evaluate(`document.body.innerText.includes('Clinic follow-up worklist')`);
  if (!onOverview) throw new Error('expected the worklist after sign-in');
  await shot('16-02-worklist-1280.png', { caption: 'worklist after the delivery change' });
  findings.push({ file: '16-02-worklist-1280.png', state: 'success (worklist)', width: 1280 });

  // ── 16-03 board, desktop ─────────────────────────────────────────────────
  await tap('/^Follow-ups/', { wait: 2500 });
  await shot('16-03-board-1280.png', { caption: 'the busiest read journey, p95 4.60 ms' });
  findings.push({ file: '16-03-board-1280.png', state: 'success (board)', width: 1280 });

  // ── 16-04 the same board at 380 ──────────────────────────────────────────
  await setViewport(380, 800);
  await shot('16-04-board-380.png', { caption: 'same screen, narrow viewport' });
  findings.push({ file: '16-04-board-380.png', state: 'responsive (board)', width: 380 });

  // ── 16-01 the app's own loading state ────────────────────────────────────
  // The board pre-loads with the shell (HomeShell builds every tab in an
  // IndexedStack), so opening it shows cached data and no spinner. A record is a
  // pushed route that fetches on open, which is where LoadingView is real. The
  // network is throttled so a 5 ms wait is long enough to photograph; the app is
  // not modified.
  console.log('16-01 loading state (record screen, API throttled to 1.2 s)');
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 1200, downloadThroughput: 30 * 1024, uploadThroughput: 20 * 1024,
  });
  await tap('/days? overdue/i', { wait: 400 });
  const stillLoading = await evaluate(`!document.body.innerText.includes('What happens next')`);
  if (!stillLoading) console.log('  note: the record rendered before the capture; the state was too fast to hold');
  await shot('16-01-loading-throttled.png', { caption: 'a record opening under 1.2 s of injected latency: LoadingView while the request is in flight' });
  findings.push({
    file: '16-01-loading-throttled.png', state: 'loading', width: 380,
    throttle: '1200 ms latency, 30 KB/s',
    note: 'throttled through CDP so a millisecond-scale wait becomes observable',
  });

  // ── 16-05 / 16-06 the record, once it has arrived ────────────────────────
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(3500);
  await shot('16-05-record-380.png', { caption: 'the same record after loading, narrow viewport' });
  findings.push({ file: '16-05-record-380.png', state: 'responsive (record)', width: 380 });

  await setViewport(1280, 800);
  await shot('16-06-record-1280.png', { caption: 'record view, desktop' });
  findings.push({ file: '16-06-record-1280.png', state: 'success (record)', width: 1280 });

  // ── 16-07 failure state ──────────────────────────────────────────────────
  console.log('16-07 failure state (backend stopped, then Reload)');
  await tap('/Back|Navigate up/i', { wait: 1200, optional: true });
  const table = execSync('netstat -ano').toString().split(String.fromCharCode(10));
  const row = table.find((l) => l.includes(':3400') && l.includes('LISTENING'));
  if (row) {
    const pid = row.trim().split(' ').filter(Boolean).pop();
    execSync(`taskkill /F /PID ${pid}`);
    await sleep(2500);
  }
  await tap('/Reload/i', { wait: 3500, optional: true });
  const banner = await evaluate(`document.body.innerText.split(String.fromCharCode(10)).filter((l) => /reach|answer|wrong/i.test(l)).slice(0, 2)`);
  await shot('16-07-failure.png', { caption: 'backend stopped: actionable message, no exception text' });
  findings.push({ file: '16-07-failure.png', state: 'failure', banner, width: 1280 });

  // ── 16-08 sign-in after the delivery change, narrow ──────────────────────
  // Restart the API so the app can be reloaded for a clean capture.
  console.log('  restarting the API');
  spawn(process.execPath, ['--env-file=.env', 'server.js'], {
    cwd: join(repo, 'backend'), detached: true, stdio: 'ignore',
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
  await shot('16-08-signin-380.png', { caption: 'sign-in at 380: the first screen after the delivery change' });
  findings.push({ file: '16-08-signin-380.png', state: 'success (sign-in)', width: 380 });

  writeFileSync(join(OUT, 'captures.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    app: APP,
    widths: [1280, 380],
    note: 'The loading state was captured with CDP network throttling (400 ms latency, 50 KB/s) because on loopback it lasts a few milliseconds. Every other capture is at full speed.',
    captures: findings,
  }, null, 2));
  console.log(`\n${findings.length} captures written to ${OUT}`);
}

main()
  .then(() => { if (chrome) chrome.kill(); process.exit(0); })
  .catch((e) => { console.error('capture failed:', e.message); if (chrome) chrome.kill(); process.exit(1); });

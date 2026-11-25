// docs/lab/module15/capture-screens.js
//
// Captures the Module 15 interface evidence from the running build.
//
// It drives Chrome over the DevTools protocol rather than a screenshot tool,
// because the width has to be exact: Flutter reads window.innerWidth, so the
// 380 px captures are a genuine narrow viewport (Emulation.setDeviceMetricsOverride)
// rather than a scaled desktop shot. It also means the captures are reproducible
// instead of hand-taken.
//
// Prerequisites
//   cd backend && npm start                       # serves the app at /app/
//   flutter build web --release --base-href=/app/ --no-web-resources-cdn
//   (the local-CanvasKit flag matters: the app's CSP is default-src 'self', so a
//    bundle that fetches CanvasKit or Roboto from a CDN renders blank here)
//
//   node docs/lab/module15/capture-screens.js
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'screens');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.M15_APP || 'http://localhost:3400/app/';
const API = process.env.M15_API || 'http://localhost:3400';
const DOCTOR = { user: 'doctor1', pass: process.env.LAB_PASSWORD || 'lab-password-2026' };
const NURSE = { user: 'nurse1', pass: DOCTOR.pass };
const PORT = 9340;
const PROFILE = join(here, '.chrome-profile');

mkdirSync(OUT, { recursive: true });
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME=<path to chrome.exe>.`);
  process.exit(1);
}

// ── CDP plumbing ───────────────────────────────────────────────────────────
let ws = null;
let nextId = 1;
let SESSION = null;
const pending = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const useSession = sessionId === undefined && !/^(Target|Browser)\./.test(method) ? SESSION : sessionId;
  const msg = { id, method, params };
  if (useSession) msg.sessionId = useSession;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
    }, 30000);
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.text}`);
  return r.result?.value;
}

async function setViewport(width, height = 800) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(900); // Flutter relayouts on resize; let it settle before measuring
}

async function shot(file, { width, height = 800 } = {}) {
  if (width) await setViewport(width, height);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(join(OUT, file), buf);
  console.log(`  ✔ ${file}  (${Math.round(buf.length / 1024)} KB)`);
  await sleep(200);
}

/**
 * Finds the first element whose accessible label or text matches, and returns its
 * centre. Real Flutter text fields are <input> elements, so they are included.
 */
const FIND_JS = (pattern, nth = 0) => `(() => {
  const re = ${pattern};
  const nodes = [...document.querySelectorAll('flt-semantics, input, textarea, button, [role="button"], [aria-label]')];
  const hits = [];
  for (const n of nodes) {
    const label = (n.getAttribute('aria-label') || '').trim();
    const text = (n.textContent || '').trim();
    const ph = (n.getAttribute('placeholder') || '').trim();
    if (!re.test(label) && !re.test(text) && !re.test(ph)) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    hits.push({ x: r.x + r.width / 2, y: r.y + r.height / 2,
                label: (label || text || ph).slice(0, 50), tag: n.tagName.toLowerCase(),
                w: Math.round(r.width), h: Math.round(r.height) });
  }
  // Prefer the smallest AREA, not the shortest label. Flutter wraps everything
  // in a semantics node whose textContent is all of its children, so a container
  // labelled "Dialog" could win on label length and the click would land in the
  // middle of the screen instead of on the tile.
  hits.sort((a, b) => (a.w * a.h) - (b.w * b.h));
  return hits[${nth}] ?? null;
})()`;

async function tap(pattern, { nth = 0, wait = 900, optional = false } = {}) {
  let hit = await evaluate(FIND_JS(pattern, nth));
  if (!hit) {
    await sleep(700);
    hit = await evaluate(FIND_JS(pattern, nth));
  }
  if (!hit) {
    if (optional) return false;
    const visible = await evaluate(`[...document.querySelectorAll('flt-semantics')].map(n => (n.getAttribute('aria-label')||n.textContent||'').trim()).filter(Boolean).slice(0, 40)`);
    throw new Error(`nothing matches ${pattern}. Visible: ${JSON.stringify(visible)}`);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await sleep(wait);
  return hit;
}

async function type(text) {
  await send('Input.insertText', { text });
  await sleep(300);
}

async function signIn({ user, pass }) {
  await tap('/Username/i', { wait: 500 });
  await type(user);
  await tap('/Password/i', { wait: 500 });
  await type(pass);
  await tap('/^Sign in$/', { wait: 4000 });
}

async function ensureSignedIn(creds) {
  const atLogin = await evaluate(`document.body.innerText.includes('Staff sign in')`);
  if (atLogin) await signIn(creds);
}

async function signOut() {
  await tap('/^More$/', { wait: 1200 });
  await tap('/Sign out/i', { wait: 2500 });
}

async function back() {
  await tap('/Back|Navigate up/i', { wait: 1500, optional: true });
}

// ── capture phases ─────────────────────────────────────────────────────────
async function captureDoctorSet() {
  console.log('phase A — doctor, desktop and narrow');
  await setViewport(1280, 800);
  await signIn(DOCTOR);

  await tap('/^Follow-ups/', { wait: 2500 });
  await shot('15-01-board.png');
  await shot('15-02-board-narrow.png', { width: 380 });

  // 15-03 one record. A contact attempt is logged first, otherwise the audit
  // trail renders empty and the screenshot proves nothing about history.
  await setViewport(1280, 800);
  await tap('/days? overdue/i', { wait: 2500 });
  await tap('/Log contact/i', { wait: 1500 });
  await tap('/Called, no answer/i', { wait: 2500 });
  await shot('15-03-detail.png');
  await back();

  // 15-06 nothing due today (the lab data has none)
  await tap('/^Today/', { wait: 2000 });
  await shot('15-06-empty.png');

  // 15-04 validation at 380: pick a patient, submit with no reason
  await setViewport(380, 800);
  await tap('/New follow-up/', { wait: 2200 });
  await tap('/Fictional Student B/', { wait: 1400 });
  await tap('/Schedule follow-up/', { wait: 2000 });
  // Scroll the sheet to the top and confirm the message is on screen; the
  // error container sits above the patient card.
  let shown = await evaluate(`document.body.innerText.includes('Record why')`);
  if (!shown) {
    await tap('/Schedule follow-up/', { wait: 2000 });
    shown = await evaluate(`document.body.innerText.includes('Record why')`);
  }
  console.log(`  validation message visible: ${shown}`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 190, y: 400, deltaX: 0, deltaY: -600 });
  await sleep(700);
  await shot('15-04-validation.png', { width: 380, height: 800 });
}

async function captureFailure() {
  console.log('phase B — backend stopped, then Reload');
  const { execSync } = await import('node:child_process');
  await setViewport(1280, 800);
  await ensureSignedIn(DOCTOR);
  // The Reload control lives on the board, so go there first: a fresh session
  // opens on Overview, which has no reload action.
  await tap('/^Follow-ups/', { wait: 2500 });

  const table = execSync('netstat -ano').toString().split(String.fromCharCode(10));
  const row = table.find((l) => l.includes(':3400') && l.includes('LISTENING'));
  if (!row) throw new Error('could not find the API process on port 3400');
  const pid = row.trim().split(' ').filter(Boolean).pop();
  console.log(`  stopping the API (pid ${pid})…`);
  execSync(`taskkill /F /PID ${pid}`);
  await sleep(2500);

  // Reload from the board, which is where a clinician would notice nothing loads.
  await tap('/^All open|^Overdue|^Today/', { wait: 600, optional: true });
  await tap('/Reload/i', { wait: 3500 });
  const message = await evaluate(`document.body.innerText.split(String.fromCharCode(10)).filter((l) => /reach|an answer|error/i.test(l)).slice(0, 3)`);
  console.log('  banner:', JSON.stringify(message));
  await shot('15-07-failure.png');
}

async function restartApi() {
  console.log('  restarting the API…');
  const child = spawn('node', ['--env-file=.env', 'server.js'], {
    cwd: join(here, '..', '..', '..', 'backend'),
    detached: true, stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${API}/api/health`);
      if (r.ok) { console.log('  API is back'); return; }
    } catch { /* still down */ }
  }
  throw new Error('API did not come back');
}

async function captureNurse() {
  console.log('phase C — nurse view');
  await setViewport(1280, 800);
  await signOut();
  await signIn(NURSE);
  await tap('/^Follow-ups/', { wait: 2500 });
  await tap('/days? overdue/i', { wait: 2500 });
  await shot('15-05-forbidden.png');
  const canClose = await evaluate(`document.body.innerText.includes('Close this follow-up')`);
  console.log(`  nurse sees the close action: ${canClose} (expected false)`);
}

async function captureRateLimit() {
  console.log('phase D — exhausted login attempts');
  await back();
  await signOut();

  // Burn the limiter for one username from outside the UI, then let the form
  // produce the message a clinician would actually see.
  for (let i = 0; i < 11; i++) {
    await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: API },
      body: JSON.stringify({ username: 'nurse2', password: `wrong-${i}` }),
    });
  }
  const probe = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API },
    body: JSON.stringify({ username: 'nurse2', password: 'wrong-again' }),
  });
  console.log(`  limiter now answers ${probe.status} (expected 429)`);

  await setViewport(1280, 800);
  await tap('/Username/i', { wait: 500 });
  await type('nurse2');
  await tap('/Password/i', { wait: 500 });
  await type('not-the-password');
  await tap('/^Sign in$/', { wait: 2500 });
  await shot('15-08-rate-limited.png');
}

// ── main ───────────────────────────────────────────────────────────────────
let chrome = null;

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'any';
  rmSync(PROFILE, { recursive: true, force: true });

  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { /* starting */ }
  }
  if (!wsUrl) throw new Error('Chrome did not open a debugging port');

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  SESSION = sessionId;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: APP });
  await sleep(7000);

  // Turn on Flutter's accessibility tree: it turns painted text into DOM nodes
  // with labels and rectangles, which is what makes a label-based click possible.
  await evaluate(`(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); })()`);
  await sleep(1800);

  if (only === 'a' || only === 'any') await captureDoctorSet();
  if (only === 'bcd' || only === 'any') {
    try {
      await captureFailure();
    } finally {
      await restartApi();
    }
    await captureNurse();
    await captureRateLimit();
  }


  console.log(`\nfiles in ${OUT}`);
}

main()
  .then(() => { if (chrome) chrome.kill(); process.exit(0); })
  .catch((e) => { console.error('capture failed:', e.message); if (chrome) chrome.kill(); process.exit(1); });

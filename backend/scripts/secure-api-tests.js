// Authorisation against the running API, reporting the status the server sent.
const BASE = process.env.API_BASE || 'http://localhost:3400';
const PASSWORD = process.env.LAB_PASSWORD;
if (!PASSWORD) { console.error('LAB_PASSWORD is not set.'); process.exit(2); }

const results = [];
const record = (id, name, expected, observed, pass) =>
  results.push({ id, name, expected, observed, pass });

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  const data = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
  return { role: data.user.role, csrf: data.csrfToken, cookie };
}

async function call(method, path, who, { csrf = true } = {}) {
  const headers = { accept: 'application/json' };
  if (who) headers.cookie = who.cookie;
  if (csrf && who?.csrf) headers['x-csrf-token'] = who.csrf;
  const res = await fetch(`${BASE}${path}`, { method, headers });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

(async () => {
  const doctor = await login('doctor1');
  const nurse = await login('nurse1');
  console.log(`doctor=${doctor.role} nurse=${nurse.role}`);

  const list = await call('GET', '/api/follow-ups', doctor);
  const fu = (list.body?.followUps ?? []).find(f => f.status === 'scheduled');
  if (!fu) { console.error('no scheduled follow-up; create one first'); process.exit(2); }
  const id = fu.id;
  console.log(`follow-up under test: ${id}`);

  let r = await call('GET', '/api/health', null);
  record('A0', 'Health is public', '200', `${r.status}`, r.status === 200);

  r = await call('POST', `/api/secure/send/${id}`, nurse);
  record('A1', 'Nurse cannot disclose', '403 role message',
    `${r.status} ${r.body?.error ?? ''}`,
    r.status === 403 && /doctor/i.test(r.body?.error ?? ''));

  r = await call('POST', `/api/secure/send/${id}`, doctor);
  record('A2', 'Doctor can disclose', '200 delivered',
    `${r.status} ok=${r.body?.ok} ${r.body?.error?.code ?? ''}`,
    r.status === 200 && r.body?.ok === true);

  r = await call('POST', `/api/secure/send/${id}`, doctor, { csrf: false });
  record('A3', 'No CSRF token refused before the role gate', '403 CSRF',
    `${r.status} ${r.body?.error ?? ''}`,
    r.status === 403 && /csrf/i.test(r.body?.error ?? ''));

  r = await call('POST', `/api/secure/send/${id}`, null);
  record('A4', 'Anonymous refused', '401', `${r.status} ${r.body?.error ?? ''}`, r.status === 401);

  r = await call('GET', '/api/secure/messages', nurse);
  record('A5', 'Nurse cannot read the disclosure history', '403',
    `${r.status} ${r.body?.error ?? ''}`, r.status === 403);

  r = await call('GET', '/api/secure/messages', doctor);
  record('A6', 'Doctor can read the disclosure history', '200 list',
    `${r.status} ${Array.isArray(r.body?.messages) ? r.body.messages.length + ' rows' : 'no list'}`,
    r.status === 200 && Array.isArray(r.body?.messages));

  r = await call('GET', '/api/secure/keyinfo', nurse);
  record('A7', 'API reports it cannot decrypt', 'recipientDecrypt false',
    `${r.status} recipientDecrypt=${r.body?.keys?.recipientDecrypt?.present}`,
    r.status === 200 && r.body?.keys?.recipientDecrypt?.present === false);

  r = await call('GET', '/api/secure/keyinfo', null);
  record('A8', 'Key fingerprints not anonymous', '401', `${r.status}`, r.status === 401);

  const pad = (s, n) => String(s).padEnd(n);
  console.log('');
  console.log(pad('ID', 5) + pad('Case', 46) + pad('Expected', 30) + 'Observed');
  console.log('-'.repeat(126));
  for (const x of results) {
    console.log(pad(x.id, 5) + pad(x.name, 46) + pad(x.expected, 30) +
      pad(x.observed, 44) + (x.pass ? 'PASS' : 'FAIL'));
  }
  const passed = results.filter(x => x.pass).length;
  console.log(`\n${passed} of ${results.length} cases passed.`);

  const fs = await import('node:fs');
  fs.mkdirSync('../docs/lab/module14/evidence', { recursive: true });
  fs.writeFileSync('../docs/lab/module14/evidence/secure-api-tests.json',
    JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
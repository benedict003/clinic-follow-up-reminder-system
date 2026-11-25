// docs/lab/module15/build-manual-docx.js
//
// Builds "Module 15-operational-manual.docx" — the third document in the module
// folder, in the same seven-part shape as Module 14's operational manual:
// preconditions, how to run it, how to use it, the cases, troubleshooting,
// generating evidence, and how to verify each claim personally.
//
//   node docs/lab/module15/build-manual-docx.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const TEMPLATE = join(repo, 'Module14', 'Module14.docx');
const OUT = join(here, 'submission', 'Module 15-operational-manual.docx');
const WORK = join(here, '.docx-manual');

const baseline = JSON.parse(readFileSync(join(here, 'evidence', '01-baseline', 'summary.json'), 'utf8'));
const hardened = JSON.parse(readFileSync(join(here, 'evidence', '02-hardened', 'summary.json'), 'utf8'));

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runs(text, { size = 21, bold = false, mono = false } = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => {
    let t = part, b = bold, m = mono;
    if (part.startsWith('**') && part.endsWith('**')) { t = part.slice(2, -2); b = true; }
    else if (part.startsWith('`') && part.endsWith('`')) { t = part.slice(1, -1); m = true; }
    const font = m ? 'Consolas' : 'Times New Roman';
    return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>`
      + `${b ? '<w:b/>' : ''}<w:sz w:val="${m ? size - 3 : size}"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

function p(text = '', { size = 21, bold = false, spaceAfter = 110, align } = {}) {
  const jc = align ? `<w:jc w:val="${align}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/>${jc}</w:pPr>${runs(text, { size, bold })}</w:p>`;
}

function h(text, level = 1) {
  const style = level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:before="${level === 1 ? 340 : 250}" w:after="110"/></w:pPr>`
    + runs(text, { size: level === 1 ? 27 : 24, bold: true }) + '</w:p>';
}

function table(rows, widths, { header = true, size = 17 } = {}) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const bodyRows = rows.map((row, r) => {
    const cells = row.map((cell, i) => {
      const isHead = header && r === 0;
      const shade = isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EDEA"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${shade}</w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:after="16" w:before="16"/></w:pPr>${runs(cell, { size, bold: isHead })}</w:p></w:tc>`;
    }).join('');
    const headerRow = header && r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${headerRow}${cells}</w:tr>`;
  }).join('');

  return '<w:tbl><w:tblPr><w:tblStyle w:val="Table1"/><w:tblW w:w="9350" w:type="dxa"/>'
    + '<w:tblBorders><w:top w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:left w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:bottom w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:right w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:insideH w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:insideV w:color="000000" w:space="0" w:sz="4" w:val="single"/></w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="0400"/></w:tblPr>'
    + `<w:tblGrid>${grid}</w:tblGrid>${bodyRows}</w:tbl>`;
}

/** Labelled code block, as the Module 14 manual uses ("POWERSHELL"). */
function block(label, lines) {
  return p(label.toUpperCase(), { size: 15, bold: true, spaceAfter: 40 })
    + lines.map((line) =>
      `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F4F3"/><w:ind w:left="100"/></w:pPr>`
      + `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="16"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(line) || ' '}</w:t></w:r></w:p>`).join('')
    + p('', { spaceAfter: 120 });
}

const body = [];

body.push(h('Module 15 \u2014 Operational Manual', 1));
body.push(p('Parts 1\u20137. This manual starts once the application runs and the database is reachable. The design rationale is in the Module 15 report; the measured results are in the Module 15 evidence portfolio. What follows is only how to run the collection, what each state should look like, and what to do when something does not.', { size: 22 }));

// ── preconditions ─────────────────────────────────────────────────────────
body.push(h('Preconditions', 1));
body.push(p('Four things must already be true. Run this once.'));
body.push(block('PowerShell', [
  'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
  '"node    : " + (node --version)',
  '"mysql   : " + (& "C:\\xampp\\mysql\\bin\\mysqladmin.exe" -u root --host=127.0.0.1 ping)',
  '"env file: " + (Test-Path backend\\.env)',
  '"ports   : " + ((Get-NetTCPConnection -LocalPort 3411,4799 -ErrorAction SilentlyContinue | Measure-Object).Count)',
  '"secrets : " + (git ls-files | Select-String "\\.pem$|\\.key$|backend/\\.env$|backend/keys/|backend/tls/" | Measure-Object).Count',
]));
body.push(table([
  ['Check', 'Required', 'If it does not match'],
  ['node', '20 or newer', 'The collection uses fetch, AbortSignal.timeout and node:test-free ESM'],
  ['mysql', 'mysqld is alive', 'Start MariaDB (XAMPP control panel), not the harness'],
  ['env file', 'true', 'Copy backend/.env.example and fill it in; LAB_PASSWORD must be 12+ characters'],
  ['ports', '0 in use', 'Ports 3411 (API) and 4799 (stub gateway) belong to the collection. Do not run npm start first'],
  ['secrets', '0', 'Nothing in the repository may hold a key, a .pem or the .env file'],
], [1500, 2400, 5450]));
body.push(p('If `ports` is not 0, stop whatever holds them. A running `npm start` on 3400 is fine and is what the screenshots need; only 3411 and 4799 must be free.', { size: 20 }));

// ── Part 1 ────────────────────────────────────────────────────────────────
body.push(h('Part 1 \u00b7 Running the collection', 1));
body.push(p('One command. It creates its own database, starts its own API and a controllable stub gateway, runs every case, and writes the evidence. It does not need a second terminal and it cannot disturb the lab database.'));
body.push(block('PowerShell', [
  'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system\\backend"',
  'node --env-file=.env tests/m15-collection.js --label 04-review',
]));
body.push(p('What it does, in order:', { size: 20 }));
body.push(table([
  ['Step', 'Effect'],
  ['1', 'Drops and recreates `clinic_followup_m15`, then applies schema.sql, schema-14.sql and schema-clinic.sql'],
  ['2', 'Seeds two fictional accounts and two fictional patients; eight follow-up fixtures, one per case group'],
  ['3', 'Starts the stub gateway on 4799, able to answer 200, 503, 500, or never at all'],
  ['4', 'Starts the API on 3411 against that database and that gateway'],
  ['5', `Runs ${hardened.total} cases and records prediction, expected, actual, verdict and duration for each`],
  ['6', 'Writes evidence/04-review/: one JSON per case, summary.json, results.md, server-log.txt'],
  ['7', 'Stops both processes. Nothing is left running'],
], [700, 8650]));
body.push(p('Expected last line:', { size: 20 }));
body.push(block('Output', [
  '37/37 passed, 0 failed',
  'evidence: docs/lab/module15/evidence/04-review/',
]));
body.push(p('A baseline rerun is also possible and should show failures \u2014 that is the point of keeping it: `git stash` the hardened files, run with `--label 05-old-code`, and restore. The recorded baseline is `01-baseline` (23/36).', { size: 20 }));

// ── Part 2 ────────────────────────────────────────────────────────────────
body.push(h('Part 2 \u00b7 Running the app to see the states', 1));
body.push(p('The captures come from the release build served by the backend at `/app/`. Three steps, in this order.'));
body.push(block('PowerShell \u2014 terminal 1, the API and the app', [
  'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
  'flutter build web --release --base-href=/app/ --no-web-resources-cdn',
  'Remove-Item -Recurse -Force backend\\public\\app -ErrorAction SilentlyContinue',
  'Copy-Item -Recurse build\\web backend\\public\\app',
  'cd backend',
  'node --env-file=.env server.js',
]));
body.push(p('`--no-web-resources-cdn` is not optional. The API sends `Content-Security-Policy: default-src \'self\'`, so a bundle that fetches CanvasKit or Roboto from gstatic.com renders a blank page behind that policy. This exact mistake happened while capturing Module 15, which is why the flag is written here rather than assumed.', { size: 20 }));
body.push(p('The first lines must read:', { size: 20 }));
body.push(block('Output', [
  'listening on 127.0.0.1:3400',
  '{"src":"secure","event":"secure.routes.mounted", ...}',
  '{"src":"clinical","event":"clinical.routes.mounted", ...}',
  '{"src":"server","event":"secure.mount_state","mounted":true,"error":null}',
  '{"src":"server","event":"clinical.mount_state","mounted":true,"error":null}',
]));
body.push(p('If `clinical.mount_state` says `mounted:false`, the `error` field names the problem and the app shows no follow-ups at all. That is a failed import, not an empty database.'));
body.push(block('PowerShell \u2014 terminal 2, the captures', [
  'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
  'node docs/lab/module15/capture-screens.js',
  '# or one group at a time:',
  'node docs/lab/module15/capture-screens.js --only=a     # board, narrow, detail, empty, validation',
  'node docs/lab/module15/capture-screens.js --only=bcd   # failure, nurse, rate limit',
]));
body.push(p('The script logs what it verified at each step, for example `nurse sees the close action: false (expected false)` and `limiter now answers 429 (expected 429)`. It stops and restarts the API itself for the failure capture, so leave the ports alone while it runs.'));

// ── Part 3 ────────────────────────────────────────────────────────────────
body.push(h('Part 3 \u00b7 The cases', 1));
body.push(p(`Thirty-seven cases in nine topics. Full expected/actual for each is in the evidence portfolio, table 1.1.`));
const topicRows = [['Topic', 'IDs', 'Cases', 'Hardened', 'Pass condition']];
const groups = [
  ['contract', 'F1\u2013F4', '4', 'Health; board envelope with 5 count keys; detail with 4 keys'],
  ['functional', 'F5\u2013F7', '3', 'Contact "reached" \u2192 reminded; reschedule \u2192 version + 1; doctor close \u2192 closed'],
  ['invalid', 'V1\u2013V6', '6', 'Each bad input answers 400; malformed JSON and oversized body also carry a code and request id'],
  ['authentication', 'A1\u2013A6', '6', '401 without a session; 403 on a bad CSRF or cross-site origin; revoked session stops working'],
  ['authorization', 'Z1\u2013Z3', '3', 'Nurse close is 403 FORBIDDEN_ROLE; nurse contact is 200; nurse sees 0 doctor alerts'],
  ['not-found', 'N1\u2013N2', '2', '404 for an unknown id and an unknown route, both in the error contract'],
  ['duplicate', 'D1\u2013D3', '3', '201 then 200 deduplicated with the same job id; 409 on double close; 409 on duplicate patient'],
  ['reliability', 'R1\u2013R3', '3', '503 retried to the limit then escalated; never-answer times out and escalates; recovery succeeds'],
  ['hardening', 'S1\u2013S6, L1', '7', 'Headers, correlation, rate limit, timing parity, parameter validation, status fidelity, log hygiene'],
];
for (const [topic, ids, count, condition] of groups) {
  const after = hardened.byTopic[topic] ?? { passed: 0, total: 0 };
  topicRows.push([topic, ids, count, `${after.passed}/${after.total}`, condition]);
}
body.push(table(topicRows, [1250, 900, 620, 800, 5780], [17]));
body.push(p('Table 3.1 \u2014 Cases by topic. The hardening topic was 0 passed at baseline: none of those controls existed before this module.'));
body.push(p('To run one case while investigating, edit the case list in `tests/m15-collection.js` or add `--only=<id>` support at the call site; the harness is a plain script, not a framework, so a case is one `await testCase(...)` block.'));
body.push(p('**Why some cases take no measurable request time.** The reliability cases wait for the worker, which polls every 250 ms in the harness. Their time column reads `worker-driven`, not a request duration. Any case measuring a single request records milliseconds.'));

// ── Part 4 ────────────────────────────────────────────────────────────────
body.push(h('Part 4 \u00b7 The authorisation cases in detail', 1));
body.push(p('These are the cases a reviewer should look at first, because a role rule that is only enforced in the interface is not a rule.'));
body.push(table([
  ['ID', 'Acting as', 'Request', 'Must answer', 'Why it matters'],
  ['Z1', 'nurse', 'POST /api/clinical/follow-ups/:id/close', '403 FORBIDDEN_ROLE', 'The close action is hidden in the UI, but hiding a control is not a control'],
  ['Z2', 'nurse', 'POST /api/clinical/follow-ups/:id/contact', '200', 'The rule must not over-block: a nurse does record contact'],
  ['Z3', 'nurse', 'GET /api/reminder-jobs/:id', 'alerts = []', 'A doctor-directed alert must not be readable by another role'],
  ['A1', 'anonymous', 'GET /api/clinical/follow-ups', '401 UNAUTHENTICATED', 'Not 403: a 403 would confirm the resource exists'],
  ['A3/A4', 'doctor', 'Any write with a missing or wrong CSRF token', '403 CSRF_INVALID', 'A cross-site form post cannot mutate a record'],
  ['A6', 'doctor', 'Read after the session row is deleted', '401', 'Sessions are revoked server-side, not only in the cookie'],
], [700, 950, 3050, 1900, 2750]));
body.push(p('Table 4.1 \u2014 Authorisation cases. Z1 and Z3 were both failures before this module (defects D-06 and D-07).'));

// ── Part 5 ────────────────────────────────────────────────────────────────
body.push(h('Part 5 \u00b7 Troubleshooting', 1));
body.push(table([
  ['Symptom', 'Meaning', 'Action'],
  ['`harness error: connect ECONNREFUSED 127.0.0.1:3306`', 'MariaDB is not running', 'Start it from the XAMPP control panel, then rerun. The collection cannot create its database otherwise'],
  ['`API did not become healthy on http://127.0.0.1:3411`', 'Port 3411 taken, or the API crashed at import', 'Read evidence/<label>/server-log.txt. `clinical.mount_state` with an error names the file that failed to import'],
  ['`could not find the API process on port 3400`', 'The capture script needs the app server running', 'Start `node --env-file=.env server.js` in the backend folder first'],
  ['Capture is a blank white page', 'The bundle was built without `--no-web-resources-cdn`, so CSP blocked CanvasKit', 'Rebuild with the flag, redeploy to backend/public/app, hard-reload the browser'],
  ['`nothing matches /Reload/i. Visible: [...]`', 'The script clicked the wrong screen; the visible list shows where it actually was', 'The list is the diagnostic. Usually the session expired and the app is on the sign-in screen'],
  ['`no element matching /Username/i`', 'Flutter semantics were not enabled', 'The script clicks the semantics placeholder itself; if the list is empty the app never booted (see the blank-page row)'],
  ['Case S3 answers 401 instead of 429', 'The limiter was not mounted, or max was raised', 'Check `rateLimit` is applied to POST /api/login in server.js with `key: \'username\'`'],
  ['Case S4 shows a large timing gap', 'The dummy-hash branch was removed from routes.js', '`verifyPassword(password, DUMMY_PASSWORD_HASH)` must run when no user row is found'],
  ['Case R2 escalated but no TIMEOUT code', 'The AbortError name check was lost', 'worker.js must test `e.name === \'TimeoutError\' || \'AbortError\'` before reading any numeric code'],
  ['`schema.sql: ER_PARSE_ERROR ... CHARACTER SET`', 'A statement splitter broke the CREATE DATABASE preamble', 'The harness splits on `\\n;` including the continuation line; do not filter the preamble line by line'],
  ['`EPERM` writing Module15.docx', 'Word has the file open', 'Close Word. The build script falls back to `-rev2.docx` rather than failing after doing the work'],
], [2900, 2900, 3550]));
body.push(p('Table 5.1 \u2014 Every row is a failure that actually occurred during this module, not a hypothetical.'));

// ── Part 6 ────────────────────────────────────────────────────────────────
body.push(h('Part 6 \u00b7 Generating the evidence', 1));
body.push(p('Four commands produce everything in the module folder. The three documents are generated from the JSON, so a document cannot drift from a run.'));
body.push(block('PowerShell', [
  'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
  '',
  '# 1. run the collection (writes evidence/<label>/)',
  'cd backend',
  'node --env-file=.env tests/m15-collection.js --label 04-review',
  'cd ..',
  '',
  '# 2. retake the eight captures (needs the app server on 3400)',
  'node docs/lab/module15/capture-screens.js',
  '',
  '# 3. rebuild the three documents from the evidence',
  'node docs/lab/module15/build-docx.js            # Module15.docx (report)',
  'node docs/lab/module15/build-evidence-docx.js   # Module15-evidence.docx',
  'node docs/lab/module15/build-manual-docx.js     # Module 15-operational-manual.docx',
  '',
  '# 4. copy the three into the module folder',
  'Copy-Item docs\\lab\\module15\\submission\\*.docx Module15\\ -Force',
]));
body.push(p('The document builders read `summary.json` for every count and duration, so if a number in a document does not match the evidence folder, the document was not rebuilt after the last run.'));
body.push(p('**What each document is for.** `Module15.docx` is the report a reader grades. `Module15-evidence.docx` is the artifact portfolio: the full test record, the captures, the log excerpts. This manual is the operational side: how to run it, what should happen, and what to do when it does not.'));

// ── Part 7 ────────────────────────────────────────────────────────────────
body.push(h('Part 7 \u00b7 Verifying each claim yourself', 1));
body.push(p('Six claims carry the module. Each row names the command that decides it and what the answer must be. None of them requires trusting this manual.'));
body.push(table([
  ['Claim', 'Check', 'Must show'],
  ['The collection is repeatable', 'Run it twice with different labels', `37/37 both times; the same ${hardened.total} case ids in both summary.json files`],
  ['Hardening fixed thirteen failures and broke nothing', 'Compare 01-baseline against 02-hardened', `baseline ${baseline.passed}/${baseline.total}; hardened ${hardened.passed}/${hardened.total}; no case that passed goes to fail`],
  ['Login timing no longer discloses accounts', 'Read S4 in both summary files', `baseline gap ${Math.abs((baseline.cases.find((c) => c.id === 'S4').actual.realMedianMs) - (baseline.cases.find((c) => c.id === 'S4').actual.ghostMedianMs))} ms, hardened gap at or under 15 ms`],
  ['No secret reaches a log', 'Read L1 actual in 02-hardened', 'passwordPresent=false, csrfPresent=false, privateKeyPresent=false, requestIdLines > 0'],
  ['Every screen survives both widths', '`flutter test`', '20 tests passed'],
  ['A refusal is explained, not hidden', 'Read S6 actual', '409 with code FOLLOW_UP_NOT_DISCLOSABLE'],
], [2500, 3100, 3750]));
body.push(p('Table 7.1 \u2014 Claim, check, and the expected answer. A claim without a row here is not in the report.'));
body.push(p('**What this manual does not cover.** Load or concurrency testing, the partner receiver\u2019s replay and expiry cases (Module 14 evidence), and the TLS deployment path that would set the Secure cookie flag \u2014 none of which was tested, and the report says so in its limitations section rather than implying coverage.'));

// ── package ───────────────────────────────────────────────────────────────
function writeZip(dir, outFile) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  const locals = [], centrals = [];
  let offset = 0;
  for (const full of files) {
    const name = relative(dir, full).split('\\').join('/');
    const data = readFileSync(full);
    const crc = crc32(data) >>> 0;
    const nameBuf = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
    head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(outFile, Buffer.concat([...locals, cd, end]));
}

const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14">'
  + `<w:body>${body.join('')}`
  + '<w:sectPr><w:pgSz w:h="15840" w:w="12240" w:orient="portrait"/>'
  + '<w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720"/>'
  + '<w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>';

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
cpSync(TEMPLATE, join(WORK, 'template.docx'));
execFileSync('powershell', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
  + `[System.IO.Compression.ZipFile]::ExtractToDirectory('${join(WORK, 'template.docx')}', '${join(WORK, 'x')}')`]);
writeFileSync(join(WORK, 'x', 'word', 'document.xml'), doc);

let finalOut = OUT;
try {
  rmSync(OUT, { force: true });
  writeZip(join(WORK, 'x'), OUT);
} catch (e) {
  if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
  finalOut = OUT.replace(/\.docx$/, '-rev2.docx');
  rmSync(finalOut, { force: true });
  writeZip(join(WORK, 'x'), finalOut);
}

console.log(`wrote ${finalOut}`);
console.log(`parts: 7, tables: 6, cases referenced: ${hardened.total}`);

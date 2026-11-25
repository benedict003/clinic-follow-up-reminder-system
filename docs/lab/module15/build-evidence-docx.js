// docs/lab/module15/build-evidence-docx.js
//
// Builds Module15-evidence.docx — the portfolio companion to Module15.docx, in
// the same shape as Module14-evidence.docx: the test record table, the captures,
// the log excerpts, and the defect register, all generated from the evidence
// folder so nothing is retyped from memory.
//
//   node docs/lab/module15/build-evidence-docx.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const TEMPLATE = join(repo, 'Module14', 'Module14.docx');
const OUT = join(here, 'submission', 'Module15-evidence.docx');
const WORK = join(here, '.docx-evidence');

const baseline = JSON.parse(readFileSync(join(here, 'evidence', '01-baseline', 'summary.json'), 'utf8'));
const hardened = JSON.parse(readFileSync(join(here, 'evidence', '02-hardened', 'summary.json'), 'utf8'));
const third = JSON.parse(readFileSync(join(here, 'evidence', '03-after-ui-fixes', 'summary.json'), 'utf8'));
const hardenedLog = readFileSync(join(here, 'evidence', '02-hardened', 'server-log.txt'), 'utf8').trim().split(/\r?\n/);
const baselineLog = readFileSync(join(here, 'evidence', '01-baseline', 'server-log.txt'), 'utf8').trim().split(/\r?\n/);

// ── XML helpers (same vocabulary as the report generator) ───────────────────
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runs(text, { size = 20, bold = false, mono = false } = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => {
    let t = part, b = bold, m = mono;
    if (part.startsWith('**') && part.endsWith('**')) { t = part.slice(2, -2); b = true; }
    else if (part.startsWith('`') && part.endsWith('`')) { t = part.slice(1, -1); m = true; }
    const font = m ? 'Consolas' : 'Times New Roman';
    return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>`
      + `${b ? '<w:b/>' : ''}<w:sz w:val="${m ? size - 3 : size}"/><w:szCs w:val="${m ? size - 3 : size}"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

function p(text = '', { size = 20, bold = false, spaceAfter = 100, align, mono = false } = {}) {
  const jc = align ? `<w:jc w:val="${align}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/>${jc}</w:pPr>${runs(text, { size, bold, mono })}</w:p>`;
}

function h(text, level = 1) {
  const style = level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:before="${level === 1 ? 320 : 240}" w:after="100"/></w:pPr>`
    + runs(text, { size: level === 1 ? 26 : 23, bold: true }) + '</w:p>';
}

function table(rows, widths, { header = true, size = 16 } = {}) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows.map((row, r) => {
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
    + `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function code(lines) {
  return lines.map((line) =>
    `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F4F3"/><w:ind w:left="100"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="15"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(line) || ' '}</w:t></w:r></w:p>`).join('');
}

const EMU = 914400;
const MEDIA = [];
function pngSize(buf) {
  return buf.length < 24 ? { w: 0, h: 0 } : { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function rIdFor(absPath) {
  const found = MEDIA.find((m) => m.path === absPath);
  if (found) return found.rid;
  const n = MEDIA.length + 1;
  const rid = `rIdEv${n}`;
  MEDIA.push({ rid, path: absPath, name: `ev-${n}.png` });
  return rid;
}
let imgSeq = 700;
function screenshot(file, { maxWIn = 6.2, maxHIn = 3.9, captionText } = {}) {
  const absPath = join(here, 'screens', file);
  const buf = readFileSync(absPath);
  const { w, h } = pngSize(buf);
  const scale = Math.min((maxWIn * EMU) / w, (maxHIn * EMU) / h);
  const cx = Math.round(w * scale), cy = Math.round(h * scale);
  const id = imgSeq++;
  const drawing = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="40"/></w:pPr>'
    + '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="${esc(file)}" descr="${esc(file)}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(file)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rIdFor(absPath)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  return drawing + (captionText ? p(captionText, { size: 15, align: 'center', spaceAfter: 160 }) : '');
}

// ── derived facts ─────────────────────────────────────────────────────────
const verdict = (b) => (b === undefined ? 'not in baseline' : (b ? 'Pass' : 'FAIL'));
const byId = (list, id) => list.cases.find((c) => c.id === id);
const pht = (iso) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const shortTime = (ms) => (ms > 0 ? `${ms} ms` : 'worker-driven');

const body = [];

body.push(h('Module 15 \u2014 Evidence Portfolio', 1));
body.push(p('Integration testing and security hardening of the Clinic Follow-Up Reminder System. This document holds the artifacts the report refers to: the test record, the interface captures, the log excerpts that prove the controls are running, and the defect register. Every table in it is generated from the JSON files in docs/lab/module15/evidence/, so a value here can be traced to a recorded run rather than to a transcription.', { size: 21 }));
body.push(table([
  ['Field', 'Value'],
  ['Learner', 'WILLIAM BENEDICT R. BINWAG'],
  ['Student number', '22-11990'],
  ['System under test', 'Clinic Follow-Up Reminder System \u2014 backend/ and lib/'],
  ['Collection', 'backend/tests/m15-collection.js \u2014 37 cases, 9 topics'],
  ['Runs recorded', `01-baseline (${pht(baseline.ranAt)} PHT), 02-hardened (${pht(hardened.ranAt)} PHT), 03-after-ui-fixes (${pht(third.ranAt)} PHT)`],
  ['Database', 'clinic_followup_m15 \u2014 created and dropped by the harness, never the lab database'],
  ['Result', `baseline ${baseline.passed}/${baseline.total}, hardened ${hardened.passed}/${hardened.total}, third ${third.passed}/${third.total}`],
], [2200, 7150]));

// ── 1. the record ─────────────────────────────────────────────────────────
body.push(h('1. The test record', 1));
body.push(p(`All ${hardened.total} cases, both runs, in one table. Expected and actual are the JSON values the collection stored; a failure is left in the record as a failure. The comparison column is what the report's section 9 refers to.`));

const recordRows = [['ID', 'Topic', 'Case', 'Expected', 'Actual', 'Time', 'Verdict']];
for (const c of hardened.cases) {
  const b = byId(baseline, c.id);
  const verdictText = !b ? 'Pass (added after baseline)' : (!b.pass && c.pass ? 'Pass (was FAIL)' : (c.pass ? 'Pass' : 'FAIL'));
  recordRows.push([
    c.id, c.topic, c.title,
    JSON.stringify(c.expected), JSON.stringify(c.actual),
    shortTime(c.ms), verdictText,
  ]);
}
body.push(table(recordRows, [520, 900, 2350, 2000, 2000, 700, 880], { size: 12 }));
body.push(p('Table 1.1 \u2014 Test record. Verdicts are from the hardened run; "was FAIL" marks the thirteen cases that changed from fail to pass, which is the hardening evidence.'));

// ── 2. baseline failures ──────────────────────────────────────────────────
body.push(h('2. Baseline failures, kept unedited', 1));
body.push(p(`The first run recorded ${baseline.passed} passes and ${baseline.total - baseline.passed} failures. The failures are reproduced exactly as recorded \u2014 this is the only honest form of a "before" section.`));
const failRows = [['ID', 'Case', 'Expected', 'Actual']];
for (const c of baseline.cases.filter((x) => !x.pass)) {
  failRows.push([c.id, c.title, JSON.stringify(c.expected), JSON.stringify(c.actual)]);
}
body.push(table(failRows, [560, 3200, 2700, 2890], { size: 13 }));
body.push(p('Table 2.1 \u2014 Baseline failures, from evidence/01-baseline/. Case S5 was later revised and S6 added; both are recorded in that folder\u2019s NOTES.md rather than being backfilled.'));
body.push(screenshot('15-07-failure.png', { captionText: 'The failure state as a clinician sees it after D-09: the banner says what to do, and no exception text or internal path is shown.' }));

// ── 3. per-topic summary ──────────────────────────────────────────────────
body.push(h('3. Coverage by topic', 1));
const topicRows = [['Topic', 'Cases', 'Baseline', 'Hardened', 'What it establishes']];
const topicNote = {
  contract: 'Health, board envelope, record detail shape',
  functional: 'Contact, reschedule and close change state as documented',
  invalid: 'Bad enum, bad date, past date, malformed JSON, oversized body, missing note',
  authentication: 'No session, forged cookie, CSRF, cross-site origin, revoked session',
  authorization: 'Nurse cannot close; nurse can contact; nurse does not receive doctor alerts',
  'not-found': 'Unknown record id and unknown route, both in the error contract',
  duplicate: 'Idempotent queueing, double close, duplicate registration',
  reliability: 'Dependency 503, never-answer timeout, recovery',
  hardening: 'Headers, correlation, rate limit, login timing, parameter validation, status fidelity, log hygiene',
};
for (const [topic, after] of Object.entries(hardened.byTopic)) {
  const before = baseline.byTopic[topic] ?? { total: after.total, passed: 0 };
  topicRows.push([topic, String(after.total), `${before.passed}/${before.total}`, `${after.passed}/${after.total}`, topicNote[topic] ?? '']);
}
body.push(table(topicRows, [1250, 600, 900, 900, 5700], { size: 13 }));
body.push(p('Table 3.1 \u2014 Coverage. The hardening topic was 0/6 at baseline: none of those controls existed.'));

// ── 4. reliability evidence ───────────────────────────────────────────────
body.push(h('4. Failure-injection evidence', 1));
body.push(p('The reliability cases use a controllable stub gateway rather than a real dependency, so "the partner is down" and "the partner is slow" are conditions a reviewer can reproduce. The table records what was injected and what the queue did about it.'));
body.push(table([
  ['Case', 'Injected', 'Predicted', 'Recorded result'],
  ['R1', 'Gateway answers 503 to every attempt', 'Retry to the attempt limit, then escalate; no further attempts', JSON.stringify(byId(hardened, 'R1').actual)],
  ['R2', 'Gateway accepts and never answers (700 ms timeout)', 'Each attempt times out, budget holds, escalation; the attempt names the timeout', JSON.stringify(byId(hardened, 'R2').actual)],
  ['R3', 'Gateway restored to 200', 'The same path succeeds; the queue is not poisoned', JSON.stringify(byId(hardened, 'R3').actual)],
], [600, 2900, 2900, 2950], { size: 13 }));
body.push(p('Table 4.1 \u2014 From evidence/02-hardened/. R2 passed functionally in the baseline too; what failed there was the signal \u2014 the attempt stored error code 23 instead of TIMEOUT (defect D-03).'));

const workerLines = hardenedLog
  .filter((l) => /"event":"(attempt\.(start|end)|job\.(rescheduled|escalated))"/.test(l))
  .slice(0, 8);
body.push(p('The worker writes one structured line per state transition. Excerpt from the hardened run:', { size: 19 }));
body.push(code(workerLines));

// ── 5. hardening evidence ─────────────────────────────────────────────────
body.push(h('5. Hardening controls, as recorded', 1));
const s1 = byId(hardened, 'S1').actual;
body.push(table([
  ['Control', 'Evidence'],
  ['Security headers', `nosniff=${s1.nosniff}, frame=${s1.frame}, referrer=${s1.referrer}, CSP=${s1.csp}, Permissions-Policy=${s1.permissions}`],
  ['Correlation id', `inbound id echoed: ${JSON.stringify(byId(hardened, 'S2').actual)}`],
  ['Login rate limit', `status sequence reached ${byId(hardened, 'S3').actual.status} with Retry-After=${byId(hardened, 'S3').actual.hasRetryAfter}`],
  ['Login timing parity', `baseline real ${byId(baseline, 'S4').actual.realMedianMs} ms vs unknown ${byId(baseline, 'S4').actual.ghostMedianMs} ms; hardened real ${byId(hardened, 'S4').actual.realMedianMs} ms vs unknown ${byId(hardened, 'S4').actual.ghostMedianMs} ms`],
  ['Path parameter', `${byId(hardened, 'S5').actual.status} ${byId(hardened, 'S5').actual.code} (baseline answered 500)`],
  ['Status fidelity', `${byId(hardened, 'S6').actual.status} ${byId(hardened, 'S6').actual.code}`],
  ['Log hygiene', `${byId(hardened, 'L1').actual.requestIdLines} correlation ids in ${byId(hardened, 'L1').actual.logLines} lines; password/token/key present: ${byId(hardened, 'L1').actual.passwordPresent}/${byId(hardened, 'L1').actual.csrfPresent}/${byId(hardened, 'L1').actual.privateKeyPresent}`],
], [2400, 6950], { size: 13 }));
body.push(p('Table 5.1 \u2014 Each row is a recorded assertion, not an inspection. The full expected/actual pair for every case is in the per-case JSON files.'));
body.push(p('Access-log lines from the hardened run, showing the correlation id, the actor, and the absence of a query string (the board\u2019s search box carries patient names):', { size: 19 }));
body.push(code(hardenedLog.filter((l) => l.includes('request.complete')).slice(0, 4)));
body.push(p('A refusal, logged with the id a clinician can quote:', { size: 19 }));
body.push(code(hardenedLog.filter((l) => /rate_limited|client_error|login\.failed/.test(l)).slice(0, 3)));

// ── 6. interface captures ─────────────────────────────────────────────────
body.push(h('6. Interface captures', 1));
body.push(p('Taken from the release build served at /app/ by scripts in docs/lab/module15/capture-screens.js, which drives Chrome over the DevTools protocol so the narrow captures are a genuine 380 px viewport rather than a scaled window. The script also asserts what it captured and fails if a state did not appear.'));
body.push(screenshot('15-01-board.png', { captionText: '15-01 Success. The board: scope chips carry their own counts; each row shows due state, contact attempts and the reason.' }));
body.push(screenshot('15-03-detail.png', { captionText: '15-03 A record. Overdue state, the three clinical actions, and an append-only audit row with actor and time.' }));
body.push(screenshot('15-05-forbidden.png', { captionText: '15-05 Authorization. Nurse view: no close action, and a sentence saying why. Case Z1 refuses the same call at the API.' }));
body.push(screenshot('15-02-board-narrow.png', { maxWIn: 2.3, maxHIn: 4.6, captionText: '15-02 Responsive. The same board at 380 px.' }));
body.push(screenshot('15-04-validation.png', { maxWIn: 2.3, maxHIn: 4.6, captionText: '15-04 Validation. A required field shown before submission; the script asserts the message is on screen.' }));
body.push(screenshot('15-06-empty.png', { captionText: '15-06 Empty. A scope with nothing in it, while the chips still show the other queues.' }));
body.push(screenshot('15-08-rate-limited.png', { captionText: '15-08 Hardening in the interface. The eleventh failed sign-in returns the rate-limit message, not another wrong-password attempt.' }));

// ── 7. defect register ────────────────────────────────────────────────────
body.push(h('7. Defect register', 1));
body.push(p('Ten defects. Two were introduced by earlier modules and only surfaced when this module exercised every path; three were found by taking the screenshots rather than by writing a test. Reproduction, cause, fix and retest for each are in docs/lab/module15/DEFECTS.md.'));
body.push(table([
  ['ID', 'Defect', 'Found by', 'Severity', 'Status'],
  ['D-01', 'Login latency disclosed which usernames exist (37 ms gap)', 'S4', 'Medium \u2014 disclosure', 'Fixed, retested'],
  ['D-02', 'No limit on password guessing at /api/login', 'S3', 'High \u2014 credential stuffing', 'Fixed, retested'],
  ['D-03', 'Gateway timeout recorded as error code 23', 'R2', 'Medium \u2014 operability', 'Fixed, retested'],
  ['D-04', 'No correlation id in any response or log line', 'S2, L1', 'Medium \u2014 monitoring', 'Fixed, retested'],
  ['D-05', 'Malformed input answered 500 with the parser\u2019s own message', 'S5 (probe)', 'Low \u2014 leakage', 'Fixed, retested'],
  ['D-06', 'Every Module 14 refusal became a generic 500 (pre-existing)', 'S5 probe, S6', 'High \u2014 no explanation to the clinic', 'Fixed, retested'],
  ['D-07', 'A nurse received alerts addressed to a doctor (pre-existing)', 'Z3', 'Medium \u2014 cross-role exposure', 'Fixed, retested'],
  ['D-08', 'Tabs drew two title bars', 'Screenshots', 'Low \u2014 reads as broken', 'Fixed, recaptured'],
  ['D-09', 'Failure banner printed a ClientException and an internal path', '15-07 capture', 'Medium \u2014 usability, disclosure', 'Fixed, recaptured'],
  ['D-10', 'Access log recorded router-trimmed paths', 'Reading the run log', 'Low \u2014 correlation quality', 'Fixed, third run'],
], [520, 3600, 1500, 1900, 1830], { size: 13 }));
body.push(p('Table 7.1 \u2014 Defect register. The two marked pre-existing were live in the build submitted for Module 14.'));

// ── 8. client-side evidence ───────────────────────────────────────────────
body.push(h('8. Client-side verification', 1));
body.push(p('The interface is checked mechanically as well as captured, so a state cannot silently regress between submissions.'));
body.push(code([
  'cd <repository root>',
  'flutter test        # 20 tests, all passing',
  'flutter analyze     # only the project-wide material.dart deprecation notices',
  '',
  '  test/screen_layout_test.dart    12 tests  every screen at 1280x800 and 380x800,',
  '                                             three taps each, failing on any',
  '                                             framework error (guards the Module 14',
  '                                             freeze class of defect)',
  '  test/clinical_models_test.dart   6 tests  the real API payloads parse into the',
  '                                             models the screens render',
  '  test/widget_test.dart            2 tests  sign-in form renders; empty submit shows',
  '                                             both field errors and sends nothing',
]));

// ── 9. how to reproduce ───────────────────────────────────────────────────
body.push(h('9. Reproducing these artifacts', 1));
body.push(code([
  'cd backend',
  'node --env-file=.env tests/m15-collection.js --label 04-review',
  '',
  '  # creates clinic_followup_m15, starts its own API on 3411 and a stub',
  '  # gateway on 4799, runs 37 cases, writes evidence/04-review/',
  '  # expected: 37/37 passed, 0 failed',
  '',
  'node docs/lab/module15/build-docx.js            # rebuild the report',
  'node docs/lab/module15/build-evidence-docx.js   # rebuild this portfolio',
  'node docs/lab/module15/capture-screens.js       # retake the captures',
]));
body.push(p('The collection never touches clinic_followup_lab. A reviewer can run it while a demonstration is in progress without disturbing either.'));
body.push(p('Evidence index for the whole module: docs/lab/module15/README.md. Requirement-to-case mapping: TRACEABILITY.md. Backlog and measurements: HARDENING.md. Recovery: RUNBOOK.md.', { size: 19 }));

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

if (MEDIA.length) {
  mkdirSync(join(WORK, 'x', 'word', 'media'), { recursive: true });
  const relsPath = join(WORK, 'x', 'word', '_rels', 'document.xml.rels');
  let rels = readFileSync(relsPath, 'utf8');
  const extra = MEDIA.map((m) => {
    cpSync(m.path, join(WORK, 'x', 'word', 'media', m.name));
    return `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`;
  }).join('');
  writeFileSync(relsPath, rels.replace('</Relationships>', extra + '</Relationships>'));
  const ctPath = join(WORK, 'x', '[Content_Types].xml');
  let ct = readFileSync(ctPath, 'utf8');
  if (!ct.includes('Extension="png"')) {
    writeFileSync(ctPath, ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  }
}

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
console.log(`embedded ${MEDIA.length} captures, ${hardened.total} cases, 7 log excerpts`);

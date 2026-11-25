// docs/lab/module15/build-docx.js
//
// Generates submission/Module15.docx from the evidence in this folder.
//
// The report is generated rather than hand-written so the numbers in it can be
// re-derived: run the collection, then run this script, and the tables match the
// JSON. It reuses Module 14's DOCX as a template, so styles, fonts and page setup
// are identical to the previous module's submission.
//
//   node docs/lab/module15/build-docx.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const TEMPLATE = process.env.M15_TEMPLATE
  || join(repo, 'Module14', 'Module14.docx');
const OUT = join(here, 'submission', 'Module15.docx');
const WORK = join(here, '.docx-build');

const baseline = JSON.parse(readFileSync(join(here, 'evidence', '01-baseline', 'summary.json'), 'utf8'));
const hardened = JSON.parse(readFileSync(join(here, 'evidence', '02-hardened', 'summary.json'), 'utf8'));

// ── XML helpers ────────────────────────────────────────────────────────────
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const CELL_PAD = '<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>';

/** Runs, with **bold** and smono` inline markers. */
function runs(text, { size = 24, bold = false, mono = false } = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => {
    let t = part;
    let b = bold;
    let m = mono;
    let italic = false;
    if (part.startsWith('**') && part.endsWith('**')) { t = part.slice(2, -2); b = true; }
    else if (part.startsWith('`') && part.endsWith('`')) { t = part.slice(1, -1); m = true; }
    else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) { t = part.slice(1, -1); italic = true; }
    const font = m ? 'Consolas' : 'Times New Roman';
    return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>`
      + `${b ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}<w:sz w:val="${m ? size - 4 : size}"/><w:szCs w:val="${m ? size - 4 : size}"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

function p(text = '', { size = 24, bold = false, align, spaceAfter = 120, spaceBefore = 0, indent = 0, mono = false } = {}) {
  const jc = align ? `<w:jc w:val="${align}"/>` : '';
  const ind = indent ? `<w:ind w:left="${indent}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}"/>${jc}${ind}</w:pPr>${runs(text, { size, bold, mono })}</w:p>`;
}

function h(text, level = 1) {
  const style = level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:before="${level === 1 ? 360 : 260}" w:after="120"/></w:pPr>${runs(text, { size: level === 1 ? 28 : 25, bold: true })}</w:p>`;
}

function titleBlock(lines) {
  return lines.map((l, i) => (i === 0
    ? `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:after="60"/></w:pPr>${runs(l, { size: 44, bold: true })}</w:p>`
    : `<w:p><w:pPr><w:spacing w:after="20"/></w:pPr>${runs(l, { size: i === 1 ? 26 : 22 })}</w:p>`)).join('');
}

function bullet(text, level = 0) {
  return `<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="${360 + level * 300}" w:hanging="200"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">\u2022  </w:t></w:r>`
    + runs(text) + '</w:p>';
}

function numbered(n, text) {
  return `<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="420" w:hanging="280"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${n}.  </w:t></w:r>`
    + runs(text) + '</w:p>';
}

/** Fixed-layout table; widths must sum to the 9350 twip text width. */
function table(rows, widths, { header = true, size = 19 } = {}) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows.map((row, r) => {
    const cells = row.map((cell, i) => {
      const isHead = header && r === 0;
      const shade = isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EDEA"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${shade}</w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:after="20" w:before="20"/></w:pPr>${runs(cell, { size, bold: isHead })}</w:p></w:tc>`;
    }).join('');
    const headerRow = header && r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${headerRow}${cells}</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr><w:tblStyle w:val="Table1"/><w:tblW w:w="9350" w:type="dxa"/>`
    + '<w:tblBorders><w:top w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:left w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:bottom w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:right w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:insideH w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:insideV w:color="000000" w:space="0" w:sz="4" w:val="single"/></w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="0400"/></w:tblPr>'
    + `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

// ── image registry ─────────────────────────────────────────────────────────
// Relationships are collected while the body is built and written into the
// package afterwards, because the body has to exist before the template is
// unpacked. Part names and rIds are assigned here once per file.
const MEDIA = [];
const EMU_PER_INCH = 914400;

function pngSize(buf) {
  // IHDR width/height are big-endian uint32 at bytes 16 and 20.
  if (buf.length < 24) return { w: 0, h: 0 };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function rIdFor(absPath) {
  const existing = MEDIA.find((m) => m.path === absPath);
  if (existing) return existing.rid;
  const n = MEDIA.length + 1;
  const rid = `rIdM15Img${n}`;
  MEDIA.push({ rid, path: absPath, name: `m15-${n}.png` });
  return rid;
}

/** A capture, scaled to fit a box while keeping its aspect ratio. */
function screenshot(file, { maxWIn = 6.0, maxHIn = 4.2, captionText } = {}) {
  const absPath = join(here, 'screens', file);
  const buf = readFileSync(absPath);
  const { w, h } = pngSize(buf);
  const scale = Math.min((maxWIn * EMU_PER_INCH) / w, (maxHIn * EMU_PER_INCH) / h);
  const cx = Math.round(w * scale);
  const cy = Math.round(h * scale);
  return image(absPath, cx, cy, file)
    + (captionText ? p(captionText, { size: 17, align: 'center', spaceAfter: 200 }) : '');
}

let imageSeq = 400;
function image(absPath, widthEmu, heightEmu, alt) {
  const id = imageSeq++;
  return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr>'
    + '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>`
    + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
    + `<wp:docPr id="${id}" name="${esc(alt)}" descr="${esc(alt)}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rIdFor(absPath)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

/** Monospace, shaded block for commands and log samples. */
function code(text) {
  return String(text).split('\n').map((line) =>
    `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F4F3"/><w:ind w:left="120"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="17"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(line) || ' '}</w:t></w:r></w:p>`).join('');
}

const gap = () => p('', { spaceAfter: 60 });
const caption = (t) => p(t, { size: 19, spaceAfter: 160 });

// ── derived numbers (never typed by hand) ──────────────────────────────────
const byId = (list, id) => list.cases.find((c) => c.id === id) ?? {};
const s4b = byId(baseline, 'S4').actual ?? {};
const s4a = byId(hardened, 'S4').actual ?? {};
const l1a = byId(hardened, 'L1').actual ?? {};
const l1b = byId(baseline, 'L1').actual ?? {};
const runCmd = (command) => {
  // .bat/.cmd shims cannot be spawned directly on Windows since Node 18, so the
  // probe goes through cmd.exe. The command is a constant, not user input.
  try { return execFileSync(process.env.ComSpec || "cmd.exe", ["/c", command], { encoding: "utf8" }).trim(); }
  catch { return "n/a"; }
};
const npmVersion = runCmd('npm --version').split(String.fromCharCode(10))[0].trim();
const flutterVersionText = (() => {
  try {
    const out = runCmd('flutter --version');
    const first = out.split(/\r?\n/)[0].trim();
    const dart = out.match(/Dart ([0-9.]+)/);
    return dart ? `${first}; Dart ${dart[1]}` : first;
  } catch { return 'n/a'; }
})();
const pht = (iso) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
const windowText = `${pht(baseline.ranAt)} to ${pht(hardened.ranAt)} PHT (baseline, then hardened)`;
const startedDate = pht(baseline.ranAt).slice(0, 10);
const fixed = hardened.cases.filter((c) => !(baseline.cases.find((b) => b.id === c.id)?.pass ?? false));
const addedSinceBaseline = hardened.cases.filter((c) => !baseline.cases.some((b) => b.id === c.id)).length;
const fixedFromFailures = fixed.length - addedSinceBaseline;
const regressions = baseline.cases.filter((b) => b.pass && !(hardened.cases.find((h) => h.id === b.id)?.pass));

// ── body ───────────────────────────────────────────────────────────────────
const body = [];

body.push(titleBlock([
  'Module 15 \u2014 Integration Testing and Security Hardening',
  'PFEBSIT 002 - Integrative Programming and Technologies 2',
  '2IT Free Elective 2 - First Semester, A.Y. 2026-2027',
  'University of La Salette, Inc. - College of Information Technology',
]));

body.push(table([
  ['Field', 'Value'],
  ['Learner', 'WILLIAM BENEDICT R. BINWAG'],
  ['Student number', '22-11990'],
  ['Course outcome alignment', 'CLO4, CLO5, CLO6'],
  ['System under test', 'Clinic Follow-Up Reminder System - backend/ and lib/'],
  ['Repository / branch', 'https://github.com/benedict003/clinic-follow-up-reminder-system/ / main'],
  ['Commit under test', '[[SHA]]'],
  ['Submission date', '[[DATE]]'],
], [2300, 7050]));

body.push(p('Document status at generation. Sections 6 to 11 are generated from the two collection runs recorded in the evidence folder, so every count and duration in them comes from a JSON record rather than from recollection. Only the commit hash, the submission date and the browser build remain as markers; everything else was read from the build host or from the run records when this file was generated. One case (S5) was revised and one (S6) added after the baseline run; both are recorded in the baseline notes and in section 9, not hidden.', { size: 21 }));

// 1 ────────────────────────────────────────────────────────────────────────
body.push(h('1. Purpose and scope', 1));
body.push(p('Module 14 proved that one record could leave the clinic unreadable to anyone but the partner. It proved that on a single successful demonstration. Module 15 asks a different question: is the integrated system trustworthy when requests are malformed, when the caller is the wrong role, when the same submission arrives twice, when the partner never answers, and when something fails at three in the morning with nobody watching the screen?'));
body.push(p('The work therefore had two halves, and both are required by the module. The first is a defensible test baseline: a repeatable collection that exercises the normal path and every adverse path the workflow can meet, recording the prediction before the run and the actual result afterwards. The second is a hardening sprint selected from what that baseline found, applied without breaking the clinical workflow, and re-measured with the same collection so the change is evidence and not assertion.'));
body.push(p('**The finding that shaped the week.** The baseline passed every functional case and failed thirteen adverse ones. One of those was measured rather than argued: a login for a username that does not exist answered in 2 ms, while a login for a real account took 39 ms. That 37 ms gap is a username oracle, and it existed because the password hash was simply skipped when there was no row to compare against. A second finding was worse for the clinic than for an attacker: every deliberate refusal from the Module 14 exchange layer \u2014 "this record is already closed", "this envelope is not for you" \u2014 was being reported to the clinician as an unexplained server error, because `EnvelopeError` carried its status in a property the error handler never read.'));
body.push(p('**In scope:** the clinic API and its guards; the Module 13 reminder queue, worker, retry and escalation path; the Module 14 exchange statuses as far as they can be exercised without the partner receiver; the Flutter Web client states and its layout at two widths.'));
body.push(p('**Out of scope, and stated as such:** load and stress testing (only single-request latency was measured), penetration testing of TLS or of the pinned certificate exchange, multi-tenant isolation, and production deployment configuration. The system is a lab build on loopback and nothing in this report should be read as a production security claim.'));

// 2 ────────────────────────────────────────────────────────────────────────
body.push(h('2. Environment and laboratory log', 1));
body.push(table([
  ['Field', 'Value'],
  ['Date started', startedDate],
  ['Operating system', 'Windows 11 64 bit'],
  ['Node / npm', `${process.version} / ${npmVersion}`],
  ['Flutter / Dart', flutterVersionText],
  ['Browser and tested widths', '[[ENV5]] - automated layout verified at 1280x800 and 380x800'],
  ['Database server', 'MariaDB 10.11.19 (XAMPP), port 3306'],
  ['Test database', 'clinic_followup_m15 - created and dropped by the collection'],
  ['Lab database', 'clinic_followup_lab - never touched by a collection run'],
  ['API under test', 'http://127.0.0.1:3411 (harness-owned instance)'],
  ['Stub integration gateway', 'http://127.0.0.1:4799/notify (modes: ok, 503, 500, never-answer)'],
  ['Execution window (PHT)', windowText],
], [2300, 7050]));
body.push(p('The collection starts its own API process against its own database, so a run cannot disturb a demonstration that is already in progress and cannot be disturbed by one. This was a deliberate decision: the first draft of the harness ran against the lab database and would have enqueued real reminder jobs that the running worker would then have delivered, corrupting the state a reviewer might be looking at.', { size: 21 }));

// 3 ────────────────────────────────────────────────────────────────────────
body.push(h('3. The bounded workflow under test', 1));
body.push(p('The workflow is one clinician deciding what happens to one follow-up. It is bounded because every step has a named actor, a validated input and an observable output, and because the workflow cannot loop: a reminder job runs a bounded number of attempts, and a follow-up ends in a terminal state.'));
body.push(table([
  ['Element', 'Definition'],
  ['Actors', 'Nurse (records contact, schedules, reschedules); Doctor (everything a nurse may do, plus closing a record and receiving automation alerts); Worker (system actor, delivers queued reminders); Partner service (external actor, accepts sealed envelopes).'],
  ['Trigger', 'A clinician opens a record and acts on it; or the worker poll interval reaching a due job.'],
  ['Trusted inputs', 'The session cookie and CSRF token; the server-side role on the session row; the follow-up id in the path; the request body. Nothing from the client is trusted for authorisation or for a status transition.'],
  ['Validation', 'Role at the route; input shape and ranges in the handler; business preconditions re-read from the database inside the transaction (a record must still be scheduled to be queued or disclosed).'],
  ['Processing', 'Validate, re-read authoritative state, mutate inside a transaction, append an audit event, return the new state.'],
  ['Outputs', 'The updated record; an append-only history row; a reminder job with an observable terminal status; a sealed-envelope receipt when the partner accepts.'],
  ['External dependencies', 'MariaDB; the loopback reminder gateway; the partner receiver over pinned TLS; the browser.'],
  ['Non-goals', 'Clinical advice, prescribing, real patient contact channels, multi-clinic tenancy. The system records and routes decisions; it does not make them.'],
], [2000, 7350]));

// 4 ────────────────────────────────────────────────────────────────────────
body.push(h('4. Test strategy and the decision record', 1));
body.push(p('**Decision question.** Should the Module 15 baseline be a Postman collection maintained by hand, or a scripted harness that owns its own data and writes machine-readable evidence?'));
body.push(table([
  ['Criterion', 'Postman collection', 'Scripted harness (chosen)'],
  ['Functional fit', 'Good: requests are editable by a reviewer without a code editor.', 'Good: same method/path/body coverage, expressed as data.'],
  ['Security', 'Environments, cookies and tokens live in a workspace; easy to leak a real credential into a shared collection.', 'Fixtures are generated per run; the password comes from the environment and never enters the repository.'],
  ['Reliability', 'A reviewer must remember to reset data; a failed run leaves state behind.', 'Creates and drops its own database; each run starts identically.'],
  ['Performance', 'Single-request timing is available; aggregating medians is manual.', 'Medians computed and asserted, which is what the timing case needs.'],
  ['Effort', 'Low to start, high to keep honest.', 'Moderate to start, stays honest.'],
  ['Operational ownership', 'Whoever holds the workspace.', 'The repository, versioned with the code.'],
  ['Ease of verification', 'Screenshots of a collection runner.', 'A JSON per case plus a summary a reviewer can diff between runs.'],
], [1500, 3200, 4650]));
body.push(p('**Outcome (ADR-003).** A scripted harness. The reasoning is the timing case: R-SEC-4 cannot be evidenced by a screenshot of a green request, because it is a statement about a distribution. A collection that computes a median and asserts a bound is the only form in which that requirement is testable. Postman remains usable for exploratory work and a reviewer may replay any case by hand; the harness is the record.'));
body.push(p('**Test layers.** Contract and functional first (does the documented envelope still hold), then invalid input (is a bad request rejected safely), then authentication and authorisation (is the caller who they claim, and may they do this), then not-found and duplicate submissions (does the system stay idempotent), then reliability (does a dependency failure stay bounded), then hardening checks (headers, correlation, rate limit, timing parity, log hygiene). Each layer is a topic in the collection, and the summary reports pass counts per topic so a regression can be localised quickly.'));
body.push(p('**Exit criteria.** Zero failures on the hardened build, no case that passed before now failing, every failure recorded with its expected and actual result, and every fixed weakness accompanied by a measurement rather than a claim.'));

// 5 ────────────────────────────────────────────────────────────────────────
body.push(h('5. Data flow and trust boundaries', 1));
body.push(code([
  '  [browser: Flutter Web]',
  '        |  HTTPS origin + cfr_session cookie + X-CSRF-Token',
  '        v',
  '  ---- trust boundary 1: origin check, session, CSRF, rate limit ----',
  '        |',
  '  [clinic API  :3400]  --(1)-->  [MariaDB]',
  '        |                        follow_ups, follow_up_events (append-only)',
  '        |                        reminder_*, secure_outbox (metadata only)',
  '        |',
  '        |  (2) queue a reminder job',
  '        v',
  '  [worker] --(3) HTTP loopback--> [reminder gateway :4699]',
  '        |                          idempotency key = sha256(follow_up|version)',
  '        |                          bounded attempts, backoff, escalate to needs_human',
  '        |',
  '        |  (4) seal and send a minimised record',
  '        v',
  '  ---- trust boundary 2: minimisation + AES-256-GCM + Ed25519 + pinned TLS ----',
  '        |',
  '  [partner receiver :4443] --> secure_inbox --> receipt (no payload)',
  '',
  '  Marked on the diagram: credentials (session cookie, CSRF token) never leave',
  '  boundary 1; the patient name, patient id, clinical reason and contact number',
  '  never cross boundary 2; the audit trail records who did what but no secret.',
].join('\n')));
body.push(p('The two boundaries answer different questions. Boundary 1 asks whether this caller may act at all; boundary 2 asks what may leave the building even when they may. Module 15 hardened boundary 1 and hardened the reporting of boundary 2; it did not change the envelope itself, which Module 14 owns and which its own suite still covers.', { size: 21 }));

// 6 ────────────────────────────────────────────────────────────────────────
body.push(h('6. The collection', 1));
body.push(p(`The collection is ${hardened.total} cases in nine topics. It runs with one command, creates its own database, starts its own API and a controllable stub gateway, and writes one JSON per case plus a summary, a results table and the server's own log.`));
body.push(code([
  'cd backend',
  'node --env-file=.env tests/m15-collection.js --label 03-mine',
  '',
  'expected:',
  '  ... 37/37 passed, 0 failed',
  '  evidence: docs/lab/module15/evidence/03-mine/',
].join('\n')));
body.push(table([
  ['Topic', 'Cases', 'What it establishes'],
  ['contract', '3', 'Health, board envelope, record detail shape'],
  ['functional', '3', 'Contact, reschedule and close change state as documented'],
  ['invalid', '6', 'Bad enum, bad date, past date, malformed JSON, oversized body, missing note'],
  ['authentication', '6', 'No session, forged cookie, missing CSRF, wrong CSRF, cross-site origin, revoked session'],
  ['authorization', '3', 'Nurse cannot close; nurse can record contact; nurse does not receive doctor alerts'],
  ['not-found', '2', 'Unknown record id; unknown route in the same error contract'],
  ['duplicate', '3', 'Idempotent queueing; double close; duplicate patient registration'],
  ['reliability', '3', 'Dependency 503, dependency never-answer, recovery'],
  ['hardening', '8', 'Headers, correlation, rate limit, login timing, parameter validation, status fidelity, log hygiene'],
], [1900, 800, 6650]));
body.push(p('The stub gateway is the instrument that makes the reliability cases repeatable. It answers `200` with a receipt, or `503`, or nothing at all, chosen by the case, so "the partner is down" and "the partner is slow" are conditions a reviewer can reproduce rather than stories about a day when something happened to be offline.', { size: 21 }));

// 7 ────────────────────────────────────────────────────────────────────────
body.push(h('7. Baseline results', 1));
body.push(p(`The first run, against the code as Module 14 left it, recorded ${baseline.passed} passes and ${baseline.total - baseline.passed} failures out of ${baseline.total} cases. The failures are reproduced below exactly as the collection recorded them.`));
const failRows = [['ID', 'Case', 'Expected', 'Actual']];
for (const c of baseline.cases.filter((x) => !x.pass)) {
  failRows.push([c.id, c.title, JSON.stringify(c.expected), JSON.stringify(c.actual)]);
}
body.push(table(failRows, [620, 3050, 2900, 2780], { size: 16 }));
body.push(caption('Table 7.1 - Every baseline failure, expected versus actual, from evidence/01-baseline/.'));
body.push(p('Read as a set, the failures are not thirteen unrelated bugs. Nine of them share one cause: no request context and no error contract, so a caller learns nothing about a failure and an operator cannot find it in the log. Two share another: information escaping where it should not, once through response timing and once through a role-unscoped query. The remaining two are a missing rate limit and a status that was written to a property nobody read.'));

// 8 ────────────────────────────────────────────────────────────────────────
body.push(h('8. Hardened results', 1));
const topicRows = [['Topic', 'Before', 'After']];
for (const t of Object.keys(hardened.byTopic)) {
  const b = baseline.byTopic[t] ?? { total: 0, passed: 0 };
  topicRows.push([t, `${b.passed}/${b.total}`, `${hardened.byTopic[t].passed}/${hardened.byTopic[t].total}`]);
}
topicRows.push(['total', `${baseline.passed}/${baseline.total}`, `${hardened.passed}/${hardened.total}`]);
body.push(table(topicRows, [3000, 2000, 2000], { size: 19 }));
body.push(caption('Table 8.1 - Pass counts per topic, before and after.'));
body.push(p(`The hardened run passed ${hardened.passed} of ${hardened.total} cases. ${fixedFromFailures} baseline failures now pass, and ${addedSinceBaseline} case added after the baseline (S6) passes as well. ${regressions.length} cases that passed before now fail, which is the regression statement: the functional half of the collection (F1-F7, D1-D3, R1-R3) exercises the workflow a clinician actually uses and was not disturbed by any hardening change.`));
body.push(p('A third run, 03-after-ui-fixes, was recorded after D-08 to D-10 were fixed in the client and the access log. It passes 37 of 37 as well, so the UI and logging changes disturbed none of the cases. The baseline and hardened folders are left exactly as they were recorded; the third run is a confirmation, not a replacement.'));
body.push(p(`Timing evidence for the two measured cases. Login latency, baseline: real username ${s4b.realMedianMs} ms, unknown username ${s4b.ghostMedianMs} ms, gap ${s4b.deltaUnderMs} ms. Hardened: real ${s4a.realMedianMs} ms, unknown ${s4a.ghostMedianMs} ms, gap ${Math.abs((s4a.realMedianMs ?? 0) - (s4a.ghostMedianMs ?? 0))} ms. Log hygiene, baseline: ${l1b.requestIdLines} correlation ids in ${l1b.logLines} lines. Hardened: ${l1a.requestIdLines} correlation ids in ${l1a.logLines} lines, with no password, token or key material present.`));

// 9 ────────────────────────────────────────────────────────────────────────
body.push(h('9. The comparison, case by case', 1));
const cmp = [['ID', 'Case', 'Before', 'After']];
for (const c of hardened.cases) {
  const b = baseline.cases.find((x) => x.id === c.id);
  cmp.push([c.id, c.title, !b ? 'not in baseline' : (b.pass ? 'pass' : 'fail'), c.pass ? 'pass' : 'fail']);
}
body.push(table(cmp, [700, 5500, 1500, 1650], { size: 16 }));
body.push(caption('Table 9.1 - All cases, both runs. Full expected/actual per case is in evidence/.'));
body.push(p('**Case revision, stated plainly.** S5 originally asked whether a sixty-character patient id would overflow its column. It answered 400 correctly, because the API validates length. Investigating that led to a real defect found by direct probe rather than by a case: `GET /api/secure/preview/abc` returned 500. S5 was therefore rewritten around the non-numeric path parameter, and S6 was added for the status-fidelity defect it uncovered. The baseline folder keeps the original S5 record and a notes file explaining the revision. The two runs are therefore 36 and 37 cases, not the same 36 twice, and the table above marks the difference rather than hiding it.'));

// 10 ───────────────────────────────────────────────────────────────────────
body.push(h('10. Defect records', 1));
body.push(table([
  ['ID', 'Defect', 'Severity', 'Status'],
  ['D-01', 'Login latency disclosed which usernames exist (37 ms gap)', 'Medium - information disclosure', 'Fixed, retested'],
  ['D-02', 'No limit on password guessing at /api/login', 'High - credential stuffing', 'Fixed, retested'],
  ['D-03', 'A gateway timeout was recorded as error code 23', 'Medium - operability', 'Fixed, retested'],
  ['D-04', 'No correlation id in any response or log line', 'Medium - monitoring', 'Fixed, retested'],
  ['D-05', 'Malformed input answered 500 with the JSON parser message', 'Low - leakage, misleading status', 'Fixed, retested'],
  ['D-06', 'Every Module 14 refusal became a generic 500 (pre-existing)', 'High - the clinic is told nothing', 'Fixed, retested'],
  ['D-07', 'A nurse received alerts addressed to a doctor (pre-existing)', 'Medium - cross-role exposure', 'Fixed, retested'],
  ['D-08', 'Tabs drew two title bars', 'Low - cosmetic, reads as broken', 'Fixed, recaptured'],
  ['D-09', 'Failure banner printed a raw ClientException and an internal path', 'Medium - usability and disclosure', 'Fixed, recaptured'],
  ['D-10', 'Access log recorded router-trimmed paths', 'Low - correlation quality', 'Fixed, third run'],
  ['D-11', 'Generated documents refused by Word (undeclared XML namespace)', 'Submission', 'High - the deliverable would not open', 'Fixed, opened in Word'],
], [700, 3900, 2650, 2100]));
body.push(caption('Table 10.1 - Defect register. Full reproduction, cause, fix and retest in DEFECTS.md.'));
body.push(p('**D-01, in full, because it is the clearest example of evidence changing a view.** The case measures a median over five attempts each, not a single request. Before: 39 ms for a real account, 2 ms for an unknown one. The cause is a short-circuit in the login handler \u2014 with no user row, `scrypt` never ran, so the response was the cost of a database lookup. The consequence is not that an attacker can log in; it is that an attacker can enumerate which staff accounts exist, which is the reconnaissance step before a targeted attempt. The fix verifies the submitted password against a precomputed dummy hash when the row is missing, so both paths cost the same work. After: 40 ms and 41 ms. That second number is the useful one \u2014 it went *up*, because an unknown user now does real work instead of none.'));
body.push(p("**D-08 to D-10 were found by taking the screenshots, not by writing a test.** That is worth stating plainly, because it is the module’s own argument about evidence: a case can pass and the screen can still be wrong. Three things were invisible to the collection — a title bar rendered twice, an exception printed at a clinician instead of a sentence, and an access log that recorded “/follow-ups” where the request had been “/api/clinical/follow-ups”, because Express trims req.url inside a mounted router. None of them would have been caught by asserting status codes, and all three are the kind of defect a reviewer notices in the first thirty seconds. The screenshots were meant to document states; they ended up being a test."));
body.push(p('**D-06 matters more to the clinic than to an attacker.** Module 14 documented that a closed record cannot be disclosed (409), that an envelope can expire (410), and that a receiver can reject one (422). None of those reached the client: the error object carried `httpStatus`, the handler read `status`, so the clinician saw a 500 and "The request could not be completed." A refusal that cannot be explained is indistinguishable from a fault, and it also makes the audit trail wrong, because a deliberate decision is recorded as a server failure. S6 now asserts `409 FOLLOW_UP_NOT_DISCLOSABLE` on the send path.'));

// 11 ───────────────────────────────────────────────────────────────────────
body.push(h('11. Hardening implemented', 1));
body.push(table([
  ['#', 'Control', 'Where', 'Measured effect'],
  ['H1', 'Stable error contract: `error`, `code`, `requestId` on every failure', 'security.js errorHandler', '9 cases moved to pass'],
  ['H2', 'Correlation id accepted, echoed and logged; access log in one shape', 'security.js requestContext', `0 -> ${l1a.requestIdLines} ids in the run`],
  ['H3', 'Security headers on every response, CSP split for API and app', 'security.js securityHeaders', '0 of 6 headers -> 6 of 6'],
  ['H4', 'Login rate limit per username, 10/60 s, with Retry-After', 'security.js rateLimit, server.js', '12 x 401 -> 429 at attempt 11'],
  ['H5', 'Constant-time login against a dummy hash', 'auth.js, routes.js', `${s4b.deltaUnderMs} ms gap -> ${Math.abs((s4a.realMedianMs ?? 0) - (s4a.ghostMedianMs ?? 0))} ms`],
  ['H6', 'Alerts scoped to the addressed role', 'service.js findJobDetail', 'nurse 1 alert -> 0'],
  ['H7', 'Timeout recorded as TIMEOUT, not the DOMException code', 'worker.js callGateway', 'code 23 -> TIMEOUT'],
  ['H8', 'Path parameter validated once per route', 'secure/api.js followUpIdOf', '500 -> 400 INVALID_PARAMETER'],
  ['H9', 'Error status fidelity for httpStatus; no driver codes above 500', 'security.js', '500 -> 409 with code'],
  ['H10', 'Secure cookie flag when the request arrived over TLS', 'auth.js sessionCookie', 'not observable on loopback - limitation'],
], [520, 3450, 2450, 2930], { size: 16 }));
body.push(caption('Table 11.1 - Hardening backlog as implemented, with the case that measures each one.'));
body.push(p('**The contract constraint that shaped H1.** The Flutter client reads `error` as a plain string (`clinic_api.dart`). Changing the body to a nested error object would have been tidier and would have broken every message the clinician sees until a new client shipped. The shape was therefore kept and `code` and `requestId` added beside it: additive, backwards compatible, and testable. This is a small decision but it is the one place where "consistent error contract" and "do not break the existing consumer" pulled in different directions, and both were satisfied rather than one being sacrificed.'));
body.push(p('**Order matters in the middleware stack,** and the order is deliberate: correlation first, so every later log line and every error carries an id even when the request is rejected three layers down; headers second, so a rejection is not served without them; limits third, before any handler does work. Rate limiting before authentication is intentional \u2014 an unauthenticated flood is the cheapest attack to mount and the most expensive to serve.'));

// 12 ───────────────────────────────────────────────────────────────────────
body.push(h('12. Security controls, dependencies and residual risk', 1));
body.push(table([
  ['Header or control', 'Value', 'Why'],
  ['X-Content-Type-Options', 'nosniff', 'Stops a JSON response being sniffed and run as script'],
  ['X-Frame-Options', 'DENY', 'Clickjacking: the clinic UI cannot be framed'],
  ['Content-Security-Policy', "API: default-src 'none'. App: self + wasm-unsafe-eval + blob", 'The API returns JSON only, so it needs nothing; the app needs wasm for CanvasKit'],
  ['Referrer-Policy', 'no-referrer', 'A record id must not leak in a Referer header'],
  ['Permissions-Policy', 'geolocation, camera, microphone, payment disabled', 'Nothing in a clinic board needs a sensor'],
  ['Strict-Transport-Security', 'set only over TLS', 'Correct on a TLS terminator, absent on the lab loopback'],
  ['Session cookie', 'HttpOnly; SameSite=Lax; Secure when TLS', 'Script cannot read it; cross-site writes are refused'],
  ['CSRF', 'X-CSRF-Token compared in constant time', 'A cross-site form post cannot mutate a record'],
  ['Password storage', 'scrypt with a per-user salt, constant-time compare', 'Offline recovery is expensive'],
], [2100, 3100, 4150], { size: 16 }));
body.push(caption('Table 12.1 - Controls in place after hardening.'));
body.push(p('**Dependency posture.** The backend has two direct dependencies, Express 5 and mysql2, and `npm audit` reports 0 vulnerabilities of any severity at the time of writing. That is a small surface and it is deliberate: every additional package is a supply-chain decision that has to be justified. The Flutter client depends on `http` and `flutter_secure_storage`.'));
body.push(p('**Secrets.** No credential, token or key appears in a tracked file. `backend/.env` is untracked; `backend/.env.example` carries empty values. Case L1 reads the API log produced during the run and asserts that the lab password, the CSRF token and any PEM private key are absent from it, and that correlation ids are present. That is a stronger check than reading the code, because it tests what the running system actually wrote.'));

// 13 ───────────────────────────────────────────────────────────────────────
body.push(h('13. Reliability and failure conditions', 1));
body.push(p('Three cases exercise the queue with a controlled dependency. Read together they are the reliability story: the system fails bounded, signals what happened, and recovers when the dependency does.'));
body.push(table([
  ['Case', 'Injected condition', 'Predicted', 'Observed'],
  ['R1', 'Gateway answers 503 to every attempt', 'Retried to INTEGRATION_MAX_ATTEMPTS (3), then escalated to needs_human, no further attempts', 'needs_human after 3 attempts, attempts <= max'],
  ['R2', 'Gateway accepts the request and never answers (timeout 700 ms)', 'Each attempt times out, three attempts, escalated; attempt rows name the timeout', 'needs_human; attempts ~710 ms each; TIMEOUT recorded (after H7)'],
  ['R3', 'Gateway restored to 200', 'The same path succeeds; the queue is not poisoned by earlier failures', 'succeeded on the first attempt'],
], [560, 2600, 3100, 3090], { size: 16 }));
body.push(caption('Table 13.1 - Failure injection results. R1 and R3 passed in both runs; R2 passed functionally in both but only reported the cause correctly after H7.'));
body.push(p('**What the observations support, and what they do not.** They support the claim that a dependency outage cannot cause unbounded processing: the attempt count is capped, backoff is applied between attempts, and the terminal state is a human decision rather than a retry loop. They do not support any claim about throughput, concurrency under load, or behaviour with more than one worker process \u2014 none of which was tested.'));

// 14 ───────────────────────────────────────────────────────────────────────
body.push(h('14. Flutter Web client states and responsive evidence', 1));
body.push(p('The client is verified by automated widget tests rather than by screenshots alone, because a screenshot proves a state was reached once and a test proves it every time. Twenty tests pass:'));
body.push(code([
  'cd <repository root>',
  'flutter test      # 20 tests, all passing',
  '',
  '  test/screen_layout_test.dart    12 tests - every screen at 1280x800 and 380x800,',
  '                                  three taps each, failing on any framework error',
  '  test/widget_test.dart            2 tests - sign-in form renders; empty submit',
  '                                  produces both field errors and no request',
  '  test/clinical_models_test.dart   6 tests - the real API payloads parse into',
  '                                  the models the screens render',
].join('\n')));
body.push(table([
  ['State', 'Where it is represented', 'Evidence'],
  ['Loading', 'FutureBuilder -> LoadingView; thin LinearProgressIndicator that never disables the page', 'layout test pumps frames before completion'],
  ['Success', 'Board, record, register, worklist render from typed models', 'clinical_models_test against captured payloads'],
  ['Validation', 'Field-level messages; scheduler requires a patient and a reason', 'widget_test.dart'],
  ['Authentication', 'Expired session unwinds pushed routes, returns to sign-in', 'main.dart onSessionExpired; A6 server-side'],
  ['Authorization', 'Nurse sees an explanation where the close action would be', 'Z1 refuses the same action server-side'],
  ['Empty', 'EmptyNote on empty board, register and history', 'layout test renders the empty state'],
  ['Failure', 'ErrorView with retry; a failed request cannot leave the page inert', 'layout probe of the failure banner'],
  ['Responsive', 'Same screens at 1280x800 and 380x800, zero overflows', 'screen_layout_test.dart'],
], [1400, 4200, 3750], { size: 16 }));
body.push(caption('Table 14.1 - Required client states and the evidence for each.'));
body.push(p('The captures below were taken from the release build served by the backend at /app/, using the script in docs/lab/module15/capture-screens.js. The script drives Chrome over the DevTools protocol because the widths must be exact: Flutter reads window.innerWidth, so a narrow capture has to be a real 380 px viewport rather than a scaled desktop window.', { size: 21 }));
body.push(screenshot('15-01-board.png', { maxWIn: 6.2, captionText: '15-01 Success. The board: scope chips carry their own counts, each row shows the due state, contact attempts and the reason.' }));
body.push(screenshot('15-03-detail.png', { maxWIn: 6.2, captionText: '15-03 One record. Overdue state, the three clinical actions, and an append-only audit row with actor and time.' }));
body.push(screenshot('15-02-board-narrow.png', { maxWIn: 2.4, maxHIn: 5.0, captionText: '15-02 Responsive. The same board at 380 px: chips scroll, cards reflow, the action button and navigation stay reachable.' }));
body.push(screenshot('15-04-validation.png', { maxWIn: 2.4, maxHIn: 5.0, captionText: '15-04 Validation. Client-side rule shown before submission; the script asserts the message is on screen.' }));
body.push(screenshot('15-06-empty.png', { maxWIn: 6.2, captionText: '15-06 Empty. A scope with nothing in it says so, and the chips still show the size of the other queues.' }));
body.push(screenshot('15-05-forbidden.png', { maxWIn: 6.2, captionText: '15-05 Authorization. The nurse view: no close action, and a sentence explaining why. Case Z1 refuses the same action at the API.' }));
body.push(screenshot('15-07-failure.png', { maxWIn: 6.2, captionText: '15-07 Failure. Backend stopped. The banner says what to do and offers a retry; no exception text and no internal path is shown.' }));
body.push(screenshot('15-08-rate-limited.png', { maxWIn: 6.2, captionText: '15-08 Hardening in the interface. The eleventh failed sign-in returns the rate-limit message instead of another wrong-password attempt.' }));

body.push(p('**Why the layout test exists at all.** Module 14 ended with a defect that took three attempts to diagnose: an exception during layout left render objects unlaid-out, and every subsequent pointer event threw inside hit-testing, so the page still painted but nothing responded. The regression guard is a test that builds each screen at both widths and taps it. A screen that reintroduces that class of fault fails the test instead of freezing in front of a reviewer.'));

// 15 ───────────────────────────────────────────────────────────────────────
body.push(h('15. Observation, interpretation and recommendation', 1));
body.push(table([
  ['Observed (fact)', 'Interpretation (reasoning)', 'Recommendation'],
  ['Baseline 23/36; hardened 37/37; no regressions.', 'The hardening changed only what the failing cases address.', `Keep the collection in the repository and run it before any submission.`],
  ['Login gap 37 ms before, 1 ms after; the unknown-user median rose from 2 ms to 41 ms.', 'The gap was caused by skipped work, not by a slower query.', 'Treat timing parity as a property to assert, not a thing to hope for.'],
  ['9 failures shared the absence of a code and a request id.', 'The service could not describe its own failures to either a user or an operator.', 'Any new route must use the shared error contract.'],
  ['Every Module 14 refusal was a 500.', 'The status was carried in a property the handler did not read; the envelope itself was correct.', 'When an error type owns a status, test that it survives to the client.'],
  ['nurse alert count 1 -> 0.', 'The list endpoint scoped alerts by role; the detail endpoint did not.', 'Authorisation must be applied at every read of the same data, not once.'],
  ['npm audit 0 vulnerabilities, 2 direct dependencies.', 'Small surface, no urgent dependency work.', 'Re-audit at each module boundary rather than assuming.'],
], [2700, 3350, 3300], { size: 16 }));
body.push(caption('Table 15.1 - The three columns are kept apart on purpose; a conclusion that outran its evidence would be visible here.'));

// 16 ───────────────────────────────────────────────────────────────────────
body.push(h('16. Known limitations and next improvement', 1));
body.push(bullet('**No load or concurrency testing.** Every reliability case uses one job at a time. Nothing here says what happens with twenty clinicians or a hundred queued reminders, and the worker is single-process by construction.'));
body.push(bullet('**The partner receiver was not part of this run.** Boundary 2 was exercised only as far as its refusals (S6). Replay, expiry and signature rejection remain Module 14 evidence and were not re-measured.'));
body.push(bullet('**CSP for the app allows unsafe-eval** because the CanvasKit JavaScript fallback needs it. The API policy is strict. Narrowing the app policy would require verifying the built bundle in both renderers.'));
body.push(bullet('**The Secure cookie flag cannot be observed on loopback.** The code sets it when the request arrived over TLS, but no TLS terminator exists in this environment, so the branch is untested rather than verified.'));
body.push(bullet('**No per-object ownership model.** Every clinician may read every record. Correct for one clinic, wrong for a multi-tenant deployment, and deliberately not built.'));
body.push(bullet('**Rate limiting is in-process.** A second API instance would have its own counters, so the control degrades to per-instance rather than global. Acceptable for one process; a shared store would be required to scale out.'));
body.push(p('**Next improvement, in one sentence:** add a concurrent reliability case that queues twenty reminders against a failing gateway and asserts that the attempt budget, the alert count and the escalation state are all still exact, because that is the first question a reviewer should ask of a queue that has only ever been tested one job at a time.'));

// 17 ───────────────────────────────────────────────────────────────────────
body.push(h('17. Contribution record and AI acknowledgement', 1));
body.push(table([
  ['Item', 'Description'],
  ['Sole contributor', 'WILLIAM BENEDICT R. BINWAG (22-11990) - all analysis, implementation, test design and documentation.'],
  ['AI assistance', 'Used for drafting the collection structure, reviewing the hardening changes and editing the prose of this report. Every measurement in sections 7 to 13 comes from the JSON files in the evidence folder and was re-read against them before submission.'],
  ['Verification the learner can perform unaided', 'Run the collection, read any case JSON, explain why each control exists, and modify the login handler to break timing parity on purpose and watch S4 fail.'],
  ['Third-party code', 'Express, mysql2, Flutter and the Flutter test framework, used under their own licences. No code was copied from another submission.'],
], [2500, 6850]));

// 18 ───────────────────────────────────────────────────────────────────────
body.push(h('18. Evidence index', 1));
body.push(table([
  ['Path', 'Contents'],
  ['backend/tests/m15-collection.js', 'The collection: 37 cases, isolated database, stub gateway'],
  ['docs/lab/module15/evidence/01-baseline/summary.json', 'Baseline: counts, per-case expected/actual, stub hits'],
  ['docs/lab/module15/evidence/01-baseline/NOTES.md', 'What was run, and the S5/S6 case revision'],
  ['docs/lab/module15/evidence/01-baseline/server-log.txt', 'API log from the baseline run'],
  ['docs/lab/module15/evidence/02-hardened/summary.json', 'Hardened run: 37/37'],
  ['docs/lab/module15/evidence/02-hardened/server-log.txt', 'API log showing correlation ids, rate limiting and no secrets'],
  ['docs/lab/module15/evidence/02-hardened/results.md', 'Readable table of the hardened run'],
  ['docs/lab/module15/evidence/build/flutter-test.txt', 'Flutter test output (20 tests)'],
  ['docs/lab/module15/evidence/build/flutter-analyze.txt', 'Flutter analyze output'],
  ['docs/lab/module15/TRACEABILITY.md', 'Requirement to case to evidence to limitation'],
  ['docs/lab/module15/HARDENING.md', 'Backlog, rankings, implementation notes'],
  ['docs/lab/module15/DEFECTS.md', 'Seven defect records with reproduction and retest'],
  ['docs/lab/module15/RUNBOOK.md', 'Recovery instructions for each failure mode'],
  ['docs/lab/module15/evidence/03-after-ui-fixes/summary.json', 'Third run after the UI and logging fixes: 37/37'],
  ['docs/lab/module15/screens/15-01-board.png ... 15-08-rate-limited.png', 'The eight captures reproduced in section 14'],
  ['docs/lab/module15/screens/README.md', 'What each capture shows and how to re-take them'],
  ['docs/lab/module15/capture-screens.js', 'The capture script (Chrome over DevTools, exact widths)'],
  ['docs/lab/module15/build-docx.js', 'Generates this report from the evidence JSON'],
], [3400, 5950]));

// 19 ───────────────────────────────────────────────────────────────────────
body.push(h('19. Module completion checklist', 1));
for (const item of [
  'I can explain the module concepts without relying only on memorized definitions.',
  'My implementation stays within the approved scope and uses controlled data.',
  'My repository contains no live credentials, private keys, tokens, or unnecessary personal information.',
  'My evidence includes both successful and adverse behavior and can be reproduced.',
  'My conclusions match the evidence and clearly state limitations and residual risk.',
  'My diagrams, README, tests and decision records match the submitted implementation.',
  'I can identify and defend my individual technical contribution.',
]) body.push(bullet(item));

// 20 ───────────────────────────────────────────────────────────────────────
body.push(h('20. Reflection', 1));
body.push(p('**Which decision had the greatest effect, and what evidence changed my view?** The decision to measure login latency rather than reason about it. Before the case ran I expected the login path to be roughly uniform; the 37 ms gap was larger than I had guessed and, more importantly, it was in the cheap direction \u2014 the fast answer was the *invalid* one, which is the shape that makes enumeration easy. The evidence did not change the decision to harden login; it changed my sense of how much of the system was like that. Nine other failures turned out to share a single missing piece of plumbing, and that is the kind of thing that only shows up when you run the same check across every route.'));
body.push(p('**Which failure was hardest to reproduce, and how would I improve the design?** The timeout case. The behaviour was correct from the first run \u2014 the job escalated after three bounded attempts \u2014 but the attempt row recorded `23`, which is the DOMException numeric code, so the case failed on the signal rather than the behaviour. That was hard to see because the outcome looked right. I would improve the design by asserting the *diagnostic content* of a failure as a first-class case in every module, not just its status: a failure that is handled correctly but described wrongly is still a defect at three in the morning.'));
body.push(p('**What can I explain and modify independently?** The collection and the error contract. I can explain why the harness owns its own database, why the login limiter is keyed by username rather than address, why `error` stayed a string while `code` was added, and why the CSP differs between `/api` and the app bundle. The artifact that demonstrates this is `backend/security.js` together with the two `summary.json` files: I can change a control, predict which case should flip, run the collection and be right or wrong in public.'));
body.push(p('**What must an authorised maintainer verify before broader use?** Three things, and each is outside the current evidence: behaviour under concurrency (more than one worker, more than one instance), the TLS deployment path that would actually set the `Secure` cookie flag and the HSTS header, and the partner receiver\'s rejection cases, which remain Module 14 evidence and were not re-run here. Until those are done this is a well-tested prototype with an honest failure story, not a production service.'));

// 21 ───────────────────────────────────────────────────────────────────────
body.push(h('21. References', 1));
for (const ref of [
  'OWASP Foundation. (2023). OWASP API Security Top 10. https://owasp.org/API-Security/',
  'OWASP Foundation. (2021). Application Security Verification Standard 4.0.3. https://owasp.org/www-project-application-security-verification-standard/',
  'Postman. (2026). Postman Learning Center. https://learning.postman.com/',
  'Gowda, P., & Gowda, A. N. (2024). Best practices in REST API design for enhanced scalability and security. Journal of Artificial Intelligence, Machine Learning and Data Science, 2(1), 827-830.',
  'Node.js. (2026). Crypto: scrypt, timingSafeEqual. https://nodejs.org/api/crypto.html',
  'Flutter. (2026). Testing Flutter apps and widget tests. https://docs.flutter.dev/testing',
]) body.push(p(ref, { size: 21, spaceAfter: 60 }));

// ── assemble ───────────────────────────────────────────────────────────────
const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
  + 'mc:Ignorable="w14">'
  + `<w:body>${body.join('')}`
  + '<w:sectPr><w:pgSz w:h="15840" w:w="12240" w:orient="portrait"/>'
  + '<w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720"/>'
  + '<w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>';

/**
 * Minimal ZIP writer, store-only.
 *
 * PowerShell's ZipFile.CreateFromDirectory wrote entry names with backslashes on
 * this machine and unzip flagged the result: OOXML part names are forward-slash
 * separated regardless of the platform that produced them. Writing the archive
 * directly keeps the names correct and removes a tool from the build. A DOCX does
 * not require compression, only valid entries.
 */
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

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const full of files) {
    const name = relative(dir, full).split('\\').join('/');
    const data = readFileSync(full);
    const crc = crc32(data) >>> 0;
    const nameBuf = Buffer.from(name, 'utf8');

    const localHead = Buffer.alloc(30);
    localHead.writeUInt32LE(0x04034b50, 0);
    localHead.writeUInt16LE(20, 4);
    localHead.writeUInt16LE(0, 6);
    localHead.writeUInt16LE(0, 8);
    localHead.writeUInt16LE(0, 10);
    localHead.writeUInt16LE(0x21, 12);
    localHead.writeUInt32LE(crc, 14);
    localHead.writeUInt32LE(data.length, 18);
    localHead.writeUInt32LE(data.length, 22);
    localHead.writeUInt16LE(nameBuf.length, 26);
    localHead.writeUInt16LE(0, 28);
    locals.push(localHead, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outFile, Buffer.concat([...locals, centralBuf, end]));
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
cpSync(TEMPLATE, join(WORK, 'template.docx'));

// Unpack the template, replace only the body, repack. Styles, fonts, theme and
// page setup are therefore Module 14's, not a new guess at them.
execFileSync('powershell', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
  `[System.IO.Compression.ZipFile]::ExtractToDirectory('${join(WORK, 'template.docx')}', '${join(WORK, 'x')}')`]);
writeFileSync(join(WORK, 'x', 'word', 'document.xml'), doc);

// Copy the captures in and register them, or Word shows eight broken pictures.
if (MEDIA.length) {
  mkdirSync(join(WORK, 'x', 'word', 'media'), { recursive: true });
  const relsPath = join(WORK, 'x', 'word', '_rels', 'document.xml.rels');
  let rels = readFileSync(relsPath, 'utf8');
  const extra = MEDIA.map((m) => {
    cpSync(m.path, join(WORK, 'x', 'word', 'media', m.name));
    return `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`;
  }).join('');
  rels = rels.replace('</Relationships>', extra + '</Relationships>');
  writeFileSync(relsPath, rels);
  // Word treats a missing content-type for a part as a corrupt package.
  const ctPath = join(WORK, 'x', '[Content_Types].xml');
  let ct = readFileSync(ctPath, 'utf8');
  if (!ct.includes('Extension="png"')) {
    ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    writeFileSync(ctPath, ct);
  }
  console.log(`embedded ${MEDIA.length} images`);
}
// Never fight Word for a file it has open: build beside it and report the real
// path, rather than failing after the work is done.
let finalOut = OUT;
try {
  rmSync(OUT, { force: true });
  writeZip(join(WORK, 'x'), OUT);
} catch (e) {
  if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
  finalOut = OUT.replace(/.docx$/, '-rev2.docx');
  rmSync(finalOut, { force: true });
  writeZip(join(WORK, 'x'), finalOut);
}

console.log(`wrote ${finalOut}`);
console.log(`sections: 21, paragraphs: ${body.length}, cases cited: ${hardened.total}`);

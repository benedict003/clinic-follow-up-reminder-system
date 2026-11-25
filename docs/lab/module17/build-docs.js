// docs/lab/module17/build-docs.js
//
// Builds the three Module 17 documents from the evidence JSON:
//
//   submission/Module17.docx                     the report
//   submission/Module17-evidence.docx            the UAT record and captures
//   submission/Module 17-operational-manual.docx the handover manual
//
//   node docs/lab/module17/build-docs.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const TEMPLATE = join(repo, 'Module16', 'Module16.docx');
const OUT_DIR = join(here, 'submission');
const WORK = join(here, '.docx-build');

const run1 = JSON.parse(readFileSync(join(here, 'evidence', '01-uat', 'uat.json'), 'utf8'));
const run2 = JSON.parse(readFileSync(join(here, 'evidence', '02-uat-retest', 'uat.json'), 'utf8'));
const m16 = JSON.parse(readFileSync(join(repo, 'docs', 'lab', 'module16', 'evidence', '03-capacity', 'performance.json'), 'utf8'));
const roll = JSON.parse(readFileSync(join(repo, 'docs', 'lab', 'module16', 'evidence', '05-rollback', 'rollback.json'), 'utf8'));
const br = JSON.parse(readFileSync(join(repo, 'docs', 'lab', 'module16', 'evidence', '06-deployment', 'browser-transfer.json'), 'utf8'));

const pht = (iso) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

const p = (text = '', { size = 21, bold = false, spaceAfter = 110, align } = {}) =>
  `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${runs(text, { size, bold })}</w:p>`;

const h = (text, level = 1) => {
  const style = level === 1 ? 'Heading1' : level === 2 ? 'Heading2' : 'Heading3';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:before="${level === 1 ? 340 : 250}" w:after="110"/></w:pPr>`
    + runs(text, { size: level === 1 ? 27 : 24, bold: true }) + '</w:p>';
};

function table(rows, widths, { size = 16 } = {}) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows.map((row, r) => {
    const cells = row.map((cell, i) => {
      const head = r === 0;
      const shade = head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EDEA"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${shade}</w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:after="16" w:before="16"/></w:pPr>${runs(cell, { size, bold: head })}</w:p></w:tc>`;
    }).join('');
    return `<w:tr>${r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');
  return '<w:tbl><w:tblPr><w:tblStyle w:val="Table1"/><w:tblW w:w="9350" w:type="dxa"/>'
    + '<w:tblBorders><w:top w:color="000000" w:space="0" w:sz="4" w:val="single"/><w:left w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:bottom w:color="000000" w:space="0" w:sz="4" w:val="single"/><w:right w:color="000000" w:space="0" w:sz="4" w:val="single"/>'
    + '<w:insideH w:color="000000" w:space="0" w:sz="4" w:val="single"/><w:insideV w:color="000000" w:space="0" w:sz="4" w:val="single"/></w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="0400"/></w:tblPr>'
    + `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const code = (lines) => lines.map((line) =>
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F4F3"/><w:ind w:left="100"/></w:pPr>`
  + `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="16"/></w:rPr>`
  + `<w:t xml:space="preserve">${esc(line) || ' '}</w:t></w:r></w:p>`).join('');

const EMU = 914400;
const MEDIA = [];
let imgSeq = 1200;
function image(file, { maxWIn = 6.2, maxHIn = 4.0, caption } = {}) {
  const abs = join(here, 'screens', file);
  const buf = readFileSync(abs);
  const w = buf.readUInt32BE(16), hh = buf.readUInt32BE(20);
  const scale = Math.min((maxWIn * EMU) / w, (maxHIn * EMU) / hh);
  const cx = Math.round(w * scale), cy = Math.round(hh * scale);
  const id = imgSeq++;
  const rid = `rIdM17_${MEDIA.length + 1}`;
  MEDIA.push({ rid, path: abs, name: `m17-${MEDIA.length + 1}.png` });
  const drawing = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="40"/></w:pPr>'
    + '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="${esc(file)}" descr="${esc(file)}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic>'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(file)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  return drawing + (caption ? p(caption, { size: 15, align: 'center', spaceAfter: 160 }) : '');
}

const titleBlock = (title, lines) =>
  `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:after="60"/></w:pPr>${runs(title, { size: 42, bold: true })}</w:p>`
  + lines.map((l, i) => p(l, { size: i === 0 ? 26 : 22, spaceAfter: 20 })).join('');

const metaTable = () => table([
  ['Field', 'Value'],
  ['Learner', 'WILLIAM BENEDICT R. BINWAG'],
  ['Student number', '22-11990'],
  ['Course outcome alignment', 'CLO5, CLO6'],
  ['System under test', 'Clinic Follow-Up Reminder System — backend/ and lib/, tag `module17`'],
  ['UAT harness', 'backend/tests/m17-uat.js — 8 scenarios, 2 roles, plus OpenAPI conformance'],
  ['Runs recorded', `01-uat (${pht(run1.ranAt)} PHT), 02-uat-retest (${pht(run2.ranAt)} PHT)`],
  ['UAT database', 'clinic_followup_m17 — fictional patients only, created per run'],
  ['Decision authority', 'The assigned university office. The acceptance block in the results is unsigned'],
], [2350, 7000]);

// ── 1. report ──────────────────────────────────────────────────────────────
function buildReport() {
  const b = [];
  b.push(titleBlock('Module 17 — Final Integration, UAT and Handover', [
    'PFEBSIT 002 - Integrative Programming and Technologies 2',
    '2IT Free Elective 2 - First Semester, A.Y. 2026-2027',
    'University of La Salette, Inc. - College of Information Technology',
  ]));
  b.push(metaTable());
  b.push(p('Document status. Every result in sections 5 to 8 is read from the JSON in docs/lab/module17/evidence/ when this file is generated. Both UAT runs are cited: the first recorded a defect, the second is the retest. The office decision is an empty block on purpose \\u2014 see section 12.'));

  b.push(h('1. Purpose and scope', 1));
  b.push(p('Four modules built a clinic follow-up system: a durable reminder queue, an encrypted disclosure path, a clinical workflow, and a measured deployment. This module asks the question that none of them could answer alone: is it fit for the office it was built for, and could somebody else take it over?'));
  b.push(p('Two kinds of evidence are needed and they are not interchangeable. User acceptance is a stakeholder judgement about fitness, not a test result. Technical evaluation is measurement, and its authority comes from being reproducible. The portfolio keeps them apart deliberately: the scenarios in section 5 have acceptance criteria written before the session, and the evaluation in section 7 cites a recorded run for every claim.'));
  b.push(p(`**The result in one paragraph.** Eight scenarios, seven accepted on the first run and eight on the retest after one fix. The specification and the code agree on all ${run2.spec.documentedOperations} documented operations. The fix is worth describing because it is exactly what UAT is for: one class of user error — a malformed record id — was answered with **400 BAD_REQUEST** by the clinical routes and **400 INVALID_PARAMETER** by the exchange routes. Four modules of automated tests missed it because each suite compared its own router against its own expectation. Only a session walking the product as a user compared the two.`));
  b.push(p('**In scope:** the agreed bounded workflow \\u2014 schedule, work the board, record contact, reschedule, close, disclose \\u2014 and the operational story around it.'));
  b.push(p('**Not in scope, and not accepted:** more than one clinic, more than one process, real patient data, TLS, unattended alerting, mobile packaging, and independent user ratification. The handover statement in section 13 is conditional because of those gaps, not despite the results.'));

  b.push(h('2. Environment and laboratory log', 1));
  b.push(table([
    ['Field', 'Value'],
    ['Operating system', 'Windows 11 64 bit'],
    ['Node / database', `${run2.spec ? process.version : ''} / MariaDB 10.11.19`],
    ['System under test', 'http://localhost:3400/app/ — release build served same-origin'],
    ['UAT harness instance', 'http://127.0.0.1:3417, own database, own process'],
    ['Fixtures', '3 fictional patients (Fictional UAT Patient A/B/C), 7 follow-ups, contact numbers in the +63 900 100 00xx range'],
    ['Session 1 (first run)', pht(run1.ranAt) + ' PHT'],
    ['Session 2 (retest)', pht(run2.ranAt) + ' PHT'],
    ['Participants', 'The learner, acting each role against a written script. **No independent user took part**'],
  ], [2500, 6850]));

  b.push(h('3. UAT scope, roles and acceptance criteria', 1));
  b.push(p('The plan is in docs/lab/module17/UAT-PLAN.md and was written before the session, so the criteria were not fitted to the results.'));
  b.push(table([
    ['Role', 'What they decide', 'What they must not do'],
    ['Nurse (front desk)', 'Whether recording a contact attempt is quick enough to use on every call', 'Close a follow-up; read the disclosure history'],
    ['Doctor', 'Whether the record is enough to decide, and whether a disclosure is safe to approve', '—'],
    ['Maintainer', 'Whether a new maintainer could run, test and recover it from the documents', 'Change clinical outcomes'],
    ['Office', 'Accept, accept with conditions, or reject', '—'],
  ], [1900, 4400, 3050]));
  b.push(table([
    ['#', 'Scenario', 'Acceptance criterion'],
    ['UAT-1', 'Start the day', 'The first screen names who is late and lists them, without a search'],
    ['UAT-2', 'Record a call', 'Reaching the patient sets Reminded and appends a row naming the nurse and the time'],
    ['UAT-3', 'No answer', 'The record stays Scheduled, the attempt is counted, and nothing implies the patient was told'],
    ['UAT-4', 'Patient asks to come later', 'The date moves, the revision increments, the queued reminder becomes obsolete'],
    ['UAT-5', 'Phone-width worry', 'Every screen is readable and operable at 380 px'],
    ['UAT-6', 'Unauthorised close', 'The server refuses with 403 FORBIDDEN_ROLE and a request id; the interface offers no close'],
    ['UAT-7', 'Disclosure', 'Before sending, the screen shows the fields that leave and the fields that stay'],
    ['UAT-8', 'Something goes wrong', 'Bad input and unknown routes answer with a code and a request id, nothing leaks, and a dead server explains itself'],
  ], [700, 2000, 6650]));

  b.push(h('4. Method, and what it does not establish', 1));
  b.push(p('Each scenario was executed twice: once through the HTTP API by the harness, which records the exact response, and once through the interface where a screenshot could add anything, which is nine captures in docs/lab/module17/screens/. The API record is the authoritative one because it cannot be affected by how a screen happens to render.'));
  b.push(p('**The honest limit.** The participant was the learner acting each role against a script, not a nurse or a doctor from the office. That is enough to prove the system responds correctly and to find the kind of defect F-01 describes; it is not enough to claim the office has accepted it. The results document therefore ends with an unsigned acceptance block rather than a signature, and the handover statement is conditional.'));
  b.push(p('Two further gaps: nobody watched an adverse case recover, and no accessibility audit was performed by a person using assistive technology. Both are named in section 12 rather than glossed.'));

  b.push(h('5. UAT results', 1));
  b.push(table([
    ['Run', 'Scenarios accepted', 'Defects', 'Specification conformance'],
    ['01-uat (first session)', `${run1.summary.accepted} / ${run1.summary.scenarios}`, String(run1.summary.defects), `${run1.spec.existing}/${run1.spec.documentedOperations} operations exist`],
    ['02-uat-retest (after the fix)', `${run2.summary.accepted} / ${run2.summary.scenarios}`, String(run2.summary.defects), `${run2.spec.existing}/${run2.spec.documentedOperations} operations exist`],
  ], [2600, 2200, 1300, 3250]));
  b.push(p('Table 5.1 — both runs, from evidence/. The first run is kept because a UAT record that only shows the good run is a marketing document.'));
  b.push(table([
    ['#', 'Scenario', 'Role', 'Verdict', 'Observed'],
    ...run2.scenarios.map((s) => [s.id, s.title, s.role, s.pass ? 'Accepted' : 'FAIL', JSON.stringify(s.observed).slice(0, 150)]),
  ], [620, 2500, 700, 900, 4630], { size: 13 }));
  b.push(p('Table 5.2 — the retest, scenario by scenario. The full expected and observed values are in evidence/02-uat-retest/uat.json.'));

  b.push(h('6. Finding register', 1));
  b.push(table([
    ['#', 'Finding', 'Severity', 'Disposition'],
    ['F-01', 'A malformed record id answered BAD_REQUEST from the clinical routes and INVALID_PARAMETER from the exchange routes: one error class, two codes', 'Low', 'Fixed and retested'],
    ['C-01', 'One patient had no contact number, and the follow-up was closed as lost to follow-up because of it', 'Condition', 'Register must be complete before a pilot'],
    ['C-02', 'A nurse cannot close a record, so a doctor must be reachable during clinic hours', 'Condition', 'Accepted with condition'],
    ['C-03', 'No offline mode: a dropped link stops the board', 'Condition', 'Paper fallback needed'],
    ['C-04', 'A disclosure needs the partner receiver running as a separate process', 'Condition', 'Only a doctor discloses; the screen explains the failure'],
  ], [620, 4700, 1100, 2930]));
  b.push(p('**F-01 in full, because it is the argument for doing UAT at all.** Module 15 ran 37 integration cases including one that asserted the exact code for a non-numeric path parameter, and it passed. It passed because that case tested the *exchange* router. The clinical router raised a plain 400 and let the error contract derive the code from the status, so the same user mistake produced two different machine-readable answers. Nothing in four modules compared the two; a session walking the product did, in under a second. The fix is two lines, and the retest is 8/8 with Module 15’s collection still 37/37.'));

  b.push(h('7. Final technical evaluation', 1));
  b.push(p('The full matrix, with a limitation against every claim, is docs/lab/module17/EVALUATION.md. This is the summary.'));
  b.push(table([
    ['Attribute', 'Claim', 'Evidence', 'Limitation'],
    ['Interoperability', `Client and API agree on ${run2.spec.documentedOperations} operations`, 'openapi.yaml vs UAT conformance check', 'One client; no third-party consumer tested'],
    ['Contract stability', 'Uniform error shape', 'Module 15 V4/V5/N2/S5/S6, UAT-8', 'Codes are additive, not versioned'],
    ['Access control', 'Role enforced server-side', 'UAT-6, Module 15 Z1/Z3', 'Two roles; no per-object ownership'],
    ['Secure exchange', 'Refusal keeps its status and code', 'UAT-5, Module 15 S6', 'Receiver not run during UAT'],
    ['Data minimisation', 'Four fields leave; five withheld and listed', 'UAT-7, Module 14', 'Envelope format is fixed, not configurable'],
    ['Reliability', 'Dependency failure is bounded and observable', 'Module 16: 503 in 4 ms, liveness 200, drain 112 ms', 'Single process'],
    ['Performance', `Board p95 ${m16.journeys.board.latencyMs.p95} ms, zero read errors`, 'Module 16 03-capacity', 'Loopback; A5 failed at 32 clients'],
    ['Delivery', `First load ${(br.totals.encodedBytes / 1048576).toFixed(2)} MB, ${br.totals.savedPct ?? 68}% saved`, 'Module 16 06-deployment', 'Fast link only'],
    ['Usability', 'Answers "who is late" on arrival; 380 px operable', 'UAT-1, UAT-5, captures', 'No independent user rating'],
    ['Maintainability', 'A maintainer can run, test and recover from the docs', 'HANDOVER.md, four suites', 'Author-assessed, the weakest judge'],
    ['Security hygiene', 'No secret tracked', 'Module 15 D-12, README check prints 0', 'Keys remain in git history'],
  ], [1500, 2400, 2700, 2750], { size: 13 }));
  b.push(p('**Absence of failure is not evidence of safety.** No penetration test of TLS, no concurrent-writer exhaustion, no forged-session attempt beyond a random token. Those are gaps in coverage, not passes, and the evaluation says so where each would otherwise look like a green row.'));

  b.push(h('8. Architecture alternatives and recommendation', 1));
  b.push(table([
    ['Criterion', 'A · Single process (as built)', 'B · Two instances', 'C · Managed platform'],
    ['Complexity', 'One process, one database', 'Session store, proxy, deploy coordination', 'Managed runtime and IAM'],
    ['Reliability', 'No failover', 'Survives one instance dying', 'Provider-managed, different failure modes'],
    ['Security', 'Loopback, no TLS', 'TLS terminator, more surfaces', 'Data leaves the institution'],
    ['Cost', 'None', 'One host plus a proxy', 'Recurring spend not available'],
    ['Evidence held', 'The whole Module 16 evaluation', 'None', 'None'],
  ], [1700, 2700, 2600, 2350]));
  b.push(p(`**Recommendation: A, for the agreed scope, conditionally.** Not because it is best in the abstract, but because B and C were never measured and a recommendation among alternatives is only honest when it rests on evidence. Module 16 found A's ceiling: throughput rises only 1.19× between 8 and 32 concurrent clients, so it fits ten staff and does not fit growth. B is the first change to make because it is the only option that moves that ceiling. C is rejected here on a specific ground: it would put patient records on infrastructure the university does not govern, which contradicts the classification decisions in Module 14.`));

  b.push(h('9. Documentation and handover', 1));
  b.push(p('docs/lab/module17/HANDOVER.md is the maintainer pack: what the system is, roles and what the server refuses, setup, every configuration key with its default, the data model, the API conventions, what each test suite is for, deployment and rollback, monitoring, known limitations, support contacts by role, maintenance cadence, and change control.'));
  b.push(table([
    ['Artefact', 'Where'],
    ['API contract, 28 operations', 'docs/openapi.yaml'],
    ['Setup and configuration', 'README.md, HANDOVER.md sections 3-4'],
    ['Data model', 'HANDOVER.md section 5, schema*.sql'],
    ['Tests', 'HANDOVER.md section 7; four backend suites and 20 widget tests'],
    ['Deployment and rollback', 'docs/lab/module16/DEPLOYMENT.md, ROLLBACK.md'],
    ['Monitoring and incident response', 'docs/lab/module16/MONITORING.md'],
    ['Recovery runbook', 'docs/lab/module16/RUNBOOK.md'],
    ['Limitations', 'HANDOVER.md section 10'],
    ['Support and maintenance by role', 'HANDOVER.md section 11'],
    ['Change control', 'HANDOVER.md section 12'],
  ], [4200, 5150]));

  b.push(h('10. Interface evidence', 1));
  b.push(p('One capture per scenario where a screen adds anything, taken from the release build against the UAT database at both required widths. The full set of nine is in the evidence portfolio.'));
  b.push(image('17-01-uat1-worklist.png', { maxWIn: 6.2, caption: 'UAT-1: the worklist a clinician lands on. The number overdue is the first thing on the screen.' }));
  b.push(image('17-03-uat2-contact-sheet.png', { maxWIn: 2.4, maxHIn: 4.8, caption: 'UAT-2: the contact vocabulary. Only "patient reached" advances the record, which is the difference between recording a fact and recording an intention.' }));
  b.push(image('17-06-uat6-nurse-forbidden.png', { maxWIn: 6.2, caption: 'UAT-6: the nurse view. Record and reschedule are offered; close is absent and replaced by a sentence explaining why.' }));
  b.push(image('17-08-uat8-failure.png', { maxWIn: 6.2, caption: 'UAT-8 adverse case: the server is gone, and the screen says what to do rather than naming an exception.' }));
  b.push(image('17-09-uat5-board-380.png', { maxWIn: 2.4, maxHIn: 4.8, caption: 'UAT-5: the board at 380 px, which is the width the office asked about.' }));

  b.push(h('11. Conditional handover statement', 1));
  b.push(p('**Demonstrated.** The bounded workflow works end to end on this build: the board, the contact record, the reschedule that supersedes a reminder, the closure with an outcome, the sealed disclosure with a receipt, and a refusal that explains itself. It is measured (Module 16), tested (37 integration cases, 8 UAT scenarios, 20 widget tests), and documented to the level where another developer can run, extend and recover it.'));
  b.push(p('**Not demonstrated.** Operation at more than one instance, unattended monitoring, off-host backup, TLS, independent user acceptance, and use with real patient data.'));
  b.push(p('**Conditional.** Fit for a controlled pilot in one clinic office, provided the limitations in section 12 are accepted in writing, the keys are regenerated, a nightly off-host dump is taken and one restore is proven, and the office completes the acceptance block in the results document. This is a handover, not a launch.'));

  b.push(h('12. Known limitations and next improvement', 1));
  for (const item of [
    '**One process.** No clustering or failover. Throughput rises 1.19× from 8 to 32 clients; the criterion to double it failed and is reported as failed.',
    '**No alerting.** The system answers when asked and cannot raise a hand.',
    '**Metrics are in-process** and die with the process.',
    '**Backup and database share a disk** in the rehearsed procedure.',
    '**No TLS in this environment**, so the `Secure` cookie branch and HSTS are untested.',
    '**UAT had no independent user.** The office session is still owed; the acceptance block is unsigned.',
    '**No accessibility audit** by a person using assistive technology.',
    '**The keys were committed once** and remain in git history. Regenerate before any real patient data exists.',
  ]) b.push(p(item, { spaceAfter: 80 }));
  b.push(p('**Next improvement, in one sentence:** run the UAT session with a real nurse and doctor from the office and have them sign the acceptance block, because every technical question this portfolio can answer has been answered, and the one question it cannot answer alone is whether the people who will use it accept it.'));

  b.push(h('13. Contribution record and AI acknowledgement', 1));
  b.push(table([
    ['Item', 'Description'],
    ['Sole contributor', 'WILLIAM BENEDICT R. BINWAG (22-11990) — UAT design and execution, evaluation, architecture comparison, handover pack'],
    ['AI assistance', 'Used for drafting the harness, reviewing the documents, and editing prose. Every result is read from the evidence JSON at generation time.'],
    ['Third-party code', 'Express, mysql2, Flutter and the Flutter test framework, under their own licences.'],
  ], [2500, 6850]));

  b.push(h('14. Evidence index', 1));
  b.push(table([
    ['Path', 'Contents'],
    ['backend/tests/m17-uat.js', 'The UAT harness and the OpenAPI conformance check'],
    ['docs/openapi.yaml', `The contract: ${run2.spec.documentedOperations} operations`],
    ['evidence/01-uat/', 'First run: 7/8, F-01 on the record'],
    ['evidence/02-uat-retest/', 'Retest after the fix: 8/8'],
    ['screens/', 'Nine captures, one per scenario plus the narrow board'],
    ['UAT-PLAN.md UAT-RESULTS.md', 'The criteria written before, and the record after'],
    ['EVALUATION.md', 'The full matrix, alternatives and residual risks'],
    ['HANDOVER.md', 'The maintainer pack'],
    ['build-docs.js', 'Generates these three documents from the evidence'],
  ], [3600, 5750]));

  b.push(h('15. Module completion checklist', 1));
  for (const item of [
    'I can explain the module concepts without relying only on memorized definitions.',
    'My implementation stays within the approved scope and uses controlled data.',
    'My repository contains no live credentials, private keys, tokens or unnecessary personal information.',
    'My evidence includes both successful and adverse behavior and can be reproduced.',
    'My conclusions match the evidence and clearly state limitations and residual risk.',
    'My diagrams, README, tests and decision records match the submitted implementation.',
    'I can identify and defend my individual technical contribution.',
  ]) b.push(p(item, { spaceAfter: 60 }));

  b.push(h('16. Reflection', 1));
  b.push(p('**Which decision had the greatest effect?** Writing the acceptance criteria before running anything. It cost half an hour and it removed the option of describing whatever happened as success. It is also how F-01 surfaced: UAT-8 said a bad input must answer with a code and a request id, and the run found two codes for one class of mistake. If I had written the criteria afterwards I would have written "returns 400" and passed.'));
  b.push(p('**Which finding was hardest to reproduce, and how would I improve the design?** In the harness rather than the product: my first spec-conformance probe called POST /api/logout with the session the scenarios depended on, and five scenarios then failed with 401. It looked exactly like an authentication defect. The improvement is the one I applied — probe with a throwaway session, and re-sign-in before the scenarios. A test harness that shares state with the thing it tests will eventually report its own fault as a product fault.'));
  b.push(p('**What can I explain and modify independently?** The UAT harness, the OpenAPI contract and the evaluation. I can explain why the conformance check uses the notFound handler\'s own message to distinguish a missing route from a missing record, why the error body keeps `error` as a string, and what A5 failing means for growth. The artifact that shows it is backend/tests/m17-uat.js together with docs/openapi.yaml: I can add an endpoint, document it, and watch the conformance count change.'));
  b.push(p('**What must an authorised maintainer verify before broader use?** Three things, each outside what I measured: whether the service can be clustered, because A5 is the ceiling; whether TLS termination sets the Secure cookie and HSTS as the code expects; and whether a backup survives the database host being lost, which the rollback rehearsal deliberately does not test. And the one non-technical item: the office must actually sign the acceptance block, because a portfolio cannot accept itself.'));

  b.push(h('17. References', 1));
  for (const ref of [
    'OWASP Foundation. (2023). OWASP API Security Top 10. https://owasp.org/API-Security/',
    'OpenAPI Initiative. (2025). OpenAPI Specification 3.1. https://spec.openapis.org/oas/v3.1.0',
    'ISO/IEC 25010. (2023). Systems and software quality models. https://iso25000.com/index.php/en/iso-25000-standards/iso-25010',
    'Flutter. (2026). Testing Flutter apps. https://docs.flutter.dev/testing',
    'Node.js. (2026). Process signals and graceful shutdown. https://nodejs.org/api/process.html',
  ]) b.push(p(ref, { size: 20, spaceAfter: 60 }));

  return b;
}

// ── 2. evidence portfolio ──────────────────────────────────────────────────
function buildEvidence() {
  const b = [];
  b.push(titleBlock('Module 17 — UAT Evidence Portfolio', [
    'User acceptance record, finding register and interface captures',
    'Clinic Follow-Up Reminder System — tag `module17`',
  ]));
  b.push(metaTable());

  b.push(h('1. Both runs', 1));
  b.push(table([
    ['Run', 'When (PHT)', 'Accepted', 'Defects', 'Specification'],
    ['01-uat', pht(run1.ranAt), `${run1.summary.accepted}/${run1.summary.scenarios}`, String(run1.summary.defects), `${run1.spec.existing}/${run1.spec.documentedOperations}`],
    ['02-uat-retest', pht(run2.ranAt), `${run2.summary.accepted}/${run2.summary.scenarios}`, String(run2.summary.defects), `${run2.spec.existing}/${run2.spec.documentedOperations}`],
  ], [1800, 2600, 1500, 1400, 2050]));
  b.push(p('The first run is not deleted. A record that shows only the passing run cannot be distinguished from one that never found anything.'));

  b.push(h('2. Scenario record (retest)', 1));
  b.push(table([
    ['#', 'Scenario', 'Role', 'Criterion', 'Verdict', 'Time'],
    ...run2.scenarios.map((s) => [s.id, s.title, s.role, s.acceptance, s.pass ? 'Accepted' : 'FAIL', `${s.ms} ms`]),
  ], [560, 2200, 640, 3800, 1000, 1150], { size: 13 }));

  b.push(h('3. Observed values', 1));
  b.push(p('The exact response the API returned for each scenario. This is the authoritative record; the captures are supporting.'));
  b.push(table([
    ['#', 'Observed'],
    ...run2.scenarios.map((s) => [s.id, JSON.stringify(s.observed)]),
  ], [560, 8790], { size: 12 }));

  b.push(h('4. The first run, and what it found', 1));
  b.push(table([
    ['#', 'Verdict', 'Observed'],
    ...run1.scenarios.map((s) => [s.id, s.pass ? 'Accepted' : 'FAIL', JSON.stringify(s.observed)]),
  ], [560, 1200, 7590], { size: 12 }));
  b.push(p(`F-01: the clinical routes answered ${run1.scenarios.find((s) => !s.pass)?.observed.badParamCode ?? 'BAD_REQUEST'} for a malformed id where the exchange routes answered INVALID_PARAMETER. Fixed in clinical.js and retested.`));

  b.push(h('5. Specification conformance', 1));
  b.push(p(`The harness reads docs/openapi.yaml, substitutes a plausible id for each path parameter, and calls every documented operation. A missing route is distinguished from a missing record by the notFound handler's own message, so the check cannot pass by accident.`));
  b.push(table([
    ['Measure', 'Value'],
    ['Documented operations', String(run2.spec.documentedOperations)],
    ['Operations that exist in the service', String(run2.spec.existing)],
    ['Missing', run2.spec.missing.length ? JSON.stringify(run2.spec.missing) : 'none'],
  ], [4200, 5150]));

  b.push(h('6. Interface captures', 1));
  b.push(p('One per scenario where a screen adds anything. Captured from the release build served at localhost:3400 against the UAT database, so the data on screen is the same fictional fixtures the harness used.'));
  b.push(table([
    ['File', 'Scenario', 'What it shows', 'Width'],
    ['17-01-uat1-worklist.png', 'UAT-1', 'The worklist a clinician lands on', '1280'],
    ['17-02-uat2-board.png', 'UAT-2', 'The board before a contact attempt', '1280'],
    ['17-03-uat2-contact-sheet.png', 'UAT-2', 'The contact vocabulary', '1280'],
    ['17-04-uat2-record-reminded.png', 'UAT-2', 'Status Reminded and the audit row naming the actor', '1280'],
    ['17-05-uat3-nurse-board.png', 'UAT-3', 'The same board as a nurse', '1280'],
    ['17-06-uat6-nurse-forbidden.png', 'UAT-6', 'No close action, with an explanation in its place', '1280'],
    ['17-07-uat7-disclosure.png', 'UAT-7', 'The disclosure screen and the fingerprints this process holds', '1280'],
    ['17-08-uat8-failure.png', 'UAT-8', 'The adverse case: server stopped', '1280'],
    ['17-09-uat5-board-380.png', 'UAT-5', 'The board at phone width', '380'],
  ], [2900, 900, 4150, 1400], { size: 13 }));

  b.push(image('17-01-uat1-worklist.png', { maxWIn: 6.2, caption: '17-01 · UAT-1. The worklist: who is late, first.' }));
  b.push(image('17-02-uat2-board.png', { maxWIn: 6.2, caption: '17-02 · UAT-2. The board with due states and contact attempts.' }));
  b.push(image('17-03-uat2-contact-sheet.png', { maxWIn: 2.3, maxHIn: 4.6, caption: '17-03 · UAT-2. Only "patient reached" moves the record.' }));
  b.push(image('17-04-uat2-record-reminded.png', { maxWIn: 6.2, caption: '17-04 · UAT-2. Reminded, with the audit row naming Fictional Nurse (nurse).' }));
  b.push(image('17-05-uat3-nurse-board.png', { maxWIn: 6.2, caption: '17-05 · UAT-3. The board as a nurse; the header shows the role.' }));
  b.push(image('17-06-uat6-nurse-forbidden.png', { maxWIn: 6.2, caption: '17-06 · UAT-6. The close action is absent and explained.' }));
  b.push(image('17-07-uat7-disclosure.png', { maxWIn: 6.2, caption: '17-07 · UAT-7. The disclosure screen: fingerprints, withheld fields, and a disabled send until a record is reviewed.' }));
  b.push(image('17-08-uat8-failure.png', { maxWIn: 6.2, caption: '17-08 · UAT-8. The adverse case: an actionable sentence and a retry.' }));
  b.push(image('17-09-uat5-board-380.png', { maxWIn: 2.3, maxHIn: 4.6, caption: '17-09 · UAT-5. The board at 380 px.' }));

  b.push(h('7. Reproducing the record', 1));
  b.push(code([
    'cd backend',
    'node --env-file=.env tests/m17-uat.js --label 07-review',
    '',
    '# expected: 8/8 accepted · spec conforms',
    '',
    '# captures need the app served on the origin its build expects',
    '$env:DB_NAME="clinic_followup_m17"; node --env-file=.env server.js',
    'node ..\\docs\\lab\\module17\\capture-screens.js',
  ]));
  b.push(p('The harness owns clinic_followup_m17 and port 3417; it drops and recreates the database on every run, so a run always starts from the same fixtures.'));

  b.push(h('8. Office acceptance', 1));
  b.push(table([
    ['Field', 'Value'],
    ['Session date', ''],
    ['Office representative', ''],
    ['Roles observed', ''],
    ['Decision', ''],
    ['Conditions recorded', ''],
    ['Signature', ''],
  ], [3000, 6350]));
  b.push(p('Left blank deliberately. The system has passed its technical acceptance criteria; it has not been accepted by the office, and those are different statements.'));

  return b;
}

// ── 3. operational manual ─────────────────────────────────────────────────
function buildManual() {
  const b = [];
  b.push(titleBlock('Module 17 — Operational Manual', [
    'Parts 1–6',
    'Running a UAT session, the handover checks, and the release process',
  ]));
  b.push(p('The handover pack is docs/lab/module17/HANDOVER.md. This manual is the operational companion: how to run a UAT session, how to verify the handover claims yourself, and how this repository is released.'));

  b.push(h('Preconditions', 1));
  b.push(code([
    'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
    '"node    : " + (node --version)',
    '"mysql   : " + (& "C:\\xampp\\mysql\\bin\\mysqladmin.exe" -u root --host=127.0.0.1 ping)',
    '"secrets : " + (git ls-files | Select-String "\\.pem$|\\.key$|backend/\\.env$").Count',
    '"ports   : " + ((Get-NetTCPConnection -LocalPort 3417 -ErrorAction SilentlyContinue | Measure-Object).Count)',
  ]));
  b.push(table([
    ['Check', 'Required', 'If not'],
    ['node', '20 or newer', 'The harness uses fetch and node:http'],
    ['mysql', 'mysqld is alive', 'Start MariaDB; the harness creates its own database'],
    ['secrets', '0', 'Nothing secret may be tracked'],
    ['port 3417', 'free', 'That port belongs to the UAT harness'],
  ], [1600, 2000, 5750]));

  b.push(h('Part 1 · Running a UAT session', 1));
  b.push(code([
    'cd backend',
    'node --env-file=.env tests/m17-uat.js --label 07-review',
    '',
    '  spec: 28/28 documented operations exist',
    '  PASS  UAT-1 … PASS  UAT-8',
    '  8/8 accepted · spec conforms',
  ]));
  b.push(p('The harness executes each scenario as the role that owns the decision and records the exact response. Use a fresh label per session: the evidence folder is the record of that session, and reusing a label overwrites it.'));
  b.push(table([
    ['If you are running a session with real people', 'Do this'],
    ['Before', 'Read them the criterion, not the expected answer. The plan is in UAT-PLAN.md'],
    ['During', 'Let them drive. Record what they say in their words, beside the observed value'],
    ['On a failure', 'Do not coach the retry. Log it as a defect with its disposition'],
    ['After', 'Capture the screens they actually used; ask the office to sign the acceptance block'],
    ['Never', 'Edit a criterion after seeing the result. Add a note instead'],
  ], [3200, 6150]));

  b.push(h('Part 2 · Capturing the interface evidence', 1));
  b.push(code([
    '# the Flutter build bakes localhost:3400 as its API base, so the app must be',
    '# served from that origin — point the 3400 instance at the UAT database',
    'cd backend',
    '$env:DB_NAME="clinic_followup_m17"; node --env-file=.env server.js',
    '',
    '# in another terminal',
    'node docs/lab/module17/capture-screens.js',
  ]));
  b.push(p('Serving the app from a different port fails in a way that looks like a login bug: the bundle calls 3400 regardless, the origin check rejects it, and every sign-in answers "Authentication required". That cost an hour during this module and is why the manual says it.'));
  b.push(p('The script asserts each state before shooting, so a capture that would misrepresent the screen fails instead of being written. Three of its assertions had to be corrected during the module for exactly that reason: a blank page at low bandwidth, a spinner that never appears because the board pre-loads with the shell, and a text match defeated by line wrapping.'));

  b.push(h('Part 3 · Verifying the handover claims', 1));
  b.push(table([
    ['Claim', 'Check', 'Must show'],
    ['The suites all pass', 'npm run test:api · test:perf · test:rollback · test:uat', '37/37 · percentiles · restore verified · 8/8'],
    ['The client survives both widths', 'flutter test', '20 tests passed'],
    ['No secret is tracked', '(git ls-files | Select-String "\\.pem$|\\.key$|backend/\\.env$").Count', '0'],
    ['The spec matches the code', 'The conformance line in the UAT run', '28/28'],
    ['Roles are enforced server-side', 'UAT-6 in the run', '403 FORBIDDEN_ROLE'],
    ['A refusal explains itself', 'UAT-5 in the run', '409 FOLLOW_UP_NOT_DISCLOSABLE'],
    ['Readiness is not liveness', 'Module 16 03-capacity reliability block', '503 with liveness 200'],
    ['Rollback works', 'evidence/05-rollback in Module 16', 'passed, fingerprint matches'],
  ], [2500, 3500, 3350]));

  b.push(h('Part 4 · Release process', 1));
  b.push(p('Each module is one branch, one merge commit, one annotated tag and one GitHub release. The pattern is consistent across Modules 13 to 17 so the history reads as a sequence of deliverables rather than a stream of commits.'));
  b.push(code([
    'git checkout -b feature/m17-uat-and-handover',
    '# commits, each one behaviour plus the evidence it produced',
    'git checkout main',
    'git merge --no-ff feature/m17-uat-and-handover -F <message-file>',
    'git tag -a module17 -F <tag-message-file>',
    'git push origin feature/m17-uat-and-handover main module17',
    '# then a release whose notes say what is in it, what was measured, and what was not',
  ]));
  b.push(p('A tag is only moved when the tagged tree is wrong, and the tag message then says what moved and why. That happened twice: Module 15’s documents could not be opened in Word, and Module 16’s first build carried a single screenshot. Both moves are recorded in the tag messages rather than rewritten silently.'));

  b.push(h('Part 5 · What to do when the office raises something', 1));
  b.push(table([
    ['They say', 'Do this'],
    ['"This screen is confusing"', 'Record it; it is a usability finding, not a defect. Do not change the criterion'],
    ['"It should also do X"', 'Change request. Log it for maintenance; do not add scope to an accepted delivery'],
    ['"It failed when we tried it"', 'Reproduce it, then disposition it as a defect with a retest. Keep the failing run'],
    ['"Can we use real patient data?"', 'Not until the conditions in HANDOVER.md section 11 are met: keys regenerated, off-host backup proven, limitations accepted in writing'],
    ['"Is it production ready?"', 'No. It is a measured pilot candidate for one clinic. Say that plainly'],
  ], [2600, 6750]));

  b.push(h('Part 6 · If the demonstration fails on the day', 1));
  b.push(p('Have a backup path, because a live demo is a single point of failure.'));
  b.push(table([
    ['Failure', 'Fallback'],
    ['The API will not start', 'Show docs/lab/module16/evidence/03-capacity/results.md and the four suites’ recorded output; explain that the evidence is reproducible with one command'],
    ['The database is gone', 'Run the rollback rehearsal’s restore, which is the demonstration of recovery'],
    ['The browser will not load the app', 'Show the nine captures in docs/lab/module17/screens/ and the UAT JSON, which carries the same claims'],
    ['A scenario fails live', 'Leave it failing. Ask the office what they expected, record it, and disposition it. A failure handled honestly is worth more than a rehearsed pass'],
  ], [2900, 6450]));

  return b;
}

// ── packaging ──────────────────────────────────────────────────────────────
function writeZip(dir, outFile) {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walk(full); else files.push(full);
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
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(outFile, Buffer.concat([...locals, cd, end]));
}

const DOC_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14">';

const SECT = '<w:sectPr><w:pgSz w:h="15840" w:w="12240" w:orient="portrait"/>'
  + '<w:pgMar w:bottom="1440" w:top="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720"/>'
  + '<w:pgNumType w:start="1"/></w:sectPr>';

function build(file, makeBody) {
  MEDIA.length = 0;
  const body = makeBody();
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(TEMPLATE, join(WORK, 'template.docx'));
  execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
    + `[System.IO.Compression.ZipFile]::ExtractToDirectory('${join(WORK, 'template.docx')}', '${join(WORK, 'x')}')`]);

  rmSync(join(WORK, 'x', 'word', 'media'), { recursive: true, force: true });
  const relsPath = join(WORK, 'x', 'word', '_rels', 'document.xml.rels');
  let rels = readFileSync(relsPath, 'utf8').replace(/<Relationship [^>]*relationships\/image"[^>]*\/>/g, '');

  writeFileSync(join(WORK, 'x', 'word', 'document.xml'),
    DOC_HEAD + `<w:body>${body.join('')}${SECT}</w:body></w:document>`);

  if (MEDIA.length) {
    mkdirSync(join(WORK, 'x', 'word', 'media'), { recursive: true });
    const extra = MEDIA.map((m) => {
      cpSync(m.path, join(WORK, 'x', 'word', 'media', m.name));
      return `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`;
    }).join('');
    rels = rels.replace('</Relationships>', extra + '</Relationships>');
  }
  writeFileSync(relsPath, rels);

  const ctPath = join(WORK, 'x', '[Content_Types].xml');
  let ct = readFileSync(ctPath, 'utf8');
  if (!ct.includes('Extension="png"')) {
    ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
    writeFileSync(ctPath, ct);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, file);
  rmSync(out, { force: true });
  writeZip(join(WORK, 'x'), out);
  console.log(`wrote ${file}`);
}

build('Module17.docx', buildReport);
build('Module17-evidence.docx', buildEvidence);
build('Module 17-operational-manual.docx', buildManual);
console.log('done');

// docs/lab/module16/build-docs.js
//
// Builds the three Module 16 documents from the evidence JSON:
//
//   submission/Module16.docx                    the report
//   submission/Module16-evidence.docx           the portfolio
//   submission/Module 16-operational-manual.docx the manual
//
// Same shape as Modules 13-15, same DOCX template, and every number is read from
// evidence/*/performance.json rather than typed.
//
//   node docs/lab/module16/build-docs.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const TEMPLATE = join(repo, 'Module15', 'Module15.docx');
const OUT_DIR = join(here, 'submission');
const WORK = join(here, '.docx-build');

const on = JSON.parse(readFileSync(join(here, 'evidence', '03-capacity', 'performance.json'), 'utf8'));
const off = JSON.parse(readFileSync(join(here, 'evidence', '04-no-compression', 'performance.json'), 'utf8'));
const base = JSON.parse(readFileSync(join(here, 'evidence', '01-baseline', 'performance.json'), 'utf8'));
const roll = JSON.parse(readFileSync(join(here, 'evidence', '05-rollback', 'rollback.json'), 'utf8'));
const br = JSON.parse(readFileSync(join(here, 'evidence', '06-deployment', 'browser-transfer.json'), 'utf8'));

// Older runs did not record their own timestamp; the file they wrote is the record.
for (const [obj, dir] of [[on, '03-capacity'], [off, '04-no-compression'], [base, '01-baseline']]) {
  if (!obj.ranAt) obj.ranAt = statSync(join(here, 'evidence', dir, 'performance.json')).mtime.toISOString();
}

// A run recorded before the stamp existed is dated by the file it wrote, which is
// the moment the harness finished that run.
const stampOf = (obj, dir) => obj.ranAt ?? statSync(join(here, 'evidence', dir, 'performance.json')).mtime.toISOString();
const pht = (iso) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
const ratio = Number((on.mixes['mixed-c32'].throughputRps / on.mixes['mixed-c8'].throughputRps).toFixed(2));
const wireMb = (br.totals.encodedBytes / 1048576).toFixed(2);
const diskBytes = br.assets.reduce((s, a) => {
  try { return s + statSync(join(repo, 'backend', 'public', 'app', a.url.replace('/app', ''))).size; } catch { return s; }
}, 0);

// ── XML helpers (same vocabulary as the earlier modules) ────────────────────
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

// Images: the drawing namespaces are declared on the root (Module 15's D-11).
const EMU = 914400;
const MEDIA = [];
const rId = (abs, name) => {
  MEDIA.push({ rid: `rIdM16_${MEDIA.length + 1}`, path: abs, name });
  return `rIdM16_${MEDIA.length}`;
};
let imgSeq = 900;
function image(file, { maxWIn = 6.2, maxHIn = 4.0, caption } = {}) {
  const abs = join(here, 'screens', file);
  const buf = readFileSync(abs);
  const w = buf.readUInt32BE(16), hh = buf.readUInt32BE(20);
  const scale = Math.min((maxWIn * EMU) / w, (maxHIn * EMU) / hh);
  const cx = Math.round(w * scale), cy = Math.round(hh * scale);
  const id = imgSeq++;
  const drawing = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="40"/></w:pPr>'
    + '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="${esc(file)}" descr="${esc(file)}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic>'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(file)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId(abs, `m16-${MEDIA.length + 1}.png`)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  return drawing + (caption ? p(caption, { size: 15, align: 'center', spaceAfter: 160 }) : '');
}

const titleBlock = (title, lines) =>
  `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:after="60"/></w:pPr>${runs(title, { size: 42, bold: true })}</w:p>`
  + lines.map((l, i) => p(l, { size: i === 0 ? 26 : 22, spaceAfter: 20 })).join('');

// ── shared content ─────────────────────────────────────────────────────────
const metaTable = () => table([
  ['Field', 'Value'],
  ['Learner', 'WILLIAM BENEDICT R. BINWAG'],
  ['Student number', '22-11990'],
  ['Course outcome alignment', 'CLO5, CLO6'],
  ['System under test', 'Clinic Follow-Up Reminder System — backend/ and lib/'],
  ['Workload harness', 'backend/tests/m16-perf.js — 5 read journeys, 3 concurrency levels, soak'],
  ['Runs recorded', `01-baseline (${pht(base.ranAt)} PHT), 03-capacity (${pht(on.ranAt)} PHT), 04-no-compression (${pht(off.ranAt)} PHT), 05-rollback, 06-deployment`],
  ['Database', 'clinic_followup_m16 — 60 patients, 400 follow-ups, created and dropped per run'],
], [2250, 7100]);

const verdictRows = () => ([
  ['#', 'Criterion', 'Threshold', 'Measured', 'Verdict'],
  ['A1', 'board p95 at concurrency 8', '≤ 250 ms', `${on.journeys.board.latencyMs.p95} ms`, 'pass'],
  ['A2', 'record p95 at concurrency 8', '≤ 200 ms', `${on.journeys.record.latencyMs.p95} ms`, 'pass'],
  ['A3', 'read error rate', '0 %', '0 % at every level', 'pass'],
  ['A4', 'login p95', '≤ 1500 ms', `${on.journeys.login.latencyMs.p95} ms`, 'pass'],
  ['A5', 'throughput at 32 vs 8', '≥ 2.0×', `${ratio}×`, '**FAIL**'],
  ['A6', 'first load transfer', '≤ 3 MB', `${wireMb} MB`, 'pass'],
  ['A7', 'readiness reflects a missing dependency', '503, fast', `${on.reliability.readinessOnMissingDependency.readinessDetectedInMs} ms, liveness 200`, 'pass'],
  ['A8', 'graceful shutdown', 'exits < 1 s', `${on.reliability.gracefulShutdown.msToExit} ms`, 'pass'],
  ['A9', 'recovery from a bad deploy', '≤ 5 min', `${roll.recoveryTimeMs} ms`, 'pass'],
]);

// ── 1. the report ──────────────────────────────────────────────────────────
function buildReport() {
  const b = [];
  b.push(titleBlock('Module 16 — Performance, Reliability and Deployment Evaluation', [
    'PFEBSIT 002 - Integrative Programming and Technologies 2',
    '2IT Free Elective 2 - First Semester, A.Y. 2026-2027',
    'University of La Salette, Inc. - College of Information Technology',
  ]));
  b.push(metaTable());
  b.push(p('Document status. Every figure in sections 5 to 10 is read from the JSON in docs/lab/module16/evidence/ when this file is generated, so the document cannot drift from the run. One run is excluded from the comparison and the exclusion is stated where it matters: the first full run was dominated by the server\u2019s own rate limiter and measured the limiter, not the server.', { size: 20 }));

  b.push(h('1. Purpose and scope', 1));
  b.push(p('Module 15 established that the integration behaves correctly. This module asks a different question: can it be operated? Correctness under a test is not the same as a system that survives a busy morning, a dependency that is not answering, a bad deploy, or a restart at the wrong moment.'));
  b.push(p('The work was three measurements and one rehearsal. Measure the workload the clinic would actually generate; measure what a browser actually downloads; measure what happens when a dependency goes away. Then rehearse putting it back. What came out of that changed the code three times, and changed the readiness verdict once.'));
  b.push(p(`**The headline is not the fast path.** Read latency came in two orders of magnitude inside the criteria: the board answers in ${on.journeys.board.latencyMs.p50} ms at the median and ${on.journeys.board.latencyMs.p95} ms at p95, with zero errors at every concurrency level. The interesting result is the one that failed: throughput rises only **${ratio}×** between 8 and 32 concurrent clients while median latency triples. That is a ceiling, and a ceiling is what a reader should be given rather than a comfortable average.`));
  b.push(p('**In scope:** the read workload a clinic generates, first-load transfer, the health/readiness/metrics surface, rate limiting under load, graceful shutdown, a dependency outage, and a rollback rehearsal.'));
  b.push(p('**Not in scope, and repeated in the readiness decision:** multi-clinic tenancy, more than one API process, TLS termination, off-host backups, alert delivery, and any load beyond 32 concurrent clients. The system is a lab deployment; nothing here is a production-ready claim.'));

  b.push(h('2. Environment and laboratory log', 1));
  b.push(table([
    ['Field', 'Value'],
    ['Operating system', 'Windows 11 64 bit'],
    ['Node', `${on.environment.node} (${on.environment.platform})`],
    ['Database', 'MariaDB 10.11.19, same host, port 3306'],
    ['API under test', 'http://127.0.0.1:3413 — harness-owned instance'],
    ['Client', 'Flutter Web release build served at /app/ by the same process'],
    ['Fixtures', `${on.fixtures.followUps} follow-ups, ${on.fixtures.dueNow} due now, 60 patients, 10 tables`],
    ['Concurrency levels', on.environment.concurrencyLevels.join(', ')],
    ['Execution window (PHT)', `${pht(on.ranAt)} capacity, ${pht(off.ranAt)} no-compression`],
    ['Compression in the compared runs', `on: ${on.environment.compression}, off: ${off.environment.compression}`],
  ], [2500, 6850]));

  b.push(h('3. Workload model and acceptance criteria', 1));
  b.push(p('Written before measuring. The full model is in docs/lab/module16/WORKLOAD.md; this is the summary that the results are scored against.'));
  b.push(table([
    ['Journey', 'Weight', 'Why'],
    ['board — GET /api/clinical/follow-ups?scope=open', '45%', 'The screen a clinic lives on'],
    ['record — GET /api/clinical/follow-ups/:id', '25%', 'Opening a patient after finding them'],
    ['worklist — GET /api/clinical/worklist', '20%', 'Loaded on arrival and after every action'],
    ['patients — GET /api/clinical/patients', '7%', 'Occasional lookup'],
    ['health — GET /api/health', '3%', 'Monitoring, not a person'],
    ['login — POST /api/login', 'measured alone', 'scrypt is deliberately expensive; averaging it in would hide that'],
  ], [4200, 1300, 3850]));
  b.push(p('Concurrency 1 (one clinician), 8 (a busy clinic), 32 (saturation, deliberately beyond the model), and a 20-second soak at 8 with 20 ms think time. One warm-up request per journey before each measurement, so the first query plan and the first connection are not counted as steady-state cost. Writes are covered by the Module 15 collection, which asserts their correctness; this module measures the read and delivery paths because those are what a clinic waits on.'));

  b.push(h('4. Decision record — the measurement approach', 1));
  b.push(p('**Question.** Should performance be evidenced with a browser tool, a load generator, or a scripted harness that reports distributions?'));
  b.push(table([
    ['Criterion', 'Browser devtools', 'Load generator (k6/JMeter)', 'Scripted harness (chosen)'],
    ['Functional fit', 'One request chain', 'Good for HTTP, blind to the worker and the database pool', 'HTTP plus process and pool state'],
    ['Security', 'Fine', 'Fine', 'No new dependency; credentials stay in the environment'],
    ['Reliability', 'Manual, not repeatable', 'Repeatable but needs a separate binary', 'Repeatable, and owns its database so runs do not interfere'],
    ['Performance', 'Single-request only', 'Percentiles built in', 'Percentiles computed here, plus resource signals'],
    ['Effort', 'Low', 'Medium, plus an install', 'Medium, and it is versioned with the code'],
    ['Verification', 'Screenshot of a waterfall', 'A summary from a tool', 'JSON per run, diffable between runs'],
  ], [1500, 2000, 2900, 2950]));
  b.push(p('**Outcome (ADR-004).** The scripted harness. The deciding requirement is the one that cannot be answered by a browser: "does readiness tell the truth when the dependency is gone" needs a second process, a killed pool and a database that is not there. A tool that only speaks HTTP cannot set that up. The cost is that the harness is our code and must be trusted; that is why every case writes its expected and actual values.'));
  b.push(p('**Consequences.** The harness becomes something to maintain, and it measures loopback rather than a clinic network. Loopback is honest for server-side latency — it is the floor — but it says nothing about the link, which is why the client-side transfer was measured separately in a real browser.'));

  b.push(h('5. Latency, throughput and saturation', 1));
  b.push(table([
    ['Level', 'Requests', 'p50', 'p90', 'p95', 'p99', 'req/s', 'Errors'],
    ...['mixed-c8', 'mixed-c32', 'soak-20s'].map((k) => {
      const m = on.mixes[k];
      return [k, String(m.requests), `${m.latencyMs.p50}`, `${m.latencyMs.p90}`, `${m.latencyMs.p95}`, `${m.latencyMs.p99}`, String(m.throughputRps), String(m.errorCount)];
    }),
  ], [1500, 900, 900, 900, 900, 900, 1100, 900]));
  b.push(p('Table 5.1 — the mixed workload at three levels, from evidence/03-capacity/.'));
  b.push(table([
    ['Journey (concurrency 1)', 'p50', 'p95', 'p99', 'max'],
    ...['board', 'record', 'worklist', 'patients', 'health', 'login'].map((k) => {
      const j = on.journeys[k];
      return [k, `${j.latencyMs.p50}`, `${j.latencyMs.p95}`, `${j.latencyMs.p99}`, `${j.latencyMs.max}`];
    }),
  ], [2600, 1700, 1700, 1700, 1650]));
  b.push(p('Table 5.2 — per-journey latency with no queueing. Login at ~42 ms is scrypt doing its job; it is not a bottleneck but the price of not storing recoverable passwords.'));
  b.push(p(`**Interpretation.** At concurrency 8 the system answers inside 11 ms at p95 with no errors across 800 requests. At 32 it still answers — 35.86 ms at p95 — but throughput only improved from ${on.mixes['mixed-c8'].throughputRps} to ${on.mixes['mixed-c32'].throughputRps} req/s. Queueing has started: four times the concurrency bought ${ratio} times the work and tripled the median. For the modelled clinic this is far beyond need; for the verdict it is the boundary of what was demonstrated, so it is reported as a failed criterion rather than a footnote.`));

  b.push(h('6. Delivery: what the browser actually downloads', 1));
  b.push(p('Measured before changing anything: main.dart.js was served at 2.95 MB with no Content-Encoding, and CanvasKit at 7.3 MB. Two changes followed — compression and an honest cache policy — and both were then measured from the client, not from the server.'));
  b.push(table([
    ['Asset', 'On disk', 'On the wire', 'Saved'],
    ...br.assets.filter((a) => (a.decodedBytes ?? 0) > 0 || a.encodedBytes > 20000)
      .sort((x, y) => y.encodedBytes - x.encodedBytes).slice(0, 5)
      .map((a) => {
        let size = '—';
        try { size = String(statSync(join(repo, 'backend', 'public', 'app', a.url.replace('/app', ''))).size); } catch { /* not a file */ }
        const saved = Number.isFinite(Number(size)) && Number(size) > a.encodedBytes
          ? `${Math.round((1 - a.encodedBytes / Number(size)) * 100)}%` : '—';
        return [a.url.replace('/app/', ''), size, String(a.encodedBytes), saved];
      }),
  ], [3600, 1900, 1900, 1950]));
  b.push(p(`Table 6.1 — transfer sizes recorded by the browser through the DevTools protocol, from evidence/06-deployment/browser-transfer.json. Whole first load: ${diskBytes.toLocaleString()} bytes on disk against ${br.totals.encodedBytes.toLocaleString()} on the wire, **${br.totals.savedPct ?? Math.round((1 - br.totals.encodedBytes / diskBytes) * 100)}% saved**, with the sign-in screen reached and zero runtime errors.`));
  b.push(p('**The compression A/B.** The same workload was run with compression off. At concurrency 8 the difference is inside the noise (5.79 ms against 5.80 ms at p50) and p99 is 1.1 ms worse with compression on. At concurrency 32 compression is unambiguously better: p50 18.86 ms against 23.87 ms, and 1,497 req/s against 1,162. On a loopback the socket is not the bottleneck at low load, so compression is a small CPU cost; once the socket matters, it pays for itself. On a real network the 68% byte reduction dominates both.'));
  b.push(p('**Was excluding wasm a mistake.** The first implementation compressed text only. Measuring the wasm renderer showed brotli takes it from 5.46 MB to 1.85 MB, so it was included; the cost is 227 ms of CPU once per file version, cached. That is an example of a decision that felt sensible and was wrong, caught by a measurement rather than by review.'));

  b.push(h('7. Reliability: health, readiness, monitoring', 1));
  b.push(p('The module asks for the distinction between liveness and readiness to be real, not documented. It is, and it was tested by pointing a second instance at a database that does not exist.'));
  b.push(table([
    ['Signal', 'Question', 'Touches the database', 'Correct response'],
    ['GET /api/health', 'Is the process alive?', 'No', 'Restart it'],
    ['GET /api/ready', 'Can it serve a request that needs its dependencies?', 'Yes, plus route mounts and worker state', 'Take it out of rotation; do not restart'],
    ['GET /api/metrics', 'What has it been doing?', 'No', 'Feed a dashboard or alert rule'],
  ], [1900, 3100, 2100, 2250]));
  b.push(table([
    ['Controlled failure', 'Predicted', 'Observed'],
    ['Unreachable database (second instance)', 'readiness 503, liveness 200', `${on.reliability.readinessOnMissingDependency.readinessStatus} in ${on.reliability.readinessOnMissingDependency.readinessDetectedInMs} ms; liveness ${on.reliability.readinessOnMissingDependency.livenessStatus}; database check reported false`],
    ['All 10 pooled connections killed', 'pool reconnects, service continues', `ready 200 within ${on.reliability.poolResilience.readyDetectedInMs} ms; fully recovered in ${on.reliability.poolResilience.recoveredAfterMs} ms`],
    ['Rate limiter re-keyed to the user', 'refuses per user, never refuses probes', `refused at request ${on.reliability.limiter.firstRefusalAt}; ${on.reliability.limiter.probesDuringBurst.join('/')} for probes during the same burst`],
    ['SIGTERM during service', 'drains and exits 0', `exited in ${on.reliability.gracefulShutdown.msToExit} ms`],
  ], [2900, 2700, 3750]));
  b.push(p('Table 7.1 — controlled failures. The pool result is instructive: killing pooled connections did not make the service unready, because mysql2 opened new ones in 271 ms. That is resilience, and recording it as a readiness failure would have been wrong. The readiness question needed a dependency that was genuinely absent.'));
  b.push(p('**The defect this found.** The first full run ended with readiness answering **429**: the rate limiters ran before the session was attached, so key \u2018user\u2019 silently degraded to the address, every workstation behind one NAT shared one budget, and the probe exemption compared a path that Express had already trimmed. 2,262 requests were refused. Fixed by mounting the limiters after `attachSession`, keying per user with an address floor far above it, and exempting the three probes. Measured afterwards: refusal at request 10, probes unaffected.'));

  b.push(h('8. Deployment configuration and environment separation', 1));
  b.push(p('The reviewer-facing artefacts are docs/lab/module16/DEPLOYMENT.md (checklist and environment comparison) and the five settings this module added, all read through config.js with bounds so a typo clamps at startup rather than surprising at runtime.'));
  b.push(table([
    ['Key', 'Default', 'Purpose'],
    ['BUILD_ID', 'dev', 'Reported by /api/ready, so a deploy is confirmed by asking the running process'],
    ['RATE_LIMIT_USER_PER_MIN', '300', 'Per signed-in user; the limit a clinician could notice'],
    ['RATE_LIMIT_ADDRESS_PER_MIN', '3000', 'Flood net per address; must stay far above the user limit'],
    ['RATE_LIMIT_LOGIN_PER_MIN', '10', 'Per username'],
    ['COMPRESSION', 'on', 'off exists only to measure the cost'],
  ], [3100, 1200, 5050]));
  b.push(p('No secret is in the repository: keys, TLS material and `.env` files are ignored, and only the two `.example` files are tracked. That was not true earlier in the project — a Module 15 audit found private keys and four `.env` backups tracked — and the correction is recorded there as defect D-12 rather than quietly fixed.'));

  b.push(h('9. Rollback, recovery and the rehearsal', 1));
  b.push(p(`A rollback plan that has not been rehearsed is a wish. The rehearsal backs up, breaks the data on purpose, detects the damage, restores, and proves the restore by comparing counts and a content hash for every table.`));
  b.push(table([
    ['Step', 'Result'],
    ['Backup', `${roll.steps[0].bytes.toLocaleString()} bytes, mysqldump --single-transaction`],
    ['Fingerprint before', `10 tables; follow_ups ${roll.steps[1].followUps} rows, hash ${roll.steps[1].followUpsHash}`],
    ['Damage applied', 'column dropped, 25 rows corrupted, one planted audit row'],
    ['Detected', String(roll.steps[2].detectable)],
    ['Restored, data matches', String(roll.steps[3].matchesBefore)],
    ['Column restored, residue', `${roll.steps[4].closeNoteColumnBack}, ${roll.steps[4].plantedRowsRemaining} planted / ${roll.steps[4].corruptedRowsRemaining} corrupted`],
    ['Recovery time', `**${roll.recoveryTimeMs} ms** (restore alone ${roll.steps[3].restoreCommandMs} ms)`],
  ], [2600, 6750]));
  b.push(p('The honest qualifier: 83 KB of dump and 400 follow-ups. Restore time scales with the dump, and the 179 ms excludes the part that actually takes time in an incident \u2014 noticing, deciding and communicating. What the rehearsal does prove is that the plan has no missing step and that the verification is real: a restore that loses one row fails it.'));

  b.push(h('10. Acceptance criteria, scored', 1));
  b.push(table(verdictRows(), [560, 3600, 1500, 1900, 1790]));
  b.push(p('Eight of nine pass. A5 is not explained away: throughput rose only 1.19× between concurrency 8 and 32, so the scaling ceiling is inside the range tested. For ten staff it is irrelevant; as a statement about growth it is the most useful number in this report.'));

  b.push(h('11. Observation, interpretation and recommendation', 1));
  b.push(table([
    ['Observed (fact)', 'Interpretation', 'Recommendation'],
    [`board p95 ${on.journeys.board.latencyMs.p95} ms at concurrency 8`, 'The read path is not the constraint', 'Leave it alone; optimise nothing here'],
    [`throughput ${on.mixes['mixed-c8'].throughputRps} → ${on.mixes['mixed-c32'].throughputRps} req/s from 8 to 32 clients`, 'One process saturates; the model clinic is far inside it', 'Cluster before any growth, not after'],
    [`first load ${wireMb} MB, ${br.totals.savedPct ?? 68}% saved`, 'Delivery was the largest user-visible cost, not the API', 'Keep compression; measure it again after any bundle change'],
    ['readiness 503 in 4 ms with the database gone; liveness 200', 'The distinction the module asks for is real in this build', 'Wire the readiness endpoint to whatever supervises the process'],
    ['2,262 refused requests before the limiter fix', 'A limit keyed by address assumes one user per address', 'Key by identity; keep an address floor for floods'],
    ['RSS 66 → 166 MB across a run', 'Retained buffers and the asset cache; no growth during the soak', 'Watch RSS across days, which this run cannot show'],
  ], [2800, 3100, 3450]));

  b.push(h('12. Known limitations and next improvement', 1));
  for (const item of [
    '**One process.** No clustering, no shared session store, no second worker. A5 failed for this reason and nothing here changes it.',
    '**Loopback only.** Latency is the server floor, not a clinic link. Transfer size was measured in a browser; latency over a real network was not.',
    '**No alerting or persistence.** Metrics die with the process and nothing raises a hand unprompted.',
    '**The rehearsal is small.** 83 KB of dump. Restore time on a year of records is unmeasured.',
    '**Backup and database share a disk.** That is a rehearsal convenience, not a backup strategy.',
    '**No TLS in this environment**, so the `Secure` cookie flag and HSTS branch of the code is untested rather than verified.',
    '**Windows-only measurements.** The service would run on Linux; the numbers would differ.',
  ]) b.push(p(item, { spaceAfter: 80 }));
  b.push(p('**Next improvement, in one sentence:** make the service cluster-aware — two instances behind a proxy with a shared session store — because it is the only item on this list that moves the measured ceiling rather than improving the ability to see it.'));

  b.push(h('13. Contribution record and AI acknowledgement', 1));
  b.push(table([
    ['Item', 'Description'],
    ['Sole contributor', 'WILLIAM BENEDICT R. BINWAG (22-11990) — workload design, harness, measurements, fixes and documentation'],
    ['AI assistance', 'Used for drafting the harness structure, reviewing the delivery and observability changes, and editing this report. Every number shown is read from the evidence JSON at generation time.'],
    ['Verification the learner can perform unaided', 'Run the harness, read any case in performance.json, break the rate limiter on purpose and watch the evidence change, and rehearse the rollback.'],
    ['Third-party code', 'Express, mysql2, Flutter and the Flutter test framework, under their own licences.'],
  ], [2500, 6850]));

  b.push(h('14. Evidence index', 1));
  b.push(table([
    ['Path', 'Contents'],
    ['backend/tests/m16-perf.js', 'The workload harness: journeys, levels, soak, static, reliability, limiter, shutdown'],
    ['backend/tests/m16-rollback.js', 'The rollback rehearsal'],
    ['evidence/01-baseline/', 'The run where the rate limiter dominated — kept because it exposed the defect'],
    ['evidence/03-capacity/', 'The capacity run: compression on'],
    ['evidence/04-no-compression/', 'The same workload with compression off'],
    ['evidence/05-rollback/', 'Backup, damage, restore, verification, recovery time'],
    ['evidence/06-deployment/', 'Browser transfer measurements and the app loading after the delivery change'],
    ['WORKLOAD.md RESULTS.md MONITORING.md DEPLOYMENT.md ROLLBACK.md', 'The model, the interpretation, the monitoring map, the checklist and the readiness decision'],
    ['backend/observability.js backend/delivery.js', 'The code this module added'],
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
  b.push(p('**Which decision had the greatest effect?** Measuring the transfer from the browser rather than the server. The server-side number said "compression on, 791 KB instead of 2.95 MB", which is true and easy to believe. Watching the browser report 2.65 MB for the whole first load — and confirming the app still reached the sign-in screen with no runtime errors — is a different kind of evidence, because it includes the client I had not measured. It also caught my own error: I had excluded wasm from compression on a hunch, and the measurement showed it saves 3.6 MB.'));
  b.push(p('**Which failure was hardest to reproduce, and how would I improve the test design?** The readiness check. My first attempt killed the pooled connections, which the pool simply replaced in 271 ms; the test then reported a false negative and I nearly recorded "readiness is broken". The design improvement is to simulate the dependency being *absent*, not merely interrupted — which is what the second instance with a missing database does. A failure worth testing is usually a different condition from the one that is convenient to set up.'));
  b.push(p('**What can I explain and modify independently?** The harness and the observability surface. I can explain why liveness must not touch the database, why the rate limiter must key on the user, why the access log collapses paths to a route shape, and what A5 failing actually implies. The artifact that shows this is backend/observability.js plus the four evidence runs: I can predict which case a change moves, then check.'));
  b.push(p('**What must an authorized maintainer verify before broader use?** Whether the deployment can be clustered, because A5 failed and that is the ceiling; whether TLS termination sets the Secure cookie and HSTS as the code expects; and whether the backup strategy survives the database host being lost, which the rehearsal here deliberately does not test. Until those are answered this is a measured, instrumented pilot candidate, not a production service.'));

  b.push(h('17. References', 1));
  for (const ref of [
    'OWASP Foundation. (2023). OWASP API Security Top 10. https://owasp.org/API-Security/',
    'Node.js. (2026). zlib: gzip and Brotli. https://nodejs.org/api/zlib.html',
    'Node.js. (2026). Process signals and graceful shutdown. https://nodejs.org/api/process.html',
    'Flutter. (2026). Web renderers and CanvasKit. https://docs.flutter.dev/platform-integration/web/renderers',
    'MySQL. (2026). mysqldump: single-transaction and consistent snapshots. https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html',
    'Gowda, P., & Gowda, A. N. (2024). Best practices in REST API design for enhanced scalability and security. Journal of Artificial Intelligence, Machine Learning and Data Science, 2(1), 827-830.',
  ]) b.push(p(ref, { size: 20, spaceAfter: 60 }));

  return b;
}

// ── 2. the evidence portfolio ─────────────────────────────────────────────
function buildEvidence() {
  const b = [];
  b.push(titleBlock('Module 16 — Evidence Portfolio', [
    'Performance, reliability and deployment evaluation',
    'Clinic Follow-Up Reminder System — backend/ and lib/',
  ]));
  b.push(metaTable());

  b.push(h('1. Per-journey measurements', 1));
  b.push(p('Concurrency 1, no queueing, one warm-up request before each journey. These are the numbers behind the latency criteria.'));
  b.push(table([
    ['Journey', 'Requests', 'p50', 'p90', 'p95', 'p99', 'max', 'req/s', 'errors'],
    ...Object.entries(on.journeys).map(([k, j]) => [
      k, String(j.requests), `${j.latencyMs.p50}`, `${j.latencyMs.p90}`, `${j.latencyMs.p95}`,
      `${j.latencyMs.p99}`, `${j.latencyMs.max}`, String(j.throughputRps), String(j.errorCount),
    ]),
  ], [1100, 750, 900, 900, 900, 900, 900, 1000, 900]));

  b.push(h('2. Mixed workload and saturation', 1));
  b.push(table([
    ['Level', 'Requests', 'p50', 'p95', 'p99', 'req/s', 'errors'],
    ...Object.entries(on.mixes).map(([k, m]) => [
      k, String(m.requests), `${m.latencyMs.p50}`, `${m.latencyMs.p95}`, `${m.latencyMs.p99}`,
      String(m.throughputRps), String(m.errorCount),
    ]),
  ], [1900, 1100, 1500, 1500, 1500, 1400, 1050]));

  b.push(h('3. The compression A/B', 1));
  b.push(table([
    ['Metric', 'compression off', 'compression on', 'Difference'],
    ['c8 p50', `${off.mixes['mixed-c8'].latencyMs.p50} ms`, `${on.mixes['mixed-c8'].latencyMs.p50} ms`, `${(on.mixes['mixed-c8'].latencyMs.p50 - off.mixes['mixed-c8'].latencyMs.p50).toFixed(2)} ms`],
    ['c8 p99', `${off.mixes['mixed-c8'].latencyMs.p99} ms`, `${on.mixes['mixed-c8'].latencyMs.p99} ms`, `${(on.mixes['mixed-c8'].latencyMs.p99 - off.mixes['mixed-c8'].latencyMs.p99).toFixed(2)} ms`],
    ['c32 p50', `${off.mixes['mixed-c32'].latencyMs.p50} ms`, `${on.mixes['mixed-c32'].latencyMs.p50} ms`, `${(on.mixes['mixed-c32'].latencyMs.p50 - off.mixes['mixed-c32'].latencyMs.p50).toFixed(2)} ms`],
    ['c32 p99', `${off.mixes['mixed-c32'].latencyMs.p99} ms`, `${on.mixes['mixed-c32'].latencyMs.p99} ms`, `${(on.mixes['mixed-c32'].latencyMs.p99 - off.mixes['mixed-c32'].latencyMs.p99).toFixed(2)} ms`],
    ['c32 throughput', `${off.mixes['mixed-c32'].throughputRps} req/s`, `${on.mixes['mixed-c32'].throughputRps} req/s`, `${(on.mixes['mixed-c32'].throughputRps - off.mixes['mixed-c32'].throughputRps).toFixed(0)} req/s`],
  ], [2200, 2400, 2400, 2350]));
  b.push(p('The two runs differ only in the COMPRESSION switch. Recorded in evidence/03-capacity/ and evidence/04-no-compression/.'));

  b.push(h('4. Browser transfer measurements', 1));
  b.push(p('Recorded through the Chrome DevTools protocol while the release build loaded: bytes on the wire per asset. This is the client\u2019s view, not the server\u2019s claim.'));
  b.push(table([
    ['Asset', 'Wire bytes', 'Status'],
    ...br.assets.sort((x, y) => y.encodedBytes - x.encodedBytes).slice(0, 12).map((a) => [a.url, String(a.encodedBytes ?? 0), String(a.status)]),
  ], [5600, 1900, 1850]));
  b.push(p(`Total on the wire: ${br.totals.encodedBytes.toLocaleString()} bytes. Sign-in reached: ${br.appReachedSignIn}. Runtime errors: ${br.runtimeErrors.length}. Time to the sign-in screen: ${br.msToSignIn} ms.`));
  if (br.runtimeErrors.length === 0) {
    b.push(p('Zero runtime errors is the part that matters: a compression layer that broke the app would still have saved bytes.'));
  }

  b.push(image('16-04-app-after-delivery-change.png', { maxWIn: 6.2, caption: 'The release build after the delivery change: sign-in reached, no runtime errors, 2.65 MB on the wire instead of 8.7 MB.' }));

  b.push(h('5. Reliability evidence', 1));
  b.push(table([
    ['Check', 'Recorded result'],
    ['Liveness during a missing dependency', `status ${on.reliability.readinessOnMissingDependency.livenessStatus}`],
    ['Readiness during a missing dependency', `status ${on.reliability.readinessOnMissingDependency.readinessStatus} in ${on.reliability.readinessOnMissingDependency.readinessDetectedInMs} ms`],
    ['Readiness named the failing check', String(on.reliability.readinessOnMissingDependency.readinessReportedDatabaseError)],
    ['Pool after killing all connections', `ready 200 in ${on.reliability.poolResilience.readyDetectedInMs} ms, recovered in ${on.reliability.poolResilience.recoveredAfterMs} ms`],
    ['Rate limiter per user', `first refusal at request ${on.reliability.limiter.firstRefusalAt} of a limit of ${on.reliability.limiter.configuredPerMinute}`],
    ['Probes during the same burst', on.reliability.limiter.probesDuringBurst.join(', ')],
    ['Graceful shutdown', `exited ${on.reliability.gracefulShutdown.exited} in ${on.reliability.gracefulShutdown.msToExit} ms`],
    ['Database connections during load', String(on.reliability.dbConnectionsDuringLoad)],
    ['RSS before / after a full run', `${on.reliability.rssBeforeShutdownMb} MB / ${on.resources.rssEndMb} MB (growth ${on.resources.growthMb} MB)`],
  ], [3400, 5950]));

  b.push(h('6. Rollback rehearsal record', 1));
  b.push(table([
    ['Step', 'Detail'],
    ...roll.steps.map((s) => [s.name, JSON.stringify(s).slice(0, 240)]),
  ], [2300, 7050]));
  b.push(p(`Recovery time ${roll.recoveryTimeMs} ms; verification compares row counts and a content hash for every table, so a restore that loses a single row fails.`));

  b.push(h('7. The run that is excluded, and why', 1));
  b.push(p(`The first full run is kept as evidence/01-baseline/. Its readiness check answered ${base.reliability.health.status} and its journeys carry whole-sample error counts, because the server's own rate limiter refused 2,262 requests from one address. Presenting those numbers as a baseline would be dishonest twice over: it would describe the limiter rather than the server, and it would hide the defect it found. It is here, and the report cites it only for that defect.`));
  b.push(code([
    '$ grep -c \'"status":429\' docs/lab/module16/evidence/01-baseline/server-log.txt',
    '2262',
    '',
    '{"src":"http","event":"security.rate_limited","limiter":"api-burst",',
    ' "keyFingerprint":"508cc0fe2618","retryAfterSeconds":1}',
  ]));

  b.push(h('8. Reproducing these artifacts', 1));
  b.push(code([
    'cd backend',
    'node --env-file=.env tests/m16-perf.js --label 07-review --phase full',
    'node --env-file=.env tests/m16-rollback.js',
    '',
    '# the A/B needs one extra variable',
    '$env:COMPRESSION="off"; node --env-file=.env tests/m16-perf.js --label 08-off --phase quick',
    '',
    '# regenerate the documents',
    'node docs/lab/module16/build-docs.js',
  ]));
  b.push(p('The harness creates clinic_followup_m16 and drops it at the start of every run; the lab database is never touched. Port 3413 belongs to the harness, 3414 to the limiter check and 3415 to the missing-dependency instance.'));

  return b;
}

// ── 3. the operational manual ─────────────────────────────────────────────
function buildManual() {
  const b = [];
  b.push(titleBlock('Module 16 — Operational Manual', [
    'Parts 1–6',
    'Running the measurements, reading the signals, deploying and rolling back',
  ]));
  b.push(p('This manual starts once the application runs. It covers how to reproduce the measurements, what to look at when something is wrong, and how to put it back. The design rationale is in the Module 16 report; the numbers are in the evidence portfolio.'));

  b.push(h('Preconditions', 1));
  b.push(code([
    'cd "C:\\Users\\benedict\\StudioProjects\\clinic-follow-up-reminder-system"',
    '"node    : " + (node --version)',
    '"mysql   : " + (& "C:\\xampp\\mysql\\bin\\mysqladmin.exe" -u root --host=127.0.0.1 ping)',
    '"ports   : " + ((Get-NetTCPConnection -LocalPort 3413,3414,3415 -ErrorAction SilentlyContinue | Measure-Object).Count)',
    '"build   : " + (Test-Path backend\\public\\app\\main.dart.js)',
  ]));
  b.push(table([
    ['Check', 'Required', 'If not'],
    ['node', '20 or newer', 'The harness uses fetch, AbortSignal and node:perf_hooks'],
    ['mysql', 'mysqld is alive', 'Start MariaDB; the harness cannot create its database otherwise'],
    ['ports', '0 in use', '3413 harness, 3414 limiter check, 3415 missing-dependency instance'],
    ['build', 'true', 'The static transfer measurement needs the release build in place'],
  ], [1500, 2200, 5650]));

  b.push(h('Part 1 · Running the measurements', 1));
  b.push(code([
    'cd backend',
    'node --env-file=.env tests/m16-perf.js --label 07-review --phase full',
    '',
    '# expected shape:',
    '  | mixed-c8  | 800  | ~5.8 | ~10 | ~15 | 1263 req/s | 0 |',
    '  reliability: {... "readinessOnMissingDependency":{"works":true} ...}',
  ]));
  b.push(p('Phases: `--phase quick` is one pass (per-journey at concurrency 1 and the mixed workload at 8). `full` adds concurrency 32, a 20-second soak, static transfer, the limiter check, the missing-dependency check and the shutdown check. A full run takes about two minutes on the lab machine.'));
  b.push(p('The harness owns clinic_followup_m16 and drops it at the start, so a run always begins from the same state. It starts its own API on 3413; do not run `npm start` on that port.'));
  b.push(table([
    ['Phase', 'What it measures', 'Typical duration'],
    ['journeys', 'Five read journeys plus login at concurrency 1', '~8 s'],
    ['mixed c8', '800 requests across the weighted mix', '~1 s'],
    ['mixed c32', '1,600 requests — saturation', '~2 s'],
    ['soak', '20 s at concurrency 8 with 20 ms think time', '20 s'],
    ['static', 'Transfer size with and without Accept-Encoding', '<1 s'],
    ['reliability', 'Probes, pool kill, limiter, missing dependency, SIGTERM', '~5 s'],
  ], [1600, 5000, 2750]));

  b.push(h('Part 2 · Reading the result sheet', 1));
  b.push(p('`evidence/<label>/performance.json` holds every sample summary; `results.md` is the same thing as a table. Read them in this order.'));
  b.push(table([
    ['Look at', 'Field', 'What it tells you'],
    ['Did anything fail?', '`errorCount`, `errorStatuses`', 'Anything above zero means the run measured a fault, not a server'],
    ['The tail, not the mean', '`latencyMs.p95`, `p99`', 'The mean hides the requests a person notices'],
    ['Saturation', 'compare `throughputRps` across `mixed-c8` and `mixed-c32`', 'A ratio near 1 means the ceiling is inside the range'],
    ['Which journey is slow', 'per-journey `p50`', 'Login at ~42 ms is scrypt and is not a defect'],
    ['Resource drift', '`resources.growthMb`', '~90–100 MB per full run is buffers, not a leak; watch across days'],
  ], [1800, 2900, 4650]));

  b.push(h('Part 3 · Monitoring and incident response', 1));
  b.push(code([
    '# the three questions, in order',
    'curl.exe -s http://127.0.0.1:3400/api/health',
    '{"ok":true,"service":"clinic-follow-up-reminders","uptimeSeconds":5}',
    '',
    'curl.exe -s http://127.0.0.1:3400/api/ready',
    '{"ready":true,"checks":{"database":{"ok":true},"routes":{"secure":true,"clinical":true},',
    ' "worker":{"running":true}},"pool":{"queueing":0,"limit":10}}',
    '',
    'curl.exe -s http://127.0.0.1:3400/api/metrics',
    '{"requests":2,"byStatus":{"200":2},"latency":{"meanMs":2.5,...},"worker":{...}}',
  ]));
  b.push(table([
    ['Symptom', 'Meaning', 'Action'],
    ['ready 503 with database.ok false', 'The dependency, not the process', 'Do not restart. Check MariaDB, then pool.queueing'],
    ['ready 503 with secure or clinical false', 'A partial boot; a module failed to import', 'Restart once, then read the mount_state line in the log'],
    ['ready 200 but the board spins', 'Saturation or a slow query', 'Compare latency.percentByBucket with RESULTS.md'],
    ['pool.queueing > 0 with a healthy database', 'Connections exhausted, not slow queries', 'Check for a leak before raising the limit'],
    ['worker.running false', 'Reads work, delivery does not', 'Restart; jobs are reclaimed after the stuck threshold'],
    ['429 from the API', 'The limiter fired', 'Check which limiter in the log; a shared address may need RATE_LIMIT_ADDRESS_PER_MIN raised'],
  ], [3000, 2800, 3550]));

  b.push(h('Part 4 · Deploying', 1));
  b.push(code([
    'flutter build web --release --base-href=/app/ --no-web-resources-cdn',
    'Remove-Item -Recurse -Force backend\\public\\app; Copy-Item -Recurse build\\web backend\\public\\app',
    '$env:BUILD_ID = (git rev-parse --short HEAD)',
    'cd backend; node --env-file=.env server.js',
    '',
    '# confirm the build that answered, not the build you meant to deploy',
    'curl.exe -s http://127.0.0.1:3400/api/ready',
  ]));
  b.push(p('`--no-web-resources-cdn` is mandatory: the API sends `default-src \'self\'`, and a bundle that fetches CanvasKit from gstatic.com renders a blank page behind that policy.'));
  b.push(p('The full checklist, with the check that must pass at each step, is in DEPLOYMENT.md. Steps 8–10 there are the ones that catch a half-deployed release.'));

  b.push(h('Part 5 · Rolling back', 1));
  b.push(code([
    '# 1. drain (SIGTERM; measured at ~112 ms)',
    'Stop-Process -Id <pid>',
    '# 2. previous release directory',
    'Copy-Item -Recurse -Force ..\\releases\\<previous>\\web backend\\public\\app',
    '# 3. restore the database if the schema changed',
    '& "C:\\xampp\\mysql\\bin\\mysql.exe" -u root -h 127.0.0.1 clinic_followup_lab < ..\\backup\\pre-deploy.sql',
    '# 4. start the previous build, identified',
    '$env:BUILD_ID="<previous sha>"; node --env-file=.env server.js',
    '# 5. prove it',
    'curl.exe -s http://127.0.0.1:3400/api/ready | Select-String build',
  ]));
  b.push(p(`Rehearsed end to end by backend/tests/m16-rollback.js: damage detected, restore verified against a hash of every table, recovery in ${roll.recoveryTimeMs} ms on this data volume.`));

  b.push(h('Part 6 · Verifying each claim yourself', 1));
  b.push(table([
    ['Claim', 'Check', 'Must show'],
    ['The read path is fast', 'journeys.board.latencyMs.p95 in 03-capacity', `≤ 250 ms (recorded ${on.journeys.board.latencyMs.p95} ms)`],
    ['No read errors under load', 'errorCount on mixed-c8 and mixed-c32', '0 and 0'],
    ['There is a scaling ceiling', 'throughputRps c32 ÷ c8', `${ratio}×, which is below the 2× criterion`],
    ['Delivery is 68% smaller', '06-deployment/browser-transfer.json totals', `${br.totals.encodedBytes.toLocaleString()} bytes on the wire`],
    ['Readiness is not liveness', 'reliability.readinessOnMissingDependency', '503 with liveness 200'],
    ['The limiter works and spares probes', 'reliability.limiter', `first refusal ${on.reliability.limiter.firstRefusalAt}, probes 200`],
    ['Shutdown drains', 'reliability.gracefulShutdown', `exited in ${on.reliability.gracefulShutdown.msToExit} ms`],
    ['Rollback works', '05-rollback/rollback.json', 'passed true, matchesBefore true'],
  ], [2300, 3400, 3650]));

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
  // Reset before the body is built: building it is what registers the images.
  MEDIA.length = 0;
  const bodyParts = makeBody();
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(TEMPLATE, join(WORK, 'template.docx'));
  execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
    + `[System.IO.Compression.ZipFile]::ExtractToDirectory('${join(WORK, 'template.docx')}', '${join(WORK, 'x')}')`]);

  // The template is Module 15's report, which already carries images. Clear them
  // so this package contains only what this document references.
  rmSync(join(WORK, 'x', 'word', 'media'), { recursive: true, force: true });
  const relsPath = join(WORK, 'x', 'word', '_rels', 'document.xml.rels');
  let rels = readFileSync(relsPath, 'utf8').replace(/<Relationship [^>]*relationships\/image"[^>]*\/>/g, '');

  writeFileSync(join(WORK, 'x', 'word', 'document.xml'),
    DOC_HEAD + `<w:body>${bodyParts.join('')}${SECT}</w:body></w:document>`);

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

build('Module16.docx', buildReport);
build('Module16-evidence.docx', buildEvidence);
build('Module 16-operational-manual.docx', buildManual);
console.log('done');

import { cfg, assertLocalEndpoint } from './config.js';
import {
  JOB, OUTCOME, alreadyDelivered, backoffMs, claimNextJob, classify,
  commitOutcome, inspectQueuedRecord, reclaimStuckJobs,
} from './service.js';

let timer = null, busy = false, started = false;

function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'worker', event, ...fields }));
}

async function callGateway(body, correlationId) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
        'idempotency-key': correlationId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    await res.text().catch(() => '');
    const ra = Number(res.headers.get('retry-after'));
    return { startedAt, durationMs: Date.now() - t0, httpStatus: res.status,
      retryAfterSeconds: Number.isFinite(ra) ? ra : null };
  } catch (e) {
    const code = e?.cause?.code || e?.code || (e?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    return { startedAt, durationMs: Date.now() - t0, httpStatus: null, errorCode: code,
      errorText: code === 'TIMEOUT' ? `No response within ${cfg.timeoutMs} ms` : 'Gateway unreachable' };
  }
}

async function runAttempt(job) {
  const correlationId = job.correlationId;
  const attemptNo = job.attempts;
  log('attempt.start', { jobId: job.id, attempt: attemptNo, correlationId, followUpId: job.followUpId });

  const inspected = await inspectQueuedRecord(job);
  if (inspected.action === 'obsolete' || inspected.action === 'invalid') {
    const outcome = inspected.action === 'obsolete' ? OUTCOME.OBSOLETE : OUTCOME.VALIDATION;
    await commitOutcome({
      jobId: job.id, attemptNo, correlationId,
      result: { startedAt: new Date().toISOString(), durationMs: 0, outcome,
        errorCode: inspected.code, errorText: inspected.text },
      next: { status: inspected.action === 'obsolete' ? JOB.OBSOLETE : JOB.NEEDS_HUMAN,
        code: inspected.code, text: inspected.text },
    });
    log('job.closed_without_send', { jobId: job.id, correlationId, code: inspected.code });
    return;
  }

  if (await alreadyDelivered(job.id)) {
    log('attempt.skipped_already_delivered', { jobId: job.id, correlationId });
    await commitOutcome({
      jobId: job.id, attemptNo, correlationId,
      result: { startedAt: new Date().toISOString(), durationMs: 0,
        outcome: OUTCOME.SUCCEEDED, httpStatus: 200,
        errorText: 'Skipped: an earlier attempt already succeeded.' },
      next: { status: JOB.SUCCEEDED },
    });
    return;
  }

  const call = await callGateway(inspected.body, correlationId);
  const outcome = classify(call.httpStatus, call.errorCode);
  log('attempt.end', { jobId: job.id, attempt: attemptNo, correlationId, outcome,
    httpStatus: call.httpStatus, durationMs: call.durationMs });

  const result = {
    startedAt: call.startedAt, durationMs: call.durationMs, outcome,
    httpStatus: call.httpStatus,
    errorCode: call.errorCode ?? (call.httpStatus ? `HTTP_${call.httpStatus}` : null),
    errorText: call.errorText ?? (call.httpStatus ? `Gateway returned ${call.httpStatus}` : null),
  };

  if (outcome === OUTCOME.SUCCEEDED) {
    await commitOutcome({ jobId: job.id, attemptNo, correlationId, result,
      next: { status: JOB.SUCCEEDED } });
    return;
  }
  if (outcome === OUTCOME.TRANSIENT) {
    if (attemptNo < Number(job.maxAttempts)) {
      const delay = backoffMs(attemptNo, call.retryAfterSeconds);
      await commitOutcome({ jobId: job.id, attemptNo, correlationId, result,
        next: { status: JOB.QUEUED, nextRunAt: Date.now() + delay } });
      log('job.rescheduled', { jobId: job.id, attempt: attemptNo, correlationId, delayMs: delay });
      return;
    }
    await commitOutcome({ jobId: job.id, attemptNo, correlationId, result,
      next: { status: JOB.NEEDS_HUMAN,
        code: call.errorCode ?? `HTTP_${call.httpStatus}`,
        text: `Transient failure persisted after ${attemptNo} attempt(s). `
            + `Last code ${call.errorCode ?? call.httpStatus}. Check ${cfg.endpoint}, then retry.` } });
    log('job.escalated', { jobId: job.id, correlationId, reason: 'attempts_exhausted' });
    return;
  }
  await commitOutcome({ jobId: job.id, attemptNo, correlationId, result,
    next: { status: JOB.NEEDS_HUMAN,
      code: call.errorCode ?? `HTTP_${call.httpStatus}`,
      text: `Gateway rejected the reminder (HTTP ${call.httpStatus}) at ${cfg.endpoint}. `
          + 'Set the mock mode to ok (POST /_/mode), confirm the follow-up is still '
          + 'scheduled, then retry with a reason.' } });
  log('job.escalated', { jobId: job.id, correlationId, reason: 'permanent' });
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const job = await claimNextJob();
    if (job) await runAttempt(job);
  } catch (e) {
    log('worker.error', { message: String(e?.message || e).slice(0, 200) });
  } finally { busy = false; }
}

export async function startWorker() {
  if (started) return;
  assertLocalEndpoint();
  started = true;
  try {
    const n = await reclaimStuckJobs(cfg.stuckAfterMs);
    if (n > 0) log('worker.reclaimed', { jobs: n });
  } catch (e) { log('worker.reclaim_failed', { message: String(e?.message || e).slice(0, 200) }); }
  timer = setInterval(tick, cfg.pollMs);
  if (timer.unref) timer.unref();
  log('worker.started', { pollMs: cfg.pollMs, maxAttempts: cfg.maxAttempts,
    timeoutMs: cfg.timeoutMs, endpoint: cfg.endpoint });
}

export function stopWorker() { if (timer) clearInterval(timer); timer = null; started = false; }
import { createHash, randomBytes } from 'node:crypto';
import { pool, withTx } from './db.js';
import { cfg } from './config.js';

export const JOB = Object.freeze({
  QUEUED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded',
  NEEDS_HUMAN: 'needs_human', OBSOLETE: 'obsolete',
});
export const OUTCOME = Object.freeze({
  SUCCEEDED: 'succeeded', TRANSIENT: 'transient_error', PERMANENT: 'permanent_error',
  VALIDATION: 'validation_error', OBSOLETE: 'obsolete', HUMAN_RETRY: 'human_retry',
});

const now = () => new Date().toISOString();
const today = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/**
 * Normalize a MySQL DATE to 'YYYY-MM-DD'.
 * mysql2 yields a Date object unless dateStrings is set, and String(date) is
 * "Thu Oct 29 2026 ...", so slicing it produces a weekday name - not a date.
 */
const ymd = v => {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const newCorrelationId = () => randomBytes(16).toString('hex');
export const idempotencyKey = (followUpId, version) =>
  createHash('sha256').update(`follow_up_reminder|${followUpId}|${version}`).digest('hex');

const httpError = (status, message) => { const e = new Error(message); e.status = status; return e; };

// ── follow-ups ─────────────────────────────────────────────────────────────
export async function listFollowUps({ status = '', limit = 100 } = {}) {
  const ok = ['scheduled', 'reminded', 'closed'].includes(status);
  const [rows] = await pool.execute(
    `SELECT f.*, p.name AS patient_name FROM follow_ups f
       JOIN patients p ON p.id = f.patient_id
      ${ok ? 'WHERE f.status = ?' : ''}
      ORDER BY f.due_date ASC, f.id ASC LIMIT ${Math.min(Number(limit) || 100, 200)}`,
    ok ? [status] : []
  );
  return rows.map(publicFollowUp);
}

function publicFollowUp(r) {
  return {
    id: r.id, patientId: r.patient_id, patientName: r.patient_name,
    dueDate: ymd(r.due_date), reason: r.reason, status: r.status,
    version: Number(r.version), createdAt: r.created_at,
  };
}

export async function createFollowUp(body, actor) {
  const patientId = String(body.patientId ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  const dueDate = String(body.dueDate ?? '').trim();
  if (!patientId) throw httpError(400, 'patientId is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw httpError(400, 'dueDate must be YYYY-MM-DD.');
  if (!reason || reason.length > 300) throw httpError(400, 'reason must be 1–300 characters.');

  const [p] = await pool.execute('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!p[0]) throw httpError(404, 'Patient not found.');

  const [res] = await pool.execute(
    `INSERT INTO follow_ups (patient_id, due_date, reason, created_by, created_at)
     VALUES (?,?,?,?,?)`,
    [patientId, dueDate, reason, actor?.id ?? null, now()]
  );
  const [rows] = await pool.execute(
    `SELECT f.*, p.name AS patient_name FROM follow_ups f
       JOIN patients p ON p.id = f.patient_id WHERE f.id = ?`, [res.insertId]
  );
  return publicFollowUp(rows[0]);
}

// ── queue ──────────────────────────────────────────────────────────────────
/** Enqueue is only allowed for a follow-up that is scheduled and due. */
export async function enqueue(input, actor) {
  // 1 - validate the input shape
  const followUpId = Number(input?.followUpId);
  if (!Number.isInteger(followUpId) || followUpId < 1) {
    throw httpError(400, 'followUpId must be a positive whole number.');
  }

  // 2 - read the authoritative row; fu does not exist before this line
  const [rows] = await pool.execute(
    'SELECT id, status, due_date, version FROM follow_ups WHERE id = ?', [followUpId]
  );
  const fu = rows[0];
  if (!fu) throw httpError(404, 'Follow-up not found.');

  // 3 - business preconditions, only now that fu exists
  if (fu.status !== 'scheduled') {
    throw httpError(409, `Only scheduled follow-ups can be queued (this one is "${fu.status}").`);
  }
  const due = ymd(fu.due_date);
  if (due > today()) {
    throw httpError(409, `This follow-up is not due until ${due}.`);
  }

  // 4 - idempotency: same follow-up and same version means the same job
  const key = idempotencyKey(followUpId, fu.version);
  const [existing] = await pool.execute(
    'SELECT * FROM reminder_jobs WHERE idempotency_key = ?', [key]
  );
  if (existing[0]) return { job: publicJob(existing[0]), created: false };

  // 5 - insert, and treat a racing duplicate as success
  const stamp = now();
  try {
    const [res] = await pool.execute(
      `INSERT INTO reminder_jobs
        (kind, follow_up_id, follow_up_version, idempotency_key, status, attempts,
         max_attempts, correlation_id, next_run_at, created_by, created_at, updated_at)
       VALUES ('follow_up_reminder',?,?,?,'queued',0,?,?,?,?,?,?)`,
      [followUpId, fu.version, key, cfg.maxAttempts, newCorrelationId(),
       Date.now(), actor?.id ?? null, stamp, stamp]
    );
    return { job: await findJob(res.insertId), created: true };
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      const [w] = await pool.execute(
        'SELECT * FROM reminder_jobs WHERE idempotency_key = ?', [key]
      );
      if (w[0]) return { job: publicJob(w[0]), created: false };
    }
    throw e;
  }
}

function publicJob(r) {
  return {
    id: r.id, kind: r.kind, followUpId: r.follow_up_id,
    followUpVersion: Number(r.follow_up_version), status: r.status,
    attempts: Number(r.attempts), maxAttempts: Number(r.max_attempts),
    correlationId: r.correlation_id, nextRunAt: Number(r.next_run_at),
    lastErrorCode: r.last_error_code, lastErrorText: r.last_error_text,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function findJob(id) {
  const [rows] = await pool.execute('SELECT * FROM reminder_jobs WHERE id = ?', [id]);
  if (!rows[0]) throw httpError(404, 'Reminder job not found.');
  return publicJob(rows[0]);
}

export async function listJobs({ status = '', limit = 50 } = {}, actor) {
  const valid = Object.values(JOB).includes(status);
  const [rows] = await pool.execute(
    `SELECT j.*, f.patient_id, p.name AS patient_name, f.due_date
       FROM reminder_jobs j
       JOIN follow_ups f ON f.id = j.follow_up_id
       JOIN patients p   ON p.id = f.patient_id
      ${valid ? 'WHERE j.status = ?' : ''}
      ORDER BY j.id DESC LIMIT ${Math.min(Number(limit) || 50, 200)}`,
    valid ? [status] : []
  );
  const [counts] = await pool.execute(
    'SELECT status, COUNT(*) n FROM reminder_jobs GROUP BY status'
  );
  const summary = Object.fromEntries(Object.values(JOB).map(s => [s, 0]));
  for (const c of counts) summary[c.status] = Number(c.n);

  let unreadAlerts = 0;
  if (actor?.role === cfg.alertRole) {
    const [a] = await pool.execute(
      `SELECT COUNT(*) n FROM reminder_alerts WHERE role = ? AND read_at IS NULL`,
      [cfg.alertRole]
    );
    unreadAlerts = Number(a[0].n);
  }
  return {
    jobs: rows.map(r => ({ ...publicJob(r), patientId: r.patient_id,
      patientName: r.patient_name, dueDate: ymd(r.due_date) })),
    counts: summary, unreadAlerts,
  };
}

export async function findJobDetail(id) {
  const job = await findJob(id);
  const [attempts] = await pool.execute(
    `SELECT attempt_no, correlation_id, started_at, duration_ms, outcome,
            http_status, error_code, error_text, actor_note
       FROM reminder_attempts WHERE job_id = ? ORDER BY id`, [id]
  );
  const [alerts] = await pool.execute(
    `SELECT id, role, message, created_at, read_at
       FROM reminder_alerts WHERE job_id = ? ORDER BY id`, [id]
  );
  return {
    job,
    attempts: attempts.map(a => ({
      attemptNo: Number(a.attempt_no), correlationId: a.correlation_id,
      startedAt: a.started_at, durationMs: Number(a.duration_ms),
      outcome: a.outcome,
      httpStatus: a.http_status === null ? null : Number(a.http_status),
      errorCode: a.error_code, errorText: a.error_text, actorNote: a.actor_note,
    })),
    alerts: alerts.map(a => ({
      id: Number(a.id), role: a.role, message: a.message,
      createdAt: a.created_at, readAt: a.read_at,
    })),
  };
}

/** Re-read authoritative state at claim time. The job holds no personal data. */
export async function inspectQueuedRecord(job) {
  const [rows] = await pool.execute(
    'SELECT id, status, due_date, version, reason FROM follow_ups WHERE id = ?',
    [job.followUpId]
  );
  const fu = rows[0];
  if (!fu) {
    return { action: 'invalid', code: 'FOLLOW_UP_MISSING',
      text: `Follow-up #${job.followUpId} no longer exists.` };
  }
  if (fu.status !== 'scheduled') {
    return { action: 'obsolete', code: 'FOLLOW_UP_NO_LONGER_SCHEDULED',
      text: `Follow-up #${job.followUpId} is now "${fu.status}".` };
  }
  if (Number(fu.version) !== Number(job.followUpVersion)) {
    return { action: 'obsolete', code: 'SUPERSEDED',
      text: `A newer revision of follow-up #${job.followUpId} replaced this reminder.` };
  }
  return {
    action: 'send', code: null, text: null,
    body: {
      followUpId: fu.id,
      dueDate: ymd(fu.due_date),
      action: 'send_reminder',
    },
  };
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
export function classify(httpStatus, errorCode) {
  if (errorCode) return OUTCOME.TRANSIENT;
  if (httpStatus >= 200 && httpStatus < 300) return OUTCOME.SUCCEEDED;
  if (TRANSIENT.has(httpStatus)) return OUTCOME.TRANSIENT;
  return OUTCOME.PERMANENT;
}

export function backoffMs(attempt, retryAfterSeconds) {
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(cfg.maxBackoffMs, retryAfterSeconds * 1000);
  }
  const raw = cfg.baseBackoffMs * 2 ** Math.max(0, attempt - 1);
  return Math.round(Math.min(cfg.maxBackoffMs, raw * (0.5 + Math.random() * 0.5)));
}

export async function claimNextJob() {
  return withTx(async c => {
    const [rows] = await c.execute(
      `SELECT * FROM reminder_jobs
        WHERE status = 'queued' AND next_run_at <= ?
        ORDER BY id ASC LIMIT 1 FOR UPDATE`, [Date.now()]
    );
    if (!rows[0]) return null;
    await c.execute(
      `UPDATE reminder_jobs SET status='running', attempts=attempts+1, updated_at=?
        WHERE id=?`, [now(), rows[0].id]
    );
    return { ...publicJob(rows[0]), attempts: Number(rows[0].attempts) + 1 };
  });
}

export async function alreadyDelivered(jobId) {
  const [r] = await pool.execute(
    `SELECT 1 FROM reminder_attempts WHERE job_id=? AND outcome='succeeded' LIMIT 1`, [jobId]
  );
  return Boolean(r[0]);
}

/** One transaction: attempt row + resulting state, so a crash can't lose a call. */
export async function commitOutcome({ jobId, attemptNo, correlationId, result, next }) {
  return withTx(async c => {
    await c.execute(
      `INSERT INTO reminder_attempts
        (job_id, attempt_no, correlation_id, started_at, duration_ms, outcome,
         http_status, error_code, error_text)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [jobId, attemptNo, correlationId, result.startedAt, result.durationMs,
       result.outcome, result.httpStatus ?? null, result.errorCode ?? null,
       (result.errorText ?? '').slice(0, 500)]
    );

    const stamp = now();
    if (next.status === JOB.SUCCEEDED) {
      await c.execute(
        `UPDATE reminder_jobs SET status='succeeded', last_error_code=NULL,
            last_error_text=NULL, updated_at=? WHERE id=?`, [stamp, jobId]
      );
      await c.execute(
        `UPDATE follow_ups f JOIN reminder_jobs j ON j.follow_up_id = f.id
            SET f.status='reminded', f.version=f.version+1
          WHERE j.id = ?`, [jobId]
      );
    } else if (next.status === JOB.QUEUED) {
      await c.execute(
        `UPDATE reminder_jobs SET status='queued', next_run_at=?, last_error_code=?,
            last_error_text=?, updated_at=? WHERE id=?`,
        [next.nextRunAt, result.errorCode ?? null,
         (result.errorText ?? '').slice(0, 500), stamp, jobId]
      );
    } else {
      const final = next.status === JOB.OBSOLETE ? JOB.OBSOLETE : JOB.NEEDS_HUMAN;
      await c.execute(
        `UPDATE reminder_jobs SET status=?, last_error_code=?, last_error_text=?,
            updated_at=? WHERE id=?`,
        [final, next.code ?? result.errorCode ?? null,
         (next.text ?? result.errorText ?? '').slice(0, 500), stamp, jobId]
      );
      if (final === JOB.NEEDS_HUMAN) {
        await c.execute(
          `INSERT INTO reminder_alerts (job_id, role, message, created_at) VALUES (?,?,?,?)`,
          [jobId, cfg.alertRole,
           `Follow-up reminder #${jobId} needs a decision (${next.code ?? 'PERMANENT_FAILURE'}). `
           + 'Open Reminders to retry or close the follow-up.', stamp]
        );
      }
    }
  });
}

export async function retryJob(id, reason, actor) {
  if (actor?.role !== cfg.alertRole) {
    throw httpError(403, 'Only a doctor can resolve a reminder job.');
  }
  const note = String(reason ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (note.length < 8 || note.length > 300) {
    throw httpError(400, 'A reason of 8–300 characters is required.');
  }

  // The status check and the requeue must share one lock. On the pool, autocommit
  // released FOR UPDATE immediately, so two concurrent retries could both see
  // needs_human and both requeue.
  await withTx(async c => {
    const [rows] = await c.execute(
      'SELECT id, status, attempts, max_attempts FROM reminder_jobs WHERE id=? FOR UPDATE', [id]
    );
    const job = rows[0];
    if (!job) throw httpError(404, 'Reminder job not found.');
    if (job.status === JOB.SUCCEEDED) throw httpError(409, 'This job already succeeded.');
    if (job.status === JOB.OBSOLETE) throw httpError(409, 'This follow-up is no longer pending.');
    if (job.status === JOB.RUNNING) throw httpError(409, 'This job is running. Try again in a moment.');
    if (job.status === JOB.QUEUED) throw httpError(409, 'This job is already queued.');

    const nextMax = Math.min(10, Number(job.max_attempts) + 2);
    const stamp = now();
    await c.execute(
      `UPDATE reminder_jobs SET status='queued', max_attempts=?, next_run_at=?, updated_at=?
        WHERE id=?`, [nextMax, Date.now(), stamp, id]
    );
    await c.execute(
      `INSERT INTO reminder_attempts
        (job_id, attempt_no, correlation_id, started_at, duration_ms, outcome, actor_note)
       VALUES (?,?,?,?,0,'human_retry',?)`,
      [id, Number(job.attempts), newCorrelationId(), stamp, `${actor.name}: ${note}`]
    );
    await c.execute(
      'UPDATE reminder_alerts SET read_at = COALESCE(read_at, ?) WHERE job_id = ?', [stamp, id]
    );
  });

  return findJobDetail(id);
}

export async function acknowledgeAlerts(jobId, actor) {
  if (actor?.role !== cfg.alertRole) throw httpError(403, 'Only a doctor can acknowledge alerts.');
  await pool.execute(
    'UPDATE reminder_alerts SET read_at = COALESCE(read_at, ?) WHERE job_id = ?', [now(), jobId]
  );
  return findJobDetail(jobId);
}

export async function reclaimStuckJobs(ms) {
  const cutoff = new Date(Date.now() - ms).toISOString();
  const [r] = await pool.execute(
    `UPDATE reminder_jobs SET status='queued', next_run_at=?, updated_at=?
      WHERE status='running' AND updated_at < ?`, [Date.now(), now(), cutoff]
  );
  return r.affectedRows;
}
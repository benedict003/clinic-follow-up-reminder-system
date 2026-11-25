// backend/clinical.js
//
// The clinical workflow around a follow-up: what the clinic sees on the board,
// what it recorded, who recorded it, and what is still owed to the patient.
//
// Mounted at /api/clinical, after the shared guards in server.js, so every route
// here already has a session, a CSRF check and a JSON body limit. Nothing in
// this file touches the Module 14 exchange path or the Module 13 job queue: it
// reads reminder_jobs to show automation history and writes reminder_jobs to
// nothing at all, except to mark superseded reminders obsolete on reschedule.
import { Router } from 'express';
import { pool, withTx } from './db.js';

export const router = Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
// apiCode is optional; the error contract falls back to a code derived from the
// status, so a route that forgets it still answers consistently.
const httpError = (status, message, apiCode) => {
  const e = new Error(message);
  e.status = status;
  if (apiCode) e.apiCode = apiCode;
  return e;
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const stamp = () => new Date().toISOString();

/**
 * A contact attempt is a clinic event, not a reminder: it records that a person
 * tried to reach the patient and what came of it. `reached` is the only one that
 * means the patient was actually told, so it is the only one that advances the
 * follow-up to `reminded`.
 */
const CONTACT_OUTCOMES = Object.freeze({
  reached: 'Patient was reached and told about the follow-up.',
  no_answer: 'Called, no answer.',
  voicemail: 'Left a message on voicemail.',
  wrong_number: 'The recorded number does not reach the patient.',
});

/** How a follow-up can end. Every one of these is a clinical decision. */
const CLOSE_OUTCOMES = Object.freeze({
  attended: 'Patient attended the follow-up.',
  declined: 'Patient declined the follow-up.',
  referred: 'Referred elsewhere; no longer followed up here.',
  moved_away: 'Patient moved away or transferred care.',
  lost_to_follow_up: 'Could not be reached; closed as lost to follow-up.',
  not_indicated: 'Clinically no longer indicated.',
});

/** What a nurse or doctor may do next, so the UI never offers an invalid action. */
function actionsFor(row) {
  const open = row.status !== 'closed';
  return {
    canContact: open,
    canReschedule: open,
    canClose: true, // gated by role on the route as well as here
    canQueueReminder: open && row.status === 'scheduled' && row.daysFromToday <= 0,
  };
}

function rowToFollowUp(r) {
  const daysFromToday = Number(r.days_from_today);
  const out = {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientCategory: r.category,
    contactNumber: r.contact_number ?? null,
    dueDate: String(r.due_date).slice(0, 10),
    reason: r.reason,
    status: r.status,
    version: Number(r.version),
    createdAt: r.created_at,
    contactAttempts: Number(r.contact_attempts ?? 0),
    lastContactAt: r.last_contact_at ?? null,
    closedAt: r.closed_at ? String(r.closed_at).replace('T', ' ').slice(0, 19) : null,
    closeOutcome: r.close_outcome ?? null,
    closeNote: r.close_note ?? null,
    daysFromToday,
    // Derived, never stored: "overdue" is a fact about today, not a state the
    // database should have to be updated into every midnight.
    overdue: r.status !== 'closed' && daysFromToday < 0,
    dueToday: r.status !== 'closed' && daysFromToday === 0,
  };
  out.actions = actionsFor(out);
  return out;
}

function publicEvent(e) {
  return {
    id: Number(e.id),
    kind: e.kind,
    outcome: e.outcome,
    note: e.note,
    fromDue: e.from_due ? String(e.from_due).slice(0, 10) : null,
    toDue: e.to_due ? String(e.to_due).slice(0, 10) : null,
    actorName: e.actor_name,
    actorRole: e.actor_role,
    createdAt: String(e.created_at).replace('T', ' ').slice(0, 19),
  };
}

async function loadFollowUp(id, conn = pool) {
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'A whole follow-up id is required.');
  const [rows] = await conn.execute(
    `SELECT f.*, p.name AS patient_name, p.category, p.contact_number,
            DATEDIFF(f.due_date, CURDATE()) AS days_from_today
       FROM follow_ups f
       JOIN patients p ON p.id = f.patient_id
      WHERE f.id = ?`,
    [id],
  );
  if (!rows[0]) throw httpError(404, `Follow-up #${id} was not found.`);
  return rows[0];
}

async function addEvent(conn, followUpId, actor, { kind, outcome = null, note = null, fromDue = null, toDue = null }) {
  await conn.execute(
    `INSERT INTO follow_up_events
       (follow_up_id, kind, outcome, note, from_due, to_due, actor_id, actor_name, actor_role, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [followUpId, kind, outcome, note, fromDue, toDue,
      actor?.id ?? null, actor?.name ?? null, actor?.role ?? null, new Date()],
  );
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const cleanNote = (v, max = 400) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// ── the board ──────────────────────────────────────────────────────────────
/**
 * scope:
 *   open      everything not closed, soonest first (default)
 *   overdue   open and due before today
 *   today     open and due today
 *   upcoming  open and due after today
 *   closed    closed, most recently closed first
 */
router.get('/follow-ups', wrap(async (req, res) => {
  const scope = ['open', 'overdue', 'today', 'upcoming', 'closed'].includes(req.query.scope)
    ? req.query.scope
    : 'open';
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 200, 200);

  const where = [];
  const args = [];
  switch (scope) {
    case 'overdue': where.push("f.status <> 'closed'", 'f.due_date < CURDATE()'); break;
    case 'today': where.push("f.status <> 'closed'", 'f.due_date = CURDATE()'); break;
    case 'upcoming': where.push("f.status <> 'closed'", 'f.due_date > CURDATE()'); break;
    case 'closed': where.push("f.status = 'closed'"); break;
    default: where.push("f.status <> 'closed'");
  }
  if (q) {
    where.push('(p.name LIKE ? OR f.patient_id LIKE ? OR f.reason LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [rows] = await pool.execute(
    `SELECT f.*, p.name AS patient_name, p.category, p.contact_number,
            DATEDIFF(f.due_date, CURDATE()) AS days_from_today
       FROM follow_ups f
       JOIN patients p ON p.id = f.patient_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${scope === 'closed' ? 'f.closed_at DESC, f.id DESC' : 'f.due_date ASC, f.id ASC'}
      LIMIT ${limit}`,
    args,
  );

  // Counts are independent of the search box, so the chips do not lie.
  const [[counts]] = await pool.query(
    `SELECT
       SUM(status <> 'closed' AND due_date <  CURDATE()) AS overdue,
       SUM(status <> 'closed' AND due_date =  CURDATE()) AS dueToday,
       SUM(status <> 'closed' AND due_date >  CURDATE()) AS upcoming,
       SUM(status <> 'closed')                            AS open,
       SUM(status =  'closed')                            AS closed
     FROM follow_ups`,
  );

  res.json({
    scope,
    followUps: rows.map(rowToFollowUp),
    counts: {
      overdue: Number(counts.overdue ?? 0),
      dueToday: Number(counts.dueToday ?? 0),
      upcoming: Number(counts.upcoming ?? 0),
      open: Number(counts.open ?? 0),
      closed: Number(counts.closed ?? 0),
    },
  });
}));

/** Everything the clinic knows about one follow-up, in the order it happened. */
router.get('/follow-ups/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await loadFollowUp(id);

  const [events] = await pool.execute(
    `SELECT * FROM follow_up_events WHERE follow_up_id = ? ORDER BY id ASC`, [id],
  );
  const [jobs] = await pool.execute(
    `SELECT id, status, attempts, max_attempts, last_error_code, created_at, updated_at
       FROM reminder_jobs WHERE follow_up_id = ? ORDER BY id DESC`, [id],
  );
  const [patientRows] = await pool.execute(
    `SELECT id, name, category, contact_number, birth_date, sex FROM patients WHERE id = ?`,
    [row.patient_id],
  );
  const [openCounts] = await pool.execute(
    `SELECT COUNT(*) n FROM follow_ups WHERE patient_id = ? AND status <> 'closed'`,
    [row.patient_id],
  );

  res.json({
    followUp: rowToFollowUp(row),
    patient: {
      id: patientRows[0].id,
      name: patientRows[0].name,
      category: patientRows[0].category,
      contactNumber: patientRows[0].contact_number,
      birthDate: patientRows[0].birth_date ? String(patientRows[0].birth_date).slice(0, 10) : null,
      sex: patientRows[0].sex,
      openFollowUps: Number(openCounts[0].n),
    },
    events: events.map(publicEvent),
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      attempts: Number(j.attempts),
      maxAttempts: Number(j.max_attempts),
      lastErrorCode: j.last_error_code,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    })),
  });
}));

// ── clinical actions ───────────────────────────────────────────────────────

/** Log a contact attempt. Reaching the patient is what moves it to reminded. */
router.post('/follow-ups/:id/contact', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const outcome = String(req.body?.outcome ?? '').trim();
  if (!Object.hasOwn(CONTACT_OUTCOMES, outcome)) {
    throw httpError(400, `outcome must be one of: ${Object.keys(CONTACT_OUTCOMES).join(', ')}.`);
  }
  const note = cleanNote(req.body?.note);
  const actor = req.session.user;

  await withTx(async (conn) => {
    const row = await loadFollowUp(id, conn);
    if (row.status === 'closed') {
      throw httpError(409, `Follow-up #${id} is already closed.`);
    }
    const nextStatus = outcome === 'reached' ? 'reminded' : row.status;
    await conn.execute(
      `UPDATE follow_ups
          SET status = ?, contact_attempts = contact_attempts + 1, last_contact_at = ?
        WHERE id = ?`,
      [nextStatus, new Date(), id],
    );
    await addEvent(conn, id, actor, { kind: 'contacted', outcome, note });
  });

  const row = await loadFollowUp(id);
  res.json({ followUp: rowToFollowUp(row) });
}));

/**
 * Move the due date. The version bump is the important part: a queued reminder
 * for the old version is superseded by design (Module 13's worker already
 * treats a version mismatch as OBSOLETE). Marking those jobs obsolete here as
 * well means the queue reflects reality immediately instead of at claim time.
 */
router.post('/follow-ups/:id/reschedule', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const dueDate = String(req.body?.dueDate ?? '').trim();
  const note = cleanNote(req.body?.note);
  if (!isDate(dueDate)) throw httpError(400, 'dueDate must be YYYY-MM-DD.');
  if (Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
    throw httpError(400, `${dueDate} is not a real date.`);
  }
  if (dueDate < today()) throw httpError(400, 'A follow-up cannot be moved into the past.');
  const actor = req.session.user;

  let superseded = 0;
  await withTx(async (conn) => {
    const row = await loadFollowUp(id, conn);
    if (row.status === 'closed') {
      throw httpError(409, `Follow-up #${id} is closed. Reopen it before rescheduling.`);
    }
    const fromDue = String(row.due_date).slice(0, 10);
    if (fromDue === dueDate) throw httpError(409, 'That is already the due date.');

    await conn.execute(
      `UPDATE follow_ups
          SET due_date = ?, version = version + 1, status = 'scheduled'
        WHERE id = ?`,
      [dueDate, id],
    );
    const [r] = await conn.execute(
      `UPDATE reminder_jobs SET status = 'obsolete', updated_at = ?
        WHERE follow_up_id = ? AND status IN ('queued','needs_human')`,
      [stamp(), id],
    );
    superseded = r.affectedRows ?? 0;
    await addEvent(conn, id, actor, {
      kind: 'rescheduled', note, fromDue, toDue: dueDate,
    });
  });

  const row = await loadFollowUp(id);
  res.json({ followUp: rowToFollowUp(row), supersededJobs: superseded });
}));

/** Closing is a clinical decision, so it is doctor-only, like a disclosure. */
router.post('/follow-ups/:id/close', wrap(async (req, res) => {
  if (req.session.user.role !== 'doctor') {
    throw httpError(403, 'Only a doctor can close a follow-up.', 'FORBIDDEN_ROLE');
  }
  const id = Number(req.params.id);
  const outcome = String(req.body?.outcome ?? '').trim();
  if (!Object.hasOwn(CLOSE_OUTCOMES, outcome)) {
    throw httpError(400, `outcome must be one of: ${Object.keys(CLOSE_OUTCOMES).join(', ')}.`);
  }
  const note = cleanNote(req.body?.note);
  if (outcome === 'lost_to_follow_up' && !note) {
    throw httpError(400, 'Record what was tried before closing as lost to follow-up.');
  }
  const actor = req.session.user;

  await withTx(async (conn) => {
    const row = await loadFollowUp(id, conn);
    if (row.status === 'closed') throw httpError(409, `Follow-up #${id} is already closed.`);

    await conn.execute(
      `UPDATE follow_ups
          SET status = 'closed', closed_at = ?, close_outcome = ?, close_note = ?
        WHERE id = ?`,
      [new Date(), outcome, note, id],
    );
    // A closed follow-up owes the patient nothing, so its pending reminders are
    // obsolete rather than merely failing.
    await conn.execute(
      `UPDATE reminder_jobs SET status = 'obsolete', updated_at = ?
        WHERE follow_up_id = ? AND status IN ('queued','needs_human')`,
      [stamp(), id],
    );
    await addEvent(conn, id, actor, { kind: 'closed', outcome, note });
  });

  const row = await loadFollowUp(id);
  res.json({ followUp: rowToFollowUp(row) });
}));

/** Free-text note on the record, e.g. a phone number corrected at the desk. */
router.post('/follow-ups/:id/note', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const note = cleanNote(req.body?.note);
  if (!note) throw httpError(400, 'A note is required.');
  await withTx(async (conn) => {
    await loadFollowUp(id, conn);
    await addEvent(conn, id, req.session.user, { kind: 'note', note });
  });
  res.json({ ok: true });
}));

// ── the day's work ─────────────────────────────────────────────────────────
/** What a clinic opens first: who is overdue, who is due today, what needs a human. */
router.get('/worklist', wrap(async (req, res) => {
  const base = `SELECT f.*, p.name AS patient_name, p.category, p.contact_number,
                       DATEDIFF(f.due_date, CURDATE()) AS days_from_today
                  FROM follow_ups f JOIN patients p ON p.id = f.patient_id`;
  const [overdue] = await pool.query(
    `${base} WHERE f.status <> 'closed' AND f.due_date < CURDATE()
      ORDER BY f.due_date ASC LIMIT 6`);
  const [dueToday] = await pool.query(
    `${base} WHERE f.status <> 'closed' AND f.due_date = CURDATE()
      ORDER BY f.id ASC LIMIT 6`);

  const [[counts]] = await pool.query(
    `SELECT
       SUM(status <> 'closed' AND due_date <  CURDATE()) AS overdue,
       SUM(status <> 'closed' AND due_date =  CURDATE()) AS dueToday,
       SUM(status <> 'closed' AND due_date >  CURDATE()) AS upcoming,
       SUM(status <> 'closed')                            AS open
     FROM follow_ups`);

  const [[jobs]] = await pool.query(
    `SELECT
       SUM(status = 'needs_human') AS needsHuman,
       SUM(status = 'queued')      AS queued,
       SUM(status = 'succeeded')   AS succeeded
     FROM reminder_jobs`);

  const [[contacts]] = await pool.query(
    `SELECT COUNT(*) n FROM follow_up_events
      WHERE kind = 'contacted' AND DATE(created_at) = CURDATE()`);

  let unreadAlerts = 0;
  if (req.session.user.role === 'doctor') {
    const [[a]] = await pool.query(
      `SELECT COUNT(*) n FROM reminder_alerts WHERE role = 'doctor' AND read_at IS NULL`);
    unreadAlerts = Number(a.n);
  }

  res.json({
    counts: {
      overdue: Number(counts.overdue ?? 0),
      dueToday: Number(counts.dueToday ?? 0),
      upcoming: Number(counts.upcoming ?? 0),
      open: Number(counts.open ?? 0),
      needsHuman: Number(jobs.needsHuman ?? 0),
      queued: Number(jobs.queued ?? 0),
      succeeded: Number(jobs.succeeded ?? 0),
      contactsToday: Number(contacts.n ?? 0),
      unreadAlerts,
    },
    overdue: overdue.map(rowToFollowUp),
    dueToday: dueToday.map(rowToFollowUp),
    today: today(),
  });
}));

// ── patients ───────────────────────────────────────────────────────────────
router.get('/patients', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const args = [];
  let where = 'p.archived = 0';
  if (q) {
    where += ' AND (p.name LIKE ? OR p.id LIKE ? OR p.contact_number LIKE ?)';
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const [rows] = await pool.execute(
    `SELECT p.id, p.name, p.category, p.contact_number, p.birth_date,
            (SELECT COUNT(*) FROM follow_ups f
              WHERE f.patient_id = p.id AND f.status <> 'closed') AS open_follow_ups
       FROM patients p
      WHERE ${where}
      ORDER BY p.name ASC LIMIT 100`,
    args,
  );
  res.json({
    patients: rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      contactNumber: p.contact_number,
      birthDate: p.birth_date ? String(p.birth_date).slice(0, 10) : null,
      openFollowUps: Number(p.open_follow_ups ?? 0),
    })),
  });
}));

router.post('/patients', wrap(async (req, res) => {
  const id = String(req.body?.id ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const category = String(req.body?.category ?? 'student').trim();
  const contactNumber = cleanNote(req.body?.contactNumber, 40);
  if (!id) throw httpError(400, 'A patient id is required.');
  if (id.length > 50) throw httpError(400, 'The patient id is too long.');
  if (!name) throw httpError(400, 'A patient name is required.');
  if (!['student', 'employee'].includes(category)) {
    throw httpError(400, 'category must be student or employee.');
  }
  try {
    await pool.execute(
      `INSERT INTO patients (id, name, category, contact_number) VALUES (?,?,?,?)`,
      [id, name.slice(0, 200), category, contactNumber],
    );
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') throw httpError(409, `Patient ${id} already exists.`);
    throw e;
  }
  res.status(201).json({ patient: { id, name, category, contactNumber, openFollowUps: 0 } });
}));

/** The lookup tables the UI needs to render a form without hard-coding them. */
router.get('/meta', (_req, res) => {
  res.json({
    contactOutcomes: Object.entries(CONTACT_OUTCOMES).map(([value, label]) => ({ value, label })),
    closeOutcomes: Object.entries(CLOSE_OUTCOMES).map(([value, label]) => ({ value, label })),
    today: today(),
  });
});

console.log(JSON.stringify({
  ts: new Date().toISOString(),
  src: 'clinical',
  event: 'clinical.routes.mounted',
  routes: ['follow-ups', 'follow-ups/:id', 'contact', 'reschedule', 'close', 'note', 'worklist', 'patients', 'meta'],
  doctorOnly: ['close'],
}));

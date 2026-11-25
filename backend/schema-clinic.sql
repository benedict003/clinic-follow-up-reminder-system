-- Module 15: clinical follow-up workflow.
--
-- Adds only what a clinic needs in order to act on a follow-up and to prove
-- afterwards what was done and by whom. Every statement is idempotent, so this
-- can be run against an existing database without losing Module 13/14 data.
--
-- Apply with:  cd backend && node --env-file=.env scripts/lab-sql.js --file schema-clinic.sql
--   or simply:  mysql -u root clinic_followup_lab < schema-clinic.sql

-- ── patients: a clinic cannot follow up a patient it cannot telephone ────────
-- contact_number is deliberately in the Module 14 WITHHELD list: it exists for
-- the clinic's own use and is never part of the minimised envelope.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40) NULL AFTER category,
  ADD COLUMN IF NOT EXISTS birth_date     DATE        NULL AFTER contact_number,
  ADD COLUMN IF NOT EXISTS sex            ENUM('female','male','other') NULL AFTER birth_date,
  ADD COLUMN IF NOT EXISTS archived       TINYINT     NOT NULL DEFAULT 0 AFTER sex;

-- ── follow_ups: closing a follow-up is a clinical decision with a reason ────
ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS closed_at       DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS close_outcome   VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS close_note      VARCHAR(400) NULL,
  ADD COLUMN IF NOT EXISTS contact_attempts INT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contact_at DATETIME    NULL;

CREATE INDEX IF NOT EXISTS idx_fu_due ON follow_ups (status, due_date);
CREATE INDEX IF NOT EXISTS idx_fu_patient ON follow_ups (patient_id, id);

-- ── the audit trail ────────────────────────────────────────────────────────
-- Append-only. One row per clinical action, with a snapshot of who did it, so
-- the record survives a patient or user being renamed later. The actor fields
-- are duplicated on purpose: a foreign key would change history when a user
-- changes, which is exactly what an audit trail must not do.
CREATE TABLE IF NOT EXISTS follow_up_events (
  id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  follow_up_id INT         NOT NULL,
  kind         ENUM('scheduled','contacted','rescheduled','closed','note') NOT NULL,
  outcome      VARCHAR(40) NULL,
  note         VARCHAR(400) NULL,
  from_due     DATE        NULL,
  to_due       DATE        NULL,
  actor_id     INT         NULL,
  actor_name   VARCHAR(200) NULL,
  actor_role   VARCHAR(20) NULL,
  created_at   DATETIME(3) NOT NULL,
  KEY idx_ev_fu (follow_up_id, id),
  KEY idx_ev_kind (kind, created_at),
  CONSTRAINT fk_ev_fu FOREIGN KEY (follow_up_id) REFERENCES follow_ups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

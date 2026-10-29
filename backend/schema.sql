-- backend/schema.sql  (run once: mysql -u root -p < schema.sql)
CREATE DATABASE IF NOT EXISTS clinic_followup_lab
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE clinic_followup_lab;

CREATE TABLE IF NOT EXISTS users (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(100) NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,
  role          ENUM('nurse','doctor') NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  active        TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    INT NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS patients (
  id       VARCHAR(50) PRIMARY KEY,
  name     VARCHAR(200) NOT NULL,
  category ENUM('student','employee') NOT NULL DEFAULT 'student'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS follow_ups (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  patient_id VARCHAR(50) NOT NULL,
  due_date   DATE NOT NULL,
  reason     VARCHAR(300) NOT NULL,
  status     ENUM('scheduled','reminded','closed') NOT NULL DEFAULT 'scheduled',
  version    INT NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at VARCHAR(30) NOT NULL,
  CONSTRAINT fk_fu_patient FOREIGN KEY (patient_id) REFERENCES patients(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminder_jobs (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  kind                VARCHAR(40)  NOT NULL,
  follow_up_id        INT          NOT NULL,
  follow_up_version   INT          NOT NULL,
  idempotency_key     CHAR(64)     NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'queued',
  attempts            INT          NOT NULL DEFAULT 0,
  max_attempts        INT          NOT NULL DEFAULT 4,
  correlation_id      CHAR(32)     NOT NULL,
  next_run_at         BIGINT       NOT NULL,
  last_error_code     VARCHAR(60)  NULL,
  last_error_text     VARCHAR(500) NULL,
  created_by          INT          NULL,
  created_at          VARCHAR(30)  NOT NULL,
  updated_at          VARCHAR(30)  NOT NULL,
  UNIQUE KEY uq_job_idem (idempotency_key),
  UNIQUE KEY uq_job_corr (correlation_id),
  KEY idx_job_poll (status, next_run_at),
  CONSTRAINT fk_job_fu FOREIGN KEY (follow_up_id) REFERENCES follow_ups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminder_attempts (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id         INT NOT NULL,
  attempt_no     INT NOT NULL,
  correlation_id CHAR(32) NOT NULL,
  started_at     VARCHAR(30) NOT NULL,
  duration_ms    INT NOT NULL DEFAULT 0,
  outcome        VARCHAR(20) NOT NULL,
  http_status    INT NULL,
  error_code     VARCHAR(60) NULL,
  error_text     VARCHAR(500) NULL,
  actor_note     VARCHAR(300) NULL,
  KEY idx_att_job (job_id, attempt_no),
  CONSTRAINT fk_att_job FOREIGN KEY (job_id) REFERENCES reminder_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminder_alerts (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id     INT NOT NULL,
  role       VARCHAR(20) NOT NULL,
  message    VARCHAR(400) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  read_at    VARCHAR(30) NULL,
  KEY idx_alert_role (role, read_at),
  CONSTRAINT fk_alert_job FOREIGN KEY (job_id) REFERENCES reminder_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
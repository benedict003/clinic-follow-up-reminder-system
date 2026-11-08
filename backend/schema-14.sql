-- Module 14: exchange metadata only.
-- No plaintext, no ciphertext, no key material.

CREATE TABLE IF NOT EXISTS secure_outbox (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  follow_up_id     BIGINT NULL,
  message_id       CHAR(36)     NOT NULL,
  sender           VARCHAR(40)  NOT NULL,
  recipient        VARCHAR(40)  NOT NULL,
  alg              VARCHAR(32)  NOT NULL,
  enc              VARCHAR(32)  NOT NULL,
  sig              VARCHAR(32)  NOT NULL,
  key_id           VARCHAR(40)  NOT NULL,
  plaintext_bytes  INT          NOT NULL,
  ciphertext_bytes INT          NOT NULL,
  payload_sha256   CHAR(64)     NOT NULL,
  status           ENUM('sealed','delivered','rejected','failed') NOT NULL DEFAULT 'sealed',
  http_status      INT          NULL,
  error_code       VARCHAR(48)  NULL,
  detail           VARCHAR(400) NULL,
  issued_at        DATETIME(3)  NOT NULL,
  created_at       DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_outbox_message (message_id),
  KEY idx_outbox_followup (follow_up_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS secure_inbox (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  message_id      CHAR(36)    NOT NULL,
  sender          VARCHAR(40) NOT NULL,
  recipient       VARCHAR(40) NOT NULL,
  key_id          VARCHAR(40) NOT NULL,
  payload_sha256  CHAR(64)    NOT NULL,
  plaintext_bytes INT         NOT NULL,
  issued_at       DATETIME(3) NOT NULL,
  received_at     DATETIME(3) NOT NULL,
  UNIQUE KEY uq_inbox_message (message_id),
  KEY idx_inbox_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
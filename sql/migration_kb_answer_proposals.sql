-- PLN-260810 S4 — agent answer proposals awaiting a knowledge owner's approval.
--
-- New table only; nothing existing is altered. Apply BEFORE deploying the code
-- (staging runs DB_SYNCHRONIZE=false).
--
-- Rollback:
--   DROP TABLE kb_answer_proposals;
--
-- No FK to kb_documents: this project hard-deletes documents (SPEC §13), and a
-- proposal must survive the removal of the document it produced — otherwise the
-- record of who approved what disappears with it.

CREATE TABLE IF NOT EXISTS kb_answer_proposals (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT       NOT NULL,
  conversation_id BIGINT       NULL COMMENT 'where the answer was given; null once the conversation is purged',
  question        VARCHAR(500) NOT NULL,
  answer          TEXT         NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
  proposed_by     BIGINT       NOT NULL,
  decided_by      BIGINT       NULL,
  decided_at      DATETIME     NULL,
  reject_reason   VARCHAR(500) NULL COMMENT 'shown to the proposer — an unexplained no repeats itself',
  document_id     BIGINT       NULL COMMENT 'kb_documents.id created on approval',
  created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  -- The review queue reads by tenant + status, oldest first.
  KEY idx_kbprop_queue (tenant_id, status, created_at),
  KEY idx_kbprop_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

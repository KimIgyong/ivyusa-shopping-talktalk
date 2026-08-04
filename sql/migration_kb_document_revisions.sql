-- PLN-260804-Knowledge-ConflictEdit-Revisions T3 — document revision history.
--
-- New table only; nothing existing is altered. Apply BEFORE deploying the code
-- (staging runs DB_SYNCHRONIZE=false).
--
-- Rollback: DROP TABLE IF EXISTS kb_document_revisions;
--
-- No FK on document_id on purpose: documents are hard-deleted in this project
-- (SPEC §13), and the history has to outlive the document it describes.

CREATE TABLE IF NOT EXISTS kb_document_revisions (
  id                   BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id            BIGINT       NOT NULL,
  document_id          BIGINT       NOT NULL,
  revision_no          INT          NOT NULL COMMENT 'per document, starting at 1',
  title                VARCHAR(255) NOT NULL,
  category             VARCHAR(64)      NULL,
  content              LONGTEXT         NULL,
  source_url           VARCHAR(512)     NULL,
  effective_from       DATE             NULL,
  review_interval_days INT              NULL,
  active               TINYINT(1)   NOT NULL DEFAULT 1,
  changed_fields       JSON             NULL COMMENT '["title","content"]',
  change_kind          VARCHAR(16)  NOT NULL COMMENT 'baseline|create|update|restore|delete',
  -- NULL on a baseline row: it captures the state as it stood before this
  -- feature existed, and nobody can be credited with it.
  actor_user_id        BIGINT           NULL,
  restored_from        INT              NULL COMMENT 'revision_no this one was restored from',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kbrev (tenant_id, document_id, revision_no),
  KEY idx_kbrev_doc (tenant_id, document_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

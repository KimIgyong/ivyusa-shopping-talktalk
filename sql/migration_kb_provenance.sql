-- PLN-Ops-Logs-Stats-KnowledgeConflict S4 — knowledge provenance, staleness
-- and conflict review.
--
-- Additive only: new nullable columns + one new table. Apply BEFORE deploying
-- the code (staging runs DB_SYNCHRONIZE=false).
--
-- Rollback:
--   DROP TABLE IF EXISTS kb_conflicts;
--   ALTER TABLE kb_documents
--     DROP COLUMN created_at, DROP COLUMN source_url, DROP COLUMN owner_user_id,
--     DROP COLUMN effective_from, DROP COLUMN review_interval_days,
--     DROP COLUMN reviewed_at, DROP COLUMN reviewed_by, DROP COLUMN superseded_by;

-- 1) Provenance + staleness metadata.
--
-- `updated_at` was the only signal a document was old, and it moves for any
-- edit — including one that did not revisit the facts. effective_from records
-- when the policy itself took effect (the US policy documents state this) and
-- review_interval_days makes "due for review" answerable rather than a guess.
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kb_documents' AND COLUMN_NAME = 'created_at');
SET @sql := IF(@has = 0, '
  ALTER TABLE kb_documents
    ADD COLUMN created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN source_url           VARCHAR(512)     NULL,
    ADD COLUMN owner_user_id        BIGINT           NULL,
    ADD COLUMN effective_from       DATE             NULL,
    ADD COLUMN review_interval_days INT              NULL,
    ADD COLUMN reviewed_at          DATETIME         NULL,
    ADD COLUMN reviewed_by          BIGINT           NULL,
    ADD COLUMN superseded_by        BIGINT           NULL
', 'SELECT "kb_documents provenance columns already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing rows predate created_at; seed it from updated_at so "added on" is
-- not uniformly the migration timestamp.
--
-- ⚠️ `updated_at` is `ON UPDATE CURRENT_TIMESTAMP`, so touching a row bumps it.
-- Assigning it explicitly (even to its own value) suppresses that — without the
-- second assignment this statement rewrites every document's "last edited" to
-- the migration timestamp, destroying the staleness signal these columns exist
-- to provide. Observed on staging 2026-08-04: 230 rows bumped, recovered from
-- created_at, which had captured the pre-update values.
UPDATE kb_documents
   SET created_at = updated_at,
       updated_at = updated_at
 WHERE updated_at IS NOT NULL AND created_at > updated_at;

-- 2) Conflict review queue.
--
-- A pair is stored once, always with the lower document id first, so the same
-- two documents cannot be queued twice in mirror order.
CREATE TABLE IF NOT EXISTS kb_conflicts (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT       NOT NULL,
  doc_a_id     BIGINT       NOT NULL,
  doc_b_id     BIGINT       NOT NULL,
  similarity   DECIMAL(5,4)     NULL,
  verdict      VARCHAR(16)      NULL COMMENT 'conflict|duplicate|complementary',
  rationale    TEXT             NULL COMMENT 'LLM explanation, moderation-checked',
  status       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|resolved|dismissed',
  resolution   VARCHAR(16)      NULL COMMENT 'kept_a|kept_b|kept_both',
  resolved_by  BIGINT           NULL,
  resolved_at  DATETIME         NULL,
  detected_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kbconflict_pair (tenant_id, doc_a_id, doc_b_id),
  KEY idx_kbconflict_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

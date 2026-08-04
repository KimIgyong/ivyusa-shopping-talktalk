-- PLN-260804-Knowledge-ConflictEdit-Revisions T1 — judgement failure visibility.
--
-- Additive only: four nullable/defaulted columns. Apply BEFORE deploying the
-- code (staging runs DB_SYNCHRONIZE=false).
--
-- Rollback:
--   ALTER TABLE kb_conflicts
--     DROP COLUMN failure_reason, DROP COLUMN attempts,
--     DROP COLUMN rationale_withheld, DROP COLUMN last_attempt_at;
--
-- No backfill UPDATE here on purpose. kb_conflicts.detected_at is a plain
-- CreateDateColumn, but touching rows to seed defaults would be pointless —
-- column defaults cover every existing row. (See FIX/PR #93: a backfill UPDATE
-- against a table with ON UPDATE CURRENT_TIMESTAMP rewrites that column unless
-- it is assigned explicitly.)

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'kb_conflicts'
               AND COLUMN_NAME = 'failure_reason');
SET @sql := IF(@has = 0, '
  ALTER TABLE kb_conflicts
    ADD COLUMN failure_reason     VARCHAR(24) NULL
        COMMENT ''model_error|parse_fail|bad_verdict — set only when status=failed'',
    ADD COLUMN attempts           INT NOT NULL DEFAULT 1,
    ADD COLUMN rationale_withheld TINYINT(1) NOT NULL DEFAULT 0
        COMMENT ''verdict kept, rationale suppressed by the moderation gate'',
    ADD COLUMN last_attempt_at    DATETIME NULL
', 'SELECT "kb_conflicts failure columns already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

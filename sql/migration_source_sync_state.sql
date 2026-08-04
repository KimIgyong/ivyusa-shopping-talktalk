-- PLN-260804-Knowledge-Source-Ingestion S1 — per-source sync state.
--
-- Additive only. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback:
--   ALTER TABLE knowledge_sources
--     DROP COLUMN last_sync_at, DROP COLUMN last_sync_status, DROP COLUMN last_sync_result;
--
-- No backfill: every existing source has never synced, which is exactly what
-- NULL means here.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'knowledge_sources'
               AND COLUMN_NAME = 'last_sync_at');
SET @sql := IF(@has = 0, '
  ALTER TABLE knowledge_sources
    ADD COLUMN last_sync_at     DATETIME    NULL,
    ADD COLUMN last_sync_status VARCHAR(16) NULL COMMENT ''ok|failed — NULL means never synced'',
    ADD COLUMN last_sync_result JSON        NULL COMMENT ''{created,updated,skipped,hidden,failed}''
', 'SELECT "knowledge_sources sync columns already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

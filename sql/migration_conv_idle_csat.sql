-- PLN-260810-Idle-Close-Csat P1 — idle sweep state + satisfaction rating.
--
-- Additive only. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback:
--   ALTER TABLE conversations DROP INDEX idx_conv_idle,
--     DROP COLUMN idle_prompt_at, DROP COLUMN csat_rating, DROP COLUMN csat_rated_at;
--
-- idle_prompt_at is both a timer and a latch: non-null means the "anything
-- else?" question already went out, so a sweep running every 30 seconds cannot
-- ask the same customer twice. NULL for every existing row is correct — none
-- of them has been asked.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'idle_prompt_at');
SET @sql := IF(@has = 0, '
  ALTER TABLE conversations
    ADD COLUMN idle_prompt_at DATETIME NULL
        COMMENT ''when the idle check was sent; also the ask-once latch'',
    ADD COLUMN csat_rating    TINYINT  NULL COMMENT ''customer satisfaction 1..5'',
    ADD COLUMN csat_rated_at  DATETIME NULL
', 'SELECT "conversations.idle_prompt_at already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The sweep filters on status first, then on the latch.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations'
               AND INDEX_NAME = 'idx_conv_idle');
SET @sql := IF(@idx = 0,
  'ALTER TABLE conversations ADD INDEX idx_conv_idle (status, idle_prompt_at)',
  'SELECT "idx_conv_idle already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

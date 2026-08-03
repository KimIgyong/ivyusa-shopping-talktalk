-- PLN-Ops-Logs-Stats-KnowledgeConflict S3 — customer question statistics.
--
-- Additive only: new nullable columns + new tables, so old code running against
-- this schema is unaffected. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback:
--   DROP TABLE IF EXISTS question_stats_daily;
--   DROP TABLE IF EXISTS question_clusters;
--   ALTER TABLE messages DROP COLUMN intent, DROP COLUMN intent_confidence;
--   (drop idx_msg_intent first if the columns are indexed)

-- 1) Persist the intent the RAG layer already computes per message and
--    currently throws away after a single needsOrderData check.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'intent');
SET @sql := IF(@col = 0,
  'ALTER TABLE messages ADD COLUMN intent VARCHAR(48) NULL, ADD COLUMN intent_confidence DECIMAL(4,3) NULL',
  'SELECT "messages.intent already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_msg_intent');
SET @sql := IF(@idx = 0,
  'ALTER TABLE messages ADD INDEX idx_msg_intent (tenant_id, intent)',
  'SELECT "idx_msg_intent already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Daily aggregate snapshots.
--
-- One table with a `dimension` axis rather than one table per axis: the
-- aggregation job, the read API and the console screen then stay single
-- implementations, and a fifth lens costs no schema change. It also outlives
-- the 365-day retention purge, which hard-deletes the raw messages these
-- numbers are derived from.
--
-- dim_label holds a keyword or a representative question and is scrubbed of
-- PII before insert; it is an aggregate label, not personal data.
CREATE TABLE IF NOT EXISTS question_stats_daily (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT       NOT NULL,
  stat_date       DATE         NOT NULL,
  dimension       VARCHAR(16)  NOT NULL COMMENT 'intent|category|document|keyword|cluster',
  dim_key         VARCHAR(128) NOT NULL COMMENT 'stable id within the dimension',
  dim_label       VARCHAR(255)     NULL COMMENT 'human-readable label (PII-scrubbed)',
  asked           INT          NOT NULL DEFAULT 0,
  escalated       INT          NOT NULL DEFAULT 0,
  no_source       INT          NOT NULL DEFAULT 0 COMMENT 'answered with no KB citation',
  avg_confidence  DECIMAL(5,4)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_qstat (tenant_id, stat_date, dimension, dim_key),
  KEY idx_qstat_lookup (tenant_id, dimension, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Similar-question clusters. Centroids persist so each day's questions are
--    assigned incrementally instead of re-clustering the whole history.
CREATE TABLE IF NOT EXISTS question_clusters (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT       NOT NULL,
  label         VARCHAR(255)     NULL COMMENT 'representative question (PII-scrubbed)',
  centroid      JSON             NULL COMMENT 'running mean of member embeddings',
  size          INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qcluster_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PLN-260804-Knowledge-ProductGroup-CsvImport P1 — document group axis.
--
-- Additive only. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback:
--   ALTER TABLE kb_documents DROP INDEX uk_kb_extkey, DROP INDEX idx_kb_group;
--   ALTER TABLE kb_documents DROP COLUMN doc_group, DROP COLUMN external_key;
--
-- No backfill UPDATE: the column default assigns every existing row to
-- 'counsel' as it is added. That also keeps this migration away from
-- kb_documents.updated_at, which is ON UPDATE CURRENT_TIMESTAMP and was
-- rewritten wholesale by a backfill on 2026-08-04 (PR #93).
--
-- Named doc_group, not `group`: the latter is a MySQL reserved word and would
-- need backticking at every call site.
--
-- external_key is VARCHAR(255): Shopify handles are slugified product titles
-- and the supplied catalogue peaks at 185 characters (the 63-character average
-- is what made a shorter column look safe). (tenant_id, doc_group,
-- external_key) stays well inside InnoDB's 3072-byte index key limit.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'kb_documents'
               AND COLUMN_NAME = 'doc_group');
SET @sql := IF(@has = 0, '
  ALTER TABLE kb_documents
    ADD COLUMN doc_group    VARCHAR(16)  NOT NULL DEFAULT ''counsel''
        COMMENT ''counsel|product — closed set'',
    ADD COLUMN external_key VARCHAR(255) NULL
        COMMENT ''stable key from the origin system (product: Shopify Handle)''
', 'SELECT "kb_documents.doc_group already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kb_documents'
               AND INDEX_NAME = 'idx_kb_group');
SET @sql := IF(@idx = 0,
  'ALTER TABLE kb_documents ADD INDEX idx_kb_group (tenant_id, doc_group)',
  'SELECT "idx_kb_group already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- NULL external_key repeats freely under a UNIQUE index in MySQL, so the 230
-- existing documents and every hand-written one stay unconstrained; only
-- imported rows, which always carry a key, are deduplicated.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kb_documents'
               AND INDEX_NAME = 'uk_kb_extkey');
SET @sql := IF(@idx = 0,
  'ALTER TABLE kb_documents ADD UNIQUE KEY uk_kb_extkey (tenant_id, doc_group, external_key)',
  'SELECT "uk_kb_extkey already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- PLN-260807-Catalog-To-RAG-Product-Knowledge P0 — capture the storefront SKU.
--
-- Additive only. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback:
--   ALTER TABLE products_cache DROP INDEX idx_prdc_sku, DROP COLUMN sku;
--
-- Nullable with no backfill: the value arrives on the next storefront sync,
-- and an empty string would be indistinguishable from "this product has no
-- SKU" (29 of 2,275 products on the live storefront genuinely have none).
--
-- The index is NOT unique. In the supplied catalogue export SKU repeats across
-- products and is blank on others (REQ-260804 §2-1), so it identifies a lookup
-- target, never a row. Nothing keys on it.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'products_cache'
               AND COLUMN_NAME = 'sku');
SET @sql := IF(@has = 0, '
  ALTER TABLE products_cache
    ADD COLUMN sku VARCHAR(64) NULL
        COMMENT ''storefront variant SKU — lookup aid, not an identity key''
', 'SELECT "products_cache.sku already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products_cache'
               AND INDEX_NAME = 'idx_prdc_sku');
SET @sql := IF(@idx = 0,
  'ALTER TABLE products_cache ADD INDEX idx_prdc_sku (tenant_id, sku)',
  'SELECT "idx_prdc_sku already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

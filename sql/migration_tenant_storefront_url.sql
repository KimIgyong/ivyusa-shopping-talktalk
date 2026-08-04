-- PLN-260804-Product-Link-Recommendation L1 — customer-facing storefront origin.
--
-- Additive only. Apply BEFORE deploying the code (staging runs
-- DB_SYNCHRONIZE=false).
--
-- Rollback: ALTER TABLE tenants DROP COLUMN storefront_url;
--
-- Distinct from shop_domain on purpose: that column holds the Shopify admin
-- domain (ambshop-dev.myshopify.com), not the address customers see. Deriving
-- product links from it would send shoppers to the wrong host, and the second
-- tenant is on cafe24 rather than Shopify at all.
--
-- Left NULL by default: with no origin recorded there is no way to tell a
-- tenant's own product URL from an arbitrary link that arrived in an uploaded
-- CSV, so citations simply render without links until it is set.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'tenants'
               AND COLUMN_NAME = 'storefront_url');
SET @sql := IF(@has = 0,
  'ALTER TABLE tenants ADD COLUMN storefront_url VARCHAR(255) NULL
     COMMENT ''customer-facing shop origin, e.g. https://ivyusa.com''',
  'SELECT "tenants.storefront_url already present"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

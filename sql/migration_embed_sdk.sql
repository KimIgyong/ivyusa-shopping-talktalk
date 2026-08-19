-- migration_embed_sdk.sql — embed SDK foundations (PLN-260819 S1/S2)
--
-- Adds:
--   tenants.embed_origins        json  — domains allowed to embed this widget
--   tenants.embed_secret         bytes — AES-256-GCM secret for signed identity
--   customers.external_customer_id     — user id from the customer's own system
--
-- NULL semantics, all three (no backfill, by design):
--   embed_origins        NULL = never configured, and resolves at READ time to the
--                        tenant's own storefront — NOT to "allow everything". A
--                        backfill would freeze today's storefront into the row.
--   embed_secret         NULL = signed identity not set up for this tenant.
--   external_customer_id NULL for every customer bound by a platform id instead;
--                        MySQL unique indexes permit repeated NULLs, which is what
--                        the three existing identity keys already rely on.
--
-- Run BEFORE deploying the backend (old code + new columns = safe; new code +
-- old schema = 500 on every widget boot). Guarded, so a re-run is a no-op.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants'
       AND COLUMN_NAME = 'embed_origins') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `embed_origins` json NULL AFTER `widget_theme`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants'
       AND COLUMN_NAME = 'embed_secret') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `embed_secret` varbinary(512) NULL AFTER `embed_origins`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customers'
       AND COLUMN_NAME = 'external_customer_id') = 0,
  'ALTER TABLE `customers` ADD COLUMN `external_customer_id` varchar(120) NULL AFTER `cafe24_member_id`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The unique key is what makes a repeated identify() converge on one row instead
-- of growing a customer per sign-in.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customers'
       AND INDEX_NAME = 'uq_customers_tenant_external') = 0,
  'ALTER TABLE `customers` ADD UNIQUE KEY `uq_customers_tenant_external` (`tenant_id`, `external_customer_id`)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rollback (index first, then the columns; safe against the old code, which
-- never reads any of them):
--   ALTER TABLE `customers` DROP INDEX `uq_customers_tenant_external`,
--                           DROP COLUMN `external_customer_id`;
--   ALTER TABLE `tenants` DROP COLUMN `embed_secret`, DROP COLUMN `embed_origins`;

-- migration_tenant_uuid.sql — external tenant identifier
-- Adds tenants.uuid (char(36), unique), backfills existing rows, locks it down.
-- Admin API/console address tenants by UUID; the bigint PK stays for FKs.
-- Run AFTER migration_tenant_slug.sql on databases that predate this column.
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'uuid'` before running.

ALTER TABLE `tenants`
  ADD COLUMN `uuid` char(36) COLLATE utf8mb4_unicode_ci NULL AFTER `id`;

UPDATE `tenants` SET `uuid` = UUID() WHERE `uuid` IS NULL;

ALTER TABLE `tenants`
  MODIFY `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  ADD UNIQUE KEY `uk_tenant_uuid` (`uuid`);

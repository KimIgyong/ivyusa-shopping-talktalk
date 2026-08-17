-- migration_notification_channels.sql — per-tenant delivery policy
-- (PLN-260817-Widget-Header-Prefs-Cleanup)
--
-- Adds tenants.notification_channels: `{ "<category>": ["email","sms",...] }`,
-- the external channels this shop may use for each notification category.
--
-- It is a CEILING on delivery, not a customer preference. Below it, each
-- customer's own `notification_prefs` row still decides — which is what keeps
-- the mobile app's push toggle working now that the widget offers only a single
-- marketing opt-out instead of the full category × channel grid.
--
-- NULL means "not configured" and imposes no ceiling at all, so every existing
-- tenant keeps sending exactly what it sent before this column existed. There is
-- deliberately no backfill: writing today's effective policy into every row
-- would freeze it for shops that never made that choice.
--
-- Run BEFORE deploying the backend (old code + new column = safe; new code +
-- old schema = 500 the first time a notification is delivered).
-- Idempotence: guarded, so a re-run is a no-op rather than an error.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants'
       AND COLUMN_NAME = 'notification_channels') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `notification_channels` json NULL AFTER `widget_tab_position`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rollback (safe against the old code, which never reads it):
--   ALTER TABLE `tenants` DROP COLUMN `notification_channels`;

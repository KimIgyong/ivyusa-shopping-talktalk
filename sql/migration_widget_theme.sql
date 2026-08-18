-- migration_widget_theme.sql — per-tenant widget theme (PLN-260818)
--
-- Adds tenants.widget_theme: `{ "brand": "#RRGGBB", "headerStyle": "white"|"brand" }`.
--
-- One brand colour is stored, not a palette. The nine-stop ramp and every
-- foreground colour are computed from it (packages/types/common/widget-theme.ts)
-- so the console preview, the API and the widget cannot disagree about what a
-- given brand colour looks like.
--
-- NULL means "never themed" and resolves to the built-in palette, so a tenant
-- that never opens the setting renders exactly what it renders today. No
-- backfill: writing the current palette into every row would freeze it for shops
-- that never chose it.
--
-- Run BEFORE deploying the backend (old code + new column = safe).
-- Idempotence: guarded, so a re-run is a no-op.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants'
       AND COLUMN_NAME = 'widget_theme') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `widget_theme` json NULL AFTER `notification_channels`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rollback (safe against the old code, which never reads it):
--   ALTER TABLE `tenants` DROP COLUMN `widget_theme`;

-- migration_widget_tab_config.sql — widget tab set + tab position (PLN-260817-Widget-Tab-Config)
--
-- Adds two tenant console settings:
--   widget_tabs          which tabs the widget shows, as a JSON array of keys
--                        ('notifications' | 'orders' | 'chat'), in display order.
--   widget_tab_position  where the tab bar sits: 'top' (current behaviour) or 'bottom'.
--
-- `widget_tabs` is NULLABLE and every existing row stays NULL, on purpose.
-- NULL means "this tenant has not configured tabs", which the API resolves to
-- WIDGET_TABS_DEFAULT at read time. Writing the default array into every row
-- instead would freeze today's default into rows nobody chose it for, and any
-- later change to that default would need a second backfill to undo.
--
-- Run BEFORE deploying the backend (old code + new columns = safe; new code +
-- old schema = 500 when the session mapper reads the columns).
--
-- Idempotence: each column is checked separately, so an interrupted run resumes
-- correctly instead of being skipped wholesale on retry.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'widget_tabs') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `widget_tabs` json NULL AFTER `widget_copy`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'widget_tab_position') = 0,
  'ALTER TABLE `tenants` ADD COLUMN `widget_tab_position` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''top'' AFTER `widget_tabs`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rollback (safe against the old code, which reads neither column):
--   ALTER TABLE `tenants` DROP COLUMN `widget_tab_position`, DROP COLUMN `widget_tabs`;

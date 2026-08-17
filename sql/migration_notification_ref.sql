-- migration_notification_ref.sql — notification → in-app record reference (PLN-260817 S5)
--
-- Adds notifications.ref_type / ref_id: what the notification is ABOUT, as a
-- record the client can act on. `link_url` already covers "navigate to this URL";
-- this covers "open this thing in the widget".
--
-- Why now: ReviewService.requestReview has always published `orderItemId` on the
-- NOTIFICATION event, but NotifyInput had no such field, so it was silently
-- dropped and never persisted. The widget's "⭐ Write a review" action on a
-- review notification therefore had no item id to open the form with.
--
-- Run BEFORE deploying the backend (old code + new columns = safe; new code +
-- old schema = 500 on every notification insert).
--
-- Existing rows stay NULL on purpose — there is no backfill, and a review
-- notification written before this migration simply renders without the action.
--
-- Idempotence: this script creates THREE objects (two columns and an index) and
-- checks each one separately. Guarding the whole file on `ref_type` alone would
-- mean an interrupted run — columns added, index not yet created — is skipped
-- entirely on retry, leaving `idx_notif_ref` permanently missing.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'ref_type') = 0,
  'ALTER TABLE `notifications` ADD COLUMN `ref_type` varchar(24) COLLATE utf8mb4_unicode_ci NULL AFTER `link_url`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'ref_id') = 0,
  'ALTER TABLE `notifications` ADD COLUMN `ref_id` bigint NULL AFTER `ref_type`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notif_ref') = 0,
  'CREATE INDEX `idx_notif_ref` ON `notifications` (`ref_type`, `ref_id`)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rollback (safe against the old code, which never reads these):
--   DROP INDEX `idx_notif_ref` ON `notifications`;
--   ALTER TABLE `notifications` DROP COLUMN `ref_id`, DROP COLUMN `ref_type`;

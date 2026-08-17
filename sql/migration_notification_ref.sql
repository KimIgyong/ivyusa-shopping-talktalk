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
-- Idempotence: guard with `SHOW COLUMNS FROM notifications LIKE 'ref_type'`.
-- Existing rows stay NULL on purpose — there is no backfill, and a review
-- notification written before this migration simply renders without the action.

ALTER TABLE `notifications`
  ADD COLUMN `ref_type` varchar(24) COLLATE utf8mb4_unicode_ci NULL AFTER `link_url`,
  ADD COLUMN `ref_id` bigint NULL AFTER `ref_type`;

CREATE INDEX `idx_notif_ref` ON `notifications` (`ref_type`, `ref_id`);

-- Rollback (safe against the old code, which never reads these):
--   DROP INDEX `idx_notif_ref` ON `notifications`;
--   ALTER TABLE `notifications` DROP COLUMN `ref_id`, DROP COLUMN `ref_type`;

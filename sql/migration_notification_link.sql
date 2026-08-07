-- migration_notification_link.sql — campaign deep-link (PLN-260807-IvyusaApp-Revamp F4, A-9)
-- Adds notifications.link_url: the deep-link target a campaign carries
-- (content.link → notifications.link_url → push data.url/productHandle → client route).
-- NULL = plain notification, no routing target.
-- Run BEFORE deploying the code (old code + new column = safe).
-- Idempotence: guard with `SHOW COLUMNS FROM notifications LIKE 'link_url'`.
--
-- Apply:   mysql ... < sql/migration_notification_link.sql
-- Rollback (additive column — code rollback alone is safe):
--   ALTER TABLE `notifications` DROP COLUMN `link_url`;

ALTER TABLE `notifications`
  ADD COLUMN `link_url` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `status_badge`;

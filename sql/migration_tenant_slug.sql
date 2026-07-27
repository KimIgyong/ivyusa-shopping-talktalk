-- migration_tenant_slug.sql — per-tenant login pages (/<slug>)
-- Adds tenants.slug (unique, URL-safe), backfills existing rows, then locks it down.
-- Run AFTER 01-schema.sql deployments that predate the slug column (staging/prod).
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'slug'` before running.

ALTER TABLE `tenants`
  ADD COLUMN `slug` varchar(64) COLLATE utf8mb4_unicode_ci NULL AFTER `shop_domain`;

-- Backfill: slugified name, else the shop_domain prefix (acme.myshopify.com -> acme).
UPDATE `tenants`
SET `slug` = TRIM(BOTH '-' FROM REGEXP_REPLACE(
  LOWER(COALESCE(NULLIF(`name`, ''), SUBSTRING_INDEX(`shop_domain`, '.', 1))),
  '[^a-z0-9]+', '-'))
WHERE `slug` IS NULL;

-- Collisions with reserved SPA routes, or empty results, fall back to tenant-<id>.
UPDATE `tenants`
SET `slug` = CONCAT('tenant-', `id`)
WHERE `slug` = '' OR `slug` IS NULL OR `slug` IN (
  'admin','login','logout','api','assets','widget','dashboard','live-chat','history',
  'ai-setting','knowledge','customers','orders','campaigns','users','settings','index','static'
);

-- Duplicate slugs (same name on two tenants): keep the oldest, suffix the rest with -<id>.
UPDATE `tenants` t
JOIN (
  SELECT `slug`, MIN(`id`) AS keep_id FROM `tenants` GROUP BY `slug` HAVING COUNT(*) > 1
) d ON d.`slug` = t.`slug` AND t.`id` <> d.keep_id
SET t.`slug` = CONCAT(t.`slug`, '-', t.`id`);

ALTER TABLE `tenants`
  MODIFY `slug` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  ADD UNIQUE KEY `uk_tenant_slug` (`slug`);

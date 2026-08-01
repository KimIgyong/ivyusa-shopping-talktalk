-- Migration: Web Push (VAPID) support (REQ-PWA-20260802, PLN-PWA-20260802 P1)
-- Apply BEFORE deploying the code that reads these columns (old code + new column = safe).
-- device_tokens: token widens to TEXT (Web Push subscription JSON — endpoints exceed
--   255 chars); uniqueness moves to token_hash (SHA-256 hex, computed in the app layer).
--   Existing expo rows are backfilled via SHA2(token, 256).
-- provider column already accommodates 'webpush' (varchar(16)); no other tables change.
--
-- Apply:   mysql ... < sql/migration_push_webpush.sql
-- Re-run:  after completion, only the DROP INDEX / ADD UNIQUE step errors (index
--          already gone / already present) — harmless, data is unaffected.
-- Rollback (only safe while all tokens are <=255 chars, i.e. no webpush rows yet):
--   ALTER TABLE `device_tokens`
--     MODIFY `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
--     DROP INDEX `uk_device_token_hash`,
--     ADD UNIQUE KEY `uk_device_token` (`token`),
--     DROP COLUMN `token_hash`;

-- Order matters: the old UNIQUE index on `token` must be gone BEFORE the column
-- widens to TEXT (MySQL rejects a TEXT column inside a key without a prefix
-- length — error 1170).

ALTER TABLE `device_tokens`
  ADD COLUMN `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NULL AFTER `token`;

UPDATE `device_tokens` SET `token_hash` = SHA2(`token`, 256) WHERE `token_hash` IS NULL;

ALTER TABLE `device_tokens`
  MODIFY `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  ADD UNIQUE KEY `uk_device_token_hash` (`token_hash`),
  DROP INDEX `uk_device_token`;

ALTER TABLE `device_tokens`
  MODIFY `token` text COLLATE utf8mb4_unicode_ci NOT NULL;

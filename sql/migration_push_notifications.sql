-- Migration: mobile push notifications (REQ-MobileApp M1, PLN-MobileApp-20260731)
-- Apply BEFORE deploying the code that reads this table (old code + new table = safe).
-- device_tokens: one row per installed app device (Expo push token). Re-registration
--   rebinds tenant/customer (anonymous install -> verified session moves the token
--   onto the customer). revoked_at set on unregister or provider DeviceNotRegistered.
-- No changes to notifications / notification_prefs: 'push' channel and 'chat'
--   category are varchar(16) values already accommodated by the existing columns.
--
-- Apply:   mysql ... < sql/migration_push_notifications.sql
-- Rollback (additive table — code rollback alone is safe):
--   DROP TABLE IF EXISTS `device_tokens`;

CREATE TABLE IF NOT EXISTS `device_tokens` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `customer_id` bigint DEFAULT NULL,
  `session_id` bigint DEFAULT NULL,
  `platform` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'expo',
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locale` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_version` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_seen_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_token` (`token`),
  KEY `idx_dtok_tenant` (`tenant_id`),
  KEY `idx_dtok_customer` (`customer_id`),
  KEY `idx_dtok_tenant_customer` (`tenant_id`,`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

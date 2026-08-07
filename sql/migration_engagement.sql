-- Migration: engagement tables — saves + nudges (PLN-260807-IvyusaApp-Revamp F2)
-- Apply BEFORE deploying the code that reads these tables (old code + new table = safe).
-- product_saves: wishlist ('wish') + save-for-later ('later') rows, one per
--   (customer, product, list) — re-saving updates the note (upsert on uk_save).
-- nudges: "please buy me this" share cards; code is the public share key opened
--   at /app/nudge/:code with no session. views counts card opens (v1 metric).
-- Both hold personal data (free-text note/message) — wired into DSAR export,
-- customer erasure, and shop_redact tenant purge (PrivacyService).
--
-- Apply:   mysql ... < sql/migration_engagement.sql
-- Rollback (additive tables — code rollback alone is safe):
--   DROP TABLE IF EXISTS `product_saves`;
--   DROP TABLE IF EXISTS `nudges`;

CREATE TABLE IF NOT EXISTS `product_saves` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  `product_handle` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `list` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(280) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_save` (`customer_id`,`product_handle`,`list`),
  KEY `idx_save_tenant` (`tenant_id`),
  KEY `idx_save_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `nudges` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  `product_handle` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(280) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `code` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `views` int NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nudge_code` (`code`),
  KEY `idx_nudge_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

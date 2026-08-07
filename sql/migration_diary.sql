-- Migration: diary_notes — shopping-diary free memos (PLN-260807-IvyusaApp-Revamp F3, A-7)
-- Apply BEFORE deploying the code that reads this table (old code + new table = safe).
-- diary_notes: a customer's private memos, optionally pinned to a catalog product
--   handle (validated against products_cache on create). Private by design: no CJM
--   event is emitted for notes. Personal data (free text) — wired into DSAR export,
--   customer erasure, and shop_redact tenant purge (PrivacyService).
--
-- Apply:   mysql ... < sql/migration_diary.sql
-- Rollback (additive table — code rollback alone is safe):
--   DROP TABLE IF EXISTS `diary_notes`;

CREATE TABLE IF NOT EXISTS `diary_notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  `body` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_handle` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_diary_tenant` (`tenant_id`),
  KEY `idx_diary_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

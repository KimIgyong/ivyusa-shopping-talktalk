-- Migration: customer-facing product catalog cache (PLN-260807-IvyusaApp-Revamp F1)
-- Apply BEFORE deploying the code that reads this table (old code + new table = safe).
-- products_cache: one row per storefront product per tenant, synced from the PUBLIC
--   /products.json endpoint (no Admin API scope, no Storefront API token). A complete
--   sync flips rows the storefront no longer serves to status='archived' — sync never
--   hard-deletes. The KB CSV import's optional Price(USD)/Image URL columns also
--   upsert into this table (display bridge). Linked to KB by handle <-> external_key.
--
-- Apply:   mysql ... < sql/migration_products_cache.sql
-- Rollback (additive table — code rollback alone is safe):
--   DROP TABLE IF EXISTS `products_cache`;

CREATE TABLE IF NOT EXISTS `products_cache` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `handle` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendor` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `product_url` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tags` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `published_at` datetime DEFAULT NULL,
  `synced_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_tenant_handle` (`tenant_id`,`handle`),
  KEY `idx_prdc_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

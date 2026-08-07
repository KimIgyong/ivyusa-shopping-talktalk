-- 260807-cafe24-orders-provider.sql — generalize orders_cache to multi-channel (PLN-260807 §3.2)
-- Adds orders_cache.provider, backfills existing rows to 'shopify', and swaps the global
-- shopify_order_id unique for a per-(tenant, provider, order) unique so Cafe24 orders
-- coexist with Shopify ones. Run BEFORE deploying the Cafe24 integration.
-- Idempotence: guard with `SHOW COLUMNS FROM orders_cache LIKE 'provider'` before running.

ALTER TABLE `orders_cache`
  ADD COLUMN `provider` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'shopify' AFTER `tenant_id`;

-- Every row in the cache so far came from Shopify (the only channel that populated it).
UPDATE `orders_cache` SET `provider` = 'shopify' WHERE `provider` IS NULL OR `provider` = '';

-- Swap the global-unique shopify_order_id for a channel-scoped unique so the same
-- external order id can exist under different (tenant, provider) pairs.
ALTER TABLE `orders_cache`
  DROP INDEX `uk_orders_shopify`,
  ADD UNIQUE KEY `uk_orders_channel` (`tenant_id`, `provider`, `shopify_order_id`);

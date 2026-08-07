-- 260808-cafe24-customer-identifier.sql — PLN-260808 P-A2.
-- Cafe24 storefront member's verified unique identifier (customeraccesstoken flow),
-- the join key between the widget's authenticated session and email-synced orders.
-- Idempotence: guard with `SHOW COLUMNS FROM customers LIKE 'cafe24_user_identifier'`.

ALTER TABLE `customers`
  ADD COLUMN `cafe24_user_identifier` varchar(120) COLLATE utf8mb4_unicode_ci NULL AFTER `shopify_customer_id`;

-- Same convergence guarantee as uq_customers_tenant_shopify: one row per member per
-- tenant. MySQL unique indexes permit repeated NULLs (guests / non-Cafe24 rows).
ALTER TABLE `customers`
  ADD UNIQUE INDEX `uq_customers_tenant_cafe24_uid` (`tenant_id`, `cafe24_user_identifier`);

-- 260808-cafe24-member-orders.sql — PLN-260808-Cafe24-MemberId-RecentOrders.
-- The customer token response carries the member's login id (`user_id`), so orders
-- link to members by member_id directly — no /customersprivacy (mall.read_personal).
-- Also persists the platform order date so "recent orders" can window/sort by it.
-- Idempotence: guard with `SHOW COLUMNS FROM customers LIKE 'cafe24_member_id'`.

ALTER TABLE `customers`
  ADD COLUMN `cafe24_member_id` varchar(64) COLLATE utf8mb4_unicode_ci NULL AFTER `cafe24_user_identifier`;

-- One row per mall member per tenant, same convergence rule as the identifier
-- index. MySQL unique indexes permit repeated NULLs (guests / non-Cafe24 rows).
ALTER TABLE `customers`
  ADD UNIQUE INDEX `uq_customers_tenant_cafe24_mid` (`tenant_id`, `cafe24_member_id`);

ALTER TABLE `orders_cache`
  ADD COLUMN `member_id` varchar(64) COLLATE utf8mb4_unicode_ci NULL AFTER `customer_id`,
  ADD COLUMN `ordered_at` datetime NULL AFTER `currency`;

-- Retro-link on sign-in: UPDATE ... WHERE tenant_id=? AND member_id=? AND customer_id IS NULL.
ALTER TABLE `orders_cache`
  ADD INDEX `idx_ordc_tenant_member` (`tenant_id`, `member_id`);
-- Recent-orders window scans (ordered_at DESC within tenant).
ALTER TABLE `orders_cache`
  ADD INDEX `idx_ordc_tenant_ordered` (`tenant_id`, `ordered_at`);

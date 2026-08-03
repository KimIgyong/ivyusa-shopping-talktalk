-- FIX-Customer-Duplicate-ShopifyId-20260803
-- One customers row per Shopify customer per tenant. The app-proxy identity
-- path (id only) and the order-sync path (email) must converge on one row.
-- MySQL unique indexes allow repeated NULLs, so guest-lookup rows
-- (shopify_customer_id IS NULL) are unaffected.
--
-- ⚠️ PRE-CHECK (must return no rows before applying — merge duplicates first,
--    see the dedup template below):
--   SELECT tenant_id, shopify_customer_id, COUNT(*) c, GROUP_CONCAT(id) ids
--   FROM customers WHERE shopify_customer_id IS NOT NULL
--   GROUP BY tenant_id, shopify_customer_id HAVING c > 1;
--
-- Dedup template (KEEP = row with email/orders, DROP = email-less duplicate):
--   UPDATE sessions               SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE notifications          SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE notification_prefs     SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE cjm_events             SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE orders_cache           SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE reviews                SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE inquiries              SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE restock_subscriptions  SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE subscriptions          SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   UPDATE affiliates             SET customer_id = {KEEP} WHERE customer_id = {DROP};
--   DELETE FROM customers WHERE id = {DROP};

ALTER TABLE customers
  ADD UNIQUE INDEX uq_customers_tenant_shopify (tenant_id, shopify_customer_id);

-- migration_erased_identities.sql — erasure suppression list (PRV-H2)
--
-- Anonymizing customers is not enough on its own: Shopify remains the source of
-- truth and keeps the shopper's email and name, so the next order sync recreated
-- the row from the same address and re-linked their orders — the erasure was
-- undone by a background job minutes later. Worse, anonymization nulls
-- customers.shopify_customer_id, destroying the one key that could recognise them.
-- This table is that memory, kept on purpose.
--
-- Both columns hold the HMAC blind index (same scheme as customers.email_hash),
-- never the address or id itself: the list can answer "was this identity erased?"
-- without storing what it is.
--
-- Run on databases that predate the table. Idempotence: guard with
-- `SHOW TABLES LIKE 'erased_identities'` before running.

CREATE TABLE `erased_identities` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint DEFAULT NULL,
  `email_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shopify_customer_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `erased_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_erased_tenant_email` (`tenant_id`,`email_hash`),
  KEY `idx_erased_tenant_shopify` (`tenant_id`,`shopify_customer_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: customers already anonymized before this table existed cannot be
-- recovered — anonymizeCustomer() nulled both their email and their Shopify id, so
-- there is nothing left to key a suppression row on. Those identities will be
-- re-imported once more by the next sync and only then become suppressible. Left
-- deliberately un-backfilled rather than guessed at.

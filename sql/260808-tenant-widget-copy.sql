-- 260808-tenant-widget-copy.sql — PLN-260808-Widget-Greetings-EndChat-AnswerReuse (Track A).
-- Tenant-configurable widget copy: display name, first-visit welcome, login greeting
-- (per-language JSON blob — future copy additions need no further migrations).
-- Fixes the hardcoded "IVY USA" greeting leaking to other tenants' storefronts.
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'widget_copy'`.

ALTER TABLE `tenants`
  ADD COLUMN `widget_copy` JSON NULL AFTER `widget_login_mode`;

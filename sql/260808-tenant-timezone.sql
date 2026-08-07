-- 260808-tenant-timezone.sql — per-tenant IANA timezone; drives the default widget
-- language when the shopper hasn't picked one (Asia/Seoul → ko, America/* → en).
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'timezone'` before running.

ALTER TABLE `tenants`
  ADD COLUMN `timezone` varchar(40) COLLATE utf8mb4_unicode_ci NULL AFTER `widget_login_mode`;

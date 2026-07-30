-- migration_tenant_privacy_notice.sql — tenant privacy notice (PLN-Privacy-Control-Gap Stage 2)
-- Adds tenants.privacy_policy_url (link shown in the widget consent banner) and
-- tenants.consent_notice_version (tenant override of the platform notice version;
-- NULL = platform default CONSENT_NOTICE_VERSION; bumping it forces re-consent).
-- Run BEFORE deploying the Stage 1-2 backend (old code + new columns = safe).
-- Idempotence: guard with `SHOW COLUMNS FROM tenants LIKE 'privacy_policy_url'` before running.

ALTER TABLE `tenants`
  ADD COLUMN `privacy_policy_url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `plan`,
  ADD COLUMN `consent_notice_version` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `privacy_policy_url`;

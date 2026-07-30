-- Migration: audit_logs request-context columns (Stage 4, PLN-Privacy-Control-Gap-20260731)
-- Apply BEFORE deploying the code that writes these columns (old code + new columns = safe).
-- Adds: client IP, request correlation id, outcome, structured metadata.
-- actor_type additionally gains the 'system' value (no DDL change — varchar(16) already fits).
--
-- Apply:   mysql ... < sql/migration_audit_context.sql
-- Rollback:
--   ALTER TABLE `audit_logs`
--     DROP COLUMN `metadata`, DROP COLUMN `result`,
--     DROP COLUMN `request_id`, DROP COLUMN `ip`;

ALTER TABLE `audit_logs`
  ADD COLUMN `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `target`,
  ADD COLUMN `request_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ip`,
  ADD COLUMN `result` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `request_id`,
  ADD COLUMN `metadata` json DEFAULT NULL AFTER `result`;

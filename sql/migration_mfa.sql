-- Migration: MFA (TOTP) credentials + recovery codes (Stage M1, PLN-MFA-20260731)
-- Apply BEFORE deploying the code that reads these tables (old code + new tables = safe).
-- mfa_credentials: one TOTP credential per account, keyed (actor_type, actor_id) across
--   the dual account model (admins/users). secret_enc = AES-256-GCM ciphertext, base64.
--   enabled_at NULL = enrollment pending; last_used_step = TOTP replay guard.
-- mfa_recovery_codes: 10 single-use codes per enrollment, bcrypt hashes only.
--
-- Apply:   mysql ... < sql/migration_mfa.sql
-- Rollback (additive tables — code rollback alone is safe):
--   DROP TABLE IF EXISTS `mfa_recovery_codes`;
--   DROP TABLE IF EXISTS `mfa_credentials`;

CREATE TABLE IF NOT EXISTS `mfa_credentials` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actor_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` bigint NOT NULL,
  `secret_enc` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled_at` datetime DEFAULT NULL,
  `last_used_step` bigint DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mfa_actor` (`actor_type`,`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mfa_recovery_codes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `credential_id` bigint NOT NULL,
  `code_hash` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_mfa_code_credential` (`credential_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

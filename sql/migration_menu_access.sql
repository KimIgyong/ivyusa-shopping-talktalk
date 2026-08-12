-- migration_menu_access.sql — per-tenant menu provisioning + per-member menu access
-- (PLN-260812-Menu-Provisioning-Access).
--
-- Three tables, all storing ONLY exceptions:
--   tenant_menus       ① platform admin: override the plan's menu preset per tenant
--   tenant_role_menus  ② tenant master: rank x menu matrix
--   tenant_user_menus  ② tenant master: per-member exception to that matrix
--
-- An absent row means "use the default", so an empty schema behaves exactly as
-- the console did before this feature. That is deliberate: it makes the code
-- deploy a no-op change for every existing tenant.
--
-- Run BEFORE deploying the backend (new tables + old code = harmless; new code
-- + missing tables = 500 on every console load).
-- Idempotence: CREATE TABLE IF NOT EXISTS — safe to re-run.
-- Rollback: DROP the three tables (they hold overrides only; nothing else
-- references them).

CREATE TABLE IF NOT EXISTS `tenant_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `menu_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provided` tinyint(1) NOT NULL COMMENT '1=provided despite plan, 0=withheld despite plan',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_menu` (`tenant_id`,`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `rank` is a MySQL 8 reserved word — always backticked.
CREATE TABLE IF NOT EXISTS `tenant_role_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `rank` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'master/director/manager/staff',
  `menu_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `allowed` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_rank_menu` (`tenant_id`,`rank`,`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_user_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `menu_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `allowed` tinyint(1) NOT NULL COMMENT '1=allow exception, 0=deny exception',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user_menu` (`tenant_id`,`user_id`,`menu_code`),
  KEY `idx_tum_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- REQ/PLN-260804 — Agent coaching chat (FR-071 / FR-072)
--
-- Apply BEFORE deploying the code. Staging runs DB_SYNCHRONIZE=false, so these
-- tables are not created automatically; new code against the old schema returns
-- 500 on every /ai-coach route.
--
--   mysql -u<user> -p<pass> <db> < sql/migration_agent_coaching.sql
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS agent_coaching_threads (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT NOT NULL,
  user_id     BIGINT NOT NULL,
  title       VARCHAR(200) NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_coach_thread_tenant (tenant_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_coaching_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT NOT NULL,
  thread_id   BIGINT NOT NULL,
  role        VARCHAR(16) NOT NULL,
  body        TEXT NOT NULL,
  meta        JSON NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_coach_msg_thread (thread_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_coaching_proposals (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT NOT NULL,
  thread_id   BIGINT NOT NULL,
  message_id  BIGINT NOT NULL,
  type        VARCHAR(32) NOT NULL,
  payload     JSON NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',
  applied_by  BIGINT NULL,
  applied_at  DATETIME(6) NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_coach_prop_thread (thread_id, id),
  KEY idx_coach_prop_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No schema change for the new 'coach' AI function: tenant_ai_settings.function
-- is VARCHAR(16) and takes the new value as data. Tenants with no coach row fall
-- back through AiGatewayService.resolveEngine (tenant default → platform default).

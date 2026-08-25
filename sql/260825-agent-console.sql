-- PLN-260825 — per-agent widget identity/greeting + AI-agent list filter.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback:
--   ALTER TABLE ai_agents DROP COLUMN display_name, DROP COLUMN greeting;
--   ALTER TABLE sessions DROP INDEX idx_sessions_tenant_agent;

ALTER TABLE ai_agents
  ADD COLUMN display_name VARCHAR(100) NULL AFTER name,
  ADD COLUMN greeting JSON NULL AFTER persona;

ALTER TABLE sessions
  ADD INDEX idx_sessions_tenant_agent (tenant_id, ai_agent_id);

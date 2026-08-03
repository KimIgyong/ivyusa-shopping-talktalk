-- migration_handoff_routing.sql — handoff routing (PLN-AiSetting W3)
-- tenant_ai_config.handoff_config: assignees, business hours, off-hours email +
--   customer notice. NULL = broadcast to every agent at any hour (old behaviour).
-- agent_alerts.target_user_id: the agent an alert is addressed to. NULL = broadcast.
-- Staging/prod run synchronize=false — apply BEFORE deploying the code (kit 04 §3).
-- Idempotence: guard with
--   SHOW COLUMNS FROM tenant_ai_config LIKE 'handoff_config';
--   SHOW COLUMNS FROM agent_alerts LIKE 'target_user_id';

ALTER TABLE `tenant_ai_config`
  ADD COLUMN `handoff_config` json NULL AFTER `scenario_overrides`;

ALTER TABLE `agent_alerts`
  ADD COLUMN `target_user_id` bigint NULL AFTER `preview`;

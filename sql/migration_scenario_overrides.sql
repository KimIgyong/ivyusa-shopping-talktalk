-- migration_scenario_overrides.sql — editable scenario replies (PLN-AiSetting W2)
-- Per-tenant edits to the built-in scenario scripts: reply copy (EN/ES/KO),
-- follow-up chips, and the post-reply navigation action. NULL = use built-ins.
-- Staging/prod run synchronize=false — apply BEFORE deploying the code (kit 04 §3).
-- Idempotence: guard with `SHOW COLUMNS FROM tenant_ai_config LIKE 'scenario_overrides'`.

ALTER TABLE `tenant_ai_config`
  ADD COLUMN `scenario_overrides` json NULL AFTER `scenario_buttons`;

-- migration_preview_channel.sql — admin chat preview sessions (PLN-AiSetting-Preview W1)
-- Adds sessions.channel: NULL = normal widget session, 'preview' = /ai-setting sandbox
-- (isolated from escalation alerts, agent queue, and the consent gate).
-- Staging/prod run synchronize=false — apply BEFORE deploying the code (kit 04 §3).
-- Idempotence: guard with `SHOW COLUMNS FROM sessions LIKE 'channel'` before running.

ALTER TABLE `sessions`
  ADD COLUMN `channel` varchar(16) COLLATE utf8mb4_unicode_ci NULL AFTER `session_token`;

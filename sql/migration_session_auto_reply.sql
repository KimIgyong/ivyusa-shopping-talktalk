-- PLN-260812-Per-Session-AutoReply — per-conversation AI auto-reply choice.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: ALTER TABLE sessions DROP COLUMN auto_reply_mode;
--
-- 'inherit' keeps following the channel default in Settings; 'on'/'off' are the
-- operator overriding it for this session only.

ALTER TABLE sessions
  ADD COLUMN auto_reply_mode VARCHAR(8) NOT NULL DEFAULT 'inherit' AFTER alias;

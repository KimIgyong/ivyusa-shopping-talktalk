-- migration_conv_reply_channel.sql — off-hours email reply (PLN-260806)
-- Adds conversations.reply_channel: NULL = the shopper is (or may be) in the
-- widget and reads replies there; 'email' = the thread was handed off outside
-- business hours, so an agent's reply is also mailed to the customer.
-- Set at handoff, cleared when the shopper writes again from the widget.
-- Run BEFORE deploying the code (old code + new column = safe).
-- Idempotence: guard with `SHOW COLUMNS FROM conversations LIKE 'reply_channel'`.

ALTER TABLE `conversations`
  ADD COLUMN `reply_channel` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `agent_id`;

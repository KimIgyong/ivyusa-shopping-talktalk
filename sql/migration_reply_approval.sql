-- PLN-260812-Reply-Approval-Mode — AI answers as drafts an agent approves.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback:
--   DROP TABLE reply_drafts;
--   ALTER TABLE messenger_channels DROP COLUMN reply_mode;
-- `auto_reply` keeps being written, so rolling the code back keeps working.

-- Channel default reply mode, backfilled from the boolean it replaces.
ALTER TABLE messenger_channels
  ADD COLUMN reply_mode VARCHAR(8) NOT NULL DEFAULT 'auto' AFTER auto_reply;
UPDATE messenger_channels SET reply_mode = CASE WHEN auto_reply = 1 THEN 'auto' ELSE 'off' END;

-- An AI answer awaiting approval. Deliberately NOT a message: anything in
-- `messages` is delivered by the widget poll and the channel outbox, which
-- would send the draft to the customer before anyone read it.
CREATE TABLE IF NOT EXISTS reply_drafts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  -- The customer turn that prompted it; null if that message vanished.
  message_id BIGINT NULL,
  body TEXT NOT NULL,
  confidence DECIMAL(4,3) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending', -- pending|sent|discarded
  resolved_by BIGINT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rd_conv_status (conversation_id, status),
  KEY idx_rd_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

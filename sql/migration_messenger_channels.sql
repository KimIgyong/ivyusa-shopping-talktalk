-- PLN-260810-Multi-Messenger-Integration PR-M1 — external messenger channels.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: DROP the four tables below; no existing table is altered.

CREATE TABLE IF NOT EXISTS messenger_channels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  -- telegram|viber (PR-M1) · amoebatalk|btbz_relay|gmail (PR-M2~M4)
  provider VARCHAR(16) NOT NULL,
  -- 'direct' = ShopTalk speaks the platform API itself; 'hub' = via an aggregator.
  mode VARCHAR(8) NOT NULL DEFAULT 'direct',
  label VARCHAR(64) NOT NULL,
  external_account_id VARCHAR(128) NULL,
  -- Inbound routing key for webhook-kind channels: the URL carries it, so one
  -- lookup resolves BOTH the tenant and the authenticity of the caller.
  webhook_token VARCHAR(64) NULL,
  config JSON NULL,
  secret_enc VARBINARY(2048) NULL,
  auto_reply TINYINT(1) NOT NULL DEFAULT 1,
  -- notice = send the privacy notice on first contact, then record consent.
  consent_mode VARCHAR(8) NOT NULL DEFAULT 'notice',
  active TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'unknown',
  last_sync_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mc_tenant_provider_label (tenant_id, provider, label),
  UNIQUE KEY uk_mc_webhook_token (webhook_token),
  KEY idx_mc_tenant (tenant_id),
  KEY idx_mc_active (active, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_threads (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  external_thread_id VARCHAR(128) NOT NULL,
  -- Hub-internal channel of this thread (zalo|line|kakao|sms…) — console badge source.
  sub_channel VARCHAR(16) NULL,
  -- 0 for receive-only threads (btbz relay SMS): never attempt an outbound send.
  reply_enabled TINYINT(1) NOT NULL DEFAULT 1,
  external_user_id VARCHAR(128) NULL,
  external_user_name VARCHAR(128) NULL,
  session_id BIGINT NULL,
  conversation_id BIGINT NULL,
  customer_id BIGINT NULL,
  -- Last external message id already ingested (poll-kind adapters).
  inbound_cursor VARCHAR(64) NULL,
  -- Highest internal message id already queued outbound — append idempotency.
  outbound_cursor BIGINT NULL,
  last_inbound_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ct_channel_thread (channel_id, external_thread_id),
  KEY idx_ct_conversation (conversation_id),
  KEY idx_ct_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_message_map (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  thread_id BIGINT NOT NULL,
  external_message_id VARCHAR(128) NOT NULL,
  message_id BIGINT NOT NULL,
  direction VARCHAR(8) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cmm_thread_ext (thread_id, external_message_id),
  KEY idx_cmm_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_outbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  thread_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  -- pending|sent|unconfirmed|failed ('unconfirmed' = relayed but delivery unproven)
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  external_command_id VARCHAR(64) NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_co_message (message_id),
  KEY idx_co_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

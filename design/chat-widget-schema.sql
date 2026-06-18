-- =====================================================================
-- IVY USA Chat & Support Widget — MySQL Schema (chat-widget-schema.sql)
-- document_id: CHATWIDGET-ERD-1.0.0  | version: 1.0.0 | 2026-06-15
-- Engine: InnoDB, utf8mb4. Source of truth for orders = Shopify/Odoo (cache here).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- customers ----------
CREATE TABLE customers (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  shopify_customer_id VARCHAR(64)  NULL,
  email               VARCHAR(255) NULL,
  name                VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_shopify (shopify_customer_id),
  KEY idx_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- sessions ----------
CREATE TABLE sessions (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  session_token VARCHAR(128) NOT NULL,
  customer_id   BIGINT       NULL,
  language      VARCHAR(8)   NOT NULL DEFAULT 'EN',   -- EN/ES/KO
  consent_state VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending/granted/declined
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sessions_token (session_token),
  KEY idx_sessions_customer (customer_id),
  CONSTRAINT fk_sessions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- agents ----------
CREATE TABLE agents (
  id     BIGINT       NOT NULL AUTO_INCREMENT,
  name   VARCHAR(255) NOT NULL,
  email  VARCHAR(255) NOT NULL,
  role   VARCHAR(32)  NOT NULL DEFAULT 'agent',  -- admin/operator/agent
  status VARCHAR(16)  NOT NULL DEFAULT 'offline',
  PRIMARY KEY (id),
  UNIQUE KEY uk_agents_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- conversations ----------
CREATE TABLE conversations (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  session_id  BIGINT      NOT NULL,
  channel     VARCHAR(32) NOT NULL DEFAULT 'widget',
  status      VARCHAR(24) NOT NULL DEFAULT 'ai_active', -- ai_active/waiting/agent/ended
  escalated   TINYINT(1)  NOT NULL DEFAULT 0,
  agent_id    BIGINT      NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_conv_session (session_id),
  KEY idx_conv_agent (agent_id),
  CONSTRAINT fk_conv_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- messages ----------
CREATE TABLE messages (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT      NOT NULL,
  sender_type     VARCHAR(16) NOT NULL,  -- user/ai/agent/system
  body            TEXT        NOT NULL,
  lang            VARCHAR(8)  NULL,
  retrieval_trace JSON        NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_msg_conv (conversation_id),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- orders_cache ----------
CREATE TABLE orders_cache (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  shopify_order_id VARCHAR(64)  NOT NULL,
  customer_id      BIGINT       NULL,
  order_number     VARCHAR(32)  NOT NULL,
  status_internal  VARCHAR(24)  NULL,   -- paid/preparing/shipping/delivered
  status_ui        VARCHAR(24)  NULL,   -- Confirmed/In Transit/Delivered/Review
  total            DECIMAL(12,2) NULL,
  currency         VARCHAR(8)   NULL DEFAULT 'USD',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_shopify (shopify_order_id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_number (order_number),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- order_items ----------
CREATE TABLE order_items (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  order_id    BIGINT       NOT NULL,
  product_id  VARCHAR(64)  NULL,
  title       VARCHAR(255) NOT NULL,
  option_text VARCHAR(255) NULL,    -- e.g., Burgundy / 6-8
  qty         INT          NOT NULL DEFAULT 1,
  price       DECIMAL(12,2) NULL,
  PRIMARY KEY (id),
  KEY idx_items_order (order_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders_cache(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- fulfillments ----------
CREATE TABLE fulfillments (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  order_id        BIGINT      NOT NULL,
  status          VARCHAR(24) NOT NULL,  -- preparing/shipped/in_transit/delivered
  tracking_number VARCHAR(64) NULL,
  carrier         VARCHAR(64) NULL,
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fulfill_order (order_id),
  CONSTRAINT fk_fulfill_order FOREIGN KEY (order_id) REFERENCES orders_cache(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- notifications ----------
CREATE TABLE notifications (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  customer_id  BIGINT       NULL,
  session_id   BIGINT       NULL,
  category     VARCHAR(16)  NOT NULL,  -- payment/shipping/event/review/all
  title        VARCHAR(255) NOT NULL,
  body         TEXT         NULL,
  status_badge VARCHAR(24)  NULL,      -- Confirmed/In Transit/Delivered/Review
  channel      VARCHAR(16)  NOT NULL DEFAULT 'in_app',
  read_at      DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_customer (customer_id),
  KEY idx_notif_category (category),
  CONSTRAINT fk_notif_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- notification_prefs ----------
CREATE TABLE notification_prefs (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  customer_id BIGINT      NOT NULL,
  channel     VARCHAR(16) NOT NULL,  -- in_app/email/sms/web_push
  category    VARCHAR(16) NOT NULL,  -- payment/shipping/event/review
  enabled     TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pref (customer_id, channel, category),
  CONSTRAINT fk_pref_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- reviews ----------
CREATE TABLE reviews (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT      NOT NULL,
  customer_id   BIGINT      NOT NULL,
  rating        TINYINT     NOT NULL,  -- 1..5
  body          TEXT        NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'submitted',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_review_item (order_item_id),
  KEY idx_review_customer (customer_id),
  CONSTRAINT fk_review_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- affiliates ----------
CREATE TABLE affiliates (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  customer_id     BIGINT       NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending/approved/rejected
  link_code       VARCHAR(64)  NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  applied_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_aff_link (link_code),
  KEY idx_aff_customer (customer_id),
  CONSTRAINT fk_aff_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- restock_subscriptions ----------
CREATE TABLE restock_subscriptions (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  customer_id BIGINT      NULL,
  product_id  VARCHAR(64) NOT NULL,
  channel     VARCHAR(16) NOT NULL DEFAULT 'in_app',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_restock_product (product_id),
  KEY idx_restock_customer (customer_id),
  CONSTRAINT fk_restock_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- subscriptions ----------
CREATE TABLE subscriptions (
  id                      BIGINT      NOT NULL AUTO_INCREMENT,
  customer_id             BIGINT      NOT NULL,
  shopify_subscription_id VARCHAR(64) NULL,
  status                  VARCHAR(16) NOT NULL DEFAULT 'active',
  plan                    VARCHAR(64) NULL,
  next_billing            DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_sub_customer (customer_id),
  CONSTRAINT fk_sub_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- inquiries ----------
CREATE TABLE inquiries (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT      NULL,
  order_id        BIGINT      NULL,
  customer_id     BIGINT      NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'open', -- open/answered
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inq_customer (customer_id),
  KEY idx_inq_order (order_id),
  CONSTRAINT fk_inq_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT fk_inq_order FOREIGN KEY (order_id) REFERENCES orders_cache(id) ON DELETE SET NULL,
  CONSTRAINT fk_inq_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- kb_documents ----------
CREATE TABLE kb_documents (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  source        VARCHAR(24)  NOT NULL DEFAULT 'knowledge_store', -- knowledge_store/google_drive
  category      VARCHAR(64)  NULL,    -- faq/product/policy/warranty
  title         VARCHAR(255) NOT NULL,
  content       LONGTEXT     NULL,
  embedding_ref VARCHAR(128) NULL,    -- vector index reference
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kb_source (source),
  KEY idx_kb_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- campaigns ----------
CREATE TABLE campaigns (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  name         VARCHAR(255) NOT NULL,
  segment_ref  VARCHAR(128) NULL,    -- Klaviyo segment id
  content      JSON         NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'draft', -- draft/scheduled/sent
  scheduled_at DATETIME     NULL,
  sent_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_campaign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- cjm_events ----------
CREATE TABLE cjm_events (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  session_id  BIGINT      NULL,
  customer_id BIGINT      NULL,
  stage       VARCHAR(16) NOT NULL,  -- Awareness/Browse/Inquiry/Purchase/Delivery/Post
  event_type  VARCHAR(64) NOT NULL,
  payload     JSON        NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cjm_session (session_id),
  KEY idx_cjm_customer (customer_id),
  KEY idx_cjm_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- integration_status ----------
CREATE TABLE integration_status (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  name         VARCHAR(32)  NOT NULL,  -- shopify/fulfillment/klaviyo/odoo/google_drive
  status       VARCHAR(16)  NOT NULL DEFAULT 'connected',
  last_sync_at DATETIME     NULL,
  detail       VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_integration_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Tenancy & RBAC (CHATWIDGET-RBAC) — FR-051~061
-- NOTE: add `tenant_id BIGINT` + FK to tenants(id) on all tenant data
-- tables (sessions, conversations, messages, orders_cache, notifications,
-- reviews, affiliates, subscriptions, kb_documents, campaigns, cjm_events,
-- inquiries, restock_subscriptions, notification_prefs, customers) with a
-- composite index (tenant_id, ...). Enforced by app-layer global scope.
-- =====================================================================

-- ---------- tenants ----------
CREATE TABLE tenants (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  shop_domain VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'active', -- applied/active/suspended
  plan        VARCHAR(32)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_shop (shop_domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- admin_users (system admins, cross-tenant) ----------
CREATE TABLE admin_users (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL,
  level      VARCHAR(16)  NOT NULL DEFAULT 'admin', -- super_admin/admin
  status     VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- users (tenant staff) ----------
CREATE TABLE users (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  email      VARCHAR(255) NOT NULL,
  name       VARCHAR(255) NULL,
  rank       VARCHAR(16)  NOT NULL DEFAULT 'staff', -- master/director/manager/staff
  status     VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_tenant_email (tenant_id, email),
  KEY idx_user_tenant (tenant_id),
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- job_labels (editable per tenant) ----------
CREATE TABLE job_labels (
  id        BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT      NOT NULL,
  code      VARCHAR(24) NOT NULL,  -- consult/accounting/operations (stable code)
  name      VARCHAR(64) NOT NULL,  -- editable display name
  PRIMARY KEY (id),
  UNIQUE KEY uk_label_tenant_code (tenant_id, code),
  CONSTRAINT fk_label_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- user_job_labels (N:M) ----------
CREATE TABLE user_job_labels (
  user_id      BIGINT NOT NULL,
  job_label_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, job_label_id),
  CONSTRAINT fk_ujl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ujl_label FOREIGN KEY (job_label_id) REFERENCES job_labels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- roles_permissions (rank x label capability grants) ----------
CREATE TABLE roles_permissions (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  scope      VARCHAR(16) NOT NULL,  -- system/tenant
  rank       VARCHAR(16) NULL,      -- super_admin/admin/master/director/manager/staff
  label      VARCHAR(24) NULL,      -- consult/accounting/operations or NULL
  capability VARCHAR(64) NOT NULL,
  allow      TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_rp_lookup (scope, rank, label, capability)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- integration_credentials (per-tenant, encrypted) ----------
CREATE TABLE integration_credentials (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  provider   VARCHAR(32)  NOT NULL, -- shopify/fulfillment/klaviyo/odoo/google_drive
  secret_enc VARBINARY(2048) NULL,  -- encrypted at rest
  status     VARCHAR(16)  NOT NULL DEFAULT 'connected',
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cred_tenant_provider (tenant_id, provider),
  CONSTRAINT fk_cred_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- audit_logs (privileged actions) ----------
CREATE TABLE audit_logs (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NULL,     -- NULL = platform-level action
  actor_type VARCHAR(16)  NOT NULL, -- admin/user
  actor_id   BIGINT       NOT NULL,
  action     VARCHAR(64)  NOT NULL,
  target     VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_tenant (tenant_id),
  KEY idx_audit_actor (actor_type, actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- customers: tenancy & tier columns (ALTER) ----------
ALTER TABLE customers
  ADD COLUMN tenant_id   BIGINT      NULL AFTER id,
  ADD COLUMN tier        VARCHAR(16) NOT NULL DEFAULT 'guest' AFTER name, -- guest/subscriber/regular
  ADD COLUMN shopify_tier VARCHAR(32) NULL AFTER tier,
  ADD KEY idx_customers_tenant (tenant_id);

-- =====================================================================
-- Bootstrap, Authentication & Invitation (FR-062, FR-063, POL-018)
-- =====================================================================
ALTER TABLE admin_users
  ADD COLUMN password_hash       VARCHAR(255) NULL AFTER email,
  ADD COLUMN must_change_password TINYINT(1)  NOT NULL DEFAULT 1 AFTER status;

ALTER TABLE users
  ADD COLUMN password_hash        VARCHAR(255) NULL AFTER email,
  ADD COLUMN must_change_password TINYINT(1)  NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN invited_at           DATETIME    NULL;
-- users.status semantics: invited / active / suspended

CREATE TABLE invitations (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT       NOT NULL,
  email              VARCHAR(255) NOT NULL,
  rank               VARCHAR(16)  NOT NULL DEFAULT 'staff',
  token              VARCHAR(128) NOT NULL,
  temp_password_hash VARCHAR(255) NOT NULL,
  status             VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending/accepted/expired
  expires_at         DATETIME     NOT NULL,
  created_by         BIGINT       NULL,  -- users.id (Master)
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inv_token (token),
  KEY idx_inv_tenant_email (tenant_id, email),
  CONSTRAINT fk_inv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Knowledge Sources — 3 modes (FR-064, FR-065)
-- =====================================================================
CREATE TABLE knowledge_sources (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT       NOT NULL,
  type        VARCHAR(16)  NOT NULL,  -- board / repository / gdrive
  name        VARCHAR(255) NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'active',   -- active / inactive
  designated  TINYINT(1)   NOT NULL DEFAULT 1,          -- AI references only designated sources
  config_json JSON         NULL,                        -- e.g. gdrive folder/sync settings
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ksrc_tenant (tenant_id),
  CONSTRAINT fk_ksrc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kb_board_posts (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT       NOT NULL,
  source_id      BIGINT       NOT NULL,
  title          VARCHAR(255) NOT NULL,
  body           LONGTEXT     NULL,
  author_user_id BIGINT       NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_post_source (source_id),
  CONSTRAINT fk_post_source FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kb_files (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT       NOT NULL,
  source_id    BIGINT       NOT NULL,
  post_id      BIGINT       NULL,     -- attachment of a board post (M1) or NULL (M2)
  filename     VARCHAR(255) NOT NULL,
  mime         VARCHAR(128) NULL,
  storage_path VARCHAR(512) NOT NULL,
  size         BIGINT       NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_file_source (source_id),
  CONSTRAINT fk_file_source FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE kb_documents
  ADD COLUMN tenant_id BIGINT      NULL AFTER id,
  ADD COLUMN source_id BIGINT      NULL AFTER source,
  ADD COLUMN active    TINYINT(1)  NOT NULL DEFAULT 1,
  ADD COLUMN status    VARCHAR(16) NOT NULL DEFAULT 'pending', -- embedded/pending
  ADD KEY idx_kb_source (source_id),
  ADD KEY idx_kb_tenant (tenant_id);

-- =====================================================================
-- Seed data (FR-062) — passwords stored as bcrypt hash placeholders.
-- Replace <BCRYPT(...)> at install; never store plaintext (POL-018).
-- Initial credentials (must change on first login):
--   admin@amoeba.group / amb2026!@   (System Admin)
--   dev@amoeba.group   / amb2026!@   (Tenant Master, owner of 'ivyusa')
-- =====================================================================
INSERT INTO tenants (shop_domain, name, status, plan)
  VALUES ('ivyusa.myshopify.com', 'ivyusa', 'active', 'custom');

INSERT INTO admin_users (email, password_hash, level, status, must_change_password)
  VALUES ('admin@amoeba.group', '<BCRYPT(amb2026!@)>', 'admin', 'active', 1);

INSERT INTO users (tenant_id, email, password_hash, name, rank, status, must_change_password)
  VALUES ((SELECT id FROM tenants WHERE name='ivyusa'),
          'dev@amoeba.group', '<BCRYPT(amb2026!@)>', 'Master Owner', 'master', 'active', 1);

-- default job labels for tenant ivyusa
INSERT INTO job_labels (tenant_id, code, name) VALUES
  ((SELECT id FROM tenants WHERE name='ivyusa'), 'consult', '상담'),
  ((SELECT id FROM tenants WHERE name='ivyusa'), 'accounting', '회계'),
  ((SELECT id FROM tenants WHERE name='ivyusa'), 'operations', '운영');

-- =====================================================================
-- Agent Management & Response Moderation (FR-066~069, NFR-013)
-- =====================================================================
CREATE TABLE agent_profiles (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT       NOT NULL,
  user_id        BIGINT       NOT NULL,
  languages      VARCHAR(64)  NULL,    -- e.g. "en,es,ko"
  skills         VARCHAR(255) NULL,    -- comma tags: shipping,refund,product
  max_concurrent INT          NOT NULL DEFAULT 3,
  status         VARCHAR(16)  NOT NULL DEFAULT 'offline', -- online/away/offline
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_user (user_id),
  KEY idx_agent_tenant (tenant_id),
  CONSTRAINT fk_agentprof_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_agentprof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assignments (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT      NOT NULL,
  conversation_id BIGINT      NOT NULL,
  agent_id        BIGINT      NULL,    -- users.id (consult)
  assigned_by     BIGINT      NULL,    -- users.id (manager+) or NULL=auto
  type            VARCHAR(8)  NOT NULL DEFAULT 'auto',  -- auto/manual
  status          VARCHAR(16) NOT NULL DEFAULT 'active', -- active/transferred/released
  assigned_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at     DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_assign_conv (conversation_id),
  KEY idx_assign_agent (agent_id),
  CONSTRAINT fk_assign_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE content_filter_rules (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id        BIGINT       NOT NULL,
  scope            VARCHAR(8)   NOT NULL DEFAULT 'both', -- agent/ai/both
  type             VARCHAR(12)  NOT NULL,                -- word/phrase/regex/context
  pattern_or_prompt TEXT        NOT NULL,                -- term/regex OR context classifier prompt
  lang             VARCHAR(8)   NULL,                    -- en/es/ko or NULL=all
  severity         VARCHAR(8)   NOT NULL DEFAULT 'high', -- low/med/high
  action           VARCHAR(10)  NOT NULL DEFAULT 'block',-- block/mask/warn/rephrase
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cfr_tenant (tenant_id, scope, is_active),
  CONSTRAINT fk_cfr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE moderation_logs (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT       NOT NULL,
  conversation_id BIGINT       NULL,
  author_type     VARCHAR(8)   NOT NULL,  -- agent/ai
  author_id       BIGINT       NULL,
  excerpt         VARCHAR(512) NULL,      -- masked excerpt
  rule_id         BIGINT       NULL,
  action          VARCHAR(10)  NOT NULL,  -- block/mask/warn/rephrase/pass
  decision        VARCHAR(16)  NOT NULL,  -- blocked/delivered/edited
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_modlog_tenant (tenant_id),
  KEY idx_modlog_conv (conversation_id),
  CONSTRAINT fk_modlog_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE agent_daily_stats (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT      NOT NULL,
  agent_id      BIGINT      NOT NULL,  -- users.id
  stat_date     DATE        NOT NULL,
  handled       INT         NOT NULL DEFAULT 0,
  avg_first_response_sec INT NULL,
  avg_handle_sec INT        NULL,
  resolved      INT         NOT NULL DEFAULT 0,
  escalated     INT         NOT NULL DEFAULT 0,
  csat_avg      DECIMAL(4,2) NULL,
  online_sec    INT         NULL,
  blocked_msgs  INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_agentstat (tenant_id, agent_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- AI Engine Management — pluggable multi-engine (FR-070)
-- =====================================================================
CREATE TABLE ai_engines (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id        BIGINT       NULL,    -- NULL = platform catalog (System Admin); set = tenant custom
  provider         VARCHAR(24)  NOT NULL,            -- anthropic/openai/google/azure/custom
  name             VARCHAR(64)  NOT NULL,            -- display name
  model            VARCHAR(64)  NOT NULL,            -- e.g. claude-3-..., gpt-4o, gemini-1.5
  endpoint         VARCHAR(255) NULL,                -- for azure/custom/self-hosted
  api_key_encrypted VARBINARY(2048) NULL,            -- AES-256-GCM
  capabilities     VARCHAR(128) NOT NULL DEFAULT 'chat,rag,summary,assist,moderation',
  status           VARCHAR(16)  NOT NULL DEFAULT 'enabled', -- enabled/disabled
  is_default       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_aiengine_provider (provider),
  KEY idx_aiengine_tenant (tenant_id),
  CONSTRAINT fk_aiengine_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tenant_ai_settings (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT      NOT NULL,
  function    VARCHAR(16) NOT NULL,  -- chat/rag/summary/assist/moderation
  engine_id   BIGINT      NOT NULL,
  params_json JSON        NULL,      -- temperature, max_tokens, etc.
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_function (tenant_id, function),
  KEY idx_tas_engine (engine_id),
  CONSTRAINT fk_tas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tas_engine FOREIGN KEY (engine_id) REFERENCES ai_engines(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
-- =====================================================================
-- End of schema
-- =====================================================================

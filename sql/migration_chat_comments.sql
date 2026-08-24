-- REQ-260824 R4 — internal operator comments on conversations/sessions.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: DROP TABLE chat_comments;
--
-- Console-only data; never rendered to the shopper. scope decides which id is
-- set: 'conversation' → conversation_id, 'session' → session_id.

CREATE TABLE IF NOT EXISTS chat_comments (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT          NOT NULL,
  scope           VARCHAR(16)     NOT NULL,
  conversation_id BIGINT          NULL,
  session_id      BIGINT          NULL,
  author_id       BIGINT          NOT NULL,
  body            TEXT            NOT NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_ccomment_tenant_conv (tenant_id, conversation_id),
  KEY idx_ccomment_tenant_sess (tenant_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

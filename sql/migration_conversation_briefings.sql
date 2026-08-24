-- REQ-260824 R3 — operator-requested AI briefings, persisted with translations.
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: DROP TABLE conversation_briefings;
--
-- One row per generation (history kept, console shows the latest).
-- translations: JSON map lang → translated text, filled lazily per request.

CREATE TABLE IF NOT EXISTS conversation_briefings (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT          NOT NULL,
  conversation_id BIGINT          NOT NULL,
  last_message_id BIGINT          NULL,
  body            TEXT            NOT NULL,
  translations    JSON            NULL,
  requested_by    BIGINT          NOT NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_brief_tenant_conv (tenant_id, conversation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PLN-260814-Chat-Attachments S1 — chat attachments (image thumbnails / file preview).
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: DROP TABLE message_attachments;  (files under UPLOAD_DIR can be removed separately)
--
-- message_id is NULL between upload and send: the widget/console uploads first
-- and only then sends the message that owns the file. Rows still unattached
-- after 24h are swept by the cleanup batch together with their files.

CREATE TABLE IF NOT EXISTS message_attachments (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  uuid            CHAR(36)        NOT NULL,
  tenant_id       BIGINT          NOT NULL,
  conversation_id BIGINT          NULL,
  message_id      BIGINT          NULL,
  session_id      BIGINT          NULL,
  uploader_type   VARCHAR(16)     NOT NULL,
  uploader_id     BIGINT          NULL,
  kind            VARCHAR(16)     NOT NULL,
  filename        VARCHAR(255)    NOT NULL,
  mime            VARCHAR(128)    NOT NULL,
  size            BIGINT          NOT NULL,
  width           INT             NULL,
  height          INT             NULL,
  storage_path    VARCHAR(512)    NOT NULL,
  thumb_path      VARCHAR(512)    NULL,
  checksum        CHAR(64)        NULL,
  source          VARCHAR(24)     NOT NULL DEFAULT 'widget',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_attach_uuid (uuid),
  KEY idx_attach_msg (message_id),
  KEY idx_attach_conv (conversation_id),
  KEY idx_attach_session (session_id),
  KEY idx_attach_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

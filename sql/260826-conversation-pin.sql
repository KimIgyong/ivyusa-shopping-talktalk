-- PLN-260826 — queue pinning (team-shared, max 3 per tenant).
-- Apply BEFORE deploying the code (staging runs DB_SYNCHRONIZE=false).
-- Rollback: ALTER TABLE conversations DROP INDEX idx_conv_tenant_pinned,
--           DROP COLUMN pinned_at, DROP COLUMN pinned_by;

ALTER TABLE conversations
  ADD COLUMN pinned_at DATETIME(6) NULL,
  ADD COLUMN pinned_by BIGINT NULL,
  ADD INDEX idx_conv_tenant_pinned (tenant_id, pinned_at);

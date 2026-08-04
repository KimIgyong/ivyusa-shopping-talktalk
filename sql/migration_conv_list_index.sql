-- migration_conv_list_index.sql — agent-queue composite index (PLN-260804)
-- The /agent/sessions driving query filters tenant_id + status IN (waiting,agent)
-- and orders by id DESC; the existing single-column indexes force an index pick
-- + filesort. This composite serves filter and order in one range scan.
-- Run BEFORE deploying the code (old code + new index = safe).
-- Idempotence: guard with `SHOW INDEX FROM conversations WHERE Key_name='idx_conv_tenant_status_id'`.

ALTER TABLE `conversations`
  ADD INDEX `idx_conv_tenant_status_id` (`tenant_id`, `status`, `id`);

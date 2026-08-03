-- migration_kb_embedding.sql — KB vector hybrid retrieval (PLAN-KB-VectorHybrid-Qdrant)
-- Adds embedding bookkeeping columns to kb_documents. The vectors themselves live
-- in Qdrant (collection `kb_documents`, rebuildable via `npm run kb:reindex`).
-- Run AFTER 01-schema.sql deployments that predate these columns (staging/prod).
-- Idempotence: guard with `SHOW COLUMNS FROM kb_documents LIKE 'embedding_model'` before running.

ALTER TABLE `kb_documents`
  ADD COLUMN `embedding_model` varchar(64) COLLATE utf8mb4_unicode_ci NULL AFTER `embedding_ref`,
  ADD COLUMN `embedded_at` datetime NULL AFTER `embedding_model`;

-- Post-deploy step (not SQL): run `npm run kb:reindex` once so existing rows are
-- embedded into Qdrant. Rows keep status='embedded' but embedding_model NULL until
-- the reindex sweep picks them up.

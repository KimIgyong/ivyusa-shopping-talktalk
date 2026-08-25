-- REQ/PLN-260826 W2 — the AI agent an answer was produced for.
--
-- Reuse is looked up before RAG and was keyed by tenant + language alone, so a
-- reply written for one persona could be replayed to any other. Rows written
-- before this column carry NULL; they stay replayable only for tenants that
-- scope no category (see answer-reuse.service.ts for the rule).
--
-- Apply BEFORE deploying the code.
ALTER TABLE answer_reuse ADD COLUMN ai_agent_id BIGINT NULL AFTER lang;
CREATE INDEX idx_reuse_agent ON answer_reuse (tenant_id, ai_agent_id);

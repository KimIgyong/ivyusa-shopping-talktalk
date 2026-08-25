-- REQ/PLN-260826 W1 — which AI agents may cite documents in a category.
--
-- NULL / [] = every agent (today's behaviour). A non-empty array names the only
-- agents that may. Retrieval reads it as NOT IN (the excluded set), so a tenant
-- that never opens this screen is unaffected and the subquery stays empty.
--
-- Apply BEFORE deploying the code (old code + new column is safe).
ALTER TABLE kb_categories ADD COLUMN agent_ids JSON NULL AFTER hidden;

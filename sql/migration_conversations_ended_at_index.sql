-- AN-260826 P2 — index for the satisfaction and outcome windows.
--
-- Those queries filter conversations by `ended_at` inside a date range and had
-- no index to use; on staging that is 426 rows and invisible, at the size these
-- screens are built for it is a full scan per page view.
--
-- Online DDL: adding a secondary index does not rewrite the table and changes no
-- data. Safe to apply before the code that uses it.
CREATE INDEX idx_conv_tenant_ended ON conversations (tenant_id, ended_at);

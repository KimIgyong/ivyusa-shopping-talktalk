-- FIX-260827 — per-tenant integration status (last tested + detail).
-- Apply BEFORE deploying the code (old code tolerates the extra columns).
ALTER TABLE integration_credentials
  ADD COLUMN last_tested_at datetime NULL,
  ADD COLUMN detail varchar(255) NULL;

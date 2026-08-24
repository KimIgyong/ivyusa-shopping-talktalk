-- migration_ai_usage_daily.sql — AI token usage, rolled up per day (PLN-260824 A)
--
-- Nothing recorded token counts before this. The adapters returned tokensIn and
-- tokensOut on every call and the numbers were dropped, so there was nothing to
-- report — and no way to report it backwards. Usage exists only from the day the
-- meter starts, which is why this goes in ahead of the screen that reads it.
--
-- A daily roll-up, not a row per call: weekly, monthly and custom ranges are all
-- sums of these rows, while a per-call log grows with conversation volume and
-- answers nothing the roll-up cannot.
--
-- Two axes are kept apart on purpose:
--   engine_owner  tenant keys and platform keys reach different invoices, so a
--                 combined total matches neither.
--   stub_calls    the stub spends no tokens. Folded into the totals it reads as
--                 cheap traffic rather than as an engine that is not answering.
--
-- Run BEFORE deploying the backend (old code ignores the table; new code without
-- it would warn on every AI call).
-- Idempotence: guarded, so a re-run is a no-op.

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT      NOT NULL,
  stat_date    DATE        NOT NULL,
  -- Finer than ai_function: `summary` alone covers both the knowledge-conflict
  -- review and the agent briefing, so a per-function total cannot answer which
  -- screen is spending. Falls back to the function name when a caller passes none.
  feature      VARCHAR(32) NOT NULL,
  ai_function  VARCHAR(16) NOT NULL,
  -- Nullable on purpose: deleting an engine must not erase what it already spent.
  engine_id    BIGINT      NULL,
  provider     VARCHAR(24) NOT NULL,
  model        VARCHAR(64) NOT NULL,
  engine_owner VARCHAR(10) NOT NULL,   -- tenant | platform
  calls        INT         NOT NULL DEFAULT 0,
  tokens_in    BIGINT      NOT NULL DEFAULT 0,
  tokens_out   BIGINT      NOT NULL DEFAULT 0,
  stub_calls   INT         NOT NULL DEFAULT 0,
  failures     INT         NOT NULL DEFAULT 0,
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The upsert key. engine_id is part of it so a tenant that switches engines
  -- mid-day gets two rows — which is the point: usage is per engine.
  UNIQUE KEY uk_ai_usage (tenant_id, stat_date, feature, ai_function, engine_id, engine_owner),
  KEY idx_ai_usage_lookup (tenant_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify:
--   SELECT COUNT(*) FROM ai_usage_daily;                -- 0 right after apply
--   After one AI call: one row with calls=1 and non-zero tokens_in.

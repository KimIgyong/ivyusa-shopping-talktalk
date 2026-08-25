-- migration_journey_reports.sql — customer journey analysis reports (PLN-260825)
--
-- Two tables:
--   journey_reports           one written analysis of a group's conversations
--   journey_report_criteria   the rules it was written by, versioned
--
-- The report row is also the job. Catalogue sync keeps progress in memory
-- because its durable record is the audit trail and the work is idempotent;
-- here the report IS the product, so a restart mid-run must not lose it. The
-- cost of that trade is a `pending` row that can outlive the process writing
-- it, which the API sweeps into `failed` at boot.
--
-- Run BEFORE deploying the backend.
-- Idempotence: guarded, so a re-run is a no-op.

CREATE TABLE IF NOT EXISTS journey_reports (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id         BIGINT       NOT NULL,
  group_id          BIGINT       NOT NULL,
  kind              VARCHAR(16)  NOT NULL,          -- journey | comparison
  -- NULL on both ends = "everything", the operator's 전체.
  period_from       DATE         NULL,
  period_to         DATE         NULL,
  -- Pinned, not looked up later: editing the criteria must not change what a
  -- past report concluded, or the decision made from it cannot be retraced.
  criteria_version  INT          NOT NULL,
  -- A group is a view and its membership changes. Without this snapshot the
  -- same report could not be produced twice.
  session_ids_json  JSON         NOT NULL,
  -- What the code computed. The narrative is written FROM this, never instead
  -- of it — a model asked to count produces confident wrong numbers, and a
  -- report is exactly the format that makes them look like evidence.
  metrics_json      JSON         NULL,
  body_md           MEDIUMTEXT   NULL,
  language          VARCHAR(8)   NOT NULL,
  status            VARCHAR(16)  NOT NULL DEFAULT 'pending',   -- pending|ready|failed
  error             VARCHAR(255) NULL,
  source_report_ids JSON         NULL,              -- comparison: the two inputs
  -- Nullable so deleting an engine does not erase what wrote the report.
  engine_id         BIGINT       NULL,
  provider          VARCHAR(24)  NULL,
  model             VARCHAR(64)  NULL,
  -- Hidden rather than deleted: a comparison names two earlier reports as its
  -- input, and a dangling reference makes it unreadable.
  hidden            TINYINT(1)   NOT NULL DEFAULT 0,
  created_by        BIGINT       NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at       DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_jr_lookup (tenant_id, group_id, created_at),
  KEY idx_jr_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journey_report_criteria (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT      NOT NULL,
  version         INT         NOT NULL,
  sections_json   JSON        NOT NULL,
  top_questions_n INT         NOT NULL DEFAULT 5,
  sample_cap      INT         NOT NULL DEFAULT 200,
  quote_max_chars INT         NOT NULL DEFAULT 200,
  tone            VARCHAR(64) NULL,
  banned_json     JSON        NULL,
  created_by      BIGINT      NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The current criteria is simply the highest version. An `active` flag beside
  -- it would be a second source of truth, and when the two disagree there is no
  -- way to tell which one wrote a past report.
  UNIQUE KEY uk_jrc (tenant_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify:
--   SELECT COUNT(*) FROM journey_reports;           -- 0 right after apply
--   Criteria v1 is seeded per tenant by the API on first use, not here.

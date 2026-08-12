-- 260812-backfill-default-job-labels.sql
-- New tenants weren't seeded the default job labels (only tenant ivyusa was, via the
-- seed), so the user-edit label picker was empty on annehearts/amoebaorder. Code now
-- seeds them on tenant creation; this backfills existing tenants that have none.
-- Idempotent: only inserts for tenants with zero job_labels.

INSERT INTO `job_labels` (`tenant_id`, `code`, `name`)
SELECT t.`id`, d.`code`, d.`name`
FROM `tenants` t
CROSS JOIN (
  SELECT 'consult' AS `code`, '상담' AS `name`
  UNION ALL SELECT 'accounting', '회계'
  UNION ALL SELECT 'operations', '운영'
) d
WHERE NOT EXISTS (
  SELECT 1 FROM `job_labels` jl WHERE jl.`tenant_id` = t.`id`
);

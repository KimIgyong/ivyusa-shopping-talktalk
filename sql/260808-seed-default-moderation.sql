-- 260808-seed-default-moderation.sql — backfill starter moderation rules for
-- tenants created before seed-on-create existed (PLN-260807 issue 2).
-- Mirrors apps/api/src/domain/moderation/moderation.defaults.ts. Idempotent: only
-- tenants that currently have ZERO content_filter_rules get the defaults (so a
-- tenant that deliberately cleared its rules, or tenant 1's manual set, is left alone).

INSERT INTO `content_filter_rules`
  (`tenant_id`, `scope`, `type`, `pattern_or_prompt`, `lang`, `severity`, `action`, `is_active`, `created_at`)
SELECT t.id, d.scope, d.type, d.pattern_or_prompt, NULL, 'medium', d.action, 1, NOW()
FROM `tenants` t
JOIN (
            SELECT 'both' AS scope, 'regex'   AS type, '[\\w.+-]+@[\\w-]+\\.[\\w.-]+'        AS pattern_or_prompt, 'mask' AS action
  UNION ALL SELECT 'both',          'regex',           '01[016789][- ]?\\d{3,4}[- ]?\\d{4}',                     'mask'
  UNION ALL SELECT 'both',          'regex',           '\\b\\d{13,16}\\b',                                       'mask'
  UNION ALL SELECT 'ai',            'context',         'The message contains profanity, hate speech, harassment, sexual, or discriminatory content.', 'warn'
) d
WHERE NOT EXISTS (
  SELECT 1 FROM `content_filter_rules` c WHERE c.tenant_id = t.id
);

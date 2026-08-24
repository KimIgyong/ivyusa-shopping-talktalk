-- migration_knowledge_taxonomy.sql — per-tenant usage types and document categories (PLN-260824)
--
-- Two classification lists that were fixed to IVY USA become tenant data:
--
--   usage_types    the product types a tenant writes usage guides for. Ten of
--                  these lived in code (usage-guide.types.ts) and every tenant
--                  got IVY USA's ten. Measured before the change, they matched
--                  65% of IVY USA's catalogue and 0% of the other two.
--   kb_categories  the document categories a tenant actually uses. The strings
--                  already existed in kb_documents.category; this gives them a
--                  row so they can be renamed, merged, ordered and hidden.
--
-- kb_documents.category is NOT changed to a foreign key. Categories arrive from
-- outside as names (catalogue sync, source adapters, CSV import), so a surrogate
-- key would cost a name->id lookup at every boundary and save only a bulk UPDATE
-- on the rare rename (PLN D6-1).
--
-- Run BEFORE deploying the backend. Old code ignores both tables, so the gap
-- between this and the deploy is safe; the reverse (new code, no tables) is a 500.
-- Idempotence: guarded, so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_types (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  -- `type_key`, not `key`: KEY is reserved, and every hand-written query would
  -- otherwise have to remember the backticks.
  type_key   VARCHAR(64)  NOT NULL,
  label      VARCHAR(128) NOT NULL,
  keywords   TEXT         NULL,
  -- First match wins, so order is meaning: a narrow type must be able to sit
  -- above the broad one containing it ("lash adhesive" before "lash").
  sort_order INT          NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usage_type (tenant_id, type_key),
  KEY idx_usage_type_tenant (tenant_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_categories (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  -- Matches kb_documents.category exactly, including its width.
  name       VARCHAR(64)  NOT NULL,
  label      VARCHAR(128) NULL,
  -- manual | catalog | seed. 'catalog' rows are read-only: product sync uses the
  -- stored category to decide a document is unchanged, so a rename bounces back
  -- at the next sync (catalog-sync.service.ts).
  origin     VARCHAR(16)  NOT NULL DEFAULT 'manual',
  sort_order INT          NOT NULL DEFAULT 0,
  hidden     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kb_category (tenant_id, name),
  KEY idx_kb_category_tenant (tenant_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Carry the existing behaviour over
-- ---------------------------------------------------------------------------
-- The ten hardcoded types become rows for whichever tenants have a catalogue
-- they classify. Keys are preserved verbatim: the guide document's external_key
-- is `usage:{key}`, so a new key would orphan any guide already written.
--
-- Only tenant 1 (ivyusa) gets them. Giving an apparel shop "Press-on nails" is
-- the bug this migration exists to fix, so it is not repeated here; new tenants
-- get the neutral seed from TenantService instead.

INSERT IGNORE INTO usage_types (tenant_id, type_key, label, keywords, sort_order) VALUES
  (1, 'lash_adhesive', 'Lash adhesive',        'lash adhesive\neyelash adhesive\nlash glue\nbrow glue', 10),
  (1, 'lashes',        'Lashes',               'lash\neyelash', 20),
  (1, 'press_on_nails','Press-on nails',       'press on\npress-on\nimpress\nartificial nail\nfalse nail\nfake nail', 30),
  (1, 'nail_polish',   'Nail polish / gel',    'nail polish\ngel polish\nnail lacquer\ntop coat\nbase coat', 40),
  (1, 'hair_color',    'Hair color',           'hair color\nhair colour\nhair dye\nbleach\ndeveloper\ntoner kit', 50),
  (1, 'wig_hairpiece', 'Wigs & hairpieces',    'wig\nponytail\nhairpiece\nhair piece\nweave\nbraid\nbundle\nclosure\nfrontal', 60),
  (1, 'heated_tool',   'Heated styling tools', 'flat iron\ncurling\nblow dry\nhair dryer\nheated\nstraightener\nhot comb', 70),
  (1, 'skincare',      'Skincare',             'serum\nampoule\ntoner\nessence\nmoisturizer\ncream\ncleanser\nmask\nsunscreen\nspf\npeeling\nexfoliat\ncleansing', 80),
  (1, 'makeup',        'Makeup',               'lipstick\nlip oil\nlip gloss\nlip balm\nconcealer\nfoundation\nmascara\neyeliner\neyebrow\nbrow pencil\nblush\npowder\nprimer\npalette\nmakeup', 90),
  (1, 'edge_styling',  'Hair styling products','edge control\nstyling gel\nhair wax\npomade\nhair oil\nhair spray\nmousse', 100);

-- Every category a document already carries becomes a row, tagged with where it
-- came from. Without this the console's category list would come up empty on the
-- first load after deploy, and product-sync categories would look manual.
INSERT IGNORE INTO kb_categories (tenant_id, name, origin)
SELECT DISTINCT d.tenant_id,
       d.category,
       CASE WHEN d.source = 'product_catalog' THEN 'catalog' ELSE 'manual' END
FROM kb_documents d
WHERE d.tenant_id IS NOT NULL
  AND d.category IS NOT NULL
  AND d.category <> '';

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------
--   SELECT tenant_id, COUNT(*) FROM usage_types GROUP BY tenant_id;
--     -> tenant 1 has 10
--   SELECT tenant_id, origin, COUNT(*) FROM kb_categories GROUP BY tenant_id, origin;
--     -> matches SELECT tenant_id, COUNT(DISTINCT category) FROM kb_documents ...
--   Guides keep resolving: external_key 'usage:{type_key}' is unchanged.

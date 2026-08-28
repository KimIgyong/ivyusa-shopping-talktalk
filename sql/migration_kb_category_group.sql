-- PLN-260829 (2차): kb_categories에 doc_group 축 추가 + 유니크 (tenant, group, name).
-- 적용 순서: 스테이징/프로덕션 DB에 이 SQL을 선적용한 뒤 코드를 배포한다
-- (구코드+새컬럼 = 안전; 새코드+구스키마 = rename/merge가 그룹 조건으로 0건 갱신).
-- 멱등: 각 단계가 이미 적용됐으면 건너뛴다.

-- 1) 컬럼 추가
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kb_categories' AND COLUMN_NAME = 'doc_group');
SET @sql := IF(@has_col = 0,
  "ALTER TABLE kb_categories ADD COLUMN doc_group VARCHAR(16) NOT NULL DEFAULT 'counsel' AFTER name",
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) 백필 ①: 카탈로그 출신은 product 고정 (REQ D3 — 카탈로그 지식은 전 에이전트 공통)
UPDATE kb_categories SET doc_group = 'product' WHERE origin = 'catalog' AND doc_group = 'counsel';

-- 3) 백필 ②: 나머지는 그 이름을 실제로 가진 문서의 최다 그룹 (동률/무문서 = counsel 유지)
UPDATE kb_categories c
JOIN (
  SELECT tenant_id, category,
         SUBSTRING_INDEX(GROUP_CONCAT(doc_group ORDER BY cnt DESC, doc_group ASC), ',', 1) AS g
  FROM (
    SELECT tenant_id, category, doc_group, COUNT(*) AS cnt
    FROM kb_documents
    WHERE category IS NOT NULL AND category <> ''
    GROUP BY tenant_id, category, doc_group
  ) x
  GROUP BY tenant_id, category
) m ON m.tenant_id = c.tenant_id AND m.category = c.name
SET c.doc_group = m.g
WHERE c.origin <> 'catalog' AND c.doc_group <> m.g;

-- 4) 유니크 교체: (tenant_id, name) → (tenant_id, doc_group, name)
SET @uk_cols := (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kb_categories' AND INDEX_NAME = 'uk_kb_category');
SET @sql := IF(@uk_cols = 'tenant_id,name',
  'ALTER TABLE kb_categories DROP INDEX uk_kb_category, ADD UNIQUE KEY uk_kb_category (tenant_id, doc_group, name)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 롤백(수동): 그룹별 동명 행이 생기기 전까지 안전
--   ALTER TABLE kb_categories DROP INDEX uk_kb_category,
--     ADD UNIQUE KEY uk_kb_category (tenant_id, name);
--   ALTER TABLE kb_categories DROP COLUMN doc_group;

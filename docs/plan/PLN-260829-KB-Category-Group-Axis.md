# PLN-260829 — 지식 페이지 2차: 카테고리 그룹 축 (그룹별 탭 + 그룹별 에이전트 지정)

- 근거: `docs/analysis/REQ-260829-Knowledge-Page-Enhancements.md` R2 (D2-1 스키마 변경 승인됨)
- ⚠️ **스키마 변경 있음** — 스테이징 `DB_SYNCHRONIZE=false`: SQL 선적용 후 코드 배포(pre-deploy-check)

## 0. 설계 결정 (승인 시 확정)

| # | 결정 | 선택안 (권고) | 근거 |
|---|---|---|---|
| D2-a | 카테고리 관리 탭 | **그룹 탭 3개(CounselInfo/ProductInfo/OperationInfo), 전체 탭 없음, 기본=CounselInfo** | 이름변경·병합·에이전트 지정은 전부 그룹 문맥이 필요 — 전체 탭은 읽기 전용이 되어 혼란만 유발 |
| D2-b | 백필 규칙 | ① `origin='catalog'` → product ② 그 외 = 해당 이름을 가진 문서의 **최다 그룹**(동률·무문서=counsel) | 스테이징 그룹 교차 카테고리 0건 확인 — 사실상 1:1 매핑 |
| D2-c | 유니크 축 | `uk_kb_category (tenant_id, name)` → `uk_kb_category (tenant_id, doc_group, name)` | 같은 이름이 그룹별로 독립 존재 가능(예: counsel의 "배송"과 operation의 "배송") |
| D2-d | 문서 추가 모달 datalist | 선택 그룹의 카테고리로 필터(1차에서 보류한 R3 잔여분 해소) | 그룹 축이 생겨야 가능했던 항목 |
| D2-e | 에이전트 스코프 적용 | RAG 제외 서브쿼리·answer-reuse의 카테고리 대조를 **(doc_group, name) 쌍**으로 | 이름 전역 매칭은 타 그룹 동명 카테고리를 오배제 |
| D2-f | reorder UI | 이번에도 범위 외(부수 갭 유지) | 요구에 없음 — 과확장 방지 |
| D2-g | 신규 그룹 문서의 카테고리 행 | `ensure()`가 (tenant, group, name)으로 생성 — 호출부 전원에 그룹 전달 | 현 호출부 2곳(카탈로그 동기화=product 고정, 일괄등록=업로드 그룹) + 소스 동기화 경로 확인 후 counsel 고정 |

## 1. 마이그레이션 (`sql/migration_kb_category_group.sql`, 멱등)

```sql
ALTER TABLE kb_categories ADD COLUMN doc_group VARCHAR(16) NOT NULL DEFAULT 'counsel' AFTER name;
-- 백필 ①: 카탈로그 출신은 product
UPDATE kb_categories SET doc_group='product' WHERE origin='catalog';
-- 백필 ②: 나머지는 그 이름을 가진 문서의 최다 그룹
UPDATE kb_categories c JOIN (
  SELECT tenant_id, category, SUBSTRING_INDEX(GROUP_CONCAT(doc_group ORDER BY cnt DESC),',',1) g
  FROM (SELECT tenant_id, category, doc_group, COUNT(*) cnt FROM kb_documents
        WHERE category IS NOT NULL GROUP BY tenant_id, category, doc_group) x
  GROUP BY tenant_id, category) m
  ON m.tenant_id=c.tenant_id AND m.category=c.name
SET c.doc_group=m.g WHERE c.origin<>'catalog';
ALTER TABLE kb_categories DROP INDEX uk_kb_category,
  ADD UNIQUE KEY uk_kb_category (tenant_id, doc_group, name);
```
- 롤백: 유니크 원복 + 컬럼 DROP (신규 그룹별 동명 행이 생기기 전까지 안전).
- 순서: **스테이징 SQL 선적용 → 코드 배포**(구코드+새컬럼 안전). PR 본문 `## Migration` 체크리스트.

## 2. 백엔드 작업

1. `kb-category.entity.ts`: `docGroup` 컬럼(+`@Unique` 3축) — 부팅 검증 필수.
2. `KbCategoryService` 그룹 인지화:
   - `list(tenantId, group)` / `countsFor(tenantId, group)` — 그룹 스코프 집계,
     unregistered 파생도 해당 그룹 문서 기준.
   - `ensure(tenantId, name, origin, docGroup)` — 호출부: 카탈로그 동기화(product 고정),
     일괄등록(업로드 그룹), 필요 시 소스 동기화(counsel).
   - `create/rename/merge/remove` — 그룹 문맥 필수(생성 body `doc_group`, rename/merge의
     문서 일괄 UPDATE에 `doc_group` 조건 추가 — 타 그룹 동명 문서 오염 방지).
   - `setAgents/setHidden/reorder` — id 기반이라 시그니처 유지(행이 이미 그룹 소속).
3. 검색 스코프(D2-e):
   - `rag.service.ts` 제외 서브쿼리에 `AND c.doc_group = kb.doc_group` 추가.
   - `answer-reuse.service.ts`의 스코프 존재 검사·카테고리 대조를 (group, name) 쌍으로.
4. 컨트롤러: `GET /knowledge/categories?group=`(필수화 아님, 기본 counsel),
   `POST /knowledge/categories` body에 `doc_group`(@IsIn DOC_GROUP).
5. 테스트: 백필 규칙 단위화는 SQL이라 제외 — 서비스 그룹 스코프(list/ensure/rename/merge
   격리), RAG 제외 쿼리 그룹 조건(기존 knowledge-ask-agent-scope 스펙 확장), answer-reuse.

## 3. 프런트 작업

1. `CategoryManagerCard`: 그룹 탭 3개(기본 counsel) — KB-Documents 탭과 동일한 스타일.
   목록·추가·이름변경·병합·에이전트 지정·숨김 전부 활성 탭 그룹으로 동작.
2. 훅/서비스: `useCategoryRows(group)`(query key에 group), create에 `doc_group` 전달.
3. Add KB-Document 모달: `categorySuggestions`를 선택 그룹으로 필터(D2-d).
4. KB-Documents 카드의 카테고리 내비게이터: 기존 `categories/counts?group=` 경로 그대로
   (변경 불요 — 이미 그룹 파라미터 지원).
5. i18n: 신규 키 최소(탭은 기존 `group.*` 재사용).

## 4. UI 와이어프레임

```
[카테고리 관리 카드]
┌────────────────────────────────────────────────────────────┐
│ 카테고리 관리                         [병합] [+ 카테고리]    │
│ [CounselInfo] [ProductInfo] [OperationInfo]                │ ← 그룹 탭(신규, 기본 Counsel)
│ ── 내 카테고리 ──────────────────────────────────────────  │
│  faq            13 docs   [에이전트] [이름변경] [숨김] [삭제]│
│  policy          3 docs   [에이전트] [이름변경] [숨김] [삭제]│
│ ── 카탈로그 카테고리(ProductInfo 탭에서만) ── 🔒            │
└────────────────────────────────────────────────────────────┘

[+ 카테고리 모달]  그룹: (활성 탭 고정 표기) · 이름 [____]
[Add KB-Document]  그룹 변경 시 카테고리 자동완성 목록이 그 그룹으로 갱신
```

## 5. 측면 영향

| 영역 | 영향 | 대응 |
|---|---|---|
| 스키마 | kb_categories 컬럼+유니크 변경 | §1 SQL 선적용, 엔티티 동기화, 실부팅 검증 |
| RAG/답변재사용 | 제외 조건이 (group,name) 쌍으로 정밀화 — 기존 단일 그룹 데이터에선 결과 동일 | 스코프 스펙 회귀로 보증 |
| 위젯 | 무영향(카테고리 API 미사용) | — |
| 기존 에이전트 스코프 | 백필 후 각 행이 원래 그룹에 귀속 — 의미 보존 | 스테이징 교차 0건 확인됨 |
| 병합/이름변경 | 그룹 조건 추가로 타 그룹 동명 문서 보호(현재는 잠재 결함) | 신규 테스트 |
| catalog 잠금 | product 탭에서만 노출 — 타 탭 UI 단순화 | — |

## 6. 리스크

- 유니크 축 변경 중 중복 발생 불가(기존 축이 더 엄격). 마이그레이션은 트랜잭션 불가 DDL
  포함 — 컬럼 추가→백필→유니크 교체 순서로 각 단계 멱등 가드.
- `rename`의 문서 UPDATE가 그룹 조건 없이는 이제 **오염 결함**이 됨 — 서비스 변경과 스키마
  적용을 같은 배포로 묶고, SQL 선적용 상태에서 구코드가 잠시 돌아도 안전(구코드는 그룹
  무시 = 기존 동작).

---
**승인 요청**: D2-a~D2-g 포함 본 계획으로 구현 진행 여부를 확인해 주세요.

# RPT-260824-Knowledge-Taxonomy-Per-Tenant

지식 분류 체계의 테넌트화 — 구현 결과

- 근거: `REQ-260824` / `PLN-260824` / `TCR-260824`
- 상태: **스테이징 배포·검증 완료 2026-08-24**

## 1. 배포 상태

| PR | 내용 | 커밋 |
|---|---|---|
| #341 | 구현(A축·B축·콘솔·i18n·마이그레이션) | `561c9ea` |
| #342 | origin 판정 결함 수정 | `445a82f` |
| #343 | 라우트 충돌 2건 수정 | `1b39bfd` |
| #344 | 미리보기 문구 결함 수정 | `f258bf3` |

- 스테이징: **배포 완료** (`shoptalk.amoeba.site`) — SQL 선적용 → 코드 배포 순서 준수
- 프로덕션: 미배포 환경

**마이그레이션**: `sql/migration_knowledge_taxonomy.sql` (멱등). 스테이징 적용 결과
`usage_types` 10행 · `kb_categories` 85행. 롤백은 `DROP TABLE usage_types, kb_categories;`
— 문서·가이드를 건드리지 않으므로 데이터 손실이 없습니다.

## 2. 무엇이 바뀌었나

**요청**: Usage guides를 테넌트별로 + 카테고리 관리 기능.

**먼저 확인한 것**: 가이드 **본문은 이미 테넌트별**이었습니다(`tenant_id` 스코프). 테넌트별이
아닌 것은 **쓸 수 있는 유형 목록**이었습니다. 그래서 본문 저장·격리는 재구현하지 않았습니다.

### A축 — 사용법 유형
코드 상수 10종 → `usage_types` 테넌트 행. 추가·수정·순서변경·비활성, 실시간 매칭 미리보기,
신규 테넌트 중립 3종 시딩(생성 경로 2곳). 라벨은 i18n 키가 아니라 데이터가 됐고, 죽은
`usageType_*` 10키 × 6언어를 제거했습니다.

### B축 — 문서 카테고리
`kb_categories` 신설. 이름변경·병합·숨김·정렬·빈 것 삭제. 이름변경/병합은 한 트랜잭션.
카탈로그 파생은 읽기 전용. 하드코딩 제안 19종 제거.

### 파일
```
신규  apps/api/.../entity/usage-type.entity.ts · entity/kb-category.entity.ts
      usage-type.service.ts(+spec) · kb-category.service.ts(+spec)
      apps/web/.../UsageTypeEditor.tsx · CategoryManagerCard.tsx
      sql/migration_knowledge_taxonomy.sql
수정  usage-guide.types.ts · usage-guide.service.ts(+spec) · knowledge.{controller,mapper,module}.ts
      catalog-sync.service.ts(+spec) · dto/request/knowledge.request.ts
      tenant.service.ts(+spec) · tenant.module.ts
      apps/web/.../KnowledgePage.tsx · knowledge.{service,hooks}.ts · locales × 6
```

## 3. 배포에서만 드러난 결함 3건

세 건 모두 **상태코드는 정상**이었고, 응답 내용을 열어봐야 보였습니다.

### D-1. 이중 사용 카테고리가 잠기지 않음 (PR #342)
`origin`을 행 단위로 판정해, 상품 동기화와 사람이 **둘 다 쓰는** 카테고리가 먼저 조회된 행의
라벨을 받았습니다. 스테이징의 `Kiss New York`(카탈로그 135 + 수동 26)이 `manual`로 들어가
편집 가능해졌습니다. 이름을 바꿨다면 다음 동기화가 카탈로그 쪽 135건을 되돌려 써
**카테고리가 둘로 갈라졌을 것**입니다.
→ `(tenant, category)` 단위 집계 + 재실행이 고치는 UPDATE + `ensure()`의 승격 규칙.

### D-2. `GET /knowledge/categories` 라우트 충돌 (PR #343)
같은 경로의 핸들러가 **이미 있었습니다**(카테고리별 문서 수 리포트). 먼저 선언돼 있어 새
카테고리 목록이 도달 불가였고, 콘솔 카드는 `{group, category, total}`을 받았습니다.
**에러는 어디에도 나지 않았습니다.** → 리포트를 `categories/counts`로 이동.

같은 PR에서 `PUT usage-types/reorder`가 `PUT usage-types/:id` 뒤에 선언돼 가려진 것도
고쳤습니다(`Number('reorder')` → NaN).

### D-3. 미리보기가 "키워드가 틀렸다"로 읽힘 (PR #344)
새 유형에 `press on`을 넣으면 0개가 나옵니다. 숫자는 **맞습니다** — 새 유형은 순서 맨 아래고
첫 매치가 이기므로 그 209개는 오지 않습니다. 그런데 화면은 "상품명과 표현을 확인하라"고
말해 **맞는 키워드를 고치러 보냈습니다.** 미리보기가 막으려던 조용한 오해가 다른 문으로
들어온 셈입니다. → "위에 있는 X가 가져갑니다"로 원인과 해법을 분리.

## 4. 설계 판단 기록

- **`kb_documents.category`는 문자열 유지**(PLN D6-1). 카테고리는 바깥에서 **이름으로** 들어옵니다
  (카탈로그 동기화·소스 어댑터·CSV). FK는 모든 경계에서 name→id 변환을 영구히 지불하고 아끼는
  것은 드문 이름변경의 일괄 UPDATE 하나뿐입니다. 드리프트는 모든 writer를 `ensure()`로 통과시키고
  `list()`가 **문서가 실제로 든 값**을 세게 해서 드러나도록 했습니다.
- **컬럼명 `key` → `type_key`** (계획서와 다름). `KEY`는 MySQL 예약어라 손으로 쓰는 쿼리마다
  백틱을 기억해야 합니다.
- **라벨은 단일 문자열**(D1). 6언어 입력은 검수 부담을 운영자에게 넘기는 일이고, 자기 카탈로그
  용어는 원어가 더 정확합니다.
- **기본 세트는 키워드 없이**(D4). 못 본 카탈로그의 용어를 지어내면 자신 있는 헛소리가 됩니다.
  "0개"가 곧 손볼 지점을 가리킵니다.

## 5. 잔여

| # | 내용 |
|---|---|
| R-1 | **콘솔 실화면 스모크**(TCR §3 M-1~M-9) — 사람이 봐야 합니다 |
| R-2 | vi/ja/zh 신규 39키는 LLM 초벌(β). 원어민 검수 대기 |
| R-3 | **채택률**(REQ D5) — 작성된 가이드는 여전히 전 테넌트 0건입니다. 유형을 연 것이 선행 조건이었을 뿐, 미작성 유형을 어디서 알릴지는 별건 |
| R-4 | 프로덕션 배포 시 SQL 선적용 필요 |

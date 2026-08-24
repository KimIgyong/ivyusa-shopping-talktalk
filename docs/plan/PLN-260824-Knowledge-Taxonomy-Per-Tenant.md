# PLN-260824-Knowledge-Taxonomy-Per-Tenant

지식 분류 체계의 테넌트화 (Usage guide 유형 + 문서 카테고리) — 구현 계획

- 근거: `docs/analysis/REQ-260824-Knowledge-Taxonomy-Per-Tenant.md`
- 승인된 결정: **D6 = 테이블 승격**, 그 외 권장안(D1a·D2a·D3b·D4b·D5 범위밖·D7·D8a·D9b) 승인 2026-08-24
- 원칙: 본문·문서의 테넌트 격리는 이미 되어 있으므로 재구현하지 않는다. 분류 체계만 옮긴다.

## 0. 설계 결정

| # | 결정 | 근거 |
|---|------|------|
| **D1** | 라벨은 **단일 문자열**(다국어 아님) | 운영자에게 6언어 입력을 요구하면 [[i18n-six-languages]]의 검수 부담을 그대로 넘기는 일. 자기 카탈로그 용어는 원어가 더 정확 |
| **D2** | 키워드 편집 **전체 노출 + 실시간 매칭 개수** | 잘못된 키워드는 에러 없이 0개가 된다. 즉시 개수가 유일한 방어선(REQ C6) |
| **D3** | 상품 0개 테넌트도 **카드 노출 + 안내 문구** | 숨기면 기능의 존재를 모른다. go2joy·skyliving·gif2box가 해당 |
| **D4** | 기본 세트는 **업종 무관 최소 세트** | 의류 테넌트에게 "붙임 손톱"을 기본값으로 준 것이 현재 문제의 원인 |
| **D5** | 채택률(전 테넌트 0건)은 **범위 밖**, RPT에 기록 | 유형을 여는 것이 선행 조건. 알림·유도는 별건 |
| **D6** | 카테고리를 **`kb_categories` 테이블로 승격** | 사용자 결정. 존재·라벨·정렬·숨김·출처가 문서에서 역산되지 않고 1급 데이터가 된다 |
| **D6-1** | 문서는 **`kb_documents.category` 문자열을 유지**하고, 테이블은 `(tenant_id, name)` 유니크로 그 문자열을 소유한다 | ⚠️ 아래 별항 참조 |
| **D7** | 정렬·숨김·라벨은 `kb_categories`가 보관 | D6로 흡수 |
| **D8** | 카탈로그 파생 카테고리는 **이름 변경 금지**(읽기 전용) | `catalog-sync.service.ts:345`가 무변경 판정에 카테고리를 쓰므로 **다음 동기화가 되돌려 쓴다**. 막는 편이 정직 |
| **D9** | Qdrant 카테고리 사본은 **낡게 두고 기록** | 검색 필터는 `active`+`tenant_id`뿐이고(`qdrant.service.ts:110`) 표시용 카테고리는 MySQL에서 읽는다(`rag.service.ts:207,228`). 오늘 아무도 읽지 않는 값을 위해 `setPayload` 경로를 새로 만드는 건 과함 |

### ⚠️ D6-1 — "승격"을 이렇게 해석했습니다

승격의 실익(추가·이름변경·병합·정렬·숨김·출처 구분·기본 세트 시딩)은 **`(tenant_id, name)` 유니크
테이블**로 전부 얻습니다. 반면 `kb_documents.category`를 **FK(`category_id`)로 정규화**하면:

- 문서 2,359건(스테이징 4개 테넌트 합) 데이터 마이그레이션
- `catalog-sync`가 이름을 쓰므로 매 동기화마다 name→id 해석 필요
- 콘솔 목록·필터, 매퍼, DTO, RAG 인용 라벨의 카테고리 경로 전면 수정
- 되살아나는 파생 값(D8)마다 행 생성이 필요

즉 **범위가 배로 커지는 대신 얻는 것은 이름 변경 시 문서 UPDATE를 아끼는 것 하나**입니다.
이름 변경은 드문 작업이고 트랜잭션 한 번이면 끝나므로, 이번에는 **문자열 유지**를 택합니다.
나중에 FK가 필요해지면 이 테이블이 그 전제가 되므로 되돌아가지 않는 방향입니다.

> **다르게 원하시면 지금 말씀해 주십시오** — FK 정규화로 가면 W2가 두 배가 되고
> 마이그레이션 리스크가 생깁니다. 이 문단이 그 갈림길입니다.

## 1. 스키마 (신규 2 테이블, 마이그레이션 SQL)

```sql
-- A축: 테넌트별 사용법 유형
CREATE TABLE usage_types (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT       NOT NULL,
  `key`         VARCHAR(64)  NOT NULL,   -- external_key 'usage:{key}'의 그 key
  label         VARCHAR(128) NOT NULL,   -- D1 단일 문자열
  keywords      TEXT         NULL,       -- 줄바꿈 구분
  sort_order    INT          NOT NULL DEFAULT 0,   -- 첫 매치 우선이므로 순서가 의미(REQ C2)
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usage_type (tenant_id, `key`),
  KEY idx_usage_type_tenant (tenant_id, sort_order)
);

-- B축: 테넌트별 문서 카테고리 (D6 승격)
CREATE TABLE kb_categories (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT       NOT NULL,
  name          VARCHAR(64)  NOT NULL,   -- kb_documents.category와 같은 문자열 (D6-1)
  label         VARCHAR(128) NULL,       -- 표시명. NULL이면 name 그대로
  origin        VARCHAR(16)  NOT NULL DEFAULT 'manual',  -- manual | catalog | seed
  sort_order    INT          NOT NULL DEFAULT 0,
  hidden        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_kb_category (tenant_id, name),
  KEY idx_kb_category_tenant (tenant_id, sort_order)
);
```

`` `key` ``는 예약어이므로 백틱(코드 컨벤션). 두 테이블 모두 `tenant_id` 축을 갖습니다.

**이관 SQL(같은 파일)**: 현행 10종을 **ivyusa(tenant 1)의 행으로** 삽입하되 **`key`를 그대로
유지**합니다 — `external_key='usage:{key}'`가 문서의 안정 키이기 때문입니다(REQ C3).
그리고 기존 문서에서 실제 사용 중인 카테고리를 `kb_categories`로 채웁니다:

```sql
INSERT IGNORE INTO kb_categories (tenant_id, name, origin)
SELECT DISTINCT d.tenant_id, d.category,
       CASE WHEN d.source = 'product_catalog' THEN 'catalog' ELSE 'manual' END
FROM kb_documents d WHERE d.category IS NOT NULL AND d.category <> '';
```

## 2. 단계별 계획

### W1 — A축 백엔드 (PR 1)
- `entity/usage-type.entity.ts` — nullable 컬럼은 **명시적 `type:`**(dev-kit A-1: union 타입만 쓰면
  TypeORM이 `Object`로 추론해 **부팅이 죽고 tsc는 못 잡습니다**). 엔티티 변경 후 실부팅 확인.
- `usage-type.service.ts` — list/create/update/reorder/deactivate. `key`는 라벨에서 슬러그 생성,
  충돌 시 접미사. **키는 생성 후 변경 불가**(C3).
- `usage-guide.service.ts` 수정 — `USAGE_TYPES` 상수 대신 테넌트 행을 읽는다.
  `classifyUsageType`은 순수 함수로 남기되 **유형 배열을 인자로** 받는다(테스트 유지).
- `usage-guide.service.upsert()`의 목록 대조를 테넌트 행 대조로. 실패는
  `BusinessException(VALIDATION_FAILED, 400)`.
- **매칭 미리보기 API** — 저장 전 키워드로 몇 개가 걸리는지(D2). `POST /knowledge/usage-types/preview`
- 시딩: `tenant.service.ts:166`·`:224` 두 경로에 `seedDefaultUsageTypes` 추가(`seedDefaultJobLabels` 옆).
  기본 세트는 D4 — 업종 무관 최소(`사용법`·`관리/보관`·`주의사항` 3종, 키워드 없음).
- 테스트: 분류 순서 의존, 키 슬러그 충돌, 미리보기 개수, 비활성 유형 제외, 이관 후 ivyusa 무회귀.

### W2 — B축 백엔드 (PR 1)
- `entity/kb-category.entity.ts` + `kb-category.service.ts`
  - `list(tenantId)` — 이름·라벨·문서수·origin·정렬·숨김. 문서수는 `kb_documents` 집계.
  - `rename(from, to)` — **트랜잭션**: `kb_categories` 행 갱신 + `kb_documents.category` 일괄 UPDATE.
    `origin='catalog'`이면 **거부**(D8, 400 + 사유).
  - `merge(from[], into)` — 문서를 옮기고 빈 행 삭제. 같은 트랜잭션.
  - `setHidden` / `reorder` / `remove`(문서 0건일 때만).
  - 카탈로그 동기화가 새 카테고리를 만들면 **`origin='catalog'`로 자동 upsert**(REQ C9).
- `catalog-sync.service.ts`에 upsert 훅 추가 — 문서를 쓸 때 카테고리 행을 보장.
- 컨트롤러 라우트 + DTO(snake_case 요청 / camelCase 응답 매퍼).
- 테스트: rename 트랜잭션, catalog origin 거부, merge 후 문서수, 문서 있는 카테고리 삭제 거부.

### W3 — 콘솔 (PR 1)
- Usage guides 카드에 **유형 관리** 추가(§3 와이어프레임 1·2)
- **카테고리 관리** 카드 신규(§3 와이어프레임 3·4)
- 하드코딩 `CATEGORIES` 19종 제거 → 테넌트 목록 사용(REQ G8)
- 훅·서비스·토스트는 기존 패턴 그대로. **모든 저장에 성공/실패 피드백**(CLAUDE.md §2 UX MUST)
- i18n **6개 언어** 신규 키 + `npm run i18n:check`. vi/ja/zh는 β 상태이므로 검수 대기 목록에 추가

### W4 — 배포·검증·문서 (PR 2 = docs)
- ⚠️ **SQL을 스테이징 DB에 먼저 적용한 뒤 코드 배포**(staging `DB_SYNCHRONIZE=false`)
- 배포 검증 3종(부팅 로그·컨테이너 age·신규 라우트 401) + **내용 검증**(이관 행 수, ivyusa 10종 유지)
- TCR-260824 + RPT-260824 + 메모리 갱신

## 3. UI 와이어프레임 (필수)

**① Usage guides 카드 — 유형 관리 통합**
```
┌ Usage guides ───────────────────────────────── [＋ 유형 추가] ┐
│ 사용법은 상품이 아니라 유형에 속합니다. 유형마다 하나씩 쓰면   │
│ 그 유형의 모든 상품 옆에 함께 인용됩니다.                      │
│                                                                │
│ ⋮⋮ 유형              상품    상태        동작                  │
│ ⋮⋮ 사용법             128    ● 작성됨    [편집] [유형수정] [끄기]│
│ ⋮⋮ 관리·보관           64    ○ 미작성    [작성] [유형수정] [끄기]│
│ ⋮⋮ 세탁·소재 관리       0 ⚠  ○ 미작성    [작성] [유형수정] [끄기]│
│                        └ 키워드가 걸리는 상품이 없습니다        │
│ ⋮⋮ 로 순서 변경 — 위에 있는 유형이 먼저 매칭됩니다             │
└────────────────────────────────────────────────────────────────┘
 (상품 0개 테넌트)  ⓘ 카탈로그가 없어 상품 수는 0으로 표시됩니다.
                     가이드 본문은 그대로 작성·인용됩니다.        ← D3
```

**② 유형 추가·수정 모달 — 실시간 매칭 개수 (D2)**
```
┌ 유형 수정 ─────────────────────────────────────┐
│ 이름     [세탁·소재 관리                    ]   │
│ 키워드   ┌────────────────────────────────┐    │
│  (줄바꿈) │ cotton                          │    │
│          │ linen                           │    │
│          │ wool                            │    │
│          └────────────────────────────────┘    │
│          내 카탈로그에서 → 지금 **37개** 상품    │
│          미리보기: Botanical Cotton Shirt_PINK,  │
│                    Fluid Lounge Pants_IVORY …   │
│ ⓘ 위에 있는 유형이 먼저 매칭됩니다. 좁은 유형을 │
│   위로 두십시오(예: "린넨 셔츠" > "셔츠").      │
│                          [취소]  [저장]         │
└─────────────────────────────────────────────────┘
```

**③ 카테고리 관리 카드**
```
┌ 카테고리 ──────────────────────────── [＋ 추가] [병합] ┐
│ 내가 만든 것                                            │
│ ⋮⋮ faq                  13건   [이름변경][숨김][삭제]   │
│ ⋮⋮ policy                2건   [이름변경][숨김][삭제]   │
│ ⋮⋮ policy_payment        1건   [이름변경][숨김][삭제]   │
│                                                         │
│ 카탈로그에서 생성됨  🔒                                 │
│    All                134건   [숨김]                    │
│    26 Summer Lookbook   1건   [숨김]                    │
│    ⓘ 상품 동기화가 만든 이름입니다. 바꿔도 다음        │
│      동기화에서 되돌아오므로 변경할 수 없습니다. ← D8   │
└─────────────────────────────────────────────────────────┘
```

**④ 이름변경 / 병합 모달**
```
┌ 이름 변경 ───────────────┐   ┌ 병합 ───────────────────────┐
│ faq  →  [자주 묻는 질문 ] │   │ 옮길 카테고리 (복수 선택)     │
│ 문서 13건이 함께 바뀝니다 │   │  ☑ policy_return   2건       │
│         [취소] [변경]     │   │  ☑ policy_claims   0건       │
└───────────────────────────┘   │ 대상 [policy ▼]              │
                                │ 문서 2건이 policy로 이동하고  │
                                │ 빈 카테고리는 삭제됩니다.     │
                                │         [취소] [병합]         │
                                └───────────────────────────────┘
```

## 4. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| `usage-guide.service.spec.ts` | `classifyUsageType`을 상수로 테스트 중 → **시그니처 변경으로 깨짐** | 유형 배열을 인자로 받게 바꾸고 스펙도 그 형태로 |
| ivyusa 현행 동작 | 10종·65% 분류가 유지돼야 함 | 이관 SQL에서 **키·순서·키워드 그대로**. 배포 후 분류 수 재측정으로 확인 |
| 기존 가이드 문서 | 전 테넌트 0건이라 이관 리스크 없음 | 그래도 `usage:{key}` 규칙은 유지(C3) |
| `catalog-sync` | 카테고리 행 upsert 훅 추가 | 문서 쓰기 경로에 1회 upsert. 무변경 판정 로직은 **건드리지 않음** |
| 콘솔 `CATEGORIES` 19종 | 제거 — 타 테넌트 태그 노출 종료 | 이관 SQL이 실사용 값을 이미 채우므로 제안이 비지 않음 |
| Qdrant | 페이로드 카테고리가 낡아짐 | **D9 — 오늘 소비처 없음.** RPT에 기록 |
| 신규 테넌트 생성 | 시딩 2회 추가(`:166`, `:224` 두 경로) | 한쪽만 넣으면 경로에 따라 빈 목록이 됨 — 둘 다 |
| DB 스키마 | **신규 테이블 2개** | 마이그레이션 SQL + PR `## Migration` 섹션 + 스테이징 사전적용 |

## 5. 리스크

- **R1.** 엔티티 nullable 컬럼에 `type:`을 빼면 **API 부팅이 죽고 `tsc`는 잡지 못합니다**(dev-kit A-1).
  → 엔티티 추가 직후 실부팅(`Nest application successfully started`) 확인.
- **R2.** 이관 SQL이 `key`를 바꾸면 기존 가이드가 고아가 됩니다. → 키 보존을 SQL 리뷰 항목으로.
- **R3.** rename/merge가 부분 실패하면 콘솔과 문서가 어긋납니다. → **한 트랜잭션**, 실패 시 전체 롤백.
- **R4.** 카탈로그 파생 카테고리를 실수로 편집 가능하게 열면 "고쳤는데 되돌아온다"를 겪습니다.
  → `origin='catalog'`는 서버에서도 거부(UI 잠금만 믿지 않음).
- **R5.** 유형 순서는 의미가 있습니다(`lash adhesive` ⊂ `lash`). 정렬을 UI에서만 다루고 저장하지
  않으면 분류가 흔들립니다. → `sort_order` 저장 + 목록 조회 시 항상 정렬.

## 6. 테스트 (TCR-260824에서 확장)
- 단위: 슬러그 충돌, 순서 의존 분류, 미리보기 개수, rename 트랜잭션 롤백, catalog origin 거부,
  merge 후 문서수, 문서 있는 카테고리 삭제 거부, 시딩 2경로.
- 통합: 이관 후 ivyusa 10종·분류 65% 유지, 신규 테넌트 기본 3종, annehearts에서 유형 생성→개수 확인.
- 배포: SQL 선적용 → 코드 배포 → 라우트 401 → 콘솔 실화면.

---
**승인 요청**: 승인 시 W1부터 착수합니다. **§0의 D6-1(문자열 유지 vs FK 정규화)만 확인해 주십시오** —
FK로 가면 W2 규모가 두 배가 되고 문서 마이그레이션 리스크가 추가됩니다.

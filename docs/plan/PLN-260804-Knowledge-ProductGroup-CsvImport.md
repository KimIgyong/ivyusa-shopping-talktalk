# PLN — 지식 그룹(ProductInfo/CounselInfo) · 상품 CSV 업로드 구현 계획

| | |
|---|---|
| Doc ID | CHATWIDGET-PLN-KBGRP-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | `docs/analysis/REQ-260804-Knowledge-ProductGroup-SourceIngestion.md` (v1.0.1, PR #101) |
| 범위 | **요구 ①만** — 그룹 축 · 업로드 · CSV 수집. ②(board/repository/gdrive)는 후속 |
| 상태 | 사용자 지시("①만 먼저 진행")로 **승인 게이트 없이 착수** |
| UI 영향 | **있음** — `/knowledge` 그룹 네비 + 업로드 모달 (§4 와이어프레임) |
| 스키마 변경 | **있음** — `kb_documents` +2컬럼 |

---

## 0. 확정된 결정 (REQ §5 권고안 채택)

| # | 결정 | 채택안 |
|---|---|---|
| D2 | 그룹 축 | **신규 `doc_group` 컬럼**(닫힌 집합) — 기존 18개 카테고리 보존 |
| D3 | 검색 반영 | **의도 기반 소프트 가중치** — 하드 필터 아님 |
| D4 | 상품 정보 성격 | `Detail`·`How to Use`·`Tags`는 본문, **`Price`는 본문 제외**(메타만) |
| D8 | 업서트 키 | **`Handle`** (144/144 고유; SKU는 공란 7·중복 8) |
| D9 | 착수 범위 | ①만 |

---

## 1. 단계 구성

| 단계 | 범위 | 스키마 | 규모 |
|---|---|---|---|
| **P1** | 그룹 축 — 컬럼·마이그레이션·API·콘솔 네비/필터 | **있음** | 1.5d |
| **P2** | 업로드 경로 — 멀티파트 수신·검증·CSV 파싱 | 없음 | 1.5d |
| **P3** | 상품 수집기 — 행→문서 매핑·멱등 upsert·배치 임베딩·결과 리포트 | 없음 | 1.5d |
| | **합계** | | **4.5d** |

P1은 단독 배포 가능하고, P2·P3은 함께 나가야 의미가 있습니다.

---

## 2. P1 — 그룹 축 (1.5d, **스키마 변경**)

### 2-1. 스키마

```sql
ALTER TABLE kb_documents
  ADD COLUMN doc_group    VARCHAR(16)  NOT NULL DEFAULT 'counsel',
  ADD COLUMN external_key VARCHAR(128) NULL;
ALTER TABLE kb_documents ADD INDEX idx_kb_group (tenant_id, doc_group);
ALTER TABLE kb_documents ADD UNIQUE KEY uk_kb_extkey (tenant_id, doc_group, external_key);
```

- `doc_group ∈ {counsel, product}` — 닫힌 집합. 자유 문자열이면 오타로 그룹이 갈라집니다.
- **기본값이 `counsel`이라 기존 230건이 마이그레이션만으로 CounselInfo가 됩니다** — 별도
  백필 UPDATE가 필요 없습니다(그리고 `ON UPDATE CURRENT_TIMESTAMP`를 건드릴 일도 없습니다 — PR #93).
- `external_key`는 원본 시스템의 안정 키(상품은 `Handle`). **NULL은 UNIQUE 제약에서 중복 허용**되므로
  기존 230건과 수기 생성 문서는 제약에 걸리지 않습니다.

> `doc_group`으로 이름을 정한 이유: `group`은 MySQL 예약어라 매번 백틱이 필요합니다.

### 2-2. API

| 대상 | 변경 |
|---|---|
| `GET /knowledge/documents` | `group` 쿼리 필터 추가 |
| `GET /knowledge/categories` | `group`별 집계로 확장(`{group, category, total, active}`) |
| `POST/PATCH /knowledge/documents` | `doc_group` 지정 가능(기본 `counsel`) |
| `POST /knowledge/ask` | `group` 선택 파라미터(콘솔 QA에서 그룹 한정 질의) |

### 2-3. 검색 반영 (D3)

현재 `retrieveHybrid`는 테넌트의 **모든 활성 문서**를 대상으로 하고, 융합 후
`source === 'knowledge_store'`에 `SOURCE_BONUS = 0.0005`를 더합니다(POL-013).

같은 자리에 **그룹 보너스**를 추가합니다.

```ts
rrf: e.rrf
   + (e.doc.source === 'knowledge_store' ? SOURCE_BONUS : 0)
   + (preferGroup && e.doc.docGroup === preferGroup ? GROUP_BONUS : 0)
```

- **하드 필터가 아닙니다.** 상품 질문에도 반품 정책이 필요할 수 있으므로 다른 그룹을 배제하지 않고
  순위만 밀어줍니다. `GROUP_BONUS`는 `SOURCE_BONUS`보다 크되 RRF 간격을 뒤집지 않는 값(0.002)으로 둡니다.
- **그룹 선택 신호**는 `ChatService`가 이미 가지고 있습니다 — `classifyIntent()` 결과가
  S3부터 메시지에 적재되고 있습니다. 의도 문자열에 `product`가 포함되면 `preferGroup='product'`,
  아니면 **선호 없음**(보너스 0)입니다.
  > ⚠️ 분류 실패 시 폴백이 `product_inquiry`라 실패가 곧 상품 선호가 됩니다.
  > **폴백 여부를 구분해 전달**하고, 폴백일 때는 선호를 주지 않습니다.
- RAG는 그룹을 **판단하지 않습니다** — 호출자가 정한 선호를 받기만 합니다.

### 2-4. 콘솔

카테고리 네비 위에 그룹 탭을 얹고, 카테고리 목록은 선택된 그룹 기준으로 집계합니다.

---

## 3. P2 — 업로드 경로 (1.5d, 스키마 없음)

### 현행
API 전체에 파일 업로드가 **없습니다**(`FileInterceptor`·multer 0건). `@nestjs/platform-express`는
**이미 의존성에 있으므로**(v11) `FileInterceptor`를 바로 쓸 수 있고 신규 패키지가 필요 없습니다.

### 설계
- `POST /knowledge/documents/import/product` — `multipart/form-data`, 필드 `file`
- **메모리 스토리지**(디스크 아님). 상품 CSV는 307KB이고, 컨테이너 디스크에 쓰면 재배포 시 사라집니다.
- 검증: 확장자 `.csv` + MIME(`text/csv`·`application/vnd.ms-excel`·`text/plain`) + **크기 상한 5MB** +
  행 수 상한 5,000. 초과 시 `E5003 VALIDATION_FAILED`.
- **원본 파일은 보관하지 않습니다.** `kb_files` 테이블은 이번 범위에서 쓰지 않습니다 —
  저장 위치(디스크/S3) 결정이 별도 과제이고, 감사 기록 + 임포트 요약으로 추적성은 확보됩니다.
  (현재도 `kb_files`는 0행·미사용이며, 반쯤 연결하면 오히려 혼란입니다.)
- CSV 파서는 **직접 구현**합니다(약 50줄). 따옴표 안의 콤마·줄바꿈·이스케이프(`""`)만 처리하면
  되고, 이 파일은 HTML·한국어가 없는 단순 구조입니다(REQ §2-1). 신규 의존성을 피합니다.
- **BOM 제거** 필수 — 실측 파일 헤더가 `﻿Product Name`으로 시작합니다.

---

## 4. P3 — 상품 수집기 (1.5d)

### 4-1. 행 → 문서 매핑

| 문서 필드 | 소스 | 비고 |
|---|---|---|
| `title` | `Product Name` | 100% 고유 |
| `docGroup` | 고정 `product` | |
| `externalKey` | **`Handle`** | 업서트 키 |
| `category` | `Brand` (없으면 `Category`, 둘 다 없으면 `null`) | `Category`는 65%만 채워짐 |
| `sourceUrl` | `Product URL` | S4 출처 필드 재사용 |
| `content` | `Brand` + `Detail` + `How to Use` + `Tags` 조합 | **`Price` 제외(D4)** |
| `source` | `knowledge_store` | |
| `active` | 1 | |

본문 형식(레이블을 붙여 검색·인용 시 문맥이 살아 있게):
```
Brand: Arocell
Arocell Super Collagen Mask (2 sheets) …

<Detail 전문>

How to use:
<How to Use 전문>

Tags: hydrogel, mask, collagen
```

> **가격을 본문에서 뺀 이유**: 낡은 가격이 AI 답변에 남으면 고객 분쟁 소지입니다.
> 가격은 상품 URL로 안내하도록 AI 응답 규칙에 남깁니다(별도 문서 1건으로 등록).

### 4-2. 멱등 업서트

`(tenant_id, doc_group='product', external_key=Handle)` 기준.

| 상황 | 처리 |
|---|---|
| 신규 | 생성, `status='pending'` |
| 기존 + 내용 동일 | **건너뜀**(재임베딩 없음, 이력도 남기지 않음) |
| 기존 + 내용 변경 | 갱신 + 재임베딩 대상, **수정 이력 자동 기록**(T3 연동) |
| CSV에 없는 기존 상품 | **건드리지 않음** — 삭제 동기화는 ②의 과제 |

### 4-3. 임베딩 — 반드시 배치

144건을 `createDocument()` 루프로 만들면 **144회 단건 임베딩**이 됩니다. 단건 요청은
어댑터가 재시도하지 않으므로(라이브 챗 보호 가드) throttle 시 통째로 실패합니다 — 2026-08-04 실사고(PR #95).

→ **행을 전부 upsert(`pending`)한 뒤, 대상 id만 64건 배치로 임베딩**합니다.
기존 `reindexAll`의 배치 상수·stub 폴백 거부 가드를 그대로 재사용합니다.

144건 ≈ 67K 토큰 ≈ **배치 3회**.

### 4-4. 결과 리포트

```json
{ "parsed": 144, "created": 144, "updated": 0, "skipped": 0,
  "invalid": 0, "embedded": 144, "embedFailed": 0,
  "errors": [{ "row": 12, "reason": "Handle 없음" }] }
```
`Handle`이 없거나 `Product Name`이 빈 행은 **건너뛰고 사유를 보고**합니다 — 전체를 실패시키지 않습니다.

### 4-5. 와이어프레임

```
┌─ Documents ─────────────────────── [상품 CSV 가져오기] [문서 추가] ─┐
│ ┌ 전체 374 ┬ CounselInfo 230 ┬ ProductInfo 144 ┐   ← 그룹 탭(신규)  │
│ └──────────┴─────────────────┴─────────────────┘                    │
│ ┌────────────────┬─────────────────────────────────────────────────┐│
│ │ 카테고리        │ 제목                    분류    노출  출처  수정 ││
│ │ 전체       144 │ Arocell Super Collagen…  Arocell 노출 지식…  8/4││
│ │ Arocell     12 │ COSRX Advanced Snail…    COSRX   노출 지식…  8/4││
│ │ COSRX        9 │ …                                               ││
│ │ MEDIHEAL     8 │                                                 ││
│ └────────────────┴─────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘

┌─ 상품 CSV 가져오기 ──────────────────────────────── [닫기 ✕] ─┐
│  [ 파일 선택 ]  ivyusa_kbeauty_skincare-1.csv (307KB)          │
│                                                                │
│  필요한 컬럼: Product Name · Handle · Detail                   │
│  Handle 기준으로 기존 상품을 갱신합니다(중복 생성 없음).        │
│  ⓘ 가격은 지식에 저장하지 않습니다 — 변동 시 오답이 됩니다.     │
│                                        [취소]  [가져오기]      │
├────────────────────────────────────────────────────────────────┤
│ 결과                                                           │
│  파싱 144 · 생성 144 · 갱신 0 · 건너뜀 0 · 오류 0              │
│  임베딩 144/144 완료                                           │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| **RAG 답변** | 문서가 230 → 374건으로 63% 증가 | 그룹 보너스로 상품 질의는 상품 문서가 앞섬. 정책 질의는 영향 없음(선호 없음) |
| **검색 품질** | 상품 설명이 정책 질의에 섞일 위험 | 소프트 보너스라 배제는 안 되나, 실배포 후 `/knowledge` QA로 대표 질의 확인 필요 |
| **의도 폴백** | `classifyIntent` 실패 시 `product_inquiry` 반환 | **폴백 여부를 구분**해 선호를 주지 않음(§2-3) |
| **통계 4축** | `category` 렌즈에 Brand 값이 섞임 | 그룹 축 추가는 이번 범위 밖 — 카테고리 렌즈가 그룹별로 갈리는 점을 RPT에 명시 |
| **수정 이력(T3)** | 임포트 갱신도 이력에 남음 | **의도된 동작**. 단 최초 임포트 144건은 `create` 이력만 남고 베이스라인은 불필요 |
| **충돌 스캔(S4)** | 상품 144건이 후보 탐색 대상에 추가 | 상품끼리 유사도가 높아 중복 후보가 급증할 수 있음 → **스캔을 그룹 내로 한정**(같은 그룹끼리만 비교) |
| **임베딩 비용** | 1회 67K 토큰 | 무료 쿼터 대비 무시 가능. 배치 3회 |
| **업로드 보안** | 신규 수신 경로 | 크기·MIME·행수 상한 + `KNOWLEDGE_SOURCE_MANAGE` 권한. 파일 미보관 |
| **i18n** | 그룹 라벨·업로드 모달 | `knowledge` 네임스페이스 en/es/ko 동시 추가 |

> **충돌 스캔 그룹 한정은 이번 범위에 포함합니다** — 넣지 않으면 임포트 직후 스캔이
> 상품×정책 쌍을 대량 생성해 검토 큐가 무의미해집니다.

---

## 6. 테스트 계획 (상세는 TCR)

- **파서**: 따옴표 내 콤마·줄바꿈·이스케이프(`""`)·BOM·빈 줄·헤더 불일치
- **매핑**: 가격이 본문에 없음 · `Category` 공란 시 `Brand` 폴백 · `Handle` 없는 행은 건너뛰고 보고
- **업서트**: 재임포트 시 생성 0/갱신 0/건너뜀 144 · 내용 변경분만 갱신 · 그룹 격리(같은 Handle이 counsel에 있어도 무관)
- **임베딩**: 단건이 아니라 배치 호출 · stub 폴백 시 실패 처리
- **검색**: `preferGroup` 지정 시 해당 그룹이 앞서되 **다른 그룹이 배제되지 않음** · 선호 없으면 기존 순위 불변
- **의도 폴백**: 분류 실패 시 선호를 주지 않음
- **업로드**: 크기·MIME·행수 상한 거부 · 권한 없는 호출 거부

---

## 7. 마이그레이션

| 파일 | 내용 |
|---|---|
| `sql/migration_kb_doc_group.sql` | `kb_documents` +`doc_group`(기본 `counsel`) +`external_key` + 인덱스 2종 |

추가 전용. **백필 UPDATE 없음** — 기본값으로 기존 230건이 자동 배정됩니다.
스테이징 `DB_SYNCHRONIZE=false` → **SQL 선적용 후 코드 배포**.
롤백: 인덱스 2종 DROP 후 컬럼 2종 DROP.

---

## 8. 범위 밖 (후속)

| 항목 | 사유 |
|---|---|
| board / repository / gdrive 수집 | 요구 ② — 별도 PLN |
| `kb_files` 원본 보관 | 저장 위치 결정이 선행 과제 |
| CSV에서 사라진 상품 처리 | 삭제 동기화는 ②의 공용 파이프라인에서 |
| 통계 그룹 렌즈 | 작은 추가지만 이번 범위 밖 |
| 가격 실시간 조회 | Shopify 연동 과제 |

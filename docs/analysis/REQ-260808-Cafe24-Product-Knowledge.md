# REQ-260808-Cafe24-Product-Knowledge

Cafe24 몰(`amoebaorder.cafe24.com`)의 **상품정보를 가져와(products_cache) 지식(KB)으로 등록**하고,
`https://shoptalk.amoeba.site/` 위젯의 **상품추천·상담 응답에 활용**하기 위한 요구사항 상세분석.

- 작성일: 2026-08-08
- 요청 원문: "(amoebaorder.cafe24.com) 카페24 쇼핑몰 상품 정보를 지식으로 가져와서 상품추천 및 상담에 활용한다.
  상품정보 가져오기 기능 구현 후 해당 상품정보를 지식으로 사용"
- 관련: PLN-260807-Cafe24-OAuth-Order-Sync(P-A1, 배포됨) · PLN-260808-Cafe24-MemberId-RecentOrders(배포됨) ·
  PLN-260807-IvyusaApp-Revamp F1(products_cache) · PLN-260804-Product-Link-Recommendation(카탈로그→KB 변환기)
- 자산 재사용 근거: `btbz-shop-pmm` `2_project/.../integration/cafe24/cafe24.real.adapter.ts`(상품 pull·페이징·레이트리밋 실증)

---

## 0. 한 줄 요약 (왜 지금 막혀 있나)

ShopTalk의 **카탈로그→지식 변환 파이프라인은 이미 완성**되어 있고 provider에 무관하다.
막힌 곳은 그 앞단 한 칸 — **`products_cache`를 채우는 경로가 Shopify 공개 `/products.json` 하나뿐**이라는 점이다.
Cafe24 몰에는 그 엔드포인트가 없다(실측: `https://amoebaorder.cafe24.com/products.json` → **404 text/html**).
따라서 Cafe24 테넌트는 카탈로그가 0행 → 상품 KB 문서 0건 → 상품 질문에 "취급하지 않습니다"로 답한다.

**이번 작업의 본질 = 새 파이프라인 구축이 아니라, Cafe24 Admin API → `products_cache` 어댑터 한 칸을 채우는 것.**
(적정기술·재사용 렌즈: 변환·미리보기·임베딩·RAG·인용링크는 손대지 않는다.)

---

## 1. AS-IS (코드 근거, main @ aebf5b4)

### 1-1. 카탈로그 적재: Shopify 전용
`apps/api/src/domain/product/product-sync.service.ts`
- 테넌트 `storefront_url`(없으면 `shop_domain`) 기준으로 **공개 `/products.json?limit=250&page=N`** 를 순회 → `products_cache` upsert(키: `tenant_id`+`handle`).
- 완주한 실행만 미노출 행을 `archived`로 전환(중단된 실행은 아카이브 스킵).
- 부팅 시 카탈로그 0행 테넌트 초기 적재 + `PRODUCT_SYNC_INTERVAL_MIN` 주기 실행(미설정=off).
- **모든 테넌트가 대상**이다(`shop_domain`은 non-null 컬럼) → Cafe24 테넌트에서도 매 tick `/products.json`을 때리고
  `aborted: HTTP 404 on page 1`을 남긴다. 기능적 피해는 없으나 로그 오염 + 무의미한 외부 호출.

### 1-2. Cafe24 연동: 주문·회원만
`apps/api/src/domain/cafe24/`
- `cafe24-admin.client.ts` — Bearer + `X-Cafe24-Api-Version`, 호스트 분리(`{mall}.cafe24api.com`),
  leaky-bucket(`X-Api-Call-Limit` n/40, 35에서 감속) + 429 1회 재시도. **구현된 엔드포인트는 `/orders`·`/store` 뿐.**
- `cafe24-sync.service.ts` — 주문 → `orders_cache`/`order_items`(멱등 upsert), `member_id` 매칭.
- `cafe24-oauth.service.ts` — 설치 스코프 기본값 **`mall.read_order,mall.read_product`**
  → **상품 읽기 권한은 이미 동의 범위에 포함**(실제 발급 스코프는 배포 후 실측 필요, §6-Q4).
- 콘솔 UI `apps/web/src/domain/settings/Cafe24ConnectCard.tsx` — 몰ID 입력·연결·**"지금 동기화"(주문만)**.

### 1-3. 카탈로그 → 지식 변환: 완성·provider 무관 ✅
`apps/api/src/domain/knowledge/catalog-sync.service.ts` (+ `catalog-sync-job.service.ts`)
- `products_cache` 전체를 읽어 **변형 접기(제목의 ` - ` 구분자)** → 대표행 1건당 `kb_documents`(`doc_group='product'`, `source='product_catalog'`, `external_key=handle`) 생성/갱신.
- **사람이 쓴 문서(curated)는 본문을 덮지 않고** 링크/판매여부만 갱신. 재실행 멱등(`unchanged`).
- **보류(held) 규칙**: 설명 80자 미만 **그리고** 태그 없음 → 문서를 만들지 않고 콘솔에 목록 노출.
- 가격·SKU는 의도적으로 문서에 넣지 않음(가격은 조용히 낡고, 오답 시 분쟁이 됨 — PLN-260804 D4).
- 콘솔 흐름: `GET /knowledge/documents/import/catalog/preview`(드라이런) → `POST …/catalog`(202, 비동기 잡) → `GET …/catalog/status`(진행률) → 변경분만 배치 임베딩.
- 실적: ivyusa 테넌트에서 상품지식 144 → 1,828건(2026-08-08, [[catalog-to-rag-product-knowledge]]).

### 1-4. 상담·추천에서의 소비
- `apps/api/src/domain/chat/rag.service.ts` — 하이브리드 검색(MySQL + Qdrant, voyage-4 1024d), 의도분류 후 `doc_group='product'` 가점.
- 인용 링크는 `productLinkFor()` — **`source_url` 호스트가 테넌트 `storefront_url` 호스트와 일치할 때만** 링크로 렌더(그 외 평문). 상담 대화에 외부 링크가 주입되는 것을 막는 보안 게이트.
- 위젯 상품 목록/추천 API(`/products`, `/products/recommendations`)는 `products_cache`를 직접 읽음(전시용).

### 1-5. 실측 확인 (2026-08-08)
| 항목 | 실측 |
|---|---|
| `amoebaorder.cafe24.com/products.json` | **404** (Shopify 경로 부재 확정) |
| 몰 상품 상세 URL(프론트 링크형) | `/product/{한글-슬러그}/{product_no}/category/{n}/display/{n}/` |
| 몰 상품 상세 URL(정규형) | `/product/detail.html?product_no=27` → **200** (슬러그·카테고리 변경에 안전) |
| 카탈로그 규모 | 메인 노출 상품번호 27·28·29 등 — **소규모로 추정**(정확 수량은 Admin API 실측) |

---

## 2. TO-BE (목표 상태)

```
[Cafe24 Admin API]                     (신규 1칸)
 GET /products (+옵션/카테고리)  ──►  Cafe24ProductSyncService ──► products_cache
                                                                      │  (기존 자산, 무수정)
                                                            CatalogSyncService(미리보기→잡→임베딩)
                                                                      ▼
                                                        kb_documents(doc_group='product')
                                                                      ▼
                                                   RAG 검색 → 상담 답변 + 상품추천 + 인용 링크
```

### 기능 요구사항
| ID | 요구사항 | 비고 |
|---|---|---|
| FR-C1 | Cafe24 Admin `GET /admin/products`로 몰 상품을 페이지 순회하여 `products_cache`에 멱등 upsert | `limit=100`, `offset≤8000` 초과 시 `since_product_no` 승계(PMM 실증) |
| FR-C2 | 캐시 키(`handle`)를 Cafe24용 합성키로 생성하고 재실행/이름변경에도 불변 유지 | §3 G2 |
| FR-C3 | 미노출/판매중지 상품은 `archived`로 표시(하드 삭제 금지), 완주한 실행에서만 아카이브 | 기존 Shopify 규칙과 동일 |
| FR-C4 | 상품 상세 URL·대표 이미지 절대경로·카테고리·브랜드·옵션값을 캐시에 채움 | §3 G5·G6·G9 |
| FR-C5 | 테넌트의 카탈로그 소스를 provider로 분기(Cafe24 연결 테넌트에 Shopify JSON 폴링 금지) | §3 G8 |
| FR-C6 | 콘솔에서 **수동 트리거 + 결과 토스트**(성공/실패 명시) | UX 피드백 MUST |
| FR-C7 | 적재된 상품이 기존 **카탈로그→KB 변환(미리보기·잡·임베딩)**을 통해 지식으로 등록 | 코드 변경 없이 동작해야 함 |
| FR-C8 | 위젯 상담에서 상품 질문 시 해당 지식이 인용되고 **몰 상품 링크가 클릭 가능**해야 함 | `storefront_url` 정합 필요(§3 G5) |
| FR-C9 | 한국어 상품 텍스트가 임베딩·검색·답변에서 정상 동작 | voyage-4 다국어, 세션 언어 ko |

### 비기능
- 멀티테넌시: 모든 읽기/쓰기 `tenant_id` 스코프. Cafe24 자격증명은 테넌트별.
- 레이트리밋: 기존 `Cafe24AdminClient.request()` 버킷 로직 재사용(신규 우회 경로 금지).
- 멱등성: 재실행 시 변경분만 쓰기 → 임베딩 비용 0 (Voyage 무료티어 rate limit 이력, [[ops-logs-stats-knowledge-conflict]]).
- 감사/로그: 동기화 결과 카운트 로그, KB 변환은 기존 `knowledge.catalog_synced` 감사 기록 유지.
- PII 없음: 상품 리소스만 조회(주문/회원 필드 접근 금지).

---

## 3. Gap 분석

| ID | 갭 | 영향 | 해결 방향(PLN에서 확정) |
|---|---|---|---|
| **G1** | Cafe24 상품 pull 경로 부재 (`Cafe24AdminClient`에 `/products` 없음) | 카탈로그 0행 → 상품 KB 0건 | 클라이언트에 `pullProducts()` 추가 + `Cafe24ProductSyncService` 신설 |
| **G2** | `products_cache`는 `(tenant_id, handle)` 유니크. Cafe24엔 handle 개념 없음 | 키 설계 실패 시 중복행/재실행마다 신규행 | `product_no` 기반 합성키(예: `cafe24-{product_no}`). 상품명 슬러그는 **금지**(이름 변경 시 신규 문서 발생) |
| **G3** | Cafe24 상세설명은 **이미지 위주 HTML**이 흔함 → 텍스트 추출 시 80자 미만 | 변환기의 held 규칙에 걸려 **문서 0건**이 될 수 있음 (조용한 실패) | `summary_description`/`simple_description`/옵션/카테고리/브랜드까지 캐시 `description`·`tags`에 합성. 그래도 부족하면 held 목록으로 노출(사용자 결정 Q2) |
| **G4** | `products_cache.currency` 기본 'USD', 가격 KRW | 전시 화면 통화 오표기 | Cafe24 경로는 `KRW` 고정 세팅(KB 문서는 가격 미포함이라 상담 오답 위험은 없음) |
| **G5** | 인용 링크 게이트: `source_url` 호스트 ≠ 테넌트 `storefront_url` 호스트면 링크 미생성. Cafe24 몰은 `{mall}.cafe24.com`과 **대표도메인(커스텀)**이 다를 수 있음 | 추천은 되는데 링크가 평문으로 죽음 | 테넌트 `storefront_url`을 몰 대표도메인으로 정렬 + 상품 URL을 같은 오리진의 `/product/detail.html?product_no=` 정규형으로 생성 |
| **G6** | Cafe24 상품 응답의 카테고리·브랜드는 **코드(category_no/brand_code)** | KB `category`가 코드로 채워지면 사람이 못 읽음 | `/categories`·`/brands` 1회 조회 후 코드→이름 맵 캐싱. 미확보 시 `null`(코드 저장 금지) |
| **G7** | 진열/판매 상태 필드(`display`/`selling`) → `active/archived` 매핑 규칙 미정 | 판매중지 상품이 추천됨 | `display='T' && selling='T'` → active, 그 외 archived (실측 후 확정) |
| **G8** | `ProductSyncService`가 Cafe24 테넌트에도 `/products.json` 폴링 | 로그 오염·무의미 외부 호출 | 테넌트 카탈로그 소스 분기(Cafe24 자격증명 보유 → Shopify 경로 skip) |
| **G9** | 옵션/품목: PMM은 **품목(variant) 단위**로 pull. 상담·추천은 **상품 단위**가 자연스러움 | 품목 단위로 넣으면 문서 수 폭증·중복 답변 | 상품 1행 + 옵션값을 텍스트로 부기(사용자 결정 Q1). 옵션 조회는 상품당 1콜 추가 → 레이트리밋 예산 고려 |
| **G10** | 페이징: `offset` 상한 8000, 레이트 40콜 버킷 | 대형 몰에서 누락 | PMM 방식(`since_product_no` 승계) 이식 — 현 파일럿 몰은 소규모라 즉시 위험은 낮음 |
| **G11** | 임베딩 비용/쿼터 (Voyage 무료티어 rate limit 반복 관측) | 대량 변환 시 실패 | 변경분만 임베딩(기존 동작) + 소규모 몰이라 1회 수십 건 수준 예상 |
| **G12** | 파일럿 테넌트의 AI 엔진 라우팅이 stub이면 추천 문장이 더미 | "지식은 들어갔는데 답이 이상하다" | 배포 전 해당 테넌트 라우팅/키 확인(§6-Q5) |
| **G13** | **외부 API 스키마 미확정**: 상품 목록 응답에 `description`/`summary_description`/태그/이미지 절대경로가 실제로 어떤 형태로 오는지 | 문서 추정으로 매핑하면 빈 문서 양산 (kit-01 §3.6: 외부 API 스키마 문서 추정 금지) | **구현 1단계 = 실측 probe**(스테이징에서 1건 raw 조회 후 매핑 확정, TCR에 기록) |

---

## 4. 사용자 플로우 (TO-BE)

**운영자(콘솔)**
1. 설정 → Cafe24 카드에서 몰 연결 상태 확인(이미 연결됨)
2. **[상품 가져오기]** 클릭 → "N건 동기화 / M건 보관됨" 토스트
3. 지식 → 카탈로그 변환 **미리보기** → 생성/갱신/보류 건수와 보류 샘플 확인
4. **[변환 실행]** → 진행률(작성 → 임베딩) → 완료 카운트
5. 지식 → 문서 목록에서 상품 문서 확인, 필요 시 직접 편집(편집분은 이후 동기화에서 보호됨)

**고객(위젯)**
1. 몰 위젯에서 "○○ 리무버 어떤 제품이에요?" 질문
2. RAG가 상품 문서 인용 → 답변 + **상품 링크(클릭 가능)**
3. 후속 추천("비슷한 제품") 시 같은 지식 그룹에서 근거 제공

---

## 5. 제약 조건

- **Cafe24 Admin API**: `mall.read_product` 스코프 필요(설치 시 동의 범위에 포함). 토큰 access 2h / refresh 14d 회전 — 기존 `Cafe24TokenService`가 처리.
- **레이트리밋**: 40콜 버킷, 429 시 `X-Cafe24-Call-Remain` 대기. 상품×옵션 N+1 호출은 예산을 빠르게 소진 → 옵션 조회는 선택적/제한적으로.
- **스키마 변경 시**: `products_cache`에 컬럼을 추가한다면 스테이징은 `DB_SYNCHRONIZE=false` → **SQL 사전 적용 필수**(CLAUDE.md §7). 컬럼 추가 없이 기존 스키마로 해결 가능한지 PLN에서 먼저 검토.
- **문서 규칙**: 가격·재고는 KB 문서에 넣지 않는다(기존 결정 유지).
- **모더레이션**: 상담 응답 경로는 기존 `ModerationService` 통과 — 변경 없음.

---

## 6. 결정이 필요한 사항 (사용자 확인)

| # | 질문 | 기본 제안 |
|---|---|---|
| Q1 | 지식 단위 = **상품 1건**(옵션은 본문에 부기) vs **품목(옵션)별 문서** | **상품 단위** — 상담·추천 문맥에서 중복 인용을 막고 문서 수·임베딩 비용을 억제 |
| Q2 | 상세설명이 이미지뿐이라 텍스트가 빈약한 상품 처리 | **상품명+카테고리+브랜드+옵션+요약설명으로 문서 생성**, 그래도 빈약하면 보류 목록으로 노출(운영자가 직접 보완) |
| Q3 | 동기화 트리거 | **콘솔 수동 버튼 우선**, 자동 주기는 env로 off 기본 |
| Q4 | 실제 발급된 스코프에 `mall.read_product`가 포함되어 있는지 | 스테이징에서 `/admin/products?limit=1` probe로 확인(403이면 재설치 동의 필요) |
| Q5 | 파일럿 테넌트의 AI 엔진 라우팅(실 LLM vs stub) 및 응답 언어(ko) | 배포 전 확인 — stub이면 추천 품질 검증 불가 |

---

## 7. 수용 기준 (AC)

- AC-1 콘솔에서 상품 가져오기 실행 시 `products_cache`에 몰 상품이 적재되고, 재실행해도 행이 중복되지 않는다.
- AC-2 몰에서 내린 상품은 다음 완주 실행에서 `archived`가 되고 추천 대상에서 빠진다.
- AC-3 카탈로그 변환 미리보기에서 생성 예정 건수 > 0이며, 보류 건수와 사유 샘플을 운영자가 볼 수 있다.
- AC-4 변환 실행 후 `kb_documents(doc_group='product')`가 생성되고 임베딩 상태가 `embedded`가 된다.
- AC-5 위젯에서 몰 상품 관련 질문 시 해당 문서가 인용되고, 인용 링크가 **클릭 가능한 몰 상품 URL**이다.
- AC-6 Cafe24 테넌트에서 Shopify `/products.json` 폴링 로그(`aborted: HTTP 404`)가 더 이상 발생하지 않는다.
- AC-7 모든 동기화/변환 동작에 성공·실패 토스트가 표시된다(무음 성공 금지).

---

## 8. 다음 단계

`PLN-260808-Cafe24-Product-Knowledge.md` — 단계별 구현 계획(실측 probe → 어댑터 → 캐시 매핑 → provider 라우팅 → 콘솔 UI 와이어프레임 → 배포/마이그레이션 판단), 사이드 임팩트 분석.
**PLN 승인 후에 구현을 시작한다.**

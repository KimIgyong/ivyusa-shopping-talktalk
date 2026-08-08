# PLN-260808-Cafe24-Product-Knowledge

Cafe24 몰 상품 → `products_cache` → 지식(KB) → 상담/추천 활용 구현 계획.

- 작성일: 2026-08-08
- 근거: `REQ-260808-Cafe24-Product-Knowledge.md`
- 사용자 결정(2026-08-08): **Q1 상품 1건=문서 1건(옵션은 본문 부기)** · **Q2 텍스트 빈약 시 메타데이터로 문서 생성** ·
  **Q3 콘솔 수동 버튼만(자동 스케줄러 없음)** · 구현까지 승인 대기 없이 진행
- 재사용 자산: `btbz-shop-pmm` cafe24.real.adapter(페이징·레이트리밋 실증), 본 repo의 `CatalogSyncService`(변환·미리보기·잡·임베딩)

---

## 1. 설계 원칙

> **한 칸만 새로 만든다.** Cafe24 Admin API → `products_cache` 어댑터만 신설하고,
> 그 뒤의 변환·임베딩·RAG·인용링크는 **코드 변경 없이** 그대로 태운다.

이를 위해 매핑 단계에서 기존 변환기의 전제를 만족시킨다:
- `handle`이 키다 → Cafe24는 `cafe24-{product_no}` 합성키(이름이 바뀌어도 불변).
- 변환기의 보류 규칙은 **`설명 80자 미만 AND 태그 없음`** → **태그를 항상 채우면 메타데이터만으로도 문서가 생성된다**(Q2 해결, 변환기 무수정).
- 인용 링크는 테넌트 `storefront_url`과 **같은 오리진**일 때만 살아난다 → 상품 URL을 테넌트 storefront 오리진 기준으로 만든다.

**스키마 변경 없음** → 스테이징 SQL 사전적용 불필요(CLAUDE.md §7 마이그레이션 규칙 비해당).

---

## 2. 단계별 구현

### P1. `Cafe24AdminClient` 상품 API 확장
`apps/api/src/domain/cafe24/cafe24-admin.client.ts`

| 메서드 | 호출 | 비고 |
|---|---|---|
| `pullProducts(mall, token, {limit, offset, sinceProductNo})` | `GET /products?limit=100&offset=…` 또는 `&since_product_no=…` | offset 상한 8000 초과 시 승계(PMM 실증) |
| `fetchProduct(mall, token, productNo)` | `GET /products/{no}` | **목록 응답에 상세설명이 없을 때만** 호출(예산 상한) |
| `fetchProductOptions(mall, token, productNo)` | `GET /products/{no}/options` | `has_option='T'`인 상품만, 예산 상한 |
| `listCategoryNames(mall, token)` | `GET /categories?limit=100` | 코드→이름 맵. **403이면 조용히 null**(별도 스코프 `mall.read_category` 미보유 가능) |

- 요청은 **기존 `request()`를 그대로 통과**(Bearer·버전헤더·40콜 버킷 감속·429 재시도). 우회 경로 신설 금지.
- **외부 스키마 추정 금지(kit-01 §3.6)**: 필드는 optional로 선언하고 값이 없으면 degrade. 실측 결과는 TCR에 기록.

### P2. `Cafe24ProductSyncService` 신설
`apps/api/src/domain/cafe24/cafe24-product-sync.service.ts`

매핑 (Cafe24 → `products_cache`):

| 캐시 컬럼 | 값 | 비고 |
|---|---|---|
| `handle` | `cafe24-{product_no}` | 유일·불변 키 |
| `title` | `product_name` | |
| `description` | `stripHtml(description ?? summary_description ?? simple_description)` | 없으면 상세 1회 조회(예산 내) |
| `tags` | 카테고리명 + 브랜드코드 + **옵션값** + `product_tag` 합성 (항상 최소 1개 이상 채움) | Q2 — 보류 방지 |
| `category` | 카테고리명(해석 실패 시 `null`) | **코드값 저장 금지** |
| `sku` | `product_code` (P00000XX) | |
| `price` / `currency` | `Number(price)` / `'KRW'` | KB 문서에는 가격 미포함(기존 규칙) |
| `imageUrl` | `detail_image ?? list_image` → 프로토콜 상대경로면 `https:` 보정 | |
| `productUrl` | `{storefrontOrigin}/product/detail.html?product_no={no}` | 정규형(슬러그 변경에 안전, 실측 200) |
| `status` | `display==='T' && selling==='T'` → active, 그 외 archived | |
| `publishedAt` | `created_date` | |

- **멱등 upsert**(tenant+handle), **완주한 실행에서만** 미발견 `cafe24-` 행을 `archived`로 전환.
- 반환: `{ ok, synced, archived, detail }` — 기존 `ProductSyncResult`와 동일 형태.
- 호출 예산: 상세/옵션 보강 호출에 상한을 두고, 상한에 걸리면 **로그로 남긴다**(조용한 절단 금지).

### P3. provider 라우팅 (REQ G8)
`apps/api/src/domain/product/product-sync.service.ts`
- Cafe24 자격증명을 가진 테넌트는 Shopify `/products.json` 폴링 대상에서 **제외**(초기 적재·주기 실행 both).
- 구현: `ProductModule`에 `IntegrationCredential` **리포지토리만** 등록해 조회(모듈 순환 회피 — Tenant 엔티티와 동일한 기존 패턴).

### P4. API + 콘솔 UI
- `POST /tenants/me/cafe24/products/sync` — `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)`, 결과 그대로 반환.
- `Cafe24ConnectCard.tsx`에 **[상품 가져오기]** 추가 + 성공/실패 토스트(무음 성공 금지), i18n en/es/ko.

```
┌─ Cafe24 연동 ────────────────────────────────────────────┐
│ 몰의 주문·상품을 ShopTalk으로 가져옵니다.                 │
│ 연결 상태  [ 연결됨 ]                                     │
│ 몰 ID     [ amoebaorder            ] .cafe24.com          │
│                                                           │
│ [ 연결하기 ]  [ 주문 지금 동기화 ]  [ 상품 가져오기 ]     │
│                                                           │
│  ↳ 클릭 후: ✅ "상품 12건 동기화, 1건 보관됨"  (토스트)   │
│  ↳ 실패 시: ❌ "Cafe24 몰이 연결되지 않았습니다"           │
└───────────────────────────────────────────────────────────┘
        │
        ▼  (기존 화면 — 변경 없음)
┌─ 지식 > 카탈로그 변환 ───────────────────────────────────┐
│ [미리보기] 생성 12 / 갱신 0 / 보류 0                      │
│ [변환 실행] → 작성 12/12 → 임베딩 12/12 → 완료            │
└───────────────────────────────────────────────────────────┘
```
(지식 화면은 기존 UI를 그대로 사용 — 신규 UI 없음)

### P5. 테스트
- `cafe24-product-sync.service.spec.ts`: 매핑(핸들·URL·상태·태그 합성·이미지 절대경로), 페이징 승계, **불완전 실행은 아카이브하지 않음**, 재실행 멱등.
- `cafe24-admin.client.spec.ts` 보강: 목록 쿼리 조립(offset ↔ since_product_no).
- `product-sync.service.spec.ts` 보강: Cafe24 테넌트 스킵.

### P6. 문서·배포
- TCR-260808 / RPT-260808 작성, PR 본문에 `## Migration: 없음(스키마 변경 없음)` 명시.
- 스테이징 배포 후 실측: 스코프 probe(`/products?limit=1`) → 동기화 → 변환 → 위젯 상담 인용 확인.

---

## 3. 사이드 임팩트 분석

| 대상 | 영향 | 판단 |
|---|---|---|
| `products_cache` 스키마 | 변경 없음 | SQL 사전적용 불필요 |
| Shopify 테넌트(ivyusa) | `ProductSyncService`에 스킵 조건만 추가(Cafe24 자격증명 보유 테넌트) | ivyusa는 Cafe24 미연결 → 동작 불변 |
| `CatalogSyncService` | **무수정** | 변형 접기 규칙(` - `)은 한글 상품명에 거의 걸리지 않음 → 사실상 1상품=1문서 |
| 위젯 상품 목록/추천 API | Cafe24 테넌트에 실데이터가 처음 생김 | 통화 KRW 표기 확인 필요 |
| 임베딩 비용 | 소규모 몰(수십 건) + 변경분만 임베딩 | 무시 가능 |
| 레이트리밋 | 상세/옵션 보강으로 호출 증가 | 기존 버킷 감속 + 예산 상한으로 억제 |
| 개인정보 | 상품 리소스만 조회 | PII 없음 |

## 4. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 상품 목록 응답에 상세설명이 없음(스키마 미확정) | 없으면 상세 1회 조회로 보강, 그래도 없으면 태그 메타데이터로 문서 생성 |
| `mall.read_product` 미부여(403) | 동기화가 명확한 실패 토스트로 보고 → 재설치·재동의 안내 |
| `mall.read_category` 미보유로 카테고리명 403 | 카테고리 `null`로 degrade(코드 저장 금지), 동기화는 성공 처리 |
| 테넌트 `storefront_url`이 몰 도메인과 불일치 | 상품 링크가 평문화됨 → 배포 검증 항목에 포함, 불일치 시 콘솔에서 storefront_url 정정 |
| 파일럿 테넌트 AI 라우팅이 stub | 지식은 적재되나 추천 문장이 더미 → 배포 후 확인 항목 |

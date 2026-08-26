# PLN-260826 — Odoo 상품·주문·고객 연동 (gif2box)

- 근거: `docs/analysis/REQ-260826-Odoo-Product-Order-Customer-Sync.md`
- 미러 레퍼런스: **Cafe24**(OAuth·웹훅 없이 스케줄 풀 + 온디맨드) — 가장 가까운 구조.
- 스키마 변경: **없음**(기존 엔티티 `products_cache`/`orders_cache`/`order_items`/`customers`/
  `integration_status`/`integration_credentials` 재사용) → 마이그레이션 불필요.
- 브랜치: `feature/odoo-sync` (origin/main 기준). 결정 반영: D1=단계(상품→주문→고객 부수),
  D2=W0 선행 게이트 필수, D3=`ODOO_SYNC_INTERVAL_MIN` 초기 0.

## Stage 구성

### W0 — 선행 read 스모크 (게이트, 코드 전 확인) ⚠️
- gif2box Odoo 자격증명(url/db/username/api_key)으로 `execute_kw` read 1회:
  `product.template`·`sale.order`·`res.partner` 각 `search_count` + 샘플 `search_read` 1건.
- **확정 사항**: 읽기 권한(레코드 규칙), 실제 필드명(버전·현지화 편차), `sale.order.state`
  분포(견적/확정/완료/취소), `res.partner` 이메일 존재율, 이미지 필드(`image_1920`).
- **미검증 시 W1~ 착수 금지**(REQ R1~R5). 결과를 본 PLN §"매핑 확정"에 반영 후 진행.
- 실행 주체: 사용자 승인 하에 내가 스테이징 컨테이너에서 read-only 프로브 스크립트로 수행
  (쓰기 없음), 또는 사용자 제공 값으로.

### W1 — `OdooClient` (`apps/api/src/domain/odoo/odoo.client.ts`)
- JSON-RPC 2종 엔드포인트: `common.authenticate`(uid) → `object.execute_kw(db, uid, api_key,
  model, method, args, kwargs)`. uid는 호출 단위 캐시(짧게).
- 자격증명은 `IntegrationCredential(provider='odoo')` → `decryptSecret`→JSON(`EcommerceIntegrationService.parseConfig` 재사용).
- URL은 `assertPublicUrl`(SSRF, 기존) 통과 후 사용. 타임아웃·에러는 `probeEcommerce`와 동일 계약.
- 메서드: `pullProducts(offset,limit)`(`product.template` search_read + 필요한 필드),
  `pullOrders(sinceISO)`(`sale.order` + line), `listCategories()`(옵션). 페이징(예: 100/req).

### W2 — 상품 동기화 `OdooProductSyncService.syncProducts(tenantId)`
- `cafe24-product-sync.service.ts` 미러: `handle = 'odoo-{template_id}'`, `products_cache`
  upsert(존재맵 by handle, 미서빙 행 archive), `stripHtml`·`PRODUCT_STATUS` 재사용.
- 필드 매핑(W0 확정 기준): title=`name`, price=`list_price`, currency=회사/pricelist,
  image_url=`{url}/web/image/product.template/{id}/image_1920`, product_url=storefront 규칙
  (gif2box `storefront_url` 기반, W0에서 실제 경로 확인), category=`categ_id[1]`, sku=`default_code`.
- **지식 변환은 무수정**: 기존 `POST /knowledge/documents/import/catalog`(catalog-sync)가
  `products_cache`(provider 무관)를 읽어 `kb_documents` 생성 → 위젯 상품추천/RAG 자동.
- `integrationService.upsert('odoo', ok/error, lastSyncAt)` 기록.

### W3 — 주문(+고객) 동기화 `OdooSyncService.syncOrders(tenantId, sinceDays)`
- `cafe24-sync.service.ts` 미러: `sale.order`(state 필터=W0 결정) → `orders_cache`
  upsert(`provider='odoo'`, `shopify_order_id`=Odoo order id, `UNIQUE(tenant,provider,ext_id)`),
  `sale.order.line` → `order_items`.
- **고객은 부수 생성/링크**: 주문 `partner_id`의 `res.partner` 이메일로
  `customerService.findOrCreateByEmail(tenantId, email, name)` + `external_customer_id`=partner id
  세팅(PII는 기존 암호화 저장 재사용). 이메일 부재 주문 처리 정책=W0 결정.
- 상태 매핑: Odoo state → `status_internal`/`status_ui`(신규 매핑표, substring 함정 회피—허용목록).

### W4 — 스케줄 `ScheduledOdooSyncService` + `TenantService.listOdooTenantIds()`
- `scheduled-cafe24-sync.service.ts` 그대로 미러: `OnModuleInit`, `ODOO_SYNC_INTERVAL_MIN`
  (기본 0=비활성), 비중첩 `runAll`(가드 플래그). `listOdooTenantIds()`=`credRepo.find({provider:'odoo'})`.
- 상품·주문 각각 주기 실행(또는 통합 runAll). 초기 배포는 0(온디맨드 검증 후 값 부여).

### W5 — 온디맨드 엔드포인트 + 콘솔 버튼
- API `OdooController @Controller('tenants/me/odoo')`(cafe24.controller 미러):
  `POST /sync`(주문), `POST /products/sync`(상품) — `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)`.
- 웹: Odoo 설정 모달(또는 전용 `OdooSyncCard`, Cafe24ConnectCard 미러)에 연결됨일 때
  **[상품 가져오기]** / **[주문 동기화]** 버튼 + 결과 토스트(동기화 건수). i18n 6개 언어.

```
┌──────────────────────────────────────────────┐
│ Odoo                              연결됨 ●     │
│ URL·DB·사용자·API 키로 외부 API 연결          │
│  ┌────────────┐  ┌──────────────┐            │
│  │ 상품 가져오기 │  │ 주문 동기화   │  [설정]  │
│  └────────────┘  └──────────────┘            │
│  마지막 동기화: 2026-08-26 15:00 · 상품 128   │
└──────────────────────────────────────────────┘
```

### W6 — 공개 크롤러 제외 확인
- `ProductSyncService.cafe24TenantIds()` 제외 로직에 Odoo 테넌트도 포함할지 확인
  (gif2box는 storefront 크롤 대상이 아니어야 함 — Odoo가 상품 소스). 필요 시 소폭 수정.

### W7 — 모듈·env·TCR·배포
- `OdooModule`(client/2 sync/scheduled/controller) → `app.module.ts` 등록.
- `.env`(+ **`.env.staging.example` 필수** — CI env 템플릿 게이트) `ODOO_SYNC_INTERVAL_MIN=0`.
- TCR: 단위(매핑·upsert 멱등·고객 링크·상태 매핑), 스테이징 스모크(gif2box 온디맨드 → cache 채움
  → `/products`·`/orders`·`/customers` 노출 → catalog import → 위젯 상품추천).

## 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| products_cache/orders_cache/customers | Odoo 행 추가(provider/handle로 격리) | provider·handle 프리픽스로 타 채널과 미충돌 |
| 지식(catalog-sync) | Odoo 상품이 kb_documents로 유입 | 기존 provider-무관 경로, 무수정 |
| 공개 상품 크롤러 | 중복 크롤 위험 | W6에서 Odoo 제외 |
| 스케줄러 | 새 setInterval 1개 | 기본 0=비활성, 온디맨드 우선 |
| 타 테넌트 | 없음(Odoo 자격증명 있는 테넌트만) | listOdooTenantIds 스코프 |
| 스키마 | 변경 없음 | 엔티티 재사용 |

## 규모·순서

W0(게이트) → W1 → **W2(상품, 1차 가치)** → W5 부분(상품 버튼) → **W3(주문+고객)** →
W4(스케줄) → W6/W7. PR 1건 또는 상품/주문 2건 분할(리뷰 편의).

## 리스크 (W0에서 해소)

R1 read 권한 · R2 필드·버전 편차 · R3 이미지/URL 규칙 · R4 주문 state 정책 · R5 이메일 부재 —
전부 **W0 스모크 결과로 매핑 확정** 후 착수. 스키마 변경은 없다는 전제(확정은 W0 후).

---

## W0 결과 (2026-08-26, 스테이징 api 컨테이너 read-only 프로브 · 쓰기 없음)

`url=https://gif2box.vn` (Odoo가 이 도메인에서 서비스), `db=gif2box`, `user=admin`, uid=2,
`execute_kw` read **정상**(레코드 규칙/권한 차단 없음, R1 해소). website_sale(이커머스) 모듈 설치됨.

### 상품 — ✅ 지금 동기화 가능(1차 가치 확실)
- `product.template` **123**개 / `product.product` **344**개(변형). 실 카탈로그 존재.
- 확정 필드: `id·name·list_price·default_code(SKU)·categ_id([id,"경로"])·website_url·type·sale_ok·active`.
- 샘플: name(베트남어), list_price 91667, categ_id `[1184,"Mom & Baby / Bath & Body Care / Wipes"]`,
  website_url `/shop/gift-khanuot-...-544`, type `consu`, sale_ok true. image_1920 존재(id 544).
- **매핑 확정**: handle=`odoo-{template_id}`, title=`name`, price=`list_price`, currency=**VND**(회사 통화),
  product_url=`{url}{website_url}`, image_url=`{url}/web/image/product.template/{id}/image_1920`,
  category=`categ_id[1]`(경로 문자열), sku=`default_code`. 필터 `[['sale_ok','=',true],['active','=',true]]`,
  `product.template` 단위 동기(변형은 접지 않음 — Cafe24와 동일).

### 주문 — ⚠️ 현재 실주문 없음(테스트 드래프트뿐)
- `sale.order` **2건**, **둘 다 `state='draft'`**(견적), partner가 "Public user"(id4)·"Administrator"(id3)
  = 내부/테스트. state 분포: draft 2 / sent 0 / **sale 0 / done 0** / cancel 0.
- 매핑은 가능(state→status 표: sale/done=완료, draft/sent=대기, cancel=취소)하나, **확정 주문이
  0건이라 지금 주문 동기화를 붙여도 의미 있는 행이 안 들어옴**. 실 판매가 쌓이면 채워짐.

### 고객 — ⚠️ 의미 있는 고객 거의 없음
- `res.partner` **1396**개지만 `customer_rank>0`(구매고객) = **1**개(이메일 보유 1/1).
  대다수는 연락처/공급처. 주문 부수 생성 방식이라 실주문 0 → 고객도 사실상 0.

### 결론(우선순위 재확정)
- **상품 동기화(W1·W2·W5-상품)는 지금 착수해 즉시 가치**(123개 → products_cache → 지식 →
  위젯 상품추천). 스키마 변경 불필요, 매핑 확정됨.
- **주문·고객(W3·W4)은 구현은 하되, 실 확정주문이 생기기 전까지는 0건**임을 전제. 지금 붙여도
  회귀 위험만 없고 채워질 데이터가 없음 → **상품 먼저 배포, 주문/고객은 이어서(또는 실주문
  확인 후) 진행** 권고.

---
**⚠️ 본 PLN 승인 후 착수합니다. 특히 W0(실 Odoo read 스모크)를 먼저 수행하도록 구성했습니다.
W0을 제가 스테이징에서 read-only로 수행해도 될지, 단계 배포(상품→주문) 순서로 진행할지
확인 부탁드립니다.**

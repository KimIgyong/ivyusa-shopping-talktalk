# REQ-260826 — Odoo 상품·주문·고객 연동 (gif2box)

- 요청일: 2026-08-26
- 요청 원문: Odoo를 쓰는 테넌트 **gif2box**(https://gif2box.vn)에서 **상품·주문·고객
  정보가 ShopTalk으로 연동**되어야 한다. 현재 구현 상황 파악 + 작업해야 할 내용 정리.
- 성격: 분석/스코핑 (구현 착수 전). 승인 후 PLN → 구현.

## 1. AS-IS (실측 2026-08-26)

### 1.1 gif2box 테넌트 (스테이징 DB)
| 항목 | 값 |
|---|---|
| id / slug | 6 / `gif2box` |
| plan / workflow_mode | starter / base |
| shop_domain / storefront_url | `gif2box.vn` / `https://gif2box.vn` (상품 링크 검증값 이미 세팅) |
| Odoo 자격증명 | **저장됨, status=connected** (인증 유효) |
| products_cache / orders_cache / customers | **0 / 0 / 0** (아무것도 동기화 안 됨) |

### 1.2 Odoo 연동 코드 범위 — "연결 테스트만" 있음
- `tenant/ecommerce-probe.util.ts#probeOdoo`: JSON-RPC `common.authenticate(db, user, api_key)`로
  **uid 확인(인증)만**. 인증 이후 데이터 읽기(`object.execute_kw`)는 **코드 전무**.
- 제네릭 이커머스 서비스(`ecommerce-integration.service.ts`)는 Odoo/Woo/Haravan에 대해
  **자격증명 저장 + 연결 테스트**만 제공. 상품/주문/고객 동기화·"지금 동기화" 없음.
- ⚠️ **connected = 인증 성공일 뿐, 실제 레코드 읽기(execute_kw)는 미검증** — Odoo 레코드
  규칙/접근권한이 읽기를 막을 수 있어, 착수 시 gif2box 실 Odoo에 read 스모크가 선행돼야 함.

### 1.3 동기화 아키텍처 = provider별 전용 서비스 (Cafe24가 가장 가까운 레퍼런스)
- 상품: `product/product-sync.service.ts`(Shopify 공개 `/products.json` 크롤),
  `cafe24/cafe24-product-sync.service.ts`(OAuth Admin API) → 둘 다 **같은 `products_cache`**.
- 주문: `order/shopify-sync.service.ts`(+ HMAC 웹훅), `cafe24/cafe24-sync.service.ts`(스케줄 풀,
  **웹훅 없음**) → `orders_cache` + `order_items`, **고객은 주문 동기화의 부수효과로 생성/링크**.
- 고객: 벌크 풀 없음 — 주문 동기화 시 `customerService.findOrCreateByEmail`/외부ID 링크로 생성.
- 스케줄: cron 라이브러리 아님, 각 서비스가 `setInterval`(`*_SYNC_INTERVAL_MIN`, 기본 0=비활성).
- **상품 → 위젯/RAG 지식 변환은 provider-무관 브리지**: `knowledge/catalog-sync.service.ts`가
  `products_cache`(아무 provider)를 읽어 `kb_documents`(source=product_catalog)로 변환.
  → **Odoo가 products_cache만 채우면 지식 경로는 무수정으로 동작**.

### 1.4 저장 테이블 — 대체로 준비됨 (스키마 변경 거의 불필요)
| 테이블 | Odoo 수용성 |
|---|---|
| `products_cache` | provider 컬럼 없음, `UNIQUE(tenant_id, handle)` — 출처는 handle 프리픽스(`odoo-{id}`)로 인코딩. ✓ |
| `orders_cache` | **`provider` 컬럼 존재**(주석에 Odoo 명시), `UNIQUE(tenant_id, provider, shopify_order_id)`. 외부 주문ID 컬럼명이 `shopify_order_id`지만 "아무 채널 ID 수용" 용도. ✓ |
| `customers` | 제네릭 **`external_customer_id`** 존재(`embed.service`가 Odoo를 의도 사용처로 명시). ✓ |
| `integration_status` | provider별 ok/error·lastSyncAt 기록소 — Odoo도 그대로 사용. ✓ |

**결론: 막힌 지점은 오직 "Odoo → ShopTalk 데이터 동기화 계층" 하나.** 인증 OK, 저장소 준비,
스케줄 훅 포인트·지식 변환 브리지 모두 존재. 스키마 변경은 사실상 불필요(엔티티 재사용).

## 2. Odoo 데이터 매핑 (JSON-RPC `object.execute_kw`)

인증 uid 확보 후 `execute_kw(db, uid, api_key, model, method, args)`:

| ShopTalk | Odoo 모델 | 비고 |
|---|---|---|
| 상품 | `product.template`(대표) / `product.product`(변형) `search_read` | 이미지: `image_1920`는 base64 → ShopTalk `image_url`은 **웹 URL**(`/web/image/product.template/{id}/image_1920`)로 구성 필요. `product_url`은 `/shop/product/{slug}` 등 storefront 규칙. |
| 주문 | `sale.order` + `sale.order.line` `search_read` | `state` 필터(`sale`/`done`만? 견적 제외) 정책 필요. 금액=pricelist/통화. |
| 고객 | `res.partner`(주문의 `partner_id`) | 이메일 존재 여부·B2B 계정 계층(회사/연락처) 주의. 벌크 풀 대신 주문 링크가 기본. |

## 3. 작업 분해 (Cafe24 미러 — OAuth·웹훅 없음, 스케줄 풀)

| # | 작업 | 산출 |
|---|---|---|
| W1 | `OdooClient` (JSON-RPC `execute_kw`, 인증 uid 캐시) — `pullProducts`/`pullOrders`/`listCategories` | `domain/odoo/odoo.client.ts` (cafe24-admin.client 미러) |
| W2 | `OdooProductSyncService.syncProducts` → `products_cache`(handle `odoo-{id}`) | 지식 변환은 기존 catalog-sync 무수정 재사용 |
| W3 | `OdooSyncService.syncOrders` → `orders_cache`(provider=odoo)+`order_items`, 고객 `findOrCreateByEmail`/external_customer_id 링크 | `integrationService.upsert('odoo', …)` 기록 |
| W4 | `ScheduledOdooSyncService`(`ODOO_SYNC_INTERVAL_MIN`, 비중첩 runAll) + `TenantService.listOdooTenantIds()` | scheduled-cafe24 미러 |
| W5 | 온디맨드 엔드포인트 `POST /tenants/me/odoo/sync`(주문)·`/odoo/products/sync`(상품) + 콘솔 버튼 | RBAC `INTEGRATION_CREDENTIALS_MANAGE` |
| W6 | `ProductSyncService.cafe24TenantIds()` 제외 로직에 Odoo도 반영(공개 크롤 대상 제외 — storefront 크롤과 충돌 방지) | 확인·소폭 수정 |
| W0 | **선행 스모크**: gif2box 실 Odoo에 execute_kw read 1회(product.template/sale.order/res.partner 카운트·샘플) — 필드명·state·권한 실검증 | 착수 전 게이트 |

- 모듈 등록(app.module), `.env` `ODOO_SYNC_INTERVAL_MIN`(.example 포함 — CI env 템플릿 게이트), i18n(콘솔 버튼).

## 4. 제약·리스크 (착수 전 확인 필요)

- **R1 read 권한**: connected는 인증만. execute_kw read를 gif2box 계정/레코드 규칙이 허용하는지 미검증(W0).
- **R2 Odoo 버전·현지화 편차**: 필드명/모델 구성이 버전·설치별로 다름 — gif2box 실 스키마 기준으로 매핑 확정.
- **R3 이미지·상품 URL**: Odoo 이미지=base64 필드 → 웹 URL 변환 규칙, `product_url`=storefront 경로 규칙 확정.
- **R4 주문 state 정책**: 견적(draft/sent) 포함 여부, 취소 처리, 통화/세금.
- **R5 고객 이메일**: res.partner 이메일 부재/중복, 회사-연락처 계층. PII는 기존대로 암호화 저장(재사용).
- **R6 스키마**: 원칙적으로 변경 없음(엔티티 재사용). 확정은 PLN에서.

## 5. 권고 (결정 필요)

- D1 범위: **상품 우선(위젯 상품추천·지식) → 주문 → 고객** 순 단계 배포 vs 일괄. 권고: 단계(W2→W3 순, 고객은 W3 부수).
- D2 W0 선행 스모크를 별도 확인 단계로 둘지. 권고: **필수 게이트**(Odoo 편차·권한 리스크가 큼).
- D3 스케줄 활성값(`ODOO_SYNC_INTERVAL_MIN`). 권고: 초기 0(온디맨드 검증) → 안정 후 값 부여.

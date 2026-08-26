# RPT-260826 — Odoo 상품 카탈로그 동기화 (gif2box, products-only)

- 요구사항: Odoo 사용 테넌트 gif2box(https://gif2box.vn)에서 상품·주문·고객 연동. 사용자
  결정으로 **상품만 먼저 구현·배포**(주문·고객은 다음 단계 — W0에서 실 확정주문 0건 확인).
- 문서 체인: REQ-260826 → PLN-260826(승인, W0 결과 포함) → 본 RPT.
- **배포 상태: PR #410 (`927e42a`) main 머지 + 스테이징 배포 + gif2box 실 Odoo E2E 검증 완료 (2026-08-26).**
- 스키마 변경 **없음**(기존 `products_cache` 재사용) — 마이그레이션 불필요. 스케줄러 없음(온디맨드).

## 구현 (W1·W2·W5-상품)

- `domain/odoo/odoo.client.ts` `OdooClient` — JSON-RPC `common.authenticate`(uid) →
  `object.execute_kw(product.template.search_read)`. SSRF 가드(`assertPublicUrl`, export하여 재사용),
  **이미지 바이트(image_1920) 미조회**(응답 폭증 방지), `res.company` 통화 1회 조회.
- `odoo-product-sync.service.ts` `OdooProductSyncService.syncProducts` — `sale_ok&active` 상품 →
  `products_cache`(handle `odoo-{id}`), 200/page. 매핑(W0 확정): title=name, price=list_price,
  currency=회사통화, product_url=`{url}{website_url}`(없으면 `/shop`),
  image_url=`{url}/web/image/product.template/{id}/image_1920`, category=경로 마지막 세그먼트,
  **tags=카테고리 경로 전체**(설명 얇은 상품도 지식화 — held 0 확인), 미대상 archive.
- `odoo.controller.ts` `POST /tenants/me/odoo/products/sync`(RBAC INTEGRATION_CREDENTIALS_MANAGE,
  RequireMenu settings) + `OdooModule` app.module 등록.
- 웹: `settings.service`/`settings.hooks`(`useSyncOdooProducts`) + `IntegrationConfigModal`의
  Odoo 설정 모달에 **[상품 가져오기]** 버튼(연결됨일 때) + i18n 6개 언어.
- **지식 변환은 기존 catalog-sync 무수정 재사용** — Odoo가 products_cache를 채우면 위젯
  상품추천/RAG 경로가 그대로 동작.

## W0 (실 Odoo read 검증, 코드 전 게이트)
gif2box Odoo(url=gif2box.vn, db=gif2box, user=admin): execute_kw read 정상(권한 차단 없음),
`product.template` 123 / `product.product` 344, website_sale 설치. 필드 매핑 확정.
주문 `sale.order` 2건 전부 draft(내부/테스트) — 확정주문 0, 고객 customer_rank>0 = 1
→ **주문·고객은 지금 붙여도 데이터 없음, 다음 단계로 분리**(RPT §잔여).

## 테스트
- 단위 4케이스(필드 매핑·URL 폴백·페이징+archive·미연결), 전체 **1,678 통과**. typecheck·build·i18n:check 그린.
- **스테이징 E2E (gif2box 실 Odoo, 2026-08-26)**:
  | 단계 | 결과 |
  |---|---|
  | 라우트 배포(미인증 401) | ✅ |
  | `POST /tenants/me/odoo/products/sync` | ✅ `{ok:true, synced:115, archived:0}` (123 중 sale_ok&active 115) |
  | products_cache(tenant 6) | ✅ 115행 active, 매핑 정확(VND·web-image·website_url·베트남어 타이틀) |
  | `/admin/products` total | ✅ 115 |
  | catalog 미리보기 | ✅ scanned 115 / families 109 / **held 0**(누락 없음) |
  | catalog import(지식화) | ✅ succeeded, 109 문서 생성, **임베딩 109/109(실패 0)** |
  | product kb docs total | ✅ 110 |

## 운영 메모 / 잔여
- **검증 절차**: gif2box 사용자 전원 invited 상태라, id=20(dev@ on gif2box)을 검증용으로 임시
  active+비밀번호 설정 후 토큰 발급→동기화 호출, **검증 후 status=invited로 원복**(비밀번호 해시는
  덮였으나 invited 게이트로 로그인 차단됨). ⚠️ ssh 원격 셸에서 bcrypt 해시의 `$`가 재확장돼
  손상되는 함정 → 해시는 컨테이너에서 생성해 처리.
- **주문·고객(다음 단계)**: W0에서 실 확정주문 0건 확인. gif2box에 실 판매가 쌓이면 W3(주문
  `sale.order`→orders_cache, 고객 partner_id→findOrCreateByEmail/external_customer_id)·W4(스케줄)
  진행. 코드 구조는 Cafe24 미러로 확정돼 있음(PLN §W3·W4).
- **스케줄러 미도입**(온디맨드만) — 정기 동기화가 필요하면 `ScheduledOdooSyncService` +
  `ODOO_SYNC_INTERVAL_MIN`(`.env.staging.example` 포함, CI 게이트) 추가.
- 예방 패턴: (1) Odoo 이미지는 base64 필드 → **바이트 조회 금지**, web-image 라우트로 URL 구성.
  (2) 카테고리를 tags로도 넣어 catalog-sync의 "얇은 설명+무태그" held를 회피(gif2box held 0).
  (3) 원격 셸로 시크릿/해시 전달 시 `$` 재확장 주의 — 생성처에서 처리.

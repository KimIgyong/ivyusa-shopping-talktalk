# RPT-260826 — WooCommerce·Haravan 상품·주문·고객 동기화

- 요구사항: Odoo에 이어 **Woo/Haravan**도 상품·주문·고객 연동.
- **배포 상태: PR #414 (`4290e69`) main 머지 + 스테이징 배포 + Haravan(hrv-tata) 실 데이터 E2E 완료 (2026-08-27).**
- 스키마 변경 **없음**(products_cache/orders_cache/order_items/customers 재사용) — 마이그레이션 불필요.
  신규 env `HARAVAN_SYNC_INTERVAL_MIN`·`WOOCOMMERCE_SYNC_INTERVAL_MIN`(기본 0) — self-hosted 템플릿 반영(CI 게이트).

## 구현 (Odoo/Cafe24 패턴 미러)
- **Haravan**(Shopify 호환 REST, Bearer, `*.myharavan.com` 핀 → SSRF 불필요):
  `HaravanClient`(shopCurrency·pullProducts·pullOrders) + `HaravanProductSyncService`(handle `haravan-{id}`,
  variants[0].price/sku, images[0].src, product_url=`/products/{handle}`, tags=tags+product_type) +
  `HaravanSyncService`(financial/fulfillment→내부상태: fulfilled→shipping·partial→preparing·else paid·
  cancelled→cancel_requested, 고객=customer.email findOrCreateByEmail, memberId=`haravan-{customerId}`).
- **WooCommerce**(REST v3, Basic auth ck/cs, SSRF 가드): `WooClient`(storeCurrency·pullProducts·pullOrders) +
  `WooProductSyncService`(handle `woo-{id}`, permalink=product_url, categories+tags) +
  `WooSyncService`(status→내부: completed→delivered·processing→paid·on-hold/pending→pending_payment·
  cancelled/refunded/failed→cancel_requested, 고객=billing.email).
- 공용 `parseProviderConfig` 유틸(자격증명 복호화), `ScheduledHaravan/WooSyncService`(상품+주문 주기),
  `TenantService.list{Haravan,Woocommerce}TenantIds`, `POST /tenants/me/{haravan,woocommerce}/{products/sync,sync}`,
  app.module 등록. 지식 변환은 기존 catalog-sync 무수정.
- 웹: Odoo 전용이던 동기화 버튼을 **syncable(odoo/woo/haravan) 일반화**(`useSyncEcommerceProducts/Orders(provider)`)
  + generic i18n(`integrations.syncProducts/syncOrders/syncHint`) 6종.

## 테스트
- 단위 7케이스(Haravan 상품 매핑·상태 fulfilled/cancelled·고객링크; Woo 상품 매핑·status 3종·고객링크),
  전체 **1,690 통과**. typecheck·build·i18n·env·부팅(양 컨트롤러·스케줄러·DI 무순환) 그린.
- **스테이징 E2E — Haravan(hrv-tata / tata-8.myharavan.com, 실 데이터)**:
  | 체크 | 결과 |
  |---|---|
  | 라우트 배포(미인증 401) | ✅ (haravan·woocommerce 모두) |
  | 상품 동기화 | ✅ `synced:27` |
  | 주문 동기화 | ✅ `synced:27` |
  | products_cache/orders_cache/customers/order_items | ✅ 27/27/1/27 |
  | 매핑 | ✅ handle haravan-{id}·price VND·product_url `/products/{handle}`·상태(paid→Confirmed, shipping→In Transit)·member_id·customer 링크 |
  | catalog 미리보기(지식화) | ✅ scanned 27 / families 27 / **held 0** |
- **WooCommerce**: 연결된 테넌트 없어 **배포 검증(라우트 401)만** — 실 스토어 생기면 즉시 동작(단위 테스트로 매핑 커버).

## 운영 메모 / 잔여
- Haravan 실 스토어 2곳(hrv-tata id9, hrv-moctuis id8) connected. hrv-tata E2E 검증 완료.
  hrv-moctuis는 동일 코드라 미실행(필요 시 콘솔 버튼으로).
- **정기 동기화**: `HARAVAN_SYNC_INTERVAL_MIN`·`WOOCOMMERCE_SYNC_INTERVAL_MIN`>0 설정 시 상품+주문 자동
  동기화(현재 0=온디맨드).
- **검증 계정**: hrv-tata id=24(dev@) 임시 active→검증 후 **invited 원복**. [[staging-console-login]].
- **커머스 연동 4종 완비**: Cafe24·Odoo·Haravan·WooCommerce 상품·주문·고객 동기화 모두 동일 패턴.
  [[odoo-product-sync]]. 다음 확장 시 `parseProviderConfig` + client/product-sync/order-sync/scheduler 4파일.

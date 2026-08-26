# RPT-260826 — Odoo 주문·고객 동기화 + 스케줄러 (gif2box, W3/W4)

- 요구사항: Odoo 테넌트 gif2box의 상품·**주문·고객** 연동. 상품(PR #410) 완료 후 **주문·고객 이어서 구현**.
- 문서 체인: REQ-260826 → PLN-260826(승인) → RPT-260826-Odoo-Product-Sync(상품) → 본 RPT(주문·고객).
- **배포 상태: PR #412 (`0fd8330`) main 머지 + 스테이징 배포 + gif2box 실 Odoo 검증 완료 (2026-08-26).**
- 스키마 변경 **없음**(`orders_cache`·`order_items`·`customers` 재사용) — 마이그레이션 불필요.
  신규 env `ODOO_SYNC_INTERVAL_MIN`(기본 0=온디맨드) — self-hosted env 템플릿에 반영(CI 게이트).

## 구현 (W3·W4, Cafe24 주문 동기화 미러)
- `OdooClient`: `pullOrders`(`sale.order` **state in sale/done/cancel** — 견적 draft/sent 제외),
  `pullOrderLines`·`pullPartners`(페이지당 각 1콜 배치).
- `OdooSyncService.syncOrders`: `sale.order` → `orders_cache`(provider=odoo, order_number=`name`
  예: S00019, memberId=`odoo-{partnerId}`), 라인 → `order_items`(display_type 섹션/노트 라인 제외).
  **고객은 partner email로 `findOrCreateByEmail` 링크**(게스트=무링크, Shopify 게스트 주문과 동일),
  멱등 upsert(기존 customerId 링크 비강등), state 매핑(sale/done=paid→Confirmed, cancel=cancel_requested).
- `ScheduledOdooSyncService`(`ODOO_SYNC_INTERVAL_MIN`, 기본 0) + `TenantService.listOdooTenantIds()`
  — 상품+주문 주기 실행(비중첩). `OdooModule`에 등록.
- `POST /tenants/me/odoo/sync`(RBAC INTEGRATION_CREDENTIALS_MANAGE) + 콘솔 Odoo 모달 **[주문 동기화]**
  버튼(연결됨일 때) + i18n 6개 언어.

## 테스트
- 단위 5케이스(주문 매핑·취소→cancel_requested·게스트 무링크·멱등 재동기화·미연결), 전체 **1,683 통과**.
  typecheck·build·i18n:check·부팅(OdooController 매핑·DI 무순환) 그린.
- **스테이징(gif2box 실 Odoo, 2026-08-26)**:
  | 체크 | 결과 |
  |---|---|
  | 라우트 배포(미인증 401) | ✅ |
  | 부팅 로그 `Odoo auto-sync disabled`(interval 0) | ✅ |
  | `POST /tenants/me/odoo/sync` | ✅ `{ok:true, synced:0}` — **확정주문 0이라 0건이 정상**(견적 draft 2건은 state 필터로 제외) |
  | orders_cache/customers 스퓨리어스 행 | ✅ 0/0(불필요 행 없음) |
  | products_cache(이전 단계) 무회귀 | ✅ 115 유지 |

## 운영 메모 / 잔여
- **현재 gif2box 확정주문 0건**(W0: sale.order 2건 전부 draft·내부/테스트). 따라서 주문·고객
  동기화는 **코드 경로만 실 Odoo로 검증(0건 정상)**, 실 매핑은 단위 테스트로 커버. **실 판매가
  발생하면** 온디맨드/스케줄로 자동 반영(sale/done → orders_cache, 이메일 있는 partner → customers).
  ⚠️ gif2box 프로덕션 Odoo에 **테스트 주문을 쓰지 않음**(read-only 원칙).
- **정기 동기화**: 필요 시 `ODOO_SYNC_INTERVAL_MIN`(스테이징 `.env.staging`)을 >0으로 설정하면
  상품+주문 자동 동기화(비중첩). 현재 0(온디맨드만).
- **검증 계정**: gif2box id=20(dev@ on gif2box) 임시 active→검증 후 **invited 원복**. [[staging-console-login]].
- 예방 패턴: (1) 주문 state 필터는 **허용목록**(sale/done/cancel)로 견적 제외 — draft를 주문으로
  캐시하면 안 됨. (2) partner/line은 페이지 단위 **배치 read**(N+1 회피). (3) env는 코드가 읽는 키를
  반드시 **self-hosted 템플릿**(`docker/self-hosted/.env.self-hosted.example`)에 넣어야 CI env 게이트
  통과(스테이징 example 아님).
- **다음 확장**: Woo/Haravan도 동일 패턴(client+sync+scheduler+버튼)으로 확장 가능. [[odoo-product-sync]].

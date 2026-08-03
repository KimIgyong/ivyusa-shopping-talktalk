# RPT — 위젯 로그인 리다이렉트/팝업 선택 + 로그인 시 주문 백필 (2026-08-04)

> REQ `docs/analysis/REQ-Widget-Login-Redirect-Orders-20260803.md` ·
> PLN `docs/plan/PLN-Widget-Login-Redirect-Orders-20260803.md` (승인: 팝업 유지+관리자 선택, 복귀 자동 오픈) ·
> TCR `docs/test/TCR-Widget-Login-Redirect-Orders-20260804.md`

## 1. 무엇이 바뀌었나

1. **Sign in 열기 방식 이원화(기본 redirect)** — 위젯 Sign in 클릭 시 embed.js가
   테넌트 설정(mode)에 따라 ① 현재 탭 전체를 `/customer_authentication/login?return_to=<현재>`로
   이동(기본; Shopify가 New Customer Accounts 호스티드 로그인으로 리다이렉트) ② 종전 팝업.
2. **로그인 복귀 시 위젯 자동 오픈** — redirect 이동 직전 `sessionStorage 'ivy:reopen'` 저장,
   복귀 로드 시 iframe `&reopen=orders` → 위젯이 주문 탭으로 자동 오픈. identity 대기 중엔 스피너.
3. **관리자 설정** — 콘솔 `/settings` "위젯 동작" 카드(전체 페이지/팝업 Select, i18n en/es/ko, 토스트),
   `GET/PATCH /api/v1/tenants/widget-settings`(MASTER/DIRECTOR, 감사 `tenant.widget_settings_updated`),
   `tenants.widget_login_mode` 컬럼, `session/ensure` 응답 `widgetLoginMode`로 위젯에 전달.
4. **로그인 시 주문 백필(요구 1 잔여 갭)** — app-proxy identity 인증 성립 시
   `syncOrdersForCustomer(tenant, customer)`를 fire-and-forget 실행: Admin GraphQL
   `customer_id:<id>` 필터로 최대 2페이지(100건) upsert. 고객별 10분 TTL 가드.
   → 첫 로그인 고객도 과거 주문이 "내 주문"에 보임.

## 2. 변경 파일

| 영역 | 파일 |
|---|---|
| embed | `apps/widget/public/embed.js` (mode 분기 `redirectToLogin`/`openLoginPopup`, reopen 플래그) |
| widget | `src/store/widgetStore.ts` (`loginMode`), `src/hooks/useSession.ts` (ensure→loginMode), `src/hooks/useStorefrontLogin.ts` (mode 전달), `src/components/widget/Widget.tsx` (reopen 부팅), `src/components/orders/OrdersTab.tsx` (identity 대기 스피너), `src/lib/types.ts` |
| types | `packages/types/src/common/enum.types.ts` (`WIDGET_LOGIN_MODE`), `src/api/widget.types.ts` (`SessionResponse.widgetLoginMode`) |
| api | `domain/tenant/{entity/tenant.entity.ts, tenant.controller.ts, tenant.service.ts, tenant.mapper.ts, dto/request, dto/response}`, `domain/session/{session.service.ts, session.mapper.ts(+spec)}`, `domain/shopify-proxy/{shopify-proxy.service.ts, shopify-proxy.module.ts}`, `domain/order/{shopify-admin.client.ts, shopify-sync.service.ts(+spec), order.module.ts}` |
| web | `domain/settings/{SettingsPage.tsx, settings.hooks.ts, settings.service.ts}`, `i18n/locales/{en,es,ko}/settings.json` |
| sql | `sql/migration_widget_login_mode.sql`(신규), `sql/01-schema.sql`(tenants DDL 갱신) |

## 3. 테스트 결과

- 단위: apps/api jest **35 suites / 345 tests PASS** (신규 U1~U3 포함, 기존 스냅샷 2건 갱신).
- `npm run typecheck` / `npm run build` 전체 통과, `node --check embed.js` OK.
- API 실부팅 검증(dev DB): `Nest application successfully started` (엔티티 변경 A-1 체크).
- E2E(S1~S7)는 스테이징 배포 후 실측 — 결과 본 문서 §5에 추기.

## 4. 배포 상태

| 항목 | 값 |
|---|---|
| PR | #(작성 예정) `feature/widget-login-redirect` → main, squash |
| 커밋 | (머지 후 기입) |
| 마이그레이션 | `sql/migration_widget_login_mode.sql` — 스테이징: **배포 전 선적용 필요** / 프로덕션: 미정 |
| 스테이징 배포 | 대기 (마이그레이션 → deploy-staging.sh → 검증) |
| 운영 env | `SHOPIFY_SYNC_INTERVAL_MIN=30` 활성화 예정(체크리스트 C1) |

## 5. 스테이징 검증 기록

(배포 후 추기)

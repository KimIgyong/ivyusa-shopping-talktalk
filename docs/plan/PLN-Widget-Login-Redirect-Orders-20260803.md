# PLN — 위젯 로그인 페이지 리다이렉트 전환 + 로그인 시 주문 백필 (2026-08-03)

> 근거: `docs/analysis/REQ-Widget-Login-Redirect-Orders-20260803.md`
> 구현 브랜치: `feature/widget-login-redirect` — **origin/main 기준** (현 워크트리 브랜치는 26커밋 stale, 사용 금지)
> 스키마 변경: **있음** — `tenants.widget_login_mode` 컬럼 추가 (`sql/migration_widget_login_mode.sql`,
> 관리자 설정 채택으로 초안의 "없음"에서 변경). 스테이징 배포 전 SQL 선적용 필수.

## Stage 1 — Sign in: 리다이렉트 기본 + 팝업 선택 (요구 2, 승인 반영판)

대상: `apps/widget/public/embed.js`, `apps/widget/src/hooks/useStorefrontLogin.ts`,
`apps/widget/src/store/widgetStore.ts`, `apps/widget/src/components/widget/Widget.tsx`

1. **embed.js**: `ivy:login` 메시지가 위젯이 실어 보낸 `mode`를 갖고 옴.
   - `mode === 'popup'` → 기존 `openLoginPopup()` (팝업 코드 전부 유지).
   - 그 외(기본 `redirect`) → `redirectToLogin()`: `sessionStorage 'ivy:reopen'='orders'` 저장 후
     `window.location.assign(buildLoginUrl())` (최상위 탭 이동).
   - `buildLoginUrl()` 현행 유지: `/customer_authentication/login?return_to=<현재 URL>&locale=...`
     → Shopify가 New Customer Accounts 호스티드 로그인(shopify.com/authentication/...)으로 리다이렉트.
   - 페이지 로드 시 `ivy:reopen` 플래그 소거 후 iframe src에 `&reopen=<tab>` 부여.
   - `ivy:signin` back-compat 분기, iframe sandbox `allow-popups*` 토큰 유지(팝업 모드용).
2. **widget**: `widgetStore.loginMode`(기본 `redirect`, `session/ensure` 응답 `widgetLoginMode`로 갱신)
   → `useStorefrontLogin`이 `postMessage({type:'ivy:login', mode})`.
   - `pending`/`cancel`/`ivy:login-cancelled` 로직은 팝업 모드용으로 그대로 유지.
   - `Widget.tsx` 마운트 시 URL `reopen=<orders|chat|notifications>` 인식 → 위젯 오픈 + 해당 탭 활성.
   - `OrdersTab`: 복귀 직후 identity 핸드셰이크 대기 중(`embedIdentity==='pending'`)엔
     Sign-in 카드 대신 스피너(방금 로그인한 고객에게 로그인 화면 번쩍임 방지).
3. **관리자 설정 (신규 — 승인 결정 1)**:
   - `tenants.widget_login_mode varchar(16) NOT NULL DEFAULT 'redirect'` (마이그레이션 필요).
   - API: `GET/PATCH /api/v1/tenants/widget-settings` (`@RequireRank(MASTER, DIRECTOR)`, 감사로그
     `tenant.widget_settings_updated`), `session/ensure` 응답에 `widgetLoginMode` 포함.
   - 콘솔: `/settings` 페이지에 "위젯 동작" 카드(Select popup/redirect + 저장, i18n en/es/ko, 토스트).

콘솔 카드 와이어프레임 (`/settings`, InstallGuideCard 아래):

```
┌─ Widget behavior ────────────────────────────────┐
│ How the chat widget behaves on your storefront.  │
│                                                  │
│ Customer sign-in opens as                        │
│ ┌──────────────────────────────────┐             │
│ │ Full page (recommended)      ▼   │             │
│ └──────────────────────────────────┘             │
│  · Full page: 같은 탭에서 스토어 로그인으로 이동,│
│    복귀 시 위젯이 주문 탭으로 자동 오픈          │
│  · Popup window: 팝업으로 열림(차단 가능성 안내) │
│                                                  │
│ [ Save ]  (변경시에만 활성)                      │
└──────────────────────────────────────────────────┘
```
3. **UI 변경 와이어프레임** (AuthGate — choice 모드는 현행과 동일, waiting 상태만 제거):

```
┌────────────────────────────────────┐
│ Sign in required                   │
│ Sign in to see your orders, or     │
│ look one up as a guest.            │
│ ┌────────────────────────────────┐ │
│ │  [→] Sign in                   │ │  ← 클릭 즉시 "현재 탭"이 스토어
│ └────────────────────────────────┘ │     로그인 페이지로 이동 (팝업 없음)
│ ┌────────────────────────────────┐ │
│ │  [🔍] Guest lookup             │ │  ← 현행 유지
│ └────────────────────────────────┘ │
│              Cancel                │
└────────────────────────────────────┘
  (기존 "waiting… / use guest instead" 스피너 화면은 삭제 —
   리다이렉트이므로 대기 상태가 존재하지 않음)

[로그인 복귀 후]  스토어 페이지 리로드
┌──────── 위젯 자동 오픈 ────────────┐
│ [Chat] [Orders*] [Noti] [Set]      │  ← Orders 탭 활성
│  주문내역 목록 (Sign in 버튼 없음) │
└────────────────────────────────────┘
```

## Stage 2 — 로그인 성립 시 해당 고객 주문 백필 (요구 1의 "주문내역 가져와야함")

대상: `apps/api/src/domain/shopify-proxy/shopify-proxy.service.ts`, `apps/api/src/domain/order/shopify-sync.service.ts`(+client)

1. `ShopifySyncService`에 `syncOrdersForCustomer(tenantId, shopifyCustomerId)` 추가:
   Admin GraphQL `orders(query: "customer_id:<id>")` 1~2페이지(최대 100건) → 기존 upsert 경로 재사용(멱등).
2. `resolveIdentity`에서 인증 성립 시 `backfillProfile`과 같은 패턴으로 **fire-and-forget** 호출.
   - 응답 지연 0 (unawaited), 실패는 debug 로그만 — 웹훅/수동 sync가 이후 자가 치유.
   - 과호출 방지: 고객별 재백필 가드(예: Redis `NX EX 600` 키 또는 인메모리 TTL) 1개.
3. (운영) 스테이징 `SHOPIFY_SYNC_INTERVAL_MIN` 활성화(C1 미결 해소, 예: 30) — `.env.staging` 값 변경만.

## Stage 3 — 배포 + E2E 검증

1. PR(squash) → 스테이징: **`sql/migration_widget_login_mode.sql` 선적용 → 배포**
   (API + web + widget 재빌드, embed.js 포함).
   배포 검증: 부팅 로그 `successfully started`, `docker ps` STATUS, `curl embed.js`에
   `redirectToLogin` **존재** 확인, `GET /tenants/widget-settings` 401(=배포됨).
2. E2E (ambshop-dev.myshopify.com, 실브라우저):
   - **S1** 비로그인 → 위젯 주문 탭 → Sign in 클릭 → **현재 탭**이 shopify.com 호스티드 로그인으로 이동
     → 로그인 → 스토어 복귀(`return_to` 동작 확인) → 위젯 자동 오픈·주문 탭 → Sign in 버튼 없음 + 주문내역 표시
   - **S2** 이미 로그인 상태에서 아무 페이지 로드 → 위젯 열면 버튼 없음 + 주문내역 (과거 주문 포함 — Stage 2 백필 확인)
   - **S3** Guest lookup 경로 회귀 없음
   - **S4** 로그아웃 후 → 다시 AuthGate 노출 (authLost 경로)
   - **S5** `?shop_sign_in=true` (Sign in with Shop) 로그인 후에도 identity 인증 성립 확인
3. TCR/RPT 작성 (`docs/test/TCR-…`, `docs/implementation/RPT-…`).

## 사이드 임팩트 분석

| 영역 | 영향 | 판단 |
|---|---|---|
| 팝업 코드 유지(승인 결정 1) | popup 경로/복귀 leg/`ivy:login-cancelled` 모두 현행 유지, mode 분기만 추가 | 기존 동작 회귀 없음 |
| 구버전 embed.js + 신버전 위젯 | 캐시된 구 embed.js는 `mode` 필드 무시 → 팝업으로 동작(종전과 동일) | 안전한 열화 |
| standalone 위젯(직접 접속, iframe 아님) | `canLogin=false` → Sign in 버튼 자체가 안 뜸(현행) | 변화 없음 |
| PWA/RN WebView | embed.js 경유가 아니면 영향 없음; WebView에 embed 페이지를 띄우는 경우 최상위 이동이 WebView 내 이동 → 로그인 후 복귀 동작 앱에서 확인 필요 | E2E 항목에 메모 |
| GA4 분석 | 리다이렉트로 페이지 이탈 → 로그인 클릭 이벤트가 전송 전 유실 가능 | `analytics` 이벤트를 assign 직전 발화(beacon) — 미세, 수용 |
| 채팅 세션 연속성 | 페이지 리로드 후 identity가 customer-bound 세션 재사용(`findOrCreateForCustomer`) | 대화 이력 유지됨 |
| 주문 백필 | upsert 멱등 + FIX-Customer-Duplicate-ShopifyId의 unique 인덱스가 이중 고객 행 방지 | 안전 |

## 리스크

1. **`return_to` 미존중 가능성**(New Customer Accounts): 로그인 후 shopify.com 계정 페이지에 랜딩할 수 있음.
   → 완화: 그 경우에도 스토어로 돌아오는 즉시 identity로 인증됨(기능 요구 충족). S1에서 실측 후,
   필요 시 `loginPath`를 `/account/login?return_url=…`로 조정(설정 `cfg.loginPath`로 스토어별 오버라이드 가능).
2. 위젯 자동 재오픈(`reopen=orders`)은 신규 동작 — 플래그는 1회성(sessionStorage 소거)으로 루프 방지.
3. Admin API rate limit: 고객당 1~2쿼리 + TTL 가드로 미미.

## 승인 결과 (2026-08-04, 사용자)

1. **팝업 코드 유지** — 제거하지 않고, **관리자(테넌트 콘솔) 설정에서 popup / redirect 선택**.
   기본값은 `redirect`(이번 요구사항의 동작). Stage 1의 "팝업 코드 삭제" 항목은 취소되고
   embed.js는 두 경로를 모두 유지, `ivy:login` 메시지에 위젯이 설정값(mode)을 실어 보낸다.
2. **로그인 복귀 시 위젯 자동 오픈(주문 탭)** — 계획대로 진행.

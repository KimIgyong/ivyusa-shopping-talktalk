# REQ — 위젯 스토어프런트 로그인: 페이지 리다이렉트 전환 + 로그인 시 주문내역 (2026-08-03)

## 1. 요구사항 원문

대상 스토어: `https://ambshop-dev.myshopify.com/?country=US&shop_sign_in=true`

1. **로그인 상태**: 채팅위젯에서 "Sign in(사용자 로그인)" 버튼이 사라져야 하고, 주문내역을 가져와야 한다.
2. **비로그인 상태**: 위젯에서 Sign in 클릭 시 **모달(팝업)창이 아니라** Shopify 고객 계정 로그인 페이지
   (`https://shopify.com/authentication/60042903632/login?...` — New Customer Accounts 호스티드 로그인)로 **페이지 이동**해야 한다.

## 2. AS-IS 검증 결과 (2026-08-03 재확인)

### 2.1 코드 기준 — ⚠️ 검증 기준은 `origin/main`

현재 워크트리 브랜치(`KimIgyong/shopify-test`)는 **origin/main보다 26커밋 뒤**이며, 로그인 흐름은
main에 이미 머지되어 있다(PR #56 `a865a5d` 팝업 로그인, PR #65 리다이렉트 초안 대체).
**구현 착수 시 반드시 origin/main에서 새 브랜치를 딴다** (stale 브랜치에서 작업 금지).

### 2.2 요구 1 — 로그인 시 버튼 숨김 + 주문내역: **main에 구현되어 있고 백엔드는 동작 확인됨**

동작 구조 (origin/main):

- 신원 확인은 Shopify **App Proxy 서명 왕복**으로 이루어진다:
  `embed.js`가 스토어 상대경로 `/apps/ivy/identity`를 fetch → Shopify가 서명 + `logged_in_customer_id` 부여 →
  `shopify-proxy.service.ts#resolveIdentity`가 HMAC 검증 후 customer-bound 세션 발급 →
  `postMessage('ivy:session')`으로 iframe에 전달.
- "Sign in" 버튼은 `AuthGate.tsx` 안에만 존재하고, `AuthGate`는 `!authenticated`일 때만 렌더된다
  (`OrdersTab.tsx:53`, `ChatTab.tsx:92`). → **로그인이 인식되면 버튼은 자동으로 사라진다.**
- 주문내역은 `GET /orders`(세션 고객 기준)로 **로컬 캐시 `orders_cache`**에서 조회한다
  (`order.service.ts#listForSession`).

스테이징 실측 (2026-08-03):

- 배포된 `https://shoptalk.amoeba.site/widget/embed.js`에 팝업 로그인 흐름 포함 확인(`openLoginPopup`, `ivy:identity`).
- API 로그: `GET /api/v1/shopify/proxy/identity → 200` 다수 (14:38~14:46).
- DB: 오늘 로그인으로 생성된 고객 행 존재 — `customers` id 6 (`shopify_customer_id=7821303414864`, 13:14 생성),
  `orders_cache`에 주문 1건 바인딩. → **핸드셰이크는 실제로 인증에 성공하고 있다.**

"로그인했는데 버튼이 안 사라진다"는 관찰의 유력 원인:

| # | 원인 후보 | 근거 |
|---|---|---|
| A | 오늘 낮까지 위젯 번들 빌드 회귀(스테일 번들)가 있었음 — PR #72로 수정, 위젯/API 컨테이너는 오늘 재기동됨. 그 이전 테스트라면 구버전 동작을 본 것 | 컨테이너 STATUS "Up 48 minutes", 메모리 기록(위젯 빌드 회귀 8/3 수정) |
| B | 팝업 로그인 완료 후 팝업이 storefront가 아닌 shopify.com 계정 페이지에 남음 → `embed.js`의 popup-done 신호가 발화하지 않고, 팝업을 **수동으로 닫아야** closed-poll이 identity를 재확인함 | `embed.js` popup 복귀 로직은 팝업 최종 페이지가 storefront여야 자기 종료함. New Customer Accounts는 로그인 후 shopify.com 계정 페이지에 머물 수 있음 |
| C | 페이지 새로고침 없이 같은 페이지에서 기대 — identity는 페이지 로드 시 1회 확인이므로, 다른 경로로 로그인했다면 다음 페이지 이동/새로고침에서 반영됨 | `embed.js` 로드 시 1회 fetch 구조 |

### 2.3 요구 1 잔여 갭 — 주문내역 데이터 소싱

- `orders_cache`는 **웹훅(orders/create·updated, fulfillments) + 수동/스케줄 sync**로 채워진다.
  웹훅 4/4 등록 완료(8/3) → **웹훅 등록 이후 주문은 실시간 반영**.
- 그러나 **로그인 직후 그 고객의 과거 주문을 당겨오는 경로가 없다**:
  `resolveIdentity`는 프로필(`backfillProfile`)만 fire-and-forget 백필하고 주문은 하지 않음.
  스케줄 sync는 꺼져 있음(`SHOPIFY_SYNC_INTERVAL_MIN` 미설정 — 점검 체크리스트 C1 미결).
  → 과거 주문 보유 고객이 처음 로그인하면 "주문내역 없음"이 보일 수 있음. **보완 필요.**

### 2.4 요구 2 — Sign in 클릭 동작: **불일치, 변경 필요**

- 현재 main/스테이징: `ivy:login` 수신 시 `openLoginPopup()` — **480×720 window.open 팝업**으로
  `/customer_authentication/login` 오픈 (`embed.js:226-280`). 사용자가 "모달창"으로 인지한 것이 이 팝업.
- 요구: 팝업이 아니라 **최상위 페이지 이동**.
- 사용자가 제시한 `shopify.com/authentication/.../login?...` URL은 `analytics_trace_id`/`nonce`/`state` 등
  **세션마다 달라지는 일회성 파라미터**를 포함하므로 하드코딩 불가/불필요.
  스토어 상대경로 `/customer_authentication/login`(또는 `/account/login`)으로 최상위 이동하면
  Shopify가 정확히 그 호스티드 로그인 URL로 리다이렉트해 준다. → **loginPath는 유지, 열기 방식만 팝업→리다이렉트로 교체.**

## 3. TO-BE

1. 비로그인 + Sign in 클릭 → **현재 탭이 통째로** 스토어 로그인(`/customer_authentication/login?return_to=<현재 페이지>`)으로 이동
   → Shopify가 New Customer Accounts 호스티드 로그인으로 리다이렉트 → 로그인 완료 → 스토어 복귀
   → embed.js identity 핸드셰이크로 위젯 자동 인증 → **위젯 자동 재오픈(주문 탭)**.
2. 로그인 상태에서 위젯 오픈 → Sign in 버튼 없음(현행 유지) + 주문내역 표시.
   로그인 성립 시점에 **그 고객의 주문을 Admin API에서 즉시 백필**하여 과거 주문도 보이게 함.

## 4. 사용자 플로우 (TO-BE)

```
[비로그인 방문자]
  위젯 열기 → 주문 탭/주문 문의 → AuthGate
    ├─ "Sign in" 클릭 → (위젯) ivy:login → (embed.js) location.assign(로그인 URL)
    │     → shopify.com 호스티드 로그인 → 완료 → return_to로 스토어 복귀(페이지 리로드)
    │     → embed.js identity → authenticated → 위젯 자동 오픈(주문 탭) + 주문내역
    └─ "Guest lookup" → 주문번호+이메일 조회 (현행 유지)

[로그인 방문자]
  페이지 로드 → identity → authenticated → Sign in 버튼 미노출, 주문 탭 즉시 주문내역
  (로그인 성립 시 서버가 해당 고객 주문 백필 → 과거 주문 포함)
```

## 5. 제약/전제

- 스토어는 **New Customer Accounts** 사용(제시 URL로 확인). `return_to` 복귀 동작은 E2E로 반드시 검증
  (미지원 시 `/account` 랜딩 — 재방문 시 identity로 인증되므로 기능 요구는 충족, UX만 열화).
- Protected Customer Data 승인 완료(8/3), scopes `read_orders,read_customers,read_fulfillments` 부여 —
  주문 백필의 Admin GraphQL 호출 가능.
- 스키마 변경 없음(신규 테이블/컬럼 불요) — Migration 해당 없음.
- 구현 브랜치는 **origin/main 기준** (`feature/widget-login-redirect`).

## 6. 관련 문서/이력

- PR #56 (팝업 로그인, main), PR #65 (초기 리다이렉트 방식 — 이번 요구로 사실상 회귀·개선 재채택)
- `docs/bug-fix/FIX-Widget-SignIn-Sandbox-20260803.md` (iframe sandbox가 alert/직접 네비게이션 불가 → ivy:* 위임 패턴)
- `docs/bug-fix/FIX-Customer-Duplicate-ShopifyId-20260803.md` (주문-고객 이중 행 방지 — 주문 표시의 전제)
- 점검 체크리스트 C1 (스케줄 sync 미가동) — 본 건 Stage 2와 연계

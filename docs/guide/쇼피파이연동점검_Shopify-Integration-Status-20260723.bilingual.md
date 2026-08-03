# 쇼피파이 연동 점검 결과 & 할 일 리스트 (2026-07-23)
# Shopify Integration Status Check & To-Do List (2026-07-23)

- **점검 일시 / Checked at**: 2026-07-23 17:11 KST (08:11 UTC) — 실측 기반 / based on live probes
- **대상 / Scope**: `shoptalk.amoeba.site` (앱 shoptalk, client_id `6999d154…`) ↔ `ambshop-dev.myshopify.com`
- **점검 방법 / Method**: 관리 API 호출(test/sync/register-webhooks) + 서버 로그 + 저장 토큰으로 Shopify Admin GraphQL 직접 조회 (granted scopes, webhookSubscriptions)
- **관련 가이드 / Related guides**: `쇼피파이앱배포플레이북_Shopify-App-Deployment-Playbook.ko.md` · `쇼피파이PCD승인및웹훅등록가이드_Shopify-PCD-Webhooks.ko.md`

---

## 1. 정상 동작 확인 — Verified Working

| 항목 / Item | 증거 / Evidence |
|---|---|
| 만료형 토큰 **자동 리프레시 실증** / Expiring-token **auto-refresh proven** | 자격증명이 점검 당일 08:06(UTC)에 자동 갱신됨 — 예약 동기화가 만료 임박 토큰을 스스로 갱신한 첫 실측 사례 / Credential auto-rotated at 08:06 UTC when the scheduled sync hit a near-expiry token — first live proof of the refresh cycle |
| 연결 테스트 / Connectivity test | GraphQL `{ shop { name } }` → "Connected: ambshop-dev" |
| 주문 동기화 / Order sync | 온디맨드 + 30분 예약 동기화(`ScheduledShopifySyncService`) 정상 가동 (로그 07:06 / 07:36 / 08:06) / On-demand and 30-min scheduled sync both running (log entries at 07:06/07:36/08:06) |
| **위젯 + App Proxy 실가동** / **Widget + App Proxy live** | 스토어프런트발 `/apps/ivy/identity` → `GET /shopify/proxy/identity` 200 + `POST /session/ensure` 201 히트가 07-22~07-23 기록됨 → 테마 스니펫 설치·프록시 서명 검증 정상 / Storefront-originated proxy identity 200s and session ensures logged on Jul 22–23 → theme snippet installed and proxy signature verification working |
| GDPR 컴플라이언스 웹훅 / GDPR compliance webhooks | 앱 버전 shoptalk-5에 3종 URL 구성 완료, 무서명 요청 401 차단(fail-closed) / All three URLs configured in app version shoptalk-5; unsigned requests rejected with 401 (fail-closed) |
| 위젯 시작 401 노이즈 해결 / Widget startup 401 noise fixed | PR #18 배포 후 재발 없음 / No recurrence since PR #18 was deployed |

## 2. 미완 항목 — Outstanding (with live evidence)

| # | 미완 / Gap | 실측 근거 / Evidence |
|---|---|---|
| 1 | **PCD(보호 고객 데이터) 미승인** / PCD not approved | 점검 시각 웹훅 등록 재시도에서 `orders/create·updated` 2건이 403: *"This app is not approved to subscribe to webhook topics containing protected customer data"* |
| 2 | **재설치 미실행 → `read_fulfillments` 미부여** / Reinstall not done → scope not granted | 실제 부여 스코프 조회 결과 `read_orders, read_customers` **2개뿐** (shoptalk-5에는 3개 선언됨). `fulfillments/*` 구독 거부: *"You cannot create a webhook subscription with the specified topic"* |
| 3 | **스토어에 운영 웹훅 구독 0건** / Zero operational webhook subscriptions on the shop | GraphQL `webhookSubscriptions(first:20)` → 빈 목록 / empty list (①·②의 결과 / consequence of #1–2) |
| 4 | **개발 스토어에 테스트 데이터 없음** / No test data in the dev store | 주문 0건 동기화 지속 — 실시간 웹훅·위젯 주문조회 시나리오를 검증할 주문/상품 없음 / Sync keeps returning 0 orders — nothing to verify real-time webhooks or the widget "my orders" flow against |

> 운영 영향 없음 / No service impact: 30분 예약 동기화가 주문 갱신을 커버 중 — 미완 항목은 반영 지연(30분→실시간)과 검증 범위의 문제다.
> The 30-minute scheduled sync covers order updates; the gaps affect latency (30 min → real time) and verification coverage only.

---

## 3. 할 일 리스트 — To-Do List

### A. 필수: 실시간 웹훅 활성화 — Required: enable real-time webhooks
(가이드 / guide: `쇼피파이PCD승인및웹훅등록가이드_Shopify-PCD-Webhooks.ko.md`)

| # | 작업 / Task | 담당 / Owner | 참조 / Ref |
|---|---|---|---|
| A1 | **PCD 접근 신청** — `partners.shopify.com/4515502` → shoptalk → API access → Request access (앱 레벨 + Name/Email 필드, 사유·설문 저장) / **Request PCD access** in the legacy Partner Dashboard (app level + Name/Email fields, reasons & questionnaire) | 🧑 사용자(브라우저) / user (browser) | 가이드 §1 |
| A2 | **재설치** — `https://shoptalk.amoeba.site/api/v1/auth/shopify/install?shop=ambshop-dev.myshopify.com` 승인 화면에 스코프 **3개** 확인 후 Install / **Reinstall** — confirm all three scopes on the approval screen, then Install | 🧑 사용자(브라우저) / user (browser) | 가이드 §2 |
| A3 | **Register webhooks 재실행** → 기대: `registered 4 / failed 0` / Re-run webhook registration → expect `registered 4 / failed 0` | 🤖 Claude (서버) | 가이드 §3-1 |
| A4 | 403 지속 시 x-request-id 확보 → Shopify 파트너 지원 문의 / If 403 persists, capture x-request-id and contact partner support | 🧑+🤖 | 가이드 §4 |

### B. 검증 준비: 개발 스토어 데이터 — Verification prep: dev-store data

| # | 작업 / Task | 담당 / Owner |
|---|---|---|
| B1 | 테스트 **상품** 1–2개 등록 (Products → Add product) / Add 1–2 test products | 🧑 사용자 |
| B2 | 테스트 **주문** 생성 (Orders → Create order → 고객 지정 → Mark as paid) → A3 후 콘솔 Orders **실시간 반영** 확인 / Create a test order; after A3, confirm it appears on the console Orders page in real time | 🧑 생성 / 🤖 검증 |
| B3 | 주문 **Fulfill** → 상태 shipping(In Transit) 전이 확인 (`fulfillments/*` 검증) / Fulfill the order → confirm status transitions to shipping (validates `fulfillments/*`) | 🧑 생성 / 🤖 검증 |
| B4 | 스토어 **고객 계정 로그인** 후 위젯 "내 주문" 시나리오 확인 (App Proxy 인증 → 주문 카드) / Log in as a store customer and verify the widget "my orders" flow (App Proxy auth → order cards) | 🧑 사용자 |

### C. 후속·선택 — Follow-ups (optional)

| # | 작업 / Task |
|---|---|
| C1 | 웹훅 안정 확인 후 `SHOPIFY_SYNC_INTERVAL_MIN` 30 → 120 조정 (보정용 유지, 비활성화 금지) / After webhooks stabilize, raise the sync interval (keep as a safety net — never disable) |
| C2 | 완료 일자 `secrets/staging-server.md` 기록 / Record the completion date in `secrets/staging-server.md` |
| C3 | (장기) App Store 공개 등록 — `RPT-Shopify-App-Registration-Manual-20260720.md` §5–6 로드맵. GraphQL·만료형 토큰 코드는 그대로 재사용 / (Long-term) public App Store listing per the registration manual roadmap; the GraphQL and expiring-token code carries over as-is |

**진행 순서 / Suggested order**: A1 → A2 (사용자 브라우저 작업) → 완료 통보 → A3 + B2·B3 검증은 Claude가 서버에서 수행.
A1 → A2 in the user's browser, then hand off — Claude runs A3 and verifies B2·B3 from the server side.

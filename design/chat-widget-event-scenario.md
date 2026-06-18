---
document_id: CHATWIDGET-EVTSCN-2.0.0
version: 2.0.0
status: Draft
created: 2026-06-13
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-REQDEF-2.0.0 (Requirements Definition)
change_log:
  - version: 1.0.0
    date: 2026-06-13
    author: Project Team
    description: Initial event scenarios for IVY USA chat widget (Stage 2 design)
  - version: 2.0.0
    date: 2026-06-15
    author: Project Team
    description: Reconciled with Figma screens & Requirements Definition v2.0 — added S10~S17 (Notification Center, Orders panel/detail/tracking, Affiliate, Review, Restock/Subscription, Multi-channel support, Campaign dispatch, Admin monitoring/AI-assist); updated S1/S2/S6.
---

# IVY USA Chat & Support Widget — Event Scenario (IVY USA 채팅·상담 위젯 이벤트 시나리오)

Defines user actions and system responses at the event level. Each step references requirement IDs (FR/NFR) from `chat-widget-req-definition.md`. Screen references (화면 NN) point to `screens/`.
(사용자 행동과 시스템 반응을 이벤트 단위로 정의한다. 각 단계는 요구사항 정의서의 FR/NFR을, 화면은 `screens/`를 참조한다.)

**Actors (액터)**: Guest (비로그인), Member (로그인), System (Chat Orchestrator), RAG (RAG Service), Agent (Live Agent), Shopify (Order/Customer API), Fulfillment (배송 웹훅), Klaviyo (캠페인·세그먼트), Odoo (ERP), Notifier (Notification Dispatcher), CJM (CRM/CJM Engine), Operator/Admin (관리자)

---

## Scenario 1: First Access & Welcome (최초 접근 및 웰컴 — FR-001, FR-002, FR-028, NFR-009)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest | Opens storefront / clicks chat launcher | Widget loads async (no render block); mount Notification Center container | FR-001, FR-028, NFR-002 |
| 2 | System | Detect first access (no active session) | Create session; resolve UI language (store locale → EN/ES/KO) | FR-001, NFR-003 |
| 3 | System | Session start | Show CCPA notice + consent line; render auto welcome message | FR-002, NFR-004 |
| 4 | System | Chat tab shown | Display persistent AI disclosure ("This chat is AI-powered…") | NFR-009 |
| 5 | System | Welcome shown | Log session-start to CJM (Awareness/Browse) | FR-018, FR-026 |
| 6 | System | Present scenario menu | Buttons: 1.Delivery status 2.Cancel/Refund 3.Product Help 4.Contact Support 5.Affiliate | FR-003 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Widget assets fail to load | Retry once, then minimal "Contact us" fallback (link/email) |
| Consent declined | Restrict to non-personal FAQ; suppress PII logging; no order features |
| Returning session exists | Resume prior session context instead of new welcome |

---

## Scenario 2: Scenario-Button Guidance (시나리오 버튼 안내 — FR-003, FR-038)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest/Member | Taps a scenario button | Route to matching branch | FR-003 |
| 2 | System | Branch = Delivery status / Cancel-Refund | Requires order info → Auth Gate (S4) | FR-006 |
| 3 | System | Branch = Product Help | Show sub-menu: 제품 사용법 / 성분 문의 / 교환·반품 / 재입고 알림 / 처음으로 | FR-038 |
| 4 | System | Branch = Contact Support | Show multi-channel contact card (S15) | FR-039 |
| 5 | System | Branch = Affiliate | Enter affiliate flow (S12) | FR-035 |
| 6 | System | Log selection | Record button path to CJM + log store | FR-018, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| No matching branch | Fall through to natural-language RAG (S5) |

---

## Scenario 3: Guest Product Inquiry (비로그인 상품문의 — FR-005, FR-013)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest | Enters product question (PDP context auto-attached) | Capture product context (handle/ID) | FR-005 |
| 2 | System | Forward to RAG within learned scope | Knowledge Store (primary) → Google Drive (gap fill) | FR-020, FR-021 |
| 3 | RAG | Generates answer (EN base) | Serve in UI language per FR-027 [TBD]; cite source category | FR-013, FR-027 |
| 4 | System | Answer delivered | Log Q/A; update CJM (Inquiry) | FR-018, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Needs order/purchaser data | Trigger Auth Gate (S4) before answering | FR-006 |
| Out of learned scope | Escalate to agent (S7) | FR-014 |

---

## Scenario 4: Auth Gate (인증 게이트 — FR-006~FR-009)

Triggered whenever a request needs purchaser/order information.

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | System | Detect order/purchaser-info requirement | Present: Shopify account / Social / Guest order lookup | FR-006 |
| 2a | Member | Selects Shopify account login | Authenticate via Shopify Customer Account | FR-007 |
| 2b | Member | Selects social login | Authenticate via social (Shopify-linked) | FR-008 |
| 2c | Guest | Selects guest order lookup | Prompt order# + email; verify against Shopify | FR-009 |
| 3 | Shopify | Returns auth/verification result | On success: bind session to customer/order scope | FR-010 |
| 4 | System | Auth success | Proceed to requested flow | FR-010, FR-012 |
| 5 | System | Log auth event | Update CJM identity link; never log raw credentials | FR-018, NFR-004 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Order#+email mismatch | Verification-failed message; limited retries; offer agent | FR-009 |
| Auth canceled | Return to menu; keep guest-allowed features | FR-006 |
| Consent not given | Block order features; explain requirement | NFR-004 |

---

## Scenario 5: Natural-Language RAG Answering (자연어 RAG 답변 — FR-013, FR-014)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest/Member | Types free-text question | Detect intent; check learned scope | FR-013 |
| 2 | System | In scope | Query RAG: Knowledge Store → Google Drive supplement | FR-020, FR-021 |
| 3 | RAG | Generates grounded answer (EN base) | Serve in UI language per FR-027 [TBD]; cite source | FR-013, FR-027 |
| 4 | System | Confidence below threshold OR out of scope | Immediate escalation to agent | FR-014 |
| 5 | System | Answer/handoff complete | Log full Q/A + retrieval trace (re-training input) | FR-018, FR-019 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| RAG timeout (NFR-001 exceeded) | Apologize + offer agent escalation | NFR-001, FR-014 |
| Needs order data | Route through Auth Gate first | FR-006 |

---

## Scenario 6: Order Status & Delivery / Cancel-Refund (주문상태·배송·취소환불 — FR-010~FR-012, FR-031)

Precondition: session authenticated via S4.

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Member | Requests order status | Fetch Shopify Order/Fulfillment; map to UI status (Confirmed/In Transit/Delivered/Review) | FR-010, NFR-010 |
| 2 | System | Status resolved | Show status + visual delivery stepper (발송준비→배송시작→배송중→배송완료) + Track CTA | FR-011, FR-031 |
| 3 | Member | Requests cancel/refund guidance | Present policy-driven guidance (KB policy docs) | FR-012, FR-020 |
| 4 | Fulfillment | Fulfillment status change (webhook) | Notifier dispatches status-change alert (channels per admin/user) | FR-043, FR-024, NFR-006 |
| 5 | System | Interaction complete | Update CJM (Purchase/Delivery/Post); log | FR-018, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Order not found | Not-found message; offer agent | FR-014 |
| Cancel/refund beyond policy | Explain policy; route to agent | FR-012, FR-015 |
| Shopify/Fulfillment API error | Retry with backoff; if persistent, escalate | NFR-006 |

---

## Scenario 7: Human-Agent Escalation & Handoff (상담원 에스컬레이션·핸드오프 — FR-014~FR-017, FR-045)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | System/User | Trigger: out-of-scope / user request / branch | Mark conversation for escalation | FR-014, FR-015 |
| 2 | System | Assemble handoff context | Bundle transcript + auth/order context + language | FR-016 |
| 3 | System | Route to agent console | Deliver to self-built console (AmoebaTalk depth [TBD]) | FR-017 |
| 4 | System | Generate AI briefing | Summary, customer info, intent, keywords, sentiment, recommended action | FR-045 |
| 5 | Agent | Accepts ("개입 중") | Sees full context + briefing; continues in user's UI language | FR-016, FR-045, NFR-003 |
| 6 | Agent | Resolves / ends ("종료") | Log transcript; update CJM; flag for curation | FR-018, FR-019, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| No agent available | Queue + wait/offline message; capture callback (email) | FR-017, FR-039 |
| Agent transfers back to AI | Resume RAG with preserved context | FR-013, FR-016 |

---

## Scenario 8: Notification Dispatch (알림 발송 — FR-023, FR-024, FR-043, NFR-005)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Shopify/Fulfillment | Order/fulfillment status change (webhook) | Notifier evaluates event→channel mapping (admin) | NFR-006, FR-043 |
| 2 | System | In-app channel (always on) | Push in-widget notification + unread badge | FR-023, FR-028 |
| 3 | System | Email / SMS / Web Push enabled | Dispatch via configured channels honoring user prefs | FR-024, FR-049 |
| 4 | System | Web Push path | Deliver via Service Worker (PWA); fallback if unsupported | NFR-005 |
| 5 | System | Dispatch complete | Log notification event; update CJM | FR-018, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Channel disabled by admin/user | Skip that channel silently | FR-024, FR-049 |
| Web Push unsupported/denied | Fallback to in-app + (if enabled) email | NFR-005 |
| User opted out (CCPA) | Suppress external channels | NFR-004 |

---

## Scenario 9: Conversation Logging & Re-training Input (대화 기록·재학습 — FR-018, FR-019)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | System | Any message/event occurs | Persist to Conversation Log Store (session, turns, retrieval trace) | FR-018, NFR-007 |
| 2 | System | Session ends | Mark record curatable | FR-019 |
| 3 | Operator | Phase 1: manual review/export | Curate Q/A → feed Knowledge Store | FR-019, FR-022 |
| 4 | System | Phase 2 (out of MVP) | Automated pattern analysis → scenario/KB auto-update | FR-004, FR-019 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| User requests data deletion (CCPA) | Remove/anonymize per retention policy | NFR-004 |
| Logging failure | Buffer + retry; alert admin if persistent | NFR-007 |

---

## Scenario 10: Notification Center Browsing (알림센터 탐색·필터·읽음 — FR-028, FR-029, FR-049, NFR-011)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest/Member | Opens widget | Show Notification Center: tabs Notifications / Chat / Orders + unread badges | FR-028 |
| 2 | User | Selects Notifications tab | Render persistent list grouped by date (오늘/어제/N월 전) | FR-029 |
| 3 | User | Applies filter (전체/결제/배송/이벤트/리뷰) | Filter list; keep unread dots & status badges | FR-029 |
| 4 | User | Opens a notification | Mark as read; decrement unread count; route to detail (order/review/event) | FR-029, NFR-011 |
| 5 | User | Taps settings (⚙) | Open notification preference center (channel/category opt-in) | FR-049 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Empty filter result | Show empty-state message |
| Personal item while guest | Require Auth Gate (S4) before opening | FR-006 |

---

## Scenario 11: Orders Panel, Detail & Tracking (주문 패널·상세·배송추적 — FR-030~FR-033)

Precondition: authenticated (S4) for personal order data.

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Member | Selects Orders tab | Show sub-tabs: 결제내역 / 배송현황 / 문의하기 | FR-030 |
| 2 | Member | Views 결제내역 / 배송현황 | List orders (order#, product, amount, date, status badge) | FR-030 |
| 3 | Member | Selects an order | Open order detail (line items/options, discount, totals, addresses) | FR-032 |
| 4 | Member | Taps 배송현황 / Track | Show visual delivery stepper + tracking | FR-031 |
| 5 | Member | Taps 문의하기 (from order/detail) | Open chat with order context attached; record inquiry | FR-032, FR-033, FR-016 |
| 6 | Member | Opens 문의하기 sub-tab | List past inquiries with answered/unanswered badge | FR-033 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Order not found / mismatch | Not-found message; offer agent | FR-014 |
| Unauthenticated access | Route to Auth Gate (S4) | FR-006 |

---

## Scenario 12: Affiliate Application (제휴 신청 — FR-035)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest/Member | Selects Affiliate / asks "How to become an Affiliate?" | Explain program: 신청서 제출 → 심사(1–3 영업일) → 활동 & 수익(전용 링크, 판매 10% 적립) | FR-035 |
| 2 | System | Show CTAs | 지금 신청하기 / 더 알아보기 / 처음으로 / 종료 | FR-035 |
| 3 | User | Taps 지금 신청하기 | Present application form; capture submission | FR-035 |
| 4 | System | Application received | Create application record; notify review pending; log CJM | FR-018, FR-026 |
| 5 | Operator | Reviews application | Approve/reject; result by email; on approve issue affiliate link | FR-035 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Settlement/owner undecided | Mark [TBD] (A-10); capture application only |
| Duplicate application | Show existing status |

---

## Scenario 13: Review Request & Writing (리뷰 요청·작성 — FR-034)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | System | Order delivered + N days elapsed (admin trigger) | Generate "리뷰 요청" notification (리뷰 filter) | FR-034, FR-024 |
| 2 | Member | Opens notification / taps 리뷰 쓰기 | Open review-writing entry for the order item | FR-034 |
| 3 | Member | Submits review (rating + text) | Save review record; mark order Review state done | FR-034 |
| 4 | System | Review complete | Update CJM (Post stage); log | FR-018, FR-026 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| User opted out (CCPA) | Suppress review-request external channels | NFR-004 |
| Review storage target [TBD] | Persist internally pending A-9 decision |

---

## Scenario 14: Restock Alert & Subscription (재입고 알림·구독 관리 — FR-036, FR-037)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Guest/Member | Product Help → 재입고 알림 (out-of-stock item) | Capture product + notification preference; create restock subscription | FR-036 |
| 2 | Odoo/Shopify | Inventory restock event | Notifier dispatches restock alert to subscribers (enabled channels) | FR-036, FR-042 |
| 3 | Member | Asks "manage my subscriptions" | Require auth (S4); show subscription status/guidance (view/cancel/change) | FR-037, FR-006 |
| 4 | System | Subscriber-segment benefit | Dispatch member-only coupon notification (이벤트 filter) | FR-037, FR-040 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Inventory source scope [TBD] | Use available source pending A-7 |
| User opted out | Suppress external channels | NFR-004 |

---

## Scenario 15: Multi-Channel Contact Support (멀티채널 고객센터 — FR-039)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | User | Selects Contact Support | Show card: 전화 상담(번호·영업시간), 이메일 문의(주소·회신 SLA), 채팅 상담(지금 바로 연결) | FR-039 |
| 2 | User | Taps 채팅 상담 "지금 바로 연결" | Trigger live-agent escalation (S7) | FR-017 |
| 3 | User | Taps 처음으로 | Return to scenario menu | FR-003 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Outside business hours | Show offline message + email callback capture | FR-017 |
| No agent available | Queue + wait message | FR-017 |

---

## Scenario 16: Event/Coupon Campaign Dispatch (이벤트·쿠폰 캠페인 발송 — FR-040, FR-041)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Operator | Opens Event Setting / Campaign Recipes | Build campaign from template (content + offer) | FR-040 |
| 2 | Operator | Selects target segment | Pull segment from Klaviyo | FR-040, FR-041 |
| 3 | Operator | Sends (manual) | Notifier dispatches to targeted, opted-in users (in-app + enabled channels) | FR-040, FR-024, FR-049 |
| 4 | Member | Receives event notification | Appears under 이벤트 filter (e.g., BOGO, coupon) | FR-029 |
| 5 | System | Dispatch complete | Log campaign result; update CJM | FR-018, FR-044 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| User opted out / not in segment | Skip silently | FR-049, NFR-004 |
| Klaviyo unavailable | Defer/queue; alert admin | NFR-006 |

---

## Scenario 17: Admin Monitoring & AI-Assist (관리자 모니터링·AI 보조 — FR-044, FR-045)

| Seq | Actor | Event | System Response | Ref |
|-----|-------|-------|-----------------|-----|
| 1 | Admin | Opens Overview dashboard | Show KPIs: 활성 채팅 세션, 오늘 발송 알림(성공/실패), AI 해결률, 플랫폼 연동 상태 | FR-044 |
| 2 | System | Compute analytics | AI 처리현황(총 대화·자동해결·인계·시간대별), 미해결 패턴 Top N, 인기 질문 | FR-044, FR-004 |
| 3 | Admin | Opens 실시간 채팅 | Session list (상담사 연결/AI 응답 중/대기/종료) + AI 상황 브리핑 | FR-017, FR-045 |
| 4 | Admin | Opens 상담 이력 | Search/view past conversations; export for curation | FR-046, FR-019 |
| 5 | Admin | Opens AI Setting / 고객·상품 관리 | Configure bot/rules/knowledge/scenario; manage customers/products | FR-047, FR-048 |

### Exception (예외)
| Condition | System Response |
|-----------|-----------------|
| Integration disconnected | Show 연결 상태 alert (Shopify/Klaviyo/Odoo/Fulfillment) | FR-041, FR-042, FR-043 |
| Analytics source delay | Show last-synced timestamp | NFR-011 |

---

## Cross-Scenario Notes (공통 참고)
- Auth Gate (S4) is a shared sub-flow invoked by S2, S3, S5, S6, S10, S11, S14 whenever order/purchaser data is needed (FR-006).
- Notification Center (S10) is the container hosting Chat (S1~S7), Notifications (S8/S13/S16), and Orders (S11) — FR-028.
- Every scenario emits a CJM event so the journey (Awareness → Browse → Inquiry → Purchase → Delivery → Post) stays continuous (FR-026).
- RAG answer-language (FR-027), AmoebaTalk depth (FR-017), and integration scopes (A-7~A-12) remain [TBD].

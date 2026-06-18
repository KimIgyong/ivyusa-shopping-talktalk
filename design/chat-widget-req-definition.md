---
document_id: CHATWIDGET-REQDEF-2.0.0
base_documents:
  - CHATWIDGET-REQ-1.0.0 (Requirements Analysis)
  - CHATWIDGET-REQ-ADDENDUM-1.1.0 (Screen Gap Addendum)
  - CHATWIDGET-EVTSCN-1.0.0 (Event Scenario)
version: 2.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
source: chat-widget-requirements.md + screens/ (Figma export, 71 frames — TalkTalk)
change_log:
  - version: 2.0.0
    date: 2026-06-15
    author: Project Team
    description: Requirements Definition rewritten by reconciling the Requirements Analysis with the Figma design screens; consolidates FR-001~050 / NFR-001~011 at definition detail (input/output/business rules/acceptance).
---

# IVY USA Chat & Support Widget — Requirements Definition (IVY USA 채팅·상담 위젯 요구사항 정의서)

## 0. About This Document (문서 개요)

This document refines every requirement from the Requirements Analysis (CHATWIDGET-REQ-1.0.0) into definition-level detail (description, input, output, business rules, acceptance criteria), and **reconciles them against the Figma design screens** (`screens/`). Requirements newly discovered from the screens (FR-028~FR-050, NFR-009~NFR-011) are merged inline.
(본 정의서는 요구사항 분석서의 각 요구사항을 입력/출력/비즈니스 룰/인수 조건 수준으로 상세화하고, 피그마 설계 화면과 대조하여 정합화한다. 화면에서 신규 도출된 요구사항을 본문에 통합한다.)

- **Deployment**: Custom app for ivyusa.com (single store), **designed multi-tenant-ready** (`tenant_id` throughout) for future multi-store SaaS — see CHATWIDGET-MULTITENANCY & CHATWIDGET-RBAC.
- **Actors/RBAC**: 3 groups — System Admin (Super Admin/Admin), Tenant User (**Master/Director/Manager/Staff** × job labels Consult/Accounting/Operations; **Master = tenant settings owner**: external integrations, user invite, rank adjust, label edit, tenant AI settings), Customer (Guest/Subscriber/Regular→Shopify tier). Detailed in domain P and CHATWIDGET-RBAC.
- **Frontend (widget)**: React (customer-facing widget) — per Amoeba convention
- **Frontend (admin)**: React (new service — "IVY TalkTalk" Admin Dashboard; system-admin console + tenant admin)
- **Backend**: Next.js (Node.js) · **DB**: MySQL · **Queue**: RabbitMQ · **Cache/Session**: Redis
- **External**: Shopify (REST API + Webhook), Fulfillment (Webhook), Klaviyo (Campaigns/Segments), Odoo (JSON-RPC), Google Drive (KB sync), AmoebaTalk (escalation backend [TBD])

### Requirement Domains (요구사항 도메인)

| Domain | IDs |
|--------|-----|
| A. Widget Foundation & Session | FR-001, FR-002, FR-028, FR-050 |
| B. Scenario & Navigation | FR-003, FR-004, FR-038 |
| C. Authentication Gate | FR-006, FR-007, FR-008, FR-009 |
| D. Product Inquiry & RAG | FR-005, FR-013, FR-014, FR-020, FR-021, FR-022, FR-027, FR-036, FR-037 |
| E. Order, Delivery, Order Panel | FR-010, FR-011, FR-012, FR-030, FR-031, FR-032, FR-033 |
| F. Reviews | FR-034 |
| G. Affiliate Program | FR-035 |
| H. Support & Human Escalation | FR-015, FR-016, FR-017, FR-039, FR-045 |
| I. Notifications | FR-023, FR-024, FR-029, FR-040, FR-049 |
| J. External Integrations | FR-041, FR-042, FR-043 |
| K. Admin Console | FR-025, FR-044, FR-046, FR-047, FR-048 |
| L. Logging, CJM, Re-training | FR-018, FR-019, FR-026 |
| P. Tenancy, Actors & Access Control | FR-051 ~ FR-061 (see CHATWIDGET-RBAC) |
| Q. Bootstrap & Knowledge Source | FR-062 ~ FR-065 (see CHATWIDGET-BOOTSTRAP, CHATWIDGET-KSOURCE) |
| R. Agent Mgmt & Response Moderation | FR-066 ~ FR-069 (see CHATWIDGET-AGENTMOD) |
| S. AI Engine Management | FR-070 (pluggable multi-engine + admin selection) |
| M. Non-Functional | NFR-001 ~ NFR-012 |

### Priority Legend
P0 = MVP-critical · P1 = important (MVP or fast-follow) · P2 = phase 2

---

## A. Widget Foundation & Session (위젯 기반·세션)

### FR-001: Embed Chat/Support Widget in Shopify Storefront (Shopify 위젯 임베드)
- **Description (설명)**: Embed the widget on the Shopify storefront; render UI in EN/ES/KO resolved from store locale. Anchored top-right panel (화면 08).
- **Input (입력)**: Storefront page load; store locale; existing session token (if any).
- **Output (출력)**: Mounted widget launcher/panel; resolved UI language; session created or resumed.
- **Business Rules (비즈니스 룰)**: Async load, never block storefront render (NFR-002). Language resolution (North America): Shopify/browser locale → **en / es (es-US, es-MX) / ko**; **English default**, Spanish first-class for NA customers, KO for internal/admin. Customer can switch language in widget.
- **Acceptance (인수 조건)**: Widget renders on all storefront pages without blocking; UI strings appear in resolved language; one active session per visitor.
- **Priority**: P0 · **Related**: FR-002, FR-028, NFR-002, NFR-003

### FR-002: Auto Welcome & Session Start (자동 웰컴·세션 시작)
- **Description**: On first access, start a session and show the welcome message ("안녕하세요! IVY Beauty입니다. 무엇을 도와드릴까요?") with CCPA notice/consent (화면 53, 14).
- **Input**: First access without active session; consent state.
- **Output**: New session; CCPA notice + consent line; welcome message; scenario menu (FR-003).
- **Business Rules**: If a prior session exists → resume context instead of new welcome. If consent declined → non-personal FAQ only, suppress PII logging.
- **Acceptance**: First-time user sees CCPA notice + welcome + menu; returning user resumes prior context; declined-consent disables order features.
- **Priority**: P0 · **Related**: FR-001, FR-003, FR-028, NFR-004

### FR-028: Unified Notification Center Container (알림센터 통합 위젯) — *new (screens)*
- **Description**: The widget is a "알림센터(Notification Center)" with top tabs **Notifications / Chat / Orders**, per-tab unread badges, and a settings gear (⚙). One panel switches between alerts, chat, and orders (화면 01, 08, 12, 14, 34, 53).
- **Input**: Tab selection; unread counts; logged-in/guest state.
- **Output**: Active tab content; unread badge counts per tab; settings entry (→ FR-049).
- **Business Rules**: Chat tab shows AI disclosure (NFR-009). Orders tab requires auth for personal data (FR-006). Unread counts reflect unread notifications/messages in real time (NFR-011).
- **Acceptance**: User can switch Notifications/Chat/Orders; badges show correct unread counts; gear opens notification settings.
- **Priority**: P0 · **Related**: FR-029, FR-030, FR-049, NFR-009, NFR-011

### FR-050: Logged-in Personalization Header (로그인 사용자 개인화 헤더) — *new (screens)*
- **Description**: When authenticated, storefront/widget header shows "Hi, {name}", profile, cart badge, and notification bell badge (화면 01, 11).
- **Input**: Authenticated customer profile; cart count; unread notification count.
- **Output**: Personalized greeting and badges.
- **Business Rules**: Guests see generic state, no PII. Counts update on relevant events.
- **Acceptance**: Logged-in user sees name + accurate cart/notification badges; guest sees no personalized data.
- **Priority**: P1 · **Related**: FR-028, FR-006

---

## B. Scenario & Navigation (시나리오·내비게이션)

### FR-003: Scenario-Based Guidance Buttons (버튼형 시나리오 안내)
- **Description**: Present a button menu after welcome. Menu set (reconciled with screens): **Delivery status, Cancel/Refund, Product inquiry/Help, Talk to agent (Contact Support), Affiliate** + quick FAQ chips (화면 12, 57, 60).
- **Input**: User taps a scenario button or FAQ chip.
- **Output**: Route to the matching branch (auth gate, product help, support, affiliate, order lookup).
- **Business Rules**: Delivery/Cancel-Refund require order info → Auth Gate (FR-006). Product inquiry allowed for guests (FR-005). No matching branch → fall through to RAG (FR-013).
- **Acceptance**: Each button routes correctly; selection is logged to CJM (FR-026); affiliate and product-help sub-menu present.
- **Priority**: P0 · **Related**: FR-005, FR-006, FR-013, FR-035, FR-038

### FR-004: Scenario Refinement from User Patterns (사용자 패턴 기반 시나리오 고도화)
- **Description**: Phase-2 refinement of scenario buttons/branches from accumulated conversation patterns and unresolved-pattern analytics (화면 19 "미해결 패턴 Top 3").
- **Input**: Conversation logs (FR-018); unresolved-pattern stats (FR-044).
- **Output**: Updated scenario set / KB suggestions.
- **Business Rules**: Phase-2 (out of MVP). Operator-reviewed before applying.
- **Acceptance**: Top unresolved patterns surfaced; operator can convert into new scenario/KB entry.
- **Priority**: P2 · **Related**: FR-018, FR-019, FR-044

### FR-038: Structured Product Help Sub-Menu (제품 도움 구조화 서브메뉴) — *new (screens)*
- **Description**: "Product Help" branch shows sub-menu: 제품 사용법(usage) / 성분 문의(ingredients) / 교환·반품(exchange-return) / 재입고 알림(restock) / 처음으로 (화면 60).
- **Input**: User selects Product Help, then a sub-item.
- **Output**: Sub-item answer (RAG/KB) or routing (재입고 알림 → FR-036; 교환·반품 → FR-012 guidance).
- **Business Rules**: Usage/ingredient answers via RAG within learned scope (FR-013); exchange/return shows policy ("수령 후 7일 이내, 미개봉").
- **Acceptance**: Sub-menu renders; each item returns correct content or route; "처음으로" returns to main menu.
- **Priority**: P0 · **Related**: FR-003, FR-005, FR-012, FR-013, FR-036

---

## C. Authentication Gate (인증 게이트)

### FR-006: Auth Gate Trigger Rule (인증 게이트 트리거 규칙)
- **Description**: Any request needing purchaser/order info forces authentication. Present choices: Shopify account / Social / Guest order lookup (Scenario 4).
- **Input**: Request classified as requiring order/purchaser data.
- **Output**: Login choice UI; on success, session bound to customer/order scope.
- **Business Rules**: Guest-allowed features remain available if user cancels. No order features without consent (NFR-004).
- **Acceptance**: Order/cancel/refund/order-status flows always pass through gate; canceling returns to menu with guest features.
- **Priority**: P0 · **Related**: FR-007, FR-008, FR-009, FR-010

### FR-007: Shopify Account Login (Shopify 계정 로그인)
- **Description**: Authenticate via Shopify Customer Account.
- **Input**: User selects Shopify login; Shopify auth flow.
- **Output**: Authenticated session; customer scope bound.
- **Business Rules**: Never log raw credentials (NFR-004). Use Shopify Customer Account session/token.
- **Acceptance**: Successful login binds session to customer; failure returns clear error + retry.
- **Priority**: P0 · **Related**: FR-006, FR-010

### FR-008: Social Login (소셜 로그인)
- **Description**: Authenticate via social login linked to Shopify Customer Account.
- **Input**: User selects social provider; OAuth flow.
- **Output**: Authenticated session (Shopify-linked).
- **Business Rules**: Social identity must resolve to a Shopify customer; otherwise treat as guest.
- **Acceptance**: Social login resolves to Shopify customer and binds scope.
- **Priority**: P0 · **Related**: FR-006, FR-007

### FR-009: Guest Order Lookup (게스트 주문조회)
- **Description**: Verify by order number + email against Shopify, without full login.
- **Input**: Order number + email.
- **Output**: On match, order-scoped session (single-order scope).
- **Business Rules**: Limited retries on mismatch; offer agent after failures. Scope limited to the matched order.
- **Acceptance**: Correct order#+email grants order scope; mismatch shows verification-failed + retry/agent.
- **Priority**: P0 · **Related**: FR-006, FR-014

---

## D. Product Inquiry & RAG (상품문의·RAG)

### FR-005: Guest Product Inquiry & FAQ (비로그인 상품문의·FAQ)
- **Description**: Guests can ask product questions and general FAQ; product context auto-attached from PDP (handle/ID).
- **Input**: Guest question; product context (if from PDP).
- **Output**: RAG answer in UI language; Q/A logged.
- **Business Rules**: If the question needs order/purchaser data → Auth Gate (FR-006). Out of learned scope → escalate (FR-014).
- **Acceptance**: Guest receives product/FAQ answer without login; order-data questions trigger gate.
- **Priority**: P0 · **Related**: FR-006, FR-013, FR-038

### FR-013: Natural-Language RAG Answering (자연어 RAG 답변)
- **Description**: Answer free-text questions via RAG within learned scope; cite source category.
- **Input**: Free-text question; detected intent; learned-scope check.
- **Output**: Grounded answer (EN base) served in UI language (FR-027); source category.
- **Business Rules**: Knowledge Store primary → Google Drive supplement (FR-020/021). Confidence below threshold or out of scope → escalate (FR-014).
- **Acceptance**: In-scope question answered with citation; low-confidence escalates; full Q/A + retrieval trace logged.
- **Priority**: P0 · **Related**: FR-014, FR-020, FR-021, FR-027

### FR-014: Out-of-Scope / Low-Confidence Escalation (범위 이탈·저신뢰 에스컬레이션)
- **Description**: Immediately escalate to a human agent on out-of-scope or low-confidence answers, or RAG timeout.
- **Input**: Scope/confidence verdict; RAG latency (NFR-001).
- **Output**: Escalation trigger (Scenario 7); apology + agent offer.
- **Business Rules**: Timeout > NFR-001 target → offer agent. Preserve context for handoff (FR-016).
- **Acceptance**: Out-of-scope/low-confidence/timeout reliably routes to agent with context.
- **Priority**: P0 · **Related**: FR-013, FR-016, FR-017, NFR-001

### FR-020: RAG Knowledge Sources (RAG 지식원)
- **Description**: Knowledge sources = FAQ, product info, policy docs (return/exchange/warranty).
- **Input**: Curated knowledge content.
- **Output**: Retrievable, embedded knowledge for RAG.
- **Business Rules**: Warranty policy is category-specific (e.g., ELECTRONICS & HAIR Tools — 화면 12).
- **Acceptance**: RAG retrieves from FAQ/product/policy; category-specific policies resolvable.
- **Priority**: P0 · **Related**: FR-013, FR-021, FR-022

### FR-021: Knowledge Store Primary, Google Drive Secondary (Knowledge Store 주 / Google Drive 보조)
- **Description**: Knowledge Store is the primary source; Google Drive supplements gaps, synced.
- **Input**: Knowledge Store entries; synced Google Drive docs.
- **Output**: Retrieval result with Knowledge Store priority.
- **Business Rules**: On duplicate topics, Knowledge Store always wins; Google Drive fills gaps only (A-3 resolved).
- **Acceptance**: Duplicate-topic queries return Knowledge Store content; gaps fall back to Google Drive.
- **Priority**: P0 · **Related**: FR-020, FR-022

### FR-022: Continuous Knowledge Update (지식 지속 업데이트)
- **Description**: Operators add/edit knowledge → re-embedding; managed in admin (AI Setting → Knowledge, FR-047).
- **Input**: Operator KB edits/curation (from FR-019).
- **Output**: Updated embeddings/index.
- **Business Rules**: Curated Q/A from logs feeds KB (phase 1 manual).
- **Acceptance**: New/edited KB becomes retrievable after re-embedding.
- **Priority**: P0 · **Related**: FR-019, FR-020, FR-047

### FR-027: RAG Answer-Language Handling (RAG 답변 언어 처리)
- **Description**: Strategy for serving EN-base RAG answers in UI language: (A) generate EN → translate; (B) serve EN as-is.
- **Input**: EN answer; user UI language.
- **Output**: Answer in UI language per chosen strategy.
- **Business Rules**: **Spanish output is required for North America**, so RAG must serve ES (and KO) — recommend strategy (A) EN-generate → translate (A-1 [TBD] leaning A). EN passthrough-only (B) is insufficient for NA Spanish customers.
- **Acceptance**: Once decided, answers consistently follow the strategy across all RAG outputs.
- **Priority**: P1 · **Related**: FR-013, NFR-003

### FR-036: Restock / Back-in-Stock Alert (재입고 알림) — *new (screens)*
- **Description**: User requests a restock alert for an out-of-stock product (Product Help → 재입고 알림, 화면 60); system notifies on restock.
- **Input**: Product handle/ID; user contact/notification preference.
- **Output**: Restock subscription record; notification on restock event.
- **Business Rules**: Stock source = Odoo/Shopify inventory (FR-042/Shopify). Honor user notification settings (FR-049) and CCPA opt-out.
- **Acceptance**: User can subscribe to restock; on restock, a notification is dispatched via enabled channels.
- **Priority**: P1 · **Related**: FR-029, FR-042, FR-049

### FR-037: Subscription Management & Member Benefits (구독 관리·회원 혜택) — *new (screens)*
- **Description**: Guidance to view/cancel/change subscriptions ("How do I manage my subscriptions?"), plus subscription-member coupon/benefit notifications ("구독 회원만 오늘만 10% 추가 할인 쿠폰", 화면 12, 34).
- **Input**: Authenticated customer; subscription data (Shopify/Odoo); benefit campaign.
- **Output**: Subscription status/guidance; member-only coupon notification.
- **Business Rules**: Subscription change requires auth (FR-006). Member coupons target subscriber segment (FR-040/FR-041).
- **Acceptance**: Authenticated subscriber sees status/guidance; subscriber-segment receives member coupon notifications.
- **Priority**: P1 · **Related**: FR-006, FR-040, FR-041

---

## E. Order, Delivery & Order Panel (주문·배송·주문 패널)

### FR-010: Order Status (주문 상태)
- **Description**: For authenticated users, fetch Shopify Order/Fulfillment and map to status; UI labels = **Confirmed / In Transit / Delivered / Review** mapped from internal paid/preparing/shipping/delivered (NFR-010).
- **Input**: Authenticated session; order reference.
- **Output**: Order status + delivery info (FR-011).
- **Business Rules**: Order not found → not-found message + agent offer (FR-014). Status mapping per NFR-010 table.
- **Acceptance**: Status resolves and displays with correct label; missing order handled gracefully.
- **Priority**: P0 · **Related**: FR-006, FR-011, FR-043, NFR-010

### FR-011: Delivery Tracking Information (배송 추적 정보)
- **Description**: Provide delivery tracking details for the order (carrier/status/tracking).
- **Input**: Fulfillment data (Shopify/Fulfillment webhook, FR-043).
- **Output**: Tracking info; rendered as visual stepper (FR-031).
- **Business Rules**: Use latest fulfillment event; reflect In Transit/Delivered.
- **Acceptance**: Tracking shows current stage and tracking entry point.
- **Priority**: P0 · **Related**: FR-031, FR-043

### FR-031: Visual Delivery Tracking Stepper (시각적 배송 추적 스테퍼) — *new (screens)*
- **Description**: Render delivery progress as a 4-step stepper: 발송준비 → 배송시작 → 배송중 → 배송완료, with status message and 배송조회/Track Order CTA (화면 49).
- **Input**: Mapped fulfillment status.
- **Output**: Stepper with current step highlighted; status message; track CTA.
- **Business Rules**: Step state derived from fulfillment mapping (NFR-010). Completed shows "배송이 완료되었습니다"; in-transit shows encouraging message + Track.
- **Acceptance**: Stepper accurately reflects status; CTA opens tracking.
- **Priority**: P0 · **Related**: FR-011, FR-010, NFR-010

### FR-012: Cancel / Refund Guidance (취소·환불 안내)
- **Description**: Provide policy-driven cancel/refund guidance from KB policy docs.
- **Input**: Authenticated order context; cancel/refund request.
- **Output**: Policy-based guidance; route to agent if beyond policy window.
- **Business Rules**: Beyond policy window → explain policy + route to agent (FR-015). Within window → guided steps.
- **Acceptance**: Eligible requests get guidance; out-of-window cases routed to agent with explanation.
- **Priority**: P0 · **Related**: FR-006, FR-015, FR-020

### FR-030: In-Widget Orders Panel (위젯 내 주문 패널) — *new (screens)*
- **Description**: Orders tab with sub-tabs **결제내역(Payments) / 배송현황(Shipping) / 문의하기(Inquiries)**, listing order history (order#, product, amount, date, status badge) (화면 01).
- **Input**: Authenticated customer order history (Shopify).
- **Output**: Tabbed order lists; selecting an order opens detail (FR-032).
- **Business Rules**: Requires auth (FR-006). Inquiries sub-tab shows unanswered badge (FR-033).
- **Acceptance**: Each sub-tab lists correct records; order selection opens detail.
- **Priority**: P0 · **Related**: FR-006, FR-031, FR-032, FR-033

### FR-032: Order Detail View (주문 상세 화면) — *new (screens)*
- **Description**: Order detail with line items (image, option color/size), discount, subtotal, shipping, total, contact/billing/shipping address, and per-order "문의하기" entry (화면 10, 11).
- **Input**: Order ID; authenticated scope.
- **Output**: Full order detail; inquiry entry → chat with order context attached.
- **Business Rules**: Show only the authenticated customer's/looked-up order. "문의하기" pre-attaches order context to the chat.
- **Acceptance**: Detail matches Shopify order; inquiry opens chat with order context.
- **Priority**: P0 · **Related**: FR-030, FR-033, FR-016

### FR-033: My Inquiries History (내 문의 내역) — *new (screens)*
- **Description**: Orders → 문의하기 sub-tab lists the user's past inquiries and responses, with an unanswered badge (화면 01).
- **Input**: Authenticated customer; inquiry/conversation records (FR-018).
- **Output**: Inquiry list with status (answered/unanswered) and entry to continue.
- **Business Rules**: Unanswered count drives badge. Continuing an inquiry resumes its context.
- **Acceptance**: Past inquiries listed; unanswered badge accurate; user can resume a thread.
- **Priority**: P1 · **Related**: FR-018, FR-030, FR-016

---

## F. Reviews (리뷰)

### FR-034: Review Request & Writing (리뷰 요청·작성) — *new (screens)*
- **Description**: Auto-trigger a "리뷰 요청" notification N days after delivery (admin-configurable trigger, 화면 19/28), provide a "리뷰 쓰기" entry from notification/order, and show a Review status/filter (화면 57, 64).
- **Input**: Delivered order + N-day timer; review submission.
- **Output**: Review-request notification; review-writing entry; review record.
- **Business Rules**: Trigger day N is admin-configurable ([TBD] value, A-9). Review storage target Shopify vs internal [TBD] (A-9). Honor notification settings/CCPA.
- **Acceptance**: Delivered orders generate a review request at N days; user can open review writing; Review state reflected in orders/notifications.
- **Priority**: P1 · **Related**: FR-029, FR-040, FR-044

---

## G. Affiliate Program (제휴 프로그램)

### FR-035: Affiliate Program Flow (제휴 프로그램 플로우) — *new (screens)*
- **Description**: "How to become an Affiliate?" branch explains the program (신청서 제출 → 심사 1–3 영업일 → 활동 시작 & 수익: 전용 링크 공유 시 판매 10% 적립) with CTAs "지금 신청하기 / 더 알아보기 / 처음으로 / 종료" (화면 62, 65~69). Add as a scenario-menu item (FR-003).
- **Input**: User selects Affiliate; application form submission.
- **Output**: Program explanation; application record; review status; affiliate link on approval.
- **Business Rules**: Review 1–3 business days, result by email. Commission 10% on sales via personal link. Settlement owner (internal vs external SaaS) [TBD] (A-10).
- **Acceptance**: Affiliate info shown; "지금 신청하기" captures an application; status communicated; approved users get a link.
- **Priority**: P1 · **Related**: FR-003, FR-018, FR-026

---

## H. Support & Human Escalation (상담·핸드오프)

### FR-015: User-Initiated Agent Request (사용자 상담원 요청)
- **Description**: User can request a human agent directly ("Talk to agent" / Contact Support).
- **Input**: User escalation request.
- **Output**: Escalation trigger (Scenario 7); contact options (FR-039).
- **Business Rules**: Preserve conversation context for handoff (FR-016).
- **Acceptance**: User request reliably initiates escalation/contact.
- **Priority**: P0 · **Related**: FR-016, FR-017, FR-039

### FR-016: AI→Agent Handoff Context (핸드오프 컨텍스트 전달)
- **Description**: Bundle full transcript + auth/order context + language for the agent.
- **Input**: Conversation, auth/order scope, UI language.
- **Output**: Handoff package delivered to agent console.
- **Business Rules**: Agent continues in user's UI language (NFR-003). Agent may transfer back to AI with preserved context.
- **Acceptance**: Agent sees full context on accept; AI resumes with context on transfer-back.
- **Priority**: P0 · **Related**: FR-015, FR-017, FR-045

### FR-017: Self-Built Live-Agent Console (자체 상담원 콘솔)
- **Description**: Agent console (IVY TalkTalk Admin → 실시간 채팅) with session list (status: 상담사 연결 / AI 응답 중 / 대기 / 종료), conversation pane, and customer/order panel; "개입 중 / 종료" controls (화면 27, 28). AmoebaTalk integration depth [TBD] (A-2).
- **Input**: Active sessions; agent actions (accept/intervene/end).
- **Output**: Console UI; agent messages; session state changes.
- **Business Rules**: Agent takeover ("개입") pauses AI; "종료" closes session and logs.
- **Acceptance**: Agent can view/accept/intervene/end sessions; state transitions logged.
- **Priority**: P0 · **Related**: FR-016, FR-045, FR-046

### FR-039: Multi-Channel Contact-Support Card (멀티채널 고객센터 안내 카드) — *new (screens)*
- **Description**: "Contact Support" shows a card with 전화 상담(number + hours), 이메일 문의(email + reply SLA), 채팅 상담(지금 바로 연결) (화면 61).
- **Input**: User selects Contact Support; configured contact info/hours.
- **Output**: Contact options card; "지금 바로 연결" → live chat escalation (FR-017).
- **Business Rules**: Business hours and contacts are admin-configured. Outside hours, show offline/callback capture (email).
- **Acceptance**: Card shows correct phone/email/hours; live-chat connect routes to agent or queue.
- **Priority**: P0 · **Related**: FR-015, FR-017

### FR-045: AI Agent-Assist Briefing (AI 상담 보조 브리핑) — *new (screens)*
- **Description**: In the agent console, an "AI 상황 브리핑" panel shows 대화 요약, 고객 정보(총 주문·이전 문의), 의도 분석(배송 조회/환불 요청/재발송/불만 표출), 키워드 태그, 감정 온도(sentiment), 상담사 추천 액션 (화면 27, 28).
- **Input**: Conversation content; customer history; intent/sentiment analysis.
- **Output**: Summary, customer profile, intent breakdown, keyword tags, sentiment gauge, recommended action.
- **Business Rules**: Briefing updates as conversation evolves; recommended action references policy/KB.
- **Acceptance**: Agent sees accurate summary/intent/sentiment and at least one recommended action per active conversation.
- **Priority**: P1 · **Related**: FR-016, FR-017, FR-044

---

## I. Notifications (알림)

### FR-023: In-App Widget Notification (인앱 위젯 알림)
- **Description**: In-widget notifications, always on (default channel), shown in the Notifications tab.
- **Input**: Notifiable event (order/fulfillment/review/event).
- **Output**: In-widget notification entry + unread badge.
- **Business Rules**: Always on; cannot be disabled (transactional baseline).
- **Acceptance**: Events produce in-widget notifications and update unread counts.
- **Priority**: P0 · **Related**: FR-024, FR-029

### FR-024: Multi-Channel Notification (이메일/SMS/웹푸시)
- **Description**: Email / SMS / Web Push channels, admin-configurable per event (화면 19 알림 발송 현황).
- **Input**: Event→channel mapping (admin); user preferences (FR-049).
- **Output**: Dispatch via enabled channels.
- **Business Rules**: Web Push via Service Worker/PWA with fallback (NFR-005). Channel disabled by admin → skip silently. User opted out (CCPA) → suppress external channels.
- **Acceptance**: Enabled channels deliver; disabled/opt-out suppressed; web push falls back gracefully.
- **Priority**: P0 · **Related**: FR-029, FR-040, FR-043, FR-049, NFR-005

### FR-029: Persistent Notification Inbox & Filters (알림 인박스·필터) — *new (screens)*
- **Description**: Persistent notification list with category filters **전체 / 결제 / 배송 / 이벤트 / 리뷰**, date grouping (오늘/어제/N월 전), per-item read/unread (dot) and order status badge (화면 08, 34, 48, 49).
- **Input**: Stored notifications; selected filter; read actions.
- **Output**: Filtered, grouped list; read/unread state; unread counts (FR-028).
- **Business Rules**: Notifications persist across sessions (NFR-011). Opening marks as read; counts update.
- **Acceptance**: Filters and date grouping work; read state persists; unread badge consistent with list.
- **Priority**: P0 · **Related**: FR-023, FR-028, NFR-011

### FR-040: Event/Promotion Notifications & Campaign Targeting (이벤트·프로모션 알림·캠페인 타겟팅) — *new (screens)*
- **Description**: Marketing/event notifications (coupons, events e.g. "Buy one Get One 50% OFF", 화면 34) with manual dispatch to target segments; admin Event Setting + Campaign Recipes templates (화면 23, 70). Sourced via Klaviyo segments (FR-041).
- **Input**: Campaign content; target segment; schedule (manual).
- **Output**: Event notifications to targeted users (in-app + enabled channels).
- **Business Rules**: Manual send to target segment; honor user opt-out/CCPA. Recipes provide reusable templates.
- **Acceptance**: Operator builds/sends a targeted campaign; only opted-in targeted users receive it; appears under 이벤트 filter.
- **Priority**: P1 · **Related**: FR-024, FR-041, FR-044, FR-049

### FR-049: User Notification Preference Center (사용자 알림 설정) — *new (screens)*
- **Description**: Settings gear (⚙) opens user preferences for channel and category opt-in/out, linked to CCPA opt-out (화면 12, 14).
- **Input**: User toggles per channel/category.
- **Output**: Saved preferences applied to dispatch (FR-024).
- **Business Rules**: Transactional in-app (FR-023) always on; marketing channels honor opt-out. CCPA opt-out suppresses external channels.
- **Acceptance**: Preference changes take effect on subsequent dispatches; CCPA opt-out enforced.
- **Priority**: P0 · **Related**: FR-024, FR-040, NFR-004

---

## J. External Integrations (외부 연동)

### FR-041: Klaviyo Integration (Klaviyo 연동) — *new (screens)*
- **Description**: Integrate Klaviyo for marketing campaigns/segments; show connection status (화면 19, 21 "Klaviyo · Campaigns·Segments · 연결됨").
- **Input**: Klaviyo API credentials; segments/campaigns.
- **Output**: Segment data for targeting (FR-040); campaign dispatch source.
- **Business Rules**: Marketing vs transactional split with internal Notifier [TBD] (A-8).
- **Acceptance**: Klaviyo connection status shown; segments usable for campaign targeting.
- **Priority**: P1 · **Related**: FR-040, FR-044

### FR-042: Odoo Integration (Odoo ERP 연동) — *new (screens)*
- **Description**: Integrate Odoo ERP via JSON-RPC for back-office data (products/inventory, etc.); show connection status (화면 19, 21 "Odoo · JSON-RPC · 연결됨").
- **Input**: Odoo JSON-RPC credentials; product/inventory data.
- **Output**: Product/inventory data for restock (FR-036), product management (FR-048).
- **Business Rules**: Integration scope (inventory only vs order sync) [TBD] (A-7). Read vs write for management modules [TBD] (A-11).
- **Acceptance**: Odoo connection status shown; required entities retrievable.
- **Priority**: P1 · **Related**: FR-036, FR-048

### FR-043: Fulfillment Integration (Fulfillment 연동) — *new (screens)*
- **Description**: Receive shipping/fulfillment status (e.g., In Transit) via a dedicated Fulfillment webhook, mapped to order/delivery status (화면 19, 21 "Fulfillment · Webhook · 연결됨").
- **Input**: Fulfillment webhook events.
- **Output**: Mapped delivery status driving FR-010/FR-011/FR-031 and notifications (FR-024).
- **Business Rules**: Retry with backoff on failure (NFR-006); persistent failure → escalate/alert.
- **Acceptance**: Fulfillment events update status and trigger notifications reliably.
- **Priority**: P0 · **Related**: FR-010, FR-011, FR-031, NFR-006

---

## K. Admin Console (관리자 콘솔)

### FR-025: Admin Console Baseline (관리자 콘솔 기본)
- **Description**: Admin console ("IVY TalkTalk") covering notification settings, KB management, scenario management, i18n, and CCPA policy — expanded by FR-044/046/047/048.
- **Input**: Operator actions.
- **Output**: Configuration changes applied to widget/RAG/notifications.
- **Business Rules**: Role-based access for operators/admins.
- **Acceptance**: Operators can manage notifications, KB, scenarios, i18n, CCPA.
- **Priority**: P0 · **Related**: FR-044, FR-046, FR-047, FR-048

### FR-044: Admin Monitoring & Analytics Dashboard (관리자 모니터링·분석 대시보드) — *new (screens)*
- **Description**: Overview with KPIs — 활성 채팅 세션(대기/AI/상담사), 오늘 발송 알림(성공/실패), AI 해결률, 플랫폼 연동 상태 — plus AI 처리 현황(총 대화·자동해결·상담사 인계·시간대별), 미해결 패턴 Top N, AI Chat 인기 질문 (화면 19, 21, 18).
- **Input**: Live session data; notification dispatch results; conversation analytics; integration health.
- **Output**: KPI cards, charts, unresolved-pattern ranking, popular-questions list.
- **Business Rules**: Metrics computed from logs (FR-018) and dispatch records; near-real-time refresh.
- **Acceptance**: Dashboard shows accurate KPIs, hourly distribution, Top-N unresolved patterns, and popular questions.
- **Priority**: P0 · **Related**: FR-018, FR-024, FR-004

### FR-046: Conversation History Management (상담 이력 관리) — *new (screens)*
- **Description**: Admin module to search, filter, and view past conversations (화면 19 sidebar "상담 이력").
- **Input**: Stored conversations (FR-018); search/filter criteria.
- **Output**: Searchable conversation list and detail view; export for curation (FR-019).
- **Business Rules**: Access controlled; respects retention/CCPA (NFR-004, NFR-007).
- **Acceptance**: Operators can search and open past conversations and export for curation.
- **Priority**: P0 · **Related**: FR-018, FR-019, NFR-007

### FR-047: AI Setting / AI Chat Setting (AI 설정) — *new (screens)*
- **Description**: Configure bot persona, response rules, knowledge management, and scenario buttons (화면 25 sidebar: AI Setting → Bot/Rules/Knowledge; AI Chat Setting).
- **Input**: Operator config (persona, rules, KB entries, scenario chips).
- **Output**: Applied AI behavior, KB updates (FR-022), scenario set (FR-003).
- **Business Rules**: KB edits trigger re-embedding (FR-022). Scenario changes reflected in widget menu.
- **Acceptance**: Persona/rules/KB/scenario edits take effect in the widget/RAG.
- **Priority**: P0 · **Related**: FR-003, FR-022, FR-025

### FR-048: Customer & Product Management Modules (고객·상품 관리 모듈) — *new (screens)*
- **Description**: Admin modules for customer profiles (고객 관리) and product catalog/inventory (상품 관리) (화면 18, 25 sidebar).
- **Input**: Customer data (Shopify/CJM); product/inventory data (Odoo/Shopify).
- **Output**: Customer/product views (and edits if in scope).
- **Business Rules**: Read vs write scope [TBD] (A-11); source-of-truth is Shopify/Odoo.
- **Acceptance**: Operators can view customer/product records; edit scope per [TBD] decision.
- **Priority**: P1 · **Related**: FR-042, FR-026

---

## L. Logging, CJM & Re-training (기록·CJM·재학습)

### FR-018: Conversation Logging (대화 기록)
- **Description**: Persist **all messages/events including full agent↔customer transcripts and AI turns** (session, turns, sender_type, retrieval trace, moderation decision) to the Conversation Log Store; feed an **analytics dataset** for future analysis (FR-044/FR-068) and re-training (FR-019).
- **Input**: Any message/event (customer/agent/AI/system).
- **Output**: Persisted, exportable, analytics-ready log records.
- **Business Rules**: Agent conversations are **always logged** (no opt-out for staff). Buffer + retry on failure; alert admin if persistent (NFR-007). PII encrypted/masked; CCPA/GDPR deletion/anonymization on request (NFR-004, POL-002). Retention per POL-003.
- **Acceptance**: Every agent/AI/customer message persisted with metadata and available to analytics/curation; deletion requests honored.
- **Priority**: P0 · **Related**: FR-019, FR-026, FR-044, FR-046, FR-068, NFR-007

### FR-019: Re-training Curation (재학습 큐레이션)
- **Description**: Phase 1 manual review/export of curatable records → Knowledge Store updates; Phase 2 automated pattern analysis (out of MVP).
- **Input**: Session-ended, curatable log records.
- **Output**: Curated Q/A feeding KB (FR-022); phase-2 auto KB/scenario updates.
- **Business Rules**: Phase 1 manual; Phase 2 (FR-004) automated.
- **Acceptance**: Operator can curate and feed KB; phase-2 path defined for later.
- **Priority**: P1 · **Related**: FR-004, FR-022, FR-046

### FR-026: CRM with Customer Journey Map (CRM·CJM)
- **Description**: Emit CJM events per scenario to keep a continuous journey: Awareness → Browse → Inquiry → Purchase → Delivery → Post.
- **Input**: Scenario events (welcome, inquiry, auth, order, notification, escalation, review, affiliate).
- **Output**: CJM stage updates and identity links.
- **Business Rules**: Every scenario emits a CJM event; never log raw credentials (NFR-004).
- **Acceptance**: Journey stages update across all scenarios; identity links maintained.
- **Priority**: P0 · **Related**: FR-018, all customer-facing FRs

---

## P. Tenancy, Actors & Access Control (테넌시·액터·접근제어)

> Full role hierarchy, permission matrix, customer tiers, and ERD delta: **CHATWIDGET-RBAC-1.0.0**.

### FR-051: Custom-App, Multi-Tenant-Ready (커스텀앱·멀티테넌트 대응)
- **Description**: Deliver as a Custom app for ivyusa.com; data/permission/config designed multi-tenant-ready (`tenant_id` throughout) for later Public-app SaaS.
- **Input**: shop context; tenant record. **Output**: tenant-scoped data access everywhere.
- **Business Rules**: All tenant data tables carry `tenant_id`; app layer enforces tenant filter (NFR-008, NFR-012). Initial tenant = IVY USA.
- **Acceptance**: No query returns cross-tenant rows; switching to multi-tenant needs no schema break.
- **Priority**: P0 · **Related**: FR-052, NFR-008, NFR-012 · CHATWIDGET-MULTITENANCY.

### FR-052: Tenant Lifecycle (테넌트 신청·승인·프로비저닝)
- **Description**: System Admin handles tenant application → approval → provisioning → suspend/offboard.
- **Input**: tenant application; admin decision. **Output**: provisioned tenant (config/KB seed) or suspension/data removal.
- **Business Rules**: Offboarding removes tenant data (ties to shop/redact for public app). Approval/suspension audited (FR-061).
- **Acceptance**: Admin can create/suspend a tenant; provisioning seeds defaults; offboarding purges tenant data.
- **Priority**: P1 · **Related**: FR-053, FR-061.

### FR-053: System Admin Group — Super Admin / Admin (시스템 어드민)
- **Description**: Platform-level group managing all solution features, policies, and external-integration settings; 2 levels.
- **Input**: admin actions. **Output**: global config; tenant approvals; integration templates.
- **Business Rules**: Super Admin = full incl. admin-account mgmt and destructive ops (2-step confirm); Admin = manage/operate, no admin-account mgmt or destructive ops. Cross-tenant scope.
- **Acceptance**: Permission matrix (RBAC §3.1) enforced; Admin blocked from Super-Admin-only actions.
- **Priority**: P0 · **Related**: FR-059, FR-060, FR-061.

### FR-054: Tenant User Group — Master / Director / Manager / Staff (유저 직급, 4단계)
- **Description**: Tenant-internal staff with 4 ranks (authority levels). **Master** is the tenant settings owner.
- **Input**: user actions within tenant. **Output**: rank-scoped capabilities.
- **Business Rules**: **Master** = tenant settings (external integration API/credentials e.g. Shopify/Odoo, other settings), user add/invite, rank adjustment, label edit, tenant AI settings; Director = broad ops + AI settings, manage lower users (no integration creds/rank-adjust/label-edit); Manager = team ops/limited config; Staff = execute assigned work (RBAC §3.2). Tenant-scoped only.
- **Acceptance**: Each rank's capabilities match matrix; Master-only actions blocked for others; cross-tenant access denied.
- **Priority**: P0 · **Related**: FR-055, FR-056, FR-060.

### FR-055: Job Labels — Consult / Accounting / Operations (직무 라벨, 편집 가능)
- **Description**: Functional labels orthogonal to rank; multi-assign; **name editable / addable** by Director/Admin.
- **Input**: label assignment/edits. **Output**: functional scope per label.
- **Business Rules**: 상담=chat/escalation; 회계=payment/refund/finance; 운영=order/fulfillment/product/notification/review (RBAC §3.3). Effective access = rank ∩ label. **Label rename/add by Master**; label assignment by Master/Director.
- **Acceptance**: User with a label sees only that label's modules; renaming/adding a label (Master) works and applies.
- **Priority**: P0 · **Related**: FR-054, FR-056.

### FR-056: RBAC Enforcement (권한 적용)
- **Description**: Enforce rank × label permission matrix at menu/action/data level.
- **Input**: actor (group/rank/labels/tenant); requested resource/action. **Output**: allow/deny.
- **Business Rules**: Effective permission = rank matrix ∩ label matrix (POL-017); least privilege; deny by default.
- **Acceptance**: Unauthorized menu/action/data is hidden/blocked; isolation regression tests pass (NFR-012).
- **Priority**: P0 · **Related**: FR-053~055, NFR-012 · POL-017.

### FR-057: Customer Group & Shopify Tier Mapping (고객 그룹·등급 매핑)
- **Description**: Customer tiers — Guest / Subscriber (구독 이메일) / Regular → then Shopify internal customer tier as source of truth.
- **Input**: customer identity/subscription/Shopify tier. **Output**: tier-based feature/segment resolution.
- **Business Rules**: Personal features require Auth Gate (FR-006); subscriber benefits per FR-037; segments/benefits from Shopify tier (no duplicate definition).
- **Acceptance**: Tier resolves correctly; benefits/segments follow Shopify tier; guest limited to non-personal features.
- **Priority**: P0 · **Related**: FR-006, FR-037, FR-040, FR-058.

### FR-058: Widget Session States (위젯 로그인 상태)
- **Description**: Logged-out vs Logged-in states gate available widget features per customer group.
- **Input**: session auth state. **Output**: feature set (guest/subscriber vs full personal).
- **Business Rules**: Logged-out → non-personal FAQ/product inquiry + guest order lookup; Logged-in → full personal (orders/tracking/reviews/inquiries) + personalization (FR-050).
- **Acceptance**: Feature gating matches state; transition via login/guest-lookup works.
- **Priority**: P0 · **Related**: FR-002, FR-006, FR-050, FR-057.

### FR-059: Admin User Management (계정 관리)
- **Description**: System Admin creates/permissions/suspends admin and tenant-user accounts.
- **Input**: account ops. **Output**: accounts with rank/labels.
- **Business Rules**: Super Admin manages admins; Director manages tenant users (within tenant). All changes audited (FR-061).
- **Acceptance**: Account create/permission/suspend works per scope and is logged.
- **Priority**: P0 · **Related**: FR-053, FR-054, FR-061.

### FR-060: Tenant-Scoped Configuration Ownership (테넌트 설정 소유권 — Master)
- **Description**: Per-tenant feature on/off, policy values, external-integration API/credentials (Shopify/Odoo/Klaviyo/Fulfillment/GDrive), and tenant AI settings owned by **Master**.
- **Input**: tenant config edits; integration credentials (BYO). **Output**: applied tenant config.
- **Business Rules**: Master-only for integration credentials/critical settings; credentials encrypted (protected-data); changes audited; extends FR-047/FR-025.
- **Acceptance**: Integration credentials & tenant-critical settings editable only by Master, scoped to the tenant; lower ranks blocked.
- **Priority**: P0 · **Related**: FR-025, FR-047, FR-061.

### FR-061: Audit Log for Privileged Actions (권한 감사)
- **Description**: Record permission changes, config changes, tenant approvals, account ops.
- **Input**: privileged action events. **Output**: audit_logs records (actor/action/target/time).
- **Business Rules**: Immutable, queryable by admins; respects retention/CCPA (POL-003).
- **Acceptance**: Privileged actions produce audit entries; admins can review.
- **Priority**: P1 · **Related**: FR-052, FR-059, FR-060 · POL-003, POL-017.

---

## Q. Bootstrap & Knowledge Source (초기 세팅·지식 소스)

> Details: **CHATWIDGET-BOOTSTRAP-1.0.0**, **CHATWIDGET-KSOURCE-1.0.0**.

### FR-062: Bootstrap Seed (초기 시드 계정·테넌트)
- **Description**: Seed System Admin (admin@amoeba.group), Tenant Master owner (dev@amoeba.group), and tenant `ivyusa` at install.
- **Input**: install/seed script. **Output**: usable admin + master accounts + tenant.
- **Business Rules**: Passwords bcrypt-hashed (never plaintext); `must_change_password=1`; initial pw `amb2026!@` for both (dev/onboarding only, POL-018).
- **Acceptance**: Both accounts log in; tenant `ivyusa` exists; first login forces password change.
- **Priority**: P0 · **Related**: FR-053, FR-054, FR-063 · POL-018.

### FR-063: User Invitation & Temporary Password (유저 초대·임시비번)
- **Description**: Master registers a user by email → system emails a temporary password → invited user authenticates with temp pw on first login → forced change to own password.
- **Input**: email, rank, labels (Master). **Output**: invited user; temp pw email; active user after change.
- **Business Rules**: Temp pw expiry [TBD 72h]; one-time use; bcrypt hash; password complexity policy; `must_change_password` enforced.
- **Acceptance**: Invited user gets email, logs in with temp pw, is forced to set a new password, then active.
- **Priority**: P0 · **Related**: FR-059, FR-054 · POL-018, POL-001 · SCR-207.

### FR-064: Knowledge Source Management — 3 Modes (지식 소스 관리)
- **Description**: Master manages RAG knowledge via 3 source modes: **게시판(Board, with file upload) / 자료실(File Repository upload) / Google Drive 연동**, incl. upload and **content management (edit/delete)** and activation.
- **Input**: posts+attachments / files / drive folder. **Output**: knowledge_sources + kb_board_posts/kb_files + embedded kb_documents.
- **Business Rules**: Upload/sync → parse → chunk → re-embed (status shown); edit/delete → re-embed; source active/inactive + designated toggle (Master, FR-060).
- **Acceptance**: Master can create each source type, upload/sync content, edit/delete, and activate; content becomes retrievable.
- **Priority**: P0 · **Related**: FR-060, FR-020~022, FR-047 · SCR-105.

### FR-065: AI Knowledge Scoping (AI 참조 범위 한정)
- **Description**: RAG references **only designated, active Knowledge Sources** of the tenant; un-designated/inactive sources, other tenants, and arbitrary external sources are excluded.
- **Input**: query; tenant; designated active sources. **Output**: grounded answer limited to designated sources + source citation.
- **Business Rules**: Retrieval filter = `tenant_id && source.active && source.designated`; priority Knowledge Store → Google Drive (POL-013); tenant isolation (NFR-012).
- **Acceptance**: Answers cite only designated sources; non-designated/other-tenant content never surfaces.
- **Priority**: P0 · **Related**: FR-013, FR-064, FR-021 · POL-011, POL-013, NFR-012.

---

## R. Agent Management & Response Moderation (상담원 관리·응답 모더레이션)

> Details: **CHATWIDGET-AGENTMOD-1.0.0**.

### FR-066: Agent Registration & Profile (상담원 등록·프로필)
- **Description**: Agents = users with Consult label; profile = languages, skills/categories, max concurrent, status (online/away/offline). Master/Director register/manage.
- **Input**: agent profile data. **Output**: agent available for routing.
- **Business Rules**: Inactive/suspended excluded from routing; profile drives auto-routing (FR-067).
- **Acceptance**: Master/Director can register/edit agents; status & limits applied.
- **Priority**: P0 · **Related**: FR-054, FR-067 · SCR-208.

### FR-067: Assignment & Routing (배정·라우팅)
- **Description**: Auto-route new/escalated conversations by language/skill/load; manual assign/transfer/reclaim; queue + callback when none available.
- **Input**: conversation attributes; agent status/load; manager actions. **Output**: assignment record; agent notified.
- **Business Rules**: Respect max_concurrent; handoff (FN-034) creates assignment; transfers logged.
- **Acceptance**: Conversations routed/assigned correctly; over-limit blocked; transfers tracked.
- **Priority**: P0 · **Related**: FR-016, FR-017, FR-066 · SCR-209.

### FR-068: Consult Statistics (상담 통계)
- **Description**: Per-agent/team metrics — handled, avg first-response/handle time, resolution rate, escalation rate, CSAT, online time, moderation blocks.
- **Input**: conversations/messages/assignments/reviews. **Output**: stats dashboard + per-agent view.
- **Business Rules**: Staff sees own metrics; Manager+ sees team; tenant-scoped.
- **Acceptance**: Metrics computed and filterable by period; role-scoped visibility.
- **Priority**: P0 · **Related**: FR-044 · SCR-101.

### FR-069: Outbound Response Moderation (응답 모더레이션 필터)
- **Description**: Every **agent and AI** outbound message passes a mandatory moderation gate before delivery. Filters by **word/phrase/regex AND context (LLM/classifier)**; actions block/mask/warn/rephrase; per-tenant rules; multilingual; audited.
- **Input**: draft outbound message; tenant rules (scope agent/ai/both). **Output**: delivered (clean) message or blocked/edit-required (agent) / safe-fallback/escalate (AI).
- **Business Rules**: No bypass path (NFR-013); applies to FN-017 (AI) & FN-035 (agent); fail-safe = do not deliver on filter error; blocks audited (`moderation_logs`); PII masked in logs (POL-002).
- **Acceptance**: Banned-word and context-violating messages (even without banned words) are blocked for both agent and AI; clean messages pass; all blocks logged.
- **Priority**: P0 · **Related**: FR-013, FR-016, FR-017, NFR-013 · POL-020, POL-011, POL-002.

---

## S. AI Engine Management (AI 엔진 관리)

### FR-070: Pluggable Multi-Engine AI & Admin Selection (복수 AI 엔진·관리자 선택)
- **Description**: AI is **provider/model-agnostic via an AI Provider Gateway (adapter)** supporting **multiple engines** (e.g., Anthropic Claude, OpenAI, Google Gemini, Azure OpenAI, custom/self-hosted). The **AI engine is configurable from the admin management menu**: System Admin registers/enables engines (provider, model, endpoint, API key, capabilities, default); Tenant Master selects the engine **per function** (chat/RAG answer, summary, AI-assist, context moderation).
- **Input**: engine catalog (System Admin); per-function engine selection (Master); request.
- **Output**: AI calls routed to the selected engine via the gateway; consistent internal interface.
- **Business Rules**:
  - R1: Engine catalog & credentials managed by **System Admin** (platform); API keys encrypted (AES-256-GCM, POL-018).
  - R2: Tenant **Master** picks an enabled engine per function (FR-047/060); fallback to platform default if unset.
  - R3: Switching engines must not break flows — uniform adapter interface (prompts, streaming/SSE, tokens).
  - R4: Per-engine/per-tenant usage & token metrics tracked (observability); cost/limits configurable.
  - R5: Moderation/RAG scoping/privacy unchanged regardless of engine (POL-011/020, FR-065/069).
- **Acceptance**: Admin can register ≥2 engines and enable/disable; Master selects engine per function; AI calls route to the chosen engine; switching engine requires no code change; usage tracked per engine/tenant.
- **Priority**: P0 · **Related**: FR-013, FR-017, FR-045, FR-047, FR-069 · POL-011, POL-018 · SCR-203, SCR-105.

---

## M. Non-Functional Requirements (비기능 요구사항)

| ID | Requirement | Criteria |
|----|-------------|----------|
| NFR-001 | RAG answer latency (RAG 응답 지연) | Target < 3s typical; exceed → agent offer (FR-014) |
| NFR-002 | Widget load impact (위젯 로드 영향) | Async load, no blocking of storefront render |
| NFR-003 | i18n coverage (다국어 적용 — 북미 대상) | Customer-facing primary = **English + Spanish** (es-US/es-MX), KO for internal/admin (KR team). Welcome, scenario buttons, alerts, agent console, **Knowledge Source UI** = EN/ES/KO static; **RAG output also served in ES** per FR-027. Locale codes: `en`, `es`, `ko` (region variants es-US/es-MX). Default `en` when unresolved |
| NFR-004 | CCPA compliance (CCPA 준수) | Notice, opt-out, deletion/anonymization, retention policy; never log raw credentials |
| NFR-005 | Web Push delivery (웹푸시 전달) | Service Worker (PWA) based; graceful fallback if unsupported/denied |
| NFR-006 | Order/fulfillment data integrity (주문·배송 정합) | Shopify Webhook + dedicated Fulfillment Webhook (FR-043); retry with backoff |
| NFR-007 | Conversation log integrity (대화 기록 무결성) | All sessions persisted, exportable; buffer+retry on failure |
| NFR-008 | Multi-tenancy / isolation (멀티테넌시) | Per AmoebaTalk architecture (if integrated) |
| NFR-009 | AI disclosure (AI 응답 고지) — *new* | Persistent "This chat is AI-powered for faster assistance" in chat UI (화면 14) |
| NFR-010 | Order status taxonomy (주문 상태 용어 표준화) — *new* | Mapping table: UI (Confirmed/In Transit/Delivered/Review) ↔ internal (paid/preparing/shipping/delivered) |
| NFR-011 | Notification Center performance (알림센터 성능·정합) — *new* | Instant tab/filter/unread-count updates; notifications persisted & synced across sessions |
| NFR-012 | RBAC & tenant isolation (권한·테넌트 격리) — *new* | No cross-tenant/cross-role data leakage; least privilege; isolation regression tests mandatory (FR-051, FR-056) |
| NFR-013 | Response moderation reliability (응답 모더레이션 신뢰성) — *new* | Mandatory non-bypassable gate on all agent/AI outbound; added latency < 1s target; **fail-safe = block/hold on filter error (never deliver unfiltered)**; all blocks audited (FR-069) |

---

## N. Open Issues (미결 사항)

| # | Item | Status |
|---|------|--------|
| A-1 | RAG answer-language strategy (A vs B) | [TBD] — recommend (A) |
| A-2 | AmoebaTalk integration depth (backend vs agent UI) | [TBD] |
| A-3 | Knowledge Store vs Google Drive priority | Resolved — Knowledge Store wins |
| A-4 | Web Push depends on PWA timeline | Planned — sequencing dependency |
| A-5 | Notification event→channel mapping table | Define in Design |
| A-6 | CCPA retention period (logs) | With client legal |
| A-7 | Odoo integration scope (inventory vs order sync) | [TBD] |
| A-8 | Klaviyo vs internal Notifier role split (marketing vs transactional) | [TBD] |
| A-9 | Review trigger day N & review storage (Shopify vs internal) | [TBD] |
| A-10 | Affiliate commission settlement owner (internal vs SaaS) | [TBD] |
| A-11 | Customer/Product modules: read vs write on Shopify/Odoo | [TBD] |
| A-12 | Orders-tab vs chat "My Orders" data/permission consistency | [TBD] |

## O. Traceability (추적성)

FR → **Requirements Definition (this doc)** → Functional Spec (FN) → Sequence/ERD → WBS (T) → Test Case (TC). IDs kept consistent across all SDLC documents. Screen references (화면 NN) tie each requirement to the Figma export in `screens/`.

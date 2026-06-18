---
document_id: CHATWIDGET-FUNCDEF-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-REQDEF-2.0.0 (Requirements Definition)
  - CHATWIDGET-POLICY-1.0.0 (Policy Definition)
  - CHATWIDGET-EVTSCN-2.0.0 (Event Scenario)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Initial functional definition — modules + FN-001~048, each citing FR/POL and screen evidence
---

# IVY USA Chat & Support Widget — Functional Definition (기능 정의서)

Module/component-level function specs implementing the requirements. Each function (FN-NN) cites the requirement (FR/NFR) and the policy (POL) it enforces. Stack: React (widget/admin), Next.js backend, MySQL, RabbitMQ, Redis.
(요구사항을 구현하는 모듈/컴포넌트 단위 기능 명세. 각 기능은 연관 FR/NFR과 적용 POL을 명시한다.)

**Format**: Description · Pre / Post conditions · Logic · Input · Output · Errors · Related (FR/POL).

---

## Module 1: Widget Core & Notification Center (위젯 코어·알림센터, React)

### FN-001: Widget Bootstrap (위젯 부트스트랩)
- **Desc**: Async-mount the widget on the Shopify storefront without blocking render.
- **Pre**: Storefront page loaded. **Post**: Widget launcher/panel mounted; session ensured (FN-006).
- **Logic**: Defer script; lazy-load panel bundle; on launcher click, open Notification Center (FN-002).
- **Input**: storeLocale, existing sessionToken? **Output**: mounted widget, resolved language.
- **Errors**: Asset load fail → retry once → minimal "Contact us" fallback.
- **Related**: FR-001, NFR-002 · POL-013(none).

### FN-002: Notification Center Tabs & Badges (탭·미읽음 배지)
- **Desc**: Tabbed container (Notifications / Chat / Orders) with per-tab unread badges and settings gear.
- **Pre**: Widget mounted. **Post**: Active tab rendered; badges reflect unread counts.
- **Logic**: Maintain tab state; subscribe to unread-count store (Redis-backed); gear → FN-004.
- **Input**: activeTab, unreadCounts. **Output**: tab content, badge counts.
- **Errors**: Count fetch fail → show last cached count + silent retry.
- **Related**: FR-028 · NFR-011.

### FN-003: Notification Inbox (알림 인박스·필터·읽음)
- **Desc**: Persistent notification list with category filters and read/unread state.
- **Pre**: Notifications tab active. **Post**: Filtered/grouped list; opened items marked read.
- **Logic**: Fetch notifications (paginated) → group by date (오늘/어제/N월 전) → apply filter (전체/결제/배송/이벤트/리뷰); open → mark read, decrement count, route to detail.
- **Input**: filter, page. **Output**: notification list, read state, unread delta.
- **Errors**: Empty → empty-state; fetch fail → retry.
- **Related**: FR-029 · NFR-011 · 화면 08,34,48,49.

### FN-004: User Notification Preferences (사용자 알림 설정)
- **Desc**: Channel/category opt-in/out, linked to CCPA opt-out.
- **Pre**: Settings opened. **Post**: Preferences persisted; applied to dispatch (FN-025).
- **Logic**: Load prefs → toggle per channel/category → save; transactional in-app always on.
- **Input**: prefs{channel,category,enabled}. **Output**: saved prefs.
- **Errors**: Save fail → revert toggle + notify.
- **Related**: FR-049 · POL-002, POL-007.

### FN-005: Personalization Header (개인화 헤더)
- **Desc**: Show "Hi, {name}", cart/notification badges for authenticated users.
- **Pre**: Session resolved. **Post**: Header reflects identity/counts.
- **Logic**: If authenticated → render name + counts; else generic.
- **Input**: customerProfile, cartCount, unreadCount. **Output**: header view.
- **Errors**: Profile missing → fall back to generic.
- **Related**: FR-050 · POL-002.

---

## Module 2: Session & i18n (세션·다국어)

### FN-006: Session Lifecycle (세션 생성·재개)
- **Desc**: Create or resume a session per visitor.
- **Pre**: Widget bootstrapping. **Post**: Active session in Redis; CJM session-start emitted.
- **Logic**: If token valid → resume context; else create session, emit CJM Awareness/Browse (FN-047).
- **Input**: sessionToken?. **Output**: sessionId, context.
- **Errors**: Store unavailable → ephemeral session + alert.
- **Related**: FR-001, FR-002 · POL-002.

### FN-007: i18n Resolver (언어 해석 — 북미)
- **Desc**: Resolve UI language to **en / es / ko** from Shopify/browser locale (region variants es-US/es-MX). North America customer-facing primary = English + Spanish; KO internal/admin.
- **Pre**: Session created. **Post**: Language bound to session; user-switchable.
- **Logic**: locale (e.g., `es-MX`,`es-US`) → `es`; `ko*`→`ko`; else `en` (default); load static bundle (namespaces). RAG output language follows uiLanguage (FR-027), incl. ES.
- **Input**: storeLocale/browserLocale, user override. **Output**: uiLanguage, strings.
- **Errors**: Unknown locale → `en`.
- **Related**: NFR-003, FR-027 · POL(Common i18n).

### FN-008: Welcome, CCPA & AI Disclosure (웰컴·동의·AI 고지)
- **Desc**: Render welcome, CCPA notice/consent, persistent AI disclosure.
- **Pre**: New session. **Post**: Consent state recorded; menu shown (FN-009).
- **Logic**: Show notice + consent; on decline → restrict to non-personal FAQ, suppress PII logging; show AI disclosure in chat.
- **Input**: consentChoice. **Output**: consentState, welcome view.
- **Errors**: None (decline is valid path).
- **Related**: FR-002, NFR-004, NFR-009 · POL-002.

---

## Module 3: Scenario Engine (시나리오 엔진)

### FN-009: Scenario Menu Router (시나리오 메뉴 라우터)
- **Desc**: Route scenario-button selections to branches.
- **Pre**: Menu shown. **Post**: Branch entered; selection logged.
- **Logic**: Map button → branch: Delivery/Cancel-Refund → Auth Gate (FN-011); Product Help → FN-010; Contact Support → FN-036; Affiliate → FN-030; no match → RAG (FN-015).
- **Input**: buttonId. **Output**: branch route.
- **Errors**: Unknown button → RAG fallback.
- **Related**: FR-003 · POL-001.

### FN-010: Product Help Sub-Menu (제품 도움 서브메뉴)
- **Desc**: Sub-menu: 사용법 / 성분 / 교환·반품 / 재입고 알림 / 처음으로.
- **Pre**: Product Help selected. **Post**: Sub-item handled (RAG / restock / policy).
- **Logic**: 사용법·성분 → RAG (FN-015); 교환·반품 → policy guidance (FN-021/POL-005); 재입고 알림 → FN-032.
- **Input**: subItemId, productContext. **Output**: answer/route.
- **Errors**: Out of scope → escalate (FN-018).
- **Related**: FR-038 · POL-005 · 화면 60.

---

## Module 4: Auth Gate (인증 게이트)

### FN-011: Auth Method Selector (인증 수단 선택)
- **Desc**: Present login choices when order/purchaser data is needed.
- **Pre**: Request needs order data. **Post**: Selected method invoked.
- **Logic**: Render Shopify / social / guest lookup options.
- **Input**: requestContext. **Output**: methodChoice.
- **Errors**: Cancel → return to menu, guest features only.
- **Related**: FR-006 · POL-001.

### FN-012: Shopify / Social Login (계정·소셜 로그인)
- **Desc**: Authenticate via Shopify Customer Account or social (Shopify-linked).
- **Pre**: Method selected. **Post**: Authenticated; scope bound (FN-014).
- **Logic**: OAuth/login flow → token; resolve social → Shopify customer.
- **Input**: provider, authCode. **Output**: customerId, authToken.
- **Errors**: Fail → clear error + retry; social not linked → guest.
- **Related**: FR-007, FR-008 · POL-001.

### FN-013: Guest Order Lookup (게스트 주문조회)
- **Desc**: Verify order# + email against Shopify.
- **Pre**: Guest lookup selected. **Post**: Order-scoped session on match.
- **Logic**: Verify against Shopify; max 5 retries / 15 min (POL-001 R5).
- **Input**: orderNumber, email. **Output**: orderScope or failure.
- **Errors**: Mismatch → verification-failed; exceed retries → offer agent.
- **Related**: FR-009 · POL-001.

### FN-014: Session Scope Binding (세션 스코프 바인딩)
- **Desc**: Bind authenticated identity/order scope to session.
- **Pre**: Auth success. **Post**: Scope bound; CJM identity link updated.
- **Logic**: Attach customer/order scope to session; never log raw credentials.
- **Input**: customerId/orderScope. **Output**: boundSession.
- **Errors**: Binding fail → re-auth.
- **Related**: FR-010 · POL-001, NFR-004.

---

## Module 5: RAG Service (RAG 서비스)

### FN-015: Intent & Scope Check (의도·범위 판정)
- **Desc**: Detect intent; check against learned scope.
- **Pre**: Free-text/product question. **Post**: In-scope → retrieve; else escalate.
- **Logic**: Classify intent; scope check; if needs order data → Auth Gate.
- **Input**: questionText, context. **Output**: intent, inScope flag.
- **Errors**: Ambiguous → clarify or RAG attempt.
- **Related**: FR-013, FR-005 · POL-011.

### FN-016: RAG Retrieval (검색)
- **Desc**: Retrieve from Knowledge Store (primary) → Google Drive (gap fill).
- **Pre**: In scope. **Post**: Ranked context returned.
- **Logic**: Query Knowledge Store; if gaps → Google Drive; Knowledge Store wins duplicates (POL-013).
- **Input**: query, embeddings. **Output**: retrieved chunks + source category.
- **Errors**: Source down → use available + flag.
- **Related**: FR-020, FR-021 · POL-013.

### FN-017: Answer Generation & Language (답변 생성·언어)
- **Desc**: Generate grounded answer (EN base), serve in UI language; cite source.
- **Pre**: Retrieval done. **Post**: Answer rendered + logged.
- **Logic**: Generate from context; apply language strategy (A/B [TBD] POL-011 R4); attach citation; **pass through moderation gate (FN-052) before delivery** — blocked → safe-fallback/escalate.
- **Input**: retrievedContext, uiLanguage. **Output**: moderated answer, citation.
- **Errors**: Generation fail → escalate (FN-018); moderation fail → hold (NFR-013).
- **Related**: FR-013, FR-027, FR-069 · POL-011, POL-020.

### FN-018: Escalation Decision (에스컬레이션 판정)
- **Desc**: Escalate on low confidence, out-of-scope, or timeout.
- **Pre**: Answer attempt. **Post**: Escalation triggered (FN-034) or answer delivered.
- **Logic**: If confidence < threshold OR out-of-scope OR latency > NFR-001 → escalate.
- **Input**: confidence, latency, scopeFlag. **Output**: escalate? decision.
- **Errors**: N/A.
- **Related**: FR-014, NFR-001 · POL-011.

---

## Module 6: Order Service (주문 서비스)

### FN-019: Order Status Fetch & Mapping (주문상태 조회·매핑)
- **Desc**: Fetch Shopify Order/Fulfillment; map to UI status.
- **Pre**: Authenticated scope. **Post**: Status returned (Confirmed/In Transit/Delivered/Review).
- **Logic**: Fetch order; map internal→UI per POL-014; cache (non-authoritative).
- **Input**: orderRef. **Output**: status, items.
- **Errors**: Not found → not-found + agent offer.
- **Related**: FR-010, NFR-010 · POL-014.

### FN-020: Delivery Tracking Stepper (배송 스테퍼)
- **Desc**: Build 4-step delivery progress data + track link.
- **Pre**: Fulfillment data available. **Post**: Stepper state rendered.
- **Logic**: Map fulfillment → 발송준비/배송시작/배송중/배송완료; attach tracking/CTA.
- **Input**: fulfillmentStatus. **Output**: stepperState, trackUrl.
- **Errors**: Missing tracking → show status only.
- **Related**: FR-011, FR-031 · POL-014 · 화면 49.

### FN-021: Cancel/Refund Guidance (취소·환불 안내)
- **Desc**: Policy-driven cancel/refund guidance.
- **Pre**: Authenticated order. **Post**: Guidance shown or routed to agent.
- **Logic**: Within window → guided steps; beyond → explain + agent (POL-004); damaged → agent.
- **Input**: orderContext, requestType. **Output**: guidance/route.
- **Errors**: Policy data missing → agent.
- **Related**: FR-012 · POL-004, POL-005.

### FN-022: Orders Panel Lists (주문 패널 목록)
- **Desc**: Sub-tabs 결제내역/배송현황/문의하기 with order lists.
- **Pre**: Authenticated. **Post**: Lists rendered.
- **Logic**: Fetch order history; render per sub-tab; inquiries badge from FN-024.
- **Input**: customerScope, subTab. **Output**: order lists.
- **Errors**: None found → empty-state.
- **Related**: FR-030 · POL-001 · 화면 01.

### FN-023: Order Detail (주문 상세)
- **Desc**: Full order detail with items/options/totals/addresses + inquiry entry.
- **Pre**: Order selected. **Post**: Detail rendered; inquiry attaches order context.
- **Logic**: Fetch order detail; "문의하기" → open chat w/ order context (FN-034 record).
- **Input**: orderId. **Output**: orderDetail view.
- **Errors**: Mismatch/forbidden → block + re-auth.
- **Related**: FR-032 · POL-001 · 화면 10,11.

### FN-024: My Inquiries History (내 문의 내역)
- **Desc**: List past inquiries with answered/unanswered badge.
- **Pre**: Authenticated. **Post**: Inquiry list rendered; resume continues context.
- **Logic**: Query inquiries from log store; compute unanswered count.
- **Input**: customerScope. **Output**: inquiry list, badge.
- **Errors**: Fetch fail → retry.
- **Related**: FR-033 · FR-018.

---

## Module 7: Notification Service (알림 서비스)

### FN-025: Event→Channel Dispatch (이벤트→채널 발송)
- **Desc**: Map event to channels and dispatch honoring prefs.
- **Pre**: Notifiable event. **Post**: Dispatched + logged.
- **Logic**: Evaluate admin mapping + user prefs (FN-004); in-app always on; external honor opt-in; queue via RabbitMQ.
- **Input**: event, mapping, prefs. **Output**: dispatch results.
- **Errors**: Channel disabled → skip; opt-out → suppress external.
- **Related**: FR-023, FR-024 · POL-007.

### FN-026: Web Push Delivery (웹푸시)
- **Desc**: Deliver via Service Worker (PWA) with fallback.
- **Pre**: Web Push enabled. **Post**: Delivered or fallen back.
- **Logic**: Push via SW; unsupported/denied → fallback in-app + (if enabled) email.
- **Input**: pushPayload, subscription. **Output**: deliveryStatus.
- **Errors**: SW unavailable → fallback.
- **Related**: FR-024, NFR-005 · POL-007.

### FN-027: Webhook Receiver → Notification (웹훅 수신→알림)
- **Desc**: Receive Shopify/Fulfillment webhooks; map and trigger notification.
- **Pre**: Webhook configured. **Post**: Notification event created.
- **Logic**: Validate signature → map status (POL-014) → enqueue notification (FN-025).
- **Input**: webhookPayload. **Output**: notificationEvent.
- **Errors**: Failure → retry w/ backoff; persistent → alert admin.
- **Related**: FR-043, NFR-006 · POL-015.

---

## Module 8: Review (리뷰)

### FN-028: Review Request Trigger (리뷰 요청 트리거)
- **Desc**: Auto-trigger review request N days after delivery.
- **Pre**: Order delivered. **Post**: Review-request notification created.
- **Logic**: Schedule N-day timer (N [TBD] POL-008); one per item; suppress if opted out.
- **Input**: deliveredOrder, N. **Output**: reviewRequest notification.
- **Errors**: Canceled/refunded → skip.
- **Related**: FR-034 · POL-008 · 화면 19,28.

### FN-029: Review Submission (리뷰 작성)
- **Desc**: Capture rating + text; persist.
- **Pre**: Review entry opened. **Post**: Review saved; order Review state done; CJM Post.
- **Logic**: Validate input → store (target [TBD] POL-008) → update state.
- **Input**: orderItem, rating, text. **Output**: reviewRecord.
- **Errors**: Validation fail → inline error.
- **Related**: FR-034 · POL-008 · 화면 57,64.

---

## Module 9: Affiliate (제휴)

### FN-030: Affiliate Info & Application (제휴 안내·신청)
- **Desc**: Explain program; capture application form.
- **Pre**: Affiliate branch. **Post**: Application recorded; review pending.
- **Logic**: Show steps (신청→심사 1–3일→10% 적립); CTA 지금 신청하기 → form → store; CJM event.
- **Input**: applicantInfo. **Output**: applicationRecord.
- **Errors**: Duplicate → show existing status.
- **Related**: FR-035 · POL-009 · 화면 62,65~69.

### FN-031: Affiliate Review & Link Issue (심사·링크 발급)
- **Desc**: Operator approves/rejects; issue affiliate link on approval.
- **Pre**: Application exists. **Post**: Decision recorded; link issued; email sent.
- **Logic**: Operator decision → notify by email → on approve generate personal link (10% commission tracking).
- **Input**: applicationId, decision. **Output**: affiliateLink/status.
- **Errors**: Settlement owner [TBD] → capture only.
- **Related**: FR-035 · POL-009.

---

## Module 10: Restock & Subscription (재입고·구독)

### FN-032: Restock Subscribe & Alert (재입고 신청·발송)
- **Desc**: Subscribe to restock; alert on inventory restock.
- **Pre**: Out-of-stock product. **Post**: Subscription stored; alert on restock.
- **Logic**: Capture product + prefs; on Odoo/Shopify restock event → dispatch (FN-025).
- **Input**: productId, prefs. **Output**: restockSubscription.
- **Errors**: Source scope [TBD] → use available source.
- **Related**: FR-036 · POL-010 · 화면 60.

### FN-033: Subscription Management (구독 관리)
- **Desc**: View/cancel/change subscriptions; member benefits.
- **Pre**: Authenticated. **Post**: Subscription updated; member coupon dispatched.
- **Logic**: Require auth → fetch subscription (Shopify/Odoo) → modify; subscriber-segment coupons via campaign (FN-042).
- **Input**: customerScope, action. **Output**: subscriptionState.
- **Errors**: Not subscribed → guidance.
- **Related**: FR-037 · POL-010.

---

## Module 11: Escalation & Agent Console (에스컬레이션·상담원 콘솔)

### FN-034: Escalation & Handoff Context (에스컬레이션·핸드오프)
- **Desc**: Mark conversation for escalation; assemble handoff package.
- **Pre**: Escalation trigger. **Post**: Package delivered to console.
- **Logic**: Bundle transcript + auth/order context + language; queue to agent.
- **Input**: conversation, scope, language. **Output**: handoffPackage.
- **Errors**: No agent → queue + offline/callback (email).
- **Related**: FR-015, FR-016 · POL-012.

### FN-035: Agent Console Session Mgmt (콘솔 세션 관리)
- **Desc**: Session list with status; accept/intervene/end; customer/order panel.
- **Pre**: Console open. **Post**: Session state transitions logged.
- **Logic**: List sessions (상담사연결/AI응답중/대기/종료); "개입" pause AI; "종료" close + log.
- **Input**: agentAction, sessionId. **Output**: sessionState.
- **Errors**: Concurrent claim → lock/assign.
- **Related**: FR-017 · POL-012 · 화면 27,28.

### FN-035b: Agent Message Send + Moderation (상담원 전송·모더레이션)
- **Desc**: Agent outbound message passes moderation gate (FN-052) before delivery.
- **Pre**: Agent composes reply. **Post**: Clean message delivered; warn/block → edit & resend.
- **Logic**: send → FN-052 (word+context) → pass→deliver; warn/block→require edit; log (moderation_logs).
- **Related**: FR-069 · POL-020 · 화면 SCR-102.

### FN-036: Multi-Channel Contact Card (멀티채널 안내 카드)
- **Desc**: Show phone/email/live-chat with hours.
- **Pre**: Contact Support selected. **Post**: Card shown; live chat → escalation.
- **Logic**: Render 전화/이메일/채팅(지금 바로 연결 → FN-034); outside hours → offline + callback.
- **Input**: contactConfig, currentTime. **Output**: contact card.
- **Errors**: Outside hours → offline message.
- **Related**: FR-039 · POL-012 · 화면 61.

---

## Module 12: AI Assist (AI 보조)

### FN-037: AI Agent Briefing (AI 상황 브리핑)
- **Desc**: Generate summary, customer info, intent, keywords, sentiment, recommended action.
- **Pre**: Conversation in console. **Post**: Briefing panel populated; updates live.
- **Logic**: Summarize transcript; fetch customer history; classify intent; sentiment gauge; recommend action from policy/KB.
- **Input**: conversation, customerHistory. **Output**: briefing object.
- **Errors**: Analysis fail → show partial + retry.
- **Related**: FR-045 · POL-011 · 화면 27,28.

---

## Module 12A: Agent Management & Moderation (상담원 관리·모더레이션)

### FN-049: Agent Profile & Registration (상담원 프로필·등록)
- **Desc**: Register/manage agents (Consult-label users) with languages/skills/max_concurrent/status. **Related**: FR-066 · SCR-208.
### FN-050: Assignment & Routing (배정·라우팅)
- **Desc**: Auto-route by language/skill/load + manual assign/transfer; queue; respect max_concurrent. **Related**: FR-067 · SCR-209.
### FN-051: Consult Statistics (상담 통계)
- **Desc**: Compute per-agent/team metrics (handled, response/handle time, resolution, CSAT, online, blocks). **Related**: FR-068 · FR-044.
### FN-052: Moderation Pipeline (모더레이션 파이프라인)
- **Desc**: Mandatory outbound gate for agent & AI: load tenant rules → word/phrase/regex match + **context classify (LLM/classifier)** → action block/mask/warn/rephrase → deliver clean or hold; fail-safe; audit `moderation_logs`.
- **Pre**: outbound draft. **Post**: delivered or blocked/edited.
- **Errors**: filter error/timeout → hold (NFR-013).
- **Related**: FR-069 · POL-020, POL-002 · FN-017, FN-035b.

## Module 12B: AI Provider Gateway (AI 엔진 게이트웨이)

### FN-053: AI Provider Gateway / Adapter (AI 엔진 게이트웨이)
- **Desc**: Uniform interface routing AI calls (chat/RAG/summary/assist/moderation) to the **selected engine** (Anthropic/OpenAI/Google/Azure/custom) via per-provider adapters. Engine catalog by System Admin (`ai_engines`), per-function selection by Master (`tenant_ai_settings`); fallback to platform default.
- **Pre**: engine configured/enabled. **Post**: response from selected engine via common contract (prompt, streaming/SSE, tokens).
- **Logic**: resolve engine(function, tenant) → adapter(provider) → call(model, params, key[decrypted]) → normalize; record usage/tokens per engine·tenant.
- **Errors**: engine error/timeout → fallback engine or escalate; never bypass moderation/scoping.
- **Related**: FR-070 · FN-016,017,037,052 · POL-011,018.

> FN-016(RAG)/FN-017(answer)/FN-037(AI-assist)/FN-052(context moderation) call AI **through FN-053** using the tenant's selected engine.

## Module 13: Admin & Analytics (관리자·분석)

### FN-038: Monitoring Dashboard (모니터링 대시보드)
- **Desc**: KPIs + AI processing analytics + unresolved patterns + popular questions.
- **Pre**: Admin authenticated. **Post**: Dashboard rendered.
- **Logic**: Aggregate sessions, dispatch results, AI resolution, integration health, hourly volume, Top-N patterns, popular questions from logs.
- **Input**: dateRange. **Output**: dashboard metrics.
- **Errors**: Source delay → last-synced timestamp.
- **Related**: FR-044, FR-004 · POL-015 · 화면 19,21,18.

### FN-039: Conversation History (상담 이력)
- **Desc**: Search/filter/view/export past conversations.
- **Pre**: Admin/operator. **Post**: Results listed; export available.
- **Logic**: Query log store with filters; respect retention/CCPA; export for curation.
- **Input**: filters. **Output**: conversation list/detail/export.
- **Errors**: Access denied → block by role.
- **Related**: FR-046, FR-019 · POL-003.

### FN-040: AI Setting / Knowledge / Rules / Scenario (AI 설정)
- **Desc**: Configure bot persona, rules, knowledge, scenario buttons.
- **Pre**: Admin. **Post**: Config applied; KB re-embedded.
- **Logic**: Edit persona/rules; CRUD KB → re-embed (FN-016); manage scenario chips (FN-009).
- **Input**: configPayload. **Output**: applied config.
- **Errors**: Re-embed fail → retain previous + alert.
- **Related**: FR-047, FR-022, FR-003 · POL-011, POL-013.

### FN-041: Customer & Product Management (고객·상품 관리)
- **Desc**: View (and edit if in scope) customer profiles and product/inventory.
- **Pre**: Admin/operator. **Post**: Records viewed/updated.
- **Logic**: Read from Shopify/Odoo; write scope [TBD] A-11.
- **Input**: query/edit. **Output**: records.
- **Errors**: Source unavailable → status alert.
- **Related**: FR-048 · POL-015.

### FN-042: Campaign / Event Dispatch (캠페인·이벤트 발송)
- **Desc**: Build campaign from recipe; target Klaviyo segment; dispatch.
- **Pre**: Admin. **Post**: Campaign dispatched + logged.
- **Logic**: Template → select Klaviyo segment → manual send via Notifier honoring opt-out.
- **Input**: campaign, segment. **Output**: dispatch result.
- **Errors**: Klaviyo down → defer/queue + alert.
- **Related**: FR-040, FR-041 · POL-007, POL-015 · 화면 23,70.

---

## Module 14: Integrations (연동)

### FN-043: Shopify Connector (Shopify 커넥터)
- **Desc**: Customer/Order API + Webhook integration.
- **Pre**: Credentials set. **Post**: Orders/customers retrievable; webhooks received.
- **Logic**: REST API calls; webhook signature validation (FN-027).
- **Input**: apiCreds, requests. **Output**: order/customer data.
- **Errors**: API error → retry/backoff (NFR-006).
- **Related**: FR-007, FR-010, FR-043 · POL-015.

### FN-044: Odoo Connector (Odoo 커넥터)
- **Desc**: JSON-RPC integration for products/inventory.
- **Pre**: Credentials set. **Post**: Product/inventory retrievable.
- **Logic**: JSON-RPC calls; restock event source (FN-032); scope [TBD] A-7.
- **Input**: rpcCreds, queries. **Output**: product/inventory.
- **Errors**: RPC fail → retry + status alert.
- **Related**: FR-042 · POL-015.

### FN-045: Google Drive KB Sync (지식 동기화)
- **Desc**: Sync Google Drive docs as secondary KB.
- **Pre**: Connector authorized. **Post**: GDrive docs indexed (secondary).
- **Logic**: Periodic sync → embed; Knowledge Store priority (POL-013).
- **Input**: driveFolder. **Output**: synced/embedded docs.
- **Errors**: Sync fail → keep last index + alert.
- **Related**: FR-021 · POL-013.

---

## Module 15: Logging & CJM (기록·CJM)

### FN-046: Conversation Logging (대화 기록)
- **Desc**: Persist all messages/events with retrieval trace.
- **Pre**: Any event. **Post**: Record persisted; curatable on session end.
- **Logic**: Append to log store; buffer+retry on failure; CCPA delete/anonymize on request.
- **Input**: event/turn. **Output**: logRecord.
- **Errors**: Persistent failure → alert admin.
- **Related**: FR-018, NFR-007 · POL-003.

### FN-047: CJM Event Emitter (CJM 이벤트)
- **Desc**: Emit journey-stage events per scenario.
- **Pre**: Scenario event. **Post**: CJM stage updated.
- **Logic**: Map event → stage (Awareness→Browse→Inquiry→Purchase→Delivery→Post); identity link.
- **Input**: scenarioEvent. **Output**: cjmUpdate.
- **Errors**: Emit fail → buffer + retry.
- **Related**: FR-026 · POL-002.

### FN-048: Curation & Re-training Feed (큐레이션·재학습)
- **Desc**: Manual curation (phase 1) feeding Knowledge Store; phase-2 automation hook.
- **Pre**: Session ended, curatable. **Post**: Curated Q/A → KB (FN-040/016).
- **Logic**: Operator reviews/export → feed KB → re-embed; phase-2 auto pattern analysis (out of MVP).
- **Input**: curatedRecords. **Output**: KB updates.
- **Errors**: Re-embed fail → retain + alert.
- **Related**: FR-019, FR-022, FR-004 · POL-013.

---

## Traceability (추적성)

| FR | FN(s) |
|----|-------|
| FR-001/002 | FN-001, FN-006, FN-008 |
| FR-003/038 | FN-009, FN-010 |
| FR-006~010 | FN-011~014, FN-019 |
| FR-013/014/020/021/027 | FN-015~018, FN-045 |
| FR-010/011/012/030~033/031 | FN-019~024 |
| FR-023/024/043/049 | FN-025~027, FN-004 |
| FR-034 | FN-028, FN-029 |
| FR-035 | FN-030, FN-031 |
| FR-036/037 | FN-032, FN-033 |
| FR-015/016/017/039/045 | FN-034~037 |
| FR-025/044/046/047/048/040/041 | FN-038~042 |
| FR-042/007/010 | FN-043, FN-044 |
| FR-018/019/026 | FN-046~048 |

Next stage: Sequence + DFD + ERD use these FNs as input (FN → SEQ/DFD/TBL).

---
document_id: CHATWIDGET-UISPEC-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-FUNCDEF-1.0.0 (Functional Definition)
  - CHATWIDGET-EVTSCN-2.0.0 (Event Scenario)
  - screens/ (Figma export, 71 frames)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: UI specification formalizing the Figma screens — SCR-001~013 (widget) + SCR-101~106 (admin)
---

# IVY USA Chat & Support Widget — UI Specification (화면 정의서)

Formalizes the existing Figma screens (`screens/`) into a screen spec. Each screen lists layout, components, interactions, states (loading/error/empty), responsive behavior, framework notes, and FN/FR/화면 mapping. Framework: **React** (widget and admin). State: Zustand; routing: React Router (admin SPA); the widget is an embedded panel.
(기존 Figma를 화면 명세로 정식화한다. 프레임워크는 React.)

---

## 1. Screen List (화면 목록)

| SCR ID | Screen | Surface | Route / Trigger | 화면(Figma) | FN |
|--------|--------|---------|-----------------|-------------|----|
| SCR-001 | Storefront + Widget Launcher | Widget | storefront, launcher click | 01,08 | FN-001,005 |
| SCR-002 | Notification Center — Notifications | Widget | tab: Notifications | 12,34,48,49,08 | FN-002,003 |
| SCR-003 | Notification Center — Chat (welcome/menu) | Widget | tab: Chat | 14,34,53 | FN-008,009 |
| SCR-004 | Chat — Product Help submenu | Widget | menu: Product Help | 60 | FN-010 |
| SCR-005 | Chat — Contact Support card | Widget | menu: Contact Support | 61 | FN-036 |
| SCR-006 | Chat — Affiliate | Widget | menu: Affiliate | 62,65~69 | FN-030 |
| SCR-007 | Chat — My Orders (inline) | Widget | chat: My Orders | 57 | FN-019,022 |
| SCR-008 | Auth Gate | Widget | order-data required | (modal) | FN-011~013 |
| SCR-009 | Orders Panel (tabs) | Widget | tab: Orders | 01 | FN-022,024 |
| SCR-010 | Order Detail | Widget | order select | 10,11 | FN-023 |
| SCR-011 | Delivery Tracking (stepper) | Widget | 배송현황 / Track | 49 | FN-020 |
| SCR-012 | Review Writing | Widget | 리뷰 쓰기 | 57,64 | FN-029 |
| SCR-013 | Notification Settings | Widget | gear ⚙ | 12,14 | FN-004 |
| SCR-101 | Admin Overview / Dashboard | Admin | /overview | 19,21,18 | FN-038 |
| SCR-102 | Live Chat Console + AI Briefing | Admin | /live-chat | 27,28 | FN-035,037 |
| SCR-103 | Notification Dispatch / Event / Recipes | Admin | /notifications, /events | 23,70 | FN-042 |
| SCR-104 | Conversation History | Admin | /history | (sidebar) | FN-039 |
| SCR-105 | AI Setting / Chat Setting | Admin | /ai-setting | 25 | FN-040 |
| SCR-106 | Customer / Product Management | Admin | /customers, /products | 18,25 | FN-041 |

**Global widget chrome**: header "알림센터" + ⚙; tab bar (Notifications / Chat / Orders) with unread badges; bottom input ("Ask Anything" / "메시지를 입력하세요…") on Chat; AI disclosure line on Chat.

---

## 2. Widget Screens (위젯 화면)

### SCR-001: Storefront + Widget Launcher (화면 01,08)
- **Layout**: Storefront top bar (logo, nav, "Hi, {name}", cart badge, bell badge); widget panel anchored top-right.
- **Components**:

| Element | Type | Description | Behavior |
|--------|------|-------------|----------|
| Launcher / panel | Container | Notification Center | Async mount (FN-001); open/close |
| Personalization | Header | "Hi, {name}", cart/bell badges | Authenticated only (FN-005) |
| Promo bar | Banner | "Free Shipping… FREESHIP" | Static |

- **Interactions**: Loading = skeleton panel; Error = "Contact us" fallback; Empty = welcome state.
- **Responsive**: Desktop = floating panel (~380px); Mobile = full-width sheet.
- **Map**: FN-001,005 · FR-001,028,050.

### SCR-002: Notification Center — Notifications (화면 12,34,48,49)
- **Layout**: Tabs (Notifications•badge / Chat•badge / Orders•badge); filter chips (전체/결제/배송/이벤트/리뷰); date-grouped list (오늘/어제/N월 전).
- **Components**:

| Element | Type | Description | Behavior |
|--------|------|-------------|----------|
| Filter chips | Toggle | category filter | Filter list (FN-003) |
| Notification item | Card | icon, order#, status badge, text, time, unread dot | Tap → mark read + route to detail |
| Delivery item | Card+Stepper | shipping progress + 배송조회 | Tap → SCR-011 |
| Event item | Card | coupon/promo (e.g., BOGO) | Tap → offer/detail |
| Review item | Card | "리뷰 쓰기" CTA | Tap → SCR-012 |

- **States**: Loading = skeleton rows; Error = retry; Empty = "알림이 없습니다".
- **Map**: FN-002,003 · FR-028,029, NFR-011.

### SCR-003: Notification Center — Chat (화면 14,34,53)
- **Layout**: Chat thread; welcome bubble; scenario buttons; bottom input; AI disclosure ("This chat is AI-powered…").
- **Components**:

| Element | Type | Description | Behavior |
|--------|------|-------------|----------|
| Welcome bubble | Message | greeting | Auto on session start |
| Scenario buttons | Buttons | Delivery/Cancel/Product Help/Contact/Affiliate | Route (FN-009) |
| Quick FAQ chips | Chips | shipping/return/subscription/affiliate/warranty/damaged | RAG/route |
| Input + send | Input | free-text | Send → RAG (FN-015) |
| AI disclosure | Caption | transparency | Persistent (NFR-009) |

- **States**: Loading = typing indicator; Error/timeout = apology + agent offer; Empty = welcome only.
- **Map**: FN-008,009,015 · FR-002,003, NFR-009.

### SCR-004: Chat — Product Help submenu (화면 60)
- **Components**: Sub-menu chips 제품 사용법 / 성분 문의 / 교환·반품 / 재입고 알림 / 처음으로; answer bubbles; follow-up chips (배송 조회/주문 취소/처음으로).
- **Interactions**: 교환·반품 → policy bubble (7일/미개봉); 재입고 알림 → SCR (subscribe); out-of-scope → agent.
- **Map**: FN-010 · FR-038, POL-005.

### SCR-005: Chat — Contact Support card (화면 61)
- **Components**: Card rows — 전화 상담(번호·시간), 이메일 문의(주소·SLA), 채팅 상담(지금 바로 연결); 처음으로.
- **Interactions**: 채팅 상담 → live escalation (SCR-102 queue); outside hours → offline + callback capture.
- **Map**: FN-036 · FR-039, POL-012.

### SCR-006: Chat — Affiliate (화면 62,65~69)
- **Components**: Program steps (신청서 제출 / 심사 1–3일 / 활동 & 수익 10% 적립); CTAs 지금 신청하기 / 더 알아보기 / 처음으로 / 종료; application form.
- **Interactions**: 지금 신청하기 → form → submit (FN-030); duplicate → show status.
- **Map**: FN-030 · FR-035, POL-009.

### SCR-007: Chat — My Orders inline (화면 57)
- **Components**: Recent order cards (order#, status badge Confirmed/Review, product); follow-up chips (배송 조회/주문 취소/처음으로).
- **Interactions**: Card → SCR-010; requires auth (SCR-008).
- **Map**: FN-019,022 · FR-030.

### SCR-008: Auth Gate (modal)
- **Components**: Method buttons — Shopify account / Social / Guest order lookup; guest form (order# + email).
- **States**: Mismatch → verification-failed + retry (≤5/15min) + agent; Cancel → back to menu (guest features).
- **Map**: FN-011~014 · FR-006~009, POL-001.

### SCR-009: Orders Panel (화면 01)
- **Layout**: Orders tab with sub-tabs 결제내역 / 배송현황 / 문의하기(•badge); order list rows.
- **Components**: Order row (status badge, order#, product, price, date); inquiries list (answered/unanswered).
- **Interactions**: Row → SCR-010; 배송현황 → SCR-011; 문의하기 → past inquiries (FN-024).
- **States**: Empty = "주문이 없습니다"; unauth → SCR-008.
- **Map**: FN-022,024 · FR-030,033.

### SCR-010: Order Detail (화면 10,11)
- **Components**: Header (주문 상세, IVY-#); line items (image, title, option, price); discount; subtotal/shipping/total; contact/billing/shipping address; "문의하기" CTA.
- **Interactions**: 문의하기 → open Chat with order context attached (FN-023→FN-034).
- **States**: Forbidden/mismatch → block + re-auth.
- **Map**: FN-023 · FR-032.

### SCR-011: Delivery Tracking (화면 49)
- **Components**: Stepper 발송준비→배송시작→배송중→배송완료 (current highlighted); status message; 배송조회/Track Order button.
- **States**: Completed = "배송이 완료되었습니다"; in-transit = encouraging message; no tracking → status only.
- **Map**: FN-020 · FR-011,031, POL-014.

### SCR-012: Review Writing (화면 57,64)
- **Components**: Order item summary; star rating; text area; submit.
- **States**: Validation error inline; success → confirmation + Review state done.
- **Map**: FN-029 · FR-034, POL-008.

### SCR-013: Notification Settings (화면 12,14 ⚙)
- **Components**: Toggle list per channel (in-app/email/SMS/Web Push) × category (결제/배송/이벤트/리뷰); CCPA opt-out link.
- **Rules**: In-app transactional always on (disabled toggle); save applies to dispatch.
- **Map**: FN-004 · FR-049, POL-002,007.

---

## 3. Admin Screens (관리자 화면) — "IVY TalkTalk" SPA

### SCR-101: Overview / Dashboard (화면 19,21,18)
- **Layout**: Left nav (모니터링: Overview/실시간 채팅/알림 발송/상담 이력 · 설정: AI Setting/AI Chat Setting/설정 · 고객·상품: 고객 관리/상품 관리).
- **Components**: KPI cards (활성 채팅 세션, 오늘 발송 알림 성공/실패, AI 해결률, 플랫폼 연동); 실시간 채팅 세션 list; 알림 발송 현황; 플랫폼 연동 상태(Shopify/Klaviyo/Odoo/Fulfillment); AI 처리 현황(시간대별, 미해결 패턴 Top 3); AI Chat 인기 질문.
- **States**: Source delay → last-synced timestamp; integration error → status alert.
- **Map**: FN-038 · FR-044, POL-015.

### SCR-102: Live Chat Console + AI Briefing (화면 27,28)
- **Layout**: 3-pane — session list / conversation / AI 상황 브리핑.
- **Components**: Session list (status 상담사 연결/AI 응답 중/대기/종료); conversation thread; order/customer context; briefing (요약, 고객정보, 의도 분석, 키워드 태그, 감정 온도, 추천 액션); 개입 중 / 종료 buttons; agent input.
- **Interactions**: 개입 → pause AI; 종료 → close + log; transfer back → resume AI.
- **Map**: FN-035,037 · FR-016,017,045.

### SCR-103: Notification Dispatch / Event / Recipes (화면 23,70)
- **Components**: Event Setting; Campaign Recipes gallery (Recommended/Popular); campaign builder (content+offer); segment selector (Klaviyo); send/schedule.
- **Interactions**: Build → select segment → send (manual) honoring opt-out; Klaviyo down → defer/queue.
- **Map**: FN-042 · FR-040,041, POL-007.

### SCR-104: Conversation History
- **Components**: Search/filter bar (date/customer/intent/status); result list; detail view; export.
- **Rules**: Role-based access; respects retention/CCPA.
- **Map**: FN-039 · FR-046,019, POL-003.

### SCR-105: AI Setting / AI Chat Setting (화면 25)
- **Components**: Bot persona; response Rules; Knowledge (CRUD + re-embed status); Scenario buttons editor; **AI Engine selector per function** (chat/RAG/summary/assist/moderation) from enabled engines (FR-070); params (temperature/max tokens).
- **Interactions**: KB edit → re-embed (status shown); scenario change → reflected in widget.
- **Map**: FN-040 · FR-047,022,003.

### SCR-106: Customer / Product Management (화면 18,25)
- **Components**: Customer list/profile (orders, inquiries from CJM); Product list (catalog/inventory from Odoo/Shopify).
- **Rules**: Read vs write scope [TBD] (A-11); source = Shopify/Odoo.
- **Map**: FN-041 · FR-048, POL-015.

---

## 3A. System Admin Console (시스템 어드민 콘솔) — cross-tenant, "IVY TalkTalk Platform"

별도 콘솔(또는 권한 분기 영역). 접근: System Admin(Super Admin/Admin)만. 모든 화면은 RBAC 매트릭스(§3.1) + 감사 로그(FR-061) 적용. 메뉴 가시성은 레벨에 따라 분기.

### Screen list (어드민 콘솔 화면 목록)
| SCR ID | Screen | Route | FN/FR |
|--------|--------|-------|-------|
| SCR-201 | Tenant Management (테넌트 관리) | /admin/tenants | FR-052 |
| SCR-202 | Admin & User Accounts (계정 관리) | /admin/accounts | FR-053,059 |
| SCR-203 | Global Solution Settings (글로벌 기능·정책) | /admin/settings | FR-053,060 |
| SCR-203A | AI Engine Management (AI 엔진 관리) | /admin/ai-engines | FR-070 |
| SCR-204 | Integration Settings (외부연동 설정) | /admin/integrations | FR-060 |
| SCR-205 | Plans & Billing (플랜·과금) | /admin/billing | FR-055/065 |
| SCR-206 | Audit & Platform Monitoring (감사·모니터링) | /admin/audit | FR-061,044 |
| SCR-207 | Tenant User & Label Management (유저·라벨 관리) | /tenant/users | FR-054,055,059,060 |
| SCR-207A | Tenant Settings & Integrations (테넌트 설정·외부연동, Master) | /tenant/settings | FR-060,047 |

### SCR-201: Tenant Management (테넌트 관리)
- **Layout**: Tenant list table (shop_domain, status, plan, created); detail drawer; "신규 테넌트 신청" 검토 큐.
- **Components**: status filter (applied/active/suspended); 승인/거부 buttons; provision action; suspend/offboard (data purge) action; tenant detail (config summary, integrations, usage).
- **Interactions**: 승인 → provision(설정·KB 시드); 중지/오프보딩 → 2-step confirm → tenant data purge (shop/redact 연계).
- **States**: Empty queue; provisioning progress; offboard confirm modal.
- **RBAC**: Super Admin = 승인/오프보딩; Admin = 신청 검토·승인, 오프보딩은 승인 필요.
- **Map**: FN(신규)·FR-052 · POL-017.

### SCR-202: Admin & User Accounts (계정 관리)
- **Components**: Admin users list (level super_admin/admin, status); cross-tenant user search (tenant, rank, labels); create/suspend; assign rank/labels.
- **Interactions**: Super Admin만 admin 계정 생성/권한변경; Admin은 tenant 유저 조회·지원 한정.
- **RBAC**: §3.1 enforced; all changes → audit_logs (FR-061).
- **Map**: FR-053, FR-059 · POL-017.

### SCR-203: Global Solution Settings (글로벌 기능·정책)
- **Components**: Feature flags (솔루션 전체 기능 on/off 기본값); global policy templates (환불/반품/보증/리뷰 N일/제휴율 기본값); i18n defaults; CCPA/retention 기본.
- **Interactions**: 글로벌 기본값 → 테넌트가 상속/오버라이드(FR-060).
- **RBAC**: Super Admin write; Admin read/제안.
- **Map**: FR-053, FR-060 · POL-003,017.

### SCR-203A: AI Engine Management (AI 엔진 관리) — System Admin
- **Components**: Engine catalog (provider, name, model, endpoint, capabilities, status, default); add/edit/enable/disable; **API key(encrypted, masked)**; usage/token metrics per engine·tenant.
- **Interactions**: System Admin registers multiple engines (Anthropic/OpenAI/Google/Azure/custom); set platform default.
- **RBAC**: System Admin (Super=keys/default; Admin=view/enable).
- **Map**: FN-053 · FR-070 · POL-018.

### SCR-204: Integration Settings (외부연동 설정)
- **Components**: Global integration templates (Shopify/Klaviyo/Odoo/Fulfillment/Google Drive); per-tenant credential oversight (status only, secrets masked); health/last-sync.
- **Interactions**: 자격증명은 테넌트 **Master**가 입력(SCR-207A), 시스템 어드민은 상태 점검; 연결 오류 alert.
- **RBAC**: secrets never shown; encrypted (integration_credentials).
- **Map**: FR-060, FR-041/042/043 · POL-015,017.

### SCR-205: Plans & Billing (플랜·과금) — future Public app
- **Components**: Plan catalog (Starter/Growth/Enterprise); usage metrics (대화·시트·발송량); per-tenant plan/usage.
- **Interactions**: Public app 전환 시 Shopify App Pricing 연동(FR-065).
- **RBAC**: Super Admin only.
- **Map**: FR-055/065 · (multitenancy §2.8).

### SCR-206: Audit & Platform Monitoring (감사·모니터링)
- **Components**: Cross-tenant audit log (actor/action/target/time, filter); platform health (services, queues, integration status); per-tenant KPI rollup.
- **Interactions**: Filter/search/export; alert on anomalies.
- **RBAC**: Super Admin full; Admin read.
- **Map**: FR-061, FR-044 · POL-003,017.

### SCR-207: Tenant User & Label Management (유저·라벨 관리) — tenant-scoped, **Master**
- **Components**: User list (rank master/director/manager/staff, labels); invite/suspend; **rank(등급) assign/adjust**; **job-label editor (이름 수정/추가, 다중 부여)**.
- **Interactions**: **Master** manages within tenant (rank adjust + label edit Master-only); Director may invite/manage lower ranks and assign labels (no rank-adjust/label-edit). Label rename/add → applies to permission resolution (rank ∩ label).
- **RBAC**: Master full; Director lower-user mgmt + label assign; Manager team-limited; Staff none.
- **Map**: FR-054, FR-055, FR-059, FR-060 · POL-017.

### SCR-207A: Tenant Settings & Integrations (테넌트 설정·외부연동) — tenant-scoped, **Master only**
- **Components**: External integration connect (Shopify/Odoo/Klaviyo/Fulfillment/Google Drive) API key/credential入力(encrypted); tenant feature on/off; policy values (환불/반품/보증/리뷰 N일/제휴율); tenant AI settings entry (→ SCR-105).
- **Interactions**: Master enters BYO credentials (masked after save); connection test/status; changes audited (FR-061).
- **RBAC**: **Master only**; others denied (deny-by-default).
- **Map**: FR-060, FR-047, FR-041/042/043 · POL-015,017.

### SCR-208: Agent Management (상담원 관리) — Master/Director
- **Components**: Agent list (name, languages, skills, status, load); register/edit (Consult-label users); status toggle; max-concurrent.
- **Map**: FN-049 · FR-066.

### SCR-209: Assignment Board (배정 보드) — Manager+
- **Components**: Queue + active assignments, agent load; assign/transfer/reclaim; auto-route indicator.
- **Map**: FN-050 · FR-067.

### SCR-105F: Content Filter Settings (응답 필터 설정) — Master/Director
- **Components**: Rule list (type word/phrase/regex/context, scope agent/ai/both, lang, severity, action); CRUD; **test console**(샘플 문장 판정); global-default inheritance.
- **Interactions**: Save → applies to moderation gate (FN-052); test shows pass/block reason.
- **Map**: FN-052 · FR-069 · POL-020.

> Consult statistics(FR-068)는 SCR-101 분석 대시보드에 상담원/팀 지표 뷰로 포함. SCR-102 콘솔은 전송 시 모더레이션 결과(통과/경고/차단) 인라인 표시.

### RBAC visibility note (권한별 메뉴 가시성)
- 기존 관리자 화면(SCR-101~106)은 직무 라벨로 가시성 분기: 상담=SCR-102/104, 회계=결제/환불·재무 뷰, 운영=SCR-103/106 + 알림/리뷰. Staff는 배정된 작업만(SCR-102 assigned).
- Deny-by-default: 권한 없는 메뉴는 비표시, 액션은 차단(FR-056).

---

## 4. Common UI Rules (공통 UI 규칙)
- **i18n**: All static strings EN/ES/KO (NFR-003); RAG output per FR-027.
- **States**: Every list/data screen defines loading (skeleton), error (retry), empty (guidance).
- **Status colors**: Confirmed=green, In Transit=orange, Delivered=grey, Review=purple (per Figma; align POL-014).
- **Accessibility**: Tap targets ≥ 44px; color not sole status indicator; focus order defined.
- **Auth boundary**: Personal-data screens (SCR-007,009,010,011,012) require SCR-008.
- **RBAC boundary**: Admin/system screens (SCR-101~106, SCR-201~207) gated by group/rank/label (FR-056, POL-017); menus hidden + actions denied by default; all privileged actions audited (FR-061).

## 5. Traceability (추적성)
SCR → FN → FR, and SCR ↔ 화면(Figma). Next: Wireframe (low-fi per SCR) → Prototype (clickable P0 flows). Each SCR must have loading/error/empty states defined before handoff (Gate G5).

---
document_id: CHATWIDGET-WBS-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-REQDEF-2.0.0 (Requirements Definition)
  - CHATWIDGET-EVTSCN-2.0.0 (Event Scenario)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Initial WBS — tasks T-001~T-040 mapped to FR/scenarios, with dependencies, effort, milestones, GitHub/branch refs
---

# IVY USA Chat & Support Widget — WBS (작업 분해 구조)

Work Breakdown Structure for the IVY USA Chat & Support Widget. Each task maps to a **GitHub Issue** and is tracked on the **GitHub Project board**. Effort in person-days (assignees are placeholders for the KR-VN team). Status: Backlog by default.
(각 태스크는 GitHub Issue로 생성되어 Project 보드에서 추적된다. 공수는 인일(man-day), 담당자는 KR-VN 팀 예시.)

## 1. Task List (태스크 목록)

### Phase 0 — Environment & Integrations (환경·연동) → Milestone M1

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-001 | Repo, CI/CD, branch strategy, doc structure | P0 | PM-Lisa | - | 2d | NFR-007 | #101 | feature/101-repo-setup | Backlog |
| T-002 | Dev / Staging / Prod environments (Nginx/Redis) | P0 | BE-Tran | T-001 | 3d | NFR-002 | #102 | feature/102-environments | Backlog |
| T-003 | Shopify app + Customer/Order API + Webhook setup | P0 | BE-Kim | T-002 | 3d | FR-007,010,FR-043 | #103 | feature/103-shopify-integ | Backlog |
| T-004 | Fulfillment webhook receiver + status mapping | P0 | BE-Kim | T-003 | 2d | FR-043,NFR-010 | #104 | feature/104-fulfillment | Backlog |
| T-005 | Klaviyo integration (campaigns/segments) | P1 | BE-Tran | T-002 | 3d | FR-041 | #105 | feature/105-klaviyo | Backlog |
| T-006 | Odoo JSON-RPC connector (products/inventory) | P1 | BE-Tran | T-002 | 3d | FR-042 | #106 | feature/106-odoo | Backlog |
| T-007 | Google Drive KB sync connector | P0 | BE-Kim | T-002 | 2d | FR-021 | #107 | feature/107-gdrive-sync | Backlog |

### Phase 1 — Backend Foundation (백엔드 기반) → Milestone M1

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-008 | MySQL schema + ERD (sessions, conversations, messages, notifications, orders_cache, reviews, affiliates, kb_documents) | P0 | BE-Kim | T-002 | 4d | NFR-007 | #108 | feature/108-db-schema | Backlog |
| T-009 | Chat Orchestrator service skeleton (Next.js, RabbitMQ) | P0 | BE-Kim | T-008 | 4d | FR-001 | #109 | feature/109-orchestrator | Backlog |
| T-010 | Session lifecycle + i18n resolver (EN/ES/KO) | P0 | BE-Tran | T-009 | 3d | FR-001,002,NFR-003 | #110 | feature/110-session-i18n | Backlog |
| T-011 | Auth Gate (Shopify account / social / guest order lookup) | P0 | BE-Kim | T-003,T-010 | 5d | FR-006~009 | #111 | feature/111-auth-gate | Backlog |
| T-012 | RAG service + Knowledge Store + GDrive supplement | P0 | BE-Tran | T-007,T-009 | 6d | FR-013,020,021,022 | #112 | feature/112-rag | Backlog |
| T-013 | Conversation Log Store + CJM event emitter | P0 | BE-Kim | T-008 | 3d | FR-018,026,NFR-007 | #113 | feature/113-log-cjm | Backlog |

### Phase 2 — Customer Widget (위젯, React) → Milestone M2 (MVP)

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-014 | Notification Center container (tabs/badges/settings) | P0 | FE-Lee | T-010 | 4d | FR-028 | #114 | feature/114-notif-center | Backlog |
| T-015 | Welcome + scenario menu + AI disclosure | P0 | FE-Lee | T-014 | 3d | FR-002,003,038,NFR-009 | #115 | feature/115-welcome-menu | Backlog |
| T-016 | Notification inbox + filters + read state | P0 | FE-Vu | T-014 | 4d | FR-029,NFR-011 | #116 | feature/116-notif-inbox | Backlog |
| T-017 | Orders panel + order detail + delivery stepper | P0 | FE-Vu | T-011,T-016 | 5d | FR-030,031,032,033 | #117 | feature/117-orders-panel | Backlog |
| T-018 | Chat UI + Product Help submenu + RAG rendering | P0 | FE-Lee | T-012,T-015 | 5d | FR-005,013,038 | #118 | feature/118-chat-ui | Backlog |
| T-019 | Order status / cancel-refund flow | P0 | FE-Vu | T-011,T-017 | 3d | FR-010,011,012 | #119 | feature/119-order-flow | Backlog |
| T-020 | User notification preference center | P0 | FE-Vu | T-014 | 2d | FR-049 | #120 | feature/120-notif-prefs | Backlog |
| T-021 | Logged-in personalization header | P1 | FE-Lee | T-010 | 2d | FR-050 | #121 | feature/121-personalize | Backlog |

### Phase 3 — Notifications & Feature Flows (알림·기능 플로우) → Milestone M3

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-022 | Notifier + channel mapping (in-app/email/SMS/Web Push PWA) | P0 | BE-Tran | T-013 | 5d | FR-023,024,NFR-005 | #122 | feature/122-notifier | Backlog |
| T-023 | Order/fulfillment webhook → notification pipeline | P0 | BE-Kim | T-004,T-022 | 3d | FR-043 | #123 | feature/123-order-notif | Backlog |
| T-024 | Review request (N-day trigger) + review writing | P1 | FE-Lee | T-017,T-022 | 4d | FR-034 | #124 | feature/124-reviews | Backlog |
| T-025 | Affiliate program flow (apply/review/link) | P1 | FE-Vu | T-015,T-013 | 4d | FR-035 | #125 | feature/125-affiliate | Backlog |
| T-026 | Restock alert + subscription management | P1 | BE-Tran | T-006,T-022 | 4d | FR-036,037 | #126 | feature/126-restock-sub | Backlog |
| T-027 | Multi-channel contact support card | P0 | FE-Lee | T-015 | 2d | FR-039 | #127 | feature/127-contact | Backlog |
| T-028 | Event/coupon campaign + Klaviyo targeting | P1 | BE-Tran | T-005,T-022 | 4d | FR-040,041 | #128 | feature/128-campaign | Backlog |

### Phase 4 — Escalation & Admin Console (상담·관리자) → Milestone M3

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-029 | Live agent console + AI→agent handoff | P0 | FE-Lee | T-012,T-013 | 6d | FR-015,016,017 | #129 | feature/129-agent-console | Backlog |
| T-030 | AI agent-assist briefing (summary/intent/sentiment/action) | P1 | BE-Tran | T-029 | 5d | FR-045 | #130 | feature/130-ai-assist | Backlog |
| T-031 | Admin monitoring dashboard + analytics | P0 | FE-Vu | T-013,T-022 | 5d | FR-044 | #131 | feature/131-admin-dash | Backlog |
| T-032 | Conversation history (search/view/export) | P0 | FE-Vu | T-013 | 3d | FR-046,019 | #132 | feature/132-conv-history | Backlog |
| T-033 | AI Setting / AI Chat Setting (bot/rules/knowledge/scenario) | P0 | FE-Lee | T-012 | 5d | FR-047,022,003 | #133 | feature/133-ai-setting | Backlog |
| T-034 | Customer & Product management modules | P1 | FE-Vu | T-006,T-003 | 4d | FR-048 | #134 | feature/134-cust-prod-mgmt | Backlog |
| T-035 | Admin notification dispatch UI / Event Setting / Recipes | P0 | FE-Lee | T-022,T-028 | 4d | FR-025,040 | #135 | feature/135-admin-notif | Backlog |
| T-049 | Agent management + assignment/routing (등록·배정) | P0 | BE-Kim | T-029 | 4d | FR-066,067 | #149 | feature/149-agent-mgmt | Backlog |
| T-050 | Consult statistics (상담 통계) | P0 | FE-Vu | T-031,T-049 | 3d | FR-068 | #150 | feature/150-consult-stats | Backlog |
| T-051 | Response moderation filter — word + context (응답 필터) | P0 | BE-Tran | T-012,T-029 | 5d | FR-069,NFR-013 | #151 | feature/151-moderation | Backlog |
| T-052 | AI Provider Gateway — multi-engine + admin selection (AI 엔진) | P0 | BE-Tran | T-012 | 4d | FR-070 | #152 | feature/152-ai-gateway | Backlog |

### Phase 5 — Cross-cutting & QA (공통·QA) → Milestone M4 (Release)

| ID | Task | Priority | Assignee | Depends On | Effort | FR Ref | GitHub | Branch | Status |
|----|------|----------|----------|------------|--------|--------|--------|--------|--------|
| T-036 | CCPA compliance (consent/opt-out/deletion/retention) | P0 | BE-Kim | T-013 | 4d | NFR-004 | #136 | feature/136-ccpa | Backlog |
| T-037 | i18n content EN/ES/KO (static strings) | P0 | FE-Lee | T-010 | 3d | NFR-003 | #137 | feature/137-i18n-content | Backlog |
| T-038 | Unit tests (TC-001~) | P0 | QA-Park | T-019,T-023 | 5d | all P0 | #138 | feature/138-unit-tests | Backlog |
| T-039 | Integration / E2E tests (S1~S17) | P0 | QA-Park | T-038 | 6d | all | #139 | feature/139-e2e-tests | Backlog |
| T-040 | Performance & hardening (RAG latency, widget load, notif center) | P0 | BE-Tran | T-012,T-014 | 4d | NFR-001,002,011 | #140 | feature/140-performance | Backlog |

## 2. Milestones (마일스톤)

| Milestone | Completion Criteria | Tasks | Target |
|-----------|--------------------|-------|--------|
| **M1 — Foundation** | Environments, integrations, DB/ERD, orchestrator, auth, RAG, logging | T-001~T-013 | Week 4 |
| **M2 — MVP Widget** | Notification Center, chat/RAG, auth, orders/tracking, order flow, notif prefs, notifier, order notifications, agent console, CCPA, i18n | T-014~T-023, T-029, T-036, T-037 | Week 8 |
| **M3 — Full Features** | Reviews, affiliate, restock/subscription, campaign, AI-assist, admin dashboard/history/settings, customer/product mgmt | T-024~T-028, T-030~T-035 | Week 12 |
| **M4 — QA & Release** | Unit + E2E + performance passed; critical/major bugs = 0 | T-038~T-040 | Week 14 |

## 3. Effort Summary (공수 요약)

| Phase | Tasks | Effort (man-days) |
|-------|-------|-------------------|
| Phase 0 — Environment & Integrations | T-001~T-007 | 18d |
| Phase 1 — Backend Foundation | T-008~T-013 | 25d |
| Phase 2 — Customer Widget | T-014~T-021 | 28d |
| Phase 3 — Notifications & Flows | T-022~T-028 | 26d |
| Phase 4 — Escalation & Admin | T-029~T-035 | 32d |
| Phase 5 — Cross-cutting & QA | T-036~T-040 | 22d |
| **Total** | **40 tasks** | **151 man-days** |

## 4. GitHub Project Board (보드)

- **Board**: "IVY Chat Widget Development"
- **Columns**: 📋 Backlog → 🔨 In Development → 👀 In Review → 🧪 Testing → ✅ Done
- **Labels**: `priority:P0|P1|P2`, `phase:0~5`, `chat-widget`, `area:widget|backend|admin|integration|qa`
- **Milestones**: M1 Foundation / M2 MVP / M3 Full / M4 Release
- **Redmine sync**: each task carries `github_issue_id`; status mapping per process standard.

## 5. Critical Path (주요 경로)

```
T-001 → T-002 → T-008 → T-009 → T-011 → T-017 → T-019 → T-038 → T-039
                      └→ T-012 → T-018 / T-029 ┘
```
Auth (T-011) and RAG (T-012) are the highest-fan-in dependencies; prioritize to protect the schedule.

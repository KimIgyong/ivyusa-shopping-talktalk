# Requirements Analysis — IVY USA Chat & Support Widget

| | |
|---|---|
| Doc ID | CHATWIDGET-REQ-ANALYSIS-1.0.0 |
| Date | 2026-06-18 |
| Source | `design/` design set (README index) + `standards/` Amoeba standards |
| Stage | SDLC Stage 1 (Analysis) — per `reference/amoeba_basic_Structure_v2.md` §8.2 |

## 1. Purpose
Multi-tenant AI-assisted chat & customer-support widget for a Shopify storefront
(Naver TalkTalk style), with a tenant operator console and a platform-admin console.
Initial tenant: IVY USA. This document summarizes the requirements that drive the
implementation; the authoritative source is the `design/` artifact set.

## 2. Scope (from design)
- **Functional**: FR-001…070 across 15 functional modules (FN-001…053). Widget core &
  notification center, session & i18n, scenario engine, auth gate, RAG, orders/tracking,
  notifications, reviews, affiliate, restock/subscription, escalation & agent console,
  AI assist, agent mgmt & moderation, AI provider gateway, admin & analytics, integrations,
  logging & CJM.
- **Non-functional**: NFR-001…013 (RAG latency, async widget load, i18n EN/ES/KO,
  CCPA/GDPR, web push, data integrity, multi-tenancy isolation, AI disclosure, order-status
  taxonomy, notification-center perf, RBAC isolation, moderation reliability).
- **Actors**: System Admin (super/admin); Tenant User (master/director/manager/staff ×
  consult/accounting/operations labels); Customer (guest/subscriber/regular).
- **Data**: 37 tables (`design/chat-widget-schema.sql`). **Screens**: SCR-001…013 (widget),
  SCR-101…106 / 201…207 (admin).

## 3. Key analysis decisions
- Backend framework: **NestJS** (per `chat-widget-architecture-report.md` + Amoeba Structure
  standard) over the README's loose "Next.js" label.
- DB: **MySQL 8** (the ERD `chat-widget-schema.sql` is the source of truth).
- i18n: **en/es/ko** (NFR-003: North-America storefront), not the standard's ko/en/vi.
- Documented deviations recorded in `SPEC.md §13`.

## 4. Traceability
FR → FN → SCR → TBL → SEQ → T, maintained per the design README §4 traceability map.
Downstream: `docs/plan/PLAN-ChatWidget-WorkPlan-20260618.md`,
`docs/implementation/RPT-ChatWidget-Implementation-20260618.md`,
`docs/test/TC-ChatWidget-Test-20260630.md`, `docs/report/RPT-Standards-Compliance-Audit-20260619.md`.

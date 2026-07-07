# IVY USA Chat & Customer-Support Widget — Service Introduction

> Version 1.0.0 · 2026-07-01 · Audience: Executives · Adoption evaluators · Partners
> Document type: Service overview and design concept (based on actual implementation status)

---

## 1. The service at a glance

The IVY USA Chat & Support Widget is a **multi-tenant, AI-assisted support widget embedded in a Shopify storefront**. It delivers a Naver-TalkTalk-style experience and handles customer inquiries in three tiers — automated and human combined:

1. **Scenario chatbot** — instantly guides routine inquiries (delivery, cancel/refund, product, affiliate, etc.) through a button-driven menu.
2. **RAG knowledge-based AI chatbot** — answers what the scenario menu can't, grounded in the tenant's knowledge base (KB), and cites its sources.
3. **Agent escalation (handoff)** — automatically connects to a human agent when AI confidence is low or the question is outside the knowledge scope.

It ships with a **tenant operator console** (live chat, settings, knowledge, customers) and a **platform-admin console** (tenants, AI engines, audit). The initial tenant is IVY USA.

---

## 2. Core values

| Value | Description |
|---|---|
| **Grounded AI** | RAG answers only from designated, active knowledge sources and cites them. When evidence is insufficient it hands off to an agent instead of guessing. |
| **Safe by default** | Every AI and agent outbound message passes a non-bypassable moderation gate. On error the default is "block" (fail-safe). |
| **Tenant isolation** | Data, settings, credentials, and AI routing are isolated per tenant. Cross-tenant exposure is structurally prevented. |
| **Compliance** | CCPA/CPRA + GDPR posture — consent, opt-out, encryption, and audit logging are built in. |
| **Pluggable AI** | AI engines (Anthropic, etc.) are selectable per function (chat/rag/summary/assist/moderation) and degrade to a stub on failure. |

---

## 3. Response-flow concept

```
Storefront customer (widget)
      │
      ▼
[Anonymous entry] ── Scenario chatbot (button menu)
      │               Delivery · Cancel/Refund · Product help · Affiliate · My orders · Contact agent
      │
      ├─(needs order / personal data)──▶ Identity gate (sign-in / guest order lookup)
      │
      ▼
[Routine answer insufficient] ── RAG knowledge-based AI chatbot
      │               KB retrieval → grounded generation → source citation → moderation gate
      │
      ├─(confidence < 0.45  OR moderation-blocked  OR customer requests)
      ▼
[Agent handoff] ── Agent console (queue → accept → AI briefing → moderated reply)
```

---

## 4. System architecture (design concept)

A **Turborepo monorepo** of three apps and two shared packages.

- `apps/widget` — Shopify-embedded customer widget (React 18)
- `apps/web` — operator/admin SPA console (React 18 + react-router)
- `apps/api` — backend API (NestJS 10, `/api/v1`)
- `packages/types`, `packages/common` — shared enums, response envelope, RBAC matrix, utils

**Tech stack**

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · Zustand · TanStack React Query · react-i18next |
| Backend | NestJS 10 · TypeORM · MySQL 8 · Redis 7 · RabbitMQ · JWT · AES-256-GCM |
| AI | Pluggable AI gateway (stub / Anthropic adapter) |
| i18n | English (en, default) · Spanish (es) · Korean (ko) |

**Design principles**: Clean Architecture + DDD, domain-modular, API-first, 4-layer (Controller → Service → Entity → Repository), `tenant_id`-based multitenancy. Controllers hold no business logic; services own the logic and tenant scoping.

```
Shopify storefront ─▶ apps/widget ─┐
Operators/Admins   ─▶ apps/web    ─┼─▶ apps/api (NestJS)
                                    │     ├─ MySQL 8 (TypeORM)
                                    │     ├─ Redis 7 (cache/session/unread)
                                    │     ├─ RabbitMQ (notif/CJM/log events)
                                    │     ├─ AI gateway → stub | Anthropic
                                    │     └─ Moderation gate (fail-safe block)
External: Shopify · Fulfillment webhook · Klaviyo · Odoo · Google Drive
          (per-tenant credentials, AES-256-GCM encrypted)
```

---

## 5. Feature overview

**Customer widget**
Chat widget, notification center (unread badge), scenario button menu, session & i18n, RAG product Q&A, order/delivery lookup, reviews/affiliate/restock/subscription requests, agent handoff.

**Operator console (tenant)**
- Dashboard — support metrics overview
- Live chat — queue, conversation takeover, AI briefing, moderated replies, end
- History — filter by status / escalation
- AI settings — bot persona, response rules, scenario buttons, per-function AI engine, moderation rules
- Knowledge (KB) — knowledge sources & documents (Knowledge Store first, Google Drive supplements)
- Customers — Shopify customer cache & tier lookup
- Campaigns · Users/permissions · Settings

**Platform-admin console**
Overview, tenant management, AI engine management, audit log.

**Shared foundation**
RBAC (rank master/director/manager/staff × label consult/accounting/operations), standard response envelope, error-code system (Exxxx), audit logging, PII masking.

---

## 6. AI integration concept

`AiGatewayService` resolves the engine for a `(tenant, function)` pair via `tenant_ai_settings → ai_engines`, dispatches to a provider adapter (stub | Anthropic), and normalizes the result. On failure it degrades to the stub so the service stays up.

Application areas: RAG answering (with citations), intent classification, agent AI briefing, response moderation (LLM context classifier), rephrase. **All AI outbound must pass the moderation gate.**

---

## 7. Security & compliance

- **Authentication**: admins/operators use JWT (access 15 min / refresh 7 days). The customer widget uses an opaque session token + Shopify customer auth / guest order lookup (max 5 attempts per 15 min, Redis rate-limited).
- **Encryption**: passwords bcrypt (cost 12), external credentials AES-256-GCM.
- **Privacy**: PII masking in logs, audit logging, retention/disposal policy (default 365 days), Shopify GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`, HMAC-verified), DSAR export/delete and CCPA "Do Not Sell or Share" opt-out.
- **Multitenancy**: `tenant_id` on all tenant-scoped tables + AsyncLocalStorage tenant context + TypeORM subscriber auto-stamping.

---

## 8. Current implementation status (honest snapshot)

> The real state you need for an adoption decision. Marked **Implemented / Designed-and-wired / Roadmap**.

| Area | Status | Notes |
|---|---|---|
| Scenario-button chatbot + admin config | ✅ Implemented | 6 default actions, per-tenant customizable |
| RAG answering + citations + confidence scoring | ✅ Implemented | Retriever is **keyword-based** (stands in for a vector store) |
| Moderation gate (AI & agent outbound) | ✅ Implemented | Fail-safe block, unit-tested |
| Agent handoff · console · AI briefing | ✅ Implemented | Queue / accept / end / stats |
| Bot persona · response rules · per-function engine | ✅ Implemented | AI settings screen |
| Shopify customer cache · order cache · delivery lookup | ✅ Implemented | Customer/Order domains |
| Multitenancy · RBAC · audit · privacy (GDPR/DSAR) | ✅ Implemented | Standards-compliance audit closed |
| AI engine adapters | ✅ Stub / ✅ Anthropic | Stub runs with no key |
| **RAG vector search (embeddings)** | 🟡 Roadmap | Keyword retrieval stands in today |
| **Odoo connector live sync** | 🟡 Status-tracked only | `integration_status` and credential schema ready; sync logic is roadmap |
| **AI token quota (E4010/E4011)** | 🟡 Reserved | Error codes reserved; per-tenant metering is roadmap |
| **Staging/production deploy** | ✅ Docker artifacts | Domains & ops pipeline TBD |
| Test coverage | 🟡 Partial | 46 unit tests; e2e is roadmap |

**Summary**: The three-tier flow (scenario → RAG → agent), admin configuration, moderation, and multitenancy/compliance all work. Next-phase items are RAG vector-search upgrade, live Odoo sync, token-quota metering, and e2e tests.

---

## 9. Adoption benefits in brief

- Routine inquiries are resolved instantly by the bot, **reducing agent workload**.
- RAG answers **from evidence**, lowering wrong-answer/hallucination risk and building trust via citations.
- Low-confidence or risky answers are automatically handed to a human, **preserving quality and safety**.
- The multi-tenant design **scales across multiple Shopify stores**.
- Built-in privacy and moderation policies **ease the compliance burden**.

---

*Contact: IVY USA project team · Related docs: SPEC.md, User Manual*

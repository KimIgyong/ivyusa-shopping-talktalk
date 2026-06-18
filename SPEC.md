# IVY USA Chat & Support Widget — Project Specification (SPEC)

| | |
|---|---|
| **Project** | IVY USA Chat & Customer Support Widget |
| **Code** | CHATWIDGET |
| **Version** | 1.0.0 |
| **Date** | 2026-06-18 |
| **Domain** | Shopify storefront customer support (Naver TalkTalk style) |
| **Standard** | Amoeba Basic SPEC v2 / Structure v2 / Code Convention v2 |

## 1. Overview

A multi-tenant, AI-assisted chat & customer-support widget embedded in a Shopify
storefront, plus a tenant operator console and a platform-admin console. Initial
tenant: **IVY USA**. Covers product Q&A (RAG), order/delivery lookup, reviews,
affiliate, restock/subscription, multi-channel notifications, human-agent
escalation with a self-built console, outbound response moderation, and a
pluggable multi-engine AI gateway.

**Actor groups**
- **System Admin** — Super Admin / Admin (cross-tenant platform).
- **Tenant User** — Master / Director / Manager / Staff × job labels (Consult / Accounting / Operations).
- **Customer** — Guest / Subscriber / Regular (Shopify tier = source of truth).

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 + TailwindCSS + Zustand + React Query, i18n (en/es/ko) |
| Widget delivery | Shopify Theme App Embed (async, lightweight) |
| Backend | NestJS 10 + TypeScript 5 (Clean Architecture + DDD), REST `/api/v1` + SSE |
| Database | MySQL 8 (utf8mb4 / InnoDB) + TypeORM |
| Cache / Session | Redis 7 (tenant-prefixed keys, unread counts) |
| Queue | RabbitMQ (notification dispatch, conversation logging, CJM events) |
| AI | Pluggable AI Provider Gateway (Anthropic Claude default; OpenAI/Google/Azure/custom) |
| Build | Turborepo monorepo |
| Infra | Docker (dev/staging/production), Nginx |

## 3. Architecture (4-layer)

`Controller (presentation) → Service (application) → Entity (domain) → Repository (infrastructure)`.
Multi-tenancy via `tenant_id` row isolation enforced by an app-layer scope +
`TenantGuard`. Standard response wrapping, global exception filter, JWT auth with
`@Auth()` / `@AdminOnly()` / `@MasterOrAdmin()` decorators, RBAC (rank × label)
layered with an ACL owner-visibility model (POL-019).

## 4. Project Structure

```
ivy-talktalk/
├── apps/
│   ├── api/      # NestJS backend (domain/, global/, infrastructure/)
│   ├── web/      # React admin SPA (tenant console + platform admin)
│   └── widget/   # React Theme App Embed (customer widget)
├── packages/
│   ├── types/    # Shared TS types, enums, status maps, RBAC types
│   └── common/   # Utilities + permission matrix
├── docker/  env/  sql/  docs/  reference/  scripts/
```

## 5. Database

DB name `db_ivy_talktalk`. ~37 tables (see `design/chat-widget-schema.sql`, mirrored
in `sql/`). Core chat/commerce (19) + tenancy/RBAC + bootstrap/invitation +
knowledge sources (3 modes) + agent mgmt/moderation + AI engine management.
Dev: `synchronize=true`; staging/prod: manual SQL migration in `sql/`.

## 6. API

Base `/api/v1`. Bearer JWT (Access 15m / Refresh 7d). Standard single/list response
envelopes (`@ivy/types`). Request DTO `snake_case`, response DTO `camelCase`.
Error codes E1xxx–E9xxx (see `global/constant/error-code.constant.ts`).

## 7. Auth & RBAC

JWT for admin + tenant users. Customer widget uses session token (+ Shopify
customer auth / guest order lookup). RBAC = rank × label capability matrix
(`@ivy/common/permission-matrix`), persisted/overridable in `roles_permissions`.
Secrets encrypted AES-256-GCM (`CRED_ENC_KEY`).

## 8. AI Integration

`AiGatewayService` resolves the engine for a `(tenant, function)` via
`tenant_ai_settings` → adapter (anthropic/openai/google/azure/custom). A **stub**
adapter runs without API keys for local dev. All AI/agent outbound passes the
non-bypassable **moderation gate** (FR-069 / POL-020, fail-safe = block on error).

## 9. Traceability

Every module maps to design IDs: FR (requirement) → FN (function) → SCR (screen) →
TBL (table) → SEQ (sequence). Implementation reports in `docs/implementation/`.

## 10. Reference

`reference/amoeba_*` company standards; `design/` design artifacts; `README.md`
artifact index.

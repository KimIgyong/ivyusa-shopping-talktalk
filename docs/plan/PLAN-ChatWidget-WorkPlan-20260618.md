# Work Plan — IVY USA Chat & Support Widget

| | |
|---|---|
| Doc ID | CHATWIDGET-PLAN-WORKPLAN-1.0.0 |
| Date | 2026-06-18 |
| Stage | SDLC Stage 2 (Plan) — `reference/amoeba_basic_Structure_v2.md` §8.2 |
| Inputs | `docs/analysis/REQ-ChatWidget-Implementation-20260618.md`, `design/chat-widget-wbs.md` |

## 1. Build phases (executed)
1. **Scaffold** — Turborepo monorepo (`apps/{api,web,widget}`, `packages/{types,common}`), docker/env/sql/docs/reference, SPEC/CLAUDE/CHANGELOG.
2. **API foundation** — config, standard response interceptor, exception filter + Exxxx codes, JWT + RBAC guards, AES-256-GCM, Redis, RabbitMQ event bus, pluggable AI gateway (stub + Anthropic), moderation gate.
3. **Entities** — 37 TypeORM entities mirroring `chat-widget-schema.sql`.
4. **Domain modules (22)** — auth, session, chat+rag, moderation, ai-engine, tenant, user, customer, order, inquiry, review, affiliate, restock, subscription, notification, campaign, cjm, knowledge, agent, analytics, audit, integration, privacy.
5. **Frontends** — admin SPA (`apps/web`) + customer widget (`apps/widget`), i18n en/es/ko.
6. **Seed + infra** — idempotent seed, docker compose (dev + staging/production), deploy scripts.
7. **Hardening (standards alignment)** — full multi-tenancy (`tenant_id` + tenant-scope), GDPR/DSAR/retention, PII-safe logging, tests, a11y, query keys.

## 2. Milestones (design WBS M1–M4)
M1 foundation+auth · M2 chat/RAG+orders · M3 notifications/agent/admin · M4 hardening+compliance.

## 3. Quality gates
`turbo run build` (5/5) · `turbo run test` (40 unit tests) · runtime smoke (auth, RBAC, RAG,
orders, privacy) · standards-compliance audit (`docs/report/`).

## 4. Conventions enforced
Amoeba code_convention (DTO snake/camel, layers, `@Auth` decorators, mappers, Exxxx),
Structure (monorepo + domain modules), web_style_guide (tokens/a11y), privacy_compliance.
Per-module reference: `.claude/skills/ivy-talktalk-dev/SKILL.md`.

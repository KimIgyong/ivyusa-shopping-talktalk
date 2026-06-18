# Changelog

All notable changes to the IVY USA Chat & Support Widget implementation.
Format based on [Keep a Changelog](https://keepachangelog.com/); follows Amoeba SDLC.

## [Unreleased]

### Added — Stage 3 Implementation (Build)
- **Monorepo scaffold** (Turborepo): `apps/{api,web,widget}`, `packages/{types,common}`. Root configs, `env/`, `docker/`, `sql/`, `docs/`, `reference/`, `scripts/` per Amoeba Structure v2. `SPEC.md`, `CLAUDE.md`.
- **Shared packages**: `@ivy/types` (enums, response envelope, RBAC types, order status maps), `@ivy/common` (rank×label permission matrix, token/pagination utils).
- **API foundation**: global config (MySQL/TypeORM), standard response interceptor, exception filter + Exxxx error codes, JWT auth guard + RBAC authorization guard, `@Auth/@AdminOnly/@RequireRank/@RequireCapability` decorators, AES-256-GCM crypto, Redis cache, RabbitMQ event bus (in-process fallback), pluggable AI gateway (stub + Anthropic adapters).
- **37 TypeORM entities** mirroring `chat-widget-schema.sql`.
- **22 domain modules**: auth, session, chat+rag, moderation, ai-engine, tenant, user, customer, order, inquiry, review, affiliate, restock, subscription, notification, campaign, cjm, knowledge, agent, analytics, audit, integration.
- **Seed** (`apps/api/src/database/seed.ts`): tenant ivyusa, system admin + tenant master, job labels, AI engines + per-function routing, moderation rules, KB docs, demo customer/orders/notifications, integration status.
- Backend **typecheck + nest build green**.

- **Widget frontend** (`apps/widget`, :5174): Naver TalkTalk–style floating widget — Notification Center (3 tabs), RAG chat, scenario menu + Product Help submenu, CCPA consent + AI disclosure, auth gate, orders panel + 4-step delivery stepper, review form, affiliate/contact cards, notification preferences (SCR-001..013).
- **Admin frontend** (`apps/web`, :5173): tenant console (dashboard, live chat + AI briefing, history, AI settings + moderation rules, knowledge, customers, campaigns, users/labels, settings) + platform admin (tenants, AI engines, audit), RBAC-gated nav (SCR-101..207).

### Verified (2026-06-18)
- Full `turbo run build` green (5/5 workspaces).
- Infra up, seed builds 37 tables + data, API boots with all routes, RabbitMQ connected.
- E2E smoke tests pass: auth, RBAC allow/deny, widget RAG chat with KB citations through the moderation gate, auth gate, guest order lookup.

> Build is traceable to design IDs (FR/FN/SCR/TBL/SEQ). See `docs/implementation/RPT-ChatWidget-Implementation-20260618.md`.

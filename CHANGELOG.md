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

### Added — i18n + Standards alignment (2026-06-19)
- **i18n en/es/ko** end-to-end: react-i18next in `apps/web` (16 namespaces) and `apps/widget` (session-tied), language switchers, `fallbackLng:'en'`; backend chat conversational strings localized by `session.language`. No hardcoded UI text (per code_convention §14).
- **Standards-compliance audit** → `docs/report/RPT-Standards-Compliance-Audit-20260619.md` (6 standards + code_convention violation table + remediation roadmap).
- **Standard-aligned docs**: `SPEC.md` rewritten to the Amoeba SPEC v2 12-section template (+ approved deviations §13, gap roadmap §14); `CLAUDE.md` rewritten to skill/convention/structure; new project skill `.claude/skills/ivy-talktalk-dev/SKILL.md`.
- **High-priority gap fixes**:
  - **Privacy/GDPR** (`domain/privacy`): Shopify compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`, HMAC-verified) + DSAR endpoints (export/portability, delete/anonymize) + CCPA "Do Not Sell or Share" opt-out toggle. Privileged actions audited.
  - **Tenant threading**: `sessions.tenant_id` added and used by chat (removed the "first tenant" lookup; safe fallback retained).
  - **bcrypt** cost raised 10→12 via shared `BCRYPT_ROUNDS` constant.
  - **Full multi-tenancy**: `tenant_id` added to all 14 remaining customer/tenant-scoped tables; AsyncLocalStorage `TenantContext` + global `TenantContextInterceptor` + TypeORM `TenantSubscriber` (auto-stamp on insert); admin reads filtered by `user.tenantId`. Verified 0 null tenant_id on new rows + tenant-filtered admin lists. Seed now self-heals bootstrap credentials + backfills tenant_id.

### Added — Medium gap fixes (2026-06-30)
- **Privacy/retention**: full tenant purge in Shopify `shop/redact`; `LoggingInterceptor` (no PII in logs) + `maskPii` util; DSAR-export audit; `RetentionService` + `POST /privacy/retention/purge` (POL-003, `CONVERSATION_LOG_RETENTION_DAYS`).
- **Deployment**: `docker/{staging,production}` Dockerfiles (api/web), env-separated compose (validated), nginx reverse proxy, `deploy-{dev,staging,production}.sh` (Structure §5.1).
- **Frontend**: tenantId in React Query keys (admin, `useTenantKey()`); WCAG a11y — modals (`role=dialog`/`aria-modal`/Esc/focus-restore), chat logs (`role=log`/`aria-live`), icon-button `aria-label`s, focus rings — in admin + widget (aria text via i18n en/es/ko).
- **Tests**: Jest + ts-jest; 40 passing unit tests (`npm test`) — permission-matrix (rank×label), order status-map, moderation fail-safe (NFR-013), authorization guard. `*.spec.ts` excluded from builds.
- **Convention polish**: chat/session inline DTOs → `dto/request/` + `ChatMapper`/`SessionMapper`; `@MasterOrAdmin()` decorator alias (guard-enforced); full primary 50–900 Tailwind ramp (both apps).
- **DTO normalization**: all 15 remaining flat/inline DTO modules moved to `dto/request/*.request.ts` (+ `dto/response` where applicable); no inline DTO classes left in controllers.
- **SDLC doc chain**: `docs/analysis/REQ-…`, `docs/plan/PLAN-…`, `docs/test/TC-…` (Structure §8.2). Tests broadened to 46 (TenantSubscriber auto-stamp, RAG intent fallback). Soft-delete intentionally omitted (hard-delete + anonymize disposal model).

### Added — Staging deployment prep (2026-06-30)
- **Health endpoint** `GET /api/v1/health` (liveness + DB readiness) + api `healthcheck` in staging/production compose.
- **Self-bootstrap**: `runSeed(dataSource)` runner extracted; `SEED_ON_BOOT=true` seeds at API startup (no ts-node in image). `SEED_DEMO_DATA`/`SEED_PASSWORD` knobs.
- **init-sql fixed**: `docker/init-sql/01-schema.sql` regenerated as valid schema-only DDL (backticked `rank`/`function`, seed INSERTs stripped). Staging drops the init-sql mount (uses `synchronize` + `SEED_ON_BOOT`); production keeps it (`synchronize=false`).
- **Root `.dockerignore`** added (build context = repo root) so host `node_modules`/`dist` aren't copied into images.
- `.env.staging`/`.env.production.example` extended (SEED_*, SHOPIFY_WEBHOOK_SECRET); real `.env.staging` generated with strong secrets (gitignored).
- **Deploy runbook** `docs/guide/STAGING-DEPLOY.md` (checklist, deploy, verify, rollback).
- **Validated**: staging `Dockerfile.api` builds; the image boots, connects to MySQL (`/health` db: up), and authenticates — verified end-to-end.

### Verified (2026-06-18 / 2026-06-19 / 2026-06-30)
- Full `turbo run build` green (5/5 workspaces).
- Infra up, seed builds 37 tables + data, API boots with all routes, RabbitMQ connected.
- E2E smoke tests pass: auth, RBAC allow/deny, widget RAG chat with KB citations through the moderation gate, auth gate, guest order lookup.

> Build is traceable to design IDs (FR/FN/SCR/TBL/SEQ). See `docs/implementation/RPT-ChatWidget-Implementation-20260618.md`.

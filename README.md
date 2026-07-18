# IVY USA Chat & Support Widget

> Multi-tenant, AI-assisted chat & customer-support widget for Shopify storefronts
> (Naver TalkTalk style) — customer widget + tenant operator console + platform-admin console.
> Initial tenant: **IVY USA**. Built to the Amoeba company standards (`standards/`, `reference/`).

[![build](https://img.shields.io/badge/build-passing-brightgreen)](#) [![tests](https://img.shields.io/badge/tests-62%20passing-brightgreen)](#) [![staging](https://img.shields.io/badge/staging-live-blue)](https://shoptalk.amoeba.site)

---

## 1. What it is (프로젝트 개요)

A single embeddable widget lives on a Shopify storefront and gives shoppers AI-grounded
product Q&A, order/delivery lookup, reviews, restock/subscription, and one-click escalation
to a human agent — in **English / Spanish / Korean**. Behind it sits a **tenant console** for
operators (live chat, AI briefing, knowledge base, customers, campaigns, settings) and a
**platform-admin console** for cross-tenant operations (tenants, AI engines, audit).

The platform is **multi-tenant** (each tenant = one Shopify shop), **safe-by-default** (every
AI/agent outbound message passes a non-bypassable moderation gate), **grounded** (RAG answers
cite only active knowledge sources), and **compliant** (CCPA/CPRA + GDPR: consent, opt-out,
DSAR, Shopify compliance webhooks, encryption, audit).

| Value | Meaning |
|---|---|
| **Grounded AI** | RAG answers only from designated, active knowledge sources; cites sources |
| **Safe by default** | Non-bypassable outbound moderation gate (fail-safe = block) for AI + agents |
| **Tenant isolation** | Per-tenant data, settings, credentials, AI routing — never leak cross-tenant |
| **Compliance** | CCPA/CPRA + GDPR posture; consent, opt-out, encryption, audit |
| **Pluggable AI** | Per-function engine selection (stub → Anthropic ready; OpenAI/Google/Azure planned) |

## 2. Users (사용자 유형)

| Group | Roles | Surface |
|---|---|---|
| **System Admin** | Super Admin / Admin (cross-tenant) | Platform-admin console (`apps/web`) |
| **Tenant User** | Master / Director / Manager / Staff × labels (Consult / Accounting / Operations) | Tenant console (`apps/web`) |
| **Customer** | Guest / Subscriber / Regular (Shopify tier = source of truth) | Storefront widget (`apps/widget`) |

## 3. Feature highlights (주요 기능)

- **Widget core** — Naver TalkTalk–style floating launcher, Notification Center (3 tabs), scenario menu, product-help submenu.
- **Chat & RAG** — intent classification → grounded answers with source citations; **guest mode** (product inquiry & general consultation without login) and **logged-in customer identity** via Shopify App Proxy.
- **Orders** — order/delivery lookup (logged-in + guest 5-attempt lookup), 4-step delivery stepper, fulfillment webhooks.
- **Commerce add-ons** — reviews, affiliate, restock alerts, subscription.
- **Escalation & agent console** — live chat with AI briefing, assignment, agent identity in bubbles, customer search/link/create.
- **AI gateway** — per-(tenant, function) engine routing with graceful stub fallback.
- **Moderation** — every AI + agent outbound is moderated (fail-safe block on error).
- **Admin & analytics** — dashboard with clickable KPI cards + recent orders, AI settings, moderation rules, knowledge base, customers, campaigns, users/labels.
- **Shopify integration** — OAuth install, App Proxy customer identity, on-demand + scheduled order/customer sync, native + GDPR compliance webhooks (HMAC-verified), in-console install guide (App embed / ScriptTag / theme.liquid).
- **Privacy** — DSAR export/delete, CCPA "Do Not Sell or Share" opt-out, retention purge.
- **i18n** — en / es / ko end-to-end (UI + backend conversational strings + a11y labels).

Full requirement traceability (FR/NFR → FN → SCR → TBL → SEQ → T): see [SPEC.md](SPEC.md) and [docs/PROJECT-ARTIFACT-INDEX.md](docs/PROJECT-ARTIFACT-INDEX.md).

## 4. Tech stack (기술 스택)

| Layer | Stack |
|---|---|
| **Frontend** | React 18 · TypeScript 5 · Vite 5 · TailwindCSS 3 · Zustand 4 · TanStack React Query 5 · react-i18next 14 · lucide-react |
| **Backend** | NestJS 10 · TypeORM 0.3 · MySQL 8 (utf8mb4/InnoDB) · Redis 7 · RabbitMQ 3.13 · @nestjs/jwt · class-validator · bcryptjs · AES-256-GCM |
| **AI** | Pluggable gateway — stub adapter (no key) + Anthropic adapter (`claude-opus-4-8`) |
| **Infra** | Docker Compose (dev/staging/production) · Turborepo monorepo · Nginx edge reverse proxy · Node ≥ 20 |
| **API** | REST `/api/v1` · Swagger `/api/v1/docs` · standard response envelope |

See [CONFIG.md](CONFIG.md) for the full environment / configuration reference.

## 5. Monorepo layout (프로젝트 구조)

```
ivy-talktalk/
├── apps/
│   ├── api/       # NestJS API — 26 domain modules, 40 entities, /api/v1
│   ├── web/       # React admin SPA (tenant console + platform admin)
│   └── widget/    # React customer widget (Shopify Theme App Embed style)
├── packages/
│   ├── types/     # @ivy/types — enums, response envelope, RBAC types, status maps
│   └── common/    # @ivy/common — rank×label permission matrix, token/pagination utils
├── docker/        # docker-compose {dev,staging,production} + Dockerfiles + nginx + deploy-*.sh
├── env/           # {backend,frontend}/.env.development (committed dev placeholders)
├── sql/           # 01-schema.sql (staging/prod migration reference)
├── docs/          # analysis · plan · implementation · test · report · guide · design · log
├── reference/  standards/   # Amoeba company standards (knowledge)
├── secrets/       # gitignored — staging server & SSH keys (never committed)
├── SPEC.md  CONFIG.md  CLAUDE.md  CHANGELOG.md
└── .claude/skills/ivy-talktalk-dev/   # project dev skill
```

**Backend module** (`apps/api/src/domain/{domain}/`): `entity/` · `dto/request/*.request.ts` (snake_case) + `dto/response/*.response.ts` (camelCase) · `{domain}.service.ts` · `{domain}.controller.ts` · `{domain}.mapper.ts` · `{domain}.module.ts`. Controllers do DTO/mapper glue only; services own business logic + tenant scoping.

## 6. Quick start (local dev)

**Prerequisites:** Node ≥ 20, Docker Desktop.

```bash
npm install
npm run db:up      # MySQL :3316 · Redis :6389 · RabbitMQ :5682 (docker/docker-compose.dev.yml)
npm run db:seed    # tenant ivyusa, admin+master accounts, labels, AI routing, KB, demo data
npm run dev        # API :3000 (/api/v1/docs) · admin web :5173 · widget :5174
```

**Seed logins** (must change on first login):
- `admin@amoeba.group` / `amb2026!@` — System Admin
- `dev@amoeba.group` / `amb2026!@` — Tenant Master (`ivyusa`)

| App | Path | Dev port |
|---|---|---|
| Backend API (NestJS) | `apps/api` | 3000 |
| Admin console | `apps/web` | 5173 |
| Customer widget | `apps/widget` | 5174 |

> Dev host ports are remapped off occupied defaults; `env/backend/.env.development` matches. If Docker Desktop is unstable, let the daemon settle (~40s) before `npm run db:up`.

## 7. Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Turbo dev — all apps in watch mode |
| `npm run build` | Full monorepo build (turbo, 5 workspaces) |
| `npm run typecheck` | Type-check all workspaces |
| `npm test` | Jest unit tests (62 passing: types 8 · common 12 · api 42) |
| `npm run db:up` / `db:down` | Start / stop dev infra containers |
| `npm run db:seed` | Seed tenant, accounts, labels, AI routing, KB, demo data |

## 8. Deployment

- **Staging — LIVE:** [`https://shoptalk.amoeba.site`](https://shoptalk.amoeba.site) (admin console at `/`, widget at `/widget/`). Host nginx + Let's Encrypt TLS → docker nginx `:8080`.
- **Production:** Docker templates ready (`docker/production/`), **not yet deployed** (needs a host + `.env.production`).

Deploy runbook: [docs/guide/STAGING-DEPLOY.md](docs/guide/STAGING-DEPLOY.md). Full environment/config reference: [CONFIG.md](CONFIG.md). Server connection & credentials: `secrets/staging-server.md` (gitignored, local-only).

```bash
# On the staging server (see CONFIG.md / secrets/staging-server.md):
bash docker/staging/deploy-staging.sh
curl -s https://shoptalk.amoeba.site/api/v1/health   # {"status":"ok","db":"up"}
```

## 9. Conventions & standards

This repo follows the **Amoeba v2 standards** (`reference/`, `standards/`): SPEC, Structure,
Code Convention, Web Style Guide, Privacy/Compliance, and the Spec-Generator skill. Working
rules for this repo are in [CLAUDE.md](CLAUDE.md) and the project skill
[`.claude/skills/ivy-talktalk-dev/SKILL.md`](.claude/skills/ivy-talktalk-dev/SKILL.md).

Key rules: DTO request `snake_case` / response `camelCase` (via Mapper); 4-layer
Controller→Service→Entity→Repository; RBAC = rank × label + ACL owner-visibility; multi-tenant
by `tenant_id`; no hardcoded UI text (all via `t()`); errors via `BusinessException(ERROR_CODE.X)`;
all AI/agent outbound through `ModerationService.moderate()`.

**Git:** `production` (prod) · `main` (default / staging integration) · `feature/*` · `hotfix/*`.
PR + squash-merge to `main`. Commits: `{type}: {description}` (feat|fix|docs|style|refactor|test|chore|hotfix).

## 10. Documentation map

| Doc | Purpose |
|---|---|
| [SPEC.md](SPEC.md) | Full project specification (Amoeba SPEC v2 template) |
| [CONFIG.md](CONFIG.md) | Tech spec + dev/staging/production environment & config reference |
| [CLAUDE.md](CLAUDE.md) | AI working instructions / conventions cheat-sheet |
| [CHANGELOG.md](CHANGELOG.md) | Build history (Keep a Changelog) |
| [docs/PROJECT-ARTIFACT-INDEX.md](docs/PROJECT-ARTIFACT-INDEX.md) | Design-artifact index & traceability map |
| [docs/](docs/) | analysis · plan · implementation · test · report · guide · design · log |
| [docs/guide/DEPLOYMENT-STRATEGY.md](docs/guide/DEPLOYMENT-STRATEGY.md) | Deployment strategy (branch→env, promotion, rollback, prod plan) |
| [docs/guide/STAGING-DEPLOY.md](docs/guide/STAGING-DEPLOY.md) | Staging deploy runbook (step-by-step) |
| [standards/](standards/) · [reference/](reference/) | Amoeba company standards (knowledge) |

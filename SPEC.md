# IVY USA Chat & Support Widget — Project Specification (SPEC)

> Authored to the **Amoeba Basic SPEC v2** template (`reference/amoeba_basic_SPEC_v2.md`).
> Reflects the actual implementation. Intentional deviations are listed in §13;
> open gaps and the remediation roadmap in §14 (see `docs/report/RPT-Standards-Compliance-Audit-20260619.md`).

## 1. Project Overview (프로젝트 개요)

### 1.1 Document Information (문서 정보)
| | |
|---|---|
| Project (프로젝트) | IVY USA Chat & Customer Support Widget |
| Code (코드) | CHATWIDGET |
| Version (버전) | 1.1.0 |
| Date (작성일) | 2026-07-15 (rev; base 2026-06-19) |
| Domain (도메인) | Shopify storefront customer support (Naver TalkTalk style) |
| Status (상태) | Staging **LIVE** at `https://shoptalk.amoeba.site`; production templates ready (not deployed) |
| Standards (표준) | Amoeba SPEC / Structure / Code Convention / Web Style Guide / Privacy / Skill v2 |

### 1.2 Service Introduction (서비스 소개)
A multi-tenant, AI-assisted chat & customer-support widget embedded in a Shopify
storefront, with a tenant operator console and a platform-admin console.
Initial tenant: **IVY USA**. Covers product Q&A (RAG), order/delivery lookup,
reviews, affiliate, restock/subscription, multi-channel notifications, human-agent
escalation, outbound response moderation, and a pluggable multi-engine AI gateway.

### 1.3 Core Values (핵심 가치)
| Value | Description |
|---|---|
| Grounded AI (근거 기반 AI) | RAG answers only from designated, active knowledge sources; cites sources |
| Safe by default (안전 우선) | Non-bypassable outbound moderation gate (fail-safe = block) for AI + agents |
| Tenant isolation (테넌트 격리) | Per-tenant data, settings, credentials, AI routing |
| Compliance (컴플라이언스) | CCPA/CPRA + GDPR posture; consent, opt-out, encryption, audit |
| Pluggable AI (교체형 AI) | Per-function engine selection (Anthropic/OpenAI/Google/Azure/custom) |

### 1.4 User Types (사용자 유형)
| Group | Roles | Layout |
|---|---|---|
| **System Admin** | Super Admin / Admin (cross-tenant platform) | Platform Admin console |
| **Tenant User** | Master / Director / Manager / Staff × labels (Consult/Accounting/Operations) | Tenant console |
| **Customer** | Guest / Subscriber / Regular (Shopify tier = source of truth) | Storefront widget |

### 1.5 Key Features (주요 기능)
FN-001…053 across 15 modules: widget core & notification center, session & i18n,
scenario engine, auth gate, RAG, orders/tracking, notifications, reviews, affiliate,
restock/subscription, escalation & agent console, AI assist, agent mgmt & moderation,
AI provider gateway, admin & analytics, integrations, logging & CJM. Requirements
FR-001…070, NFR-001…013 (see `design/`).

---

## 2. Tech Stack (기술 스택)

### 2.1 Frontend
React 18 · TypeScript 5 · Vite 5 · TailwindCSS 3 · Zustand 4 · TanStack React Query 5 ·
react-i18next 14 · lucide-react. Two apps: `apps/web` (admin SPA + react-router 6),
`apps/widget` (Shopify Theme App Embed–style customer widget).

### 2.2 Backend
NestJS 10 · TypeORM 0.3 · **MySQL 8** (utf8mb4/InnoDB) · Redis 7 (cache/session) ·
RabbitMQ (async event bus) · `@nestjs/jwt` · class-validator/class-transformer ·
bcryptjs (cost 12) · AES-256-GCM (credential encryption) · nodemailer (alerts). REST
`/api/v1` (+ SSE-ready); Swagger `/api/v1/docs`; liveness `GET /api/v1/health` (DB readiness).

### 2.3 Infrastructure (인프라)
Docker Compose (dev/staging/production) · Turborepo monorepo · Nginx edge reverse proxy
(`/`→web, `/api/`→api, `/widget`→widget). Staging LIVE (host nginx + Let's Encrypt TLS →
docker nginx `:8080`); production stack templated. Full env/config reference: `CONFIG.md`.

### 2.4 Development Tools (개발 도구)
TypeScript, ESLint/Prettier, Swagger (`/api/v1/docs`), Turborepo pipeline, Jest + ts-jest
(62 passing unit tests: types 8 · common 12 · api 42).

### 2.5 Internationalization (i18n) — en/es/ko
react-i18next; all UI text via `t()`; namespaces registered in each app's `i18n.ts`;
`fallbackLng: 'en'`. **Languages: English (en, default) / Spanish (es) / Korean (ko)** —
per NFR-003 (North-America storefront: EN+ES primary, KO internal). Backend error
messages stay English (client localizes by Exxxx code); AI/RAG answers honor
`session.language`; backend conversational system strings localized en/es/ko.
> Deviation from the standard's `ko/en/vi`; justified by NFR-003 (§13).

---

## 3. System Architecture (시스템 아키텍처)

### 3.1 Architecture Principles (아키텍처 원칙)
Clean Architecture + DDD · domain-modular · API-first · type-safe end-to-end ·
multi-tenant by `tenant_id` · separation of UI/logic/data-fetching on the frontend.

### 3.2 Layer Structure (4-Layer)
`Controller (presentation) → Service (application) → Entity (domain) → Repository (infrastructure)`.
Controllers hold no business logic; services own logic + tenant scoping; entities are
data models; repositories are TypeORM repos (custom repository optional).

### 3.3 Overall System Diagram (전체 시스템 구성도)
```
Shopify storefront ─▶ apps/widget (React) ─┐   (App Proxy identity: logged-in customer)
Operators/Admins  ─▶ apps/web (React SPA) ─┼─▶ apps/api (NestJS /api/v1)
                                            │      ├─ MySQL 8 (TypeORM)
                                            │      ├─ Redis 7 (cache/session/unread)
                                            │      ├─ RabbitMQ (notif/cjm/log events)
                                            │      ├─ AI Gateway → stub | Anthropic | …
                                            │      ├─ Moderation gate (fail-safe block)
                                            │      └─ Shopify: OAuth · App Proxy · sync · webhooks (HMAC)
External: Shopify (OAuth/App Proxy/webhooks) · Fulfillment webhook · Klaviyo · Odoo · Google Drive (per-tenant creds, AES-256-GCM)
```

---

## 4. Project Structure (프로젝트 구조)

### 4.1 Monorepo Structure
```
ivy-talktalk/
├── apps/{api,web,widget}        # NestJS API · React admin · React widget
├── packages/{types,common}      # shared enums/response envelope/RBAC matrix/utils
├── docker/                      # compose {dev,staging,production} + Dockerfiles + nginx + deploy-*.sh
├── env/{backend,frontend}/      # .env.development (committed; staging/prod gitignored)
├── sql/                         # 01-schema.sql (staging/prod migration reference)
├── docs/{analysis,plan,implementation,test,report,guide,design,log}
├── reference/                   # Amoeba standard docs (knowledge)
├── scripts/dev/                 # kill-ports.sh, start-all.sh
├── design/  standards/          # design artifacts & company standards (source)
├── turbo.json  tsconfig.json  package.json  SPEC.md  CONFIG.md  CLAUDE.md  CHANGELOG.md  README.md
└── .claude/skills/ivy-talktalk-dev/SKILL.md   # project dev skill
```

### 4.2 Backend Structure (NestJS)
`apps/api/src/{domain,global,infrastructure,database}`. Each domain module:
`controller/ · service · entity/ · dto/ (request snake_case, response camelCase) ·
mapper · {domain}.module.ts` (repository/ optional). **26 domain modules** (incl. privacy,
health, shopify-oauth, shopify-proxy).
`global/`: config, filter, interceptor (transform, tenant-context, logging), decorator
(`@Auth/@AdminOnly/@RequireRank/@RequireCapability/@Public/@CurrentUser`), guard (jwt-auth,
authorization), constant (error codes), util (crypto, transformers, maskPii).
`infrastructure/`: cache (Redis), queue (RabbitMQ event bus), external/ai (gateway +
adapters), tenant (AsyncLocalStorage TenantContext + TypeORM TenantSubscriber).

### 4.3 Frontend Structure
`apps/{web,widget}/src/{components,hooks,services,store,i18n,lib,layouts,router}`.
React Query for server state, Zustand for global state, react-i18next for i18n.

---

## 5. Multi-Tenancy Design (멀티테넌시 설계)

### 5.1 Tenant Structure
Tenant = a Shopify shop (`tenants` table). Seed tenant `ivyusa`. Future: public-app SaaS.

### 5.2 Data Isolation Principles
`tenant_id` row isolation on tenant-scoped tables, filtered at the app layer (service)
and via the authorization guard. Per-tenant: users, labels, AI engines/settings,
knowledge sources, integration credentials (encrypted), moderation rules, audit.
> Current gap: several customer-scoped legacy tables (orders/reviews/sessions/
> conversations/messages…) lack `tenant_id`; isolation there is via customer→tenant
> linkage. Remediation = §14 / audit High-1.

### 5.3 Organization Hierarchy
System Admin (super/admin) ▸ Tenant: Master ▸ Director ▸ Manager ▸ Staff, each
crossed with job labels (Consult/Accounting/Operations). ACL owner-visibility layer
(POL-019) sits above functional RBAC.

---

## 6. Database Design (데이터베이스 설계)

### 6.1 Database Information
Name `db_ivy_talktalk` · MySQL 8 · utf8mb4 / InnoDB · 38 tables / 40 TypeORM entities.
Source of truth for orders = Shopify/Odoo (cached locally). DDL: `sql/01-schema.sql`
(= `design/chat-widget-schema.sql`); dev/staging build via TypeORM `synchronize`.

### 6.2 Naming Conventions (project)
Tables: bare `snake_case` plural (`customers`, `orders_cache`, `kb_documents`). Columns:
bare `snake_case`; PK `id` `BIGINT AUTO_INCREMENT`; FK `{ref}_id`; timestamps
`created_at/updated_at`. Reserved words backticked (`` `rank` ``, `` `function` ``).
> Deviation from standard's `{prefix}_{plural}` + 3-char column prefix + UUID PK;
> the ERD design artifact predates the prefix rule (§13).

### 6.3 Domain Table Composition
Core chat/commerce (19) + tenancy/RBAC (tenants, admin_users, users, job_labels,
user_job_labels, roles_permissions, integration_credentials, audit_logs) + bootstrap
(invitations) + knowledge (knowledge_sources, kb_documents, kb_board_posts, kb_files) +
agent/moderation (agent_profiles, assignments, content_filter_rules, moderation_logs,
agent_daily_stats) + AI (ai_engines, tenant_ai_settings).

### 6.4 Entity Authoring Rules
Nullable columns specify explicit `type` in `@Column`; `BIGINT` via `bigintTransformer`,
`DECIMAL` via `decimalTransformer`; camelCase property ↔ snake_case `name:`. Static
Mapper per domain (entity→camelCase response). `@CreateDateColumn/@UpdateDateColumn`.
> Gaps: no `@DeleteDateColumn` soft-delete; some domains missing mappers (§14).

### 6.5 Schema Migration
Dev: TypeORM `synchronize=true` (+ `npm run db:seed`). Staging/prod: `synchronize=false`,
run `sql/01-schema.sql` then feature migrations manually.

---

## 7. API Design (API 설계)

### 7.1 Basic Information
Base `/api/v1` · Bearer JWT · Swagger `/api/v1/docs`. Widget endpoints are `@Public()`
(session-token identified); admin/tenant endpoints require JWT + RBAC.

### 7.2 Response Structure
Global transform interceptor wraps all responses:
`BaseSingleResponse<T>` `{success,data,error?,timestamp}` and `BaseListResponse<T>`
`{success,data,pagination,timestamp}` (`@ivy/types`).

### 7.3 Error Code System
`Exxxx`: E1xxx auth · E2xxx user · E3xxx chat · E4xxx agent/AI (E4010/E4011 quota) ·
E5xxx domain · E9xxx system (`global/constant/error-code.constant.ts`). Backend
messages English; client localizes by code.

### 7.4 DTO Case Rules
Request DTO **snake_case** (class-validator); Response **camelCase** (via Mapper); query params snake_case.

### 7.5 Key API Endpoints
`auth/*`, `session/*`, `chat/*` (RAG; guest + logged-in), `orders/*` (+guest-lookup, tracking,
fulfillment webhook), `notifications/*`, `reviews/affiliate/restock/subscriptions/inquiries`,
`agent/*` (console), `analytics/*`, `knowledge/*`, `ai-engines`/`ai-settings`,
`moderation/rules`, `tenants/*` (+`tenants/me/shopify`), `users`/`job-labels` (+temp-password),
`campaigns`, `cjm/events`, `audit`, `integrations/status`, `health`.
**Shopify**: `auth/shopify/install`+`/callback` (OAuth), `shopify/proxy/identity` (App Proxy,
signature-verified), `webhooks/shopify/*` (native orders/fulfillments, HMAC),
`privacy/*` (DSAR export/delete, CCPA opt-out, retention purge) + GDPR compliance webhooks
(`customers/data_request`, `customers/redact`, `shop/redact`).

---

## 8. Authentication & Authorization (인증/인가)

### 8.1 Authentication Methods
JWT (admin + tenant user). Customer widget: opaque session token. Customer identity —
**guest mode** (product inquiry & general consultation with no login) or **logged-in
customer** authenticated via Shopify **App Proxy** (Shopify-signed storefront request
identifies the logged-in customer to the cross-origin widget). Guest order lookup: max 5
attempts/15 min, Redis rate-limited.

### 8.2 Token Policy
Access 15 min (`JWT_ACCESS_TTL`) · Refresh 7 days (`JWT_REFRESH_TTL`). Passwords bcrypt
(seed/invited accounts `must_change_password=1`).

### 8.3 Permission System (RBAC)
Global `JwtAuthGuard` (authn) + `AuthorizationGuard` (authz). Decorators: `@Auth()`,
`@AdminOnly(level?)`, `@RequireRank(...ranks)`, `@RequireCapability(...caps)`, `@Public()`.
RBAC = rank × label capability matrix (`@ivy/common/permission-matrix`, overridable via
`roles_permissions`). ACL owner-visibility (POL-019) layered above.
> The standard's `@MasterOrAdmin()`/`@PartnerOnly()` map to `@RequireRank`/`@AdminOnly` here.

### 8.4 Security Policies
bcrypt password hashing · AES-256-GCM credential encryption (`CRED_ENC_KEY`) · HTTPS/TLS
(deploy) · CORS · tenant isolation. (bcrypt rounds → raise 10→12, §14.)

### 8.5 Input Validation & Web Security
Global `ValidationPipe` (whitelist, transform); TypeORM parameter binding (SQLi-safe);
moderation gate on outbound; rate-limiting on guest lookup.

---

## 9. AI Integration (AI 통합)

### 9.1 AI Service Architecture
`AiGatewayService` (FN-053) resolves the engine for a `(tenant, function)` via
`tenant_ai_settings → ai_engines`, dispatches to a provider adapter (stub | anthropic),
normalizes the result, and degrades to the stub on failure. Functions: chat, rag,
summary, assist, moderation.

### 9.2 Quota Management
Error codes E4010 (daily) / E4011 (monthly) reserved; per-tenant token tracking is a
roadmap item.

### 9.3 AI Application Domains
RAG answering (cite sources), intent classification, agent AI-briefing, response
moderation (LLM context classifier), rephrase. All AI outbound passes the moderation gate.

---

## 10. Development Environment (개발 환경)

### 10.1 Port Mapping
API `3000` · admin web `5173` · widget `5174` · MySQL `3316`→3306 · Redis `6389`→6379 ·
RabbitMQ `5682`→5672 (host ports remapped off occupied defaults; see `env/backend/.env.development`).

### 10.2 Environment Variable Structure
`env/backend/.env.development` (committed, dev placeholders only) · `env/frontend/.env.development`
(`VITE_API_BASE_URL`). Staging/prod env files live on the server (gitignored).

---

## 11. Code Conventions (코드 컨벤션)

### 11.1 Naming Rules
Files kebab-case (`*.service.ts`, `*.entity.ts`); classes PascalCase; React components
PascalCase; hooks `useX`; enums const-object + derived type. DTO request snake_case /
response camelCase. Full rules: `reference/amoeba_code_convention_v2.md` + `CLAUDE.md`.

### 11.2 Git Branch Strategy
`production` (prod) · `main` (staging/dev integration, default) · `feature/*` · `hotfix/*`.
PR + 1 approval on protected branches; squash-merge to `main`.

### 11.3 Commit Messages
`{type}: {description}` — type ∈ feat|fix|docs|style|refactor|test|chore|hotfix.

---

## 12. Deployment Environment (배포 환경)

### 12.1 Per-Environment Domains
dev (local) · **staging LIVE** `https://shoptalk.amoeba.site` (host `211.110.140.172`;
admin at `/`, widget at `/widget/`) · production (host + domain TBD). Full reference: `CONFIG.md`.

### 12.2 Docker-Based Deployment
Dev: `docker/docker-compose.dev.yml` + `npm run db:up`. **Staging**: `docker/staging/*`
(Dockerfiles api/web/widget, compose, nginx edge, `deploy-staging.sh`) — deployed and
verified live; host nginx + Let's Encrypt terminate TLS → docker nginx `:8080`;
`SEED_ON_BOOT=false` on server so in-app password changes persist. **Production**:
`docker/production/*` templated (restart:always, no host DB/queue ports, `synchronize=false`
+ init-sql migrations) — **not yet deployed** (needs host + `.env.production`). Runbook:
`docs/guide/STAGING-DEPLOY.md`.

---

## 13. Approved Deviations (승인된 편차)
Intentional, design-driven choices — NOT compliance failures:
| Area | Standard | This project | Rationale |
|---|---|---|---|
| DB engine | PostgreSQL 15 | MySQL 8 | `design/chat-widget-schema.sql` (ERD artifact) |
| PK | UUID | BIGINT AUTO_INCREMENT | Same source |
| Table/column naming | `{prefix}_{plural}` + 3-char col prefix | bare snake_case | ERD predates prefix rule |
| i18n languages | ko/en/vi | en/es/ko | NFR-003 (NA storefront) |
| FK mapping | `@ManyToOne` relations | scalar FK ids (+indexes) | avoid circular deps, perf |
| Credential encryption | 3-field `_encrypted/_iv/_tag` | single varbinary `[IV][tag][ct]` | cryptographically equivalent |

## 14. Known Gaps & Remediation Roadmap (갭·개선 로드맵)
Full evidence: `docs/report/RPT-Standards-Compliance-Audit-20260619.md`.

**Resolved (2026-06-19)**
- ✅ Shopify GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`, HMAC-verified) — `domain/privacy`.
- ✅ DSAR/consumer-rights APIs (export/portability, delete/anonymize) + real CCPA "Do Not Sell or Share" opt-out — `domain/privacy`.
- ✅ `sessions.tenant_id` added + threaded into chat (removed "first tenant" shortcut).
- ✅ bcrypt cost 10→12 (shared `BCRYPT_ROUNDS`). ✅ i18n no-hardcoding (en/es/ko) across both frontends + backend chat strings.
- ✅ **Full `tenant_id` coverage** — added to all 14 remaining customer/tenant-scoped tables (conversations, messages, orders_cache, order_items, fulfillments, notifications, notification_prefs, reviews, affiliates, subscriptions, restock_subscriptions, inquiries, cjm_events, campaigns).
- ✅ **Global tenant-scope** — AsyncLocalStorage `TenantContext` + `TenantContextInterceptor` (resolves tenant from JWT principal / widget session / default) + TypeORM `TenantSubscriber` auto-stamping `tenant_id` on insert (≈ `OwnEntityGuard`). Admin reads filter by `user.tenantId`. Verified: new rows = 0 nulls; admin lists tenant-filtered.

**Resolved (2026-06-30)**
- ✅ Full tenant purge in `shop/redact` (anonymize customers + delete all tenant-scoped rows in a transaction).
- ✅ PII masking — `LoggingInterceptor` logs method/path/status/duration only (no bodies/PII); `maskPii` util; DSAR export writes a `dsar.export` audit (masked email).
- ✅ Retention/disposal (POL-003) — `RetentionService.purgeExpired()` + `POST /privacy/retention/purge` (admin); `CONVERSATION_LOG_RETENTION_DAYS` (default 365).
- ✅ Staging/production Docker — `docker/{staging,production}` Dockerfiles (api/web), compose (validated), nginx, `deploy-*.sh` (Structure §5.1).
- ✅ tenantId in React Query keys (admin app, `useTenantKey()`); modal/chat a11y (role=dialog/Esc/focus, `aria-live` chat logs, icon-button aria-labels, focus rings) in both frontends.
- ✅ **Tests** — Jest + ts-jest; 40 passing unit tests (`npm test`/turbo): permission-matrix (rank×label), status-map, moderation fail-safe (NFR-013), authorization guard.
- ✅ Chat/session inline DTOs extracted to `dto/request/` + `ChatMapper`/`SessionMapper` added; `@MasterOrAdmin()` decorator alias (guard-enforced); full primary 50–900 color ramp (both apps).
- ✅ **DTO normalization** — all 15 remaining flat/inline DTO modules moved to `dto/request/*.request.ts` (+ `dto/response` where applicable); no inline DTO classes remain in controllers.
- ✅ **SDLC doc chain** — `docs/analysis/REQ-…`, `docs/plan/PLAN-…`, `docs/test/TC-…` added (Structure §8.2: analysis→plan→impl→test→report). Tests broadened to **46** (added TenantSubscriber auto-stamp + RAG intent fallback).

**Delivered (2026-07) — Shopify integration & staging go-live**
- ✅ **Shopify OAuth** (`domain/shopify-oauth`): `auth/shopify/install`→`/callback`, per-shop access token stored on tenant (AES-256-GCM); endpoints self-disable (501) when keys unset.
- ✅ **Shopify App Proxy identity** (`domain/shopify-proxy`): signature-verified `shopify/proxy/identity` bridges the logged-in storefront customer to the cross-origin widget (was always guest).
- ✅ **Guest-mode chat** — product inquiry & general consultation with no login (AuthGate no longer steals input focus on poll).
- ✅ **Order/customer sync** — on-demand + scheduled (`SHOPIFY_SYNC_INTERVAL_MIN`); native webhooks (orders/fulfillments, HMAC-verified) into `orders_cache`/`customers`; `tenants/me/shopify` shop-domain repointing.
- ✅ **Widget install guide UI** — Settings card with 3 tabs (App embed / ScriptTag / theme.liquid) + copy buttons; `embed.js` origin fix for `/widget` sub-path deployment.
- ✅ **Dashboard/console** — clickable KPI cards + recent-orders → `/orders` page; `apiGetList` pagination fix; agent identity in chat bubbles; live-chat customer search/link/create (`customers.phone`).
- ✅ **Admin-issued temp password** (`POST /users/:id/temp-password`, USER_INVITE-gated).
- ✅ **Staging LIVE** — deployed to `https://shoptalk.amoeba.site` (TLS via host nginx + Let's Encrypt); health check, self-bootstrap (`SEED_ON_BOOT`), verified end-to-end (admin login, widget RAG, Shopify sync on real order/customer).

**Remaining — Low (optional)** — e2e HTTP tests (supertest + test DB) and broader service-level coverage; complete OAuth approval on the Shopify Partner side; production host + `.env.production` (deploy pending). **Soft-delete columns: intentionally not added** — the disposal model is hard-delete + anonymization (GDPR `redact`/DSAR `delete` + retention purge), which satisfies POL-003/privacy without an unused `deleted_at` column. Audit roadmap (High/Medium) is otherwise fully closed.

## 15. Reference (참조)
`reference/amoeba_*` (standards) · `README.md` (overview) · `CONFIG.md` (env/config) ·
`design/` (artifacts) · `docs/PROJECT-ARTIFACT-INDEX.md` (artifact index) ·
`docs/implementation/RPT-ChatWidget-Implementation-20260618.md` · `docs/guide/STAGING-DEPLOY.md` ·
`CLAUDE.md` · `.claude/skills/ivy-talktalk-dev/SKILL.md`.

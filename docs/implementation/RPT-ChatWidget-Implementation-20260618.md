# Implementation Report — IVY USA Chat & Support Widget (Stage 3)

| | |
|---|---|
| **Doc ID** | CHATWIDGET-RPT-IMPL-1.0.0 |
| **Date** | 2026-06-18 |
| **Stack** | NestJS 10 + TypeORM + MySQL 8 · Redis · RabbitMQ · React 18 + Vite + Tailwind |
| **Repo** | Turborepo monorepo (`apps/{api,web,widget}`, `packages/{types,common}`) |

## 1. Scope delivered

Full-stack implementation per the design set (`design/`) and Amoeba standards
(`reference/`). Backend exposes the complete data model (37 tables) and all domain
modules; frontends cover the widget (customer) and dual admin console (tenant +
platform). Build status: **`packages` + `apps/api` typecheck & nest build green.**

## 2. Backend modules (apps/api/src/domain)

| Module | Key endpoints | Design refs |
|---|---|---|
| auth | admin/user login, refresh, change-password, me | FR-053/054, POL-018, SEQ-02 |
| session | ensure/resume, consent, language | FN-006/008, S1 |
| chat + rag | message (intent→RAG→moderation→escalate), conversation, escalate | FN-015/017, SEQ-03, S5 |
| moderation | non-bypassable gate (fail-safe block), rule CRUD | FR-069, POL-020, NFR-013 |
| ai-engine | engine catalog (encrypted keys), per-function tenant routing | FR-070, FN-053 |
| tenant | tenant lifecycle, encrypted integration credentials | FR-051/052/060 |
| user | invite/accept, rank/label assign, job-labels | FR-054/055/059/063 |
| customer | profile/tier management, findOrCreateByEmail | FR-057 |
| order | guest lookup (rate-limited), orders, detail, tracking stepper, fulfillment webhook | FR-009/010/011/031, POL-014, SEQ-04/05 |
| inquiry | create/list, admin answer | FR-033 |
| review / affiliate / restock / subscription | post-purchase engagement | FR-034/035/036/037 |
| notification | event→channel dispatch, inbox, prefs, unread | FR-023/024/029/049, SEQ-05 |
| campaign | draft/send (Klaviyo segment dispatch event) | FR-040/041 |
| cjm | journey event sink (Awareness→Post) | FR-026, FN-047 |
| knowledge | sources (3 modes), KB docs (embed sim), board posts | FR-064/065 |
| agent | live console, AI briefing, assign/accept/end, moderated agent send, profile, stats | FR-017/045/066/067/068, SEQ-06 |
| analytics | dashboard KPIs, conversation history | FR-044/046, FN-038/039 |
| audit | privileged-action log + query | FR-061 |
| integration | integration health status | POL-015 |

**Cross-cutting:** standard response envelope (global interceptor), `BusinessException`
+ Exxxx error codes, JWT auth (global guard) + RBAC authorization guard (rank×label
matrix in `@ivy/common`), AES-256-GCM credential encryption, Redis cache, RabbitMQ
event bus with in-process fallback, pluggable AI gateway (stub adapter runs with no keys;
Anthropic adapter ready).

## 3. Frontends
- `apps/widget` — Naver TalkTalk–style floating widget: Notification Center (3 tabs),
  scenario menu, RAG chat, auth gate, orders panel + delivery stepper, reviews,
  affiliate, notification settings (SCR-001..013).
- `apps/web` — tenant console (dashboard, live chat, history, AI settings, knowledge,
  customers, campaigns, users/labels, settings) + platform admin (tenants, AI engines,
  audit), RBAC-gated nav (SCR-101..106, 201..207).

## 4. How to run
```bash
npm install
npm run db:up           # MySQL(:3316) + Redis(:6389) + RabbitMQ(:5682) — host ports remapped
npm run db:seed         # tenant ivyusa, admin+master, labels, AI engine, KB, demo orders
npm run dev             # api :3000 (/api/v1/docs), web :5173, widget :5174
```
Seed logins (must change on first login): `admin@amoeba.group` / `amb2026!@` (System Admin),
`dev@amoeba.group` / `amb2026!@` (Tenant Master, ivyusa).
> Dev DB/Redis/RabbitMQ host ports were moved off the defaults (3306/6379/5672 were occupied by
> other local stacks) to 3316/6389/5682; `env/backend/.env.development` matches.

## 4b. Runtime verification (2026-06-18) — all green
- `turbo run build`: types, common, api, widget, web → **5/5 build success**.
- Infra up; `npm run db:seed` built all 37 tables (TypeORM synchronize) + seeded.
- API boots, all 22 modules' routes mapped, RabbitMQ connected.
- E2E smoke (curl): admin login ✅ · tenant-master login ✅ · RBAC allow (master→dashboard KPIs) ✅ ·
  RBAC deny (no token → 401 E1001) ✅ · widget session ✅ · **RAG chat** (policy Q → grounded
  answer + KB citations through the moderation gate) ✅ · **auth gate** (order Q → identity required) ✅ ·
  **guest order lookup** binds session + lists orders (IVY-1001 In Transit, IVY-1002 Delivered) ✅.

## 4c. Schema note
MySQL 8 reserves `rank` and `function`; `sql/01-schema.sql` (the staging/prod migration) was
backtick-quoted accordingly. In dev, TypeORM owns the schema (`synchronize`) and quotes identifiers
automatically, so the raw init-SQL mount was removed from `docker-compose.dev.yml`.

## 5. Notes / open items
- RAG uses a keyword retriever + stub LLM offline; swap to the Anthropic engine (set
  `ANTHROPIC_API_KEY`, select it in AI Settings) for production-grade answers + a real
  vector store.
- Customer-scoped legacy tables (orders/reviews/etc.) carry no `tenant_id` column in the
  ERD; tenant isolation there is via the customer→tenant link. Other tables enforce
  `tenant_id` at the app layer.
- External integrations (Shopify/Klaviyo/Odoo/Drive) are modeled as credentials + status +
  webhook ingress; live connectors are stubbed for this build.

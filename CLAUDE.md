# CLAUDE.md — IVY USA Chat & Support Widget

AI working instructions for this repo. Read alongside `SPEC.md`, `reference/` (Amoeba
standards), and `design/` (design artifacts; `README.md` is the artifact index).

## What this is
Multi-tenant Shopify chat/support widget + tenant console + platform admin.
Stack: **NestJS + TypeORM + MySQL + Redis + RabbitMQ** (backend), **React + Vite + Tailwind** (frontends).
Turborepo monorepo: `apps/{api,web,widget}`, `packages/{types,common}`.

## Conventions (non-negotiable — from reference/amoeba_code_convention_v2)
- **DTO case**: request DTO `snake_case`; response DTO `camelCase`. Query params `snake_case`.
- **Layers**: Controller → Service → Repository/Entity. Controllers hold no business logic.
- **Auth**: `@Auth()` (JWT + tenant scope) by default; `@AdminOnly()`, `@MasterOrAdmin()`, `@Public()`.
- **Multitenancy**: every tenant-scoped query filters by `tenant_id`. Never leak cross-tenant data.
- **Entities**: nullable columns get explicit `type` in `@Column`. Tables/columns are `snake_case` (legacy schema names kept as-is, no `amb_` prefix — this project predates that prefix).
- **Response**: wrap via the global transform interceptor → `BaseSingleResponse`/`BaseListResponse`.
- **Naming**: files kebab-case; classes PascalCase; React components PascalCase; hooks `useX`; services `*.service.ts`.
- **i18n**: no hardcoded UI text; namespaces per domain; locales en/es/ko (en default for storefront NA + es).
- **Moderation**: all AI + agent outbound messages MUST pass `ModerationService` (fail-safe block).

## Commands
- `npm run db:up` — start MySQL/Redis/RabbitMQ (docker/docker-compose.dev.yml)
- `npm run dev` — turbo dev (api + web + widget)
- `npm run db:seed` — seed tenant `ivyusa`, admin + master accounts, labels, AI engine, filter rules
- API: `apps/api` (port 3000), web admin: `apps/web` (5173), widget: `apps/widget` (5174)

## Seed credentials (must change on first login — POL-018)
- System Admin: `admin@amoeba.group` / `amb2026!@`
- Tenant Master (ivyusa): `dev@amoeba.group` / `amb2026!@`

## Traceability
Keep code mapped to design IDs (FR/FN/SCR/TBL/SEQ). Add a short implementation report
to `docs/implementation/RPT-{title}-Report-{YYYYMMDD}.md` per module.

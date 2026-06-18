# CLAUDE.md — IVY USA Chat & Support Widget

AI working instructions for this repo, aligned to the Amoeba standards in `reference/`
(skill, SPEC, structure, code_convention, web_style_guide, privacy_compliance v2).
Read with `SPEC.md` and the project skill `.claude/skills/ivy-talktalk-dev/SKILL.md`.

## 1. What this is
Multi-tenant Shopify chat/support widget (Naver TalkTalk style) + tenant console +
platform admin. Turborepo monorepo: `apps/{api,web,widget}`, `packages/{types,common}`.
Stack: **NestJS 10 + TypeORM + MySQL 8 + Redis + RabbitMQ** (backend); **React 18 + Vite +
Tailwind + Zustand + React Query + react-i18next** (frontends). Pluggable AI gateway
(stub adapter runs with no key; Anthropic ready). Languages: **en (default) / es / ko**.

## 2. Conventions (MUST — `reference/amoeba_code_convention_v2`)
- **DTO case**: request DTO `snake_case` (class-validator); response shaped `camelCase` via a static Mapper. Query params `snake_case`.
- **Layers**: Controller → Service → Repository/Entity. Controllers do DTO/mapper glue only — **no business logic**.
- **Auth decorators** (`global/decorator/auth.decorator.ts`): `@Auth()` (JWT), `@AdminOnly(level?)`, `@RequireRank(...ranks)`, `@RequireCapability(...caps)`, `@Public()` (widget/storefront), `@CurrentUser()`. Global `JwtAuthGuard` (authn) + `AuthorizationGuard` (authz/RBAC). *(Standard's `@MasterOrAdmin`/`@PartnerOnly` ≈ `@RequireRank`/`@AdminOnly` here.)*
- **RBAC**: rank (master/director/manager/staff) × label (consult/accounting/operations) via `@ivy/common/permission-matrix`; system admin super/admin. ACL owner-visibility (POL-019) above it.
- **Multitenancy**: tenant-scoped queries filter by `tenant_id` (from `user.tenantId`; narrow the `Principal` union with `asTenantUser()`/`actorType==='user'`). **Never leak cross-tenant data.** ⚠️ Several legacy tables still lack `tenant_id` — see §6 gaps; add it when touching them.
- **Entities**: nullable columns get explicit `type` in `@Column`; `BIGINT`→`bigintTransformer`, `DECIMAL`→`decimalTransformer`; camelCase prop ↔ snake_case `name:`. Tables/columns are **bare snake_case** (no `amb_`/`cw_` prefix — approved deviation, see SPEC §13). Backtick reserved words (`` `rank` ``, `` `function` ``).
- **Response**: never hand-build the envelope — return plain objects/entities (global `TransformInterceptor` wraps them) or `new Paginated(items, buildPagination(page,size,total))` for lists.
- **Errors**: `throw new BusinessException(ERROR_CODE.X, HttpStatus.Y)` (Exxxx codes in `global/constant/error-code.constant.ts`). Backend messages English; client localizes by code.
- **i18n**: NO hardcoded UI text — use `t()` from `useTranslation()`; register namespaces in each app's `i18n.ts`; `fallbackLng: 'en'`; locales en/es/ko. Backend conversational strings localized by `session.language`; AI/RAG answers honor it.
- **Moderation**: ALL AI + agent outbound MUST pass `ModerationService.moderate()` (fail-safe = block on error) — non-bypassable (FR-069/POL-020).
- **Security/Privacy**: passwords bcrypt; credentials AES-256-GCM (`crypto.util`); PII masked in logs; privileged actions → `AuditService.write`. CCPA/GDPR posture (consent, opt-out) — see `reference/amoeba_privacy_compliance_v2`.
- **Naming**: files kebab-case (`*.service.ts`, `*.entity.ts`, `*.dto.ts`); classes PascalCase; React components PascalCase; hooks `useX`; enums = const object + derived type.

## 3. Domain module skeleton (backend)
`apps/api/src/domain/{domain}/`: `entity/{name}.entity.ts` · `dto/request/*.request.ts` (snake) + `dto/response/*.response.ts` (camel) · `{domain}.service.ts` · `{domain}.controller.ts` · `{domain}.mapper.ts` (static) · `{domain}.module.ts` (+ `repository/` optional). Register the module in `app.module.ts`.

## 4. Frontend module pattern
`src/{components,hooks,services,store,i18n,lib}`. Data via React Query (include `tenantId` in query keys); global state via Zustand; API via the shared `api-client` that unwraps the envelope; all text via `t()`.

## 5. Commands
- `npm run db:up` — MySQL :3316 / Redis :6389 / RabbitMQ :5682 (`docker/docker-compose.dev.yml`)
- `npm run db:seed` — seed tenant ivyusa, admin+master, labels, AI engine routing, KB, demo data
- `npm run dev` — turbo dev (API :3000 `/api/v1/docs`, web :5173, widget :5174)
- `npm run build` / `npm run typecheck` — full monorepo via turbo
- Lighter run (less memory): prebuilt `node apps/api/dist/main.js` + `vite` per app
> Dev DB/Redis/RabbitMQ host ports are remapped off occupied defaults; `env/backend/.env.development` matches. If Docker Desktop is unstable, let the daemon fully settle (~40s) before `db:up`.

## 6. Seed credentials & known gaps
Seed logins (must change on first login): `admin@amoeba.group` / `amb2026!@` (System Admin),
`dev@amoeba.group` / `amb2026!@` (Tenant Master, ivyusa).
**Open gaps (remediation roadmap)** — see `docs/report/RPT-Standards-Compliance-Audit-20260619.md` & SPEC §14:
High = full `tenant_id` coverage + tenant-scope guard (remove chat "first tenant"), Shopify GDPR webhooks, DSAR/opt-out; Med = PII masking/audit, bcrypt 10→12, DTO/mapper normalization, residual hardcoded strings; Low = tests (currently 0), soft-delete, staging/prod Docker.

## 7. Workflow & traceability (`reference/amoeba_basic_skill_v2`, `_Structure_v2` §8.2)
Requirements work: Analysis → Plan → Implementation → Test cases → Implementation report
(`docs/{analysis,plan,implementation,test}/`). Keep code mapped to design IDs
(FR→FN→SCR→TBL→SEQ→T). Git: branch `feature/*` from `main`, PR + squash-merge.

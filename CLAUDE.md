# CLAUDE.md — IVY USA Chat & Support Widget

AI working instructions for this repo, aligned to the Amoeba standards in `reference/`.
Standards source of truth: **`reference/btbz-dev-kit/`** (2026-07-30 — code convention v3.0,
dev standard v2.0, git v2.0, deploy/ops v2.0, lessons-learned) supersedes the older
`reference/amoeba_*_v2` docs where they conflict. Where the kit differs from conventions
already shipped in this repo (pagination `size`, decorator names, `tenant_id` axis), the
repo convention stands as an approved deviation — see SPEC §13. Read with `SPEC.md` and
the project skill `.claude/skills/ivy-talktalk-dev/SKILL.md`.

## 1. What this is
Multi-tenant Shopify chat/support widget (Naver TalkTalk style) + tenant console +
platform admin. Turborepo monorepo: `apps/{api,web,widget}`, `packages/{types,common}`.
Stack: **NestJS 10 + TypeORM + MySQL 8 + Redis + RabbitMQ** (backend); **React 18 + Vite +
Tailwind + Zustand + React Query + react-i18next** (frontends). Pluggable AI gateway
(stub adapter runs with no key; Anthropic ready). Languages: **en (default) / es / ko / vi / ja / zh**.

## 2. Conventions (MUST — `reference/amoeba_code_convention_v2`)
- **DTO case**: request DTO `snake_case` (class-validator); response shaped `camelCase` via a static Mapper. Query params `snake_case`.
- **Layers**: Controller → Service → Repository/Entity. Controllers do DTO/mapper glue only — **no business logic**.
- **Auth decorators** (`global/decorator/auth.decorator.ts`): `@Auth()` (JWT), `@AdminOnly(level?)`, `@RequireRank(...ranks)`, `@RequireCapability(...caps)`, `@Public()` (widget/storefront), `@CurrentUser()`. Global `JwtAuthGuard` (authn) + `AuthorizationGuard` (authz/RBAC). *(Standard's `@MasterOrAdmin`/`@PartnerOnly` ≈ `@RequireRank`/`@AdminOnly` here.)*
- **RBAC**: rank (master/director/manager/staff) × label (consult/accounting/operations) via `@ivy/common/permission-matrix`; system admin super/admin. ACL owner-visibility (POL-019) above it.
- **Multitenancy**: tenant-scoped queries filter by `tenant_id` (from `user.tenantId`; narrow the `Principal` union with `asTenantUser()`/`actorType==='user'`). **Never leak cross-tenant data.** ⚠️ Several legacy tables still lack `tenant_id` — see §6 gaps; add it when touching them.
- **Entities**: nullable columns get explicit `type` in `@Column` — ⚠️ a union TS type (`string | null`) without `type` makes TypeORM infer `Object` → DataSource init fails → **API boot crash that `tsc` cannot catch** (dev-kit lesson A-1); after entity changes verify a real boot (`Nest application successfully started`). `BIGINT`→`bigintTransformer`, `DECIMAL`→`decimalTransformer`; camelCase prop ↔ snake_case `name:`. Tables/columns are **bare snake_case** (no `amb_`/`cw_` prefix — approved deviation, see SPEC §13). Backtick reserved words (`` `rank` ``, `` `function` ``). Per-tenant sequence numbers need a composite unique `(tenant_id, number)` + max-sequence+1 (never `count+1`).
- **Response**: never hand-build the envelope — return plain objects/entities (global `TransformInterceptor` wraps them) or `new Paginated(items, buildPagination(page,size,total))` for lists.
- **Errors**: `throw new BusinessException(ERROR_CODE.X, HttpStatus.Y)` (Exxxx codes in `global/constant/error-code.constant.ts`). Backend messages English; client localizes by code. New modules allocate the next free Exxxx block sequentially (dev-kit §2.4). ⚠️ 4xx are not server-logged by default — "no error in logs ≠ request succeeded"; add `logger.warn` in rejecting guards.
- **UX feedback (MUST)**: every save/update/create/delete shows explicit success/error feedback (toast; success auto-close, error manual close, i18n keys) — silent success is banned (dev-kit §4.3; retrofit cost AMA 120+ call sites). Exempt only when the result is immediately self-evident (navigate-away, toggles, live updates).
- **i18n**: NO hardcoded UI text — use `t()` from `useTranslation()`; register namespaces in each app's `i18n.ts` (console: `import.meta.glob`); `fallbackLng: 'en'`; locales en/es/ko/vi/ja/zh. The language set lives ONCE in `packages/types/src/common/language.ts` (codes, endonyms, session values, timezone defaults, review state) — never re-list languages in an app. ⚠️ Browser bundles deep-import that source file: a value import from `@ivy/types` fails the build (CJS `export *`). Backend conversational strings localized by `session.language`; AI/RAG answers honor it. Run `npm run i18n:check` after touching locales — a missing key is a silent English fallback otherwise.
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
**Open gaps** — the 2026-06 audit roadmap (tenant_id coverage, GDPR/DSAR, PII masking,
bcrypt 12, DTO normalization, staging/prod Docker, unit tests) is **closed** — see SPEC §14
for the resolution log. Remaining: e2e HTTP tests (supertest), Shopify OAuth partner
approval, production host + `.env.production` (deploy pending). Staging runs
`DB_SYNCHRONIZE=false` since 2026-07-31 (migration runbook exercised) — schema changes
now REQUIRE manual SQL pre-apply from `sql/` on staging before deploying code.

## 7. Workflow & traceability (dev-kit `claude/spec-guide.md` + `_Structure_v2` §8.2)
**Doc filename convention (MUST)** — `{PREFIX}-{YYMMDD}-{Topic}.md`: **prefix first, then the
6-digit date, then the topic**. Prefix sorts by kind and the date sorts chronologically inside
it, so `ls docs/plan/` reads as a timeline instead of an alphabetical jumble of topics.
Example: `docs/plan/PLN-260804-Ops-Logs-Stats-KnowledgeConflict.md`.
⚠️ This is a **deliberate deviation** from the kit's `{PREFIX}-{Topic}-{YYYYMMDD}` (SPEC §13) and
from the year format. Existing docs keep their old names — never rename (see below).

**Requirements workflow** — a `[요구사항]`/requirements-type request MUST follow, in order:
1. **REQ** `docs/analysis/REQ-{YYMMDD}-{Topic}.md` — AS-IS, TO-BE, gap analysis, user flow, constraints
2. **PLN** `docs/plan/PLN-{YYMMDD}-{Topic}.md` — staged plan + side-impact analysis;
   ⚠️ **ASCII wireframe REQUIRED for any UI add/change** (backend-only PLN must state "no UI impact");
   ⚠️ **implement only after the user approves the PLN — never auto-start implementation**
3. **Implementation** (post-approval)
4. **TCR** `docs/test/TCR-{YYMMDD}-{Topic}.md` — unit cases, integration scenarios, edge cases
5. **RPT** `docs/implementation/RPT-{YYMMDD}-{Topic}.md` — what changed, file list, test results,
   **deploy state (PR#, commit SHA, per-env deploy + migration status)** — this feeds memory and prevents re-implementation

**Bug-fix workflow**: root cause from logs/repro (no symptom patching) → proposed fix + impact →
minimal change → **FIX** `docs/bug-fix/FIX-{YYMMDD}-{Topic}.md` incl. prevention pattern
(promote generalizable ones to memory / dev-kit). Conversation logs & daily reports go in
`docs/log/YYYY-MM-DD/` (gitignored — directory keeps the full date). Legacy `AN-`/`PLAN-`/`TC-`
files **and every doc named before 2026-08-04** are historical — do not rename; links and PR
bodies already point at them. When operational
values change (ports/domains/creds), update `CLAUDE.md`/`SPEC.md`/`CONFIG.md` immediately;
past REQ/PLN/RPT stay as written. Keep code mapped to design IDs (FR→FN→SCR→TBL→SEQ→T).
Git: branch `feature/*` from `main`, PR + squash-merge.

Kit rules adopted (dev-kit 03/04 — MUST):
- **Schema-change PRs** (diff touches `sql/*.sql` or `*.entity.ts`) need a `## Migration`
  section in the PR body: SQL path, per-env apply checkboxes, rollback plan. The deploy
  script does NOT run SQL automatically.
- **Migration order**: apply SQL to the target DB **before** deploying code (old code +
  new column = safe; new code + old schema = 500). Use the `pre-deploy-check` skill.
- **Solo-dev merges**: self-approval is impossible; use `gh pr merge <N> --squash --admin`.
- **Deploy verification**: never trust exit code alone. Check boot log
  (`successfully started`), container age (`docker ps` STATUS), and a new route's HTTP
  status — **401 = deployed, 404 = not deployed, 502 = API down/restarting**.
- Never run `docker/staging/deploy-staging.sh` locally (deploys to local Docker);
  never `docker compose build` directly (`--env-file` loss inlines wrong `VITE_*`).

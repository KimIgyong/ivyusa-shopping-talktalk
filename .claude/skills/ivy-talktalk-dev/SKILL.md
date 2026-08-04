---
name: ivy-talktalk-dev
description: Development skill for the IVY USA Chat & Support Widget monorepo. Use whenever adding/editing a backend domain module (NestJS), a frontend feature (React admin/widget), entities, DTOs, RBAC, i18n, or AI/moderation code in this repo. Encodes the Amoeba company standards — source of truth `reference/btbz-dev-kit/` (code convention v3.0 + dev/git/deploy standards + lessons-learned), superseding the amoeba_* v2 docs — as applied here with this repo's approved deviations. Trigger on tasks touching apps/api, apps/web, apps/widget, or packages/*.
---

# IVY TalkTalk — Development Skill

Apply this whenever you implement or modify code in this monorepo. It distills the Amoeba
standards for this project — source of truth is **`reference/btbz-dev-kit/`** (2026-07-30:
code convention v3.0, dev standard v2.0, git v2.0, deploy/ops v2.0, lessons-learned
catalog), which supersedes `reference/amoeba_*_v2` where they conflict. This repo's
approved deviations from the kit (MySQL/BIGINT, `size` pagination, decorator names,
`tenant_id` axis, hard-delete) are in `SPEC.md §13` — do NOT "fix" them to match the kit.
Pair with `CLAUDE.md` and `SPEC.md`.

## 0. Stack & layout (ground truth)
- Monorepo (Turborepo): `apps/{api,web,widget}`, `packages/{types,common}`.
- Backend: **NestJS 10 + TypeORM + MySQL 8** + Redis + RabbitMQ. Frontends: **React 18 + Vite + Tailwind + Zustand + React Query + react-i18next**.
- Languages: **en (default) / es / ko**. Pluggable AI gateway (stub | anthropic).
- Approved deviations (do NOT "fix" without instruction): MySQL+BIGINT+bare table/column names, en/es/ko, scalar FKs, single-buffer AES-256-GCM. See `SPEC.md §13`.

## 1. Adding a backend domain module (NestJS)
Create under `apps/api/src/domain/{domain}/`:
1. `entity/{name}.entity.ts` — `@Entity('{table}')`; PK `@PrimaryGeneratedColumn({ type:'bigint' })`; nullable cols specify `type` — ⚠️ union TS type without explicit `type` → TypeORM infers `Object` → **API boot crash `tsc` can't catch** (kit lesson A-1): after any entity change, verify a real boot (`Nest application successfully started`); `BIGINT`→`bigintTransformer`, `DECIMAL`→`decimalTransformer`; camelCase prop ↔ snake_case `name:`; backtick reserved words; add `tenantId` (`tenant_id`) for tenant-scoped data + index. Per-tenant sequence numbers: composite unique `(tenant_id, number)` + max-sequence+1, never `count+1` (kit lesson B-1).
2. `dto/request/*.request.ts` — **snake_case** fields with class-validator. `dto/response/*.response.ts` — camelCase interface.
3. `{domain}.mapper.ts` — static methods entity→response (camelCase). Required, not optional.
4. `{domain}.service.ts` — business logic + tenant scoping (`tenantId` from `user`); throw `BusinessException(ERROR_CODE.X, HttpStatus.Y)` — allocate a fresh Exxxx block for a new module (next free range past current max). 4xx aren't server-logged: `logger.warn` in rejecting guards.
5. `{domain}.controller.ts` — thin; decorate with `@Auth()/@AdminOnly()/@RequireRank()/@RequireCapability()` or `@Public()` (widget). Return plain objects/entities or `new Paginated(items, buildPagination(page,size,total))`.
6. `{domain}.module.ts` — `TypeOrmModule.forFeature([...])`, providers, exports. **Register it in `app.module.ts`.**

## 2. Adding a frontend feature (React)
- Service in `services/` using the shared `api-client` (unwraps the standard envelope).
- React Query hook in `hooks/` — **include `tenantId` in the query key**; mutations invalidate the right keys.
- Zustand store only for cross-component global state.
- ALL visible text via `t('ns:key')`; add keys to en/es/ko locale files and register the namespace in `i18n.ts`. No hardcoded strings, no English-only aria-labels.
- Use design tokens (Tailwind theme): primary `#6366F1`, header 64px, sidebar 240/64px, Pretendard font; reusable Button/Table/Modal/Badge/Pagination; modal `role="dialog"`+Esc, chat `aria-live`.

## 3. Cross-cutting rules (MUST)
- **Standard response**: never hand-build `{success,data}` — the global interceptor does it.
- **Errors**: `BusinessException` + `ERROR_CODE` (Exxxx). Messages English; client localizes by code.
- **Multitenancy**: filter every tenant-scoped query by `tenant_id`; never trust client-supplied tenant. Narrow `Principal` (`actorType==='user'`) before reading `tenantId`.
- **Moderation**: every AI/agent outbound message goes through `ModerationService.moderate()` (fail-safe block). Never deliver unmoderated.
- **AI**: call `AiGatewayService.complete({tenantId, function, ...})` — never hardcode a provider; it resolves the engine per tenant/function and falls back to stub. ⚠️ Model IDs must be env-overridable (`process.env.X || DEFAULT`) — a hardcoded retired model took ALL AI features down globally (kit lesson D-1).
- **External systems**: never hardcode external resource names (folder names, webhook schemas) — resolve via discovery/config; verify webhook signature schemes against the provider's actual SDK, not docs guesses (kit §3.6, lessons D-2/D-3/D-5).
- **UX feedback**: every save/update/create/delete shows explicit success/error feedback (toast) — silent success is banned; retrofitting this cost AMA 120+ call sites (kit §4.3).
- **Privacy**: passwords bcrypt; credentials AES-256-GCM (`crypto.util`); mask PII in logs; `AuditService.write` for privileged actions; honor consent/opt-out.

## 4. Quality gates (before "done")
- `npm run typecheck` and `npm run build` green for affected workspaces.
- Entity/DI/module changes: **real local API boot verified** (tsc pass ≠ boot success).
- New UI text present in en + es + ko.
- Tenant-scoped data filtered by `tenant_id`; no cross-tenant path.
- Add/extend a test (`npm test` — Jest suite exists, 60+ unit tests; keep it growing).
- Schema changed? Idempotent SQL in `sql/` + PR body `## Migration` section (§6).
- New module? SPEC.md updated (tables, API endpoints, error codes) + module registered in `app.module.ts`.

## 5. Commands
`npm run db:up` (MySQL :3316 / Redis :6389 / RabbitMQ :5682) · `npm run db:seed` · `npm run dev` (api :3000, web :5173, widget :5174) · `npm run build` · `npm run typecheck`. If Docker Desktop is flaky, let the daemon settle ~40s before `db:up`; the lighter run is prebuilt `node apps/api/dist/main.js` + `vite`.

## 6. Workflow, git & deploy (kit 03/04 rules)
**Doc filenames (MUST)**: `{PREFIX}-{YYMMDD}-{Topic}.md` — prefix first, then the 6-digit date,
then the topic, so a directory listing reads chronologically per kind
(`docs/plan/PLN-260804-Ops-Logs-Stats-KnowledgeConflict.md`). Deliberate deviation from the kit's
`{PREFIX}-{Topic}-{YYYYMMDD}` (SPEC §13). `docs/log/YYYY-MM-DD/` keeps the full date.

`[요구사항]`/requirements-type work follows **REQ → PLN → 구현 → TCR → RPT**, strictly:
`docs/analysis/REQ-{YYMMDD}-{Topic}.md` (AS-IS/TO-BE/gap/flow/constraints) →
`docs/plan/PLN-…` — ⚠️ **ASCII wireframe MUST for any UI change** (backend-only: state
"no UI impact") and ⚠️ **implement only after the user approves the PLN, never auto-start** →
implementation → `docs/test/TCR-…` (unit/integration/edge) → `docs/implementation/RPT-…`
(changes, files, tests, **deploy state: PR#, SHA, per-env deploy/migration**).
Bug fixes: root cause (no symptom patching) → proposal → minimal change →
`docs/bug-fix/FIX-{YYMMDD}-{Topic}.md` + prevention pattern. Legacy `AN-/PLAN-/TC-` files and
anything named before 2026-08-04 are historical — **never rename**.
Map code to design IDs (FR→FN→SCR→TBL→SEQ→T).
Git: `feature/*` off `main`, PR + squash-merge; `main`→`production` merge commit;
commit `{type}: {desc}`.
- **Schema-change PR** (touches `sql/*.sql` or `*.entity.ts`): PR body MUST have a
  `## Migration` section (SQL path, per-env apply checkboxes, rollback). Deploy scripts
  do NOT run SQL — apply migrations to the target DB **before** deploying code
  (skill `pre-deploy-check`).
- **Solo-dev merge**: self-approval impossible → `gh pr merge <N> --squash --admin`.
- **Deploy verification** (staging `ssh` → `bash docker/staging/deploy-staging.sh` on the
  server, never locally): don't trust exit codes — check boot log
  (`successfully started`), container age (`docker ps` STATUS), new-route status:
  **401 = deployed / 404 = not deployed / 502 = API down (check Restarting)**.
- Shared working dirs (Orca worktrees): after commit/push, confirm
  `git branch --show-current` + `git ls-remote origin <branch>`; recover hijacked
  branches by pushing the commit SHA to a fresh remote branch (kit 03 §3.2).

## 7. Open gaps to respect
The 2026-06 audit roadmap is closed (SPEC §14 resolution log). Current open items:
e2e HTTP tests (supertest + test DB); Shopify OAuth partner approval; production host +
`.env.production`; ⚠️ staging still runs `DB_SYNCHRONIZE=true` (kit MUST violation —
flip to `false` + manual SQL pre-apply once the migration runbook is exercised there).

---
name: ivy-talktalk-dev
description: Development skill for the IVY USA Chat & Support Widget monorepo. Use whenever adding/editing a backend domain module (NestJS), a frontend feature (React admin/widget), entities, DTOs, RBAC, i18n, or AI/moderation code in this repo. Encodes the Amoeba company standards (skill/SPEC/structure/code_convention/web_style_guide/privacy v2) as applied here. Trigger on tasks touching apps/api, apps/web, apps/widget, or packages/*.
---

# IVY TalkTalk — Development Skill

Apply this whenever you implement or modify code in this monorepo. It distills
`reference/amoeba_basic_skill_v2.md` (+ SPEC/structure/code_convention/web_style_guide/
privacy v2) for this project. Pair with `CLAUDE.md` and `SPEC.md`.

## 0. Stack & layout (ground truth)
- Monorepo (Turborepo): `apps/{api,web,widget}`, `packages/{types,common}`.
- Backend: **NestJS 10 + TypeORM + MySQL 8** + Redis + RabbitMQ. Frontends: **React 18 + Vite + Tailwind + Zustand + React Query + react-i18next**.
- Languages: **en (default) / es / ko**. Pluggable AI gateway (stub | anthropic).
- Approved deviations (do NOT "fix" without instruction): MySQL+BIGINT+bare table/column names, en/es/ko, scalar FKs, single-buffer AES-256-GCM. See `SPEC.md §13`.

## 1. Adding a backend domain module (NestJS)
Create under `apps/api/src/domain/{domain}/`:
1. `entity/{name}.entity.ts` — `@Entity('{table}')`; PK `@PrimaryGeneratedColumn({ type:'bigint' })`; nullable cols specify `type`; `BIGINT`→`bigintTransformer`, `DECIMAL`→`decimalTransformer`; camelCase prop ↔ snake_case `name:`; backtick reserved words; add `tenantId` (`tenant_id`) for tenant-scoped data + index.
2. `dto/request/*.request.ts` — **snake_case** fields with class-validator. `dto/response/*.response.ts` — camelCase interface.
3. `{domain}.mapper.ts` — static methods entity→response (camelCase). Required, not optional.
4. `{domain}.service.ts` — business logic + tenant scoping (`tenantId` from `user`); throw `BusinessException(ERROR_CODE.X, HttpStatus.Y)`.
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
- **AI**: call `AiGatewayService.complete({tenantId, function, ...})` — never hardcode a provider; it resolves the engine per tenant/function and falls back to stub.
- **Privacy**: passwords bcrypt; credentials AES-256-GCM (`crypto.util`); mask PII in logs; `AuditService.write` for privileged actions; honor consent/opt-out.

## 4. Quality gates (before "done")
- `npm run typecheck` and `npm run build` green for affected workspaces.
- New UI text present in en + es + ko.
- Tenant-scoped data filtered by `tenant_id`; no cross-tenant path.
- Add/extend a test where feasible (repo currently has none — start the habit).

## 5. Commands
`npm run db:up` (MySQL :3316 / Redis :6389 / RabbitMQ :5682) · `npm run db:seed` · `npm run dev` (api :3000, web :5173, widget :5174) · `npm run build` · `npm run typecheck`. If Docker Desktop is flaky, let the daemon settle ~40s before `db:up`; the lighter run is prebuilt `node apps/api/dist/main.js` + `vite`.

## 6. Workflow & traceability
For `[Requirements]`-type work follow: Analysis (`docs/analysis/`) → Plan (`docs/plan/`) →
Implementation → Test cases (`docs/test/`) → Implementation report (`docs/implementation/`).
Map code to design IDs (FR→FN→SCR→TBL→SEQ→T). Git: `feature/*` off `main`, PR + squash-merge;
commit `{type}: {desc}`.

## 7. Open gaps to respect
When you touch related code, prefer closing these (see `docs/report/RPT-Standards-Compliance-Audit-20260619.md`):
add `tenant_id` to legacy tables + a tenant-scope guard; Shopify GDPR webhooks + DSAR/opt-out;
PII masking/audit; bcrypt rounds 10→12; normalize DTO folders + missing mappers; soft-delete columns.

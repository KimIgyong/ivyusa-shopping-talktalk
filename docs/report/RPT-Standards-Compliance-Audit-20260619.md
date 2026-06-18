# Standards Compliance Audit — IVY USA Chat & Support Widget

| | |
|---|---|
| **Doc ID** | CHATWIDGET-RPT-AUDIT-1.0.0 |
| **Date** | 2026-06-19 |
| **Auditor** | Automated standards-compliance audit (read-only) |
| **Repo** | `ivy-talktalk` (Turborepo: `apps/{api,web,widget}`, `packages/{types,common}`) |
| **Standards** | Amoeba v2 — Structure / Code Convention / SPEC / Web Style Guide / Privacy & Compliance / Skill |
| **Method** | Direct inspection of controllers, services, entities, DTOs, mappers, global guards/decorators/interceptors/filters, crypto util, error codes, schema SQL, tailwind configs, i18n setup, package/root configs. No code modified. |

> **Reading note on context.** This project deliberately deviates from a few v2 examples for documented reasons: the standards' DB examples are PostgreSQL + UUID + `amb_`/`{prefix}_` table & 3‑char column prefixes, whereas this project uses **MySQL 8 + bigint auto-increment + bare snake_case table/column names** (legacy schema kept as-is per `CLAUDE.md:16`); and the standard i18n trio is **ko/en/vi** whereas this US-storefront project uses **en/es/ko** (SPEC §2, NFR-driven). These are called out where relevant rather than treated as silent failures, but they are still divergences from the literal v2 text.

---

## 1. Executive Summary

| Standard | Status | Note |
|---|---|---|
| **Structure v2** | 🟡 Partial | Monorepo + apps/packages/global/infrastructure correct; but domain modules omit `repository/`, most use flat `{domain}.dto.ts` instead of `dto/request`+`dto/response`, `docker/` is dev-only (no staging/production/deploy scripts), `sql/` lacks migration files, most `docs/` subdirs empty. |
| **Code Convention v2** | 🟡 Partial | Layers, `@Auth`-style decorators, mapper static pattern, standard response envelope, Exxxx codes, snake/camel DTO split all present. Diverges on: no table/column prefixes, no 3-char col prefix, bigint PK (not UUID), scalar FK columns (no relations), no soft-delete columns, encryption is single-buffer not 3-field, partial mapper coverage, i18n languages en/es/ko vs ko/en/vi. |
| **SPEC v2** | 🟡 Partial | Root `SPEC.md` exists and is well-structured for this project, but is a bespoke condensed doc — it omits several template sections (deployment domains, NFR security/performance/observability/backup tables, payment, full external-integration matrix). DB is MySQL not PostgreSQL. |
| **Web Style Guide v2** | 🟡 Partial | Primary `#6366F1`, Pretendard, header 64px / sidebar 240px-64px, chat bubbles, semantic colors all present. Gaps: partial primary ramp (no 50-900), modal lacks `role="dialog"`/focus trap, chat thread lacks `role="log"`/`aria-live`/`aria-busy`, some hardcoded UI strings, bubble `max-w-[80%]` vs guide 70%. |
| **Privacy & Compliance v2** | ❌ Gap | Strong on encryption, bcrypt, audit log, moderation, CCPA consent gate + "Do Not Sell" affordance. **Missing the mandatory pieces:** Shopify GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`), DSAR API endpoints (access/delete/correct/portability/processing-stop), real opt-out endpoint, retention/disposal, PII-access audit logging, PII masking in logs/admin. |
| **Skill v2** | 🟡 Partial | Follows the implementation-report convention and traceability (FR/FN/SCR/TBL/SEQ). But the prescribed Analysis→Plan→Impl→Test→Report doc chain is incomplete (`docs/analysis|plan|test` empty), and **there are zero tests** in the repo despite the Skill §13 testing strategy. |

---

## 2. Per-Standard Sections

### 2.1 Structure v2

| Rule | Status | Evidence |
|---|---|---|
| Turborepo monorepo (`turbo.json`, workspaces) | ✅ | `turbo.json`; `package.json:7-10` workspaces `apps/*`, `packages/*` |
| `apps/api` (NestJS) required | ✅ | `apps/api/src/{domain,global,infrastructure,app.module.ts,main.ts}` |
| `apps/web` (React) required | ✅ | `apps/web/src` (React 18 + Vite) |
| Extra app `apps/widget` | ✅ (allowed) | `apps/widget/src` — not in the standard list but consistent with "deployment units" |
| `packages/common` (tsup) + `packages/types` | 🟡 | Both present (`packages/common/src`, `packages/types/src`); common ships no `tsup.config.ts` (built via tsc/turbo) |
| Backend domain module internal structure (controller/service/entity/dto/mapper/module) | 🟡 | controller/service/module/entity present everywhere; **mapper only in ~10 of 22 domains**; DTOs inconsistent (see Code Convention §3) |
| `repository/` per domain | 🟡 (optional) | No `repository/` dirs anywhere — services use `@InjectRepository(...)` directly (allowed, since repository is optional, but no custom repos) |
| `global/` layout (config/filter/interceptor/decorator/guard/constant/util/i18n) | 🟡 | Present: `config/`, `filter/`, `interceptor/`, `decorator/`, `guard/`, `constant/`, `util/`, `exception/`. **No `global/i18n/`** (backend has no i18n dir — acceptable since BE messages are English by design), no `pipe/`, no `middleware/` |
| `infrastructure/` layer (cache/queue/external) | ✅ | `infrastructure/cache/redis.service.ts`, `infrastructure/queue/event-bus.service.ts`, `infrastructure/external/ai/{ai-gateway.service.ts,adapters/}` |
| `docker/` separated dev/staging/production + deploy scripts | ❌ | Only `docker/docker-compose.dev.yml` + `docker/init-sql/01-schema.sql`. **No `staging/`, `production/`, no `deploy-*.sh`** (Structure §5.1, SPEC §12.3 mark deploy scripts MUST) |
| `env/backend` + `env/frontend` `.env.development` | ✅ | `env/backend/.env.development`, `env/frontend/.env.development` |
| `sql/` migration directory | 🟡 | `sql/01-schema.sql` + `sql/README.md` exist, but it is a full schema dump, not incremental `migration_*.sql` files |
| `docs/` subtree (analysis/plan/implementation/test/report/guide/design/log) | 🟡 | All 8 dirs exist but only `docs/implementation/` is populated (1 report). analysis/plan/test/report/guide/design/log all empty |
| Root files: `package.json`, `turbo.json`, `tsconfig.json`, `.gitignore`, `CLAUDE.md`, `SPEC.md`, `CHANGELOG.md`, `README.md` | ✅ | All present at root |
| `reference/` standard docs placed | ✅ | `reference/` contains all 6 `amoeba_*_v2.md` + access-control policy |

### 2.2 Code Convention v2

| Rule | Status | Evidence |
|---|---|---|
| File naming kebab-case (`*.controller.ts` etc.) | ✅ | `customer/customer.controller.ts`, `customer/customer.service.ts`, `customer/customer.mapper.ts` |
| Class naming PascalCase (`XController`, `XService`, `XMapper`) | ✅ | `CustomerController`, `CustomerService`, `CustomerMapper` (customer.*.ts) |
| Request DTO snake_case | ✅ | `customer.request.ts` `page/size/email`; `chat.controller.ts:13-18` `session_token`, `conversation_id`; `campaign.dto.ts` `segment_ref` |
| Response DTO camelCase | ✅ | `customer.response.ts` `shopifyCustomerId/createdAt`; mappers return camelCase |
| Layer rule: Controller → Service (no repo in controller) | ✅ | Controllers inject only services (`customer.controller.ts`, `chat.controller.ts`); repositories injected only in services |
| Controller holds no business logic | 🟡 | Mostly clean; minor logic leaks — `customer.controller.ts:62-67` `tenantId()` guard helper, `chat.controller.ts:38-52` builds an inline response object instead of delegating to a mapper |
| `@Auth()` / role decorators applied | ✅ | `global/decorator/auth.decorator.ts` defines `Auth()`, `RequireCapability()`, `AdminOnly()`, `RequireRank()`; applied e.g. `customer.controller.ts:33` `@RequireCapability(CAPABILITY.CUSTOMER_MANAGE)`, `auth.controller.ts` `@Auth()` |
| Multi-tenancy `tenant_id` filtering in services | 🟡 | Enforced where applicable (`customer.service.ts` every query takes `tenantId`); but **many tables/entities have no tenant_id** (customers, sessions, conversations, messages — see §3); `chat.service.ts:181-184 resolveTenantId()` just picks the first tenant (single-tenant shortcut) |
| Entity nullable explicit `type` (MUST) | ✅ | `customer.entity.ts` `tenantId: number \| null` has `type:'bigint'`; `tenant.entity.ts` `name`/`plan` nullable with `type:'varchar'`; `integration-credential.entity.ts` `secretEnc` `type:'varbinary'` |
| Mapper static pattern | 🟡 | Where present, correct (`CustomerMapper.toCustomer` static, `customer.mapper.ts`); but absent in ~half the domains (chat, session, order webhook return inline objects) |
| Standard response envelope wrapping | ✅ | `global/interceptor/transform.interceptor.ts` wraps to `BaseSingleResponse`/`BaseListResponse` + `Paginated` marker; registered `main.ts:19` |
| Error-code system Exxxx | ✅ | `global/constant/error-code.constant.ts` E1xxx–E9xxx; `business.exception.ts` carries code; `all-exception.filter.ts` renders envelope |
| §14 i18n — `t()` / namespaces / no hardcoding | 🟡 | Web + widget use react-i18next with per-domain namespaces; some hardcoded strings remain (toast messages `customers.hooks.ts:20,24`; `<option>` literals; widget `Storefront.tsx:16-18`, English `aria-label`s) |
| §14 BE messages English | ✅ | `error-code.constant.ts` messages all English; FE localizes by code (`all-exception.filter.ts`) |
| §14 languages | 🟡 | en/es/ko (`apps/web/src/i18n/i18n.ts:58`, `apps/widget/src/i18n/i18n.ts:9`) — diverges from standard ko/en/vi; intentional per SPEC NFR (US storefront) |
| DB table naming `{prefix}_{plural}` | ❌ | Bare names, no prefix: `customers`, `sessions`, `conversations` (`sql/01-schema.sql`); documented exception (`CLAUDE.md:16`) |
| DB column 3-char `{colPrefix}_` | ❌ | Bare columns `email`, `name`, `status`, `tenant_id` (`sql/01-schema.sql`); no col prefix |
| PK UUID | ❌ | `BIGINT AUTO_INCREMENT` everywhere (`customer.entity.ts:9`, schema) |
| Soft delete `{prefix}_deleted_at` | ❌ | No `@DeleteDateColumn` / `deleted_at` in any entity inspected; deletes are hard or status-based |
| Encryption 3-field `_encrypted/_iv/_tag` | ❌ | Single `varbinary` buffer `[IV][tag][ciphertext]` (`crypto.util.ts:18-33`, `integration-credential.entity.ts secretEnc`) — AES-256-GCM is honored, layout is not |
| Git convention (production/main, feat: prefix) | ⚪ N/A | Not assessable from repo state (single working tree; no branch/PR evidence in scope) |
| Multi-tenancy guard auto-isolation (`OwnEntityGuard`) | 🟡 | No `OwnEntityGuard`; tenant scope is enforced manually in services + `AuthorizationGuard` actor/rank/capability checks (`authorization.guard.ts`). Functional but not the standard auto-filter guard |

### 2.3 SPEC v2 (root `SPEC.md` vs template)

| Required template section | Status | Evidence |
|---|---|---|
| 1 Project Overview / actors | ✅ | `SPEC.md:12-24` |
| 2 Tech Stack | ✅ | `SPEC.md:26-38` (note: MySQL not PostgreSQL; RabbitMQ not Bull/Redis-queue) |
| 3 System Architecture (4-layer) | ✅ | `SPEC.md:40-46` |
| 4 Project Structure | ✅ | `SPEC.md:48-60` |
| 5 Multi-Tenancy Design | 🟡 | `SPEC.md:42-46` mentions `tenant_id` + `TenantGuard`, but no Entity/Cell/Unit model (project uses tenant + rank×label RBAC instead — appropriate for this domain) |
| 6 Database Design | 🟡 | `SPEC.md:62-67` summary only; naming-convention table omitted |
| 7 API Design + response envelopes + DTO case | ✅ | `SPEC.md:69-74` |
| 8 Auth & RBAC + token policy | 🟡 | `SPEC.md:76-80` covers JWT/RBAC/encryption; no explicit token TTL table (15m/7d is in code, `auth.service.ts`) |
| 9 AI Integration | ✅ | `SPEC.md:82-88` (pluggable gateway + moderation gate) |
| 10 Development Environment / ports | ❌ | Not in root SPEC (only in CLAUDE.md commands) |
| 11 Code Conventions | 🟡 | Folded into §6/§7; no dedicated section |
| 12 Deployment Environment (domains, deploy scripts) | ❌ | Absent |
| 13 External Integrations matrix | 🟡 | Mentioned inline (Shopify/Klaviyo/Odoo/Google) but no structured matrix/DPA note |
| 14 Payment System | ⚪ N/A | Out of scope for this product |
| 15 Non-Functional Requirements (security/perf/observability/backup/privacy) | ❌ | Not in root SPEC (privacy obligations live in design/standards, not surfaced) |
| 16 Reference Documents | ✅ | `SPEC.md:94-97` |

> The root `SPEC.md` is intentionally a concise project spec rather than the full v2 template; it is internally coherent and traceability-rich, but several mandatory v2 template chapters (Deployment, NFR, ports) are not represented anywhere in `SPEC.md`.

### 2.4 Web Style Guide v2

| Rule | Status | Evidence |
|---|---|---|
| Primary `#6366F1` at 500 | ✅ | `apps/web/tailwind.config.js:9`; `apps/widget/tailwind.config.js:9` |
| Full primary 50-900 ramp | ❌ | web defines only 400/500/600 (`tailwind.config.js:7`); widget only 400/500/600 (`:8-10`) |
| Semantic colors (success/warning/error/info) | ✅ | `apps/web/tailwind.config.js:12-15`; widget `:12-15` |
| Grayscale 50-900 | ✅ | web `tailwind.config.js:16-27` |
| Typography Pretendard (declared + loaded) | ✅ | web `tailwind.config.js:30` + `index.css:6` + `index.html` CDN; widget `tailwind.config.js:27-36` + `index.css:13` + `index.html:9` |
| Header 64px | ✅ | `apps/web/src/layouts/Header.tsx:71` `h-16` |
| Sidebar 240px / collapsed 64px | ✅ | `apps/web/src/layouts/Sidebar.tsx:28` `w-[240px]`/`w-[64px]` (uses arbitrary values, not the `sidebar` spacing tokens defined in config) |
| Chat message bubbles (mine right/primary, other left/gray, tail corners) | 🟡 | `apps/widget/src/components/chat/MessageBubble.tsx:7-14` correct colors/alignment/corners; `max-w-[80%]` (`:8`) vs guide `max-w-[70%]` |
| Icon library Lucide | ✅ | `lucide-react` used (Header, widget components) |
| A11y: modal `role="dialog"`/`aria-modal`/Esc | ❌ | `apps/web/src/components/Modal.tsx` has none; widget `WidgetPanel.tsx:26` has `role="dialog"` but no focus trap/Esc |
| A11y: chat `role="log"` + `aria-live="polite"` + streaming `aria-busy` | ❌ | `apps/widget/src/components/chat/ChatTab.tsx:118-121` thread has no live-region attributes; no streaming/typing indicator |
| A11y: focus-visible ring | 🟡 | Present on inputs (web `Field.tsx:5`) but absent on `Button.tsx`; icon header buttons use `title` not `aria-label` |
| Multilingual fonts (verify es/ko glyphs) | ✅ | Pretendard covers Latin+Hangul; es uses Latin (ok); no vi here so diacritic concern N/A |

### 2.5 Privacy & Compliance v2

| Rule (ID) | Status | Evidence |
|---|---|---|
| PRV-001 Consent before processing | 🟡 | Widget consent gate `ConsentBanner.tsx` → `session.service` POST `/session/consent`; backend stores `consentState` (`session.service.ts:55-60`, schema `sessions.consent_state`). But chat does not hard-block on `PENDING`/`DECLINED` server-side (no consent check in `chat.service.handleUserMessage`) |
| PRV-005 Encryption at rest (AES-256-GCM) | 🟡 | `crypto.util.ts` AES-256-GCM for credentials/API keys (`tenant.service.ts:75`, `ai-engine.service.ts:35`). **Not the 3-field `_encrypted/_iv/_tag` layout.** Customer PII (email/name) stored **plaintext** (`customers` table) — not encrypted |
| PRV-005 / §4 Password bcrypt | 🟡 | bcrypt used (`auth.service.ts:137`, `user.service.ts:69`), but **salt rounds = 10** vs standard **12** (SPEC §8.4/§15.1) |
| §4 PII masking in logs / admin | ❌ | No masking; `notification.service.ts` logs titles, `moderation.service.ts finalize` stores `truncate(text,512)` excerpt; admin customer list returns raw email (`customer.mapper.ts`) |
| PRV-010..017 DSAR endpoints (access/delete/correct/portability/processing-stop) | ❌ | None found. Customer module only has list/get/update (`customer.controller.ts`); no delete/export/erasure/portability endpoints |
| PRV-013 / PRV-022 CCPA opt-out of sale/sharing | 🟡 | Widget "Do Not Sell or Share" affordance exists (`PreferencesPanel.tsx:131-149`, `en.ts:130`) but it only toggles notification prefs (`PreferencesPanel.tsx:133-144`) — not a dedicated sale/share opt-out API/flag |
| §7 Shopify GDPR mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) | ❌ | Only a generic `POST /webhooks/fulfillment` exists (`order/webhook.controller.ts`); the 3 required Shopify compliance webhooks are absent |
| PRV-040 PII-access audit logging | 🟡 | Audit log infra exists (`audit/audit.service.ts`, `audit_logs` table) for privileged actions, but PII reads (customer view/list) are **not** audit-logged |
| §3 Retention / disposal | ❌ | No retention periods, TTL, or disposal job for sessions/conversations/messages/customers |
| §6 Processor DPA / cross-border | ⚪ N/A doc | Not representable in code; not documented in SPEC |
| Moderation gate (NFR-013) fail-safe | ✅ | `moderation.service.ts moderate()` mandatory, catch → BLOCK; invoked in `chat.service.ts:130-141` and agent send |
| Transit TLS | ⚪ | Deferred to Nginx/infra; not in app code |

### 2.6 Skill v2 (dev workflow)

| Rule | Status | Evidence |
|---|---|---|
| Turborepo monorepo + standard commands | ✅ | `package.json` scripts `dev/build/lint/test/typecheck/db:up/db:seed`; `CLAUDE.md:22-26` |
| Analysis→Plan→Impl→Test→Report doc chain | 🟡 | Only Implementation present (`docs/implementation/RPT-ChatWidget-Implementation-20260618.md`); `docs/analysis`, `plan`, `test`, `report` empty |
| Traceability (FR/FN/SCR/TBL/SEQ) | ✅ | `SPEC.md:90-92`; impl report maps every module to design IDs; code comments cite FR/FN/SEQ (e.g. `chat.service.ts` SEQ-03, `moderation.service.ts` FR-069) |
| Mapper pattern, response config, QueryClient | 🟡 | Mappers partial; React Query present (web/widget hooks) |
| §13 Testing strategy (unit/integration/e2e) | ❌ | **Zero test files** in repo (`find … -name '*.spec.ts'` → 0); `turbo test` defined but no tests |
| §16/§17 Security & Privacy skills | 🟡 | Encryption + moderation + audit implemented; DSAR/masking/retention missing (see §2.5) |
| Mock data system (MSW) / stub | 🟡 | No MSW; AI stub adapter exists (`infrastructure/external/ai/adapters/stub.adapter.ts`) |

---

## 3. Code-Convention Violation Analysis

| # | Convention rule | Expected | Actual (file:line) | Severity | Fix recommendation |
|---|---|---|---|---|---|
| 1 | Table naming `{prefix}_{plural}` | `cw_customers` / `amb_customers` | Bare `customers`, `sessions`, `conversations`, … (`sql/01-schema.sql`) | Med | Documented exception (`CLAUDE.md:16`). Keep, or add project prefix `cw_` in a future migration; ensure standard waiver is recorded. |
| 2 | Column 3-char prefix `{colPrefix}_{name}` | `cus_email`, `cus_name` | Bare `email`, `name`, `status` (`sql/01-schema.sql`; `customer.entity.ts`) | Low | Cosmetic given documented exception; not worth churn now. Document as accepted deviation. |
| 3 | PK UUID | `@PrimaryGeneratedColumn('uuid')` | `BIGINT AUTO_INCREMENT` (`customer.entity.ts:8-9`, all entities) | Med | Acceptable for MySQL perf; document as accepted deviation. If cross-tenant ID guessing is a concern, expose opaque IDs externally. |
| 4 | Entities use relations for FKs | `@ManyToOne(() => Tenant)` | Scalar FK columns only — `tenantId: number`, `customerId: number` (`customer.entity.ts:13`, `notification-pref.entity.ts:13`, `chat/*.entity.ts`) | Low | Intentional (decoupled, tenant-scoped queries). Keep; ensure indexes exist (they do, e.g. `idx_customers_tenant`). |
| 5 | Encryption 3-field `_encrypted/_iv/_tag` | 3 columns per secret | Single `varbinary` buffer `[IV][tag][ct]` (`crypto.util.ts:18-33`; `integration-credential.entity.ts secretEnc`) | Med | Algorithm (AES-256-GCM) compliant; layout differs. Either document the single-buffer layout as an approved variant, or split into 3 fields to match standard tooling/expectations. |
| 6 | bcrypt salt rounds ≥ 12 | 12 | `10` (`auth.service.ts:137`, `user.service.ts:21` `BCRYPT_ROUNDS=10`, `seed.ts:27`) | Med | Raise to 12 in one shared constant; remove the literal `10` in `auth.service.ts:137`. |
| 7 | Soft delete `{col}_deleted_at` / `@DeleteDateColumn` | present | Absent in all inspected entities | Med | Add `@DeleteDateColumn` (`deleted_at`) where the standard expects soft delete (customers, conversations, users) or document hard-delete decision. |
| 8 | Mapper required (recommended) for Entity→Response | static mapper per domain | Present in ~10/22 domains; missing in chat, session, order-webhook, restock, review, subscription, analytics, cjm, integration, moderation | Med | Add `*.mapper.ts` for response-returning domains; replace inline object construction in `chat.controller.ts:38-52` with a mapper. |
| 9 | DTO folder structure `dto/request` + `dto/response` | per Structure §2.2 | Mixed: auth/customer/tenant/user/order use `dto/request`+`dto/response`; agent/ai-engine/campaign/knowledge/notification/inquiry use flat `{domain}.dto.ts`; integration has only `dto/request` | Med | Normalize to `dto/request` + `dto/response` (with response interfaces) across all domains. |
| 10 | DTO casing — request snake_case | snake_case | Compliant (`campaign.dto.ts` `segment_ref`, `chat.controller.ts:14-17`); inline request classes live in controller (`chat.controller.ts:13-18`) rather than `dto/` | Low | Move `SendMessageRequest`/`EscalateRequest` out of `chat.controller.ts` into `dto/request`. |
| 11 | Controller holds no business logic | thin controllers | `customer.controller.ts:62-67` private `tenantId()` actor-guard; `chat.controller.ts:38-52` builds response shape inline | Low | Push actor→tenant resolution into a shared decorator/guard; move response shaping into a mapper. |
| 12 | Multi-tenant `tenant_id` on all data tables | every data table | Missing on `customers` (added later via `ALTER`, nullable), `sessions`, `conversations`, `messages`, `notifications`, `reviews`, `orders_cache`, etc. (`sql/01-schema.sql` NOTE block at customers; many tables have no tenant_id) | High | Add `tenant_id` (NOT NULL where possible) + composite indexes to all tenant-scoped tables; replace `chat.service.ts:181 resolveTenantId()` "first tenant" shortcut with real per-session tenant resolution to prevent cross-tenant bleed. |
| 13 | i18n no hardcoded UI text | all via `t()` | Toasts `customers.hooks.ts:20,24`, `settings.hooks.ts:19`, `ai-settings.hooks.ts:15,30,42`, `admin.hooks.ts:23+`; `<option>` literals `KnowledgePage.tsx:194`, `CampaignsPage.tsx:111,113`; widget `Storefront.tsx:16-18,46`, `PreferencesPanel.tsx:86`; English `aria-label`s `WidgetPanel.tsx:27,47`, `Widget.tsx:22` | Med | Route all these through `t()`; add keys to en/es/ko namespaces. |
| 14 | i18n languages | ko/en/vi | en/es/ko (`web/i18n.ts:58`, `widget/i18n.ts:9`) | Low | Intentional per SPEC (US storefront, NA en + es; ko retained). Document as approved deviation from the literal v2 trio. |
| 15 | React Query key includes tenant/entity id | yes (Convention §6.4) | Keys omit tenantId — `['customers', params]` (`customers.hooks.ts:8`), `['dashboard']` (`dashboard.hooks.ts:5`), `['credentials']` (`settings.hooks.ts:8`) | Med | Fold `principal.tenantId` into query keys to prevent cross-tenant cache reuse on account switch. |
| 16 | DB is PostgreSQL 15 | PostgreSQL | MySQL 8 (`sql/01-schema.sql` InnoDB/utf8mb4; TypeORM MySQL) | Low | Intentional/approved deviation; document. |
| 17 | `OwnEntityGuard` auto data isolation | global guard | Manual per-service tenant filtering + `AuthorizationGuard` (actor/rank/capability only — no tenant filter) (`authorization.guard.ts`) | Med | Add a tenant-scope guard/interceptor or repository wrapper so isolation isn't reliant on each service remembering to pass `tenantId`. |

---

## 4. Prioritized Remediation List

### High
1. **Add Shopify GDPR mandatory webhooks** `customers/data_request`, `customers/redact`, `shop/redact` (Privacy §7; required for any Shopify app). Currently only `/webhooks/fulfillment` exists (`order/webhook.controller.ts`). *(Compliance blocker.)*
2. **Implement DSAR / consumer-rights endpoints** — access/export (portability), delete/erasure, correct, processing-stop, and a true CCPA sale/share opt-out flag (Privacy PRV-010..017, 022). Customer module today is list/get/update only.
3. **Tenant isolation on every data table** — add `tenant_id` (+ composite indexes) to `customers`/`sessions`/`conversations`/`messages`/`notifications`/etc., and replace `chat.service.ts:181 resolveTenantId()` "first tenant" shortcut with real resolution. Add a tenant-scope guard so isolation isn't manual-only (Violations #12, #17). *(Cross-tenant data-leak risk.)*

### Medium
4. **PII protection**: encrypt customer email/name at rest or document the decision; add PII masking in logs/admin (`notification.service.ts`, `moderation.service.ts`, `customer.mapper.ts`); audit-log PII reads (Privacy §4, PRV-040).
5. **Raise bcrypt rounds 10 → 12** in one shared constant (Violation #6).
6. **Server-side consent enforcement** — block chat/order processing when `consentState != GRANTED` (Privacy PRV-001).
7. **Define data retention/disposal** for sessions/conversations/messages/customers (Privacy §3).
8. **Normalize DTO structure** to `dto/request`+`dto/response` and **add missing mappers** (chat, session, order-webhook, etc.); move inline DTO classes out of controllers (Violations #8, #9, #11).
9. **Move hardcoded UI strings into i18n** across web hooks/pages and widget; localize English `aria-label`s (Violation #13).
10. **Add staging/production Docker + deploy scripts** under `docker/` (Structure §5.1, SPEC §12.3 MUST).
11. **A11y**: add `role="dialog"`/`aria-modal`/focus-trap/Esc to web `Modal.tsx`; add `role="log"`+`aria-live="polite"`+`aria-busy` to the widget chat thread; focus ring on `Button.tsx`.
12. **Include `tenantId` in React Query keys** (Violation #15).
13. **Decide & document encryption layout** — keep single-buffer as an approved variant or split into 3 fields (Violation #5).

### Low
14. Complete the **doc chain** (analysis/plan/test/report) and **add tests** (Skill §13 — repo has zero).
15. Extend Tailwind **primary ramp to 50-900** (both apps); use `sidebar` spacing tokens in `Sidebar.tsx`; set chat bubble `max-w-[70%]`.
16. Flesh out **root `SPEC.md`** with the missing v2 template chapters (Deployment, NFR security/perf/observability/backup, dev ports) or cross-link them.
17. Record the **approved deviations** (MySQL/bigint/no-prefix/en-es-ko, single-buffer encryption) in a single "Standards Deviations" note so future audits don't re-flag them.
18. Add soft-delete columns where the standard expects them (Violation #7).

---

*End of report.*

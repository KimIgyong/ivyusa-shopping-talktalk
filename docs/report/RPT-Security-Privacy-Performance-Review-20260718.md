# Security · Privacy · Performance Review — IVY USA Chat & Support Widget

| | |
|---|---|
| Doc ID | CHATWIDGET-RPT-SECREVIEW-1.0.0 |
| Date | 2026-07-18 |
| Scope | Full codebase read-only audit: `apps/{api,web,widget}`, `packages/*`, `docker/*`, `sql/*` |
| Method | 4 parallel deep audits (backend security · privacy/PII · performance · frontend+functional) + direct infra/dependency check. Every finding cited to `file:line`; top-severity items independently re-verified against source. |
| Reviewer | Claude (automated audit) |
| Companion | `RPT-Standards-Compliance-Audit-20260619.md` (prior baseline) · `SPEC.md §14` (gap roadmap) |

> **Bottom line.** The architecture is clean and many controls are done correctly (AES-256-GCM, timing-safe HMAC, RBAC deny-by-default, broad `tenant_id` coverage, non-bypassable moderation). But there are **two unauthenticated destructive paths**, **two cross-tenant data-exposure paths**, and a **weak-identity DSAR path** that are release-blocking, plus a set of privacy-completeness gaps and high-value performance fixes. The async/caching layers (RabbitMQ, Redis) are effectively decorative today — all real work is synchronous MySQL in the request path.

---

## 0a. Remediation status (2026-07-18, branch `fix/security-release-blockers`)

All six release blockers are **fixed** in the working branch (typecheck + build + 71 tests green; +9 new security unit tests):

| Ref | Fix | Files |
|---|---|---|
| SEC-C1 | Webhook HMAC now **fails closed** outside `NODE_ENV=development` | `global/util/shopify-hmac.util.ts` |
| SEC-C2 | Fulfillment webhook requires `X-Webhook-Secret` (`FULFILLMENT_WEBHOOK_SECRET`), fail-closed | `global/util/webhook-secret.util.ts`, `order/webhook.controller.ts` |
| SEC-C3 | DSAR export/erasure require Shopify-**verified** session identity (new `sessions.identity_level`); guest lookup no longer unlocks them | `session/entity/session.entity.ts`, `session/session.service.ts`, `privacy/privacy.service.ts`, `packages/types` |
| SEC-H1 | Agent console tenant-scoped via `requireConversation(id, tenantId)` on list/messages/accept/message/end/link/create/context | `agent/agent.service.ts`, `agent/agent-console.controller.ts` |
| SEC-H2 | Guest order lookup filters `o.tenant_id`/`c.tenant_id` by the session's tenant; rejects tenant-less sessions | `order/order.service.ts` |
| INF-2 | Staging MySQL bound to `127.0.0.1:3317` (was `0.0.0.0`) | `docker/staging/docker-compose.staging.yml` |

New env vars documented in `.env.development` + staging/production examples. Remaining findings below are **not yet addressed**.

---

## 0. Priority action list (do these first)

| # | Severity | Finding | Fix effort | Ref |
|---|---|---|---|---|
| 1 | 🔴 Critical | Shopify webhook HMAC fails **open** when secret unset → unauthenticated full-tenant purge (`shop/redact`) & customer redaction | S | SEC-C1 |
| 2 | 🔴 Critical | Unsigned `@Public()` fulfillment webhook → anyone tampers order status/tracking by guessing numeric id | S | SEC-C2 |
| 3 | 🔴 Critical | Guest order lookup (order# + email) binds session → grants full DSAR **export + erasure** of the victim account | M | SEC/PRV-C3 |
| 4 | 🟠 High | Cross-tenant IDOR across the entire agent console (read/take-over/post/end any tenant's conversation) | S | SEC-H1 |
| 5 | 🟠 High | Guest lookup binds sessions **cross-tenant** (no tenant filter) → all session-scoped reads leak tenant B's data | S | SEC-H2 |
| 6 | 🟠 High | No brute-force / rate limiting on login (or globally); no throttler in the stack | S | SEC-H3 |
| 7 | 🟠 High | DSAR export **incomplete** (no chat transcripts, cjm, subscriptions, phone) — "right to know" unmet | M | PRV-H1 |
| 8 | 🟠 High | DSAR erasure leaves PII (phone, subscriptions, prefs, affiliate); message scrub is fragile | M | PRV-H2 |
| 9 | 🟠 High (perf) | Widget polls **entire** conversation history every 5s (unbounded, GET can INSERT) — dominant load driver | S/M | PERF-1 |
| 10 | 🟠 High (perf) | RAG = up to 16 `LIKE '%…%'` over LONGTEXT per chat message, no FULLTEXT index | S | PERF-2 |
| 11 | 🟠 High | Admin refresh JWT in localStorage but **never used** (no refresh flow) — XSS blast radius, zero benefit | S | FE-H1 |
| 12 | 🟠 High | Dependency vulns: 14 (`npm audit`) incl. lodash prototype-pollution/code-injection, multer DoS | S–L | INF-1 |
| 13 | 🟠 High | Staging MySQL bound to `0.0.0.0:3317` on a shared public host | S | INF-2 |
| 14 | 🟠 High | `sql/01-schema.sql` missing all `tenant_id` columns → cannot bootstrap production; `synchronize=true` on staging | M | PERF/INF-3 |

Items 1–6 are security release blockers. 7–8 are compliance blockers for a CCPA/GDPR posture the docs already claim. 9–14 are the highest-leverage performance/hardening wins (all S–M effort).

---

## 1. Security

### Critical

**SEC-C1 — Webhook HMAC fails OPEN when `SHOPIFY_WEBHOOK_SECRET` is unset → unauthenticated tenant purge.**
`global/util/shopify-hmac.util.ts:18-22` returns (allows the request) with only a warning log when the secret is absent — a "dev only" comment with no `NODE_ENV` guard. This function protects `POST /webhooks/shopify/shop/redact` (`privacy.controller.ts:54-60` → `purgeTenant()` deletes messages/conversations/notifications/reviews/orders/sessions for a whole tenant by `shop_domain`, `privacy.service.ts:141-166`) and `customers/redact`. If the env var is missing/misconfigured in prod, **any anonymous caller can POST a `shop_domain` and irreversibly wipe a tenant**, or redact arbitrary customers.
*Independently confirmed by both the security and privacy audits.*
**Fix:** fail **closed** — throw when the secret is unset unless `NODE_ENV==='development'` is explicitly asserted; add a boot-time assertion that `SHOPIFY_WEBHOOK_SECRET`/`CRED_ENC_KEY`/`JWT_*` are present outside dev.

**SEC-C2 — Unauthenticated, unsigned fulfillment webhook → order-status tampering.**
`order/webhook.controller.ts:13-16` — `@Post('fulfillment') @Public()`; the comment claims out-of-band signature verification, but there is **no** check anywhere in the path (unlike the sibling `ShopifyOrderWebhookController`, which calls `verifyShopifyHmac`). Handler mutates `orders_cache`/`fulfillments` and dispatches "shipping update" notifications keyed on a guessable numeric `order_id` (`order.service.ts:134-176`).
**Fix:** remove the endpoint or require HMAC/shared-secret verification like the Shopify webhook controller.

**SEC/PRV-C3 — Guest order lookup grants full DSAR export + erasure with only order# + email.**
`order.service.ts:45-61` binds `session.customerId = order.customerId` after matching only `order_number` + `email`. `privacy.service.ts:64-71` (`requireCustomerId`) accepts *any* session with `customerId != null`, and both `/privacy/export` and `/privacy/delete` are `@Public()` (`privacy.controller.ts:84-97`). *Verified directly.* Order number + email both appear on packing slips, screenshots, and support emails, so anyone holding them can export the victim's entire profile/order history/reviews/inquiries **and irreversibly anonymize the account**. CCPA permits single-order lookup on those data points — not full-account access + erasure without heightened verification.
**Fix:** keep guest lookup scoped to the single order (don't bind the session for DSAR), or require the strong Shopify App-Proxy identity path before export/delete; add an email-confirmation loop for erasure.

### High

**SEC-H1 — Cross-tenant IDOR across the entire agent console.** `agent.service.ts:62-67` (`listSessions`) queries `WHERE status IN (WAITING, AGENT)` with **no** `tenantId` filter; `listMessages`/`accept`/`sendMessage`/`end` (`:106-108, :130-176, :256-266`) act on a raw `conversationId` with no ownership check, though `Conversation` carries `tenant_id`. *Verified directly.* An agent in tenant A can enumerate conversation ids to read transcripts (PII), take over, post into, and end any other tenant's conversations; the waiting queue itself leaks all tenants' escalations. **Fix:** scope `listSessions` by tenant; load conversations by `{ id, tenantId }` (404 on mismatch) everywhere.

**SEC-H2 — Guest lookup binds sessions cross-tenant.** `order.service.ts:45-62` matches `order_number` + `email` with no `tenant_id` constraint and never uses the session's `tenantId`. A tenant-A widget session can bind to a tenant-B customer given a matching (guessable, sequential) order number + email; every downstream session-scoped read (orders, notifications, reviews, subscriptions, DSAR export) then returns tenant B's data. **Fix:** `.andWhere('o.tenant_id = :tid', { tid: session.tenantId })` and verify the customer's tenant.

**SEC-H3 — No brute-force / rate limiting on auth or globally.** No `@nestjs/throttler`, no rate-limit middleware, no `helmet` (not in `package.json`). `admin/login` and `user/login` are `@Public()` with no attempt counter; only guest order lookup is limited (per-email Redis, `order.service.ts:202-209`). **Fix:** global `ThrottlerGuard` + stricter per-account/IP login limits with lockout/backoff.

### Medium

- **SEC-M1 — Refresh tokens: no rotation/revocation/storage.** `auth.service.ts:86-97` re-issues on refresh but the old token stays valid to `exp`; `changePassword` (`:99-115`) doesn't bump a token version or revoke sessions. A stolen refresh token is good for its full 7 days; password change doesn't kick existing sessions.
- **SEC-M2 — Must-change-password not enforced server-side.** `auth.service.ts:46,76` returns the flag but no guard consumes it; `refresh()` hardcodes `mustChangePassword=false`. Seeded accounts share default `amb2026!@` — a client ignoring the flag keeps full access.
- **SEC-M3 — Authenticated SSRF via integration probe.** `tenant/ecommerce-probe.util.ts:58-98` fetches tenant-supplied `store_url` (Woo) / `url` (Odoo) with no host allowlist or private-IP block → cloud-metadata/internal recon by a tenant Master. (Cafe24/Haravan are host-constrained; Woo/Odoo are not.) **Fix:** require https + resolve-and-block private/loopback/link-local ranges.
- **SEC-M4 — Swagger UI exposed in all envs.** `main.ts:34-40` mounts `/api/v1/docs` with no env guard → full API surface published in prod.
- **SEC-M5 — Committed dev secrets + weak JWT secrets + `synchronize=true`.** `env/backend/.env.development` is git-tracked with `JWT_*=..._change_me`, a real `CRED_ENC_KEY`, `DB_SYNCHRONIZE=true`, and is loaded by default (`app.module.ts:43`). No boot-time secret-strength validation. **Fix:** gitignore env files, ship only `.env.example`, assert secret presence+entropy at startup.

### Low

- **SEC-L1** Permissive CORS (`main.ts:17` `cors:true` reflects any origin) — Bearer-token auth limits CSRF impact; add an origin allowlist for the console.
- **SEC-L2** No security response headers (helmet absent) — HSTS/X-Content-Type-Options/etc.
- **SEC-L3** Anonymous `POST /chat/escalate` (`chat.controller.ts:47-53`) with no session-ownership check → agent-alert spam / forced state change on enumerable conversation ids.
- **SEC-L4** JWT verify doesn't pin the algorithm (`jwt-auth.guard.ts:37-39`) — low impact (secret supplied rejects `alg:none`), pin `algorithms:['HS256']` as defense-in-depth.
- **SEC-L5** Health endpoint exposes `process.uptime()` + DB state publicly (`health.controller.ts:24`).
- **SEC-L6** `inquiry.create` relies on `TenantSubscriber` auto-stamp rather than setting `tenant_id` from the session — mis-tenanting risk if context is unresolved.

### Security — confirmed good
AES-256-GCM with fresh random IV per op + verified auth tag + 32-byte key check (`crypto.util.ts:9-33`); timing-safe HMAC with length guards on all three Shopify verifications; OAuth CSRF state nonce in Redis (600s TTL) + `shop` regex + state↔shop match; App-Proxy identity fails safe to anonymous and never trusts client identity; bcrypt cost 12; `ValidationPipe` `whitelist+transform` (mass-assignment mitigated); parameterized queries throughout; pagination clamped to `[1,100]`; deny-by-default rank×label matrix.

---

## 2. Privacy / Compliance (CCPA/CPRA + GDPR)

*Two Criticals (C-1 guest→DSAR, C-2 fail-open purge) are folded into SEC-C3/SEC-C1 above.*

### High

- **PRV-H1 — DSAR export materially incomplete.** `privacy.service.ts:171-232` exports only customer/orders/notifications/reviews/inquiries. Missing: **chat messages/conversations** (the most sensitive free-text PII), **cjm_events**, **subscriptions**, **restock_subscriptions**, **notification_prefs**, **affiliate**, **audit**, and even the customer's **`phone`** (omitted at `:200-204`). "Right to know" is not satisfied.
- **PRV-H2 — DSAR erasure leaves residual PII.** `anonymizeCustomer()` (`:312-357`) nulls email/name/shopifyCustomerId but **not `phone`**, and never touches subscriptions/restock/notification_prefs/affiliate. Message redaction only reaches messages via *live* session→conversation binding (`:316-329`) — orphaned/unbound transcripts survive. `handleCustomerRedact` matches by email OR shopifyCustomerId only, so a redact arriving after email was nulled won't match.
- **PRV-H3 — Retention purge manual-only + incomplete.** `retention.service.ts:43-69` purges only messages/conversations/cjm_events, and **no scheduler is wired** (comment admits it) — so in practice retention never runs. Notifications (order#/PII in body) and stale sessions accumulate indefinitely.
- **PRV-H4 — No audit for several privileged/PII actions.** All `audit.write` sites are in `domain/privacy/*`. Missing: **temp-password issuance** (plaintext temp pw returned in DTO, `user.service.ts:68-99`, `user.response.ts:27`), credential encrypt/change (`tenant.service.ts:104,176`), login, admin order access, and **agent viewing customer PII/transcripts** — PRV-040 requires audit on PII access.

### Medium

- **PRV-M1 — AI provider gets raw PII, undisclosed.** `rag.service.ts:82-124` + `anthropic.adapter.ts:22-38` post the raw shopper message (name/email/phone/order#/address) to `api.anthropic.com` (US processor); moderation too (`moderation.service.ts:123-129`). No redaction. Disclosure text ("This chat is AI-powered…", `widget/i18n/locales/en.ts:26`) names no third-party/cross-border processing → PRV-030/PRV-031 unmet.
- **PRV-M2 — Opt-out not honored at real egress.** `setOptOut` (`privacy.service.ts:256-279`) flips `notification_prefs`, but external delivery is mocked and **campaign dispatch** (`campaign.service.ts:48-56`) has no consumer and never checks opt-out/prefs. The "Do Not Sell or Share" toggle governs only an unused mock path. Opt-out audit also misattributes actor (`actorType:'admin'`, `tenantId:null`).
- **PRV-M3 — Consumer rights not exercisable from the UI.** Widget CCPA link loops `setPref` per channel instead of calling `POST /privacy/opt-out` (`PreferencesPanel.tsx:129-149`), never toggles back on; no widget/web UI invokes `/privacy/export` or `/delete` at all — DSAR is API-only.
- **PRV-M4 — Consent has no timestamp/version and isn't enforced.** `session.entity.ts` stores a `consentState` enum but no timestamp/version/text-hash; declining doesn't stop message persistence or the AI send (`chat.service.ts:139+` never reads consent). No auditable proof of consent.
- **PRV-M5 — `maskPii` narrow + audit stores raw email.** `pii.util.ts:11-20` handles emails/strings only; one call site. Audit targets write raw email/customerId/shop_domain (`privacy.service.ts:83,97,117,249`) → PII replicated into `audit_logs` in cleartext.
- **PRV-M6 — Customer PII plaintext at rest.** `customer.entity.ts:18-27` stores `email`/`name`/`phone` as plain varchar; message/notification/review bodies also plaintext. Only integration *credentials* are encrypted. PRV-005 mandates AES-256-GCM for PII at rest — DB compromise exposes everything in cleartext.
- **PRV-M7 — Session token in URL query.** `/privacy/export?session_token=…`, `/orders?session_token=…` (`orderService.ts:19-41`) — the token (full order/DSAR access) leaks into browser history, proxy logs, Referer. (The logging interceptor deliberately avoids `req.url`, acknowledging the risk.)

### Privacy — confirmed good
HMAC correct & constant-time *when secret set*; App-Proxy is the strong identity path; credentials AES-256-GCM; bcrypt 12; LoggingInterceptor logs no bodies/tokens/`req.url`; **no raw PII in any logger/console call** (grepped); broad `tenant_id` coverage + transactional `purgeTenant`; session refuses cross-tenant guessing; guest lookup rate-limited; moderation non-bypassable + fail-safe; order data requires a bound session.

**Compliance posture:** most PRV-xxx requirements are **Partial** — the mechanisms exist but are incomplete (export/erasure), unenforced (consent, opt-out), or undisclosed (AI cross-border). PRV-012 (correction), PRV-014 (sensitive PI), PRV-017 (processing suspension), PRV-023 (consent record) are **Missing**. Full table in the privacy audit transcript.

---

## 3. Performance

**Top wins (all S–M effort, ~order-of-magnitude DB/latency reduction before any SSE investment):**

1. **PERF-1 [High] Widget chat poll refetches entire history every 5s.** `widget/hooks/useChat.ts:16,31-44` calls `getConversation` each tick; `chat.service.ts:117-119` `listMessages` is unbounded (no `take`), and the GET path `getOrCreateConversation` can **INSERT** a conversation row (`:106-114`). ~4-5 DB queries/poll × N panels. **Fix:** `?after_id=` delta fetch, read-only GET, bound the message query.
2. **PERF-2 [High] RAG = up to 16 `LIKE '%term%'` over LONGTEXT per message.** `rag.service.ts:52-67` — 8 terms × 2 columns with leading wildcards + `LOWER()` (defeats indexes), full scan of `kb_documents` including LONGTEXT `content`; only `idx_kb_source/category` exist. O(total KB bytes) per chat turn. **Fix:** `FULLTEXT(title,content)` + `MATCH…AGAINST`; later embed into the existing `embedding_ref` column + Redis top-K cache.
3. **PERF-3 [High] RabbitMQ has zero consumers — all handlers run synchronously in the HTTP request.** `event-bus.service.ts:43-62` `publish()` awaits every in-process handler inline; no `assertQueue/consume` anywhere. Per chat message: CJM insert + 2 conversation-log publishes (no subscriber — pure waste) + on escalation a **Slack webhook fetch and SMTP send inside the customer's chat response** (`agent-alert.service.ts:48-74`). **Fix:** fire-and-forget dispatch (don't await), move Slack/email off the request path.
4. **PERF-4 [High] No response/asset compression.** No `compression` middleware; edge/static nginx have no `gzip`. Measured: widget JS 353KB→111KB gz (loaded on **every** storefront page), admin 512KB→159KB gz. **Fix:** `gzip on; gzip_types application/json application/javascript text/css;` in edge nginx — one file, ~68% transfer cut. *(Matches my own infra finding INF-4.)*
5. **PERF-5 [High] Shopify sync full re-fetch of latest 50 orders, never incremental/paginated.** `shopify-admin.client.ts:37-38` `orders.json?limit=50` with no `updated_at_min`/`page_info` → stores with >50 orders never fully sync; <50 re-upsert every run. ~200 queries/sync/tenant; on-demand sync runs **inside** the admin HTTP request. **Fix:** use `last_sync_at` (already in `integration_status`) as cursor, follow `Link` headers, `upsert` batch.

**Also:** missing indexes on `conversations.status`, `notifications(customer_id, read_at)`, `cjm_events(tenant_id, created_at)`, `orders_cache(customer_id/tenant_id, created_at)` (PERF-6, S); N+1 loops in `agent.listSessions` last-message, `analytics.searchConversations`, order item counts (PERF-7, S); dashboard = 7 sequential COUNTs + 50 full message bodies, uncached, **tenant-unscoped** (PERF-8, S); `SELECT *` LONGTEXT in KB list (PERF-9); Redis nearly unused — session-by-token, unread counts, moderation/persona rules all recomputed from MySQL per request (PERF-11, S–M); admin web zero code-splitting (512KB single chunk, PERF-13, S); no DB pool sizing (mysql2 default 10 conns vs 150+ q/s polling, PERF-17, S).

**Amplification estimate:** ~500 concurrent visitors, 20% panels open ≈ 37 req/s ≈ 150–190 DB queries/s of pure polling. React Query pausing in background tabs is the only relief valve.

**Perf — confirmed good:** batched `In(...)` lookups; all admin lists paginate; scheduled sync non-overlapping + per-tenant fault-isolated; hashed assets 1y immutable; JWT guard no DB hit; graceful Redis/RabbitMQ degradation; React Query keys include `tenantId`.

---

## 4. Frontend security & functional gaps

### Frontend security
- **FE-H1 [High]** Admin access+refresh JWT persisted in localStorage (`web/store/auth-store.ts:21-41`); the refresh token is **never used** (no refresh flow exists) — pure XSS blast radius, zero benefit. Stop storing it (or move to httpOnly cookie + real refresh).
- **FE-M1 [Med]** Citation `href={c.url}` unvalidated (`widget/components/chat/MessageBubble.tsx:27`) — a `javascript:` URL in a KB source = stored XSS against storefront customers (tenant-staff → customer privilege crossing). Allow only http(s); add `noopener`.
- **FE-M2 [Med]** Widget accepts `ivy:session` postMessage checking only `e.source` (`useEmbedIdentity.ts:18-24`), no origin allowlist and no `frame-ancestors`/`X-Frame-Options` → session fixation from a malicious embedder, then read-back of the conversation/order via the pushed token. Serve widget with CSP `frame-ancestors` from registered shop domains; bind proxy tokens to `?shop=`.
- **FE-M3 [Med]** Widget session token in URL path/query on every GET (`chatService.ts:5`, order/notification services) → access/proxy-log leakage. Move to a header/POST body.
- **FE-L1** Embed iframe has no `sandbox` attr (`embed.js:45`). **FE-L2** `widgetUrl` host-overridable (informational — attacker already has storefront script exec). **FE-L3** Pretendard CSS from jsdelivr CDN with no SRI in both apps. **FE-L4** Capability RBAC is nav-only; direct URL renders the page (backend enforces — cosmetic 403 recommended).
- **FE — good:** zero HTML-injection sinks anywhere (no `dangerouslySetInnerHTML`/`innerHTML`); cross-origin iframe isolation with correct loader-side origin checks; embedded-mode token non-persistence for shared browsers; no secrets in `VITE_` vars; deps resolve to current non-vulnerable versions.

### Functional / UX (top items, verified absent)
1. **Agent conversation view doesn't poll for new customer messages** (`web/domain/live-chat/live-chat.hooks.ts:15` — no `refetchInterval` on the open thread). Core workflow bug. **S.**
2. **Failed widget send loses the message** (`ChatTab.tsx:141` clears input before await; `useChat.ts:77-87` no retry). **S.**
3. **AuthGate sign-in is a stub `alert()`** (`AuthGate.tsx:72`, also hardcoded English). Deep-link parent to `/account/login` via postMessage. **M.**
4. **No escalation sound/tab-badge for agents** (`EscalationAlarm.tsx` modal on 10s poll only). **S.**
5. **No assignment/locking visibility in live chat** — two agents can answer the same session (`LiveChatPage.tsx:170-187`). **M.**
6. **No offline/poll-failure/session-expiry recovery in widget** (`useChat.ts:31-44` `retry:false`, swallows errors; `useSession` runs once on mount). **M.**
7. **Hardcoded English strings break es/ko** (`useChat.ts:84,122,139`, `OrdersTab.tsx:61,117`, `AuthGate.tsx:72`, `api-client.ts:44,47,58`) — violates the repo's own i18n MUST. **S.**
8. **No canned responses / chat CSAT / transcript email / attachments** (all verified absent) — roadmap. **M each.**
9. **Operating-hours/away mode is a static i18n string**, not tenant-configurable; widget never shows "agents offline" before escalating. **M.**
10. **Admin list gaps:** Orders/History have no free-text search (only Customers does); no CSV export; no bulk ops; `ReviewForm.tsx:29` silently swallows submit failures. **S each.**

---

## 5. Infrastructure & dependencies (direct check)

- **INF-1 [High] 14 dependency vulnerabilities** (`npm audit --omit=dev`: 3 high, 11 moderate): `lodash` (via `@nestjs/config` — prototype pollution + `_.template` code injection), `multer` (DoS ×3), `qs`/`express`/`body-parser` (DoS), `file-type`, `js-yaml`, `uuid`. `file-type` fixes cleanly via `npm audit fix`; the rest need NestJS 10→11 (major). **Plan a dependency-upgrade sprint.**
- **INF-2 [High] Staging MySQL bound to `0.0.0.0:3317`** (`docker/staging/docker-compose.staging.yml:63`) on a shared public host (211.110.140.172). Restrict to `127.0.0.1:3317:3306`.
- **INF-3 [High] `sql/01-schema.sql` cannot bootstrap production** — missing `tenant_id` on `sessions`/`conversations`/`messages`/`orders_cache`/`notifications` that the entities require; staging runs `synchronize=true` (schema-drift/startup risk). Regenerate the SQL from the live schema, flip staging to `false`, adopt migrations.
- **INF-4 [Med] No security headers in any docker nginx config** — add HSTS + X-Content-Type-Options + X-Frame-Options (DENY for admin, `frame-ancestors` for widget) + a CSP.
- **INF-5 [Low] gzip disabled** in edge + static nginx (see PERF-4).
- **Infra — good:** committed env files contain only dev placeholders (no real secrets); `secrets/` and `docker/*/.env.*` properly gitignored; only `.env.*.example` templates tracked; hashed assets get 1y immutable cache.

---

## 6. Recommended sequencing

- **Hotfix (this week):** SEC-C1, SEC-C2, SEC-C3, SEC-H1, SEC-H2, INF-2. All small, all close unauthenticated/cross-tenant exposure. Add a boot-time env-secret assertion while touching C1.
- **Sprint 1 (hardening):** SEC-H3 (throttler+helmet), SEC-M1/M2 (refresh revocation, must-change guard), FE-H1/M1/M2, INF-1 (dep upgrades), INF-3/INF-4.
- **Sprint 2 (compliance):** PRV-H1/H2 (complete export+erasure), PRV-H3 (schedule retention + widen), PRV-H4 (audit access/temp-pw/creds), PRV-M2/M3/M4 (opt-out enforcement, DSAR UI, consent timestamp), PRV-M1 (AI disclosure + optional redaction).
- **Sprint 3 (performance):** PERF-1..5 (delta poll, FULLTEXT, async dispatch, gzip, incremental sync) + PERF-6 indexes + PERF-11 Redis caching. Consider SSE only after these.
- **Backlog:** PRV-M6 (PII encryption at rest), functional UX items, PERF-13 code-splitting, SEC-M3 SSRF guard, SEC-M4 Swagger gating.

> Full per-finding evidence with code quotes is in the four audit transcripts (backend security, privacy, performance, frontend) produced 2026-07-18. This report consolidates and de-duplicates them; all `file:line` citations were current at review time — verify against HEAD before fixing.

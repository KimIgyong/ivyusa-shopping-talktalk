# Shopify App Setup & Integration Development Guide (practical)

| | |
|---|---|
| Doc ID | CHATWIDGET-GUIDE-SHOPIFY-SETUP-1.0.0 |
| Audience | Operators (app setup) · Backend/Frontend developers |
| Nature | **Practical setup & dev guide** (create the Shopify app → wire it to this codebase → remaining dev work) |
| Companion | `쇼피파이연동가이드_Shopify-Integration.en.md` (concept & design). See it for embed architecture & design rationale |
| Baseline | 2026-07-06 · marked honestly against the actual code (HEAD) |
| Legend | ✅ Implemented · 🟡 Partial / needs hardening · ⛔ Not present (to build) |

> This document covers **what actually works in the code today** and **what to click on the Shopify side**, step by step. For the *why* of the architecture (iframe isolation, the 3 embed methods), read the companion (concept/design) guide.

---

## 1. Current baseline (what the code supports today)

The Shopify integration has the **webhook / credential / integration-status / session skeleton** built; **OAuth, real Admin API sync, and widget embedding** are not yet.

| Area | Status | Actual endpoint / location |
|---|---|---|
| GDPR compliance webhooks | ✅ (raw-body HMAC applied) | `POST /api/v1/webhooks/shopify/customers/data_request` · `/customers/redact` · `/shop/redact` — `privacy.controller.ts` |
| Fulfillment webhook | ✅ | `POST /api/v1/webhooks/fulfillment` → updates `order_cache` — `order/webhook.controller.ts` |
| Credential storage (encrypted) | ✅ | `GET /api/v1/tenants/me/credentials` · `PUT /api/v1/tenants/me/credentials/:provider` — AES-256-GCM |
| Integration status tracking | ✅ | `GET /api/v1/integrations/status` · `PATCH /api/v1/integrations/status/:name` |
| Session / shop parameter | ✅ | `POST /api/v1/session/ensure { shop_domain? }` — given shop must exist (else reject); auto-binds only when a single tenant exists |
| Guest order lookup | ✅ (local cache) | `POST /api/v1/orders/guest-lookup` — reads local `order_cache` |
| Tenant = shop mapping | ✅ | `tenants.shop_domain` **UNIQUE** — `tenant.entity.ts` |
| Shopify Admin API client | ✅ (on-demand) | `POST /api/v1/tenants/me/shopify/sync` — pulls `orders.json` with the stored token → upserts `orders_cache`/`customers`. Scheduled auto-sync is roadmap |
| Shopify settings UI | ✅ | Console Settings "Shopify connection" card (domain, token, test, sync) |
| OAuth (public app install) | ⛔ | No `/auth/shopify` |
| ScriptTag / Theme App Extension | ⛔ | None |
| Widget shop passing | ✅ | Widget reads `?shop` and sends `shop_domain` to `session/ensure` |
| `embed.js` loader / iframe embed | ✅ | `apps/widget/public/embed.js` — injects bubble+iframe, `?embed=1&shop=&locale=`, `ivy:resize` postMessage (origin-checked). CSP `frame-ancestors` is a deploy setting |

> **API prefix**: every route lives under `/api/v1` (`API_PREFIX`), **webhooks included** (`/api/v1/webhooks/...`). `@Public()` only skips auth, not the prefix.

---

## 2. Prerequisites

- **Shopify store**: admin access to `ivyusa.myshopify.com`.
- **Choose an app type** (two paths):
  - **Path A — Custom app (single store, recommended first)**: mint an Admin API token in the store admin and connect directly. No OAuth; best fit for the code today.
  - **Path B — Public/distributed app (OAuth, many tenants)**: create the app in the Partner Dashboard. The OAuth/install flow **must be built** (§8).
- **Run locally**: `npm run db:up` → `npm run db:seed` → `npm run dev` (API `:3000`, web `:5173`, widget `:5174`).
- **Required secret env vars** (`env/backend/.env.*`):
  - `CRED_ENC_KEY` — base64 32 bytes, credential encrypt/decrypt (dev value already present).
  - `SHOPIFY_WEBHOOK_SECRET` — webhook HMAC verification. **If unset in dev, verification is bypassed (warns)**; required in production.

---

## 3. Path A — Custom app setup (single store)

The fastest real path. Mint the token directly in the store admin.

### 3.1 Create the app & scopes
1. Store admin → **Settings → Apps and sales channels → Develop apps** → **Create an app**.
2. **Configure Admin API scopes** (least privilege):
   - `read_orders`, `read_customers` (order/customer cache sync)
   - `read_products` (optional, richer product help)
3. **Install app** → reveal the **Admin API access token** (`shpat_…`). *Shown once — copy it immediately.*
4. (For HMAC) note the **API secret key** (client secret) — used to verify webhook signatures.

### 3.2 Bind the shop domain to a tenant
`tenants.shop_domain` must match the store domain so a session binds to the right tenant (UNIQUE).
- Set the seed tenant (`ivyusa`) `shop_domain` to `ivyusa.myshopify.com`, or update it for a new store.

### 3.3 Save the Admin token in the console (encrypted)
Store the token via **console Settings**; the server encrypts it with AES-256-GCM and masks it in responses (never returns plaintext).

```bash
# Requires a tenant-master JWT (INTEGRATION_CREDENTIALS_MANAGE capability)
curl -X PUT http://localhost:3000/api/v1/tenants/me/credentials/shopify \
  -H "Authorization: Bearer <TENANT_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "secret": "shpat_xxxxxxxxxxxxxxxxxxxxxxxx" }'
```

- Reads return only `{ provider, status, configured: true, updatedAt }` (no plaintext secret).
- If you need multiple keys (access token / api key / api secret / webhook secret), serialize a JSON blob into the single `secret` field and store it encrypted whole (no schema change).

### 3.4 Show integration status
Once verified, update `integration_status` so the console badge reflects it.

```bash
curl -X PATCH http://localhost:3000/api/v1/integrations/status/shopify \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "connected", "detail": "custom app token saved" }'
```

> `PATCH /integrations/status/:name` is **AdminOnly** and stamps `last_sync_at` to now. Tracked names: `shopify` · `fulfillment` · `klaviyo` · `odoo` · `google_drive`.

---

## 4. GDPR compliance webhooks (mandatory · ✅ implemented)

If the app handles personal data, Shopify requires three mandatory compliance webhooks. **The handlers are already implemented** — just point the Shopify app config at the URLs and share the secret.

### 4.1 URLs to register (under the `/api/v1` prefix)
| Topic | Endpoint |
|---|---|
| customers/data_request | `https://<API_HOST>/api/v1/webhooks/shopify/customers/data_request` |
| customers/redact | `https://<API_HOST>/api/v1/webhooks/shopify/customers/redact` |
| shop/redact | `https://<API_HOST>/api/v1/webhooks/shopify/shop/redact` |

- **Public/distributed app**: Partner Dashboard → **App setup → Compliance webhooks**, register the URLs above.
- **Custom app**: compliance webhooks are a distributed-app (Partner) concept. A custom app registers the operational webhooks it needs via Admin API subscriptions; the code always provides the handlers above, so point the config at them at deploy time.

### 4.2 HMAC verification (how it works)
- Header `X-Shopify-Hmac-Sha256`, base64, **timing-safe** compare. Mismatch → **401** (fail-safe).
- Secret: `SHOPIFY_WEBHOOK_SECRET` = the app's **API secret key** (webhook signing key).
- **Dev convenience**: if `SHOPIFY_WEBHOOK_SECRET` is unset, it logs a warning and lets the webhook through. **Always set it in production** — unset equals no verification.

### 4.3 ✅ Raw-body verification — applied (2026-07-06)
Shopify signs the **raw transmitted bytes**, so verifying a re-stringified copy of the parsed JSON can 401 a valid webhook over key-order/whitespace differences. Raw-body verification is now applied.

```ts
// main.ts — preserve rawBody on NestFactory
const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
// privacy.controller.ts — compute HMAC over req.rawBody (Buffer); falls back to re-stringify if absent
```
> Verified: a correct signature over a body with non-canonical whitespace passes; a wrong signature 401s.

---

## 5. Operational webhook — order/delivery status (✅ fulfillment implemented)

There is a **custom fulfillment webhook** that updates the order status cache (`order_cache`). Note it is **not** Shopify's native `orders/updated` — it's a custom shape.

```bash
# Simulate a fulfillment webhook
curl -X POST http://localhost:3000/api/v1/webhooks/fulfillment \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "shopify-1001", "status": "shipping",
        "tracking_number": "1Z999", "carrier": "UPS" }'
```
- Behavior: upsert `Fulfillment` → update `order_cache.statusInternal/statusUi` → publish notification event.

### 5.1 Shopify-native order/fulfillment webhooks (✅ implemented)
Native Shopify webhook handlers are in place (all HMAC-verified, prefixed, `@Public()`). The tenant is resolved from the `X-Shopify-Shop-Domain` header; unknown shops and uncached orders are ignored (logged) and still return 200.

| Topic | Endpoint | Behavior |
|---|---|---|
| orders/create · orders/updated | `POST /api/v1/webhooks/shopify/orders/{create,updated}` | upsert the order into `orders_cache` (+ link customer) |
| fulfillments/create · fulfillments/update | `POST /api/v1/webhooks/shopify/fulfillments/{create,update}` | map `shipment_status` → internal, advance order status + notify |

- Shipment mapping: `delivered`→delivered, `in_transit`/`out_for_delivery`/`attempted_delivery`→in_transit, else→shipped.
- Subscribe those topics to these URLs in the Shopify app for real-time updates alongside the on-demand sync (§1).

> Note: the existing `POST /api/v1/webhooks/fulfillment` (custom shape) is still available for internal integrations/testing.

---

## 6. Credential & integration-status management (✅ implemented, reference)

| Feature | Endpoint | Guard | Notes |
|---|---|---|---|
| List credentials | `GET /api/v1/tenants/me/credentials` | `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)` | masked (`configured` flag) |
| Save credential | `PUT /api/v1/tenants/me/credentials/:provider` | same | `secret` stored encrypted |
| List integration status | `GET /api/v1/integrations/status` | `@Auth()` | badge display |
| Update integration status | `PATCH /api/v1/integrations/status/:name` | `@AdminOnly()` | stamps `last_sync_at` |

- Encryption: `crypto.util` AES-256-GCM, layout `[12B IV][16B tag][ciphertext]`, key `CRED_ENC_KEY`.
- Secret changes are audited (`AuditService`) and log-masked.
- The console Settings screen uses these endpoints.

---

## 7. Connecting the widget to the storefront

**Shop-aware sessions are done (✅); the embed loader remains (⛔).**

### 7.1 Widget: receive & pass the shop parameter (✅ applied)
The widget reads `?shop` from the iframe URL and sends it as `shop_domain` to `session/ensure`.
```ts
// apps/widget/src/services/sessionService.ts — added shopDomain arg
export function ensureSession(sessionToken: string | null, locale: string, shopDomain?: string) {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
    shop_domain: shopDomain ?? undefined,
  });
}
// apps/widget/src/hooks/useSession.ts — reads shop from the URL on mount and passes it
```

### 7.2 Backend: safe tenant resolution (✅ applied)
The unconditional first-tenant fallback was removed and replaced with a safe rule (`resolveTenant` in `session.service.ts`).
```ts
// shop_domain given  → reject if unknown (404 E5005 TENANT_NOT_FOUND)
// shop_domain absent  → auto-bind only when exactly one tenant exists, else reject (400)
```
> This closes the High gap in `CLAUDE.md §6` ("remove chat first-tenant"). Verified: unknown shop → 404, single tenant → 201, known shop → 201.

### 7.3 The `embed.js` loader (✅ applied)
`apps/widget/public/embed.js` injects a bubble + `<iframe>` into the store and appends `?embed=1&shop=&locale=` to the iframe URL. In embed mode (`?embed=1`) the widget renders only itself (no mock storefront) and posts `ivy:resize` to the parent on open/close so the loader resizes the frame (the loader validates the message origin). See companion §4–5 for the exposure options (App Embed / ScriptTag / manual snippet).

Install snippet (App Embed example):
```html
<script>window.IVY_WIDGET_CONFIG = {
  shop: "{{ shop.permanent_domain }}", locale: "{{ request.locale.iso_code }}",
  widgetUrl: "https://widget.ivyusa.app" };</script>
<script src="https://widget.ivyusa.app/embed.js" defer></script>
```

> 🟡 Remaining deploy setting: restrict the widget hosting origin with `Content-Security-Policy: frame-ancestors https://*.myshopify.com <custom domains>`.

---

## 8. Path B — Public app (OAuth) expansion (⛔ not present · roadmap)

For multi-tenant SaaS. **There is no OAuth endpoint in the code today, so this is net-new development.**

### 8.1 Partner Dashboard app config
- Create the app → **App URL**, **Allowed redirection URL(s)**: `https://<API_HOST>/auth/shopify/callback`.
- API scopes (same as §3.1), Compliance webhooks (§4.1).
- Apply for Protected customer data access.

### 8.2 Flow to build (skeleton)
```
GET /auth/shopify/install?shop=<shop>.myshopify.com
   → issue state + redirect to the Shopify OAuth authorize URL
GET /auth/shopify/callback?code&hmac&shop&state
   → verify HMAC & state → exchange code for an access token
   → upsert the tenant by shop_domain
   → store the token encrypted in integration_credentials(provider=shopify)
   → register webhooks (GDPR + operational), optionally inject ScriptTag
   → integration_status.shopify = connected
```

---

## 9. Local development & testing

### 9.1 Env vars
```bash
# add to env/backend/.env.development
SHOPIFY_WEBHOOK_SECRET=<app API secret key>
# CRED_ENC_KEY already has a dev value
```

### 9.2 GDPR webhook HMAC local test
Build the base64 HMAC the same way Shopify signs and put it in the header.
```bash
SECRET='<SHOPIFY_WEBHOOK_SECRET>'
BODY='{"shop_domain":"ivyusa.myshopify.com"}'
HMAC=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST http://localhost:3000/api/v1/webhooks/shopify/shop/redact \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -d "$BODY"
```
> The example sends the **same bytes** the current implementation re-stringifies, so it passes. After the §4.3 raw-body hardening it still works as long as the raw bytes match.

### 9.3 Receiving real Shopify webhooks (tunnel)
- Get a public URL with `cloudflared tunnel` or `ngrok http 3000`.
- Point the Shopify app webhook URLs at `https://<tunnel>/api/v1/webhooks/...`.
- Trigger a test event → watch the API logs and the `integration_status` / `order_cache` change.

### 9.4 Custom-app token smoke check
- After `PUT …/credentials/shopify`, confirm the list response shows `configured:true` (no plaintext).
- After `PATCH …/integrations/status/shopify`, confirm the console badge updates.

---

## 10. Security & compliance checklist

- [ ] Set `SHOPIFY_WEBHOOK_SECRET` in production (never leave verification off).
- [ ] Apply the §4.3 raw-body HMAC hardening.
- [ ] Secrets only via AES-256-GCM, masked responses, audit on change (FR-060).
- [ ] Resolve the tenant by `shop_domain`; **remove the first-tenant fallback** (block cross-tenant leaks).
- [ ] iframe `frame-ancestors` restricts to allowed stores; mutually verify `postMessage` origin.
- [ ] Least scopes (`read_orders`, `read_customers`) + protected-customer-data approval.
- [ ] AI/agent outbound still passes `ModerationService.moderate()` (FR-069).

---

## 11. Development checklist (delta vs. current code)

**Shopify side (ops):**
- [ ] Create custom app + Admin API token (§3), or Partner public app (§8)
- [ ] Register compliance webhook URLs & secret (§4)
- [ ] Least scopes + protected-customer-data approval

**Backend (dev):**
- [x] Raw-body HMAC hardening (§4.3) — applied
- [x] Remove session first-tenant fallback → safe resolution (§7.2) — applied
- [x] Shopify Admin API client (on-demand customer/order sync) — applied. Scheduled auto-sync is roadmap
- [x] Shopify-native order/fulfillment webhooks (orders·fulfillments, HMAC) → `order_cache` (§5.1) — applied
- [ ] (Path B) `/auth/shopify` OAuth + webhook/ScriptTag registration on install (§8)

**Widget/frontend (dev):**
- [x] Parse `?shop` → send `shop_domain` to `session/ensure` (§7.1) — applied
- [x] `embed.js` loader + iframe injection + widget embed mode (§7.3) — applied. CSP `frame-ancestors` remains a deploy setting
- [ ] Shopify card + install snippets in console Settings (companion §6)

**Already implemented (✅):** GDPR webhooks (raw-body HMAC) · fulfillment webhook · credential encryption · integration status · shop-aware sessions (safe tenant resolution) · widget shop passing · guest order lookup (cache) · tenant shop_domain UNIQUE.

---

### Appendix · File paths & env vars

**Code paths**
- GDPR webhooks: `apps/api/src/domain/privacy/privacy.controller.ts`
- Fulfillment webhook: `apps/api/src/domain/order/webhook.controller.ts`, `order.service.ts`
- Credentials: `apps/api/src/domain/tenant/{tenant.controller.ts, entity/integration-credential.entity.ts}`, `global/util/crypto.util.ts`
- Integration status: `apps/api/src/domain/integration/*`
- Session: `apps/api/src/domain/session/{session.controller.ts, session.service.ts, dto/request/session.request.ts}`
- Order/customer: `apps/api/src/domain/{order,customer}/*`
- Widget session: `apps/widget/src/{services/sessionService.ts, hooks/useSession.ts}`

**Env vars**
| Var | Purpose |
|---|---|
| `API_PREFIX` | Prefix for all routes (`api/v1`). Webhooks use it too |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook HMAC key (app API secret). Required in production |
| `CRED_ENC_KEY` | Credential AES-256-GCM key (base64 32B) |

*Companion: `쇼피파이연동가이드_Shopify-Integration.en.md` (concept/design) · `SPEC.md` (§Shopify) · `CLAUDE.md` · `docs/guide/STAGING-DEPLOY.md`*

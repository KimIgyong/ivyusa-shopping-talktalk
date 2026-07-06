# Shopify-Embedded Widget — Work Guide (Concept & Design)

| | |
|---|---|
| Doc ID | CHATWIDGET-GUIDE-SHOPIFY-1.0.0 |
| Scope | IVY USA Shopping TalkTalk — `apps/widget`, `apps/api`, `apps/web` |
| Related | `SPEC.md` (Shopify), `CLAUDE.md`, `docs/guide/STAGING-DEPLOY.md`, `reference/amoeba_privacy_compliance_v2` |
| Requirements | FR-047 (integration status), FR-051 (tenant = Shopify shop), FR-060 (credential encryption), Audit High-2 (GDPR webhooks) |
| Basis | Compare all 3 embed methods · iframe-isolated rendering · EN/KR pair |

> This is a **concept/design guide, not an implementation order**. When writing code, follow `CLAUDE.md` conventions verbatim (request `snake_case` / response `camelCase`, static Mapper, `@RequireCapability`, etc.).

---

## 1. Goal & scope

The widget must run as a **floating support widget on the IVY USA Shopify storefront** (Naver TalkTalk style). This guide covers three work streams:

1. **Storefront exposure** — inject the widget into the Shopify theme safely (iframe isolation) and identify which shop it is so the API can bind the right tenant.
2. **Store Shopify config in Settings** — save/manage the shop domain, API credentials, and widget-exposure options from the tenant console Settings screen.
3. **Shopify API integration setup** — handle Admin API token/OAuth, scopes, and webhooks in Settings, show connection status, and **display the install script/snippet** to the admin on screen.

Out of scope: checkout changes, actual Shopify App Store review submission (design guidance only).

---

## 2. Current baseline (what already exists)

Separate what **exists** from the **gaps** this work targets.

Exists:

- `apps/widget` — React+Vite SPA. `main.tsx` mounts on `#root`; `App.tsx` renders a mock `Storefront` + floating `Widget` (launcher bubble + `WidgetPanel`).
- Session bootstrap — `POST /api/v1/session/ensure` **already accepts `shop_domain`** (`EnsureSessionRequest.shop_domain`). `SessionService.ensure()` resolves the `tenant` by `shop_domain`, else **falls back to the first tenant** (multitenant-leak gap).
- Credential storage — `integration_credentials` table + `IntegrationCredential` entity (per-tenant `provider`='shopify', `secret_enc` **AES-256-GCM**, FR-060). Console Settings manages them via `GET/PUT /tenants/me/credentials/:provider` (masked display).
- Integration status — `integration_status` (FR-047) + `GET /integrations/status`, `PATCH /integrations/status/:name`.
- Shopify GDPR webhooks — `POST /webhooks/shopify/{customers/data_request, customers/redact, shop/redact}` with HMAC verification (`SHOPIFY_WEBHOOK_SECRET`).

Gaps (this work):

- A **loader script / embed artifact** that injects the widget into an external Shopify store (today it's a standalone SPA that includes a mock storefront).
- A path where the widget **learns its own shop** and passes `shop_domain` to `session/ensure` (currently unset → first-tenant fallback).
- **Shopify-specific Settings fields** (shop domain, Admin token / API key·secret, webhook secret, widget-exposure options, allowed domains) and an **install-snippet UI**.

---

## 3. Concept architecture

```
Shopify storefront (theme)
   │  ① App Embed block / ScriptTag / manual snippet
   ▼
embed.js (loader, hosted on our CDN)
   │  ② injects floating bubble + <iframe>, passes shop domain
   ▼
widget iframe  (apps/widget build, https://widget.ivyusa.app)
   │  ③ POST /session/ensure { shop_domain }
   ▼
apps/api (NestJS) ──▶ resolve tenant (shopDomain) ──▶ MySQL/Redis/RabbitMQ
   │
   └─ ④ /webhooks/shopify/*  ◀── Shopify (orders/customers/GDPR webhooks)
```

Principles:

- **iframe isolation (chosen)**: the loader only inserts a bubble and an `<iframe>` into the store DOM. The widget's CSS/JS (Tailwind, React, i18n) runs inside the iframe — **fully isolated** from the theme, no collisions or global pollution.
- **Shop identity is the multitenancy axis**: the loader passes `Shopify.shop` (or a config value) into the iframe URL, and the widget forwards it as `shop_domain` to `session/ensure`. The backend uses that to pin the tenant. → This is exactly where the "first tenant" gap in CLAUDE.md §6 gets closed.
- **Console Settings is the source of truth**: shop, credentials, and exposure options are saved in the tenant console; the storefront reads that config to operate.

---

## 4. Widget embed architecture (iframe isolation)

### 4.1 Loader `embed.js` (new artifact)

A new build target (e.g. `apps/widget/embed/embed.ts` → `embed.js`, dependency-free vanilla). Responsibilities:

1. Obtain the shop domain/config from the store → `Shopify.shop` global, loader `data-*`, or `window.IVY_WIDGET_CONFIG`.
2. Insert a **launcher bubble** and a hidden **`<iframe>`** into the DOM.
3. Append `?shop=<shop_domain>&locale=<lang>` to the iframe `src`.
4. Communicate with the iframe via `postMessage` (open/close, panel resize, unread badge).

```html
<!-- DOM the loader creates (concept) -->
<div id="ivy-talktalk-root">
  <iframe id="ivy-talktalk-frame"
          src="https://widget.ivyusa.app/?shop=ivyusa.myshopify.com&locale=en"
          title="IVY USA Support" loading="lazy"
          style="border:0;position:fixed;bottom:0;right:0;z-index:2147483000"></iframe>
</div>
```

```js
// embed.js (skeleton)
(function () {
  var cfg = window.IVY_WIDGET_CONFIG || {};
  var shop = cfg.shop || (window.Shopify && window.Shopify.shop) || '';
  var base = cfg.widgetUrl || 'https://widget.ivyusa.app';
  var locale = (cfg.locale || document.documentElement.lang || 'en').slice(0, 2);

  var frame = document.createElement('iframe');
  frame.src = base + '/?shop=' + encodeURIComponent(shop) + '&locale=' + locale;
  frame.id = 'ivy-talktalk-frame';
  Object.assign(frame.style, { position:'fixed', bottom:'0', right:'0',
    width:'96px', height:'96px', border:'0', zIndex:'2147483000' });
  document.body.appendChild(frame);

  window.addEventListener('message', function (e) {
    if (e.origin !== base) return;                  // ★ verify origin
    if (e.data && e.data.type === 'ivy:resize') {
      frame.style.width  = e.data.open ? '400px' : '96px';
      frame.style.height = e.data.open ? '640px' : '96px';
    }
  });
})();
```

> Security: the `message` handler must compare `e.origin` against the widget origin; the iframe → parent `postMessage` must specify an explicit `targetOrigin`.

### 4.2 Widget build changes (`apps/widget`)

- **Drop the mock storefront (embed build)**: the embed entry renders only `Widget` (launcher + panel), not `Storefront`. Keep `App.tsx` for the dev preview; branch the embed build via a flag (`VITE_EMBED=1`) / separate entry.
- **Receive the shop param**: in `main.tsx` (or the session hook) read `new URLSearchParams(location.search).get('shop')` and store it.
- **Pass shop to `session/ensure`**: add `shop_domain` to `apps/widget/src/services/sessionService.ts` `ensureSession()` and its caller (`useSession.ts` `useEnsureSession`). The backend DTO already supports it.

```ts
// sessionService.ts — add shop_domain (concept)
export function ensureSession(sessionToken: string | null, locale: string, shopDomain?: string) {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
    shop_domain: shopDomain ?? undefined,   // ★ new
  });
}
```

- **Notify parent on open/close**: when `widgetStore.panelOpen` changes, `window.parent.postMessage({type:'ivy:resize', open}, PARENT_ORIGIN)` so the loader resizes the iframe.
- **Deployment**: since it is served in an iframe, do not set `X-Frame-Options` (or `ALLOWALL`) and instead restrict with `Content-Security-Policy: frame-ancestors https://*.myshopify.com <each tenant custom domain>` so **only allowed stores** may embed it. The allow-list is managed in the tenant settings (§6).

### 4.3 CORS / origins

- The API allows the widget origin (`https://widget.ivyusa.app`) in its CORS whitelist; the widget only calls the API from its own origin.
- `session/ensure` is `@Public()` (opaque session token) — no auth header required.

---

## 5. Storefront exposure — compare 3 methods

All three achieve the same thing: load one line of `embed.js` on every store page. **App Embed is the default recommendation.**

### A. Theme App Extension — App Embed block (★ recommended, Online Store 2.0)

The app ships an **app-embed block** the merchant toggles in Theme editor → *App embeds*. No theme code edits, easy on/off, favorable for app review.

```liquid
{%- comment -%} extensions/ivy-talktalk/blocks/app-embed.liquid {%- endcomment -%}
<script>
  window.IVY_WIDGET_CONFIG = {
    shop: {{ shop.permanent_domain | json }},
    locale: {{ request.locale.iso_code | json }},
    widgetUrl: "{{ block.settings.widget_url }}"
  };
</script>
<script src="{{ block.settings.widget_url }}/embed.js" defer></script>

{% schema %}
{
  "name": "IVY USA TalkTalk",
  "target": "body",
  "settings": [
    { "type": "text", "id": "widget_url", "label": "Widget URL",
      "default": "https://widget.ivyusa.app" }
  ]
}
{% endschema %}
```

Deploy: publish the extension via Shopify CLI (`shopify app deploy`) → merchant enables it under *Theme → Customize → App embeds*.

### B. ScriptTag API (REST injection after OAuth)

On install (OAuth), register `embed.js` automatically via Admin REST `POST /admin/api/2024-x/script_tags.json`. Loads on all pages with no theme edit. **Discouraged vs App Embed on 2.0**, but valid for legacy/automation.

```jsonc
// POST /admin/api/2024-10/script_tags.json  (needs Admin API token)
{ "script_tag": { "event": "onload",
  "src": "https://widget.ivyusa.app/embed.js?shop=ivyusa.myshopify.com" } }
```

Note: since a ScriptTag can't easily read the shop globally, bake the shop into the `src` query at registration, or have the loader read `Shopify.shop`.

### C. Manual `theme.liquid` snippet (simplest)

The merchant (or we) paste the snippet just before `</body>` in the theme's `theme.liquid`. Good for dev / single tenant / PoC; no management automation.

```liquid
{%- comment -%} theme.liquid, just before </body> {%- endcomment -%}
<script>
  window.IVY_WIDGET_CONFIG = { shop: "{{ shop.permanent_domain }}",
    locale: "{{ request.locale.iso_code }}", widgetUrl: "https://widget.ivyusa.app" };
</script>
<script src="https://widget.ivyusa.app/embed.js" defer></script>
```

### Comparison

| Aspect | A. App Embed (rec.) | B. ScriptTag | C. Manual snippet |
|---|---|---|---|
| Theme code edit | none | none | required (paste) |
| Merchant on/off | theme editor toggle | app install/remove | remove code |
| Requires OAuth app | extension deploy | yes | no |
| Auto all-page load | yes | yes | yes |
| App review / 2.0 fit | ◎ | △ (discouraged) | △ |
| Automation (many tenants) | ◎ | yes (auto on install) | ✕ (manual) |
| Best for | production standard | legacy/auto-inject | dev · PoC · single shop |

**Strategy**: A (App Embed) is the production standard. If you need onboarding automation, register B as a fallback during install OAuth. Use C for dev/demo.

---

## 6. Settings — save/manage Shopify config (design)

Add a **Shopify section** to the console Settings screen (`apps/web/src/domain/settings`). Storage rule: secrets **AES-256-GCM only** (FR-060), responses masked.

### 6.1 Fields to store

| Group | Field | Storage | Note |
|---|---|---|---|
| Identity | `shop_domain` (`*.myshopify.com`) | `tenants.shop_domain` (existing) | tenant = shop, unique |
| Credential | Admin API access token | `integration_credentials` (provider=`shopify`, `secret_enc`) | custom-app token |
| Credential | API key / API secret | same (encrypt a structured JSON) | for public-app OAuth |
| Webhook | webhook shared secret | credential or env `SHOPIFY_WEBHOOK_SECRET` | HMAC verify |
| Exposure | widget enabled on/off | new `tenant_widget_settings` | control store exposure |
| Exposure | allowed domains (custom domain) | new table | CSP `frame-ancestors` |
| Exposure | bubble color / position / default locale | new table | widget appearance |

> Never return secret plaintext. The list exposes only `configured`/`maskedKey`/`lastUpdatedAt` (keep the existing `CredentialStatus` pattern).

### 6.2 Data-model decision

- **Credentials**: reuse the existing `integration_credentials` (provider=`shopify`). If multiple keys are needed, serialize `{accessToken, apiKey, apiSecret, webhookSecret}` JSON and encrypt the whole blob into `secret_enc` (minimal schema change).
- **Non-secret exposure/appearance** settings go in a new `tenant_widget_settings` entity (one row per tenant). `tenant_id` column required (multitenancy rule); plaintext columns (color/position/enabled/allowed-domains JSON).

```
apps/api/src/domain/tenant/entity/tenant-widget-settings.entity.ts   # new
  tenant_id BIGINT, enabled TINYINT, launcher_color VARCHAR,
  launcher_position VARCHAR, default_locale VARCHAR,
  allowed_domains JSON, updated_at
```

### 6.3 Backend design (follow CLAUDE.md)

- Request DTO snake / response camel (static Mapper); controllers do glue only.
- AuthZ: credentials keep `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)`; exposure settings use the same capability or tenant master/operations label.
- Secret store/decrypt via `crypto.util` (AES-256-GCM); mask PII/secrets in logs; `AuditService.write` on change.

New/extended endpoints (example):

```
GET  /tenants/me/shopify/settings     → { shopDomain, enabled, launcherColor, ..., credential: {configured, maskedKey} }
PUT  /tenants/me/shopify/settings       { enabled, launcher_color, allowed_domains[], ... }
PUT  /tenants/me/credentials/shopify    { secret: <access token, etc.> }   # reuse existing
POST /tenants/me/shopify/test           → Admin API ping → integration_status upsert
GET  /tenants/me/shopify/install        → install snippet/script (see 6.5)
```

### 6.4 Console (web) UI design

Add a **"Shopify Integration"** card below the existing credentials table in `SettingsPage.tsx`:

- shop domain input (read-only or master-only) + **Test connection** button (→ `POST .../shopify/test`, result badge).
- Admin token / webhook secret modal (reuse the existing credential modal, `type=password`, sent only on save).
- Widget-enabled toggle, bubble color/position/default locale, allowed-domains list editor.
- All copy via `t()` (namespace `settings`), registered for en/es/ko.

### 6.5 Show install script/snippet on screen (requirement)

Give the Shopify card an **"Install on store"** subsection that shows the three snippets from §5 **with copy buttons**, each pre-filled with this tenant's `shop_domain`/`widgetUrl`:

- Tab A (App Embed): enable-extension guidance + "turn it on under Theme → App embeds".
- Tab B (ScriptTag): show "auto-registered on install" status + manual register button.
- Tab C (Manual): the raw `theme.liquid` snippet + copy button.

`GET /tenants/me/shopify/install` returns the filled snippet strings; the frontend renders them verbatim (no hardcoding — the server fills the values).

---

## 7. Shopify API integration setup (design)

### 7.1 App type

- **Custom app (recommended first)**: for a single store (ivyusa), issue an Admin API access token from *Apps → App development* and save it in Settings. No OAuth, fastest.
- **Public app (OAuth)**: for multi-tenant SaaS expansion. `/auth/shopify/install` → store the access token in the OAuth callback; auto-register webhooks and (optionally) a ScriptTag on install.

### 7.2 Scopes (example)

`read_orders`, `read_customers` (order/customer cache sync), `read_products` (optional). App Embed alone needs no ScriptTag scope. Least privilege.

### 7.3 Webhook registration

- **Mandatory GDPR webhooks** (already implemented): `customers/data_request`, `customers/redact`, `shop/redact` → `POST /webhooks/shopify/*`, HMAC (`SHOPIFY_WEBHOOK_SECRET`) verified. Register this URL and secret in app settings.
- **Operational webhooks** (optional): `orders/updated`, `fulfillments/create`, etc. to refresh the order cache (`order_cache`).

### 7.4 Show connection status

On test/sync, upsert `integration_status` (name=`shopify`) via `PATCH /integrations/status/shopify` (`status`, `last_sync_at`, `detail`) and show it as a badge in the console.

---

## 8. Work items (WBS checklist)

Widget / embed:
- [ ] Branch an embed entry (`VITE_EMBED`) in `apps/widget`, exclude the mock Storefront
- [ ] Parse `?shop`/`?locale` → pass `shop_domain` to `session/ensure` (`sessionService`, `useSession`)
- [ ] `panelOpen` ↔ parent `postMessage('ivy:resize')` with origin verification
- [ ] Build the `embed.js` loader (vanilla) + iframe injection + config intake
- [ ] Widget deploy origin CSP `frame-ancestors` (inject allowed domains), CORS whitelist

Backend:
- [ ] Remove `SessionService` "first tenant" fallback → reject/handle explicitly when `shop_domain` missing (CLAUDE.md §6 High)
- [ ] `tenant_widget_settings` entity/DTO/Mapper/service/controller (+ register in `app.module`)
- [ ] Encrypt multi-key Shopify credential JSON (reuse `integration_credentials`)
- [ ] `GET/PUT /tenants/me/shopify/settings`, `POST .../test`, `GET .../install`
- [ ] Verify custom-app token (Admin API ping) → upsert `integration_status`
- [ ] (Public-app path) `/auth/shopify` OAuth + webhook/ScriptTag registration on install

Console (web):
- [ ] Shopify card in `SettingsPage` (domain · credentials · exposure · test)
- [ ] 3-tab install snippets + copy buttons (server fills values)
- [ ] i18n (en/es/ko) strings

Shopify app / deploy:
- [ ] Theme App Extension (app-embed block) scaffold + `shopify app deploy`
- [ ] Register GDPR webhook URL/secret in app config; set `SHOPIFY_WEBHOOK_SECRET` in deploy env
- [ ] Host `embed.js` + widget static bundle on a dedicated origin

---

## 9. Security & compliance checklist

- Secrets: `secret_enc` AES-256-GCM only, masked responses, PII-masked logs, audit on change (FR-060, `amoeba_privacy_compliance_v2`).
- Webhooks: reject on HMAC-SHA256 failure (fail-safe). Missing `SHOPIFY_WEBHOOK_SECRET` is dev-only.
- iframe: `frame-ancestors` restricts to allowed store domains; mutual `postMessage` origin checks.
- Multitenancy: all queries `tenant_id`-scoped; pin tenant by `shop_domain` (remove first-tenant fallback). No cross-tenant leakage.
- AI/agent outbound still passes `ModerationService.moderate()` (FR-069).

## 10. Test scenarios (summary)

- Two tenants (shop A/B) each embedding their store → sessions isolate to **their own tenant**.
- Missing/unregistered `shop_domain` → rejected.
- Wrong-origin `postMessage` ignored; bad-HMAC webhook rejected.
- After saving credentials, response never exposes plaintext (masked); connection-test status reflected.
- Bubble exposure/open/resize works across App Embed on/off, manual snippet, and ScriptTag paths.

---

### Appendix · related file paths

- Widget: `apps/widget/src/{main.tsx,App.tsx,services/sessionService.ts,hooks/useSession.ts,components/widget/*}`
- Session API: `apps/api/src/domain/session/{session.controller.ts,session.service.ts,dto/request/session.request.ts}`
- Credentials/tenant: `apps/api/src/domain/tenant/{tenant.controller.ts,entity/integration-credential.entity.ts,entity/tenant.entity.ts}`
- Integration status: `apps/api/src/domain/integration/*`
- GDPR webhooks: `apps/api/src/domain/privacy/privacy.controller.ts` (`webhooks/shopify/*`)
- Console settings: `apps/web/src/domain/settings/{SettingsPage.tsx,settings.service.ts,settings.hooks.ts}`

# CONFIG — IVY USA Chat & Support Widget

> Technical spec + configuration reference for **development / staging / production**.
> Companion to [SPEC.md](SPEC.md) (specification) and [README.md](README.md) (overview).
> ⚠️ **No real secrets in this file.** Live values live only in gitignored env files on the
> server and in `secrets/staging-server.md` (local-only). This documents *structure*, not secrets.

---

## 1. Technical Stack (기술 스펙)

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | ≥ 20 | monorepo engine requirement |
| Monorepo | Turborepo | 2.x | `apps/*`, `packages/*` workspaces |
| Backend | NestJS | 10.3 | REST `/api/v1`, Swagger `/api/v1/docs` |
| ORM | TypeORM | 0.3.20 | `synchronize` in dev/staging; migrations in prod |
| Database | MySQL | 8.0 | utf8mb4 / InnoDB · `db_ivy_talktalk` · 38 tables / 40 entities |
| Cache/session | Redis | 7 | session cache, unread counts (tenant-prefixed keys) |
| Message bus | RabbitMQ | 3.13 | async notifications, logging, CJM (in-process fallback) |
| Auth | @nestjs/jwt | 10.2 | access 15m / refresh 7d; bcryptjs (cost 12) |
| Crypto | AES-256-GCM | — | credential encryption (`crypto.util`, POL-018) |
| Frontend | React + Vite | 18 / 5 | `apps/web` (admin SPA), `apps/widget` (customer) |
| Styling | TailwindCSS | 3 | primary 50–900 ramp; web style guide v2 |
| State/data | Zustand 4 · React Query 5 | — | global state / server state (tenantId in query keys) |
| i18n | react-i18next | 14 | en (default) / es / ko; `fallbackLng: 'en'` |
| AI | Pluggable gateway | — | stub adapter (no key) + Anthropic (`claude-opus-4-8`) |
| Container | Docker Compose | v2/v5 | dev / staging / production stacks |
| Edge | Nginx | alpine | reverse proxy (`/` web · `/api/` api · `/widget` widget) |

**Backend scope:** 26 domain modules — `auth, session, chat, moderation, ai-engine, tenant,
user, customer, order, inquiry, review, affiliate, restock, subscription, notification,
campaign, cjm, knowledge, agent, analytics, audit, integration, privacy, health,
shopify-oauth, shopify-proxy`. 40 TypeORM entities.

---

## 2. Environments at a glance (환경 요약)

| | **Development** | **Staging** | **Production** |
|---|---|---|---|
| Status | local | **🟢 LIVE** | 🔴 templates only, not deployed |
| Host | localhost | `shoptalk.amoeba.site` (211.110.140.172) | TBD |
| Public URL | — | https://shoptalk.amoeba.site | TBD |
| API base | `http://localhost:3000/api/v1` | `https://shoptalk.amoeba.site/api/v1` | TBD |
| Admin console | `:5173` | `/` | TBD |
| Widget | `:5174` | `/widget/` | TBD |
| NODE_ENV | development | staging | production |
| DB schema | `synchronize=true` + seed | `synchronize=true` + `SEED_ON_BOOT` | `synchronize=false` + init-sql migrations |
| TLS | — | host nginx + Let's Encrypt → docker nginx `:8080` | TBD |
| Compose file | `docker/docker-compose.dev.yml` | `docker/staging/docker-compose.staging.yml` | `docker/production/docker-compose.production.yml` |
| Env file | `env/backend/.env.development` (committed) | `docker/staging/.env.staging` (gitignored) | `docker/production/.env.production` (gitignored) |

---

## 3. Port mapping (포트 매핑)

### Development (host ports remapped off occupied defaults)
| Service | Host port | Container port |
|---|---|---|
| API (NestJS) | 3000 | 3000 |
| Admin web (Vite) | 5173 | — |
| Widget (Vite) | 5174 | — |
| MySQL | 3316 | 3306 |
| Redis | 6389 | 6379 |
| RabbitMQ | 5682 | 5672 |

### Staging (internal docker network; only nginx published)
| Service | Exposure |
|---|---|
| nginx (edge) | `8080:80` (host nginx + LE TLS front it on 443) |
| api / web / widget | internal only (`expose`) |
| mysql | `3317:3306` (host, for debugging) |
| redis / rabbitmq | internal only |

### Production (hardened — DB/queue never published)
| Service | Exposure |
|---|---|
| nginx (edge) | `80:80` |
| api / web | internal only |
| mysql / redis / rabbitmq | internal-network only (no host port) |

---

## 4. Environment variables (환경 변수 레퍼런스)

Templates: `env/backend/.env.development` (committed, dev placeholders) ·
`docker/staging/.env.staging.example` · `docker/production/.env.production.example`.
Copy the `.example` to the real filename on the server and fill in secrets — the real
`.env.staging` / `.env.production` are **gitignored**.

### 4.1 Backend (`apps/api`)

| Variable | Dev | Staging | Prod | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | development | staging | production | runtime mode |
| `PORT` | 3000 | 3000 | 3000 | API listen port |
| `API_PREFIX` | api/v1 | api/v1 | api/v1 | global route prefix |
| `DB_HOST` | 127.0.0.1 | mysql | mysql | compose service name in containers |
| `DB_PORT` | 3316 | 3306 | 3306 | |
| `DB_USER` / `DB_PASSWORD` | ivy / dev pw | secret | secret | app DB user |
| `DB_NAME` | db_ivy_talktalk | db_ivy_talktalk | db_ivy_talktalk | |
| `DB_ROOT_PASSWORD` | — | secret | secret | mysql container only |
| `DB_SYNCHRONIZE` | true | true | **false** | prod uses migrations |
| `DB_LOGGING` | false | false | false | |
| `REDIS_HOST` / `REDIS_PORT` | 127.0.0.1 / 6389 | redis / 6379 | redis / 6379 | |
| `RABBITMQ_URL` | amqp://…:5682 | amqp://…@rabbitmq:5672 | amqp://…@rabbitmq:5672 | |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | — | secret | secret | staging/prod compose |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev | **secret** | **secret** | rotate per env |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | 900 / 604800 | same | same | 15m / 7d |
| `CRED_ENC_KEY` | dev key | **secret** | **secret** | AES-256-GCM 32-byte base64 (POL-018) |
| `AI_DEFAULT_PROVIDER` | stub | stub | anthropic | gateway default adapter |
| `ANTHROPIC_API_KEY` | — | optional | **required** | real provider key |
| `ANTHROPIC_MODEL` | claude-opus-4-8 | claude-opus-4-8 | claude-opus-4-8 | |
| `CONVERSATION_LOG_RETENTION_DAYS` | 365 | 90 | 365 | POL-003 retention purge |
| `KB_STORAGE_DIR` | ./storage/kb | — | — | local KB uploads (dev) |
| `SEED_ON_BOOT` | — | true→false after 1st boot | true→false after 1st boot | idempotent bootstrap seed at startup |
| `SEED_DEMO_DATA` | — | true | **false** | demo orders/customers |
| `SEED_PASSWORD` | — | override recommended | **strong required** | bootstrap account password |

### 4.2 Escalation alerts (optional — empty disables a channel)
`SLACK_WEBHOOK_URL`, `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`,
`ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`. The DB-backed console alarm modal always works
regardless of these.

### 4.3 Shopify (optional — features default-safe/disabled when unset)
| Variable | Purpose |
|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | public-app OAuth (install/callback); empty → endpoints disabled (501) |
| `SHOPIFY_SCOPES` | `read_orders,read_customers` |
| `SHOPIFY_APP_URL` | app base URL (OAuth redirect host) |
| `SHOPIFY_WEBHOOK_SECRET` | HMAC verification for native + GDPR webhooks; unset → unverified accepted (dev only) |
| `SHOPIFY_SYNC_INTERVAL_MIN` | scheduled order/customer sync (0/unset = disabled) |

> App Proxy customer identity uses `SHOPIFY_API_SECRET` to verify Shopify-signed
> `/apps/{prefix}/{subpath}` storefront requests (route `/api/v1/shopify/proxy`).

### 4.4 Frontend (`apps/web`, `apps/widget`) — build-time (baked into image)
| Variable | Dev | Staging |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | `https://shoptalk.amoeba.site/api/v1` |
| `VITE_DEFAULT_LOCALE` | en | en |
| `VITE_BASE` (widget only) | / | `/widget/` |

---

## 5. Docker topology (도커 구성)

Build context is the **repo root** (`../..`) so Turbo sees the whole workspace;
root `.dockerignore` keeps host `node_modules`/`dist` out of images.

| Env | Services | Schema source | Restart |
|---|---|---|---|
| **dev** | mysql, redis, rabbitmq (app runs on host via `npm run dev`) | `synchronize` + `db:seed` | — |
| **staging** | api, web, widget, mysql, redis, rabbitmq, nginx | `synchronize` + `SEED_ON_BOOT` (no init-sql mount) | `unless-stopped` |
| **production** | api, web, mysql, redis, rabbitmq, nginx | init-sql `01-schema.sql` (`synchronize=false`) | `always` |

**Nginx edge routing** (staging/prod): `/widget` → widget:80 · `/api/` → api:3000 ·
`/` → web:80. Uses the docker DNS resolver + variable `proxy_pass` so recreated
containers (new IPs) don't cause stale 404/502.

**Health check:** `GET /api/v1/health` → `{"status":"ok","db":"up"}` (liveness + DB
readiness); wired into the api container healthcheck (staging + production compose).

---

## 6. Staging server (LIVE)

**Public:** https://shoptalk.amoeba.site — admin console at `/`, widget at `/widget/`.
Host nginx (shared host, also runs acm/tac prod) terminates TLS (Let's Encrypt,
auto-renew) and reverse-proxies to the docker nginx on `:8080`.

**Connection, SSH keys, and app credentials:** `secrets/staging-server.md` (gitignored,
local-only — **never commit**). SSH key: `secrets/ssh/ivy_staging_ed25519`.

**Shopify:** OAuth app wired to store `ambshopi.myshopify.com` (custom-app token);
tenant #1 `shop_domain` repointed `ivyusa` → `ambshopi`. Native + GDPR webhooks
HMAC-enforced; on-demand + 30-min scheduled sync verified live.

### Deploy / redeploy
```bash
# on the server, in the repo checkout (on branch main):
git pull
bash docker/staging/deploy-staging.sh          # rebuilds api/web/widget, reloads nginx
curl -s https://shoptalk.amoeba.site/api/v1/health   # {"status":"ok","db":"up"}
```
> `SEED_ON_BOOT` is kept **false** on the server so in-app password changes persist across
> restarts. Editing `docker/staging/nginx.conf` needs `up -d --force-recreate nginx` (the
> bind-mounted config isn't auto-reloaded). Full runbook: [docs/guide/STAGING-DEPLOY.md](docs/guide/STAGING-DEPLOY.md).

---

## 7. Production (not yet deployed)

Docker templates exist (`docker/production/`: Dockerfiles api/web, compose, nginx,
`deploy-production.sh`) but **production is not set up** — there is no
`docker/production/.env.production` and no production host recorded.

**To bring up production:**
1. Provision a host (Docker + compose); point DNS + TLS at it.
2. `cp docker/production/.env.production.example docker/production/.env.production` and fill:
   strong `DB_*`, `RABBITMQ_*`, `JWT_*`, `CRED_ENC_KEY`, real `ANTHROPIC_API_KEY`,
   strong `SEED_PASSWORD` (with `SEED_DEMO_DATA=false`), `SHOPIFY_WEBHOOK_SECRET`,
   and `VITE_API_BASE_URL` = the production API URL.
3. Apply schema via `sql/01-schema.sql` / init-sql (production keeps `DB_SYNCHRONIZE=false`).
4. `bash docker/production/deploy-production.sh`, then turn `SEED_ON_BOOT` off after the first successful boot.

Production hardening (vs staging): `restart: always`; DB/redis/rabbitmq have **no** host
ports (internal network only); schema via migrations, never auto-synchronize.

---

## 8. Security & compliance config (보안·컴플라이언스)

- **Secrets** — JWT secrets, `CRED_ENC_KEY`, DB/MQ passwords, `SEED_PASSWORD`, Shopify
  keys are per-env and live only in gitignored env files / `secrets/`. Rotate per environment.
- **Passwords** — bcrypt cost 12; seeded/invited accounts `must_change_password=1`.
- **Credentials** — per-tenant integration credentials AES-256-GCM encrypted at rest.
- **PII** — `LoggingInterceptor` logs method/path/status/duration only (no bodies/PII); `maskPii` util; privileged actions → `AuditService.write`.
- **Privacy** — Shopify GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`, HMAC), DSAR export/delete, CCPA opt-out, `RetentionService.purgeExpired()` (`CONVERSATION_LOG_RETENTION_DAYS`).
- **Moderation** — all AI + agent outbound passes `ModerationService.moderate()` (fail-safe = block; non-bypassable, NFR-013).
- **Tenant isolation** — `tenant_id` row scoping via `TenantContext` (AsyncLocalStorage) + `TenantContextInterceptor` + TypeORM `TenantSubscriber` auto-stamp; admin reads filtered by `user.tenantId`.

---

## 9. Reference

[README.md](README.md) · [SPEC.md](SPEC.md) · [CLAUDE.md](CLAUDE.md) ·
[CHANGELOG.md](CHANGELOG.md) · [docs/guide/DEPLOYMENT-STRATEGY.md](docs/guide/DEPLOYMENT-STRATEGY.md) ·
[docs/guide/STAGING-DEPLOY.md](docs/guide/STAGING-DEPLOY.md) ·
`secrets/staging-server.md` (local-only) · `standards/` · `reference/`.

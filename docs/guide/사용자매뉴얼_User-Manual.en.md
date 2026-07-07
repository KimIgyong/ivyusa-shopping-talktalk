# IVY USA Chat & Support Widget — User Manual

> Version 1.1.0 · 2026-07-01 · Revised 2026-07-06
> Audience: Tenant operators · Agents · Platform admins
> Legend: **✅ Implemented / 🟡 Wired-and-designed or Roadmap**. Marked honestly against the actual code.

---

## Table of contents
1. [Getting started (login & roles)](#1-getting-started)
2. [Customer widget flow](#2-customer-widget-flow)
3. [Scenario chatbot configuration](#3-scenario-chatbot-configuration)
4. [RAG knowledge-based AI chatbot configuration](#4-rag-knowledge-based-ai-chatbot-configuration)
5. [Agent handoff (escalation) conditions & timing](#5-agent-handoff-escalation-conditions--timing)
6. [Agent live-chat console](#6-agent-live-chat-console)
7. [Customer-info integration (Shopify · Odoo)](#7-customer-info-integration)
8. [Knowledge base (KB) management](#8-knowledge-base-kb-management)
9. [Moderation policy](#9-moderation-policy)
10. [Campaign (outbound) management](#10-campaign-outbound-management)
11. [Platform-admin console](#11-platform-admin-console)
12. [FAQ / troubleshooting](#12-faq--troubleshooting)

---

## 1. Getting started

### 1.1 Console access
- The operator/admin console (`apps/web`) opens in a browser. In dev: web `:5173`, API `:3000` (Swagger at `/api/v1/docs`).
- Sign in with email + password (JWT). Access token 15 min, refresh 7 days.

### 1.2 Seed accounts (must change password on first login)
| Role | Account | Password |
|---|---|---|
| System Admin | `admin@amoeba.group` | `amb2026!@` |
| Tenant Master (ivyusa) | `dev@amoeba.group` | `amb2026!@` |

> Both are `must_change_password=1`, so change the password right after the first login.

### 1.3 Roles & permissions (RBAC)
Permissions come from a **rank × label** matrix.
- **Rank**: master · director · manager · staff
- **Label**: consult · accounting · operations
- **System admin**: super · admin (cross-tenant)

Menus and features are shown per permission, with the ACL owner-visibility policy (POL-019) layered above functional RBAC.

### 1.4 Console menu map
| Menu | Path | Purpose |
|---|---|---|
| Dashboard | `/` | Support metrics overview |
| Live chat | `/live-chat` | Real-time chat & handoff |
| History | `/history` | Past conversations & filters |
| AI settings | `/ai-setting` | Persona, rules, scenario, engine, moderation |
| Knowledge | `/knowledge` | KB sources & documents |
| Customers | `/customers` | Customer cache & tier |
| Campaigns | `/campaigns` | Campaign management |
| Users | `/users` | Users & permissions |
| Settings | `/settings` | Tenant settings |
| Admin | `/admin/*` | Platform admin (tenants, AI engines, audit) |

---

## 2. Customer widget flow

When a customer opens the chat widget on the Shopify storefront, they are handled in this order.

### 2.1 Anonymous entry → scenario chatbot
The widget first shows a **scenario button menu**. The 6 default actions:

| Button action | Description |
|---|---|
| `delivery_status` | Delivery status |
| `cancel_refund` | Cancel / Refund |
| `product_help` | Product help |
| `contact_support` | Contact an agent |
| `affiliate` | Affiliate |
| `my_orders` | My orders |

> ⚠️ Here the "scenario chatbot" is a **button-based quick-reply menu** that routes intent to each action. It is not a multi-branch dialog-tree engine — it's a menu that quickly classifies and guides routine inquiries. Free-form questions are answered by RAG.

### 2.2 Identity gate (when personal data is needed)
If the customer asks something requiring personal data (orders, delivery), the backend **intent classifier** flags `needsOrderData=true`. If the customer is anonymous (no customerId), the system responds:

> "To look up your order I need to verify your identity. Please sign in or use guest order lookup." (localized en/es/ko by session language)

- Guest order lookup is limited to **5 attempts per 15 minutes** (Redis rate-limited).

### 2.3 Routine answer insufficient → RAG AI chatbot
For free-form questions or anything the scenario menu can't resolve, the **RAG knowledge-based AI chatbot** answers:
1. Retrieve relevant docs from the tenant KB (active + tenant-scoped)
2. Generate an answer grounded only in the retrieval, **with citations**
3. Compute a **confidence** score
4. Pass the **moderation gate**, then deliver to the customer

### 2.4 Outside knowledge scope → agent handoff
If confidence is low (< 0.45) or moderation blocks, it hands off to an agent. See [Section 5](#5-agent-handoff-escalation-conditions--timing).

### 2.5 Conversation state transitions
```
ai_active  ──(escalate)──▶  waiting  ──(agent accepts)──▶  agent  ──(end)──▶  ended
```

### 2.6 Widget layout (bottom tabs)
The customer widget is more than chat — a bottom tab bar exposes three screens.

| Tab | Icon | Purpose |
|---|---|---|
| Notifications | 🔔 | Payment/shipping/event/review alerts, unread badge & mark-as-read |
| Chat | 💬 | Scenario buttons + RAG AI + agent (the earlier part of this section) |
| Orders | 📦 | Payments/shipping/inquiries sub-tabs, order detail & delivery tracking, review |

### 2.7 Orders tab
- **Sub-tabs**: Payments (all paid orders) · Shipping · Inquiries (cancel/refund/return-related).
- **Identity gate**: while anonymous, an auth gate (AuthGate) asks the customer to sign in or use guest lookup. Once verified, order list/detail load.
- **Order detail**: a delivery-step tracker (Confirmed → In Transit → Delivered → Review, POL-014 status mapping). "Ask about this order" links the order number into chat.

### 2.8 Writing a review
- For a delivered order item (Delivered → Review step), the customer can leave a **star rating (1–5) + review text**.
- Saved by session token; a thank-you message shows after submission.

### 2.9 Notifications tab & delivery preferences
- **Filters**: All / Payment / Shipping / Event / Review. Unread items show a dot and are marked read on click. The tab's bell icon carries an **unread-count badge** (capped at 99+).
- **Delivery preferences (PreferencesPanel)**: a channel × category matrix toggles which alerts are received.
  - Channels: `in_app` (always on — cannot be turned off) · `email` · `sms` · `web_push`
  - Categories: `payment` · `shipping` · `event` · `review`
  - **CCPA opt-out** link: turns off every channel/category except `in_app` at once.
- **Back-in-stock alerts**: for out-of-stock products, **guests can subscribe too** (`POST /restock/subscribe`, with a channel). A notification is sent on restock.

### 2.10 Consent
- On entry the widget shows a consent banner (ConsentBanner) for CCPA/GDPR notice & consent. Features needing personal data (order lookup, etc.) are used after consent and identity verification.

---

## 3. Scenario chatbot configuration

**Where**: AI settings (`/ai-setting`) → "Scenario buttons" section · **Suggested role**: master/director (consult)

### 3.1 Editing buttons
Each button has these fields.

| Field | Description |
|---|---|
| `id` | Button identifier (auto `btn_N` if omitted) |
| `label` | Display text (max 60 chars) |
| `action` | Routing action (from the list below) |
| `enabled` | Visibility (hidden in widget if false) |

Selectable `action`: `delivery_status`, `cancel_refund`, `product_help`, `contact_support`, `affiliate`, `my_orders`, `message`.

### 3.2 How it works
- The widget fetches the saved button set via the public endpoint `GET /ai-config/scenario`, and **only enabled buttons** are returned.
- If nothing is saved, the system's 6 default buttons are used.
- Even on a fetch failure the widget falls back to hardcoded defaults so **a menu is always visible**.
- Labels also fall back to widget i18n (en/es/ko) translations.

### 3.3 Configuration tips
- Order buttons by how often each routine inquiry arrives (move up/down supported).
- Prefer `enabled=false` over deleting a button so it's easy to re-enable.
- Keep `contact_support` enabled so customers can reach an agent immediately.

---

## 4. RAG knowledge-based AI chatbot configuration

**Where**: AI settings (`/ai-setting`) · **Suggested role**: master/director

RAG answer quality comes from three settings plus the knowledge base.

### 4.1 Bot persona
- Describe the bot's tone, stance, and principles in the "Bot persona" text area.
- This text is injected at the start of the RAG system prompt.
- Default: *"You are IVY USA's friendly, concise customer-support assistant. Be helpful and accurate, and only answer from the provided knowledge."*

### 4.2 Response rules
- Add/remove multiple rule lines (e.g., "Never state prices as definitive", "Cite the policy doc for refunds").
- Blank rules are stripped on save.
- Rules are injected as a list right after the persona.

### 4.3 Per-function AI engine
Assign the AI engine per function. Function keys: `chat`, `rag`, `summary`, `assist`, `moderation`.
- `AiGatewayService` resolves the engine via `(tenant, function)` → `tenant_ai_settings → ai_engines`.
- Adapters: **stub** (runs with no key — dev/fallback) · **Anthropic** (when a key is set).
- On engine failure it auto-degrades to the stub so responses don't stop.

### 4.4 RAG retrieval/answer logic (reference)
- Retrieval targets active (`active=1`) + tenant-scoped documents (`tenant_id` match or NULL).
- **Knowledge Store sources rank above Google Drive** (POL-013).
- Confidence is derived from the number of retrieved docs. Actual formula: `0.2` if none, else `min(0.95, 0.5 + docCount × 0.12)` (e.g. 1 doc = 0.62, ≥4 docs = 0.95 max).
- Answers are generated with an "answer only from context, hand off if insufficient" rule and returned with citations.

> 🟡 The retriever is currently **keyword-based**; vector-embedding search is on the roadmap. So **include the keywords customers actually use in the title and body of KB docs** to raise retrieval hit rate.

### 4.5 Setup checklist
- [ ] Persona states brand tone and prohibitions
- [ ] A KB doc exists and is active for each key policy (delivery/cancel/refund)
- [ ] Response rules include "don't assert without evidence"
- [ ] The `rag` function engine points to the desired provider

---

## 5. Agent handoff (escalation) conditions & timing

After a RAG answer, the system decides handoff with this logic.

### 5.1 Automatic handoff triggers
| Condition | Action |
|---|---|
| **Confidence < 0.45** (`ESCALATION_CONFIDENCE`) | Append "Would you like me to connect you with a support agent?" and mark the conversation `waiting` |
| **Moderation gate BLOCKED** | Don't show the answer; say "I'm connecting you with a support agent…" and set `waiting` |
| **Customer requests an agent** | The widget's contact action (`contact_support`) or an explicit escalation sets `waiting` |

### 5.2 Processing order (internal)
1. Persist user message · publish conversation-log/CJM events
2. Intent classification — identity gate if order data is needed
3. RAG answer generation (retrieve → generate → confidence)
4. **Moderation gate** (mandatory, fail-safe block)
5. `confidence < 0.45` **OR** `blocked` → escalate
6. Set conversation to `waiting` → appears in the agent queue

### 5.3 Adjusting the threshold
- The handoff confidence threshold is a code constant (`ESCALATION_CONFIDENCE = 0.45`).
- 🟡 There is no in-console UI to change it yet. Ask the dev team if you need a different value (roadmap: make it an admin setting).

### 5.4 Handoff messages to the customer (multilingual)
Auto-localized by session language.
- English: "I'm connecting you with a support agent who can help with this." / "Would you like me to connect you with a support agent?"
- Korean and Spanish provided with the same meaning.

---

## 6. Agent live-chat console

**Where**: Live chat (`/live-chat`) · **Suggested role**: holders of the consult label

### 6.1 Session queue
- Conversations in `waiting` and `agent` status appear in the list, each with its last message.
- Browsed with pagination.

### 6.2 Accept a conversation
- **Accepting** a waiting conversation creates an assignment, sets the status to `agent`, and assigns the agent.

### 6.3 AI briefing
- When taking over, the AI briefs the conversation so far as **summary, intent, sentiment, recommended action** (`assist` function).
- If briefing generation fails it returns empty, without disrupting the chat.

### 6.4 Sending a reply (moderation required)
- Agent messages also **pass the moderation gate**.
- If blocked, sending is refused (error `MODERATION_BLOCKED`). Revise the wording and retry.

### 6.5 End a conversation
- Ending sets the status to `ended` and releases the active assignment.

### 6.6 Agent profile & stats
- Profile: languages, skills, max concurrent chats (`max_concurrent`, default 3), status (online/offline, etc.).
- Daily stats (`agent_daily_stats`) are viewable, tenant-scoped.

---

## 7. Customer-info integration

**Where**: Customers (`/customers`)

### 7.1 What the agent can see
The customer list/detail shows these fields.

| Field | Source | Description |
|---|---|---|
| `email`, `name` | Shopify / session | Customer identity |
| `shopifyCustomerId` | Shopify | Shopify customer ID |
| `tier` | Internal | guest / subscriber / regular |
| `shopifyTier` | Shopify | Tier per Shopify |
| Order cache | Shopify/Odoo | Order & delivery status (internal: paid/preparing/shipping/delivered) |

- Searchable by email; the list is tenant-scoped.
- Customers are looked-up-or-created by email, caching the Shopify customer ID alongside.

### 7.2 Integration status (honest labeling)
| Integration | Status | Notes |
|---|---|---|
| **Shopify customer & order cache** | ✅ Implemented | Cached and queried in Customer/Order domains |
| Delivery lookup · Fulfillment webhook | ✅ Implemented | Order-status mapping (POL-014) |
| **Odoo customer/order sync** | 🟡 Status-tracked only | `integration_status` (shopify/fulfillment/klaviyo/odoo/google_drive) and per-tenant credentials (AES-256-GCM) schema are ready. **Live sync logic is roadmap**; the order-cache table is designed to hold both Shopify and Odoo sources |
| Klaviyo · Google Drive | 🟡 Status-tracked | Managed as integration states |

- Integration state (name, status, last sync time) is viewed/updated in admin via `integrations/status`.

> Summary: The customer info an agent sees in the console is **live from the Shopify source**; **Odoo is at the schema/credentials/status-tracking stage**. Live Odoo data sync is a next-phase task.

---

## 8. Knowledge base (KB) management

**Where**: Knowledge (`/knowledge`)

- Manages knowledge sources (`knowledge_sources`) and documents (`kb_documents`), board posts (`kb_board_posts`), files (`kb_files`).
- Documents control RAG inclusion via the `active` flag. **Inactive docs are not used as answer evidence.**
- Source priority: **Knowledge Store > Google Drive**.
- For hit rate, include the keywords customers actually use in titles and bodies (retrieval is keyword-based today).

**Operational tips**
- On a policy change, update the related doc and set the old version `active=0` to avoid confusion.
- Use categories (delivery/refund/product, etc.) to keep the answer context clean.

---

## 9. Moderation policy

- **Every AI and agent outbound message** must pass `ModerationService.moderate()` (non-bypassable, FR-069/POL-020).
- On error the default is **block (fail-safe)**.
- Decisions: allow / BLOCKED. When blocked, the AI answer is not shown and the flow escalates to an agent; agent messages are refused.
- Moderation rules are managed in the "Moderation rules" section of AI settings (add/remove content-filter rules).
- Every decision is recorded in `moderation_logs`.

---

## 10. Campaign (outbound) management

**Where**: Campaigns (`/campaigns`) · **Suggested role**: master/director (operations)

Create and send **outbound campaigns** that deliver a message to a customer audience.

| Field | Description |
|---|---|
| `name` | Campaign name |
| `channel` | Delivery channel (default `email`) |
| `message` | Message body |
| `status` | `draft` → `scheduled` → `sent` |
| `audienceSize` | Number of targeted customers |
| `sentCount` | Number sent |

- A new campaign is created as `draft`; running **Send** from the list flips its status to `sent`.
- Campaign list and sending are tenant-scoped.

> 🟡 Fine-grained audience targeting and scheduled (auto-`scheduled`) sending UI are on the roadmap. Today the default flow is create → send now.

---

## 11. Platform-admin console

**Where**: `/admin/*` · **Permission**: system admin (super/admin)

| Screen | Path | Purpose |
|---|---|---|
| Overview | `/admin` | Platform-wide status |
| Tenants | `/admin/tenants` | Create/manage tenants |
| AI engines | `/admin/ai-engines` | Register/manage available AI engines |
| Audit log | `/admin/audit` | Audit trail of privileged actions |

- The audit log records privileged actions such as forced password changes and permission changes.
- Tenants select the engines registered here, per function.

---

## 12. FAQ / troubleshooting

**Q. The bot keeps handing off to an agent.**
Usually there's no active KB doc for the topic, so confidence is low. Add and activate a KB doc for that topic and include the customer's keywords in the body.

**Q. No scenario buttons show in the widget.**
If all saved buttons are `enabled=false` or the fetch fails, it falls back to the 6 defaults. Confirm at least one is enabled in AI settings.

**Q. My agent reply won't send.**
It may be blocked by the moderation gate (`MODERATION_BLOCKED`). Soften the wording and retry.

**Q. I want to change the handoff threshold (0.45).**
It's a code constant today. In-console setting is on the roadmap; ask the dev team to change it.

**Q. Odoo customer info isn't showing.**
Live Odoo sync is still on the roadmap. Console customer info is currently shown from the Shopify source.

**Q. It works without an AI key.**
The stub adapter generates responses with no key (for dev/fallback). Set a real engine key (e.g., Anthropic) for production quality.

**Q. A customer says they aren't getting notifications.**
`in_app` is always on, but the customer can turn off `email`/`sms`/`web_push` per category in preferences. Hitting CCPA opt-out disables every channel except in_app. Check the customer's delivery preferences.

**Q. Does a back-in-stock alert require login?**
No. Restock alerts for out-of-stock products can be subscribed to by guests (`POST /restock/subscribe`).

**Q. I want to schedule a campaign.**
Today the default is create-then-send-now. A `scheduled` status with automatic scheduled sending is on the roadmap.

---

*Related docs: Service Introduction, SPEC.md, `.claude/skills/ivy-talktalk-dev/SKILL.md`*

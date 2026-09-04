# ShopTalk Chat & Customer Support Widget — User Manual (Integrated)

> Version 2.1.0 · First edition 2026-07-01 · Fully revised 2026-08-24 · **Updated 2026-09-04** (against the code)
> Audience: tenant operators · agents · platform administrators
> Legend: **✅ implemented / 🟡 in preparation·roadmap**. Marked honestly against the actual code.
> Online edition: https://shoptalk.amoeba.site/manual (md·html × ko/en/vi) — **when revising this
> document, also update `apps/web/public/manual/user-manual.*` (the en copy + ko/vi editions)**
> ⚠ AI-translated draft pending native review. The Korean edition is authoritative.
>
> If you are setting up for the first time, start with the [Quick Setup Manual](GUIDE-260824-Quick-Setup-Manual.md);
> if you are refining knowledge and AI, see the [Knowledge & AI Setup Manual](GUIDE-260824-Knowledge-AI-Manual.md).
> This document is **the reference manual that walks every screen**.

---

## Table of Contents
1. [Getting Started (Login·Roles·Menu)](#1-getting-started)
2. [Customer Widget](#2-customer-widget)
3. [AI Response Flow (Summary)](#3-ai-response-flow-summary)
4. [Live Chat Console](#4-live-chat-console)
5. [Issue Board](#5-issue-board)
6. [Conversation History](#6-conversation-history)
7. [Work Log](#7-work-log)
8. [Statistics](#8-statistics)
9. [Dashboard](#9-dashboard)
10. [Customers·Orders·Products](#10-customersordersproducts)
11. [Campaigns](#11-campaigns)
12. [Reviews](#12-reviews)
13. [Knowledge & AI Settings (Links)](#13-knowledge--ai-settings)
14. [Tenant Settings](#14-tenant-settings)
15. [Privacy Notice·My Page](#15-privacy-noticemy-page)
16. [Platform Admin Console](#16-platform-admin-console)
17. [FAQ / Troubleshooting](#17-faq--troubleshooting)

---

## 1. Getting Started

### 1.1 Accessing the console
- Tenant console: `https://shoptalk.amoeba.site/user/<slug>` — a store-specific login address.
- Platform administrators: `/admin/login`.
- Login is email + password (JWT). Invited accounts sign in first with a **temporary
  password** and then go through a **forced change** (10+ characters · 3 character classes ·
  no common passwords).
- master/director and system administrators are **required to enroll MFA (TOTP)** (a grace
  banner before the enforcement date → a blocking modal after). At enrollment, the 10
  recovery codes are shown **only once**.
- Full onboarding procedure: [Quick Setup Manual, Chapters 1–2](GUIDE-260824-Quick-Setup-Manual.md).

### 1.2 Roles & permissions (RBAC)
- **Ranks**: master · director · manager · staff / **duty labels**: consult ·
  accounting · operations. System administrators: super · admin.
- Menu visibility is **2-tier**: ① the menus the platform administrator provides to the
  tenant (plan defaults + exceptions) → ② the per-rank permissions plus per-user exceptions
  the tenant master sets (the *Menu access* card in [Settings]). Typing a URL directly is
  re-validated and blocked by the server.
- The owner-visibility policy (ACL) applies on top of feature permissions.

### 1.3 Console menu
Clicking the sidebar logo opens the **card list of accessible screens** (`/menu`).

| Menu | Path | Purpose |
|---|---|---|
| Dashboard | `/dashboard` | KPIs·popular questions·integration status |
| Live chat | `/live-chat` | Real-time support·handoff handling |
| Issues | `/issues` | Inquiry-ticket kanban board (native-workflow tenants) |
| History | `/history` | Browse past conversations·verify evidence |
| Work log | `/work-log` | Audit trail of agent actions |
| Statistics | `/statistics` | Question analytics·channels·agents·outcomes·satisfaction·hours |
| AI settings | `/ai-setting` | Agents·persona·rules·scenarios·built-in conversations·engine wiring·moderation·coaching |
| Knowledge | `/knowledge` | Knowledge board (`/knowledge/board`)·documents·sources·validation |
| Customers / Orders / Products | `/customers` `/orders` `/products` | Browse·manage cached data |
| Campaigns / Reviews | `/campaigns` `/reviews` | Sending·review management |
| Users | `/users` | Team invites·ranks·labels |
| Tenant settings | `/settings` | 7 tabs: Basic settings / Widget settings / Platform integrations / Marketing & helpdesk / Messenger channels / Other settings / Privacy notice (§14) |
| My page | `/my-page` | Profile·password·MFA |
| Admin | `/admin/*` | Platform administration (system administrators only) |

---

## 2. Customer Widget

### 2.1 Screen layout
- The **launcher** on the shop page (position·size·icon set by the tenant theme settings) →
  clicking opens the panel (full screen on mobile / floating card on desktop).
- Header: store display name (or logo), **language switcher** (6 languages en/es/ko/vi/ja/zh
  — switching also updates the session language on the server, changing the AI answer
  language), settings (gear), close.
- **Tabs**: notifications / orders / chat — which tabs show, in what order and position
  (top/bottom), follows the tenant settings. With only one tab, the tab bar itself hides.

### 2.2 Notifications & orders tabs
- Notification tab chips: `All · Events` / order tab chips: `Orders (order list) · Shipping ·
  Reviews · Inquiries`. **Turning one tab off absorbs its chips into the remaining tab** —
  disabling a tab never loses the feature.
- Items: icon·title·status badge·body·relative time·unread dot. The latest unread item is
  highlighted.
- **Order detail**: line items·totals·shipping-tracking stepper·**Track shipping**·**Ask
  about this order** (feeds the order number into chat)·per-item **Write a review** (1–5
  stars + comment).
- The inline order list shows only the recent window; "See more" links to the shop's own
  My Page (the order-list page on Cafe24, the account page elsewhere).

### 2.3 Chat tab
- Top: **AI-consultation disclosure** + **End chat** link (only while in progress).
- **Consent banner**: shown on first entry or when the notice version changes. Before
  consent, features requiring personal data are restricted.
- **Scenario buttons**: the quick menu the tenant configured (6 defaults). Product help
  opens a submenu (usage·ingredients·exchange/return·restock). After an answer, quick chips
  (my orders/shipping/returns/connect to agent) are appended.
- **Identity verification (AuthGate)**, 2 methods: ① store login — redirect (default) or
  popup per tenant setting, Cafe24/Shopify login paths handled automatically, widget
  auto-reopens on return ② guest order lookup — order number + email (rate-limited).
- **Attachments**: images ≤10MB (HEIC included — auto-converted) / files ≤20MB
  (pdf·txt·csv·docx·xlsx), max 5 per message. Sending files alone is also possible.
- **Waiting indicators**, 3 kinds: AI generating / agent responding / awaiting handoff
  (no agent assigned yet).
- **Closing & satisfaction**: when the customer ends the chat, it closes after confirmation.
  A closed conversation shows a **satisfaction card (5-level emoji = 1–5 points)** within 24
  hours. Sending a new message starts a new conversation.

### 2.4 Settings (gear)
- **Consent management**: view status·time·version, withdraw (2-step confirmation —
  withdrawal stops the conversation), re-consent.
- After login: **marketing opt-out** (a single toggle — declines promotions·coupons·review
  requests; order/shipping notifications are sent regardless), **do-not-sell/share**
  (CCPA/CPRA), **export my data** (JSON download), **delete my data** (2-step confirmation
  — on completion the widget resets to a logged-out state).
- The category×channel subscription matrix was removed from the widget and relocated to
  **store policy (the console's notification channel settings)**.

---

## 3. AI Response Flow (Summary)

```
Customer message → intent classification (identity-verification prompt if personal data is needed)
  → if policy-forced handoff (deny-list) matches:
      "No answer" rule → straight to an agent with no AI
      "Answer, then hand off" rule → answer from knowledge first, then hand off anyway
  → knowledge search (RAG) → answer generation (persona+rules, confidence scoring) → moderation
  → confidence sufficient: answer + sources to the customer / low·blocked·customer request: agent queue
```

- Agent-sent messages pass moderation identically (non-bypassable; blocked on failure).
- How to adjust each point of the pipeline: [Knowledge & AI Manual](GUIDE-260824-Knowledge-AI-Manual.md).

---

## 4. Live Chat Console
*(`/live-chat` · holders of the consult label)*

Three columns: **queue (left) — conversation (center) — context (right)**. Lists
auto-refresh every 5 seconds.

### 4.1 Queue (left)
- Scope: **All / Needs attention / Closed** (default All — conversations the AI is handling
  are visible too). The **Groups** tab on the second row is session grouping (§4.5).
- Channel filter + **AI-agent filter** (all agents / per agent). Customer name/email search.
  Channels: Widget·Telegram·Viber·Zalo·LINE·WhatsApp·WeChat·KakaoTalk·SMS·Email —
  conversations arriving through the btbz relay also show their original messenger name.
  **SMS is receive-only**: it carries a badge and replying is disabled.
- Each row: **session alias** (editable inline by agents; falls back to customer name →
  email → session ID), channel·status badges, the assigned AI-agent chip, an "auto-reply
  OFF" chip, the last message, and elapsed time.
- **Pin**: hover a row to reveal the pin icon. Pinned conversations always sit at the top
  of the list — **shared by the team, max 3 per store** (a 4th is refused; unpin one first).
- The filter/search rows stay fixed while scrolling; only the inner area of each of the 3
  panes scrolls.

### 4.2 Conversation (center)
- Header **auto-reply control**: `Follow channel default / Automatic / Send after approval /
  Off` + a current-state badge (AI responding / agent responding / awaiting approval). Once
  an agent takes over, agent handling takes precedence regardless of this setting.
- Buttons: **[Accept]** (take over — assigns ownership), **[Hand back to AI]** (only from
  agent state — returns the conversation to the AI, confirmation modal), **[End]**,
  **[Sync]** (manual refresh), **[Pin/Unpin]**, **[Assign]** (change the owner to another
  AI agent or a human agent — an AI-agent change applies **from the next response**).
- **4 customer-message actions** — appear on hover over a customer bubble (hidden while
  the AI is auto-answering the conversation):
  | Action | What it does |
  |---|---|
  | Translate | Pick a language → a **console-only** translated bubble under the original (invisible to the customer) |
  | Look up in knowledge | Copies the message into the knowledge-lookup panel on the right and queries it |
  | Quote reply | Shows a quote chip above the composer — the quotation is assembled into the message on send |
  | File this message as an issue | Creates an issue from an excerpt+type+memo (added as a memo if this conversation already has an issue) |
- **Send-after-approval mode**: the AI draft appears in an editable panel (with confidence
  shown); **[Approve & send]** sends it in the agent's name (moderation·audit apply
  identically). **[Discard]** is also available.
- **Composing messages**: text + attachments (same limits as the customer widget — images
  10MB/files 20MB/max 5). If sending is refused, it is a moderation block — rephrase and
  retry. **The SMS channel is receive-only**, so composing is disabled.
- Under an AI answer bubble, **[Save as knowledge]** (master/director only): captures the
  answer as a knowledge document draft.
- Older messages load via "Load earlier messages".

### 4.3 Context (right)
- **AI briefing**: summary of the conversation so far·intent·sentiment·recommended actions.
  (When a group is selected, this spot becomes the **customer journey report** panel — §4.5.)
- **Knowledge lookup**: ask the knowledge base directly mid-conversation (one click inserts
  the last customer message) → check the answer·sources (stale/conflict badges, document
  shortcuts) → **[Send to customer] / [Edit & send] (fills the composer) / [Propose as
  knowledge]** (queued for the knowledge owner's approval).
- **Customer card**: name·email·phone·tier + **customer matching** (search & link) /
  **create customer**.
- **Recent orders** card.
- **Issue panel** (native-workflow tenants): issue number·status·type·reopen count,
  [Resolve]/[Decline] (reason required: policy-impossible/misassigned/spam), reassignment
  selector, event timeline.

### 4.4 Handoff alerts & auto-wrap-up
- **Escalation alarm**: when a new handoff occurs, wherever you are in the console an alert
  modal appears within 10 seconds (reason: low confidence/moderation block/customer
  request), and [Open chat] jumps straight in.
- **Idle conversation auto-wrap-up** (server behavior, widget channel only): if both sides
  are silent for 30 minutes it sends "Is there anything else we can help with?", and closes
  after 1 more minute of silence. Conversations older than 7 days are closed quietly.
  Conversations awaiting an email reply are never auto-closed.

### 4.5 Session grouping & customer journey report
- **[Select]** in the list header → check 2 or more sessions → **[Create group]**. Two
  types: **timeline** (one customer's sessions in time order) / **project** (conversations
  of the parties involved in the same case). You can create a new group or add to an
  existing one.
- **Group room** (entered from the queue's *Groups* tab): all member sessions merged into
  one timeline. Sending is **1:1** — pick a **recipient** first. In the group settings you
  can remove members or **dissolve the group**; dissolving keeps every conversation and
  message intact.
- **Customer journey report** (right panel while a group is selected): **[Generate
  report]** (whole period / custom range) → ① Summary ② Contact history ③ What they ask
  ④ Resolution time ⑤ Customer path (5A) ⑥ Needs (hypothesis) ⑦ Next actions. **The
  numbers are counted by code; only the narrative is written by AI** — a large group takes
  tens of seconds and you may leave the screen. Pick two past reports for a **comparison
  analysis** (a warning shows when their criteria versions differ).
- The report's **writing criteria** (section on/off·top-question count·sample cap·quote
  length·banned phrases) are managed in *Journey report criteria* under [Tenant settings →
  Other settings] (master only). Saving mints a new version; existing reports keep the
  version they were written with.

---

## 5. Issue Board
*(`/issues` · only for tenants whose workflow mode is **native** — otherwise only a notice is shown)*

A **kanban board** that manages inquiries as tickets (issues).

- Columns: `Open → In progress → Resolved / Declined → Closed` (only allowed moves can be
  dragged — an invalid move snaps back. On touch devices use the card's move selector).
- Top KPIs: open·in progress·**unassigned**·average resolution time·reopen rate (30-second
  refresh).
- Cards: issue number·type·**SLA badge (⚠️ approaching / 🔥 exceeded)**·reopen count·session
  alias·customer's last utterance·assignee (label badge+name, or unassigned)·**urgent/normal
  toggle**.
- **Declining** requires a reason (policy-impossible/misassigned/spam + memo). Reopening is
  possible after resolve/decline.
- Card click → a read-only preview of the last 10 turns (viewing is recorded in the audit
  log) → [Open session] enters live chat.
- The customer-message action **[File this message as an issue]** in live chat (§4.2) also
  creates issues.
- SLA baseline hours are set on the *Agent handoff* card under [Tenant settings → Basic
  settings] (normal/urgent, 1–168 hours, defaults 24h/4h).
- The workflow mode (whether native) is the platform administrator's **Plan/Add-ons**
  setting (§16) — with the menu provided but the mode off, only a notice screen shows.

---

## 6. Conversation History
*(`/history`)*

- Filters: period · assignee (consult-label holders) · status · escalated or not · **message
  body search** (runs via the search button — searches are audit-logged) · whether to
  include preview conversations.
- Row click → full-conversation modal: customer/assignee/channel/**language**/start·end
  metadata + per-utterance bubbles. **Every AI answer shows evidence-document chips
  (title+similarity; click to open the knowledge document) and a confidence badge**, so you
  can trace why it answered that way. Handoff moments carry a reason badge.
- Viewing is recorded in the audit log (notice at the bottom of the modal). Export (CSV,
  etc.) is 🟡 not provided.

---

## 7. Work Log
*(`/work-log`)*

The audit trail of agent actions (an agent lens over the same store as the admin audit log).
Filters: period·agent·action (accept/message sent/customer linked/customer created/
closed/conversation viewed/full-text viewed).
Columns: time·agent·action·target·result (success/failure).

---

## 8. Statistics
*(`/statistics` · one shared date filter, default last 30 days)*

Six top-level sections — **Question analytics / Channels / Agents / Outcomes /
Satisfaction / Hours**.

- **Question analytics**: 4 sub-tabs (**intent / knowledge used / keywords / similar-question
  groups**). Trend chart + table (count·share·**escalation rate**·**no source**·**average
  confidence**). ⚠-marked rows have a high escalation rate or low confidence — **your
  knowledge-reinforcement priority list** (in *knowledge used*, clicking a row jumps to the
  document). Built on daily snapshots, so the numbers survive conversation-log deletion; a
  warning banner appears if aggregation has stalled for 2+ days.
- **Channels**: per-channel conversations·customer messages·**messages per conversation
  (median)**·agent handoffs. Read the median first — a single conversation with hundreds of
  turns drags the average far away.
- **Agents**: an **AI agents** table and a **human agents** table. Conversations·replies
  sent·resolved·satisfaction (the rating count is shown alongside — interpret thin samples
  with care).
- **Outcomes**: how ended conversations finished. Resolved (customer rated / agent closed /
  closed after confirmation) vs unresolved (in progress / ended without closure / **customer
  spoke last**). The **same definition** as the customer journey report and the dashboard —
  a conversation where the customer spoke last still had a question, so it never counts as
  resolved.
- **Satisfaction**: average rating·responses·response rate·1–5 distribution + **per-agent /
  per-session** tables (rating·agent filters).
- **Hours**: a weekday×hour grid (customer messages) — computed in **the tenant's
  timezone**, with a warning that UTC is used when no timezone is configured.

The Channels·Agents·Outcomes·Hours sections are computed directly from conversation logs,
so **history beyond the retention window is not queryable** (Question analytics and
Satisfaction persist as snapshots).

---

## 9. Dashboard
*(`/dashboard`)*

- 6 KPIs (each linking to its screen): conversations in progress · today's notifications ·
  AI resolution rate · unresolved Top N · total conversations · total orders.
- **AI resolution rate** = the share of ended conversations whose customer question was not
  left unresolved — the same definition as the statistics *Outcomes* section and the
  customer journey report. Conversation counts include only real customer conversations,
  **excluding AI-settings preview sessions**.
- **Popular questions** ranking, **integration status** (a badge per provider —
  Shopify·Cafe24·Odoo·Haravan·Klaviyo·Yotpo·Notion·Google Drive, etc.; "connected" means
  the **connection test passed**, not merely saved credentials, §14), **5 most recent
  orders**.

---

## 10. Customers·Orders·Products

### 10.1 Customers (`/customers`)
A list (name·email·**tier**·order count·total spend·signup date) + email search. The only
editable thing is the **tier change** (guest/subscriber/regular). Tiers are used to segment
customers in widget·AI responses.

### 10.2 Orders (`/orders`)
A read-only list of orders synced from the platform (order number·status·amount·item
count·date).

### 10.3 Products (`/products`)
Browse the synced product catalog (archived products included).
- KPIs: total·active·archived·**knowledge-registered count** (with last sync time).
- The **knowledge-registered badge** in the list is what matters — a product marked `none`
  **cannot be used by the AI in answers.** Check description·tags·SKU in the detail modal.
  Products with no description at all are not converted into knowledge (explicitly marked
  in the detail).
- The procedure to push products into knowledge (catalog sync):
  [Knowledge & AI Manual, Chapter 2.2](GUIDE-260824-Knowledge-AI-Manual.md).

---

## 11. Campaigns
*(`/campaigns` · operations)*

- Creation fields: name · **channel (email / sms / kakao)** · message · **link** (none /
  product handle / https URL — validity is checked at send time).
- Clicking **[Send]** in the list **sends immediately (no confirmation dialog)** — be
  careful.
- 🟡 Scheduled sending·audience builder UI are on the roadmap. The current flow is create →
  send immediately.

---

## 12. Reviews
*(`/reviews`)*

The management list of product reviews customers left in the widget (customer·order
item·stars·body·status). The only action is **hide ↔ unhide** — a hidden review **remains
visible to its author** (only store exposure is removed).

---

## 13. Knowledge & AI Settings

Knowledge registration (manual/catalog/CSV/external sources), validation (QA panel·conflict
review·gap proposals), AI settings (agents·persona·rules·scenarios·engines·moderation·
answer reuse), and the improvement loop (preview·coaching·regression checks) are all
organized in the **[Knowledge & AI Setup Manual](GUIDE-260824-Knowledge-AI-Manual.md)**.
For per-screen deep dives, see AI-SETTINGS-GUIDE.

The essentials:
- The AI answers **only from active knowledge documents**. Frequent handoffs mean missing
  knowledge.
- Knowledge follows the standard path of being drafted and reviewed on the **Smart
  Knowledge Board** (`/knowledge/board`) first, then **adopted** into the KB (with a
  pre-adoption simulation). Adding documents directly is for emergency fixes.
- Knowledge is organized by 3 groups (CounselInfo / ProductInfo / OperationInfo) ×
  categories, and a category's **agent scope** can limit it to specific AI agents.
- Bulk tools: **bulk download ↔ bulk import** (CSV/XLSX round trip), **AI import**
  (pdf·docx·xlsx·csv·md·YouTube captions → draft review → board publish).
- All outbound messages (AI·agent) pass moderation. On error, they are safely **blocked**.
- AI coaching·settings changes go through an **approval gate** — review proposals before
  applying.

## 14. Tenant Settings

`/settings` has been reorganized into **7 tabs** (formerly a single "Settings" screen).
Tabs are also menu-provisioning units — a tab the platform administrator does not provide
is invisible.

| Tab | Contents |
|---|---|
| Basic settings | **AI engines** (register the tenant's own engines — used ahead of platform engines; connection test·default selection; calls on your key are billed to your account) · **AI usage** (calls/tokens by period and axis, stub-fallback warnings — no cost estimates) · Storefront · **Agent handoff** (assignees·business hours·breaks·off-hours email/copy·SLA·policy-forced handoff) |
| Widget settings | Widget theme · tab layout · behaviour (display name·greetings — **6 language tabs**, with the shipped default copy shown) · Embed/SDK · store install guide |
| Platform integrations | Shopify · Cafe24 · WooCommerce · Odoo · Haravan tiles + the **[Integration guide]** button top-right (where to find each credential) |
| Marketing & helpdesk | Klaviyo · Yotpo · Gorgias |
| Messenger channels | Telegram · Viber · AmoebaTalk hub · btbz messenger relay · Gmail (Zalo·LINE·WhatsApp planned) |
| Other settings | Notification channels · menu access (master) · journey report criteria (master, §4.5) · stored integration credentials |
| Privacy notice | Policy URL · consent notice version (§15) |

- **Saved ≠ connected**: saving credentials sets the status to "untested". Only passing the
  **[Connection test]** flips it to "connected" ("error" on failure) — the dashboard's
  integration badges follow this status.
- Odoo·WooCommerce·Haravan pull data via **[Import products] / [Sync orders]** in their
  config modals (Cafe24 has its dedicated OAuth card; Shopify has [Sync now]+[Register
  webhooks]). For the AI to use imported products, the catalog sync in [Knowledge] is a
  separate step (§10.3).
- **Policy-forced handoff (deny-list)** rules carry one of two customer-facing modes:
  **No answer** (straight to an agent with no AI — the default) / **Answer, then hand
  off** (answer from knowledge first, then hand off) — either way an agent is called.
→ [Quick Setup Manual, Chapters 3–4](GUIDE-260824-Quick-Setup-Manual.md) ·
widget settings guide

---

## 15. Privacy Notice·My Page

- **Privacy notice** (a tab of [Tenant settings], `/settings/privacy` — the old
  `/privacy-notice` address redirects automatically; master/director): manages the policy
  URL and the **consent notice version**. ⚠️ **Bumping the version re-displays the consent
  banner to every customer** — bump only when the notice actually changes.
- **My page** (`/my-page`): profile (rank·labels·workspace), password change, MFA
  enroll/remove.

---

## 16. Platform Admin Console
*(`/admin/*` · system administrators)*

| Screen | Path | Purpose |
|---|---|---|
| Overview | `/admin` | Tenant count·integration status |
| Tenants | `/admin/tenants` | Create (name·slug·domain·plan) · **Plan/Add-ons** · **provided menus** · suspend/activate |
| Tenant users | `/admin/tenants/…/users` | Invite · **temporary password issuance (shown once·no email sent)** · MFA reset · suspend |
| AI engines | `/admin/ai-engines` | Register engines (provider·model·API key)·manage activation — tenants pick per function |
| Audit log | `/admin/audit` | Tracking privileged actions (temp password issuance·permission changes·PII views, etc.) |

- **Plan/Add-ons** modal: the plan (`starter`/`growth`/`enterprise`/`custom` — each plan
  presets the provided menus; per-menu overrides survive a plan change) + the **issue
  workflow add-on** (`base` off / `bridge` external-helpdesk link / `native` issue
  board·kanban on). In the list, a non-base mode shows as an "Issues: {mode}" badge in the
  plan column.

Full tenant-creation procedure: [Quick Setup Manual, Chapter 1](GUIDE-260824-Quick-Setup-Manual.md).

---

## 17. FAQ / Troubleshooting

**Q. The bot keeps handing off to agents.**
Missing knowledge is the most common cause. Find the cause via the ⚠ rows in statistics
(`/statistics`) and the knowledge QA panel, then reinforce the documents. Also check
whether the keyword matches the deny-list (policy-forced handoff) — a "No answer" rule
skips the AI intentionally, and an "Answer, then hand off" rule calls an agent even after
answering. The document's category may also carry an **agent scope** that hides that
knowledge from the current agent.

**Q. An agent's reply won't send.**
That is a moderation block. Rephrase and retry; if the rules are excessive, ask the master
to adjust them.

**Q. A conversation closed by itself.**
That is idle-conversation auto-wrap-up (30 min silence → notice → close, §4.4). When the
customer messages again, a new conversation starts.

**Q. I can't see the issue board.**
It is exclusive to tenants whose workflow mode is native — check that the platform
administrator's **Plan/Add-ons** setting says `native`. If the menu itself is missing,
check the provided menus/rank permissions (2-tier).

**Q. The settings screen looks different from older descriptions.**
Since 2026-08-24, `/settings` has been reorganized into **7 tabs** (Tenant settings, §14).
Agent handoff moved to the **Agent handoff** card on the *Basic settings* tab, and menu
access moved to the *Other settings* tab.

**Q. Dashboard/statistics numbers dropped compared to before.**
That can be normal — conversation counts now **exclude AI-settings preview sessions**, and
with the unified "resolved" definition, conversations where the customer spoke last no
longer count as resolved (§8·§9).

**Q. I changed widget settings but nothing changed.**
The widget reads new settings from the customer's **next session**. Close and reopen the
widget, or refresh.

**Q. A customer isn't receiving notifications (email, etc.).**
Check, in order: ① the channel is enabled in the console's notification channel policy
② the customer opted out of marketing (affects promotional messages only). A channel the
store disabled cannot be enabled by the customer.

**Q. I changed temperature but answers stayed the same.**
temperature is not applied to Anthropic (Claude) engines (the model rejects it, so it is
not sent). Only max_tokens is effective.

**Q. It works even though there is no AI key.**
Those are demo responses from the stub adapter. Be sure to register and assign a real
engine before production.

**Q. I hid a review but the customer still sees it.**
That is by design — hiding only removes store exposure; the review stays visible to its
author.

---

*Related documents: [Quick Setup Manual](GUIDE-260824-Quick-Setup-Manual.md) ·
[Knowledge & AI Setup Manual](GUIDE-260824-Knowledge-AI-Manual.md) ·
widget settings guide · AI-SETTINGS-GUIDE ·
mobile app integration guide (WebView·Android SDK) ·
service introduction · SPEC.md*

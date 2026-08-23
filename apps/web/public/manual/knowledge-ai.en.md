# ShopTalk Knowledge & AI Setup Manual — The Knowledge Pipeline and Customer-Response Operations

> Version 1.0 · 2026-08-24 · Written against the code
> Audience: tenant operators · CS staff (master/director recommended — AI settings are restricted to senior ranks)
> Online edition: https://shoptalk.amoeba.site/manual (HTML edition plus EN·VI translations)
> Legend: ✅ implemented / 🟡 in preparation·roadmap. Prerequisite: [Quick Setup Manual](quick-setup.en.md)
> ⚠ AI-translated draft pending native review. The Korean edition is authoritative.

Each chapter is structured as **terms → procedure → 💡 operating tips**.

---

## Table of Contents
0. [Understanding the AI Response Pipeline](#0-understanding-the-ai-response-pipeline)
1. [Understanding the Knowledge Structure](#1-understanding-the-knowledge-structure)
2. [Registering Knowledge](#2-registering-knowledge)
3. [Knowledge Validation & Quality Management](#3-knowledge-validation--quality-management)
4. [AI Settings](#4-ai-settings)
5. [Live Chat Customer-Response Settings](#5-live-chat-customer-response-settings)
6. [Validation & Improvement Loop](#6-validation--improvement-loop)
7. [Operations Checklist](#7-operations-checklist)
8. [FAQ / Troubleshooting](#8-faq--troubleshooting)

---

## 0. Understanding the AI Response Pipeline

This is the full flow one customer message goes through. Every setting in this document
adjusts some point in this flow.

```
Customer message
  │
  ▼
① Intent classification ── if orders/personal data are needed → identity-verification (login) prompt
  │
  ▼
② Knowledge search (RAG) ── find relevant evidence in the registered knowledge documents
  │
  ▼
③ Answer generation ──── compose the answer from persona·response rules + retrieved evidence, score confidence
  │
  ▼
④ Moderation ─── check the moderation rules (a failing answer is never shown to the customer)
  │
  ▼
⑤ Branch: confidence sufficient → answer the customer (+sources)
        low confidence / blocked / customer asked for an agent → agent queue (escalation)
```

- **The answer language** follows the customer's session language (en/es/ko/vi/ja/zh).
- Messages sent by agents also pass ④ moderation identically (non-bypassable).

---

## 1. Understanding the Knowledge Structure

**Terms**

| Term | Meaning |
|---|---|
| Knowledge document | One piece of text the AI uses as answer evidence. Consists of title, category, and body |
| Embedding | The indexing job that turns a document into a searchable vector. Performed automatically on create/update |
| RAG | The method of searching for documents related to the question and answering only from that evidence |
| Source | A connection that imports documents automatically from outside (board·Google Drive·Notion) |
| Group | Top-level document classification: **support** (policy·FAQ) / **product** (from the catalog) |
| Category | Sub-classification under a group (faq, policy, product, warranty, etc. — autocomplete presets provided) |
| Active/visible | Whether the document is included in search. **Inactive documents are never used as answer evidence** |
| Confidence | A score of how well the answer is supported by evidence. Low values hand off to an agent |

Layout of the knowledge screen (`/knowledge`): source & document management on the left, and
the **knowledge QA panel** and **conflict review** pinned on the right, so you can move
between registering and verifying on one screen.

---

## 2. Registering Knowledge

### 2.1 Manual document creation & editing

**Procedure**: documents card → **[Add document]** → enter `title` / `category` / `content`
→ save. Clicking a title opens the detail dialog; **[Edit]** manages the following:

| Field | Purpose |
|---|---|
| Source URL | Link to the external document the content is based on (opens directly from the list) |
| Effective date | The date the policy takes effect |
| Review interval (days) | When exceeded, a `stale` (needs review) badge appears in the list → §3.3 |
| Content | On save, the document is **automatically re-embedded** (search index refreshed) |

💡 **Tips**
- One document = one topic. Splitting "shipping+refund+exchange" into separate documents
  instead of one makes search more accurate.
- Include **customers' actual phrasing** ("how long does shipping take", "when do I get my
  refund") in titles and bodies. Search is similarity-based, so the closer to customer
  vocabulary, the better it hits.
- Instead of deleting outdated policies, **turn the visibility toggle off (inactive)** to
  exclude them from evidence. History is preserved and reverting is easy.

### 2.2 Product knowledge — catalog sync · CSV · usage guides

**Terms**

| Term | Meaning |
|---|---|
| Product cache | The raw product list synced from the platform (Cafe24, etc.) (the result of product sync on the Settings screen) |
| Catalog sync | The job that converts the product cache into product knowledge documents. Two stages: **preview → run** |
| Variant folding (merge) | Grouping dash-separated variants like "Lipstick-Red/Lipstick-Pink" into one representative product |
| Curation preserved | Keeping product documents hand-polished by operators from being overwritten by sync |
| Usage guide | A shared how-to document per product **type** (e.g. "How to use lip products") — serves as answer evidence separately from product documents |

**Procedure ① catalog sync**: documents card header → **[Sync from catalog]**
1. A **preview** runs first — it shows the scan count and expected results (created /
   updated / curation preserved / absorbed by merge / unchanged / held), the estimated
   embedding batches, and a sample list of merges.
2. In the merge samples, verify **that different products were not folded into one**, then **[Run]**.
3. Watch the two progress lines (writing / embedding), and after completion check the
   **embedding failure count** in the results table (failed items are not searchable and
   need a re-run).

**Procedure ② product CSV import**: **[Import product CSV]** → choose a file → check the
result statistics (parsed/created/updated/skipped/invalid/embedded) and per-row errors (up
to 20 shown). Uploading the same product again overwrites it (upsert).

**Procedure ③ usage guides**: the *usage guides* card shows written/unwritten badges per
product type. **[Write]** → save a title and body (20+ characters).

💡 **Tips**
- **Always look at the preview first.** A wrong merge (distinct product lines folded
  together) can only be caught in the preview, before running.
- When products change on the platform, run the **two stages in order** — product sync in
  [Settings] → catalog sync in [Knowledge] — for the change to reach the knowledge.
- For stores with thin product descriptions, tags become the raw material of knowledge —
  tidying product tags on the platform side raises answer quality.

### 2.3 External source integration (board · Google Drive · Notion)

**Terms**

| Term | Meaning |
|---|---|
| Service account | The robot account used for the Google Drive integration. The folder must be shared with this account's email to be readable |
| Integration | The unit by which Notion grants external tool access. Must be "connected" to the target page |
| Sync result counts | Created·updated·skipped·hidden counts. `dropped`/`truncated` is a **warning that part of the content could not be imported** |

**Procedure**
1. **Register credentials** (the two cards below the sources table):
   - Google Drive: paste the service-account key JSON → **share the target folder with the
     displayed service-account email** → [Test connection]
   - Notion: register the token (`ntn_…`) → in Notion, **connect the integration** to the
     target page/DB → [Test connection]
2. **[Add source]** → choose the type (board / gdrive / notion) → for gdrive enter the
   `folder ID`; for notion enter the `page·DB ID or a shared URL`
3. Run **↻ (sync)** on the source row → check the result counts in the *last sync* column

Supported types: board ✅ · Google Drive ✅ · Notion ✅ · repository appears in the dropdown
but is **unsupported** ("not ready" badge, sync disabled).

💡 **Tips**
- If a red **dropped/truncated** warning appears in the sync result, the page was too large
  or too deep and part of it was cut off. Open the document, check that its ending is
  intact, split the original, and sync again.
- If a sync suddenly imports **0 items** (folder unshared, integration disconnected, etc.),
  the existing documents are left as-is rather than hidden — restore the connection first.
- Clicking a source's status cell toggles active↔inactive. An inactive source only stops
  syncing; already-imported documents remain.

---

## 3. Knowledge Validation & Quality Management

**Terms**

| Term | Meaning |
|---|---|
| Knowledge QA panel | A test panel for asking the knowledge base questions as a customer would (pinned on the right) |
| Citation | The list of documents the answer is based on. Shown with similarity scores |
| Conflict | A state where two documents are detected as containing **mutually contradictory content** |
| stale | The badge on a document whose review interval has passed and needs re-checking |
| Knowledge gap | A topic customers asked about that the knowledge had no answer for — the system proposes it as a document draft |
| Answer proposal | A proposal to promote an agent's real answer into a knowledge document (human approval required) |
| Revision | A snapshot of a document's change history. Supports diff view and restore |

### 3.1 Knowledge QA panel — always verify after registering

**Procedure**: enter a question → check the answer + **confidence score** + **source list**
(similarity per document) → if an evidence document is wrong, press **[Fix]** next to the
source (that document opens directly in edit mode) → after fixing, re-check with
**[Ask again]**.

💡 **Tips**
- If the answer carries a **blocked by moderation** badge, it hit a moderation rule (§4.5) —
  a real customer would never have seen this answer.
- If a source carries a `conflicted`/`stale` badge, clean up that document first. Topics
  with low confidence usually mean the document is missing or far from customer vocabulary.
- Whenever a policy changes, throwing "3 questions a customer would ask" at the QA panel is
  the cheapest regression test there is (for automation, see §6.3 golden questions).

### 3.2 Conflict review

**Procedure**: right-hand *conflict review* panel → status filter (pending/resolved/
dismissed/failed) → per item, check the two documents' similarity, detection time, and the
verdict rationale → choose an action:

| Action | Behavior |
|---|---|
| Keep A / Keep B | Keep the chosen one and deactivate the other |
| Keep both | Judged not a contradiction — both stay active |
| Dismiss | Close this conflict item |
| Re-judge | Request a new verdict after fixing the documents |

**[Re-scan]** re-checks all documents.

💡 **Tip**: Conflicts usually come from **not retiring the old version when a policy is
revised**. Don't stop at "Keep A" — record the revision date (effective date) on the
surviving document so the same thing doesn't repeat at the next revision.

### 3.3 Review interval · stale management / change history

- Setting a `review interval (days)` in the document editor puts a `stale` badge on the list
  when the deadline passes. Pressing **[Mark reviewed]** in the review-status box of the
  document detail recalculates the deadline.
- In the detail dialog's **change history tab**, you can view per-revision diffs and
  **[Restore]**.

💡 **Tip**: Give frequently changing documents (shipping fees, promotions) a short review
interval of around 30 days and stable ones (legal notices) a long one, and the stale badges
become a practical to-do list.

### 3.4 Knowledge gap proposals inbox · answer proposal approval (closed loop)

- **Knowledge gap proposals** (top of the screen, shown only when there are items): topics
  from customer questions where the knowledge was empty accumulate as document drafts.
  **[Accept]** (confirm after editing title·content) or **[Dismiss]**.
- **Answer proposals** (shown when items are pending): proposals to promote an agent's real
  answer into knowledge. Check the question, answer, and source-conversation link, then
  **[Approve]** or **[Reject]** (reason required).

💡 **Tip**: These two are the channels through which the knowledge grows on its own. Making
a weekly routine of emptying them reduces the root cause of "the AI keeps handing off to
agents". Before approving, always check **that no personal data (order numbers·names)
remains in the answer** — knowledge documents are reused as evidence for every customer's
answers.

---

## 4. AI Settings
*(left menu **[AI settings]** — access: master/director)*

**Terms**

| Term | Meaning |
|---|---|
| AI agent | A bot unit with its own persona·rule set. You can create several and run different bots per channel/page |
| Default agent | The agent used by widgets with no specific assignment (always active) |
| Entry snippet | An installation code fragment that launches the widget with a specific agent |
| Persona / response rules | The bot's tone·principles description / the list of rules it must obey (injected at pipeline ③ in §0) |
| Scenario buttons | The quick-menu buttons at the bottom of the widget. Choose among 7 actions |
| AI function | The 5 places AI is used (chat/rag/summary/assist/moderation) — an engine is assigned per place |
| Moderation rules | The rules that inspect outbound messages (pipeline ④ in §0) |
| Answer reuse | Replaying an approved past answer for the same question without an LLM call |
| Change note | A one-line note recorded when saving persona·rules — viewable in the settings change history |

### 4.1 AI agents (multi-persona)

**Procedure**: selecting an agent in the *AI agents* card switches the persona·response
rules cards below to **that agent's**. Use **[Add]** to create a new agent with a name and
code (lowercase), and manage **[Set as default]** / the active toggle / **[Delete]**. Copy
each agent's **entry snippet** and install it on a specific page/channel so that bot
responds there.

💡 **Tips**
- An agent is **assigned once at session start** — swapping snippets mid-conversation does
  not change the bot of a session already in progress.
- Entering with a non-existent code falls back to the default agent, so the widget never
  breaks.
- The "AI agents" here have nothing to do with (human) agent accounts. Human accounts live
  in the [Users] menu.

### 4.2 Persona & response rules

**Procedure**: write the persona text → enter a **change note** → save. Response rules are
added one line at a time via [Add rule] (blank lines are removed on save).

💡 **Tips**
- Put identity·tone in the persona ("friendly, concise, polite") and **behavioral
  constraints** in the rules ("never state that a refund is complete") — the split keeps
  things manageable. Factual information (shipping fees, etc.) belongs in **knowledge
  documents**, not here — the persona is not searched.
- After saving, propagation can take up to 60 seconds because of caching.
- In the *change history* card you can open a past revision and **[Load into editor]**, but
  loading alone does not apply it — **you must also save** for it to take effect.

### 4.3 Scenario buttons

**Procedure**: per row, edit the `label` (max 60 chars) / `action` / `enabled` checkbox /
order (↑↓). The 7 actions:

| Action | Actual behavior in the widget |
|---|---|
| Track shipping | Fixed shipping-policy answer + follow-up buttons |
| Cancel/refund | Fixed cancellation·refund·return answer + follow-up buttons |
| Product help | Submenu (usage·ingredients·restock, etc.) |
| Contact support | Leave-your-contact form — the path to an agent |
| My orders | Identity verification, then jumps to the orders tab |
| Partnership | Partnership info card |
| Send message | **Sends the label text verbatim as the question** → the AI answers from knowledge |

Pressing **[Edit reply]** lets you edit each action's response copy across **6 language
tabs** (dots mark which are written) and configure follow-up buttons (label·action·URL).

💡 **Tips**
- To turn a frequent question into a button, use the **Send message** action with the label
  written as the question sentence (e.g. "What is the free-shipping threshold?").
- Rather than deleting a button, hide it by unchecking `enabled` — re-enabling is easy.
  Keeping **Contact support** always on is recommended — customers who can't find an agent
  leave.
- Keep the fixed answer copy and the policy content of knowledge documents **from drifting
  apart** — update both together when a policy is revised.

### 4.4 AI functions (engine·parameters)

**Procedure**: on each function's row, choose the applied engine, enter `temperature` (0–1)
and `max_tokens`, and save individually. Unassigned functions show an
`inherited/default/stub` badge plus the actually applied engine name.

What the 5 functions do:

| Function | Actual use |
|---|---|
| chat | Conversation control such as intent classification of customer messages |
| rag | **Knowledge-based answer generation — the body of what customers see** |
| summary | Conversation summaries (history·handoff briefing) |
| assist | AI assistance in the agent console |
| moderation | LLM verdicts for context-type moderation rules |

**Fallback chain**: chosen engine unavailable → tenant default → platform default →
**stub** (demo responses) — automatic downgrade, so the conversation never breaks.

💡 **Tips**
- **max_tokens** is the answer-length ceiling — 512–1024 is plenty for chat answers.
- ⚠️ **temperature is not applied to Anthropic (Claude) engines.** Current Claude models
  reject the sampling parameter, so the system deliberately does not send it. Entering a
  value is ignored; it applies only to OpenAI-family engines.
- A lingering `stub` badge means you are not at production quality — engine registration is
  a platform-administrator permission (`/admin/ai-engines`).
- The embedding model for knowledge search is not on this screen — it is managed
  server-side, shared across all tenants.

### 4.5 Moderation rules

**Procedure**: **[Add rule]** → choose type/scope/action:

| Item | Choices | Meaning |
|---|---|---|
| Type | Word / phrase | Containment match (case-insensitive) |
| | Regex | Pattern match (e.g. `\bsurgery\b`) |
| | Context (LLM) | Write "what to block" as a sentence and the AI judges each message |
| Scope | AI only / agents only / both | Whose outbound messages to inspect |
| Action | Block | Do not send the message (an AI answer converts into an agent handoff) |
| | Mask | Only the matched part becomes ▇▇▇, then delivered |
| | Rewrite | The AI rewrites it into a safe sentence, then delivers |

💡 **Tips**
- This gate **cannot be turned off**, and if the check itself fails it resolves to **block**
  for safety. If an agent message is refused (block notice), rephrase and send again.
- The context (LLM) type uses the moderation function's engine — in stub state there is no
  verdict quality, so connect a real engine before using it.
- Excessive word rules block legitimate answers too. Start with **mask/rewrite**, watch the
  logs, then escalate to block — that order is recommended. Rule propagation takes up to 60
  seconds.

### 4.6 Answer reuse

**Procedure**: in the *answer reuse* card, search the stored Q&As (filter to active only),
edit/delete per item, and stop everything at once with **[Deactivate all]** (after
confirmation).

💡 **Tip**: A reused answer goes out instantly for the same question without an LLM call —
fast and cheap — but **when a policy changes, a stale answer can go out unchanged.** Put
"search and update/deactivate the related items" on your policy-revision checklist. Reused
answers still pass moderation.

---

## 5. Live Chat Customer-Response Settings
*(the *Agent handoff* section of the **[Settings]** page — relocated here from the AI settings screen)*

**Terms**

| Term | Meaning |
|---|---|
| Escalation (handoff) | The AI passing a conversation to the agent queue |
| Handoff settings | The bundle of settings for assignment·hours·notices after escalation |
| Business hours | The window when agents respond. Outside it, the flow switches to off-hours notice·email intake |
| SLA | Response target time. The standard by which the live chat console judges delays |
| Waiting (queue) | The state of a handed-off conversation waiting for an agent to take it |

### 5.1 Assignees · business hours · off-hours notice

**Procedure**: in the *Agent handoff* section
1. **Assignees** — check the agents who receive handoffs
2. **Business hours** toggle → timezone·start/end times·weekdays, plus a **break time**
   toggle if needed
3. **Off-hours intake email** — the address that receives inquiries outside business hours
   (a warning shows if SMTP is not configured)
4. **Off-hours notice copy** — written per language tab
5. **SLA** — normal/urgent response targets (hours, 1–168h) — the basis of the issue
   board's ⚠️/🔥 delay badges
6. **Policy-forced handoff (deny-list)** — register keyword (comma-separated) + inquiry
   type + duty-label rules. A matched message is delivered **straight to an agent without
   passing through the AI**, and the created issue gets the type·label stamped automatically

💡 **Tips**
- Set the business-hours **timezone** precisely to the store's — a US store left on Korean
  time sends the notices exactly backwards.
- Off-hours email intake requires server SMTP configuration first. If you see the warning,
  ask the platform administrator.
- If no assignee is designated, handed-off conversations only pile up in the shared queue.
  Designate at least one.

### 5.2 Understanding escalation triggers

When the AI hands off to an agent:

| Trigger | Behavior |
|---|---|
| **Low confidence** | Appends "Shall I connect you to an agent?" to the answer and queues it |
| **Blocked by moderation** | The AI answer is withheld; an agent-connection notice is shown, then queued |
| **Customer request** | The scenario's *Contact support* or an explicit request → queued immediately |
| **Policy-forced handoff (deny-list)** | A message matching the registered keywords goes to the queue **immediately, with no AI response** — the message is stored·displayed normally, and the issue is stamped with type·label (this is not a message-blocking feature) |

💡 **Tips**
- The confidence threshold is not adjustable on screen (code policy) — if handoffs are
  frequent, the right response is **reinforcing the knowledge**, not the threshold (find
  the cause with the QA panel, §3.1).
- Handling handed-off conversations (accepting·AI briefing·closing·reassignment) happens
  in the live chat console (`/live-chat`) — see the live chat chapter of the integrated
  manual.

---

## 6. Validation & Improvement Loop
*(the studio on the right of **[AI settings]** + the regression check card)*

**Terms**

| Term | Meaning |
|---|---|
| Preview | A test panel for chatting with the bot without creating a real customer session |
| AI coaching | Give natural-language feedback like "make it answer this way" and receive a **proposed** settings change, applied only on approval |
| Proposal | The settings-change card coaching produced. Can be applied/rejected/reverted |
| Golden questions | The list of representative questions whose answer quality you want to keep checking (regression-test input) |
| Regression check | Re-running all golden questions after settings/knowledge changes to confirm answers did not degrade |
| Variability measurement | Running the same question repeatedly to see how much the answer fluctuates |

### 6.1 Preview

**Procedure**: studio's **Preview** tab → choose a language → **[New session]** → choose the
mode (customer/agent) and type messages. Responses display the responsible **agent badge**
and **whether escalation occurred**. Pressing **[Coach this]** on a response attaches that
conversation turn to coaching.

💡 **Tip**: After changing settings, save and then start with **[New session]** to see a
conversation with the new settings applied. Check your key questions across languages —
the answer language follows the session language.

### 6.2 AI coaching

**Procedure**: **Agent coaching** tab → pick a thread or [New thread] → review the reference
turns attached from the preview and give instructions in natural language (e.g. "The refund
explanation is too long. Keep it under 3 sentences") → review the changes in the generated
**proposal card** → **[Apply]** / **[Reject]** / after applying, **[Revert]**.

💡 **Tips**
- Coaching **changes nothing without approval.** Read the actual changes in the proposal
  card (persona·rules diff) before applying.
- **Factual information** like "free shipping over ₩50,000" belongs in a knowledge
  document, not in coaching — coaching is a tool for polishing tone and behavioral rules.
- Slight wording drift is normal variation. **Falling confidence·rising escalations** are
  the real warning signs.

### 6.3 Regression check (golden questions)

**Procedure**: *regression check* card → register golden questions (10–20 representative
ones) → **[Run now]** → in the recent-runs list, **[Compare with previous]** to see answer
changes side by side. **[Variability measurement]** shows how much the same question's
answer fluctuates.

💡 **Tips**
- Put into the golden questions: ① questions tied directly to revenue (shipping·refunds)
  ② questions that produced wrong answers in the past ③ questions affected by policy
  revisions.
- Make it an operating routine to run once **right after bulk knowledge changes, catalog
  sync, or persona revisions**. A `truncated` badge on a run means the question count
  exceeded the run ceiling and only part was executed.

---

## 7. Operations Checklist

**When a policy changes** (e.g. shipping-fee revision)
- [ ] Update the related knowledge documents (re-embedding is automatic) + deactivate old versions
- [ ] Check the scenario fixed answers (track shipping·cancel/refund) copy
- [ ] Search answer-reuse items → fix/deactivate stale answers
- [ ] Verify 3 representative questions in the QA panel → run the golden-question regression
- [ ] Update the documents' effective date·review interval

**Weekly routine**
- [ ] Empty the knowledge gap proposals inbox·answer proposals (§3.4)
- [ ] Process pending conflict-review items (§3.2)
- [ ] Review `stale`-badged documents (§3.3)
- [ ] Topics with frequent handoffs in live chat → reinforce the knowledge

---

## 8. FAQ / Troubleshooting

**Q. I registered a document but the AI doesn't know its content.**
Check ① the document is active (visibility ON) ② the document appears in the QA panel's
source list. If it doesn't, reinforce the title/body with customer vocabulary. Also check
whether the catalog sync result reported embedding failures.

**Q. The AI keeps handing off to agents.**
Check the question's confidence and sources in the QA panel. If there is no evidence
document, registering one is the answer; if there is one but confidence is low, split the
document and reinforce the vocabulary.

**Q. An agent's message is refused on send.**
That is a moderation block. Rephrase the expression that hit a moderation rule (§4.5) and
send again. If the rules are excessive, ask the master to soften the action (block→mask).

**Q. Answers come out only in English.**
The answer language follows **the customer's session language**. Verify by setting the
language in the preview. Writing the persona in Korean is unrelated to the answer language.

**Q. Google Drive/Notion sync imports 0 items.**
Most often the folder share (service-account email) or the Notion integration connection is
broken. Start over from [Test connection] on the credentials card.

**Q. I applied a coaching proposal and answers got worse.**
Recover with **[Revert]** on that proposal card; you can also open the previous revision in
*change history*, load it into the editor, and save.

**Q. The same question gets slightly different answers each time.**
That is normal LLM variation (check the spread with §6.3 [Variability measurement]). If the
**content** — not the wording — differs, suspect a knowledge conflict (§3.2). Note that
adjusting temperature has no effect on Anthropic engines (§4.4).

---

*Prerequisite: [Quick Setup Manual](quick-setup.en.md) · full screen reference:
[User Manual (integrated)](user-manual.en.md) · AI settings deep dive:
AI-SETTINGS-GUIDE · widget: widget settings guide*

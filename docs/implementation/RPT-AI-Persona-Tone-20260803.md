# RPT — AI Persona & Tone Improvement (2026-08-03)

## Background

Staging widget reply to "신규회원 쿠폰은 어떤 종류가 있나요?" surfaced the raw stub
template including the internal `[policy_promotion]` label:

> Based on our help center: - [policy_promotion] 2.7.1 신규회원 쿠폰: … (If this
> doesn't fully answer your question, I can connect you with a support agent.)

Root cause of the *format*: that string is the **stub adapter's hardcoded
template** (`stub.adapter.ts`), i.e. the turn was served by the stub — either
the tenant's RAG engine routing points at `stub`, or the Anthropic call failed
and the gateway degraded (`ai-gateway.service.ts` logs
`Adapter anthropic failed, falling back to stub`). Independent of that, the
default persona was a single bland sentence with no tone guidance.

User approved three changes (2026-08-03): richer default persona, softer
insufficient-info wording, sentence-form stub fallback without internal labels.

## What changed

| File | Change |
|---|---|
| `apps/api/src/domain/ai-engine/ai-config.service.ts` | `DEFAULT_PERSONA` replaced with a full customer-care agent persona: warm human-agent tone, rewrite KB content in own words, never expose internal labels/doc structure, match customer language & formality (Korean 존댓말). Used by tenants without a console AI config and by `seed.runner.ts`. |
| `apps/api/src/domain/chat/rag.service.ts` | Insufficient-info instruction now "apologize briefly and offer to connect a human agent" (was the curt "say you'll connect a human agent"). |
| `apps/api/src/infrastructure/external/ai/adapters/stub.adapter.ts` | Grounded fallback is sentence-form ("Here's what I found for you: …") and strips the leading `- [category]` list marker/label so internal doc structure never reaches customers even in stub degradation. |

No schema changes (no `sql/` or `*.entity.ts` diff) — no migration required.

## Tests

- `tsc --noEmit` clean (apps/api)
- API unit tests: **35 suites / 342 tests passed**

## Deploy state

- PR **#70** (squash-merged to `main`): commit `6be53d6`
- Staging (`shoptalk.amoeba.site`): **API container deployed 2026-08-03**
  (`docker compose … up -d --build api`, env-file preserved). Full
  `deploy-staging.sh` FAILED at the widget image build — pre-existing `main`
  regression, see follow-up 2.
- Production: N/A (not yet provisioned)

### Staging verification (2026-08-03)

- Boot log: `Nest application successfully started`; container `Up (healthy)`;
  `/api/v1/health` → `{"status":"ok"}`.
- Live test (`POST /chat/message`, tenant ivyusa, "신규회원 쿠폰은 어떤 종류가
  있나요?"): reply uses the NEW stub sentence form, internal
  `[policy_promotion]` label no longer exposed → code change confirmed live.
- **Root cause of stub replies found**: tenant 1 RAG correctly routes to the
  Anthropic engine (`tenant_ai_settings.rag → engine 2`, key present), but the
  call fails with **HTTP 400 "Your credit balance is too low to access the
  Anthropic API"** and the gateway degrades to stub. The persona/tone prompt
  takes real effect only after credits are restored.
- Console persona: tenant 1 (ivyusa) already carries the new customer-care
  persona (entered via `/ai-setting` on 2026-08-03); tenant 2 (annehearts) has
  a Korean persona but **no `tenant_ai_settings` rows → falls to the default
  engine, which is the stub (`ai_engines.is_default=1`)**.

## Remaining / follow-ups

1. **Anthropic credits exhausted (BLOCKER for real AI answers)** — top up the
   Anthropic account (or register a funded key in the platform console). Until
   then every AI turn on staging is served by the stub.
2. **`main` widget build regression (BLOCKER for full staging deploy)** —
   `apps/widget` fails `tsc` on `main` since PR #56 (squash clobbered GA4
   `analytics` imports and consent-banner store fields: `AuthGate.tsx`,
   `ChatTab.tsx`, `OrderDetail.tsx`, `PreferencesPanel.tsx`).
   `deploy-staging.sh` therefore fails at the widget image; this deploy shipped
   the API container only. Needs its own FIX (restore the #20/consent-side
   code) before any widget/web redeploy.
3. **Tenant 2 (annehearts) engine routing** — add `tenant_ai_settings` rows (or
   flip the default engine once credits exist) so it stops using the stub.

## Prevention pattern

Fallback/stub strings are customer-visible: any template that echoes internal
context (categories, doc titles, section numbers) must strip internal structure
before display.

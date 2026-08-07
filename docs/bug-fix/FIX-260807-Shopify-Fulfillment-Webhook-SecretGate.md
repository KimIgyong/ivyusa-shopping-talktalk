# FIX-260807 — Shopify fulfillment webhooks rejected by the generic secret gate

## Summary
Shopify `fulfillments/create` and `fulfillments/update` webhooks were returning **401
E1004 (FORBIDDEN)** on every delivery and being retried indefinitely by Shopify, while
`orders/create`/`orders/updated` succeeded (201). Order **status** still synced (via
`orders/updated`, which fires on the same fulfillment event), so the impact was limited to
the tracking number/carrier carried only by the fulfillment webhook — but Shopify
auto-removes a subscription after ~19 consecutive failures (~48h), which would have
silently dropped the fulfillment subscriptions.

## Root cause (not symptom)
The 401 was **not** an HMAC failure. Verified on staging by injecting a temporary debug
log into `verifyShopifyHmac`: the computed digest matched the `X-Shopify-Hmac-Sha256`
header (`matchRaw=true`) — the request passed HMAC verification. The 401 was thrown
*after* verification, inside the handler.

`ShopifyWebhookService.handleFulfillment` delegated to
`OrderService.handleFulfillmentWebhook(orderId, status, tracking, carrier)`. That method is
**shared** with the generic ShopTalk fulfillment-provider route
(`POST /webhooks/fulfillment`), and internally enforces a second authentication:

```ts
const expected = await this.webhookSecretService.resolve(INTEGRATION_PROVIDER.FULFILLMENT, order.tenantId);
assertWebhookSecret(providedSecret, expected);
```

The Shopify path is already HMAC-verified in `ShopifyOrderWebhookController`, so it passed
**no** `providedSecret`. Tenant 1 has no `fulfillment` integration credential, so `expected`
was empty, and `assertWebhookSecret` **fail-closes with FORBIDDEN** when no secret is
configured (correct for the generic route, wrong for the already-authenticated Shopify one).

So the Shopify fulfillment path could never pass — it was gated on a secret that (a) it
should not be subject to and (b) is not configured for the tenant.

## Fix (minimal)
Separate authentication from application in `OrderService`:

- New `applyFulfillment(order, status, trackingNumber?, carrier?)` — the fulfillment upsert
  + status sync + events/notification, **with no secret assertion**. Caller owns auth.
- `handleFulfillmentWebhook(...)` keeps the per-tenant `X-Webhook-Secret` assertion for the
  generic route, then delegates to `applyFulfillment`.
- `ShopifyWebhookService.handleFulfillment` now calls `applyFulfillment(order, ...)`
  directly (it already fetched the order and the request is HMAC-verified upstream).

No behavior change for the generic `/webhooks/fulfillment` route; the Shopify path now
skips the gate that never applied to it.

## Files
- `apps/api/src/domain/order/order.service.ts` — split out `applyFulfillment`.
- `apps/api/src/domain/order/shopify-webhook.service.ts` — call `applyFulfillment`.
- `apps/api/src/domain/order/shopify-webhook.service.spec.ts` — assert the Shopify path
  calls `applyFulfillment` and never the secret-gated `handleFulfillmentWebhook`.

## Tests
- `npx tsc -p apps/api/tsconfig.json --noEmit` — clean (pre-existing unrelated `web-push`
  local-dep miss aside).
- `jest src/domain/order` — 37 passed (5 suites).

## Deploy state
- PR: #TBD · SHA: TBD
- Staging (`shoptalk.amoeba.site`): TBD — no schema change (no migration).
- Post-deploy verify: re-fulfill a dev-store order → `fulfillments/create -> 201` in the
  API log; confirm tracking#/carrier persists and the shipping notification fires.

## Prevention pattern
A shared service method must not couple **authentication** to **application logic**. When a
second caller reaches the same mutation through a *different* trust boundary (here: HMAC vs
a shared per-tenant secret), split the auth check into the entry points and keep a single
auth-free `apply*` core. Grep for other multi-caller `*Webhook*` service methods that assert
a secret and confirm every caller can actually satisfy it.

# GA4 Analytics & Conversion Tracking — Integration Guide

The widget ships a consent-aware GA4 wrapper that tracks the full support →
conversion funnel and attributes every event to a precise traffic source
(segmented UTM + GA4-style channel grouping). This guide covers how to turn it
on, what it measures, and how the payment-conversion event is wired.

## 1. Turn it on

Two ways to supply the GA4 measurement ID (`G-XXXXXXXXXX`):

- **Per build** — `VITE_GA4_MEASUREMENT_ID` in the widget env (`apps/widget/.env`).
- **Per store** (multi-tenant) — pass it through the embed loader:

```html
<script>
  window.IVY_WIDGET_CONFIG = {
    shop: "your-store.myshopify.com",
    locale: "en",
    widgetUrl: "https://widget.ivyusa.app",
    ga4Id: "G-XXXXXXXXXX"        // ← per-store GA4 property
  };
</script>
<script src="https://widget.ivyusa.app/embed.js" defer></script>
```

`embed.js` forwards `ga4Id` to the widget on the iframe URL (`?ga4=`). With no ID
configured, **analytics is a complete no-op** — the widget behaves exactly as
before (dev/tests unaffected).

## 2. Consent (privacy-first)

GA4 runs under **Consent Mode v2**. `analytics_storage` defaults to **denied**
and only flips to **granted** when the visitor accepts the widget's privacy
notice (the same CCPA consent that gates chat persistence). Until then no
identifiable data is sent; events raised pre-consent are queued and flushed on
grant. The consent notice text (en/es/ko) discloses Google Analytics use.

> If a Content-Security-Policy is later added to the widget nginx, allowlist
> `https://www.googletagmanager.com` and `https://www.google-analytics.com`.

## 3. What it measures — the funnel

Every event carries the resolved traffic source (below), so each stage is
segmentable by channel/campaign.

| Stage (`funnel_stage`) | Event(s) | Fired when |
|---|---|---|
| `awareness` | `widget_view` | widget mounts on the page |
| `engagement` | `widget_open` | support panel opened |
| `consideration` | `chat_start`, `chat_message_sent`, `chat_scenario_click`, `search` (order lookup), `view_item` (order opened) | customer chats / browses orders |
| `intent` | `begin_checkout` | re-order / checkout CTA |
| `purchase` | **`purchase`** | payment completed (key event) |

Other events: `widget_close`, `widget_tab_view`, `chat_escalate`,
`order_tracking_view`.

## 4. Payment conversion — `purchase`

`purchase` is the GA4 key event used to compute **payment conversion rate**. It
carries `transaction_id`, `value`, `currency`, and `items`, and is deduped per
transaction within the session. Two ways it fires:

1. **Automatic (Shopify)** — on the order-status / thank-you page, `embed.js`
   reads `window.Shopify.checkout` and posts `ivy:purchase` to the widget, which
   fires the GA4 event with the same client_id + UTM attribution as the rest of
   the journey.
2. **Manual** — from any storefront page that computes the order itself:

```js
window.IvyWidget.trackPurchase({
  transaction_id: "1001",
  value: 129.90,
  currency: "USD",
  items: [{ item_id: "42", item_name: "Serum", quantity: 2, price: 49.95 }],
});
```

Because the conversion shares the widget's client_id and UTM attribution, GA4
reports **conversion rate segmented by traffic source** — the accurate
source-of-truth the store wants.

## 5. Traffic-source segmentation (UTM)

`embed.js` captures the storefront's `utm_*` params + `document.referrer` +
landing URL (the widget iframe can't see the parent URL) and forwards them. The
widget then:

- Parses `utm_source/medium/campaign/term/content`.
- Derives a **GA4 default channel grouping** — `Paid Search`, `Organic Search`,
  `Paid Social`, `Organic Social`, `Email`, `Referral`, `Shopping`, `Direct` —
  from source + medium + referrer, so reports don't fragment across inconsistent
  tagging.
- Persists **first-touch** (whole session) and **last-touch** (refreshed on each
  tagged visit; a bare reload never clobbers a prior campaign) to
  `sessionStorage`, and attaches both to every event as params
  (`traffic_channel`, `first_touch_channel`, `utm_*`, `landing_page`, …).

## 6. Recommended GA4 setup

- Mark `purchase` as a **key event** (Admin → Events).
- Build an **exploration funnel** on `funnel_stage` (awareness → … → purchase)
  and break it down by `traffic_channel` / `utm_campaign`.
- For conversion rate by source, use the `session_source` dimension alongside
  the custom `traffic_channel` parameter.

## 7. Code map

`apps/widget/src/lib/analytics/` — `events.ts` (vocabulary + funnel), `utm.ts`
(capture + channel grouping + attribution), `ga4.ts` (gtag loader + consent mode
+ queue), `Ga4Provider.tsx` + `useAnalytics()` (typed API), `index.ts` (barrel).
Wiring: `App.tsx` (provider), `Widget.tsx` (view/open/close + purchase bridge),
`ChatTab.tsx` (chat/scenario/escalate), `OrderDetail.tsx` (view/tracking),
`AuthGate.tsx` (order lookup). Storefront: `apps/widget/public/embed.js`.

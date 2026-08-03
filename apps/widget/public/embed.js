/**
 * IVY USA TalkTalk — storefront embed loader (vanilla, dependency-free).
 *
 * Injects a floating <iframe> that hosts the widget in isolation from the store
 * theme. The iframe URL carries ?shop (tenant resolution) and ?locale; the widget
 * posts `ivy:resize` messages so this loader can grow/shrink the frame.
 *
 * Analytics (GA4): this loader captures the storefront's UTM params + referrer +
 * landing page and forwards them on the iframe URL, so the widget's GA4 wrapper
 * can attribute the support/conversion journey to a precise traffic source. On
 * the Shopify order-status ("thank you") page it detects the completed order and
 * posts `ivy:purchase` to the widget, firing the GA4 payment-conversion event.
 * `window.IvyWidget.trackPurchase({...})` reports a conversion manually.
 *
 * Usage (Shopify theme / app-embed block):
 *   <script>window.IVY_WIDGET_CONFIG = {
 *     shop: "your-store.myshopify.com", locale: "en",
 *     widgetUrl: "https://widget.ivyusa.app",
 *     ga4Id: "G-XXXXXXXXXX" };</script>
 *   <script src="https://widget.ivyusa.app/embed.js" defer></script>
 */
(function () {
  if (document.getElementById('ivy-talktalk-frame')) return; // idempotent

  var cfg = window.IVY_WIDGET_CONFIG || {};
  var shop = cfg.shop || (window.Shopify && window.Shopify.shop) || '';
  var base = String(cfg.widgetUrl || 'https://widget.ivyusa.app').replace(/\/+$/, '');
  // Origin only (scheme+host+port) — `base` may carry a sub-path (e.g. /widget),
  // but postMessage e.origin never includes a path, so compare against the origin.
  var baseOrigin = (function () {
    try {
      return new URL(base, window.location.href).origin;
    } catch (_) {
      return base;
    }
  })();
  var locale = String(cfg.locale || document.documentElement.lang || 'en').slice(0, 2);

  // ---- Traffic-source capture (UTM + referrer + landing) ---------------------
  // Read from the STORE page URL (the widget iframe can't see it) and forward on
  // the iframe src so the widget attributes analytics to the real source.
  function captureAttribution() {
    var out = [];
    try {
      var qs = new URLSearchParams(window.location.search);
      var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      for (var i = 0; i < keys.length; i++) {
        var v = qs.get(keys[i]);
        if (v) out.push(keys[i] + '=' + encodeURIComponent(v.slice(0, 200)));
      }
      if (document.referrer) out.push('ivy_ref=' + encodeURIComponent(document.referrer.slice(0, 300)));
      out.push('ivy_land=' + encodeURIComponent(String(window.location.href).slice(0, 300)));
    } catch (_) {
      /* URL API unavailable — attribution is best-effort */
    }
    return out.join('&');
  }
  var attribution = captureAttribution();
  var ga4Id = cfg.ga4Id && /^G-[A-Z0-9]+$/i.test(cfg.ga4Id) ? cfg.ga4Id : '';

  // Shopify App Proxy subpath on the store (Partner dashboard → App setup → App
  // proxy). A storefront-relative fetch to it is signed by Shopify and carries a
  // verified logged_in_customer_id, letting the backend hand us a customer-bound
  // session token. Override with IVY_WIDGET_CONFIG.proxyPath if you use another.
  var proxyBase = String(cfg.proxyPath || '/apps/ivy').replace(/\/+$/, '');
  var identity = null; // resolved { authenticated, sessionToken } from the proxy
  var widgetReady = false; // set once the widget iframe posts ivy:ready

  var CLOSED = { w: '96px', h: '96px' };
  var OPEN = { w: 'min(420px, 100vw)', h: 'min(680px, 100vh)' };

  var frame = document.createElement('iframe');
  frame.id = 'ivy-talktalk-frame';
  frame.title = 'IVY USA Support';
  frame.setAttribute('allow', 'clipboard-write');
  frame.setAttribute('allowtransparency', 'true');
  // FE-L1: sandbox the widget iframe — grant only what it needs (its own
  // scripts, same-origin storage for the session, forms, popups for auth).
  frame.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
  );
  frame.src =
    base +
    '/?embed=1&shop=' +
    encodeURIComponent(shop) +
    '&locale=' +
    encodeURIComponent(locale) +
    (ga4Id ? '&ga4=' + encodeURIComponent(ga4Id) : '') +
    (attribution ? '&' + attribution : '');

  var s = frame.style;
  s.position = 'fixed';
  s.bottom = '0';
  s.right = '0';
  s.width = CLOSED.w;
  s.height = CLOSED.h;
  s.border = '0';
  s.background = 'transparent';
  s.colorScheme = 'normal';
  s.zIndex = '2147483000';
  s.transition = 'width .2s ease, height .2s ease';

  function mount() {
    document.body.appendChild(frame);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // Hand the widget its customer-bound session token, but only once both sides
  // are ready: the proxy has answered AND the widget has posted ivy:ready.
  function maybeSendIdentity() {
    if (
      widgetReady &&
      identity &&
      identity.authenticated &&
      identity.sessionToken &&
      frame.contentWindow
    ) {
      frame.contentWindow.postMessage(
        { type: 'ivy:session', token: identity.sessionToken },
        base,
      );
    }
  }

  // ---- Payment-conversion bridge --------------------------------------------
  var pendingPurchase = null; // held until the widget iframe is ready

  function postPurchase(tx) {
    if (!tx || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      {
        type: 'ivy:purchase',
        transaction_id: tx.transaction_id,
        value: tx.value,
        currency: tx.currency,
        items: tx.items,
      },
      base,
    );
  }

  function reportPurchase(tx) {
    if (!tx || tx.transaction_id == null || tx.value == null || !tx.currency) return;
    if (widgetReady) postPurchase(tx);
    else pendingPurchase = tx; // flushed on ivy:ready
  }

  // Public API for a storefront that computes the order itself.
  window.IvyWidget = window.IvyWidget || {};
  window.IvyWidget.trackPurchase = reportPurchase;

  // Auto-detect a completed Shopify order on the order-status / thank-you page.
  // `Shopify.checkout` is present there with order_id + totals + line items.
  function detectShopifyPurchase() {
    try {
      var co = window.Shopify && window.Shopify.checkout;
      if (!co || co.order_id == null) return;
      var items = (co.line_items || []).map(function (li) {
        return {
          item_id: String(li.product_id || li.id || ''),
          item_name: li.title,
          quantity: li.quantity,
          price: Number(li.price),
        };
      });
      reportPurchase({
        transaction_id: String(co.order_id),
        value: Number(co.total_price),
        currency: co.currency || co.presentment_currency,
        items: items,
      });
    } catch (_) {
      /* not a checkout page / shape differs — nothing to report */
    }
  }
  detectShopifyPurchase();

  window.addEventListener('message', function (e) {
    if (e.origin !== baseOrigin) return; // only trust messages from our widget origin
    var d = e.data || {};
    if (d.type === 'ivy:resize') {
      frame.style.width = d.open ? OPEN.w : CLOSED.w;
      frame.style.height = d.open ? OPEN.h : CLOSED.h;
    } else if (d.type === 'ivy:ready') {
      widgetReady = true;
      maybeSendIdentity();
      if (pendingPurchase) {
        postPurchase(pendingPurchase);
        pendingPurchase = null;
      }
    }
  });

  // Ask the store (via the Shopify app proxy) whether a customer is logged in.
  // On success the widget starts authenticated; any failure (proxy not set up,
  // logged-out, network) simply leaves it anonymous. Never blocks rendering.
  try {
    fetch(proxyBase + '/identity?locale=' + encodeURIComponent(locale), {
      credentials: 'include',
      headers: { accept: 'application/json' },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (j && j.authenticated && j.sessionToken) {
          identity = j;
          maybeSendIdentity();
        }
      })
      .catch(function () {
        /* proxy not configured / offline — stay anonymous */
      });
  } catch (_) {
    /* fetch unavailable — stay anonymous */
  }
})();

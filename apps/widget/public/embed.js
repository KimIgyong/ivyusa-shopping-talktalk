/**
 * IVY USA TalkTalk — storefront embed loader (vanilla, dependency-free).
 *
 * Injects a floating <iframe> that hosts the widget in isolation from the store
 * theme. The iframe URL carries ?shop (tenant resolution) and ?locale; the widget
 * posts `ivy:resize` messages so this loader can grow/shrink the frame.
 *
 * Usage (Shopify theme / app-embed block):
 *   <script>window.IVY_WIDGET_CONFIG = {
 *     shop: "your-store.myshopify.com", locale: "en",
 *     widgetUrl: "https://widget.ivyusa.app" };</script>
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
  frame.src =
    base +
    '/?embed=1&shop=' +
    encodeURIComponent(shop) +
    '&locale=' +
    encodeURIComponent(locale);

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

  window.addEventListener('message', function (e) {
    if (e.origin !== baseOrigin) return; // only trust messages from our widget origin
    var d = e.data || {};
    if (d.type === 'ivy:resize') {
      frame.style.width = d.open ? OPEN.w : CLOSED.w;
      frame.style.height = d.open ? OPEN.h : CLOSED.h;
    } else if (d.type === 'ivy:ready') {
      widgetReady = true;
      maybeSendIdentity();
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

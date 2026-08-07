/**
 * IVY USA TalkTalk — storefront embed loader (vanilla, dependency-free).
 *
 * Injects a floating <iframe> that hosts the widget in isolation from the store
 * theme. The iframe URL carries ?shop (tenant resolution) and ?locale; the widget
 * posts `ivy:resize` messages so this loader can grow/shrink the frame.
 *
 * It also brokers Shopify customer sign-in: the sandboxed widget asks
 * (`ivy:login`, carrying the tenant-configured mode). In `redirect` mode (the
 * default) this loader navigates the whole tab to the store's own login page and
 * leaves a one-shot reopen flag so the widget reopens on the orders tab when the
 * shopper returns. In `popup` mode it opens the login in a popup instead; when
 * that popup lands back on a storefront page (where this same script runs) it
 * reports completion so the loader re-resolves identity. Either way the widget
 * ends up with a customer-bound session token — no separate account system,
 * just the store's.
 *
 * Usage (Shopify theme / app-embed block):
 *   <script>window.IVY_WIDGET_CONFIG = {
 *     shop: "your-store.myshopify.com", locale: "en",
 *     widgetUrl: "https://widget.ivyusa.app",
 *     ga4Id: "G-XXXXXXXXXX" };</script>
 *   <script src="https://widget.ivyusa.app/embed.js" defer></script>
 */
(function () {
  // --- Auth popup return leg -------------------------------------------------
  // This loader is installed on every storefront page, so after the customer
  // signs in Shopify redirects the popup back to a storefront page where this
  // script runs again. Detect that we are that popup (our named window, with an
  // opener) and — instead of mounting a second widget — tell the opener sign-in
  // finished, then close. The opener is the same storefront origin, so a plain
  // postMessage suffices; the opener re-verifies identity server-side anyway.
  if (
    window.name === 'ivy_auth_popup' &&
    window.opener &&
    window.opener !== window
  ) {
    try {
      window.opener.postMessage(
        { type: 'ivy:auth-popup-done' },
        window.location.origin,
      );
    } catch (_) {
      /* opener gone — the opener's closed-poll fallback still recovers it */
    }
    // Let the message flush, then close. If the browser blocks programmatic
    // close (rare), the opener recovers via its closed-poll + identity re-fetch,
    // and this hint keeps the leftover tab from confusing the shopper.
    setTimeout(function () {
      try {
        window.close();
      } catch (_) {
        /* ignore */
      }
    }, 50);
    try {
      document.body.innerHTML =
        '<div style="font:14px system-ui,sans-serif;padding:24px;color:#333">' +
        'Signed in — you can close this window.</div>';
    } catch (_) {
      /* ignore */
    }
    return;
  }

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
  // ShopTalk API base (same origin as the widget by default). Cafe24 has no App
  // Proxy, so member sign-in runs through these public customer-auth endpoints.
  var apiBase = String(cfg.apiBase || baseOrigin + '/api/v1').replace(/\/+$/, '');
  // Storefront sign-in entrypoint. The login page + its return-URL parameter differ
  // per commerce platform, auto-detected from the storefront host so it works with
  // no per-mall config (cfg.loginPath / cfg.loginReturnParam still override, e.g. a
  // Cafe24 mall on a custom domain):
  //   Cafe24 classic mall (*.cafe24.com): /member/login.html?returnUrl=<page>
  //   Shopify (*.myshopify.com / other):  /account/login?return_url=<page>
  // Cafe24 has no credential-login API and its member session lives on the mall
  // origin (unreadable from this cross-origin iframe), so login must happen in the
  // top window here, then the reopen flag brings the widget back up (PLN-260807).
  var isCafe24Host = /(^|\.)cafe24\.com$/.test((window.location.hostname || '').toLowerCase());
  var loginPath = String(cfg.loginPath || (isCafe24Host ? '/member/login.html' : '/account/login'));
  var loginReturnParam = String(
    cfg.loginReturnParam || (isCafe24Host ? 'returnUrl' : 'return_url'),
  );
  var identity = null; // resolved { authenticated, sessionToken } from the proxy
  var identityResolved = false; // the proxy answered (either way) — see below
  var widgetReady = false; // set once the widget iframe posts ivy:ready
  var authPopup = null; // the sign-in popup window, while one is in flight
  var authWatch = null; // interval id polling authPopup.closed
  var loginFinish = null; // resolver for the in-flight login, if any

  var CLOSED = { w: '96px', h: '96px' };
  var OPEN = { w: 'min(420px, 100vw)', h: 'min(680px, 100vh)' };

  // One-shot reopen flag: set when redirect-mode sign-in navigates the tab away,
  // consumed on the return visit so the widget reopens where the shopper left
  // off (sessionStorage = same tab only, which is exactly the redirect round trip).
  var REOPEN_KEY = 'ivy:reopen';
  function setReopenFlag(tab) {
    try {
      sessionStorage.setItem(REOPEN_KEY, tab);
    } catch (_) {
      /* storage unavailable — the shopper just reopens the widget manually */
    }
  }
  var reopenTab = (function () {
    try {
      var v = sessionStorage.getItem(REOPEN_KEY);
      if (v) sessionStorage.removeItem(REOPEN_KEY);
      return v === 'orders' || v === 'chat' || v === 'notifications' ? v : null;
    } catch (_) {
      return null;
    }
  })();

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
    (reopenTab ? '&reopen=' + encodeURIComponent(reopenTab) : '') +
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

  function sendToWidget(msg) {
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, base);
  }

  // Report the proxy's answer to the widget, once both sides are ready: the proxy
  // has answered AND the widget has posted ivy:ready.
  //
  // The negative answer matters as much as the positive one. The widget boots much
  // faster than this round trip (storefront → Shopify → app), so without an
  // explicit "no customer" it cannot tell "still waiting" from "nobody is signed
  // in" — it used to give up and open a throwaway guest session on every page
  // load, which is where the chat thread went. Telling it either way lets it wait
  // for a verified session and only fall back to guest when there really is none.
  function maybeSendIdentity() {
    if (!widgetReady || !identityResolved || !frame.contentWindow) return;
    if (identity && identity.authenticated && identity.sessionToken) {
      sendToWidget({ type: 'ivy:session', token: identity.sessionToken });
    } else {
      sendToWidget({ type: 'ivy:identity', authenticated: false });
    }
  }

  // Ask the store (via the Shopify app proxy) whether a customer is logged in.
  // Resolves to the identity JSON, or null on any failure (proxy not set up,
  // logged-out, network). Never throws — callers treat null as anonymous.
  function fetchIdentity() {
    try {
      return fetch(proxyBase + '/identity?locale=' + encodeURIComponent(locale), {
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .catch(function () {
          return null;
        });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function stopAuthWatch() {
    if (authWatch) {
      clearInterval(authWatch);
      authWatch = null;
    }
    authPopup = null;
    loginFinish = null;
  }

  // Build the store's own login URL, returning the shopper to the current page
  // so this loader runs again in the popup. Every part is same-origin and
  // loader-derived — no caller/URL input flows in, so there's no open redirect.
  function buildLoginUrl() {
    // Return the shopper to the page they were on, so the reopen flag can bring the
    // widget back up on the orders tab. Only the platform-correct return param is
    // sent (Cafe24 classic wants `returnUrl`, not `return_to`); extra query, if any,
    // comes from cfg.loginExtraQuery.
    var returnTo = window.location.pathname + window.location.search;
    var url =
      window.location.origin +
      loginPath +
      (loginPath.indexOf('?') >= 0 ? '&' : '?') +
      loginReturnParam +
      '=' +
      encodeURIComponent(returnTo);
    if (cfg.loginExtraQuery) url += '&' + String(cfg.loginExtraQuery).replace(/^[?&]/, '');
    return url;
  }

  // Redirect-mode sign-in: navigate this whole tab to the store's login page.
  // Shopify's hosted login (New Customer Accounts) then returns the shopper to
  // the current page (`return_to`), where the identity handshake authenticates
  // the widget and the reopen flag brings it back up on the orders tab.
  function redirectToLogin() {
    // Cafe24 has no signed app-proxy identity, so a bare login to /member/login.html
    // would sign the shopper in on the mall but tell the widget nothing. Route through
    // the customer-auth flow instead: its authorize step handles the mall login when
    // needed, then the callback returns a one-time ticket the widget redeems (P-A2).
    if (isCafe24Host) {
      startCafe24Login();
      return;
    }
    setReopenFlag('orders');
    window.location.assign(buildLoginUrl());
  }

  // Begin Cafe24 member authentication: navigate the top window to the backend
  // start endpoint, which redirects to the mall's customer authorize. `return` is
  // the current page (fragment stripped) so the callback can bring us back here with
  // the sign-in ticket; the reopen flag reopens the widget on the orders tab.
  function startCafe24Login() {
    setReopenFlag('orders');
    var ret = window.location.href.split('#')[0];
    window.location.assign(
      apiBase +
        '/public/cafe24/customer-auth/start?shop=' +
        encodeURIComponent(window.location.hostname) +
        '&return=' +
        encodeURIComponent(ret),
    );
  }

  // Redeem a one-time Cafe24 sign-in ticket for a widget session token. Resolves to
  // true on success (identity set), false otherwise. Shared by the redirect-return
  // path and the popup path.
  function exchangeCafe24Ticket(ticket) {
    return fetch(apiBase + '/public/cafe24/customer-auth/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ticket: ticket }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        // Unwrap the standard { success, data } envelope (or a bare body).
        var token = j && ((j.data && j.data.sessionToken) || j.sessionToken);
        if (token) {
          identity = { authenticated: true, sessionToken: token };
          return true;
        }
        return false;
      })
      .catch(function () {
        return false;
      });
  }

  // On return from a top-window Cafe24 sign-in, redeem the `#ivy_ticket`. Returns true
  // when a ticket was present. The ticket is stripped from the URL immediately so a
  // reload can't replay it (it is also one-time server-side).
  function consumeCafe24Ticket() {
    var m = /[#&]ivy_ticket=([^&]+)/.exec(window.location.hash || '');
    if (!m) return false;
    var ticket = decodeURIComponent(m[1]);
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_) {
      /* history unavailable — the ticket is one-time server-side anyway */
    }
    exchangeCafe24Ticket(ticket).then(function () {
      identityResolved = true;
      maybeSendIdentity();
    });
    return true;
  }

  // In-widget sign-in: open the Cafe24 customer-auth in a popup so the storefront page
  // and the widget never navigate. The popup runs the mall login + authorize; its
  // callback posts the ticket back here (ivy:cafe24-ticket), which we redeem. Falls
  // back to a full-tab redirect when the popup is blocked.
  var cafe24TicketSeen = false;
  function openCafe24LoginPopup() {
    if (authPopup && !authPopup.closed) {
      authPopup.focus();
      return;
    }
    cafe24TicketSeen = false;
    var ret = window.location.href.split('#')[0];
    var url =
      apiBase +
      '/public/cafe24/customer-auth/start?mode=popup&shop=' +
      encodeURIComponent(window.location.hostname) +
      '&return=' +
      encodeURIComponent(ret);
    var w = 480;
    var h = 720;
    var x = Math.max(0, (window.outerWidth - w) / 2 + (window.screenX || 0));
    var y = Math.max(0, (window.outerHeight - h) / 2 + (window.screenY || 0));
    authPopup = window.open(
      url,
      'ivy_cafe24_auth',
      'width=' + w + ',height=' + h + ',left=' + Math.round(x) + ',top=' + Math.round(y),
    );
    if (!authPopup) {
      // Popup blocked — fall back to the full-tab flow so sign-in still works.
      startCafe24Login();
      return;
    }
    authWatch = setInterval(function () {
      if (!authPopup || authPopup.closed) {
        stopAuthWatch();
        // Closed without delivering a ticket → treat as cancelled.
        if (!cafe24TicketSeen) sendToWidget({ type: 'ivy:login-cancelled' });
      }
    }, 700);
  }

  // Open the sign-in popup and watch for its return. Called only in response to
  // an explicit ivy:login from our widget iframe (user clicked "Sign in").
  function openLoginPopup() {
    if (authPopup && !authPopup.closed) {
      authPopup.focus();
      return;
    }
    var w = 480;
    var h = 720;
    var x = Math.max(0, (window.outerWidth - w) / 2 + (window.screenX || 0));
    var y = Math.max(0, (window.outerHeight - h) / 2 + (window.screenY || 0));
    authPopup = window.open(
      buildLoginUrl(),
      'ivy_auth_popup',
      'width=' + w + ',height=' + h + ',left=' + Math.round(x) + ',top=' + Math.round(y),
    );
    if (!authPopup) {
      // Popup blocked — let the widget fall back to guest lookup gracefully.
      sendToWidget({ type: 'ivy:login-cancelled', reason: 'blocked' });
      return;
    }

    var resolved = false;
    loginFinish = function () {
      if (resolved) return;
      resolved = true;
      stopAuthWatch();
      // Re-resolve identity now that the customer may be logged in. One retry
      // absorbs cookie-propagation lag right after the OAuth callback.
      fetchIdentity()
        .then(function (j) {
          if (j && j.authenticated && j.sessionToken) return j;
          return new Promise(function (r) {
            setTimeout(r, 800);
          }).then(fetchIdentity);
        })
        .then(function (j) {
          if (j && j.authenticated && j.sessionToken) {
            identity = j;
            identityResolved = true;
            maybeSendIdentity();
          } else {
            // Popup closed without a completed sign-in (cancel, or not logged in).
            sendToWidget({ type: 'ivy:login-cancelled' });
          }
        })
        .catch(function () {
          sendToWidget({ type: 'ivy:login-cancelled' });
        });
    };

    // Fallback path: if the popup is closed without ever posting done (manual
    // close, or window.close blocked), resolve the same way.
    authWatch = setInterval(function () {
      if (!authPopup || authPopup.closed) loginFinish();
    }, 700);
  }

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    // From the sign-in popup we opened (same-origin storefront page).
    if (d.type === 'ivy:auth-popup-done' && e.origin === window.location.origin) {
      if (loginFinish) loginFinish();
      return;
    }
    // Everything else must come from our widget iframe origin.
    if (e.origin !== baseOrigin) return;
    if (d.type === 'ivy:resize') {
      frame.style.width = d.open ? OPEN.w : CLOSED.w;
      frame.style.height = d.open ? OPEN.h : CLOSED.h;
    } else if (d.type === 'ivy:ready') {
      widgetReady = true;
      maybeSendIdentity();
    } else if (d.type === 'ivy:login') {
      // Only the widget iframe may trigger sign-in. The widget forwards the
      // tenant-configured mode (console setting); anything but an explicit
      // 'popup' means redirect — the safer default (no popup blockers, and the
      // popup return leg doesn't fire when Shopify's hosted login keeps the
      // popup on shopify.com).
      if (e.source === frame.contentWindow) {
        if (isCafe24Host) {
          // Cafe24 supports both: popup keeps the storefront + widget in place;
          // redirect navigates the tab through the mall login. Honor the mode.
          if (d.mode === 'popup') openCafe24LoginPopup();
          else redirectToLogin();
        } else if (d.mode === 'popup') {
          openLoginPopup();
        } else {
          redirectToLogin();
        }
      }
    } else if (d.type === 'ivy:cafe24-ticket') {
      // The Cafe24 sign-in popup (served by our API origin) posts the one-time
      // ticket here. Redeem it, authenticate the widget, and close the popup — the
      // storefront page never navigated.
      cafe24TicketSeen = true;
      if (authPopup && !authPopup.closed) {
        try {
          authPopup.close();
        } catch (_) {
          /* ignore */
        }
      }
      stopAuthWatch();
      exchangeCafe24Ticket(d.ticket).then(function (ok) {
        identityResolved = true;
        if (ok) maybeSendIdentity();
        else sendToWidget({ type: 'ivy:login-cancelled' });
      });
    } else if (d.type === 'ivy:signin') {
      // Back-compat with widgets that predate the popup flow: the sandboxed
      // iframe cannot navigate the store page itself, so do it here. Uses the same
      // platform-configured login URL as the modern flow (not a hardcoded path).
      redirectToLogin();
    }
  });

  // Passive identity check on load: start authenticated if a customer is already
  // signed in. Any failure simply leaves the widget anonymous; never blocks render.
  // Either way we mark the question answered so the widget stops waiting.
  if (isCafe24Host) {
    // No app proxy on Cafe24 — identity arrives only via the customer-auth ticket on
    // the return leg. If there's no ticket, the shopper is simply anonymous.
    if (!consumeCafe24Ticket()) {
      identityResolved = true;
      maybeSendIdentity();
    }
  } else {
    fetchIdentity().then(function (j) {
      if (j && j.authenticated && j.sessionToken) identity = j;
      identityResolved = true;
      maybeSendIdentity();
    });
  }
})();

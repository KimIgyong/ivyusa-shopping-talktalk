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
  var locale = String(cfg.locale || document.documentElement.lang || 'en').slice(0, 2);

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

  window.addEventListener('message', function (e) {
    if (e.origin !== base) return; // only trust messages from our widget origin
    var d = e.data || {};
    if (d.type === 'ivy:resize') {
      frame.style.width = d.open ? OPEN.w : CLOSED.w;
      frame.style.height = d.open ? OPEN.h : CLOSED.h;
    }
  });
})();

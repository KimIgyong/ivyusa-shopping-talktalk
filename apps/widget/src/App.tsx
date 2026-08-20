import { useMemo } from 'react';
import { Storefront } from './components/storefront/Storefront';
import { Widget } from './components/widget/Widget';
import { Ga4Provider } from './lib/analytics';
import { useWidgetStore } from './store/widgetStore';
import { getStoredConsent } from './lib/consent';
import { isAppMode } from './lib/host-bridge';

/**
 * Render only the widget: embedded on a real storefront (via embed.js), or
 * inside a host app's WebView (?mode=app). The demo storefront exists for the
 * standalone preview and has no business appearing inside a customer's app.
 */
const isEmbed =
  new URLSearchParams(window.location.search).get('embed') === '1' || isAppMode();

/** Tenant shop + language merged into every GA4 event as common context. */
function useAnalyticsContext() {
  const language = useWidgetStore((s) => s.language);
  const shop = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('shop') ?? undefined;
    } catch {
      return undefined;
    }
  }, []);
  return useMemo(() => ({ shop_domain: shop, language }), [shop, language]);
}

export default function App() {
  // GA4 fires only after the visitor accepts the privacy notice (Consent Mode v2).
  // Server-confirmed state wins; before the first session/ensure resolves, fall
  // back to the local cache so a returning visitor's analytics start unbroken.
  const consentInfo = useWidgetStore((s) => s.consent);
  const consentGranted = consentInfo
    ? consentInfo.state === 'granted'
    : getStoredConsent() === 'granted';
  const context = useAnalyticsContext();

  const tree = isEmbed ? (
    <Widget />
  ) : (
    <div className="relative h-full">
      <Storefront />
      <Widget />
    </div>
  );

  return (
    <Ga4Provider consent={consentGranted} context={context}>
      {tree}
    </Ga4Provider>
  );
}

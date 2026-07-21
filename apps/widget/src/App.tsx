import { useMemo } from 'react';
import { Storefront } from './components/storefront/Storefront';
import { Widget } from './components/widget/Widget';
import { Ga4Provider } from './lib/analytics';
import { useWidgetStore } from './store/widgetStore';

/** Embedded on a real storefront (via embed.js) — render only the widget. */
const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1';

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
  const consentGranted = useWidgetStore((s) => s.consent) === 'granted';
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

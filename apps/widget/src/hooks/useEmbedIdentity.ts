import { useEffect } from 'react';
import { useWidgetStore } from '../store/widgetStore';

/**
 * Storefront identity handshake. When embedded in a Shopify store via embed.js,
 * announce readiness to the loader and adopt any customer-bound session token it
 * sends (resolved through the Shopify app proxy, so the customer id is verified
 * by Shopify — we never trust a client-supplied identity). This authenticates the
 * cross-origin widget for a logged-in customer.
 */
export function useEmbedIdentity() {
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);

  useEffect(() => {
    if (window.parent === window) return; // not embedded — nothing to do

    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent) return; // only from our embedder frame
      const d = (e.data || {}) as { type?: string; token?: string };
      if (d.type === 'ivy:session' && d.token) {
        setSessionToken(d.token);
        setAuthenticated(true);
      }
    }
    window.addEventListener('message', onMessage);
    // Tell the loader we're mounted and ready to receive the identity token.
    window.parent.postMessage({ type: 'ivy:ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [setSessionToken, setAuthenticated]);
}

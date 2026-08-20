import { useEffect } from 'react';
import { useAnalytics } from '../lib/analytics';
import type { PurchasePayload } from '../lib/analytics';
import { hostKind, onHostMessage } from '../lib/host-bridge';

interface PurchaseMessage {
  type?: string;
  transaction_id?: string | number;
  value?: number | string;
  currency?: string;
  items?: PurchasePayload['items'];
}

/**
 * Payment-conversion bridge. embed.js runs on the storefront (including the
 * Shopify order-status / thank-you page), detects a completed order, and posts
 * `ivy:purchase` to this iframe. We fire the GA4 `purchase` key event here so
 * the conversion carries the same client_id + UTM attribution as the rest of
 * the widget journey — letting GA4 compute an accurate payment conversion rate
 * segmented by traffic source. Dedup is handled in the provider.
 */
export function usePurchaseSignal(): void {
  const analytics = useAnalytics();

  useEffect(() => {
    if (!analytics.enabled) return;
    // Storefront-only: the purchase signal comes from embed.js watching a
    // thank-you page. A mobile app has no such page.
    if (hostKind() !== 'frame') return;

    function onMessage(raw: Record<string, unknown>) {
      const d = raw as PurchaseMessage;
      if (d.type !== 'ivy:purchase') return;
      const txId = d.transaction_id != null ? String(d.transaction_id) : '';
      const value = typeof d.value === 'string' ? Number(d.value) : d.value;
      if (!txId || value == null || !Number.isFinite(value) || !d.currency) return;
      analytics.purchase({
        transaction_id: txId,
        value: value as number,
        currency: d.currency,
        items: Array.isArray(d.items) ? d.items : undefined,
      });
    }

    return onHostMessage(onMessage);
  }, [analytics]);
}

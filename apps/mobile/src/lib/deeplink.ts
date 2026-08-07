/**
 * Notification deep-link resolution (F4 A-9 — campaign product deep links).
 * Storefront product URL → in-app product detail; other storefront URL → Shop
 * WebView; anything else → external browser. Used by both the push-response
 * listener (app/_layout.tsx) and the alerts list (app/(tabs)/alerts.tsx).
 */
import * as Linking from 'expo-linking';
import type { useRouter } from 'expo-router';
import { STOREFRONT_URL } from './config';

type AppRouter = ReturnType<typeof useRouter>;

/** Extract the product handle from a `/products/<handle>` URL, or null. */
export function extractProductHandle(url: string): string | null {
  const match = url.match(/\/products\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Open a notification link:
 * - storefront `/products/<handle>` URL → in-app product detail route
 * - other storefront URL → Shop WebView with that URL
 * - external URL → system browser
 */
export function openNotificationLink(router: AppRouter, url: string): void {
  if (url.startsWith(STOREFRONT_URL)) {
    const handle = url.includes('/products/') ? extractProductHandle(url) : null;
    if (handle) {
      router.push(`/product/${handle}`);
    } else {
      router.push(`/shop?url=${encodeURIComponent(url)}`);
    }
    return;
  }
  void Linking.openURL(url);
}

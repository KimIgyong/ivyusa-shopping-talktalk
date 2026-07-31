import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSession } from '../../src/store/session-context';
import { STOREFRONT_URL } from '../../src/lib/config';

/**
 * Storefront identity bridge (native equivalent of widget useEmbedIdentity):
 * on every page load, ask the Shopify App Proxy who is logged in. When Shopify
 * signs a customer id, the API mints a customer-bound session token which we
 * hand to the native side via postMessage. Same-origin on the shop — no
 * client-supplied identity is ever trusted.
 */
const IDENTITY_BRIDGE_JS = `(function () {
  try {
    fetch('/apps/ivy/identity', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.authenticated && j.sessionToken && window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'ivy:session', token: j.sessionToken })
          );
        }
      })
      .catch(function () {});
  } catch (e) {}
})(); true;`;

export default function ShopScreen() {
  const { adoptVerifiedToken } = useSession();
  const webRef = useRef<WebView>(null);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // Trust only messages posted from the storefront origin (R-check parity
      // with the widget's https-only origin guard).
      const url = event.nativeEvent.url ?? '';
      if (!url.startsWith(STOREFRONT_URL)) return;
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string };
        if (data.type === 'ivy:session' && typeof data.token === 'string' && data.token) {
          void adoptVerifiedToken(data.token);
        }
      } catch {
        // Non-JSON messages from page scripts — ignore.
      }
    },
    [adoptVerifiedToken],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ uri: STOREFRONT_URL }}
        injectedJavaScript={IDENTITY_BRIDGE_JS}
        onMessage={onMessage}
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        startInLoadingState
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  web: { flex: 1 },
});

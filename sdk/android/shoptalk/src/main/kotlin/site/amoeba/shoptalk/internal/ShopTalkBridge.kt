package site.amoeba.shoptalk.internal

import android.webkit.JavascriptInterface

/**
 * The object the widget sees as `window.ShopTalkAndroid`. The interface name is
 * fixed by the widget's host detection — renaming it silently downgrades the
 * widget to "no host". Called on the WebView's JS thread; the owner reposts to
 * the main thread before touching anything.
 */
internal class ShopTalkBridge(private val onMessage: (String) -> Unit) {
    @JavascriptInterface
    fun postMessage(json: String) {
        onMessage(json)
    }
}

package site.amoeba.shoptalk

import java.net.URLEncoder

/**
 * Where and how the chat opens. The same values the web embed uses — the widget
 * URL parameters are the contract (docs/guide/모바일SDK연동가이드_Mobile-SDK.ko.md §1).
 *
 * @param widgetUrl Where the widget is served, e.g. `https://talk.example.com/widget/`.
 * @param shop Store domain identifying the tenant (same value the web SDK uses).
 * @param locale Initial UI language (e.g. `vi`); omitted = the widget auto-detects
 *   (stored manual pick, else device language, else English). Delivered over the
 *   bridge as an `ivy:command`/`locale` once the widget is ready — the widget
 *   reads no `locale` URL parameter (verified against useEmbedCommands/i18n).
 * @param agent AI agent code to pin the session to; omitted = the tenant's default.
 */
data class ShopTalkConfig(
    val widgetUrl: String,
    val shop: String? = null,
    val locale: String? = null,
    val agent: String? = null,
) {
    /** The URL the WebView opens: app mode, no launcher, panel open. */
    internal fun launchUrl(): String {
        val base = widgetUrl.trimEnd('/')
        val params = StringBuilder("embed=1&mode=app")
        fun add(key: String, value: String?) {
            if (!value.isNullOrBlank()) {
                params.append('&').append(key).append('=')
                    .append(URLEncoder.encode(value, "UTF-8"))
            }
        }
        add("shop", shop)
        add("agent", agent)
        return "$base/?$params"
    }

    /** True when [url] belongs to the widget itself; anything else is an external link. */
    internal fun isWidgetUrl(url: String): Boolean =
        url == "about:blank" || url.startsWith(widgetUrl.trimEnd('/'))
}

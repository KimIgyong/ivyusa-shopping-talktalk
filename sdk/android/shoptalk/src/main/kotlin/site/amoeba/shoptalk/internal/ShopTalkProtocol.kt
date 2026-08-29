package site.amoeba.shoptalk.internal

import org.json.JSONObject
import site.amoeba.shoptalk.ShopTalkListener
import site.amoeba.shoptalk.ShopTalkUser

/**
 * The bridge message contract, kept byte-identical to the web/RN/iOS channels
 * (apps/widget/src/lib/host-bridge.ts). This file only builds and parses JSON —
 * no Android types — so the whole contract is coverable by JVM unit tests.
 */
internal object ShopTalkProtocol {

    // ── outbound (app → widget) ──────────────────────────────────────────────

    fun identifyJson(user: ShopTalkUser): String {
        val u = JSONObject()
            .put("userId", user.userId)
            .put("hash", user.hash)
        user.name?.let { u.put("name", it) }
        user.email?.let { u.put("email", it) }
        user.phone?.let { u.put("phone", it) }
        return JSONObject().put("type", "ivy:identify").put("user", u).toString()
    }

    fun openJson(tab: String): String =
        JSONObject().put("type", "ivy:command").put("action", "open").put("tab", tab).toString()

    fun localeJson(locale: String): String =
        JSONObject().put("type", "ivy:command").put("action", "locale").put("locale", locale).toString()

    /**
     * `vi-VN` / `vi_VN` → `vi`. The widget's language registry holds bare
     * two-letter codes and ignores anything else, the same base-subtag rule its
     * own browser detection applies.
     */
    fun normalizeLocale(tag: String): String =
        tag.trim().split('-', '_').first().lowercase()

    fun logoutJson(): String =
        JSONObject().put("type", "ivy:command").put("action", "logout").toString()

    /**
     * The script evaluated inside the WebView. `JSONObject.quote` turns the
     * payload into a JS string literal, so quotes and newlines inside it cannot
     * break out of the injection. The `&&` guard makes a call before the bridge
     * global exists a silent no-op instead of a ReferenceError nobody can see.
     */
    fun injection(json: String): String =
        "window.__shoptalkHost && window.__shoptalkHost(${JSONObject.quote(json)});"

    // ── inbound (widget → app) ───────────────────────────────────────────────

    sealed interface Inbound {
        data object Ready : Inbound
        data object CloseRequest : Inbound
        data class Identified(val ok: Boolean) : Inbound
        data object Unknown : Inbound
    }

    /** Null = not ours or malformed; ignored rather than thrown (no console in a WebView). */
    fun parse(json: String): Inbound? {
        val obj = try {
            JSONObject(json)
        } catch (_: Exception) {
            return null
        }
        return when (obj.optString("type")) {
            "ivy:ready" -> Inbound.Ready
            "ivy:close-request" -> Inbound.CloseRequest
            "ivy:event" ->
                if (obj.optString("event") == "identified") Inbound.Identified(obj.optBoolean("ok"))
                else Inbound.Unknown
            // Unknown types are ignored on purpose — the widget side does the
            // same, and it is what lets old AARs survive new widget messages.
            else -> Inbound.Unknown
        }
    }

    /** Dispatch to the host's listener without letting its exceptions reach the WebView. */
    fun dispatchSafely(listener: ShopTalkListener?, inbound: Inbound, onError: (Throwable) -> Unit) {
        listener ?: return
        try {
            when (inbound) {
                Inbound.Ready -> listener.onReady()
                Inbound.CloseRequest -> listener.onCloseRequest()
                is Inbound.Identified -> listener.onIdentified(inbound.ok)
                Inbound.Unknown -> Unit
            }
        } catch (t: Throwable) {
            onError(t)
        }
    }
}

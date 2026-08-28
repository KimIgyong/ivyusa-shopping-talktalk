package site.amoeba.shoptalk

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import site.amoeba.shoptalk.internal.ShopTalkProtocol
import site.amoeba.shoptalk.internal.ShopTalkProtocol.Inbound

class ShopTalkProtocolTest {

    // ── outbound ─────────────────────────────────────────────────────────────

    @Test
    fun `identify carries required fields and omits absent optionals`() {
        val json = JSONObject(
            ShopTalkProtocol.identifyJson(ShopTalkUser(userId = "42", hash = "abc", name = "Ngân")),
        )
        assertEquals("ivy:identify", json.getString("type"))
        val user = json.getJSONObject("user")
        assertEquals("42", user.getString("userId"))
        assertEquals("abc", user.getString("hash"))
        assertEquals("Ngân", user.getString("name"))
        assertFalse(user.has("email"))
        assertFalse(user.has("phone"))
    }

    @Test
    fun `commands match the bridge contract`() {
        val open = JSONObject(ShopTalkProtocol.openJson("orders"))
        assertEquals("ivy:command", open.getString("type"))
        assertEquals("open", open.getString("action"))
        assertEquals("orders", open.getString("tab"))

        val locale = JSONObject(ShopTalkProtocol.localeJson("vi"))
        assertEquals("locale", locale.getString("action"))
        assertEquals("vi", locale.getString("locale"))

        assertEquals("logout", JSONObject(ShopTalkProtocol.logoutJson()).getString("action"))
    }

    @Test
    fun `locale tags collapse to the base subtag the widget understands`() {
        assertEquals("vi", ShopTalkProtocol.normalizeLocale("vi-VN"))
        assertEquals("vi", ShopTalkProtocol.normalizeLocale("vi_VN"))
        assertEquals("ko", ShopTalkProtocol.normalizeLocale(" KO "))
        assertEquals("en", ShopTalkProtocol.normalizeLocale("en"))
    }

    @Test
    fun `injection quotes the payload so it cannot break out of the script`() {
        val hostile = """{"type":"ivy:identify","user":{"name":"a'b\"c\n d"}}"""
        val script = ShopTalkProtocol.injection(hostile)
        assertTrue(script.startsWith("window.__shoptalkHost && window.__shoptalkHost("))
        // The payload must round-trip as a single JS string literal: no raw
        // quotes or line separators may survive unescaped.
        val literal = script.removePrefix("window.__shoptalkHost && window.__shoptalkHost(")
            .removeSuffix(");")
        assertTrue(literal.first() == '"' && literal.last() == '"')
        val body = literal.substring(1, literal.length - 1)
        assertFalse(body.contains('\n'))
        assertFalse(Regex("(?<!\\\\)\"").containsMatchIn(body))
    }

    // ── inbound ──────────────────────────────────────────────────────────────

    @Test
    fun `known messages parse to their events`() {
        assertEquals(Inbound.Ready, ShopTalkProtocol.parse("""{"type":"ivy:ready"}"""))
        assertEquals(Inbound.CloseRequest, ShopTalkProtocol.parse("""{"type":"ivy:close-request"}"""))
        assertEquals(
            Inbound.Identified(true),
            ShopTalkProtocol.parse("""{"type":"ivy:event","event":"identified","ok":true}"""),
        )
        assertEquals(
            Inbound.Identified(false),
            ShopTalkProtocol.parse("""{"type":"ivy:event","event":"identified","ok":false}"""),
        )
    }

    @Test
    fun `unknown types are tolerated and malformed input is ignored`() {
        // Forward compatibility: an old AAR must survive new widget messages.
        assertEquals(Inbound.Unknown, ShopTalkProtocol.parse("""{"type":"ivy:something-new"}"""))
        assertEquals(Inbound.Unknown, ShopTalkProtocol.parse("""{"type":"ivy:event","event":"other"}"""))
        assertNull(ShopTalkProtocol.parse("not json at all"))
        assertNull(ShopTalkProtocol.parse(""))
    }

    // ── listener isolation ───────────────────────────────────────────────────

    @Test
    fun `a throwing listener is contained and reported`() {
        var caught: Throwable? = null
        val listener = object : ShopTalkListener {
            override fun onCloseRequest() = error("host bug")
        }
        ShopTalkProtocol.dispatchSafely(listener, Inbound.CloseRequest) { caught = it }
        assertEquals("host bug", caught?.message)
    }

    @Test
    fun `dispatch routes each event to its callback`() {
        val calls = mutableListOf<String>()
        val listener = object : ShopTalkListener {
            override fun onReady() { calls += "ready" }
            override fun onCloseRequest() { calls += "close" }
            override fun onIdentified(ok: Boolean) { calls += "identified:$ok" }
        }
        val fail: (Throwable) -> Unit = { throw AssertionError(it) }
        ShopTalkProtocol.dispatchSafely(listener, Inbound.Ready, fail)
        ShopTalkProtocol.dispatchSafely(listener, Inbound.Identified(false), fail)
        ShopTalkProtocol.dispatchSafely(listener, Inbound.CloseRequest, fail)
        ShopTalkProtocol.dispatchSafely(listener, Inbound.Unknown, fail)
        ShopTalkProtocol.dispatchSafely(null, Inbound.Ready, fail)
        assertEquals(listOf("ready", "identified:false", "close"), calls)
    }
}

package site.amoeba.shoptalk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShopTalkConfigTest {

    @Test
    fun `minimal config opens app mode with no launcher`() {
        val url = ShopTalkConfig(widgetUrl = "https://talk.example.com/widget/").launchUrl()
        assertEquals("https://talk.example.com/widget/?embed=1&mode=app", url)
    }

    @Test
    fun `all params are appended and encoded`() {
        val url = ShopTalkConfig(
            widgetUrl = "https://talk.example.com/widget", // no trailing slash
            shop = "go2joy.example.com",
            agent = "hotel concierge", // space must not survive raw
        ).launchUrl()
        assertEquals(
            "https://talk.example.com/widget/?embed=1&mode=app" +
                "&shop=go2joy.example.com&agent=hotel+concierge",
            url,
        )
    }

    @Test
    fun `locale never goes into the url - the widget does not read it there`() {
        val url = ShopTalkConfig(widgetUrl = "https://t.example/w", locale = "vi").launchUrl()
        assertFalse(url.contains("locale"))
    }

    @Test
    fun `blank optional params are omitted`() {
        val url = ShopTalkConfig(widgetUrl = "https://t.example/w", shop = "", agent = " ".trim()).launchUrl()
        assertEquals("https://t.example/w/?embed=1&mode=app", url)
    }

    @Test
    fun `widget urls stay in the webview and external ones do not`() {
        val config = ShopTalkConfig(widgetUrl = "https://talk.example.com/widget/")
        assertTrue(config.isWidgetUrl("https://talk.example.com/widget/?embed=1&mode=app"))
        assertTrue(config.isWidgetUrl("https://talk.example.com/widget"))
        assertTrue(config.isWidgetUrl("about:blank"))
        assertFalse(config.isWidgetUrl("https://shop.example.com/product/1"))
        assertFalse(config.isWidgetUrl("mailto:cs@example.com"))
    }
}

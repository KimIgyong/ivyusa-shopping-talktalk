package site.amoeba.shoptalk

/** Widget tabs the host can open (`ivy:command` / `open`). */
enum class ShopTalkTab(internal val wire: String) {
    CHAT("chat"),
    ORDERS("orders"),
    NOTIFICATIONS("notifications"),
}

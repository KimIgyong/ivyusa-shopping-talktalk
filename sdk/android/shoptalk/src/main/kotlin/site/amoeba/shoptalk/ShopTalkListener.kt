package site.amoeba.shoptalk

/**
 * What the widget tells the host app. All methods have empty defaults except
 * the one that matters: [onCloseRequest] is where the host MUST dismiss the
 * chat screen — in app mode the widget fills the screen, so ignoring it leaves
 * the visitor staring at a blank page.
 *
 * A listener that throws never takes the WebView down with it; the exception is
 * logged and swallowed (there is no console inside a WebView to surface it).
 */
interface ShopTalkListener {
    /** The widget mounted and is listening. Identity is (re)sent automatically. */
    fun onReady() {}

    /** The visitor tapped close — dismiss this screen now. */
    fun onCloseRequest()

    /** The server accepted (or rejected) the signed identity. Rejection keeps the guest session. */
    fun onIdentified(ok: Boolean) {}
}

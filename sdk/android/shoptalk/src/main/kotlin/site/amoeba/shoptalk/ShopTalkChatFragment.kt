package site.amoeba.shoptalk

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.core.view.updatePadding
import androidx.fragment.app.Fragment
import site.amoeba.shoptalk.internal.ShopTalkBridge
import site.amoeba.shoptalk.internal.ShopTalkProtocol

/**
 * The ShopTalk conversation, hosted in a WebView.
 *
 * The same widget the web SDK embeds, so a fix on the web reaches the app with
 * no second implementation. This fragment's whole job is what a WebView does
 * not do for free: identify the user, close the screen, let a photo be
 * attached, keep links out of the chat view, and keep the input above the
 * keyboard.
 *
 * ```kotlin
 * val chat = ShopTalkChatFragment.newInstance(ShopTalkConfig(widgetUrl = "…", shop = "…"))
 * chat.identify(ShopTalkUser(userId = uid, hash = serverSignedHash))
 * chat.listener = object : ShopTalkListener {
 *     override fun onCloseRequest() { parentFragmentManager.popBackStack() }
 * }
 * ```
 */
class ShopTalkChatFragment : Fragment() {

    /** Host callbacks. Exceptions thrown here are logged, never propagated. */
    var listener: ShopTalkListener? = null

    private lateinit var config: ShopTalkConfig
    private var webView: WebView? = null
    private var loadingView: ProgressBar? = null

    /**
     * True once the widget said `ivy:ready`. Before the page's JS module loads,
     * an injected call is a silent no-op — so commands wait here, mirroring the
     * 20-message queue the widget keeps for the opposite race.
     */
    private var widgetReady = false
    private var lastIdentifyJson: String? = null
    private var lastLocaleJson: String? = null
    private val pending = ArrayDeque<String>()

    private val mainHandler = Handler(Looper.getMainLooper())
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var previousSoftInputMode: Int? = null

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            // A cancelled pick MUST still deliver null — a callback left hanging
            // makes every later file chooser silently refuse to open.
            filePathCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
            filePathCallback = null
        }

    // ── public control (safe to call at any time; queued until the widget is up) ──

    /** Announce the signed-in user. Re-sent automatically whenever the widget (re)loads. */
    fun identify(user: ShopTalkUser) {
        val json = ShopTalkProtocol.identifyJson(user)
        lastIdentifyJson = json
        if (widgetReady) evaluate(json)
    }

    fun open(tab: ShopTalkTab) = send(ShopTalkProtocol.openJson(tab.wire))

    /**
     * Switch the widget language. Sent as a bridge command — the widget reads no
     * `locale` URL parameter — and re-sent on every (re)load like identity.
     */
    fun setLocale(locale: String) {
        val json = ShopTalkProtocol.localeJson(ShopTalkProtocol.normalizeLocale(locale))
        lastLocaleJson = json
        if (widgetReady) evaluate(json)
    }

    /** Drop the identity (visitor becomes a guest). */
    fun logout() {
        lastIdentifyJson = null
        send(ShopTalkProtocol.logoutJson())
    }

    // ── lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val args = requireArguments()
        config = ShopTalkConfig(
            widgetUrl = requireNotNull(args.getString(ARG_WIDGET_URL)) { "widgetUrl is required" },
            shop = args.getString(ARG_SHOP),
            locale = args.getString(ARG_LOCALE),
            agent = args.getString(ARG_AGENT),
        )
        config.locale?.let {
            lastLocaleJson = ShopTalkProtocol.localeJson(ShopTalkProtocol.normalizeLocale(it))
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        val context = requireContext()
        val root = FrameLayout(context)

        val web = WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            settings.javaScriptEnabled = true
            // The session token lives in localStorage; without this a returning
            // visitor loses their conversation on every open.
            settings.domStorageEnabled = true
            addJavascriptInterface(ShopTalkBridge(::onBridgeMessage), JS_INTERFACE)
            webViewClient = ChatWebViewClient()
            webChromeClient = ChatWebChromeClient()
        }
        webView = web
        root.addView(web)

        loadingView = ProgressBar(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER,
            )
        }
        root.addView(loadingView)

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(config.launchUrl())
        }
        return root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        // The message input must rise with the keyboard. adjustResize covers
        // classic windows; the insets listener covers edge-to-edge (target 35).
        activity?.window?.let { window ->
            previousSoftInputMode = window.attributes.softInputMode
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
        ViewCompat.setOnApplyWindowInsetsListener(view) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime(),
            )
            v.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView?.saveState(outState)
    }

    override fun onDestroyView() {
        // A file pick resolving after this view is gone would deliver into a
        // destroyed WebView — cancel it instead.
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        previousSoftInputMode?.let { activity?.window?.setSoftInputMode(it) }
        previousSoftInputMode = null
        widgetReady = false
        webView?.let { web ->
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        }
        webView = null
        loadingView = null
        super.onDestroyView()
    }

    // ── bridge plumbing ──────────────────────────────────────────────────────

    /** Arrives on the WebView's JS thread. */
    private fun onBridgeMessage(json: String) {
        mainHandler.post {
            val inbound = ShopTalkProtocol.parse(json) ?: return@post
            if (inbound == ShopTalkProtocol.Inbound.Ready) {
                widgetReady = true
                // Identity and language first, then whatever the host queued —
                // same order the host would have produced live.
                lastIdentifyJson?.let(::evaluate)
                lastLocaleJson?.let(::evaluate)
                while (pending.isNotEmpty()) evaluate(pending.removeFirst())
            }
            ShopTalkProtocol.dispatchSafely(listener, inbound) { t ->
                Log.w(TAG, "ShopTalkListener threw; ignored to protect the chat", t)
            }
        }
    }

    private fun send(json: String) {
        if (widgetReady && webView != null) {
            evaluate(json)
        } else {
            if (pending.size >= MAX_PENDING) pending.removeFirst()
            pending.addLast(json)
        }
    }

    private fun evaluate(json: String) {
        webView?.evaluateJavascript(ShopTalkProtocol.injection(json), null)
    }

    private inner class ChatWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (config.isWidgetUrl(url)) return false
            // Links in a conversation open in the system browser. Followed
            // inside this WebView, the customer would have no way back.
            return try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                true
            } catch (_: ActivityNotFoundException) {
                true // nothing handles it; swallowing beats navigating the chat away
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            widgetReady = false // a reload re-runs the ready handshake
            super.onPageStarted(view, url, favicon)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            loadingView?.isVisible = false
            super.onPageFinished(view, url)
        }
    }

    private inner class ChatWebChromeClient : WebChromeClient() {
        override fun onShowFileChooser(
            view: WebView?,
            callback: ValueCallback<Array<Uri>>?,
            params: FileChooserParams?,
        ): Boolean {
            // Without this override an Android WebView does nothing at all on a
            // file input — "the photo did not send" with no error anywhere.
            filePathCallback?.onReceiveValue(null)
            filePathCallback = callback
            return try {
                fileChooser.launch(params?.createIntent())
                true
            } catch (_: Exception) {
                filePathCallback = null
                callback?.onReceiveValue(null)
                true
            }
        }
    }

    companion object {
        private const val TAG = "ShopTalk"

        /** Fixed by the widget's host detection — renaming silently downgrades to "no host". */
        private const val JS_INTERFACE = "ShopTalkAndroid"

        /** Same depth as the widget's own pre-mount queue. */
        private const val MAX_PENDING = 20

        private const val ARG_WIDGET_URL = "shoptalk:widget_url"
        private const val ARG_SHOP = "shoptalk:shop"
        private const val ARG_LOCALE = "shoptalk:locale"
        private const val ARG_AGENT = "shoptalk:agent"

        @JvmStatic
        fun newInstance(config: ShopTalkConfig): ShopTalkChatFragment =
            ShopTalkChatFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_WIDGET_URL, config.widgetUrl)
                    putString(ARG_SHOP, config.shop)
                    putString(ARG_LOCALE, config.locale)
                    putString(ARG_AGENT, config.agent)
                }
            }
    }
}

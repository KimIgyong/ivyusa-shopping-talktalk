package site.amoeba.shoptalk.sample

import android.os.Bundle
import android.util.Log
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commit
import site.amoeba.shoptalk.ShopTalkChatFragment
import site.amoeba.shoptalk.ShopTalkConfig
import site.amoeba.shoptalk.ShopTalkListener
import site.amoeba.shoptalk.ShopTalkUser

/**
 * Smallest possible host: one full-screen chat. This app is a test rig, not a
 * deliverable — it exists so the AAR can be verified on a device against
 * staging before go2joy integrates it.
 */
class MainActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = FrameLayout(this).apply { id = CONTAINER_ID }
        setContentView(container)

        if (savedInstanceState == null) {
            // Every value is overridable from adb so device verification can
            // point at a local widget build or exercise identity:
            //   adb shell am start -n site.amoeba.shoptalk.sample/.MainActivity \
            //     -e widget_url http://localhost:5174/ -e locale vi
            val config = ShopTalkConfig(
                widgetUrl = intent.getStringExtra("widget_url") ?: DEFAULT_WIDGET_URL,
                shop = intent.getStringExtra("shop"),
                locale = intent.getStringExtra("locale") ?: "vi",
                agent = intent.getStringExtra("agent"),
            )
            val chat = ShopTalkChatFragment.newInstance(config)
            supportFragmentManager.commit { replace(CONTAINER_ID, chat, CHAT_TAG) }
            val userId = intent.getStringExtra("user_id")
            val hash = intent.getStringExtra("user_hash")
            if (userId != null && hash != null) {
                // Sent BEFORE the widget loads on purpose: proves the pre-ready
                // queue and the widget-side pre-session parking end to end.
                chat.identify(ShopTalkUser(userId = userId, hash = hash))
            }
        }
        chat()?.listener = closeListener
    }

    override fun onResumeFragments() {
        super.onResumeFragments()
        // Listener is a plain field, so re-attach after a configuration change.
        chat()?.listener = closeListener
    }

    private fun chat(): ShopTalkChatFragment? =
        supportFragmentManager.findFragmentByTag(CHAT_TAG) as? ShopTalkChatFragment

    private val closeListener = object : ShopTalkListener {
        override fun onCloseRequest() {
            Log.i(TAG, "close-request → finishing")
            finish()
        }

        override fun onReady() {
            Log.i(TAG, "widget ready")
        }

        override fun onIdentified(ok: Boolean) {
            Log.i(TAG, "identified ok=$ok")
        }
    }

    companion object {
        private const val TAG = "ShopTalkSample"
        private const val CONTAINER_ID = 0x0F0F01
        private const val CHAT_TAG = "shoptalk-chat"

        /**
         * Staging by default. shop/agent stay unset until go2joy onboarding
         * (PLN-260827 W5) fixes the real values; unset = guest chat against the
         * default tenant resolution, which is enough for device verification.
         */
        private const val DEFAULT_WIDGET_URL = "https://shoptalk.amoeba.site/widget/"
    }
}

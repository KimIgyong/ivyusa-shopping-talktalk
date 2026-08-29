# The widget calls window.ShopTalkAndroid.postMessage — the @JavascriptInterface
# member must survive the host app's minification or messages silently stop.
-keepclassmembers class site.amoeba.shoptalk.** {
    @android.webkit.JavascriptInterface <methods>;
}

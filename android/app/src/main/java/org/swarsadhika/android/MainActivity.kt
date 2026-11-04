package org.swarsadhika.android

import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {
    private var localServer: SwarSadhikaNanoServer? = null
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = true
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        setContentView(webView)

        try {
            localServer = SwarSadhikaNanoServer(assets, 8765).also { it.start() }
            webView.loadUrl(SwarSadhikaNanoServer.BASE_URL)
        } catch (error: Exception) {
            Toast.makeText(this, "स्थानीय Server शुरू नहीं हुआ: ${error.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        localServer?.stop()
        localServer = null
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}

package com.vexa.chat

import android.Manifest
import android.app.DownloadManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private var uploadCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private val site = "https://vexa-7.vercel.app/"

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val urls = if (result.resultCode == RESULT_OK) {
            data?.clipData?.let { clip -> Array(clip.itemCount) { clip.getItemAt(it).uri } }
                ?: data?.data?.let { arrayOf(it) }
        } else null
        uploadCallback?.onReceiveValue(urls)
        uploadCallback = null
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val request = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        val allowed = request.resources.filter { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                    grants[Manifest.permission.CAMERA] == true ||
                        checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                    grants[Manifest.permission.RECORD_AUDIO] == true ||
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                else -> false
            }
        }.toTypedArray()
        if (allowed.isNotEmpty()) request.grant(allowed) else request.deny()
    }

    private fun downloadApk(url: String, userAgent: String? = null) {
        try {
            val uri = Uri.parse(url)
            val host = uri.host ?: ""
            // Yalnızca Vexa deposunun resmi GitHub Releases APK dosyaları.
            if (uri.scheme != "https" || host != "github.com" ||
                !uri.path.orEmpty().startsWith("/lastshadow1907-creator/vexa-7/releases/download/") ||
                !uri.path.orEmpty().endsWith(".apk", ignoreCase = true)) {
                Toast.makeText(this, "Güvenilmeyen APK bağlantısı", Toast.LENGTH_SHORT).show()
                return
            }
            val filename = uri.lastPathSegment?.takeIf { it.endsWith(".apk", true) } ?: "Vexa.apk"
            val req = DownloadManager.Request(uri)
                .setTitle(filename)
                .setDescription("Vexa güncellemesi indiriliyor")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            if (!userAgent.isNullOrBlank()) req.addRequestHeader("User-Agent", userAgent)
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            Toast.makeText(this, "Vexa APK indiriliyor. İndirilenler bölümünden yükleyebilirsin.", Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            Toast.makeText(this, "APK indirilemedi", Toast.LENGTH_SHORT).show()
        }
    }

    private fun handleAuthCallback(uri: Uri?) {
        if (uri?.scheme != "com.vexa.chat" || uri.host != "auth" || uri.path != "/callback") return
        val code = uri.getQueryParameter("code") ?: return
        val callback = Uri.parse(site).buildUpon().appendQueryParameter("code", code).build().toString()
        web.loadUrl(callback)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthCallback(intent.data)
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    private fun deliverFirebaseToken() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            val quoted = JSONObject.quote(token)
            val js = "sessionStorage.setItem('vexa-fcm-token', $quoted);window.dispatchEvent(new CustomEvent('vexa-fcm-token', {detail: $quoted}));"
            web.evaluateJavascript(js, null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        WebView.setWebContentsDebuggingEnabled(false)
        val installedVersion = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
        } catch (_: Exception) { "1.0" }
        web.settings.userAgentString = web.settings.userAgentString + " VexaAndroid/" + installedVersion
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (Uri.parse(url).host == "vexa-7.vercel.app") deliverFirebaseToken()
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && url.host == "github.com" &&
                    url.path.orEmpty().startsWith("/lastshadow1907-creator/vexa-7/releases/download/") &&
                    url.path.orEmpty().endsWith(".apk", ignoreCase = true)) {
                    downloadApk(url.toString(), view.settings.userAgentString)
                    return true
                }
                if (url.scheme == "https" &&
                    (url.host == "vexa-7.vercel.app" || url.host?.endsWith(".supabase.co") == true)
                ) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (_: Exception) {
                    true
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                uploadCallback?.onReceiveValue(null)
                uploadCallback = filePathCallback
                return try {
                    filePicker.launch(fileChooserParams?.createIntent()
                        ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                            type = "*/*"
                            addCategory(Intent.CATEGORY_OPENABLE)
                        })
                    true
                } catch (_: Exception) {
                    uploadCallback?.onReceiveValue(null)
                    uploadCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.scheme != "https" || request.origin.host != "vexa-7.vercel.app") {
                        request.deny()
                        return@runOnUiThread
                    }
                    pendingPermission?.deny()
                    pendingPermission = request
                    val needed = mutableListOf<String>()
                    if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
                        checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                    ) needed.add(Manifest.permission.CAMERA)
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                    ) needed.add(Manifest.permission.RECORD_AUDIO)

                    if (needed.isEmpty()) {
                        val allowed = request.resources.filter {
                            it == PermissionRequest.RESOURCE_VIDEO_CAPTURE ||
                                it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                        }.toTypedArray()
                        if (allowed.isNotEmpty()) request.grant(allowed) else request.deny()
                        pendingPermission = null
                    } else {
                        permissionLauncher.launch(needed.toTypedArray())
                    }
                }
            }
        }

        web.setDownloadListener { url, userAgent, _, _, _ ->
            downloadApk(url, userAgent)
        }

        if (savedInstanceState == null) web.loadUrl(site) else web.restoreState(savedInstanceState)
        if (intent?.data != null) handleAuthCallback(intent.data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        if (::web.isInitialized && Uri.parse(web.url ?: "").host == "vexa-7.vercel.app") deliverFirebaseToken()
    }

    override fun onDestroy() {
        pendingPermission?.deny()
        uploadCallback?.onReceiveValue(null)
        web.destroy()
        super.onDestroy()
    }
}

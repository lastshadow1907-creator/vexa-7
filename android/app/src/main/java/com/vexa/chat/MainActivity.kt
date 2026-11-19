    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val request = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        val allowed = request.resources.filter { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> grants[Manifest.permission.CAMERA] == true || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> grants[Manifest.permission.RECORD_AUDIO] == true || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                else -> false
            }
        }.toTypedArray()
        if (allowed.isNotEmpty()) request.grant(allowed) else request.deny()
    }
    private fun handleAuthCallback(uri: Uri?) {
        if (uri?.scheme != "com.vexa.chat" || uri.host != "auth" || uri.path != "/callback") return
        val code = uri.getQueryParameter("code") ?: return
        // PKCE code exchange runs in the WebView, where the verifier was stored.
        val callback = Uri.parse(site).buildUpon().appendQueryParameter("code", code).build().toString()
        web.loadUrl(callback)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthCallback(intent.data)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Reklam alani olmadan WebView tum uygulama ekranini kaplar.
        web = WebView(this)
        setContentView(web)

        WebView.setWebContentsDebuggingEnabled(false)
        web.settings.userAgentString = web.settings.userAgentString + " VexaAndroid"
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
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && (url.host == "vexa-7.vercel.app" || url.host?.endsWith(".supabase.co") == true)) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, url)); true } catch (_: Exception) { true }
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                uploadCallback?.onReceiveValue(null)
                uploadCallback = filePathCallback
                return try { filePicker.launch(fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply { type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE) }); true }
                catch (_: Exception) { uploadCallback?.onReceiveValue(null); uploadCallback = null; false }
            }
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.scheme != "https" || request.origin.host != "vexa-7.vercel.app") { request.deny(); return@runOnUiThread }
                    pendingPermission?.deny()
                    pendingPermission = request
                    val needed = mutableListOf<String>()
                    if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.CAMERA)
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.RECORD_AUDIO)
                    if (needed.isEmpty()) {
                        val allowed = request.resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray()
                        if (allowed.isNotEmpty()) request.grant(allowed) else request.deny()
                        pendingPermission = null
                    } else permissionLauncher.launch(needed.toTypedArray())
                }
            }
        }
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                if (!url.startsWith("https://")) return@setDownloadListener
                val req = DownloadManager.Request(Uri.parse(url))
                    .setMimeType(mimeType)
                    .addRequestHeader("User-Agent", userAgent)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimeType))
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                Toast.makeText(this, "İndirme başladı", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) { Toast.makeText(this, "İndirme başlatılamadı", Toast.LENGTH_SHORT).show() }
        }
        if (savedInstanceState == null) web.loadUrl(site) else web.restoreState(savedInstanceState)
        if (intent?.data != null) handleAuthCallback(intent.data)
    }
    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
    override fun onPause() {
        web.onPause()
        super.onPause()
    }
    override fun onResume() {
        super.onResume()
        web.onResume()
    }
    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}

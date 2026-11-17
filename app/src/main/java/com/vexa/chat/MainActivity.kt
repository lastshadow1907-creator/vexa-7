package com.vexa.chat

import android.Manifest
import androidx.activity.ComponentActivity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.*
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.view.Gravity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.MobileAds
import androidx.activity.result.contract.ActivityResultContracts
import android.app.DownloadManager
import android.content.Context
import android.os.Environment
import android.view.ViewGroup
import android.webkit.URLUtil
import android.widget.Toast
import android.widget.Button
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private var bannerAd: AdView? = null
    private var rewardedAd: RewardedAd? = null
    private lateinit var rewardButton: Button
    private var rewardLoading = false

    // Vexa AdMob kimlikleri. Canli reklamlar, riza ve testler tamamlanmadan acilmaz.
    private val realBannerId = "ca-app-pub-9211780677889602/2940643971"
    private val realRewardedId = "ca-app-pub-9211780677889602/3402457210"
    private val testBannerId = "ca-app-pub-3940256099942544/6300978111"
    private val testRewardedId = "ca-app-pub-3940256099942544/5224354917"
    private val useTestAds = true
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
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> grants[Manifest.permission.CAMERA] == true || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> grants[Manifest.permission.RECORD_AUDIO] == true || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                else -> false
            }
        }.toTypedArray()
        if (allowed.isNotEmpty()) request.grant(allowed) else request.deny()
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // WebView ekrani doldurur; reklam altta AYRI bir alanda durur.
        // Bu sayede mesaj yazma kutusu veya alt menu uzerine reklam binmez.
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        web = WebView(this)
        root.addView(web, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        val bannerSlot = FrameLayout(this)
        root.addView(bannerSlot, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        rewardButton = Button(this).apply {
            text = "Ödüllü reklam izle (TEST)"
            isAllCaps = false
            setOnClickListener { showRewardedAd() }
        }
        root.addView(rewardButton, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        setContentView(root)

        // TEST REKLAMI: Bu ID Google'in herkese acik test banner kimligidir.
        // Canli reklama gecmeden once AdMob hesap, izin/consent ve yayin kosullari tamamlanmali.
        bannerAd = AdView(this).apply {
            setAdSize(AdSize.BANNER)
            adUnitId = if (useTestAds) testBannerId else realBannerId
        }
        bannerSlot.addView(bannerAd, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))
        Thread {
            MobileAds.initialize(applicationContext) {
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        bannerAd?.loadAd(AdRequest.Builder().build())
                    }
                }
            }
        }.start()
        WebView.setWebContentsDebuggingEnabled(false)
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
    }
    private fun showRewardedAd() {
        if (rewardLoading) return
        rewardLoading = true
        rewardButton.isEnabled = false
        rewardButton.text = "Reklam yükleniyor..."
        RewardedAd.load(
            this,
            if (useTestAds) testRewardedId else realRewardedId,
            AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    if (isFinishing || isDestroyed) return
                    rewardedAd = ad
                    rewardLoading = false
                    rewardButton.isEnabled = true
                    rewardButton.text = "Ödüllü reklam izle (TEST)"
                    ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                        override fun onAdDismissedFullScreenContent() {
                            rewardedAd = null
                        }
                        override fun onAdFailedToShowFullScreenContent(error: AdError) {
                            rewardedAd = null
                            Toast.makeText(this@MainActivity, "Reklam açılamadı", Toast.LENGTH_SHORT).show()
                        }
                    }
                    ad.show(this@MainActivity) { reward ->
                        // Burada yalnızca test ödülü bildiriliyor.
                        // Gerçek Vexa Coin için sunucu tarafı SSV + Supabase işlemi gerekli.
                        Toast.makeText(
                            this@MainActivity,
                            "Test ödülü tamamlandı (hesaba coin eklenmedi)",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    rewardedAd = null
                    rewardLoading = false
                    if (!isFinishing && !isDestroyed) {
                        rewardButton.isEnabled = true
                        rewardButton.text = "Ödüllü reklam izle (TEST)"
                        Toast.makeText(this@MainActivity, "Reklam yüklenemedi: ${error.code}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
    }

    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
    override fun onPause() {
        bannerAd?.pause()
        web.onPause()
        super.onPause()
    }
    override fun onResume() {
        super.onResume()
        web.onResume()
        bannerAd?.resume()
    }
    override fun onDestroy() {
        bannerAd?.destroy()
        bannerAd = null
        web.destroy()
        super.onDestroy()
    }
}

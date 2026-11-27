package com.vexa.chat

import android.app.*
import android.content.Intent
import android.content.Context
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.max

/** Local, consent-based capture. Frames stay in memory and are sent through the existing WebRTC call. */
class VexaScreenService : Service() {
    companion object {
        @Volatile var session = ""
        @Volatile var state = "idle"
        @Volatile var frame = ""
        @Volatile var frameNumber = 0L
        @Volatile var heartbeat = 0L
    }
    private val main = Handler(Looper.getMainLooper())
    private var worker: HandlerThread? = null
    private var projection: MediaProjection? = null
    private var reader: ImageReader? = null
    private var display: VirtualDisplay? = null
    private var ownSession = ""
    private var closing = false
    private var lastFrameAt = 0L
    private val watchdog = object : Runnable {
        override fun run() {
            if (session != ownSession || SystemClock.elapsedRealtime() - heartbeat > 15000L) stopSelf()
            else main.postDelayed(this, 2000)
        }
    }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") { stopSelf(); return START_NOT_STICKY }
        if (projection != null) return START_NOT_STICKY
        ownSession = intent?.getStringExtra("session").orEmpty()
        if (ownSession.isEmpty() || session != ownSession || state != "starting") { stopSelf(); return START_NOT_STICKY }
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel("vexa_screen_share", "Vexa ekran paylaşımı", NotificationManager.IMPORTANCE_LOW))
            val stop = PendingIntent.getService(this, 12102, Intent(this, VexaScreenService::class.java).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = Notification.Builder(this, "vexa_screen_share")
                .setSmallIcon(android.R.drawable.ic_menu_share).setContentTitle("Vexa ekran paylaşımı")
                .setContentText("Ekranın görüşmedeki kişiye aktarılıyor.").setOngoing(true)
                .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Durdur", stop).build()).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(12101, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            else startForeground(12101, notification)
            val data = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra("consent", Intent::class.java) else {
                @Suppress("DEPRECATION")
                intent?.getParcelableExtra<Intent>("consent")
            }
            requireNotNull(data)
            val manager = getSystemService(MediaProjectionManager::class.java)
            val mp = manager.getMediaProjection(Activity.RESULT_OK, data) ?: error("Ekran izni alınamadı")
            projection = mp
            mp.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { stopSelf() }
            }, main)
            val metrics = resources.displayMetrics
            val scale = 720.0 / max(metrics.widthPixels, metrics.heightPixels).coerceAtLeast(1)
            val width = (metrics.widthPixels * scale).toInt().coerceAtLeast(2)
            val height = (metrics.heightPixels * scale).toInt().coerceAtLeast(2)
            val thread = HandlerThread("VexaScreenCapture").apply { start() }; worker = thread
            val ir = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2); reader = ir
            ir.setOnImageAvailableListener({ source ->
                try {
                    source.acquireLatestImage()?.use { img ->
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastFrameAt < 200 || session != ownSession) return@use
                        lastFrameAt = now
                        val plane = img.planes[0]
                        val paddedWidth = plane.rowStride / plane.pixelStride
                        val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
                        try {
                            plane.buffer.rewind(); padded.copyPixelsFromBuffer(plane.buffer)
                            val bitmap = Bitmap.createBitmap(padded, 0, 0, width, height)
                            try {
                                val bytes = ByteArrayOutputStream()
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 55, bytes)
                                if (session == ownSession) { frame = Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP); frameNumber++ }
                            } finally { if (bitmap !== padded) bitmap.recycle() }
                        } finally { padded.recycle() }
                    }
                } catch (_: Exception) { /* next frame can recover */ }
            }, Handler(thread.looper))
            display = mp.createVirtualDisplay("VexaScreen", width, height, metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, ir.surface, null, null)
            state = "running"
            main.postDelayed(watchdog, 2000)
        } catch (_: Exception) { if (session == ownSession) state = "error"; stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        if (closing) return
        closing = true
        main.removeCallbacksAndMessages(null)
        reader?.setOnImageAvailableListener(null, null)
        display?.release(); reader?.close(); projection?.stop(); worker?.quitSafely()
        if (session == ownSession) { frame = ""; if (state != "error") state = "stopped" }
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}

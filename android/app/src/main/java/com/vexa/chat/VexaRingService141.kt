package com.vexa.chat

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat

class VexaRingService141 : Service() {
    companion object {
        @Volatile var isRinging = false
            private set
        @Volatile private var activeId: Int? = null
        fun start(context: Context, id: Int, title: String, notification: Notification) {
            // Cancel any legacy foreground-only ringtone, then use a single playback owner.
            VexaMessagingService.stopRinging()
            val intent = Intent(context, VexaRingService141::class.java).apply {
                putExtra("id", id); putExtra("title", title); putExtra("notification", notification)
            }
            try { ContextCompat.startForegroundService(context, intent) }
            catch (_: Exception) {
                (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, notification)
                VexaMessagingService.ring(context, id)
            }
        }
        fun stop(context: Context, id: Int? = null) {
            if (id != null && activeId != null && activeId != id) return
            context.stopService(Intent(context, VexaRingService141::class.java))
        }
    }
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private val end = Runnable { stopSelf() }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getIntExtra("id", 11901) ?: 11901
        @Suppress("DEPRECATION")
        val notification = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra("notification", Notification::class.java) else intent?.getParcelableExtra<Notification>("notification")
        if (notification == null) { stopSelf(); return START_NOT_STICKY }
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            else startForeground(id, notification)
        } catch (_: Exception) { stopSelf(); return START_NOT_STICKY }
        activeId = id; isRinging = true
        handler.removeCallbacks(end); handler.postDelayed(end, 45000L)
        try {
            player?.release(); player = null
            val audio = getSystemService(AUDIO_SERVICE) as AudioManager
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            val channel = nm.getNotificationChannel("vexa_calls_v141")
            if (audio.ringerMode == AudioManager.RINGER_MODE_NORMAL && nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL && (channel?.importance ?: 0) >= NotificationManager.IMPORTANCE_DEFAULT) {
                val p = MediaPlayer()
                player = p
                p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                p.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
                p.setDataSource(this, VexaRing141.uri(this))
                p.isLooping = true
                p.setOnErrorListener { _, _, _ -> stopSelf(); true }
                p.prepare()
                p.start()
            }
        } catch (_: Exception) { player?.release(); player = null }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        handler.removeCallbacks(end)
        try { player?.release() } catch (_: Exception) {}
        player = null; isRinging = false; activeId = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}

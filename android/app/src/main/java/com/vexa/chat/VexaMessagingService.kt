package com.vexa.chat

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.media.Ringtone
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class VexaMessagingService : FirebaseMessagingService() {
    companion object {
        private val handler = Handler(Looper.getMainLooper())
        private var ringing: Ringtone? = null
        private var ringingId: Int? = null
        private var timeout: Runnable? = null
        fun stopRinging(id: Int? = null) {
            handler.post {
                if (id != null && ringingId != id) return@post
                timeout?.let { handler.removeCallbacks(it) }; timeout = null
                try { ringing?.stop() } catch (_: Exception) {}
                ringing = null; ringingId = null
            }
        }
        fun ring(context: android.content.Context, id: Int) {
            handler.post {
                if (ringingId == id && ringing?.isPlaying == true) return@post
                timeout?.let { handler.removeCallbacks(it) }
                try { ringing?.stop() } catch (_: Exception) {}
                ringing = null; ringingId = null
                val audio = context.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
                val nm = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
                if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL || nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return@post
                if (nm.activeNotifications.any { it.id == id }) return@post
                val channel = nm.getNotificationChannel("vexa_calls_v133")
                if (channel == null || channel.importance < NotificationManager.IMPORTANCE_DEFAULT || channel.sound == null) return@post
                try {
                    val r = RingtoneManager.getRingtone(context.applicationContext, channel.sound) ?: return@post
                    r.audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    if (Build.VERSION.SDK_INT >= 28) r.isLooping = true
                    ringing = r; ringingId = id; r.play()
                    val task = Runnable { stopRinging(id) }; timeout = task; handler.postDelayed(task, 45000L)
                } catch (_: Exception) { ringing = null; ringingId = null }
            }
        }
    }
    override fun onMessageReceived(message: RemoteMessage) {
        val kind = message.data["type"] ?: "message"
        val title = message.data["title"] ?: message.notification?.title ?: "Vexa"
        val body = message.data["body"] ?: message.notification?.body ?: "Yeni bildirimin var"
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val callId = message.data["call_id"] ?: message.data["callId"]
        val callNotificationId = callId?.let { ("vexa-call:" + it).hashCode() } ?: 11901
        if (kind in listOf("call_ended", "call_cancelled", "call_accepted", "call_rejected")) {
            manager.cancel(callNotificationId)
            stopRinging(callNotificationId)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val incoming = kind in listOf("call", "incoming_call", "audio_call", "video_call")
        val channelId = if (incoming) "vexa_calls_v133" else "vexa_messages"
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(channelId, if (incoming) "Vexa gelen arama zili" else "Mesajlar ve arkadaşlık istekleri", NotificationManager.IMPORTANCE_HIGH)
            if (incoming) {
                channel.setSound(ringtone, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                channel.enableVibration(true)
                channel.vibrationPattern = longArrayOf(0, 500, 250, 500)
                channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
            manager.createNotificationChannel(channel)
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            if (incoming) { putExtra("vexa_call_id", callId); putExtra("vexa_incoming", true); putExtra("vexa_notification_id", callNotificationId) }
        }
        val id = if (incoming) callNotificationId else (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
        val pending = PendingIntent.getActivity(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(if (incoming) android.R.drawable.ic_menu_call else android.R.drawable.ic_dialog_email)
            .setContentTitle(title).setContentText(body).setAutoCancel(!incoming).setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        if (incoming) {
            builder.setCategory(NotificationCompat.CATEGORY_CALL).setTimeoutAfter(45000L).setOngoing(true)
                .addAction(android.R.drawable.ic_menu_call, "Aramayı aç", pending)
            if (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()) builder.setFullScreenIntent(pending, true)
            if (Build.VERSION.SDK_INT < 26) builder.setSound(ringtone).setVibrate(longArrayOf(0, 500, 250, 500))
        }
        val notification = builder.build()
        if (incoming) notification.flags = notification.flags or Notification.FLAG_INSISTENT
        manager.notify(id, notification)
    }
}

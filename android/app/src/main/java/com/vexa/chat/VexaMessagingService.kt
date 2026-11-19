package com.vexa.chat

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class VexaMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val kind = message.data["type"] ?: "message"
        val title = message.data["title"] ?: message.notification?.title ?: "Vexa"
        val body = message.data["body"] ?: message.notification?.body ?: "Yeni bildirimin var"
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val channelId = if (kind == "call") "vexa_calls" else "vexa_messages"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(channelId,
                if (kind == "call") "Gelen aramalar" else "Mesajlar ve arkadaşlık istekleri",
                NotificationManager.IMPORTANCE_HIGH)
            manager.createNotificationChannel(channel)
        }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}

package com.vexa.chat

import android.content.Context
import android.net.Uri
import android.content.ContentResolver

object VexaRing141 {
    fun uri(context: Context): Uri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.packageName + "/" + R.raw.vexa_ring141)
}

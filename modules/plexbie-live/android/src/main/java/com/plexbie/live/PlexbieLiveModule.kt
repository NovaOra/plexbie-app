package com.plexbie.live

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A request's live progress as one ongoing notification, updated in place (keyed by the
 * request). One bar for the whole journey: downloading fills the first 80%, unpacking
 * the next 10, adding to Plex the last 10, with Plexbie's TV riding along it. On Android
 * 16 it asks to be promoted to a Live Update: a chip in the status bar and a place at the
 * top of the shade. Older Androids show the same notification with a plain bar.
 *
 * Every notification times itself out (setTimeoutAfter), so if the updates stop coming
 * (the bot is down, the phone offline) it goes by itself instead of staying forever.
 */
class PlexbieLiveModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PlexbieLive")

    /** Whether Android will show these as Live Updates (Android 16, and not turned off for the app). */
    Function("canPromote") {
      if (Build.VERSION.SDK_INT < 36) false
      else context.getSystemService(NotificationManager::class.java).canPostPromotedNotifications()
    }

    AsyncFunction("show") { id: String, slot: Int?, title: String, text: String, stage: String, percent: Int?, timeoutMs: Double, promote: Boolean ->
      show(id, slot, title, text, stage, percent, timeoutMs.toLong(), promote)
    }

    AsyncFunction("end") { id: String ->
      NotificationManagerCompat.from(context).cancel(TAG_PREFIX + id, NOTIFICATION_ID)
    }

    AsyncFunction<Unit>("endAll") {
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.activeNotifications
        .filter { it.tag?.startsWith(TAG_PREFIX) == true }
        .forEach { manager.cancel(it.tag, it.id) }
    }
  }

  /** `promote`: a Live Update (the status bar chip, and the top of the shade). Without it,
   *  it's an ordinary silent notification, down with the other silent ones. */
  private fun show(id: String, slot: Int?, title: String, text: String, stage: String, percent: Int?, timeoutMs: Long, promote: Boolean) {
    makeChannel()
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val (overall, indeterminate) = when (stage) {
      "downloading" -> (((percent ?: 0) * 80) / 100) to (percent == null)
      "unpacking" -> (80 + ((percent ?: 50) * 10) / 100) to false
      else -> 95 to false   // importing: adding it to Plex
    }
    val chip = when (stage) {
      "downloading" -> percent?.let { "$it%" } ?: "Getting"
      "unpacking" -> "Unpacking"
      else -> "To Plex"
    }
    val builder = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(icon)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setColor(PINK)
      .setContentIntent(openIntent(id, slot))
      .setTimeoutAfter(timeoutMs)
      .setRequestPromotedOngoing(promote)
    if (promote) builder.setShortCriticalText(chip)
    if (Build.VERSION.SDK_INT >= 36) {
      val style = NotificationCompat.ProgressStyle()
        .setProgressSegments(listOf(
          NotificationCompat.ProgressStyle.Segment(80).setColor(PINK),
          NotificationCompat.ProgressStyle.Segment(10).setColor(LILAC),
          NotificationCompat.ProgressStyle.Segment(10).setColor(SCREEN),
        ))
        .setProgressPoints(listOf(
          NotificationCompat.ProgressStyle.Point(80).setColor(LILAC),
          NotificationCompat.ProgressStyle.Point(90).setColor(SCREEN),
        ))
        .setProgress(overall)
        .setProgressIndeterminate(indeterminate)
        .setProgressTrackerIcon(IconCompat.createWithResource(context, icon))
      builder.setStyle(style)
    } else {
      builder.setProgress(100, overall, indeterminate)
    }
    try {
      NotificationManagerCompat.from(context).notify(TAG_PREFIX + id, NOTIFICATION_ID, builder.build())
    } catch (e: SecurityException) {
      // Notifications turned off for Plexbie: nothing to show it in.
    }
  }

  /** Tapping it opens the request (com.plexbie.app:///request/214), or the app. */
  private fun openIntent(id: String, slot: Int?): PendingIntent {
    val intent = if (slot != null) {
      Intent(Intent.ACTION_VIEW, Uri.parse("com.plexbie.app:///request/$slot")).setPackage(context.packageName)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, id.hashCode(), intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun makeChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL) != null) return
    // Low: in the shade and (Android 16) the status bar, but never a sound, a buzz or a banner.
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Live progress", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Your requests while they download, until they're on Plex."
      setShowBadge(false)
    })
  }

  companion object {
    private const val CHANNEL = "live"
    private const val TAG_PREFIX = "plexbie-live:"
    private const val NOTIFICATION_ID = 7341
    private const val PINK = 0xFFFF5C93.toInt()
    private const val LILAC = 0xFFB9A7E8.toInt()
    private const val SCREEN = 0xFFFFD1E4.toInt()
  }
}

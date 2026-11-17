package uk.co.heartbeatart.app

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * About every 30 minutes (Android groups it with other apps' work, so it costs almost no battery):
 * picks up the newest picture for the lock screen / wallpaper. A new picture is only asked for when a
 * wallpaper is on, the screen is on, and the last request was over an hour ago.
 */
class RefreshJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        val store = Store(this)
        if (!store.signedIn) return false
        val wallpaperOn = store.lockScreen || store.homeScreen
        val wantPicture = wallpaperOn && !store.paused && Schedule.screenOn(this) && System.currentTimeMillis() - store.lastWallpaperRequest > 60 * 60 * 1000L
        Background.run({
            Picture.refresh(this, wantPicture)
            if (wantPicture) store.lastWallpaperRequest = System.currentTimeMillis()
            Wallpaper.applyIfNew(this)
        }) { jobFinished(params, false) }
        return true
    }
    override fun onStopJob(params: JobParameters) = true
}

package uk.co.heartbeatart.app

// The full-screen picture: used by Android's screensaver (HeartbeatDream) and by "frame" mode (FrameActivity).
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Bundle
import android.os.SystemClock
import android.service.dreams.DreamService
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Fills the screen with the picture (cropping the overflow), fades to each new one, and draws the clock. */
class FrameView(context: Context) : View(context) {
    private var current: Bitmap? = null
    private var next: Bitmap? = null
    private var fadeStart = 0L
    var caption = ""; set(v) { field = v; invalidate() }
    var message = ""; set(v) { field = v; invalidate() }
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val clockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(235, 255, 255, 255); typeface = Typeface.create("sans-serif-light", Typeface.NORMAL); setShadowLayer(6f, 0f, 2f, Color.argb(120, 0, 0, 0)) }
    private val smallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(225, 255, 255, 255); setShadowLayer(5f, 0f, 2f, Color.argb(120, 0, 0, 0)) }
    private val clock = SimpleDateFormat("HH:mm", Locale.getDefault())

    fun show(bitmap: Bitmap) {
        if (current == null) { current = bitmap; invalidate(); return }
        next = bitmap; fadeStart = SystemClock.uptimeMillis(); invalidate()
    }

    private fun cover(b: Bitmap): RectF {
        val scale = maxOf(width.toFloat() / b.width, height.toFloat() / b.height)
        val w = b.width * scale; val h = b.height * scale
        return RectF((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2)
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(Color.BLACK)
        current?.let { paint.alpha = 255; canvas.drawBitmap(it, null as Rect?, cover(it), paint) }
        next?.let {
            val t = ((SystemClock.uptimeMillis() - fadeStart) / 3200f).coerceIn(0f, 1f)
            paint.alpha = (t * 255).toInt(); canvas.drawBitmap(it, null as Rect?, cover(it), paint)
            if (t >= 1f) { current = it; next = null } else postInvalidateOnAnimation()
        }
        val unit = minOf(width, height) / 100f
        clockPaint.textSize = unit * 13; smallPaint.textSize = unit * 3.6f
        val x = unit * 6; val bottom = height - unit * 7
        canvas.drawText(clock.format(Date()), x - unit * 0.6f, bottom - smallPaint.textSize * 1.5f, clockPaint)
        if (caption.isNotEmpty()) canvas.drawText(caption, x, bottom, smallPaint)
        if (message.isNotEmpty()) { val w = smallPaint.measureText(message); canvas.drawText(message, (width - w) / 2, height * 0.45f, smallPaint) }
    }
}

/** Keeps a FrameView up to date: asks for new pictures while visible and reports watch time. */
class FrameController(private val context: Context, private val view: FrameView) {
    private val presence = Presence(context)
    private var running = false
    private var shownId = ""
    private var seconds = 0
    private var nextCheck = 0
    private val tick = object : Runnable { override fun run() { if (!running) return; second(); view.postDelayed(this, 1000) } }

    fun start() {
        running = true
        val info = Picture.info(context)
        Picture.bitmap(context)?.let { view.show(it); shownId = info.optString("id") }
        view.caption = Picture.caption(info)
        view.message = when { !Store(context).signedIn -> "Open Heartbeat to sign in"; shownId.isEmpty() -> "Your first picture is on its way…"; else -> "" }
        seconds = 0; nextCheck = 0; view.post(tick)
    }
    fun stop() { running = false; view.removeCallbacks(tick) }

    private fun second() {
        seconds++
        if (seconds % 60 == 0) { view.invalidate(); presence.report() }
        if (seconds >= nextCheck) check()
    }
    private var checking = false
    private fun check() {
        if (checking) return; checking = true; nextCheck = seconds + 60
        val store = Store(context)
        Background.run({ Picture.refresh(context, !store.paused) }) { result ->
            checking = false
            val state = result.getOrNull() ?: return@run
            if (seconds < 5) presence.report()
            if (state.optBoolean("making")) nextCheck = seconds + 20
            val info = Picture.info(context)
            view.caption = Picture.caption(info)
            view.message = if (state.optBoolean("ready")) "" else state.optString("reason")
            val id = info.optString("id")
            if (id.isNotEmpty() && id != shownId) { Picture.bitmap(context)?.let { view.show(it) }; shownId = id; view.message = ""; Wallpaper.applyIfNew(context) }
        }
    }
}

/** Android's screensaver. Runs while charging or docked; any touch closes it. */
class HeartbeatDream : DreamService() {
    private lateinit var controller: FrameController
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false; isFullscreen = true; isScreenBright = true
        val view = FrameView(this); setContentView(view)
        controller = FrameController(this, view)
    }
    override fun onDreamingStarted() { super.onDreamingStarted(); controller.start() }
    override fun onDreamingStopped() { controller.stop(); super.onDreamingStopped() }
}

/** "Frame" mode: Heartbeat full-screen, screen kept on. Tap to leave. */
class FrameActivity : Activity() {
    private lateinit var controller: FrameController
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (android.os.Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true)
        val view = FrameView(this); setContentView(view)
        view.setOnClickListener { finish() }
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { view.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
        controller = FrameController(this, view)
    }
    override fun onResume() { super.onResume(); controller.start() }
    override fun onPause() { controller.stop(); super.onPause() }
}

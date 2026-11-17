package uk.co.heartbeatart.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/** The only screen with buttons: sign in, then the picture, moods, and where Heartbeat shows. Everything else is on the website. */
class MainActivity : Activity() {
    private val ink = Color.parseColor("#070B10"); private val panel = Color.parseColor("#11171D")
    private val cream = Color.parseColor("#F2F0E7"); private val muted = Color.parseColor("#A6ABB0"); private val accent = Color.parseColor("#FC684B")
    private lateinit var store: Store
    private var email = ""

    private val poller = android.os.Handler(android.os.Looper.getMainLooper())
    private var poll: Runnable? = null
    /** Each screen gets a number; replies meant for an earlier screen are ignored. */
    private var generation = 0
    private var awaitingCode = false
    private fun stopPolling() { poll?.let { poller.removeCallbacks(it) }; poll = null; generation++ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); store = Store(this)
        email = savedInstanceState?.getString("email") ?: ""; awaitingCode = savedInstanceState?.getBoolean("awaitingCode") ?: false
    }
    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); out.putString("email", email); out.putBoolean("awaitingCode", awaitingCode) }
    // Coming back from the email app keeps the code step on screen.
    override fun onResume() { super.onResume(); if (store.signedIn) home() else if (awaitingCode && email.isNotEmpty()) codeStep() else signIn() }
    override fun onPause() { stopPolling(); super.onPause() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun page(): LinearLayout {
        stopPolling()
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(32)) }
        val scroll = ScrollView(this).apply { setBackgroundColor(ink); addView(column) }
        // Android 15+ draws under the status and navigation bars: keep the content clear of them.
        scroll.setOnApplyWindowInsetsListener { v, insets ->
            val bars = if (android.os.Build.VERSION.SDK_INT >= 30) insets.getInsets(android.view.WindowInsets.Type.systemBars()) else null
            @Suppress("DEPRECATION") v.setPadding(0, bars?.top ?: insets.systemWindowInsetTop, 0, bars?.bottom ?: insets.systemWindowInsetBottom); insets
        }
        setContentView(scroll)
        return column
    }
    private fun label(s: String, size: Float = 15f, color: Int = cream, bold: Boolean = false) = TextView(this).apply {
        this.text = s; textSize = size; setTextColor(color); if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setPadding(0, dp(6), 0, dp(6))
    }
    private fun button(s: String, primary: Boolean = true, onClick: () -> Unit) = Button(this).apply {
        this.text = s; isAllCaps = false; textSize = 15f; setTextColor(if (primary) Color.parseColor("#160A06") else cream)
        background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(if (primary) accent else panel) }
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(12) }
    }
    private fun field(hint: String, type: Int) = EditText(this).apply {
        this.hint = hint; inputType = type; setTextColor(cream); setHintTextColor(muted); textSize = 17f
        background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(panel) }; setPadding(dp(16), dp(14), dp(16), dp(14))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) }
    }
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    // ---- Sign in: email, then the six-digit code (same as the website). ----
    private fun signIn() {
        awaitingCode = false
        val c = page()
        c.addView(label("HEARTBEAT", 12f, muted)); c.addView(label("Come on in.", 32f))
        c.addView(label("Enter the email you were invited with. We'll send you a six-digit code.", 15f, muted))
        val emailBox = field("you@example.com", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS); c.addView(emailBox)
        val status = label("", 14f, Color.parseColor("#FCA08C")); c.addView(status)
        lateinit var send: Button
        send = button("Send my code") {
            email = emailBox.text.toString().trim(); send.isEnabled = false; status.text = "Sending…"
            Background.run({ Api().post("/api/product/app/code/send", JSONObject().put("email", email)) }) { r ->
                send.isEnabled = true
                r.onSuccess { codeStep() }.onFailure { status.text = it.message }
            }
        }
        c.addView(send)
    }
    private fun codeStep() {
        awaitingCode = true
        val c = page()
        c.addView(label("HEARTBEAT", 12f, muted)); c.addView(label("Check your email.", 32f))
        c.addView(label("We sent a code to $email. It works for 10 minutes.", 15f, muted))
        val codeBox = field("••••••", InputType.TYPE_CLASS_NUMBER).apply { textSize = 26f; gravity = Gravity.CENTER; letterSpacing = 0.4f }
        c.addView(codeBox)
        val status = label("", 14f, Color.parseColor("#FCA08C")); c.addView(status)
        var busy = false
        fun verify() {
            val code = codeBox.text.toString().filter { it.isDigit() }
            if (code.length != 6 || busy) return; busy = true; status.text = "One moment…"
            val body = JSONObject().put("email", email).put("code", code).put("platform", "android").put("deviceName", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim())
            Background.run({ Api().post("/api/product/app/code/verify", body) }) { r ->
                busy = false
                r.onSuccess {
                    store.token = it.optString("token"); store.email = it.optString("email"); awaitingCode = false
                    Schedule.ensure(this)
                    // Straight away: start the first picture; home shows it painting and sets the lock screen when it lands.
                    store.lastWallpaperRequest = System.currentTimeMillis()
                    home()
                }.onFailure { status.text = it.message }
            }
        }
        codeBox.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { if (s?.length == 6) verify() }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
        })
        c.addView(button("Sign in") { verify() })
        c.addView(button("Use another email", primary = false) { signIn() })
    }

    // ---- Home: the picture, moods, and where Heartbeat shows. ----
    private fun home() {
        Schedule.ensure(this)
        val c = page()
        val preview = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; setBackgroundColor(panel); clipToOutline = true; background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(panel) } }
        val caption = label("", 14f, muted)
        val frame = FrameLayout(this).apply { addView(preview, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(300))); setOnClickListener { startActivity(Intent(this@MainActivity, FrameActivity::class.java)) } }
        c.addView(label("HEARTBEAT", 12f, muted)); c.addView(frame); c.addView(caption)
        val moods = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        c.addView(label("Mood", 13f, muted)); c.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(moods) })
        val notice = label("", 13f, muted); c.addView(notice)

        fun paint() {
            val info = Picture.info(this)
            Picture.bitmap(this, 1600)?.let { preview.setImageBitmap(it) }
            caption.text = listOf(info.optString("title"), Picture.caption(info)).filter { it.isNotEmpty() }.joinToString("  ·  ").ifEmpty { "Your first picture is on its way…" }
            moods.removeAllViews()
            val list = info.optJSONArray("moods"); val current = info.optString("mood")
            for (i in 0 until (list?.length() ?: 0)) {
                val m = list!!.getJSONObject(i); val id = m.optString("id"); val on = id == current
                moods.addView(TextView(this).apply {
                    text = m.optString("label"); textSize = 14f; setTextColor(if (on) Color.parseColor("#160A06") else cream); setPadding(dp(16), dp(10), dp(16), dp(10))
                    background = GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(if (on) accent else panel) }
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) }
                    setOnClickListener {
                        Background.run({ Api(store.token).post("/api/product/app/mood", JSONObject().put("mood", id)); Picture.refresh(this@MainActivity, false) }) { r ->
                            r.onSuccess { toast("Mood: ${m.optString("label")}. Your next picture follows it."); paint() }.onFailure { toast(it.message ?: "") }
                        }
                    }
                })
            }
        }
        paint()
        // Until the first picture exists (or while one is being made), this screen counts as showing: check every 15 seconds.
        val mine = generation
        fun check() {
            if (mine != generation) return
            val first = Picture.info(this).optString("id").isEmpty()
            Background.run({ val s = Picture.refresh(this, first); runCatching { Wallpaper.applyIfNew(this) }; s }) { r ->
                if (mine != generation) return@run
                r.onSuccess { s ->
                    if (s == null) { signIn(); return@onSuccess }
                    paint()
                    notice.text = when { !s.optBoolean("ready") -> s.optString("reason"); s.optBoolean("making") -> "Painting a new picture…"; s.optString("notice").isNotEmpty() -> s.optString("notice"); else -> "" }
                    if (s.optBoolean("ready") && (Picture.info(this).optString("id").isEmpty() || s.optBoolean("making"))) { poll = Runnable { check() }; poller.postDelayed(poll!!, 15000) }
                }.onFailure { if (!store.signedIn) signIn() else notice.text = "Offline: showing your latest picture." }
            }
        }
        check()

        c.addView(label("Where Heartbeat shows", 13f, muted).apply { setPadding(0, dp(20), 0, dp(4)) })
        c.addView(button("Open frame (full screen, stays on)") { startActivity(Intent(this, FrameActivity::class.java)) })
        c.addView(toggle("Lock screen picture", store.lockScreen) { store.lockScreen = it; store.wallpaperId = ""; applyWallpaper() })
        c.addView(toggle("Home screen wallpaper", store.homeScreen) { store.homeScreen = it; store.wallpaperId = ""; applyWallpaper() })
        c.addView(button("Use as screensaver while charging", primary = false) {
            toast("Choose \"Heartbeat\" in the list, then set it to start while charging.")
            runCatching { startActivity(Intent(Settings.ACTION_DREAM_SETTINGS)) }.onFailure { toast("This phone hides the screensaver setting. Use \"Open frame\" while charging instead.") }
        })
        c.addView(button(if (store.paused) "Resume new pictures" else "Pause new pictures for 1 hour", primary = false) {
            store.pausedUntil = if (store.paused) 0 else System.currentTimeMillis() + 3600_000; home()
        })
        c.addView(label("Account", 13f, muted).apply { setPadding(0, dp(20), 0, dp(4)) })
        c.addView(button("Open my studio (city, account)", primary = false) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("$SERVER/app"))) })
        val update = button("Update available: download", primary = true) { }.apply { visibility = View.GONE }
        c.addView(update)
        Background.run({ Updates.check() }) { r -> r.getOrNull()?.let { url -> update.visibility = View.VISIBLE; update.setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } } }
        c.addView(button("Sign out", primary = false) {
            Background.run({ runCatching { Api(store.token).post("/api/product/app/signout") } }) { store.token = ""; Schedule.cancel(this); signIn() }
        })
        c.addView(label("Signed in as ${store.email}", 12f, muted))
    }

    private fun applyWallpaper() {
        Background.run({ Wallpaper.apply(this) }) { r -> r.onFailure { toast("Couldn't set the picture: ${it.message}") } }
    }
    private fun toggle(s: String, on: Boolean, changed: (Boolean) -> Unit) = Switch(this).apply {
        text = s; isChecked = on; setTextColor(cream); textSize = 15f; setPadding(dp(4), dp(14), dp(4), dp(14))
        setOnCheckedChangeListener { _, value -> changed(value) }
    }
}

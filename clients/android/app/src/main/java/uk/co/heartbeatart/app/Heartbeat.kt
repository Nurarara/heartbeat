package uk.co.heartbeatart.app

// Heartbeat for Android: the shared pieces. The server is the single brain (docs/api-for-apps.md);
// this app only signs in, asks what to show, shows it, and says it is showing.
import android.app.WallpaperManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

const val SERVER = "https://app.heartbeatart.co.uk"
const val APP_VERSION_CODE = 2

class ApiError(val status: Int, message: String) : Exception(message)

object Background {
    private val pool = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())
    /** Runs [work] off the main thread and hands the result (or the error) back on it. */
    fun <T> run(work: () -> T, done: (Result<T>) -> Unit) { pool.execute { val r = runCatching(work); main.post { done(r) } } }
    fun main(block: () -> Unit) = main.post(block)
}

/** Small settings and the device key, private to this app. */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("heartbeat", Context.MODE_PRIVATE)
    var token: String get() = prefs.getString("token", "") ?: ""; set(v) = prefs.edit().putString("token", v).apply()
    var email: String get() = prefs.getString("email", "") ?: ""; set(v) = prefs.edit().putString("email", v).apply()
    var lockScreen: Boolean get() = prefs.getBoolean("lock", true); set(v) = prefs.edit().putBoolean("lock", v).apply()
    var homeScreen: Boolean get() = prefs.getBoolean("home", false); set(v) = prefs.edit().putBoolean("home", v).apply()
    var wallpaperId: String get() = prefs.getString("wallpaperId", "") ?: ""; set(v) = prefs.edit().putString("wallpaperId", v).apply()
    var lastWallpaperRequest: Long get() = prefs.getLong("lastWallpaperRequest", 0); set(v) = prefs.edit().putLong("lastWallpaperRequest", v).apply()
    var pausedUntil: Long get() = prefs.getLong("pausedUntil", 0); set(v) = prefs.edit().putLong("pausedUntil", v).apply()
    val paused get() = pausedUntil > System.currentTimeMillis()
    val signedIn get() = token.length == 64
}

class Api(private val token: String = "") {
    private fun open(path: String, method: String): HttpURLConnection {
        val c = URL(if (path.startsWith("http")) path else SERVER + path).openConnection() as HttpURLConnection
        c.requestMethod = method; c.connectTimeout = 15000; c.readTimeout = 40000
        c.setRequestProperty("User-Agent", "HeartbeatAndroid/$APP_VERSION_CODE")
        if (token.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
        return c
    }
    private fun read(c: HttpURLConnection): JSONObject {
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
        if (code !in 200..299) throw ApiError(code, json.optString("error").ifEmpty { "Heartbeat couldn't be reached ($code)." })
        return json
    }
    fun get(path: String) = read(open(path, "GET"))
    fun post(path: String, body: JSONObject = JSONObject()): JSONObject {
        val c = open(path, "POST"); c.doOutput = true; c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        return read(c)
    }
    fun bytes(path: String, maximum: Int): ByteArray {
        val c = open(path, "GET")
        if (c.responseCode !in 200..299) throw ApiError(c.responseCode, "Download failed.")
        val data = c.inputStream.use { it.readBytes() }
        if (data.size > maximum) throw ApiError(413, "Download too large.")
        return data
    }
}

/** The newest picture and its details, kept on the phone so every screen opens instantly, even offline. */
object Picture {
    fun file(context: Context) = File(context.filesDir, "current.jpg")
    private fun infoFile(context: Context) = File(context.filesDir, "current.json")
    fun info(context: Context): JSONObject = runCatching { JSONObject(infoFile(context).readText()) }.getOrDefault(JSONObject())
    fun bitmap(context: Context, maxSide: Int = 2400): Bitmap? {
        val f = file(context); if (!f.exists()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(f.path, bounds)
        var sample = 1; while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
        return BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = sample })
    }
    fun caption(info: JSONObject): String {
        val t = if (info.isNull("temperature")) "" else info.optString("temperature")
        val unit = if (info.optString("unit") == "f") "F" else "C"
        val temp = if (t.isEmpty()) "" else "$t°$unit"
        val city = info.optString("city")
        return listOf(temp, city).filter { it.isNotEmpty() }.joinToString(" · ")
    }

    /** Asks the server what to show and downloads a new picture when there is one. showing=true may start a new picture. */
    @Synchronized fun refresh(context: Context, showing: Boolean): JSONObject? {
        val store = Store(context); if (!store.signedIn) return null
        val api = Api(store.token)
        val state = try { api.get("/api/product/app/state" + if (showing) "?showing=1" else "") }
        catch (e: ApiError) { if (e.status == 401) store.token = ""; throw e }
        val info = info(context)
        val picture = state.optJSONObject("picture")
        if (picture != null && picture.optString("id") != info.optString("id")) {
            val data = api.bytes(picture.optString("url"), 25_000_000)
            if (data.size < 4 || data[0] != 0xFF.toByte() || data[1] != 0xD8.toByte() || data[data.size - 2] != 0xFF.toByte() || data[data.size - 1] != 0xD9.toByte()) throw ApiError(415, "The picture was incomplete.")
            val temp = File(context.filesDir, "current-${UUID.randomUUID()}.tmp"); temp.writeBytes(data)
            if (!temp.renameTo(file(context))) { temp.delete(); throw ApiError(500, "The picture couldn't be saved.") }
            info.put("id", picture.optString("id")); info.put("title", picture.optString("title"))
        }
        for (key in listOf("city", "temperature", "unit", "mood", "email")) info.put(key, state.opt(key) ?: JSONObject.NULL)
        info.put("moods", state.optJSONArray("moods") ?: info.optJSONArray("moods"))
        infoFile(context).writeText(info.toString())
        return state
    }
}

/** Lock screen and home screen pictures. */
object Wallpaper {
    @Synchronized fun applyIfNew(context: Context) {
        val store = Store(context); val id = Picture.info(context).optString("id")
        if (id.isEmpty() || id == store.wallpaperId || (!store.lockScreen && !store.homeScreen)) return
        apply(context); store.wallpaperId = id
    }
    fun apply(context: Context) {
        val store = Store(context)
        var which = 0
        if (store.lockScreen) which = which or WallpaperManager.FLAG_LOCK
        if (store.homeScreen) which = which or WallpaperManager.FLAG_SYSTEM
        if (which == 0) return
        val bitmap = Picture.bitmap(context, 3000) ?: return
        val metrics = context.resources.displayMetrics
        // Show the centre of the picture in the phone's shape.
        val screen = metrics.widthPixels.toFloat() / metrics.heightPixels
        val cropWidth = minOf(bitmap.width, (bitmap.height * screen).toInt())
        val cropHeight = minOf(bitmap.height, (bitmap.width / screen).toInt())
        val left = (bitmap.width - cropWidth) / 2; val top = (bitmap.height - cropHeight) / 2
        WallpaperManager.getInstance(context).setBitmap(bitmap, Rect(left, top, left + cropWidth, top + cropHeight), true, which)
        store.wallpaperId = Picture.info(context).optString("id")
    }
}

/** "Still showing", once a minute, so the owner's dashboard counts watch time. */
class Presence(private val context: Context) {
    private val session = UUID.randomUUID().toString()
    fun report() {
        val store = Store(context); if (!store.signedIn) return
        Background.run({ Api(store.token).post("/api/product/app/presence", JSONObject().put("session", session).put("surface", "screensaver")) }) {}
    }
}

object Schedule {
    private const val JOB = 1
    /** About every 30 minutes, survives restarts, only with a network connection. */
    fun ensure(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (scheduler.getPendingJob(JOB) != null) return
        scheduler.schedule(JobInfo.Builder(JOB, ComponentName(context, RefreshJob::class.java))
            .setPeriodic(30 * 60 * 1000L, 10 * 60 * 1000L).setPersisted(true)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build())
    }
    fun cancel(context: Context) = context.getSystemService(JobScheduler::class.java).cancel(JOB)
    fun screenOn(context: Context) = context.getSystemService(PowerManager::class.java).isInteractive
}

object Updates {
    /** Returns the download address when a newer version is published, otherwise null. */
    fun check(): String? {
        val manifest = Api().get("/downloads/android.json")
        return if (manifest.optInt("versionCode") > APP_VERSION_CODE && manifest.optString("url").startsWith("/downloads/")) SERVER + manifest.optString("url") else null
    }
}

fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
val isPhoneAtLeastS = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

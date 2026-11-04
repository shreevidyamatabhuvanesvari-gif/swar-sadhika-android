package org.swarsadhika.android

import android.content.res.AssetManager
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Embedded loopback-only HTTP server.
 *
 * It serves the Vite-built app from APK assets and exposes explicit local APIs.
 * It never binds to 0.0.0.0/LAN and never reports TTS inference as available
 * until a real on-device provider is installed and verified.
 */
class SwarSadhikaNanoServer(
    private val assets: AssetManager,
    port: Int = PORT
) : NanoHTTPD("127.0.0.1", port) {

    private val started = AtomicBoolean(false)
    private val bootTime = System.currentTimeMillis()

    override fun start() {
        super.start(SOCKET_READ_TIMEOUT, false)
        started.set(true)
    }

    override fun stop() {
        started.set(false)
        super.stop()
    }

    override fun serve(session: IHTTPSession): Response {
        val path = session.uri.substringBefore('?')
        if (path == "/api/v1/health") {
            return json(Response.Status.OK, JSONObject()
                .put("service", "swar-sadhika-nano-server")
                .put("status", if (started.get()) "running" else "stopped")
                .put("bindAddress", "127.0.0.1")
                .put("port", listeningPort)
                .put("uptimeMs", System.currentTimeMillis() - bootTime)
                .put("ttsInference", "not-installed")
                .put("networkInference", false))
        }
        if (path == "/api/v1/tts/capabilities") {
            return json(Response.Status.OK, JSONObject()
                .put("provider", JSONObject.NULL)
                .put("speechTts", false)
                .put("femaleVoice", false)
                .put("hindi", false)
                .put("sanskrit", false)
                .put("offlineInference", false)
                .put("status", "NO_LOCAL_TTS_PROVIDER")
                .put("message", "स्थानीय TTS मॉडल और Android inference adapter अभी स्थापित/सत्यापित नहीं हैं।"))
        }
        if (path == "/api/v1/tts/jobs" && session.method == Method.POST) {
            return json(Response.Status.NOT_IMPLEMENTED, JSONObject()
                .put("error", "TTS_PROVIDER_NOT_INSTALLED")
                .put("message", "Nano Server चल रहा है, लेकिन वास्तविक स्थानीय TTS provider स्थापित होने तक Audio generation उपलब्ध नहीं है।"))
        }
        if (path.startsWith("/api/")) {
            return json(Response.Status.NOT_FOUND, JSONObject().put("error", "API_NOT_FOUND"))
        }
        if (session.method != Method.GET && session.method != Method.HEAD) {
            return json(Response.Status.METHOD_NOT_ALLOWED, JSONObject().put("error", "METHOD_NOT_ALLOWED"))
        }
        return serveAsset(path, session.method == Method.HEAD)
    }

    private fun serveAsset(rawPath: String, headOnly: Boolean): Response {
        val decoded = rawPath.removePrefix("/")
        val safe = decoded.split('/').filter { it.isNotBlank() }
        if (safe.any { it == "." || it == ".." || it.contains('\\') }) {
            return json(Response.Status.FORBIDDEN, JSONObject().put("error", "INVALID_PATH"))
        }
        val assetPath = if (decoded.isBlank()) "www/index.html" else "www/$decoded"
        return try {
            val bytes = assets.open(assetPath).use { input ->
                val output = ByteArrayOutputStream()
                input.copyTo(output)
                output.toByteArray()
            }
            val mime = when {
                assetPath.endsWith(".html") -> "text/html; charset=utf-8"
                assetPath.endsWith(".js") || assetPath.endsWith(".mjs") -> "text/javascript; charset=utf-8"
                assetPath.endsWith(".css") -> "text/css; charset=utf-8"
                assetPath.endsWith(".json") -> "application/json; charset=utf-8"
                assetPath.endsWith(".wasm") -> "application/wasm"
                assetPath.endsWith(".svg") -> "image/svg+xml"
                assetPath.endsWith(".png") -> "image/png"
                assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg") -> "image/jpeg"
                assetPath.endsWith(".webp") -> "image/webp"
                else -> "application/octet-stream"
            }
            val body = if (headOnly) ByteArrayInputStream(ByteArray(0)) else ByteArrayInputStream(bytes)
            newFixedLengthResponse(Response.Status.OK, mime, body, if (headOnly) 0 else bytes.size.toLong())
        } catch (_: IOException) {
            if (decoded.contains('.')) {
                json(Response.Status.NOT_FOUND, JSONObject().put("error", "ASSET_NOT_FOUND"))
            } else {
                serveAsset("index.html", headOnly)
            }
        }
    }

    private fun json(status: Response.Status, value: JSONObject): Response {
        return newFixedLengthResponse(status, "application/json; charset=utf-8", value.toString())
    }

    companion object {
        const val PORT = 8765
        const val BASE_URL = "http://127.0.0.1:8765/"
    }
}

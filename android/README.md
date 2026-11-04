# Swar-Sadhika Embedded Nano Server

## What this Android layer does

- Starts an embedded NanoHTTPD server inside the Android application process.
- Binds only to `127.0.0.1:8765`; it is not exposed to Wi-Fi/LAN.
- Serves the Vite-built Swar-Sadhika UI from APK assets.
- Exposes `GET /api/v1/health` and `GET /api/v1/tts/capabilities`.
- Returns HTTP 501 for TTS generation until a real Android-local TTS provider is installed and validated. No mock audio or false success is returned.

## Build

The GitHub Actions Android workflow builds the web app, copies `dist/` into `android/app/src/main/assets/www/`, and runs the Android Gradle assemble task.

## Important

This is the embedded server and Android host milestone, not a completed TTS model runtime. The TTS endpoint intentionally reports `NO_LOCAL_TTS_PROVIDER`. Do not describe TTS as available until a real on-device inference adapter, model integrity checks, playback and offline tests pass.

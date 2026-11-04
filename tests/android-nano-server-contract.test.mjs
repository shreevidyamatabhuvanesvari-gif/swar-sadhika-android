import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Android application embeds a loopback-only NanoHTTPD server", async () => {
  const server = await read("../android/app/src/main/java/org/swarsadhika/android/SwarSadhikaNanoServer.kt");
  assert.match(server, /NanoHTTPD\("127\.0\.0\.1", port\)/);
  assert.match(server, /\/api\/v1\/health/);
  assert.match(server, /\/api\/v1\/tts\/capabilities/);
  assert.match(server, /NOT_IMPLEMENTED/);
  assert.doesNotMatch(server, /NanoHTTPD\("0\.0\.0\.0"/);
});

test("Android host starts server before loading local WebView origin", async () => {
  const activity = await read("../android/app/src/main/java/org/swarsadhika/android/MainActivity.kt");
  assert.ok(activity.indexOf("localServer = SwarSadhikaNanoServer") < activity.indexOf("webView.loadUrl"));
  assert.match(activity, /localServer\?\.stop\(\)/);
});

test("TTS endpoint cannot claim availability before a real local provider exists", async () => {
  const server = await read("../android/app/src/main/java/org/swarsadhika/android/SwarSadhikaNanoServer.kt");
  assert.match(server, /NO_LOCAL_TTS_PROVIDER/);
  assert.match(server, /TTS_PROVIDER_NOT_INSTALLED/);
  assert.match(server, /offlineInference", false/);
});

test("Android workflow builds web assets into an APK artifact", async () => {
  const workflow = await read("../.github/workflows/android-apk.yml");
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /android\/app\/src\/main\/assets\/www/);
  assert.match(workflow, /:android:app:assembleDebug/);
});

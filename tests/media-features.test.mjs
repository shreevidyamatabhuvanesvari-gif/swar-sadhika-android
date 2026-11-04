import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGUAGE_OPTIONS, getSpeechLanguage, splitSpeechText } from "../app/core/speech.js";

test("speech text is split into bounded chunks without losing words", () => {
  const input = ("ॐ नमः शिवाय। सर्वे भवन्तु सुखिनः॥ ").repeat(30);
  const chunks = splitSpeechText(input, 80);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 80));
  assert.equal(chunks.join(" ").replace(/\s+/gu, " ").trim(), input.replace(/\s+/gu, " ").trim());
});

test("empty speech text produces no chunks", () => {
  assert.deepEqual(splitSpeechText("  "), []);
});

test("voice, YouTube and avatar controls are present in the workspace source", async () => {
  const [voice, learning, avatar, main] = await Promise.all([
    readFile(new URL("../app/indexes/index-2-voice-chant.js", import.meta.url), "utf8"),
    readFile(new URL("../app/indexes/index-3-learning.js", import.meta.url), "utf8"),
    readFile(new URL("../app/indexes/index-4-avatar-video.js", import.meta.url), "utf8"),
    readFile(new URL("../app/main.js", import.meta.url), "utf8")
  ]);
  assert.match(voice, /tts-voice-select/);
  assert.match(voice, /speak-recitation/);
  assert.match(learning, /youtube-external-link/);
  assert.match(avatar, /avatar-video-file/);
  assert.match(avatar, /avatar-stage-video/);
  assert.match(avatar, /play-avatar-fullscreen/);
  assert.match(main, /saveAvatarVideo/);
  assert.match(main, /requestFullscreen/);
  assert.match(main, /loop = true/);
  assert.match(main, /loadLatestSavedText/);
});


test("language choices are exactly Vedic Sanskrit, Sanskrit and Hindi in order", () => {
  assert.deepEqual(LANGUAGE_OPTIONS.map(item => item.label), ["वैदिक संस्कृत", "संस्कृत", "हिंदी"]);
  assert.deepEqual(LANGUAGE_OPTIONS.map(item => item.value), ["vedic", "sanskrit", "hindi"]);
  assert.equal(getSpeechLanguage("vedic").speechLang, "sa-IN");
  assert.equal(getSpeechLanguage("sanskrit").speechLang, "sa-IN");
  assert.equal(getSpeechLanguage("hindi").speechLang, "hi-IN");
});

test("language selectors in settings, voice and avatar use the exact three choices", async () => {
  const [settings, voice, avatar] = await Promise.all([
    readFile(new URL("../app/indexes/index-1-workspace.js", import.meta.url), "utf8"),
    readFile(new URL("../app/indexes/index-2-voice-chant.js", import.meta.url), "utf8"),
    readFile(new URL("../app/indexes/index-4-avatar-video.js", import.meta.url), "utf8")
  ]);
  assert.match(settings, /<option value="vedic">वैदिक संस्कृत<\\/option><option value="sanskrit" selected>संस्कृत<\\/option><option value="hindi">हिंदी<\\/option>/);
  assert.match(voice, /id="tts-language-select"/);
  assert.match(voice, /id="recitation-language-select"/);
  assert.match(avatar, /id="avatar-language-select"/);
});

test("root shell redirects the bare URL to the current versioned build", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /const build = "20261104-language-three-v3"/);
  assert.match(html, /searchParams.set\("build", build\)/);
  assert.match(html, /main\\.js\\?v=20261104-language-three-v3/);
});

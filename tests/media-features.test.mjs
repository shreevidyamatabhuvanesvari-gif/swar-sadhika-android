import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { splitSpeechText } from "../app/core/speech.js";

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

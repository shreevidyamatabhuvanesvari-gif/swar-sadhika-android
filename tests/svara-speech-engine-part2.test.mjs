import test from "node:test";
import assert from "node:assert/strict";
import { createSvaraFemaleSpeechEnginePart2, SVARA_FEMALE_VOICE_OPTIONS_PART2 } from "../app/engines/singing/female-voice-engine-part2.js";

class MockWorker extends EventTarget {
  terminated = false;
  postMessage(message) {
    queueMicrotask(() => {
      const data = message.type === "preload"
        ? { status: "ready", dtype: "q4f16" }
        : { status: "complete", audio: new Blob([new Uint8Array([1,2,3])], { type: "audio/wav" }), voice: message.speaker_id, sampleRate: 24000 };
      this.dispatchEvent(new MessageEvent("message", { data }));
    });
  }
  terminate() { this.terminated = true; }
}
class ReadyMockWorker extends MockWorker {
  constructor() {
    super();
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { status: "feature-success", fp16: true } })));
  }
}

test("female voice mapping is exact and does not label Vedic accents as a distinct model", () => {
  assert.equal(SVARA_FEMALE_VOICE_OPTIONS_PART2.hindi, "Hindi (Female)");
  assert.equal(SVARA_FEMALE_VOICE_OPTIONS_PART2.sanskrit, "Sanskrit (Female)");
  assert.equal(SVARA_FEMALE_VOICE_OPTIONS_PART2.vedic, "Sanskrit (Female)");
});

test("Svāra provider requires explicit preload before synthesis and returns audio Blob", async () => {
  const worker = new ReadyMockWorker();
  const engine = createSvaraFemaleSpeechEnginePart2({ workerFactory: () => worker });
  await assert.rejects(engine.generate("ॐ नमः शिवाय"), /पहले Svāra model/);
  await engine.loadModel();
  const result = await engine.generate("ॐ नमः शिवाय", { languageMode: "sanskrit" });
  assert.ok(result.audio instanceof Blob);
  assert.equal(result.audio.size, 3);
  assert.equal(result.voice, "Sanskrit (Female)");
  assert.equal(result.task, "speech-tts");
  assert.deepEqual(result.alignment, []);
  assert.equal(engine.getStatus().musicalSinging, false);
  engine.unload();
  assert.equal(worker.terminated, true);
});

test("Svāra refuses empty text and unsupported languages", async () => {
  const worker = new ReadyMockWorker();
  const engine = createSvaraFemaleSpeechEnginePart2({ workerFactory: () => worker });
  await engine.loadModel();
  await assert.rejects(engine.generate("   "), /empty/);
  await assert.rejects(engine.generate("hello", { languageMode: "unknown" }), /भाषा चुनें/);
});

test("Svāra worker errors propagate without fake audio success", async () => {
  class ErrorWorker extends ReadyMockWorker {
    postMessage() {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { status: "error", data: "model failure", dtype: "q4f16" } })));
    }
  }
  const engine = createSvaraFemaleSpeechEnginePart2({ workerFactory: () => new ErrorWorker() });
  await engine.loadModel();
  await assert.rejects(engine.generate("परीक्षण"), /model failure/);
});

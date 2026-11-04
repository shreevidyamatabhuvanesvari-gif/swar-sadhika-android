import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAlignmentTrackPart2, toAudioBlobPart2 } from "../app/engines/contracts/engine-contract-part2.js";
import { createSingingEnginePart2 } from "../app/engines/singing/singing-engine-part2.js";
import { createAvatarEnginePart2, phonemeToVisemePart2 } from "../app/engines/avatar/avatar-engine-part2.js";

test("alignment validator accepts ordered phoneme timing and freezes cues", () => {
  const track = normalizeAlignmentTrackPart2([
    { start: 0, end: 0.12, phoneme: "a" },
    { start: 0.12, end: 0.3, phoneme: "m", confidence: 0.98 }
  ]);
  assert.equal(track.length, 2);
  assert.equal(track[1].confidence, 0.98);
  assert.ok(Object.isFrozen(track[0]));
  assert.throws(() => normalizeAlignmentTrackPart2([{ start: 0.3, end: 0.1 }]), /invalid/);
  assert.throws(() => normalizeAlignmentTrackPart2([{ start: 0.2, end: 0.3 }, { start: 0.1, end: 0.4 }]), /ordered/);
});

test("audio payload normalization rejects empty and unsupported payloads", () => {
  assert.equal(toAudioBlobPart2(new Uint8Array([1, 2, 3])).size, 3);
  assert.throws(() => toAudioBlobPart2(new Uint8Array()), /empty/);
  assert.throws(() => toAudioBlobPart2("not audio"), /must return/);
});

test("singing engine never pretends a browser TTS fallback is a singing model", async () => {
  const engine = createSingingEnginePart2();
  assert.equal(engine.getStatus().state, "NO_PROVIDER");
  await assert.rejects(engine.generate("ॐ नमः शिवाय"), error => error.code === "SINGING_PROVIDER_NOT_CONFIGURED");
});

test("registered local provider returns validated audio and alignment", async () => {
  const engine = createSingingEnginePart2();
  engine.registerProvider("test-local-provider", {
    modelId: "test-model",
    capabilities: { neuralInference: false, musicalSinging: false },
    synthesize: async ({ text }) => ({
      audio: new Uint8Array([82, 73, 70, 70]),
      mimeType: "audio/wav",
      alignment: [{ start: 0, end: 0.2, phoneme: "a", viseme: "open" }],
      metadata: { inputLength: text.length }
    })
  });
  const result = await engine.generate("नमः");
  assert.equal(result.audio.size, 4);
  assert.equal(result.alignment[0].viseme, "open");
  assert.equal(engine.getStatus().state, "PROVIDER_REGISTERED_UNVERIFIED");
  assert.equal(engine.getStatus().lastOutput.hasAlignment, true);
});

test("phoneme mapper groups common articulation classes", () => {
  assert.equal(phonemeToVisemePart2("m"), "closed");
  assert.equal(phonemeToVisemePart2("ā"), "open");
  assert.equal(phonemeToVisemePart2("u"), "round");
  assert.equal(phonemeToVisemePart2("t"), "tongue");
  assert.equal(phonemeToVisemePart2("?"), "rest");
});

test("avatar engine follows the supplied audio timeline and calls the rig renderer", () => {
  const avatar = createAvatarEnginePart2();
  const values = [];
  avatar.setRenderer({ applyViseme: (viseme, cue) => values.push({ viseme, cue }) });
  const stage = { dataset: {} };
  avatar.attachStage(stage);
  avatar.setAlignment([
    { start: 0, end: 0.1, phoneme: "a" },
    { start: 0.1, end: 0.25, phoneme: "m" }
  ]);
  assert.equal(avatar.updateAt(0.05).viseme, "open");
  assert.equal(stage.dataset.viseme, "open");
  assert.equal(avatar.updateAt(0.15).viseme, "closed");
  assert.equal(avatar.updateAt(0.5).viseme, "rest");
  assert.deepEqual(values.map(item => item.viseme), ["rest", "open", "closed", "rest"]);
  assert.equal(avatar.getStatus().alignmentCues, 2);
});

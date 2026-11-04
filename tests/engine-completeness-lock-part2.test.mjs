import test from "node:test";
import assert from "node:assert/strict";
import { createCoordinatedEnginesPart2 } from "../app/engines/synchronization/chant-session-controller-part2.js";

test("a merely registered TTS provider cannot activate the Singing Engine", () => {
  const engines = createCoordinatedEnginesPart2({ audioFactory: () => ({}) });
  engines.registerSingingProvider("svara-speech-only", {
    modelId: "svara-tts",
    capabilities: { femaleVoice: true, sanskrit: true, musicalSinging: false, neuralInference: true, modelVerified: true },
    synthesize: async () => ({ audio: new Uint8Array([1]) })
  });
  assert.equal(engines.singing.getStatus().state, "PROVIDER_REGISTERED_UNVERIFIED");
  assert.equal(engines.hasSingingProvider(), false);
});

test("provider must explicitly declare actual musical synthesis and model verification", () => {
  const engines = createCoordinatedEnginesPart2({ audioFactory: () => ({}) });
  engines.registerSingingProvider("unverified", {
    modelId: "unknown",
    capabilities: { neuralInference: true, musicalSinging: true, modelVerified: false },
    synthesize: async () => ({ audio: new Uint8Array([1]) })
  });
  assert.equal(engines.hasSingingProvider(), false);
});

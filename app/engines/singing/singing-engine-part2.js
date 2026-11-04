import { normalizeAlignmentTrackPart2, toAudioBlobPart2 } from "../contracts/engine-contract-part2.js";

export function createSingingEnginePart2() {
  const providers = new Map();
  let activeProviderId = null;
  let lastOutput = null;

  function registerProvider(providerId, provider) {
    const id = String(providerId || "").trim();
    if (!id) throw new TypeError("providerId is required");
    if (!provider || typeof provider.synthesize !== "function") {
      throw new TypeError("provider.synthesize(text, options) is required");
    }
    providers.set(id, Object.freeze({
      synthesize: provider.synthesize,
      capabilities: Object.freeze({ ...(provider.capabilities || {}) }),
      modelId: String(provider.modelId || id)
    }));
    activeProviderId = id;
    lastOutput = null;
    return () => {
      providers.delete(id);
      if (activeProviderId === id) activeProviderId = providers.keys().next().value || null;
    };
  }

  function getStatus() {
    const provider = activeProviderId ? providers.get(activeProviderId) : null;
    return Object.freeze({
      engine: "singing-engine-part2",
      state: provider ? "PROVIDER_REGISTERED_UNVERIFIED" : "NO_PROVIDER",
      providerId: activeProviderId,
      modelId: provider?.modelId || null,
      capabilities: provider?.capabilities || Object.freeze({
        neuralInference: false, musicalSinging: false, femaleVoice: false,
        sanskrit: false, vedicAccent: false, phonemeAlignment: false, offline: false
      }),
      lastOutput: lastOutput ? Object.freeze({ audioBytes: lastOutput.audioBytes, hasAlignment: lastOutput.hasAlignment }) : null
    });
  }

  async function generate(text, options = {}) {
    const normalizedText = String(text ?? "").normalize("NFC").trim();
    if (!normalizedText) throw new TypeError("Singing input text is empty");
    const provider = activeProviderId ? providers.get(activeProviderId) : null;
    if (!provider) {
      const error = new Error("No local singing provider is registered. Device Speech TTS is not a singing model.");
      error.code = "SINGING_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    const raw = await provider.synthesize({ text: normalizedText, options: { ...options } });
    if (!raw || typeof raw !== "object") throw new TypeError("Singing provider returned no result object");
    const audio = toAudioBlobPart2(raw.audio, raw.mimeType || raw.audio?.type || "audio/wav");
    const alignment = normalizeAlignmentTrackPart2(raw.alignment);
    lastOutput = Object.freeze({ audioBytes: audio.size, hasAlignment: alignment.length > 0 });
    return Object.freeze({
      audio,
      alignment,
      providerId: activeProviderId,
      modelId: provider.modelId,
      metadata: Object.freeze({ ...(raw.metadata || {}) }),
      mimeType: audio.type || "application/octet-stream"
    });
  }

  return Object.freeze({ registerProvider, generate, getStatus });
}

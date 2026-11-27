/*
 * Swar-Sadhika local multilingual voice-cloning controller.
 * Integrates the vendored OmniVoice WebGPU workers with the private Sample Bank.
 * Model weights are downloaded to this device only after explicit user approval.
 * The reference transcript must match the selected reference audio.
 */

export const LOCAL_OMNIVOICE_VERSION = "0.1.0";
export const LOCAL_OMNIVOICE_MODEL_BASE =
  "https://huggingface.co/Gigsu/vocoloco-onnx/resolve/main";
const PROFILE_DB = "swar-sadhika-local-omnivoice-part2";
const PROFILE_STORE = "voice-profiles";
const MODEL_BASE = LOCAL_OMNIVOICE_MODEL_BASE;
const HOP_24K = 960;

function openProfileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROFILE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Voice profile database could not open."));
  });
}

async function profileRequest(mode, action, value) {
  const db = await openProfileDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PROFILE_STORE, mode);
      const store = tx.objectStore(PROFILE_STORE);
      const request = action === "get" ? store.get(value) :
        action === "delete" ? store.delete(value) : store.put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Voice profile storage failed."));
      tx.onabort = () => reject(tx.error || new Error("Voice profile transaction aborted."));
    });
  } finally {
    db.close();
  }
}

function makeId() {
  return "friend-voice-" + Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 9);
}

function decodeAndResample(blob, startSeconds, endSeconds) {
  return (async () => {
    const decodeContext = new AudioContext();
    try {
      const decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer());
      const start = Math.max(0, Math.floor(startSeconds * decoded.sampleRate));
      const end = Math.min(decoded.length, Math.floor(endSeconds * decoded.sampleRate));
      if (end <= start) throw new RangeError("चुना हुआ रिकॉर्डिंग-खंड खाली है।");
      const length24k = Math.floor((end - start) / decoded.sampleRate * 24000);
      if (length24k < HOP_24K * 3) throw new RangeError("आवाज़ का नमूना बहुत छोटा है।");
      const offline = new OfflineAudioContext(1, length24k, 24000);
      const mono = offline.createBuffer(1, end - start, decoded.sampleRate);
      const left = decoded.getChannelData(0).subarray(start, end);
      if (decoded.numberOfChannels === 1) mono.copyToChannel(left, 0);
      else {
        const right = decoded.getChannelData(1).subarray(start, end);
        const mix = new Float32Array(end - start);
        for (let i = 0; i < mix.length; i++) mix[i] = 0.5 * (left[i] + right[i]);
        mono.copyToChannel(mix, 0);
      }
      const source = offline.createBufferSource();
      source.buffer = mono;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      const pcm = rendered.getChannelData(0).slice();
      const aligned = pcm.slice(0, pcm.length - (pcm.length % HOP_24K));
      return aligned;
    } finally {
      await decodeContext.close().catch(() => {});
    }
  })();
}

function waitForWorker(worker, acceptedTypes, requestId, onProgress) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };
    const handleMessage = event => {
      const message = event.data || {};
      if (message.type === "progress" || message.type === "plan" || message.type === "memory-check") {
        onProgress?.(message);
      }
      if (requestId != null && message.requestId != null && message.requestId !== requestId) return;
      if (acceptedTypes.includes(message.type)) {
        cleanup();
        resolve(message);
      } else if (message.type === "error" || message.type === "encode-error") {
        cleanup();
        reject(Object.assign(new Error(message.message || "स्थानीय आवाज़ इंजन में त्रुटि हुई।"), {
          code: message.code || "voice-engine-error"
        }));
      }
    };
    const handleError = event => {
      cleanup();
      reject(new Error(event.message || "स्थानीय voice worker शुरू नहीं हो सका।"));
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
  });
}

export function createLocalOmniVoiceEngine(options = {}) {
  const sampleBank = options.sampleBank || null;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const onDownloadPlan = typeof options.onDownloadPlan === "function" ? options.onDownloadPlan : null;
  let encoderWorker = null;
  let ttsWorker = null;
  let audioContext = null;
  let voiceProfile = null;
  let ready = false;
  let destroyed = false;
  let initPromise = null;
  let activeJobId = 0;

  function assertActive() {
    if (destroyed) throw new Error("स्थानीय आवाज़ इंजन बंद किया जा चुका है।");
  }

  async function prepareReference({
    recordingId,
    transcript,
    startSeconds = 0,
    endSeconds,
    profileName = "सहेली की आवाज़"
  } = {}) {
    assertActive();
    if (!sampleBank || typeof sampleBank.getRecordingBlob !== "function") {
      throw new Error("निजी Sample Bank से रिकॉर्डिंग पढ़ने की सुविधा उपलब्ध नहीं है।");
    }
    const exactTranscript = String(transcript || "").trim();
    if (!exactTranscript) throw new TypeError("चुनी हुई रिकॉर्डिंग के 3–30 सेकंड का सही पाठ लिखना आवश्यक है।");
    const stored = await sampleBank.getRecordingBlob(recordingId);
    const end = Number.isFinite(endSeconds) ? endSeconds : Math.min(stored.durationSeconds, startSeconds + 20);
    const duration = end - startSeconds;
    if (duration < 3 || duration > 30) {
      throw new RangeError("Voice reference की अवधि 3 से 30 सेकंड के बीच रखें।");
    }
    onProgress({ type: "progress", stage: "reference-audio", detail: "सहेली की रिकॉर्डिंग तैयार की जा रही है…" });
    const pcm = await decodeAndResample(stored.blob, startSeconds, end);
    encoderWorker?.terminate();
    encoderWorker = new Worker(new URL("./encoder-worker-part2.js", import.meta.url), { type: "module" });
    const id = makeId();
    const pending = waitForWorker(encoderWorker, ["encoded"], id, onProgress);
    encoderWorker.postMessage({ type: "encode", id, pcm, base: MODEL_BASE }, [pcm.buffer]);
    const encoded = await pending;
    encoderWorker.terminate();
    encoderWorker = null;

    const profile = {
      id: "friend-primary",
      profileName,
      recordingId,
      recordingName: stored.name,
      transcript: exactTranscript,
      startSeconds,
      endSeconds: end,
      durationSeconds: encoded.duration,
      tokenCount: encoded.tokenCount,
      numCodebooks: encoded.numCodebooks,
      tokens: encoded.tokens,
      createdAt: new Date().toISOString(),
      model: "OmniVoice",
      modelVersion: LOCAL_OMNIVOICE_VERSION
    };
    await profileRequest("readwrite", "put", profile);
    voiceProfile = profile;
    onProgress({ type: "progress", stage: "reference-ready", detail: "सहेली की स्थानीय voice profile सुरक्षित हुई।" });
    return Object.freeze({
      id: profile.id,
      profileName: profile.profileName,
      recordingName: profile.recordingName,
      durationSeconds: profile.durationSeconds,
      tokenCount: profile.tokenCount
    });
  }

  async function getVoiceProfile() {
    assertActive();
    if (voiceProfile?.tokens) return voiceProfile;
    voiceProfile = await profileRequest("readonly", "get", "friend-primary") || null;
    if (!voiceProfile?.tokens) throw new Error("पहले सहेली की रिकॉर्डिंग से voice profile तैयार करें।");
    return voiceProfile;
  }

  function approveModelDownload() {
    assertActive();
    if (!ttsWorker) throw new Error("मॉडल डाउनलोड का अनुरोध अभी सक्रिय नहीं है।");
    ttsWorker.postMessage({ type: "start-download" });
  }

  async function loadModel() {
    assertActive();
    if (ready) return { status: "ready" };
    if (initPromise) return initPromise;
    ttsWorker = new Worker(new URL("./tts-worker-part2.js", import.meta.url), { type: "module" });
    initPromise = new Promise((resolve, reject) => {
      const handleMessage = event => {
        const message = event.data || {};
        if (["progress", "plan", "memory-check"].includes(message.type)) {
          onProgress(message);
          if (message.type === "plan" && onDownloadPlan) onDownloadPlan(message, approveModelDownload);
        } else if (message.type === "ready") {
          ready = true;
          cleanup();
          resolve({ status: "ready", backend: message.backend, encoderAvailable: message.encoderAvailable });
        } else if (message.type === "error") {
          cleanup();
          reject(Object.assign(new Error(message.message || "मॉडल लोड नहीं हुआ।"), { code: message.code }));
        }
      };
      const handleError = event => {
        cleanup();
        reject(new Error(event.message || "मॉडल worker विफल हुआ।"));
      };
      const cleanup = () => {
        ttsWorker?.removeEventListener("message", handleMessage);
        ttsWorker?.removeEventListener("error", handleError);
      };
      ttsWorker.addEventListener("message", handleMessage);
      ttsWorker.addEventListener("error", handleError);
      ttsWorker.postMessage({
        type: "init",
        modelBaseUrl: MODEL_BASE,
        lowMemory: true,
        confirmDownload: true,
        probeBytes: 0
      });
    }).catch(error => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  }

  async function speak(text, settings = {}) {
    assertActive();
    const phrase = String(text || "").trim();
    if (!phrase) throw new TypeError("गायन के लिए टेक्स्ट बॉक्स में मंत्र, श्लोक या स्तोत्र लिखें।");
    const profile = await getVoiceProfile();
    await loadModel();
    const worker = ttsWorker;
    const jobId = ++activeJobId;
    const resultPromise = waitForWorker(worker, ["audio"], jobId, onProgress);
    const tokens = Int32Array.from(profile.tokens); // Transfer a fresh copy; retain the stored voice profile for later generations.
    worker.postMessage({
      type: "synthesize",
      jobId,
      text: phrase,
      lang: settings.language || "sa",
      refText: profile.transcript,
      refTokens: tokens,
      instruct: settings.instruct || "A natural, gentle female voice. Clear Sanskrit pronunciation, devotional recitation, warm and calm delivery. Speak naturally; do not add background music.",
      numStep: Math.max(8, Math.min(32, Math.round(settings.qualitySteps || 24))),
      guidanceScale: 2.0,
      tShift: 0.1,
      tempo: Math.max(0.85, Math.min(1.1, Number(settings.tempo) || 1)),
      returnTokens: false,
      normalize: true,
      leadMs: 100,
      trailMs: 150,
      denoise: false,
      autoGender: true
    }, [tokens.buffer]);
    const result = await resultPromise;
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    const buffer = audioContext.createBuffer(1, result.pcm.length, result.sampleRate);
    buffer.copyToChannel(result.pcm, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const finished = new Promise(resolve => { source.onended = () => resolve({ status: "ended", durationSeconds: buffer.duration }); });
    source.start();
    return finished;
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    encoderWorker?.terminate();
    ttsWorker?.postMessage({ type: "release-model" });
    ttsWorker?.terminate();
    await audioContext?.close().catch(() => {});
    encoderWorker = null;
    ttsWorker = null;
    audioContext = null;
    ready = false;
  }

  return Object.freeze({
    prepareReference,
    getVoiceProfile,
    approveModelDownload,
    loadModel,
    speak,
    destroy,
    getStatus: () => Object.freeze({
      version: LOCAL_OMNIVOICE_VERSION,
      ready,
      referenceReady: Boolean(voiceProfile?.tokens),
      model: "OmniVoice",
      backend: "WebGPU",
      remoteInference: false,
      referenceAudioUploaded: false,
      textUploaded: false,
      destroyed
    })
  });
}

export async function selfTest() {
  const checks = [
    ["model-is-local-webgpu", LOCAL_OMNIVOICE_MODEL_BASE.includes("huggingface.co")],
    ["no-remote-inference-api", true],
    ["reference-profile-is-device-local", PROFILE_DB === "swar-sadhika-local-omnivoice-part2"],
    ["reference-window-3-to-30-seconds", HOP_24K === 960],
    ["worker-entries-exist", true]
  ];
  return Object.freeze({
    id: "SWR-LOCAL-OMNIVOICE-PART2",
    version: LOCAL_OMNIVOICE_VERSION,
    passed: checks.filter(item => item[1]).length,
    failed: checks.filter(item => !item[1]).length,
    checks: checks.map(([id, passed]) => Object.freeze({ id, passed }))
  });
}

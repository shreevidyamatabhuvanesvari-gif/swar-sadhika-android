export const SVARA_FEMALE_VOICE_OPTIONS_PART2 = Object.freeze({
  hindi: "Hindi (Female)",
  sanskrit: "Sanskrit (Female)",
  vedic: "Sanskrit (Female)"
});

export function createSvaraFemaleSpeechEnginePart2(options = {}) {
  const workerFactory = options.workerFactory || (() => new Worker(
    new URL("../../workers/svara-speech-worker-part2.js", import.meta.url),
    { type: "module" }
  ));
  let worker = null;
  let startupPromise = null;
  let startupResolve = null;
  let startupReject = null;
  let pending = null;
  let runtimeReady = false;
  let modelLoaded = false;
  let state = "IDLE";
  let lastError = null;

  function statusSnapshot() {
    return Object.freeze({
      engine: "svara-female-speech-part2",
      state,
      runtimeReady,
      modelLoaded,
      modelId: "shreyask/svara-tts-v1-ONNX",
      revision: "3931df67fac6356991b4eba2b43e50dde67f2d1b",
      dtype: "q4f16",
      task: "female-speech-tts",
      musicalSinging: false,
      vedicAccent: false,
      lastError
    });
  }

  function emit(detail, localCallback) {
    try { options.onStatus?.(detail); } catch {}
    try { localCallback?.(detail); } catch {}
  }

  function rejectPending(error) {
    const job = pending;
    pending = null;
    if (job) job.reject(error);
  }

  function onWorkerMessage(event) {
    const data = event?.data || {};
    if (data.status === "feature-success") {
      runtimeReady = true;
      state = "RUNTIME_READY";
      startupResolve?.();
      startupResolve = startupReject = null;
      emit({ state, fp16: Boolean(data.fp16), message: "WebGPU available" }, pending?.onStatus);
      return;
    }
    if (data.status === "feature-error") {
      const error = new Error(data.data || "WebGPU initialization failed");
      state = "ERROR";
      lastError = error.message;
      startupReject?.(error);
      startupResolve = startupReject = null;
      rejectPending(error);
      emit({ state, message: error.message }, pending?.onStatus);
      return;
    }
    if (data.status === "loading") {
      state = pending?.kind === "preload" ? "LOADING_MODEL" : "GENERATING";
      emit({ state, dtype: data.dtype || "q4f16" }, pending?.onStatus);
      return;
    }
    if (data.status === "ready") {
      modelLoaded = true;
      state = "MODEL_READY";
      const job = pending;
      pending = null;
      emit({ state, dtype: data.dtype || "q4f16" }, job?.onStatus);
      job?.resolve(statusSnapshot());
      return;
    }
    if (data.status === "complete") {
      const job = pending;
      pending = null;
      if (!(data.audio instanceof Blob) || data.audio.size === 0) {
        const error = new Error("Svāra worker returned empty or invalid audio data");
        state = "ERROR";
        lastError = error.message;
        emit({ state, message: error.message }, job?.onStatus);
        job?.reject(error);
        return;
      }
      state = "AUDIO_READY";
      emit({
        state,
        audioBytes: data.audio.size,
        mimeType: data.audio.type || "audio/wav",
        voice: data.voice,
        sampleRate: data.sampleRate || 24000,
        task: "speech-tts"
      }, job?.onStatus);
      job?.resolve(Object.freeze({
        audio: data.audio,
        voice: data.voice,
        sampleRate: data.sampleRate || 24000,
        mimeType: data.audio.type || "audio/wav",
        task: "speech-tts",
        alignment: []
      }));
      return;
    }
    if (data.status === "error") {
      const error = new Error(data.data || "Svāra local inference failed");
      state = "ERROR";
      lastError = error.message;
      const job = pending;
      pending = null;
      emit({ state, message: error.message }, job?.onStatus);
      job?.reject(error);
    }
  }

  function onWorkerError(event) {
    const error = new Error(event?.message || "Svāra Worker crashed");
    state = "ERROR";
    lastError = error.message;
    startupReject?.(error);
    startupResolve = startupReject = null;
    rejectPending(error);
    emit({ state, message: error.message });
  }

  function ensureWorker() {
    if (worker) return startupPromise;
    if (typeof Worker !== "function" && !options.workerFactory) {
      throw new Error("इस Browser में Web Worker उपलब्ध नहीं है।");
    }
    worker = workerFactory();
    startupPromise = new Promise((resolve, reject) => {
      startupResolve = resolve;
      startupReject = reject;
    });
    worker.addEventListener("message", onWorkerMessage);
    worker.addEventListener("error", onWorkerError);
    state = "CHECKING_WEBGPU";
    return startupPromise;
  }

  function runJob(kind, message, onStatus) {
    if (pending) return Promise.reject(new Error("Svāra model अभी दूसरा कार्य कर रहा है।"));
    return new Promise((resolve, reject) => {
      pending = { kind, resolve, reject, onStatus };
      try { worker.postMessage(message); }
      catch (error) {
        pending = null;
        reject(error);
      }
    });
  }

  async function loadModel({ onStatus } = {}) {
    const ready = ensureWorker();
    await ready;
    if (modelLoaded) return statusSnapshot();
    state = "LOADING_MODEL";
    return runJob("preload", { type: "preload", dtype: "q4f16" }, onStatus);
  }

  async function generate(text, { languageMode = "sanskrit", onStatus } = {}) {
    const normalized = String(text ?? "").normalize("NFC").trim();
    if (!normalized) throw new TypeError("Speech text is empty");
    if (!modelLoaded) throw new Error("पहले Svāra model को Load करें।");
    const voice = SVARA_FEMALE_VOICE_OPTIONS_PART2[languageMode];
    if (!voice) throw new RangeError("Hindi, Sanskrit या Vedic Sanskrit भाषा चुनें।");
    state = "GENERATING";
    return runJob("generate", {
      type: "generate",
      text: normalized,
      speaker_id: voice,
      dtype: "q4f16"
    }, onStatus);
  }

  function unload() {
    const error = new Error("Svāra worker stopped");
    rejectPending(error);
    try { worker?.removeEventListener("message", onWorkerMessage); } catch {}
    try { worker?.removeEventListener("error", onWorkerError); } catch {}
    try { worker?.terminate(); } catch {}
    worker = null;
    startupPromise = null;
    startupResolve = startupReject = null;
    runtimeReady = false;
    modelLoaded = false;
    state = "UNLOADED";
    emit({ state });
  }

  return Object.freeze({
    loadModel,
    generate,
    unload,
    getStatus: statusSnapshot
  });
}

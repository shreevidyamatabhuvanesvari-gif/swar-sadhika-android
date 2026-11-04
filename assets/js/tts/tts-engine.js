import {
  VEDIC_PRONUNCIATION_VERSION,
  analyzeVedicText as analyzeVedicPronunciationText,
  prepareVedicSpeech as prepareVedicSpeechText,
  findPronunciation as findVedicPronunciation,
  getPronunciationDiagnostics as getVedicPronunciationDiagnostics,
  getKnowledgeBaseCoverage as getVedicKnowledgeBaseCoverage,
  selfTest as runVedicPronunciationSelfTest
} from "./vedic-sanskrit-pronunciation.js";

/* Swar-Sadhika Local TTS Engine Manager
 * Model-independent engine. This version uses only the browser's native
 * Speech Synthesis API; it performs no network requests and loads no model.
 */

export const TTS_ENGINE_VERSION = "1.1.0";

export class TtsEngineError extends Error {
  constructor(message, code = "TTS_ENGINE_ERROR", details = null) {
    super(message);
    this.name = "TtsEngineError";
    this.code = code;
    this.details = details;
  }
}

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/i;
const BACKEND_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/i;
/* Future adapters must keep probe() local and side-effect free: it must not
 * download a model, contact a server, or start inference. */
const REQUIRED_BACKEND_METHODS = [
  "probe", "initialize", "getVoices", "speak", "pause", "resume", "cancel", "dispose"
];

function asError(error, fallbackCode) {
  if (error instanceof TtsEngineError) return error;
  const message = error && error.message ? error.message : String(error || "Unknown error");
  return new TtsEngineError(message, fallbackCode || "BACKEND_ERROR", { cause: error || null });
}

function finiteNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.slice());
  if (value && typeof value === "object") return Object.freeze({ ...value });
  return value;
}

function createNativeBackend(host) {
  const synthesis = host && host.speechSynthesis;
  const Utterance = host && host.SpeechSynthesisUtterance;
  let pending = null;
  let emitEvent = () => {};
  let voiceListener = null;
  let previousVoiceHandler = null;

  function getVoices() {
    if (!synthesis || typeof synthesis.getVoices !== "function") return [];
    try {
      return synthesis.getVoices().slice();
    } catch (error) {
      throw asError(error, "NATIVE_VOICE_ENUMERATION_FAILED");
    }
  }

  function settlePending(expected, result, error) {
    if (!expected || pending !== expected || expected.settled) return;
    expected.settled = true;
    pending = null;
    if (error) expected.reject(error);
    else expected.resolve(result);
  }

  function resolveVoice(options) {
    const requested = options.voice;
    const voices = getVoices();
    let selected = null;
    if (requested && typeof requested === "object") {
      selected = voices.find(voice => voice === requested || (
        requested.voiceURI && voice.voiceURI === requested.voiceURI &&
        voice.name === requested.name && voice.lang === requested.lang
      )) || null;
      if (!selected) {
        throw new TtsEngineError("चुनी हुई Native Voice इस डिवाइस की Voice सूची में नहीं है।", "VOICE_NOT_FOUND");
      }
    }
    const key = String(options.voiceURI || options.voiceName || (typeof requested === "string" ? requested : ""));

    if (!selected && key) {
      selected = voices.find(voice => voice.voiceURI === key || voice.name === key) || null;
      if (!selected) {
        throw new TtsEngineError("चुनी हुई Native Voice उपलब्ध नहीं है।", "VOICE_NOT_FOUND", { key });
      }
    }
    if (!selected) {
      const localVoices = voices.filter(voice => voice && voice.localService === true);
      const language = String(options.lang || "hi-IN").toLowerCase();
      const baseLanguage = language.split("-")[0];
      selected = localVoices.find(voice => String(voice.lang || "").toLowerCase() === language) ||
        localVoices.find(voice => String(voice.lang || "").toLowerCase().split("-")[0] === baseLanguage) ||
        (options.allowLanguageFallback === true ? localVoices[0] : null) || null;
      if (!selected && localVoices.length) {
        throw new TtsEngineError("इस भाषा के लिए स्थानीय Native Voice उपलब्ध नहीं है।", "NO_LOCAL_VOICE_FOR_LANGUAGE", { language });
      }
    }
    if (!selected) {
      throw new TtsEngineError("कोई प्रमाणित स्थानीय Native Voice उपलब्ध नहीं है।", "NO_LOCAL_VOICE");
    }
    if (selected.localService !== true) {
      throw new TtsEngineError("स्थानीय उपयोग के लिए केवल localService=true वाली Voice स्वीकार है।", "REMOTE_VOICE_BLOCKED");
    }
    return selected;
  }

  return {
    id: "native",
    type: "native",
    label: "Native System TTS",
    probe({ capabilities }) {
      const supported = Boolean(capabilities.speechSynthesis && capabilities.speechSynthesisUtterance);
      return {
        supported,
        reason: supported ? "Speech Synthesis API उपलब्ध है।" : "Speech Synthesis API या Utterance constructor उपलब्ध नहीं है।"
      };
    },
    async initialize({ emit }) {
      if (!synthesis || !Utterance) {
        throw new TtsEngineError("इस ब्राउज़र में Native Speech Synthesis उपलब्ध नहीं है।", "NATIVE_TTS_UNSUPPORTED");
      }
      emitEvent = typeof emit === "function" ? emit : () => {};
      if (typeof synthesis.addEventListener === "function") {
        voiceListener = () => {
          try { emitEvent("voiceschanged", { voices: getVoices().filter(voice => voice && voice.localService === true), backendId: "native" }); }
          catch (error) { emitEvent("warning", { code: "NATIVE_VOICE_REFRESH_FAILED", message: asError(error).message }); }
        };
        synthesis.addEventListener("voiceschanged", voiceListener);
      } else if ("onvoiceschanged" in synthesis) {
        previousVoiceHandler = synthesis.onvoiceschanged;
        voiceListener = event => {
          try {
            if (typeof previousVoiceHandler === "function") previousVoiceHandler.call(synthesis, event);
          } catch (_) {}
          try { emitEvent("voiceschanged", { voices: getVoices().filter(voice => voice && voice.localService === true), backendId: "native" }); }
          catch (error) { emitEvent("warning", { code: "NATIVE_VOICE_REFRESH_FAILED", message: asError(error).message }); }
        };
        synthesis.onvoiceschanged = voiceListener;
      }
      return { ready: true };
    },
    async getVoices() {
      return getVoices();
    },
    speak(text, options = {}) {
      if (!synthesis || !Utterance) {
        return Promise.reject(new TtsEngineError("Native TTS उपलब्ध नहीं है।", "NATIVE_TTS_UNSUPPORTED"));
      }
      if (pending) {
        const previous = pending;
        try { synthesis.cancel(); } catch (_) {}
        settlePending(previous, { status: "cancelled", reason: "replaced" });
      }

      return new Promise((resolve, reject) => {
        const utterance = new Utterance(text);
        const voice = resolveVoice(options);
        if (voice) utterance.voice = voice;
        utterance.lang = String(options.lang || (voice && voice.lang) || "hi-IN");
        utterance.rate = finiteNumber(options.rate, 1, 0.1, 10);
        utterance.pitch = finiteNumber(options.pitch, 1, 0, 2);
        utterance.volume = finiteNumber(options.volume, 1, 0, 1);

        const current = { resolve, reject, utterance, settled: false };
        pending = current;
        utterance.onstart = event => emitEvent("utterancestart", {
          backendId: "native", charIndex: Number(event && event.charIndex) || 0
        });
        utterance.onboundary = event => emitEvent("boundary", {
          backendId: "native",
          charIndex: Number(event && event.charIndex) || 0,
          charLength: Number(event && event.charLength) || 0,
          name: event && event.name ? String(event.name) : "",
          elapsedTime: Number(event && event.elapsedTime) || 0
        });
        utterance.onend = event => settlePending(current, {
          status: "ended",
          backendId: "native",
          elapsedTime: Number(event && event.elapsedTime) || 0
        });
        utterance.onerror = event => {
          const nativeCode = event && event.error ? String(event.error) : "unknown";
          if (nativeCode === "canceled" || nativeCode === "interrupted") {
            settlePending(current, { status: "cancelled", reason: nativeCode, backendId: "native" });
            return;
          }
          settlePending(current, null, new TtsEngineError(
            "Native Speech Synthesis त्रुटि: " + nativeCode,
            "NATIVE_SPEECH_ERROR",
            { nativeCode }
          ));
        };

        try {
          synthesis.speak(utterance);
        } catch (error) {
          settlePending(current, null, asError(error, "NATIVE_SPEAK_FAILED"));
        }
      });
    },
    pause() {
      if (!synthesis || typeof synthesis.pause !== "function") return false;
      synthesis.pause();
      return true;
    },
    resume() {
      if (!synthesis || typeof synthesis.resume !== "function") return false;
      synthesis.resume();
      return true;
    },
    cancel() {
      if (!synthesis || typeof synthesis.cancel !== "function") return false;
      const current = pending;
      try {
        synthesis.cancel();
      } finally {
        if (current) settlePending(current, { status: "cancelled", reason: "user", backendId: "native" });
      }
      return true;
    },
    async dispose() {
      if (synthesis && typeof synthesis.removeEventListener === "function" && voiceListener) {
        synthesis.removeEventListener("voiceschanged", voiceListener);
      } else if (synthesis && voiceListener && synthesis.onvoiceschanged === voiceListener) {
        synthesis.onvoiceschanged = previousVoiceHandler;
      }
      voiceListener = null;
      previousVoiceHandler = null;
      if (pending && synthesis && typeof synthesis.cancel === "function") {
        const current = pending;
        try { synthesis.cancel(); } finally {
          settlePending(current, { status: "cancelled", reason: "disposed", backendId: "native" });
        }
      }
      emitEvent = () => {};
    }
  };
}

export function createTtsEngine(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TtsEngineError("createTtsEngine() के विकल्प Object होने चाहिए।", "INVALID_ENGINE_OPTIONS");
  }
  const host = options.target || globalThis;
  const defaultBackend = String(options.defaultBackend || "native");
  const backends = new Map();
  const listeners = new Map();

  let phase = "idle";
  let playback = "idle";
  let activeBackendId = null;
  let activeBackend = null;
  let activeSpeech = null;
  let speechSequence = 0;
  let initializePromise = null;
  let initializingBackendId = null;
  let cancelPromise = null;
  let disposePromise = null;
  let capabilities = null;
  let lastError = null;
  let lastDiagnostics = null;
  let lastPronunciationReport = null;
  let disposed = false;

  function emit(eventName, detail = {}) {
    const callbacks = listeners.get(eventName);
    if (!callbacks) return;
    const event = Object.freeze({
      type: eventName,
      detail: freezeCopy(detail),
      timestamp: Date.now(),
      engineVersion: TTS_ENGINE_VERSION
    });
    callbacks.forEach(callback => {
      try { callback(event.detail, event); } catch (error) {
        if (host && host.console && typeof host.console.error === "function") {
          host.console.error("[Swar-Sadhika TTS] Event listener failed:", error);
        }
      }
    });
  }

  function ensureNotDisposed() {
    if (disposed || phase === "disposed") {
      throw new TtsEngineError("TTS Engine बंद हो चुका है।", "ENGINE_DISPOSED");
    }
  }

  function getStatus() {
    const backend = activeBackend;
    return Object.freeze({
      version: TTS_ENGINE_VERSION,
      phase,
      playback,
      ready: phase === "ready" && Boolean(backend),
      speaking: playback === "speaking",
      paused: playback === "paused",
      backendId: activeBackendId,
      backendType: backend ? backend.type : null,
      backendLabel: backend ? backend.label : null,
      localOnly: true,
      lastError: lastError ? Object.freeze({ code: lastError.code, message: lastError.message }) : null,
      pronunciationKnowledgeBaseVersion: VEDIC_PRONUNCIATION_VERSION,
      lastPronunciationReport: lastPronunciationReport
    });
  }

  async function detectCapabilities() {
    const navigatorObject = host && host.navigator ? host.navigator : {};
    const storage = navigatorObject.storage;
    let storageEstimate = null;
    if (storage && typeof storage.estimate === "function") {
      try {
        const estimate = await storage.estimate();
        const quota = Number.isFinite(estimate && estimate.quota) ? estimate.quota : null;
        const usage = Number.isFinite(estimate && estimate.usage) ? estimate.usage : null;
        storageEstimate = Object.freeze({
          quota,
          usage,
          available: quota !== null && usage !== null ? Math.max(0, quota - usage) : null
        });
      } catch (error) {
        storageEstimate = Object.freeze({ error: error && error.message ? error.message : "Storage estimate unavailable" });
      }
    }

    let webGpuAvailable = false;
    try { webGpuAvailable = Boolean(navigatorObject.gpu); } catch (_) {}

    capabilities = Object.freeze({
      secureContext: Boolean(host && host.isSecureContext),
      online: typeof navigatorObject.onLine === "boolean" ? navigatorObject.onLine : null,
      speechSynthesis: Boolean(host && host.speechSynthesis &&
        ["speak", "getVoices", "pause", "resume", "cancel"].every(method => typeof host.speechSynthesis[method] === "function")),
      speechSynthesisUtterance: Boolean(host && typeof host.SpeechSynthesisUtterance === "function"),
      webAudio: Boolean(host && (typeof host.AudioContext === "function" || typeof host.webkitAudioContext === "function")),
      webWorker: Boolean(host && typeof host.Worker === "function"),
      webAssembly: Boolean(host && host.WebAssembly),
      webGpuApi: webGpuAvailable,
      indexedDB: Boolean(host && host.indexedDB),
      cacheStorage: Boolean(host && host.caches),
      opfs: Boolean(storage && typeof storage.getDirectory === "function"),
      storageEstimate
    });
    emit("capabilities", capabilities);
    return capabilities;
  }

  function validateBackend(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new TtsEngineError("Backend Adapter object आवश्यक है।", "INVALID_BACKEND");
    }
    const id = typeof adapter.id === "string" ? adapter.id : "";
    if (!BACKEND_ID_PATTERN.test(id)) {
      throw new TtsEngineError("Backend ID का प्रारूप अमान्य है।", "INVALID_BACKEND_ID");
    }
    if (!String(adapter.label || "").trim()) {
      throw new TtsEngineError("Backend का label आवश्यक है।", "INVALID_BACKEND_LABEL");
    }
    if (!["native", "neural", "custom"].includes(adapter.type)) {
      throw new TtsEngineError("Backend type native, neural या custom होना चाहिए।", "INVALID_BACKEND_TYPE");
    }
    if (adapter.type !== "native" &&
        (adapter.executionMode !== "local" || adapter.inferenceRequiresNetwork !== false)) {
      throw new TtsEngineError(
        "Neural/Custom Backend को executionMode=local और inferenceRequiresNetwork=false घोषित करना होगा।",
        "NON_LOCAL_BACKEND_REJECTED"
      );
    }
    const missing = REQUIRED_BACKEND_METHODS.filter(method => typeof adapter[method] !== "function");
    if (missing.length) {
      throw new TtsEngineError("Backend में आवश्यक methods अनुपस्थित हैं: " + missing.join(", "), "INCOMPLETE_BACKEND", { missing });
    }
    return id;
  }

  function registerBackend(adapter) {
    ensureNotDisposed();
    const id = validateBackend(adapter);
    if (backends.has(id)) {
      throw new TtsEngineError("यह Backend पहले से पंजीकृत है: " + id, "BACKEND_ALREADY_REGISTERED");
    }
    backends.set(id, adapter);
    lastDiagnostics = null;
    emit("backendregistered", { id, type: adapter.type, label: adapter.label });
    return Object.freeze({ id, type: adapter.type, label: adapter.label });
  }

  function listBackends() {
    return Object.freeze(Array.from(backends.values(), backend => Object.freeze({
      id: backend.id,
      type: backend.type,
      label: backend.label,
      status: backend.id === activeBackendId ? (phase === "ready" ? "ready" : phase) : "registered"
    })));
  }

  async function cleanupBackend(adapter) {
    if (!adapter) return [];
    const failures = [];
    if (typeof adapter.cancel === "function") {
      try { await adapter.cancel(); }
      catch (error) { failures.push(asError(error, "BACKEND_CANCEL_FAILED")); }
    }
    if (typeof adapter.dispose === "function") {
      try { await adapter.dispose(); }
      catch (error) { failures.push(asError(error, "BACKEND_DISPOSE_FAILED")); }
    }
    return failures;
  }

  async function initialize(initOptions = {}) {
    ensureNotDisposed();
    if (cancelPromise) await cancelPromise;
    ensureNotDisposed();
    if (!initOptions || typeof initOptions !== "object" || Array.isArray(initOptions)) {
      throw new TtsEngineError("initialize() के विकल्प Object होने चाहिए।", "INVALID_INITIALIZE_OPTIONS");
    }
    const backendId = String(initOptions.backendId || defaultBackend);
    if (phase === "ready" && activeBackendId === backendId) return getStatus();
    const requestedAdapter = backends.get(backendId);
    if (!requestedAdapter) {
      throw new TtsEngineError("Backend पंजीकृत नहीं है: " + backendId, "BACKEND_NOT_REGISTERED");
    }
    if (initializePromise) {
      if (initializingBackendId !== backendId) {
        throw new TtsEngineError("दूसरा Backend पहले से initialize हो रहा है।", "BACKEND_SWITCH_BUSY");
      }
      return initializePromise;
    }

    const previousBackend = activeBackend;
    const previousBackendId = activeBackendId;
    initializingBackendId = backendId;
    initializePromise = (async () => {
      phase = "initializing";
      lastError = null;
      lastDiagnostics = null;
      emit("statuschange", getStatus());
      let requestedInitializeAttempted = false;
      try {
        const currentCapabilities = await detectCapabilities();
        ensureNotDisposed();
        const probeResult = await requestedAdapter.probe({ target: host, capabilities: currentCapabilities });
        ensureNotDisposed();
        const probe = typeof probeResult === "boolean" ? { supported: probeResult } : (probeResult || {});
        if (probe.supported !== true) {
          lastError = new TtsEngineError(
            probe.reason || "चयनित Backend इस डिवाइस पर उपलब्ध नहीं है।",
            "BACKEND_UNSUPPORTED",
            { backendId }
          );
          if (previousBackend) {
            phase = "ready";
            emit("backendselectionrejected", { backendId, reason: lastError.message });
          } else {
            phase = "unsupported";
            emit("unsupported", { backendId, reason: lastError.message });
          }
          emit("statuschange", getStatus());
          return Object.freeze({ ...getStatus(), requestedBackendId: backendId, selectionSupported: false });
        }

        if (requestedAdapter !== previousBackend) {
          if (previousBackend && activeSpeech) await cancel();
          requestedInitializeAttempted = true;
          await requestedAdapter.initialize({ target: host, capabilities: currentCapabilities, emit });
          ensureNotDisposed();
        }

        const voices = await requestedAdapter.getVoices();
        ensureNotDisposed();
        activeBackend = requestedAdapter;
        activeBackendId = backendId;
        phase = "ready";
        playback = "idle";
        lastError = null;

        if (previousBackend && previousBackend !== requestedAdapter) {
          const cleanupFailures = await cleanupBackend(previousBackend);
          ensureNotDisposed();
          cleanupFailures.forEach(cleanupError => emit("warning", {
            code: cleanupError.code,
            message: cleanupError.message,
            backendId: previousBackendId
          }));
        }

        emit("ready", { backendId, voiceCount: Array.isArray(voices) ? voices.length : 0 });
        emit("statuschange", getStatus());
        return getStatus();
      } catch (error) {
        if (requestedInitializeAttempted && requestedAdapter !== previousBackend && activeBackend !== requestedAdapter) {
          const cleanupFailures = await cleanupBackend(requestedAdapter);
          cleanupFailures.forEach(cleanupError => emit("warning", {
            code: cleanupError.code,
            message: cleanupError.message,
            backendId
          }));
        }
        if (disposed) throw asError(error, "ENGINE_INITIALIZATION_FAILED");
        activeBackend = previousBackend;
        activeBackendId = previousBackendId;
        phase = previousBackend ? "ready" : "error";
        playback = "idle";
        lastError = asError(error, "ENGINE_INITIALIZATION_FAILED");
        emit("error", { code: lastError.code, message: lastError.message });
        emit("statuschange", getStatus());
        throw lastError;
      }
    })();

    try {
      return await initializePromise;
    } finally {
      initializePromise = null;
      initializingBackendId = null;
    }
  }

  async function selectBackend(backendId) {
    ensureNotDisposed();
    return initialize({ backendId: String(backendId || "") });
  }

  async function getVoices(voiceOptions = {}) {
    ensureNotDisposed();
    if (!voiceOptions || typeof voiceOptions !== "object" || Array.isArray(voiceOptions)) {
      throw new TtsEngineError("getVoices() के विकल्प Object होने चाहिए।", "INVALID_VOICE_OPTIONS");
    }
    const backendId = String(voiceOptions.backendId || activeBackendId || defaultBackend);
    const adapter = backends.get(backendId);
    if (!adapter) throw new TtsEngineError("Backend पंजीकृत नहीं है: " + backendId, "BACKEND_NOT_REGISTERED");
    const voices = await adapter.getVoices();
    ensureNotDisposed();
    const available = Array.isArray(voices) ? voices.slice() : [];
    return Object.freeze(adapter.type === "native"
      ? available.filter(voice => voice && voice.localService === true)
      : available);
  }

  async function speak(text, speechOptions = {}) {
    ensureNotDisposed();
    if (cancelPromise) await cancelPromise;
    ensureNotDisposed();
    if (!speechOptions || typeof speechOptions !== "object" || Array.isArray(speechOptions)) {
      throw new TtsEngineError("speak() के विकल्प Object होने चाहिए।", "INVALID_SPEECH_OPTIONS");
    }
    if (phase !== "ready" || !activeBackend) {
      throw new TtsEngineError("TTS Backend तैयार नहीं है। पहले initialize() सफल होना चाहिए।", "ENGINE_NOT_READY");
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new TtsEngineError("वाचन के लिए अर्थपूर्ण पाठ आवश्यक है।", "EMPTY_SPEECH_TEXT");
    }
    if (activeSpeech) {
      if (speechOptions.replace === false) {
        throw new TtsEngineError("एक वाचन पहले से चल रहा है।", "SPEECH_BUSY");
      }
      await cancel();
      if (phase !== "ready" || !activeBackend) {
        throw new TtsEngineError("वाचन बदलते समय Backend तैयार नहीं रहा।", "ENGINE_NOT_READY");
      }
    }

    const adapter = activeBackend;
    const backendId = activeBackendId;
    const pronunciationOptions = speechOptions.pronunciation && typeof speechOptions.pronunciation === "object"
      ? speechOptions.pronunciation
      : {};
    const preparedSpeech = prepareSpeech(text, pronunciationOptions);
    const analysis = preparedSpeech.analysis;
    const pronunciationSummary = Object.freeze({
      codePointCount: analysis.codePointCount,
      wordCount: analysis.words.length,
      knownDifficultWordCount: analysis.knownDifficultWords.length,
      unlistedWordCount: analysis.unlistedWords.length,
      conjunctCount: analysis.conjuncts.length,
      matraCount: analysis.matras.total,
      accentMarkCount: analysis.accentMarks.length,
      unclassifiedMarkCount: analysis.unclassifiedMarks.length,
      requiresBranchContext: preparedSpeech.requiresBranchContext,
      requiresAccentAwareBackend: preparedSpeech.requiresAccentAwareBackend,
      nativeTtsRecommendation: preparedSpeech.nativeTtsRecommendation,
      originalTextPreserved: preparedSpeech.speechText === text
    });
    lastPronunciationReport = pronunciationSummary;
    lastDiagnostics = null;
    emit("pronunciationanalysis", { backendId, ...pronunciationSummary });
    if (preparedSpeech.blockedReasons.length) {
      emit("pronunciationwarning", {
        backendId, backendType: adapter.type,
        reasons: preparedSpeech.blockedReasons,
        nativeTtsRecommendation: preparedSpeech.nativeTtsRecommendation,
        message: "विशेष/अज्ञात चिह्नों का उच्चारण चयनित Backend पर प्रमाणित नहीं है। मूल पाठ बिना बदलाव के भेजा जाएगा।"
      });
    }
    const token = ++speechSequence;
    const backendOptions = { ...speechOptions };
    delete backendOptions.replace;
    delete backendOptions.pronunciation;
    activeSpeech = { token, backendId };
    playback = "speaking";
    lastError = null;
    emit("speechstart", { backendId, text, pronunciation: pronunciationSummary });
    emit("statuschange", getStatus());
    try {
      const result = await adapter.speak(preparedSpeech.speechText, backendOptions);
      if (token !== speechSequence) return Object.freeze({ status: "cancelled", backendId });
      activeSpeech = null;
      playback = "idle";
      const outcome = result && result.status ? String(result.status) : "ended";
      if (outcome === "cancelled") emit("speechcancel", { backendId, result: freezeCopy(result) });
      else emit("speechend", { backendId, result: freezeCopy(result || { status: "ended" }) });
      emit("statuschange", getStatus());
      return result || Object.freeze({ status: "ended", backendId });
    } catch (error) {
      if (token !== speechSequence) return Object.freeze({ status: "cancelled", backendId });
      activeSpeech = null;
      playback = "idle";
      lastError = asError(error, "SPEECH_FAILED");
      emit("speecherror", { backendId, code: lastError.code, message: lastError.message });
      emit("statuschange", getStatus());
      throw lastError;
    }
  }

  async function pause() {
    ensureNotDisposed();
    if (!activeSpeech || !activeBackend || playback !== "speaking") return false;
    const speech = activeSpeech;
    const backend = activeBackend;
    try {
      const result = await backend.pause();
      if (result === false || activeSpeech !== speech || activeBackend !== backend) return false;
      playback = "paused";
      emit("speechpaused", { backendId: activeBackendId });
      emit("statuschange", getStatus());
      return true;
    } catch (error) {
      lastError = asError(error, "SPEECH_PAUSE_FAILED");
      emit("speecherror", { code: lastError.code, message: lastError.message });
      return false;
    }
  }

  async function resume() {
    ensureNotDisposed();
    if (!activeSpeech || !activeBackend || playback !== "paused") return false;
    const speech = activeSpeech;
    const backend = activeBackend;
    try {
      const result = await backend.resume();
      if (result === false || activeSpeech !== speech || activeBackend !== backend) return false;
      playback = "speaking";
      emit("speechresumed", { backendId: activeBackendId });
      emit("statuschange", getStatus());
      return true;
    } catch (error) {
      lastError = asError(error, "SPEECH_RESUME_FAILED");
      emit("speecherror", { code: lastError.code, message: lastError.message });
      return false;
    }
  }

  function cancel() {
    ensureNotDisposed();
    if (cancelPromise) return cancelPromise;
    const hadSpeech = Boolean(activeSpeech);
    const backend = activeBackend;
    const backendId = activeBackendId;
    const token = ++speechSequence;
    activeSpeech = null;
    playback = "cancelling";
    emit("statuschange", getStatus());

    cancelPromise = Promise.resolve().then(async () => {
      let failure = null;
      try {
        if (backend && typeof backend.cancel === "function") await backend.cancel();
      } catch (error) {
        failure = asError(error, "SPEECH_CANCEL_FAILED");
        lastError = failure;
        emit("speecherror", { code: failure.code, message: failure.message });
      } finally {
        if (speechSequence === token) playback = "idle";
        if (hadSpeech) emit("speechcancel", { backendId, reason: "cancelled" });
        emit("statuschange", getStatus());
      }
      if (failure) throw failure;
      return hadSpeech;
    }).finally(() => {
      cancelPromise = null;
    });
    return cancelPromise;
  }

  async function runDiagnostics() {
    ensureNotDisposed();
    const currentCapabilities = await detectCapabilities();
    ensureNotDisposed();
    const results = [];
    for (const adapter of backends.values()) {
      try {
        const raw = await adapter.probe({ target: host, capabilities: currentCapabilities });
        ensureNotDisposed();
        const probe = typeof raw === "boolean" ? { supported: raw } : (raw || {});
        results.push(Object.freeze({
          id: adapter.id,
          type: adapter.type,
          label: adapter.label,
          supported: probe.supported === true,
          reason: String(probe.reason || (probe.supported ? "Backend probe सफल।" : "Backend उपलब्ध नहीं।")),
          probeOnly: true,
          active: adapter.id === activeBackendId
        }));
      } catch (error) {
        ensureNotDisposed();
        const failure = asError(error, "BACKEND_PROBE_FAILED");
        results.push(Object.freeze({
          id: adapter.id,
          type: adapter.type,
          label: adapter.label,
          supported: false,
          reason: failure.message,
          errorCode: failure.code,
          probeOnly: true,
          active: adapter.id === activeBackendId
        }));
      }
    }
    let voiceLocality = null;
    const nativeAdapter = backends.get("native");
    if (nativeAdapter) {
      try {
        const nativeVoices = await nativeAdapter.getVoices();
        ensureNotDisposed();
        voiceLocality = Object.freeze({
          available: nativeVoices.length,
          local: nativeVoices.filter(voice => voice && voice.localService === true).length,
          remote: nativeVoices.filter(voice => voice && voice.localService === false).length,
          unknown: nativeVoices.filter(voice => !voice || typeof voice.localService !== "boolean").length,
          note: "Native Voice का localService metadata स्थानीय और remote synthesizer में अंतर बताता है।"
        });
      } catch (error) {
        ensureNotDisposed();
        voiceLocality = Object.freeze({ error: asError(error, "VOICE_DIAGNOSTICS_FAILED").message });
      }
    }
    const pronunciationKnowledgeBase = getPronunciationKnowledgeBaseInfo();
    lastDiagnostics = Object.freeze({
      engineVersion: TTS_ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      phase,
      playback,
      selectedBackend: activeBackendId,
      capabilities: currentCapabilities,
      voiceLocality,
      backends: Object.freeze(results),
      pronunciationKnowledgeBase,
      note: "यह API/Backend/Pronunciation Knowledge Base जाँच है; यह स्वयं ऑडियो गुणवत्ता या शुद्ध वैदिक उच्चारण प्रमाणित नहीं करती।"
    });
    emit("diagnostics", lastDiagnostics);
    return lastDiagnostics;
  }

  function analyzeText(text, pronunciationOptions = {}) {
    ensureNotDisposed();
    try { return analyzeVedicPronunciationText(text, pronunciationOptions); }
    catch (error) { throw asError(error, "PRONUNCIATION_ANALYSIS_FAILED"); }
  }

  function prepareSpeech(text, pronunciationOptions = {}) {
    ensureNotDisposed();
    let prepared;
    try { prepared = prepareVedicSpeechText(text, pronunciationOptions); }
    catch (error) { throw asError(error, "PRONUNCIATION_PREPARATION_FAILED"); }
    if (!prepared || prepared.originalText !== text || prepared.speechText !== text || prepared.modified !== false) {
      throw new TtsEngineError("Pronunciation module ने मूल पाठ बदलने का प्रयास किया; TTS संचालन रोका गया।", "PRONUNCIATION_TEXT_MUTATION_BLOCKED");
    }
    return prepared;
  }

  function findPronunciation(word, pronunciationOptions = {}) {
    ensureNotDisposed();
    try { return findVedicPronunciation(word, pronunciationOptions); }
    catch (error) { throw asError(error, "PRONUNCIATION_LOOKUP_FAILED"); }
  }

  function getTextPronunciationDiagnostics(text, pronunciationOptions = {}) {
    ensureNotDisposed();
    try { return getVedicPronunciationDiagnostics(text, pronunciationOptions); }
    catch (error) { throw asError(error, "PRONUNCIATION_DIAGNOSTICS_FAILED"); }
  }

  function runPronunciationSelfTest() {
    ensureNotDisposed();
    try { return runVedicPronunciationSelfTest(); }
    catch (error) { throw asError(error, "PRONUNCIATION_SELF_TEST_FAILED"); }
  }

  function getPronunciationKnowledgeBaseInfo() {
    ensureNotDisposed();
    let coverage, selfTest;
    try {
      coverage = getVedicKnowledgeBaseCoverage();
      selfTest = runVedicPronunciationSelfTest();
    } catch (error) {
      throw asError(error, "PRONUNCIATION_KNOWLEDGE_BASE_FAILED");
    }
    return Object.freeze({
      available: true,
      version: VEDIC_PRONUNCIATION_VERSION,
      integrationMode: "analysis-only; original speech text preserved",
      coverage,
      selfTest: Object.freeze({ status: selfTest.status, total: selfTest.total, passed: selfTest.passed, failed: selfTest.failed })
    });
  }

  async function getCapabilities() {
    ensureNotDisposed();
    const currentCapabilities = await detectCapabilities();
    ensureNotDisposed();
    return currentCapabilities;
  }

  async function getDiagnostics() {
    ensureNotDisposed();
    return lastDiagnostics || runDiagnostics();
  }

  function on(eventName, callback) {
    ensureNotDisposed();
    if (typeof eventName !== "string" || !EVENT_NAME_PATTERN.test(eventName)) {
      throw new TtsEngineError("Event नाम अमान्य है।", "INVALID_EVENT_NAME");
    }
    if (typeof callback !== "function") {
      throw new TtsEngineError("Event listener Function होना चाहिए।", "INVALID_EVENT_LISTENER");
    }
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    const bucket = listeners.get(eventName);
    bucket.add(callback);
    return () => {
      bucket.delete(callback);
      if (!bucket.size) listeners.delete(eventName);
    };
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (disposed) return;
    disposed = true;
    phase = "disposing";
    speechSequence += 1;
    activeSpeech = null;
    playback = "idle";
    emit("statuschange", getStatus());
    disposePromise = (async () => {
      if (cancelPromise) {
        try { await cancelPromise; } catch (_) {}
      }
      if (initializePromise) {
        try { await initializePromise; } catch (_) {}
      }
      const backend = activeBackend;
      const backendId = activeBackendId;
      try {
        const cleanupFailures = await cleanupBackend(backend);
        cleanupFailures.forEach(cleanupError => emit("warning", {
          code: cleanupError.code,
          message: cleanupError.message,
          backendId
        }));
      } finally {
        activeBackend = null;
        activeBackendId = null;
        phase = "disposed";
        emit("disposed", { backendId });
        listeners.clear();
        backends.clear();
      }
    })();
    return disposePromise;
  }

  registerBackend(createNativeBackend(host));

  return Object.freeze({
    version: TTS_ENGINE_VERSION,
    initialize,
    getCapabilities,
    getStatus,
    analyzeText,
    prepareSpeech,
    findPronunciation,
    getTextPronunciationDiagnostics,
    getPronunciationKnowledgeBaseInfo,
    runPronunciationSelfTest,
    getDiagnostics,
    runDiagnostics,
    listBackends,
    registerBackend,
    selectBackend,
    getVoices,
    speak,
    pause,
    resume,
    cancel,
    on,
    dispose
  });
}

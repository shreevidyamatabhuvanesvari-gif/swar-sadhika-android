import {
  VEDIC_PRONUNCIATION_VERSION,
  analyzeVedicText as analyzeVedicPronunciationText,
  prepareVedicSpeech as prepareVedicSpeechText,
  findPronunciation as findVedicPronunciation,
  getPronunciationDiagnostics as getVedicPronunciationDiagnostics,
  getKnowledgeBaseCoverage as getVedicKnowledgeBaseCoverage,
  selfTest as runVedicPronunciationSelfTest
} from "./vedic-sanskrit-pronunciation.js";
import { createNanoServerKnowledgeAPI } from "../nano-server/nano-server-knowledge-api-part2.js";
import { createNanoServerTtsKnowledgeAdapter } from "../nano-server/nano-server-tts-knowledge-adapter-part2.js";
import {
  SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
  SWR_TTS_COMPILER_IMPROVEMENT_ID,
  compileSanskritSpeech,
  validateCompiledSpeech,
  getCompilerDiagnostics as getSanskritCompilerDiagnostics,
  selfTest as runSanskritCompilerSelfTest
} from "./sanskrit-pronunciation-compiler.js";

/* Swar-Sadhika Local TTS Engine Manager
 * Model-independent engine. This version uses only the browser's native
 * Speech Synthesis API; it performs no network requests and loads no model.
 */

export const TTS_ENGINE_VERSION = "1.3.0";
export const SWR_TTS_ENGINE_IMPROVEMENT_ID = "SWR-TTS-ENGINE-07";

export class TtsEngineError extends Error {
  constructor(message, code = "TTS_ENGINE_ERROR", details = null) {
    super(message);
    this.name = "TtsEngineError";
    this.code = code;
    this.details = details;
  }
}
export const TTS_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "sa", label: "संस्कृत", locale: "sa-IN" }),
  Object.freeze({ id: "hi", label: "हिंदी", locale: "hi-IN" })
]);
const TTS_LANGUAGE_BY_ID = new Map(TTS_LANGUAGE_OPTIONS.map(item => [item.id, item]));
function normalizeTtsLanguage(value) {
  const raw = typeof value === "string" ? value : value && typeof value.id === "string" ? value.id : "";
  const base = raw.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  const language = TTS_LANGUAGE_BY_ID.get(base);
  if (!language) throw new TtsEngineError(
    "केवल संस्कृत और हिंदी TTS भाषाएँ समर्थित हैं।",
    "UNSUPPORTED_TTS_LANGUAGE",
    { requested: raw, supported: TTS_LANGUAGE_OPTIONS.map(item => item.id) }
  );
  return language;
}
function languageForVoice(voice) {
  if (!voice || typeof voice.lang !== "string") return null;
  try { return normalizeTtsLanguage(voice.lang); } catch (_) { return null; }
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

const NATIVE_TTS_ENGINE_NAME = "Web Speech API SpeechSynthesis";

function makeCompilerFallbackResult(originalText, code, message) {
  const codePointLength = Array.from(originalText).length;
  const sourceMap = originalText.length ? [Object.freeze({
    kind: "copy",
    sourceStartUtf16: 0,
    sourceEndUtf16: originalText.length,
    sourceStartCodePoint: 0,
    sourceEndCodePoint: codePointLength,
    outputStartUtf16: 0,
    outputEndUtf16: originalText.length,
    outputStartCodePoint: 0,
    outputEndCodePoint: codePointLength,
    sourceText: originalText,
    outputText: originalText
  })] : [];
  return Object.freeze({
    originalText,
    speechText: originalText,
    modified: false,
    confidence: "fallback",
    matchedLexiconEntries: Object.freeze([]),
    appliedRules: Object.freeze([]),
    warnings: Object.freeze([Object.freeze({
      code: String(code || "COMPILER_SAFE_FALLBACK"),
      message: String(message || "Compiler उपलब्ध नहीं हुआ; मूल पाठ सुरक्षित रखा गया।"),
      severity: "warning",
      details: null
    })]),
    sourceMap: Object.freeze(sourceMap),
    compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
    analysisSummary: null
  });
}

function validateEngineCompilerOutput(compiled, originalText) {
  const base = validateCompiledSpeech(compiled);
  const errors = Array.isArray(base && base.errors) ? base.errors.slice() : ["compiler-validation-result-invalid"];
  if (!compiled || typeof compiled !== "object" || Array.isArray(compiled)) {
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }
  if (compiled.improvementId !== SWR_TTS_COMPILER_IMPROVEMENT_ID) errors.push("compiler-improvement-id-mismatch");
  if (compiled.originalText !== originalText) errors.push("compiler-original-text-mismatch");
  if (typeof compiled.speechText !== "string" || !compiled.speechText.trim()) errors.push("compiler-speech-text-empty");
  if (compiled.modified && (!Array.isArray(compiled.appliedRules) || compiled.appliedRules.length === 0)) {
    errors.push("modified-output-has-no-applied-rules");
  }
  if (Array.isArray(compiled.sourceMap) && Array.isArray(compiled.appliedRules)) {
    const replacements = compiled.sourceMap.filter(segment => segment && segment.kind === "replace");
    if (replacements.length !== compiled.appliedRules.length) errors.push("replacement-segment-count-mismatch");
    const rules = new Map(compiled.appliedRules.map(rule => [rule && rule.ruleId, rule]));
    for (const segment of replacements) {
      const rule = rules.get(segment.ruleId);
      if (!rule || rule.entryId !== segment.entryId ||
          rule.originalForm !== segment.sourceText ||
          String(rule.nativeSpeechText || "").trim() !== segment.outputText) {
        errors.push("replacement-provenance-does-not-match-source-map");
        break;
      }
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

function detectNativePlatform(host, suppliedPlatform) {
  if (typeof suppliedPlatform === "string" && suppliedPlatform.trim()) return suppliedPlatform.trim();
  let userAgent = "";
  try { userAgent = String(host && host.navigator && host.navigator.userAgent || ""); } catch (_) {}
  if (/Android/i.test(userAgent) && /(?:Chrome|CriOS)\//i.test(userAgent)) return "Android Chrome";
  return "";
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
    getSelectedVoice(options = {}) {
      return resolveVoice(options);
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

export function selfTest() {
  const checks = [];
  const add = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  add("two-language-only", TTS_LANGUAGE_OPTIONS.length === 2 &&
    TTS_LANGUAGE_OPTIONS[0].id === "sa" && TTS_LANGUAGE_OPTIONS[1].id === "hi");
  add("sanskrit-locale", normalizeTtsLanguage("sa-IN").locale === "sa-IN");
  add("hindi-locale", normalizeTtsLanguage("hi-IN").locale === "hi-IN");
  add("reject-unsupported-language", (() => {
    try { normalizeTtsLanguage("en-US"); return false; }
    catch (error) { return error.code === "UNSUPPORTED_TTS_LANGUAGE"; }
  })());
  add("voice-language-identification", languageForVoice({ lang: "hi-IN" }).id === "hi");
  add("unsupported-voice-identification", languageForVoice({ lang: "en-US" }) === null);
  let compilerTest = null;
  try { compilerTest = runSanskritCompilerSelfTest(); } catch (_) {}
  add("pronunciation-compiler-self-test", Boolean(compilerTest &&
    compilerTest.status === "PASSED" && compilerTest.failed === 0));
  add("compiler-output-validator", (() => {
    const fallback = makeCompilerFallbackResult("अग्निः", "TEST_FALLBACK", "Self-test fallback.");
    return validateEngineCompilerOutput(fallback, "अग्निः").valid;
  })());
  return Object.freeze({
    module: "tts-engine", version: TTS_ENGINE_VERSION,
    improvementId: SWR_TTS_ENGINE_IMPROVEMENT_ID,
    compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks),
    compiler: compilerTest ? Object.freeze({
      status: compilerTest.status, total: compilerTest.total,
      passed: compilerTest.passed, failed: compilerTest.failed
    }) : null
  });
}

export function createTtsEngine(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TtsEngineError("createTtsEngine() के विकल्प Object होने चाहिए।", "INVALID_ENGINE_OPTIONS");
  }
  const host = options.target || globalThis;
  const defaultBackend = String(options.defaultBackend || "native");
  let selectedLanguage = normalizeTtsLanguage(options.defaultLanguage || "hi");
  let knowledgeAPI = options.knowledgeAPI || null;
  let knowledgeAdapter = options.knowledgeAdapter || null;
  const ownsKnowledgeAPI = !knowledgeAPI && !knowledgeAdapter;
  const ownsKnowledgeAdapter = !knowledgeAdapter;
  let knowledgeAdapterError = null;
  let knowledgeAutoLoadAttempted = false;
  if (!knowledgeAdapter) {
    try {
      if (!knowledgeAPI) knowledgeAPI = createNanoServerKnowledgeAPI({ engineOptions: { host } });
      knowledgeAdapter = createNanoServerTtsKnowledgeAdapter({ knowledgeAPI });
    } catch (error) {
      knowledgeAdapterError = asError(error, "KNOWLEDGE_ADAPTER_UNAVAILABLE");
      knowledgeAdapter = null;
    }
  }
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
      language: selectedLanguage,
      supportedLanguages: TTS_LANGUAGE_OPTIONS,
      knowledgeLoaded: Boolean(knowledgeAdapter && knowledgeAdapter.getDiagnostics().loaded),
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

        if (!knowledgeAutoLoadAttempted && knowledgeAdapter && options.autoLoadKnowledge !== false) {
          knowledgeAutoLoadAttempted = true;
          try {
            await loadKnowledge({ refreshManifest: true, downloadIfMissing: false });
          } catch (error) {
            if (!disposed) emit("knowledgewarning", {
              code: error && error.code ? error.code : "KNOWLEDGE_CACHE_UNAVAILABLE",
              message: error && error.message ? error.message : "Cached Knowledge उपलब्ध नहीं है।",
              automaticDownload: false
            });
          }
          ensureNotDisposed();
        }

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

  function getSupportedLanguages() { ensureNotDisposed(); return TTS_LANGUAGE_OPTIONS; }
  function getLanguage() { ensureNotDisposed(); return selectedLanguage; }
  function setLanguage(language) {
    ensureNotDisposed();
    if (activeSpeech || phase === "initializing") throw new TtsEngineError(
      "वाचन या Backend initialization के दौरान भाषा नहीं बदली जा सकती।", "LANGUAGE_CHANGE_BUSY"
    );
    selectedLanguage = normalizeTtsLanguage(language);
    lastDiagnostics = null;
    emit("languagechange", { language: selectedLanguage });
    return selectedLanguage;
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
    const requestedLanguage = voiceOptions.language == null ? null : normalizeTtsLanguage(voiceOptions.language);
    return Object.freeze((Array.isArray(voices) ? voices.slice() : []).filter(voice => {
      if (adapter.type === "native" && (!voice || voice.localService !== true)) return false;
      const language = languageForVoice(voice);
      return Boolean(language && (!requestedLanguage || language.id === requestedLanguage.id));
    }));
  }

  async function speak(text, speechOptions = {}) {
    ensureNotDisposed();
    if (cancelPromise) await cancelPromise;
    ensureNotDisposed();
    if (!speechOptions || typeof speechOptions !== "object" || Array.isArray(speechOptions)) {
      throw new TtsEngineError("speak() के विकल्प Object होने चाहिए।", "INVALID_SPEECH_OPTIONS");
    }
    if (phase !== "ready" || !activeBackend) throw new TtsEngineError(
      "TTS Backend तैयार नहीं है। पहले initialize() सफल होना चाहिए।", "ENGINE_NOT_READY"
    );
    const voiceLanguage = speechOptions.voice ? languageForVoice(speechOptions.voice) : null;
    if (speechOptions.voice && !voiceLanguage) throw new TtsEngineError(
      "चुनी हुई Voice संस्कृत या हिंदी के लिए पंजीकृत नहीं है।", "UNSUPPORTED_VOICE_LANGUAGE"
    );
    const speechLanguage = normalizeTtsLanguage(
      speechOptions.language || speechOptions.lang || (voiceLanguage && voiceLanguage.id) || selectedLanguage.id
    );
    if (voiceLanguage && voiceLanguage.id !== speechLanguage.id) throw new TtsEngineError(
      "चुनी हुई Voice और TTS भाषा अलग-अलग हैं। उसी भाषा की स्थानीय Voice चुनें।",
      "VOICE_LANGUAGE_MISMATCH",
      { voiceLanguage: voiceLanguage.id, requestedLanguage: speechLanguage.id }
    );
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
    const pronunciationOptions = speechOptions.pronunciation && typeof speechOptions.pronunciation === "object" &&
      !Array.isArray(speechOptions.pronunciation) ? speechOptions.pronunciation : {};
    let selectedNativeVoice = speechOptions.voice || null;
    let voiceResolutionError = null;
    if (adapter.type === "native" && typeof adapter.getSelectedVoice === "function") {
      try {
        selectedNativeVoice = adapter.getSelectedVoice({
          ...speechOptions, voice: speechOptions.voice, lang: speechLanguage.locale
        });
      } catch (error) {
        selectedNativeVoice = null;
        voiceResolutionError = asError(error, "NATIVE_VOICE_PROFILE_RESOLUTION_FAILED");
      }
    }
    const configuredVoiceProfile = (
      speechOptions.voiceProfile && typeof speechOptions.voiceProfile === "object" ? speechOptions.voiceProfile :
      pronunciationOptions.voiceProfile && typeof pronunciationOptions.voiceProfile === "object" ? pronunciationOptions.voiceProfile :
      options.nativeVoiceProfile && typeof options.nativeVoiceProfile === "object" ? options.nativeVoiceProfile :
      options.voiceProfile && typeof options.voiceProfile === "object" ? options.voiceProfile : {}
    );
    const nativeVoiceProfile = Object.freeze({
      ...configuredVoiceProfile,
      engine: configuredVoiceProfile.engine || NATIVE_TTS_ENGINE_NAME,
      platform: detectNativePlatform(host, configuredVoiceProfile.platform)
    });
    const preparedSpeech = prepareSpeech(text, {
      ...pronunciationOptions,
      backendType: adapter.type,
      voice: selectedNativeVoice,
      voiceProfile: nativeVoiceProfile
    });
    const analysis = preparedSpeech.analysis || {};
    const knowledgeGuidance = preparedSpeech.knowledgeGuidance;
    const pronunciationSummary = Object.freeze({
      language: speechLanguage.id,
      codePointCount: Number(analysis.codePointCount) || Array.from(text).length,
      wordCount: Array.isArray(analysis.words) ? analysis.words.length : 0,
      knownDifficultWordCount: Array.isArray(analysis.knownDifficultWords) ? analysis.knownDifficultWords.length : 0,
      unlistedWordCount: Array.isArray(analysis.unlistedWords) ? analysis.unlistedWords.length : 0,
      conjunctCount: Array.isArray(analysis.conjuncts) ? analysis.conjuncts.length : 0,
      matraCount: Number(analysis.matras && analysis.matras.total) || 0,
      accentMarkCount: Array.isArray(analysis.accentMarks) ? analysis.accentMarks.length : 0,
      unclassifiedMarkCount: Array.isArray(analysis.unclassifiedMarks) ? analysis.unclassifiedMarks.length : 0,
      requiresBranchContext: Boolean(preparedSpeech.requiresBranchContext),
      requiresAccentAwareBackend: Boolean(preparedSpeech.requiresAccentAwareBackend),
      nativeTtsRecommendation: preparedSpeech.nativeTtsRecommendation || "original-text-fallback",
      originalTextPreserved: preparedSpeech.speechText === text,
      originalTextRetained: preparedSpeech.originalText === text,
      speechTextModified: preparedSpeech.speechText !== text,
      knowledgeMatchedTermCount: knowledgeGuidance.matches.length,
      knowledgeContextRequiredCount: knowledgeGuidance.contextRequired.length,
      compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
      compilerConfidence: preparedSpeech.pronunciationConfidence,
      compilerOutputValidated: preparedSpeech.compilerValidation.valid,
      matchedLexiconEntryCount: preparedSpeech.matchedLexiconEntries.length,
      appliedRuleCount: preparedSpeech.appliedRules.length,
      fallbackRuleCount: preparedSpeech.fallbackRules.length,
      knowledgeAppliedToSpeech: preparedSpeech.knowledgeAppliedToSpeech,
      selectedVoiceResolved: Boolean(selectedNativeVoice),
      voiceResolutionError: voiceResolutionError ? Object.freeze({
        code: voiceResolutionError.code, message: voiceResolutionError.message
      }) : null
    });
    lastPronunciationReport = pronunciationSummary;
    lastDiagnostics = null;
    emit("pronunciationanalysis", { backendId, ...pronunciationSummary });
    emit("knowledgeguidance", {
      backendId,
      language: speechLanguage.id,
      matches: knowledgeGuidance.matches,
      contextRequired: knowledgeGuidance.contextRequired,
      pendingReviewCount: knowledgeGuidance.pendingReviewCount || 0,
      note: knowledgeGuidance.note
    });
    emit("speechpreparationdiagnostics", {
      backendId,
      originalText: text,
      speechText: preparedSpeech.speechText,
      knowledgeAppliedToSpeech: preparedSpeech.knowledgeAppliedToSpeech,
      appliedRules: preparedSpeech.appliedRules,
      fallbackRules: preparedSpeech.fallbackRules,
      validation: preparedSpeech.compilerValidation,
      diagnostics: preparedSpeech.speechPreparationDiagnostics
    });
    if (voiceResolutionError) {
      emit("pronunciationwarning", {
        backendId, backendType: adapter.type,
        code: voiceResolutionError.code, message: voiceResolutionError.message, safeFallback: true
      });
    }
    if (preparedSpeech.fallbackRules.length) {
      emit("pronunciationwarning", {
        backendId, backendType: adapter.type,
        reasons: preparedSpeech.fallbackRules,
        knowledgeAppliedToSpeech: preparedSpeech.knowledgeAppliedToSpeech,
        message: "केवल Compiler द्वारा validated तथा सभी review/source/voice/context शर्तें पूरी करने वाले नियम ही लागू किए गए हैं।"
      });
    }
    if (preparedSpeech.blockedReasons && preparedSpeech.blockedReasons.length) {
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
    delete backendOptions.language;
    if (adapter.type === "native" && selectedNativeVoice) backendOptions.voice = selectedNativeVoice;
    backendOptions.lang = speechLanguage.locale;
    activeSpeech = { token, backendId };
    playback = "speaking";
    lastError = null;
    emit("speechstart", { backendId, text, pronunciation: pronunciationSummary });
    emit("statuschange", getStatus());
    try {
      const result = await adapter.speak(
        preparedSpeech.compilerValidation.valid ? preparedSpeech.speechText : text,
        backendOptions
      );
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
    const knowledgeDiagnostics = getKnowledgeDiagnostics();
    lastDiagnostics = Object.freeze({
      engineVersion: TTS_ENGINE_VERSION,
      selectedLanguage,
      supportedLanguages: TTS_LANGUAGE_OPTIONS,
      knowledge: knowledgeDiagnostics,
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

  function getKnowledgeDiagnostics() {
    ensureNotDisposed();
    if (knowledgeAdapter) return knowledgeAdapter.getDiagnostics();
    return Object.freeze({
      available: false, loaded: false, hasGuidance: false,
      error: knowledgeAdapterError
        ? Object.freeze({ code: knowledgeAdapterError.code, message: knowledgeAdapterError.message })
        : Object.freeze({ code: "KNOWLEDGE_ADAPTER_UNAVAILABLE", message: "Knowledge Adapter उपलब्ध नहीं है।" })
    });
  }

  function getKnowledgeGuidance(text, guidanceOptions = {}) {
    ensureNotDisposed();
    if (typeof text !== "string") throw new TtsEngineError("Knowledge text string होना चाहिए।", "INVALID_TEXT");
    if (!knowledgeAdapter) return Object.freeze({
      matches: Object.freeze([]), contextRequired: Object.freeze([]), matchedTermCount: 0,
      pendingReviewCount: 0, available: false,
      note: "Nano Server Knowledge Adapter उपलब्ध नहीं है; मूल पाठ अक्षरशः सुरक्षित रहेगा।"
    });
    const guidance = knowledgeAdapter.getGuidance(text, guidanceOptions);
    const sourceMatches = Array.isArray(guidance && guidance.matches) ? guidance.matches : [];
    const reviewedMatches = sourceMatches.filter(item => item && item.reviewStatus === "reviewed");
    return Object.freeze({
      ...guidance,
      matches: Object.freeze(reviewedMatches),
      matchedTermCount: new Set(reviewedMatches.map(item => item.term)).size,
      pendingReviewCount: sourceMatches.length - reviewedMatches.length,
      available: true
    });
  }

  async function loadKnowledge(loadOptions = {}) {
    ensureNotDisposed();
    if (!loadOptions || typeof loadOptions !== "object" || Array.isArray(loadOptions)) {
      throw new TtsEngineError("Knowledge load options object होना चाहिए।", "INVALID_KNOWLEDGE_OPTIONS");
    }
    if (!knowledgeAdapter) throw new TtsEngineError(
      knowledgeAdapterError ? knowledgeAdapterError.message : "Nano Server Knowledge Adapter उपलब्ध नहीं है।",
      knowledgeAdapterError ? knowledgeAdapterError.code : "KNOWLEDGE_ADAPTER_UNAVAILABLE"
    );
    const safeLoadOptions = {
      ...loadOptions,
      downloadIfMissing: loadOptions.downloadIfMissing === true
    };
    try {
      const result = await knowledgeAdapter.loadKnowledge(safeLoadOptions);
      ensureNotDisposed();
      lastDiagnostics = null;
      emit("knowledgechange", result);
      return result;
    } catch (error) {
      const wrapped = asError(error, "KNOWLEDGE_LOAD_FAILED");
      emit("knowledgeerror", { code: wrapped.code, message: wrapped.message });
      throw wrapped;
    }
  }

  function prepareSpeech(text, pronunciationOptions = {}) {
    ensureNotDisposed();
    if (typeof text !== "string") {
      throw new TtsEngineError("वाचन-तैयारी के लिए मूल पाठ string होना चाहिए।", "INVALID_TEXT");
    }
    const prepOptions = pronunciationOptions && typeof pronunciationOptions === "object" &&
      !Array.isArray(pronunciationOptions) ? pronunciationOptions : {};
    let baseline = null;
    let baselineError = null;
    try {
      baseline = prepareVedicSpeechText(text, prepOptions);
      if (!baseline || baseline.originalText !== text || baseline.speechText !== text || baseline.modified !== false) {
        throw new TtsEngineError("Pronunciation Analyzer का आधार-पाठ अमान्य है।", "PRONUNCIATION_ANALYSIS_RESULT_INVALID");
      }
    } catch (error) {
      baselineError = asError(error, "PRONUNCIATION_PREPARATION_FAILED");
      let analysis = null;
      try { analysis = analyzeVedicPronunciationText(text, prepOptions); } catch (_) {}
      baseline = {
        originalText: text, speechText: text, modified: false, safeToTransform: false,
        analysis,
        nativeTtsRecommendation: "original-text-fallback",
        requiresBranchContext: Boolean(analysis && analysis.needsBranchContext),
        requiresAccentAwareBackend: Boolean(analysis && (analysis.accentMarks.length || analysis.hasVedicExtensions || analysis.hasSamavedaExtended)),
        blockedReasons: Object.freeze(["Pronunciation Analyzer का परिणाम उपलब्ध नहीं; मूल पाठ सुरक्षित रखा गया।"]),
        policy: "विश्लेषण विफल होने पर मूल पाठ अक्षरशः सुरक्षित रखा जाता है।"
      };
    }

    let knowledgeGuidance;
    try {
      knowledgeGuidance = getKnowledgeGuidance(text, prepOptions);
    } catch (error) {
      const failure = asError(error, "KNOWLEDGE_GUIDANCE_FAILED");
      knowledgeGuidance = Object.freeze({
        matches: Object.freeze([]), contextRequired: Object.freeze([]), matchedTermCount: 0,
        pendingReviewCount: 0, available: false,
        error: Object.freeze({ code: failure.code, message: failure.message }),
        note: "Knowledge Guidance उपलब्ध नहीं है; Native TTS को मूल पाठ दिया जाएगा।"
      });
    }

    let compilerOutput;
    try {
      if (prepOptions.backendType && prepOptions.backendType !== "native") {
        compilerOutput = makeCompilerFallbackResult(
          text, "NON_NATIVE_BACKEND_COMPILER_SKIPPED",
          "यह Compiler केवल Native SpeechSynthesis pipeline के लिए सक्रिय है; मूल पाठ सुरक्षित रखा गया।"
        );
      } else {
        compilerOutput = compileSanskritSpeech({
          originalText: text,
          analysis: baseline.analysis || undefined,
          adapter: knowledgeAdapter,
          voice: prepOptions.voice || prepOptions.selectedVoice || null,
          voiceProfile: prepOptions.voiceProfile || {},
          shakha: prepOptions.shakha || (prepOptions.context && prepOptions.context.shakha) || null,
          patha: prepOptions.patha || (prepOptions.context && prepOptions.context.patha) || null,
          context: prepOptions.context || {}
        });
      }
    } catch (error) {
      const failure = asError(error, "PRONUNCIATION_COMPILER_FAILED");
      compilerOutput = makeCompilerFallbackResult(text, failure.code, failure.message);
    }

    let compilerValidation;
    try {
      compilerValidation = validateEngineCompilerOutput(compilerOutput, text);
    } catch (error) {
      const failure = asError(error, "COMPILER_OUTPUT_VALIDATION_FAILED");
      compilerOutput = makeCompilerFallbackResult(text, failure.code, failure.message);
      compilerValidation = validateEngineCompilerOutput(compilerOutput, text);
    }
    if (!compilerValidation.valid) {
      compilerOutput = makeCompilerFallbackResult(
        text, "COMPILER_OUTPUT_VALIDATION_FAILED",
        "Compiler output validation विफल हुई; केवल मूल पाठ Native TTS को दिया जाएगा।"
      );
      compilerValidation = validateEngineCompilerOutput(compilerOutput, text);
    }

    const speechText = compilerValidation.valid ? compilerOutput.speechText : text;
    const appliedRules = compilerValidation.valid && Array.isArray(compilerOutput.appliedRules)
      ? compilerOutput.appliedRules : Object.freeze([]);
    const matchedLexiconEntries = compilerValidation.valid && Array.isArray(compilerOutput.matchedLexiconEntries)
      ? compilerOutput.matchedLexiconEntries : Object.freeze([]);
    const fallbackRules = compilerValidation.valid && Array.isArray(compilerOutput.warnings)
      ? compilerOutput.warnings : Object.freeze([]);
    const knowledgeAppliedToSpeech = compilerValidation.valid &&
      speechText !== text && appliedRules.length > 0;

    let adapterDiagnostics = null;
    try {
      if (knowledgeAdapter && typeof knowledgeAdapter.getDiagnostics === "function") {
        adapterDiagnostics = knowledgeAdapter.getDiagnostics();
      }
    } catch (_) {}
    const selectedVoice = prepOptions.voice || prepOptions.selectedVoice || null;
    const voiceProfileDiagnostics = selectedVoice ? Object.freeze({
      name: typeof selectedVoice.name === "string" ? selectedVoice.name : null,
      voiceURI: typeof selectedVoice.voiceURI === "string" ? selectedVoice.voiceURI : null,
      locale: typeof selectedVoice.lang === "string" ? selectedVoice.lang : null,
      localService: selectedVoice.localService === true
    }) : null;
    const speechPreparationDiagnostics = Object.freeze({
      improvementId: SWR_TTS_ENGINE_IMPROVEMENT_ID,
      analyzerAvailable: Boolean(baseline.analysis),
      analyzerError: baselineError ? Object.freeze({ code: baselineError.code, message: baselineError.message }) : null,
      knowledgeAdapterAvailable: Boolean(knowledgeAdapter),
      knowledgeLoaded: Boolean(adapterDiagnostics && adapterDiagnostics.loaded),
      knowledgeGuidanceMatchCount: knowledgeGuidance.matches.length,
      pendingGuidanceReviewCount: knowledgeGuidance.pendingReviewCount || 0,
      pronunciationLexiconRegistered: Boolean(adapterDiagnostics && adapterDiagnostics.lexiconRegistered),
      pronunciationLexiconReadyCount: Number(adapterDiagnostics && adapterDiagnostics.activePronunciationEntries) || 0,
      compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
      compilerOutputValidated: compilerValidation.valid,
      compilerConfidence: compilerOutput.confidence,
      compilerWarningCount: fallbackRules.length,
      matchedLexiconEntryCount: matchedLexiconEntries.length,
      appliedRuleCount: appliedRules.length,
      knowledgeAppliedToSpeech,
      originalTextRetained: compilerOutput.originalText === text,
      speechTextModified: speechText !== text,
      selectedVoiceProfile: voiceProfileDiagnostics
    });

    return Object.freeze({
      ...baseline,
      originalText: text,
      speechText,
      modified: speechText !== text,
      safeToTransform: knowledgeAppliedToSpeech,
      knowledgeGuidance,
      knowledgeAppliedToSpeech,
      matchedLexiconEntries,
      appliedRules,
      fallbackRules,
      pronunciationConfidence: compilerOutput.confidence,
      compilerOutput,
      compilerValidation,
      speechPreparationDiagnostics
    });
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
    let coverage, selfTest, compilerSelfTest;
    try {
      coverage = getVedicKnowledgeBaseCoverage();
      selfTest = runVedicPronunciationSelfTest();
      compilerSelfTest = runSanskritCompilerSelfTest();
    } catch (error) {
      throw asError(error, "PRONUNCIATION_KNOWLEDGE_BASE_FAILED");
    }
    return Object.freeze({
      available: true,
      version: VEDIC_PRONUNCIATION_VERSION,
      compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
      improvementId: SWR_TTS_ENGINE_IMPROVEMENT_ID,
      integrationMode: "review-gated native speech compiler; original text retained separately; validated output only",
      coverage,
      selfTest: Object.freeze({ status: selfTest.status, total: selfTest.total, passed: selfTest.passed, failed: selfTest.failed }),
      compilerSelfTest: Object.freeze({
        status: compilerSelfTest.status, total: compilerSelfTest.total,
        passed: compilerSelfTest.passed, failed: compilerSelfTest.failed
      })
    });
  }

  function getSpeechCompilerDiagnostics(compiledSpeech = null) {
    ensureNotDisposed();
    try { return getSanskritCompilerDiagnostics(compiledSpeech); }
    catch (error) { throw asError(error, "COMPILER_DIAGNOSTICS_FAILED"); }
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
          code: cleanupError.code, message: cleanupError.message, backendId
        }));
        if (ownsKnowledgeAdapter && knowledgeAdapter && typeof knowledgeAdapter.dispose === "function") {
          try { knowledgeAdapter.dispose(); }
          catch (error) { emit("warning", { code: "KNOWLEDGE_ADAPTER_DISPOSE_FAILED", message: asError(error).message }); }
        }
        if (ownsKnowledgeAPI && knowledgeAPI && typeof knowledgeAPI.dispose === "function") {
          try { await knowledgeAPI.dispose(); }
          catch (error) { emit("warning", { code: "KNOWLEDGE_API_DISPOSE_FAILED", message: asError(error).message }); }
        }
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
    improvementId: SWR_TTS_ENGINE_IMPROVEMENT_ID,
    initialize,
    getCapabilities,
    getStatus,
    getSupportedLanguages,
    getLanguage,
    setLanguage,
    analyzeText,
    prepareSpeech,
    loadKnowledge,
    getKnowledgeGuidance,
    getKnowledgeDiagnostics,
    findPronunciation,
    getTextPronunciationDiagnostics,
    getPronunciationKnowledgeBaseInfo,
    getSpeechCompilerDiagnostics,
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

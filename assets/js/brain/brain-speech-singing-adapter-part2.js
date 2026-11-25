/* Swar-Sadhika Nano Brain — Speech/Singing Adapter Part 2.
 * Bridges the existing Sanskrit TTS/G2P and vocal melody planner to a strictly
 * local neural singing provider that streams mono Float32 PCM chunks.
 *
 * This adapter does not fabricate speech, clone a reference voice, or fall back
 * to Web Speech/oscillator output. A provider must prove its local model,
 * Sanskrit + melody capability, pretrained feminine voice inventory and PCM
 * contract before it can be initialized or used.
 */

export const BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2 = "1.0.0";
export const BRAIN_SPEECH_SINGING_ADAPTER_ID_PART2 = "brain-speech-singing";

const EVENT_NAMES = new Set([
  "statechange", "progress", "speechstart", "audiochunk", "speechend", "speechcancel", "warning", "error"
]);
const DEFAULT_MELODY = Object.freeze([0, 2, 4, 5, 7, 5, 4, 2]);
const MAX_TEXT_CODE_POINTS = 20000;
const MAX_OUTPUT_SECONDS = 600;
const MAX_PCM_CHUNK_SECONDS = 12;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/i;

export class BrainSpeechSingingErrorPart2 extends Error {
  constructor(message, code = "BRAIN_SPEECH_SINGING_ERROR", details = null, cause = null) {
    super(message);
    this.name = "BrainSpeechSingingErrorPart2";
    this.code = code;
    if (details) this.details = details;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, details = null, cause = null) {
  throw new BrainSpeechSingingErrorPart2(message, code, details, cause);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function safeText(value, label, maximum = MAX_TEXT_CODE_POINTS) {
  if (typeof value !== "string" || !value.trim()) fail(label + " आवश्यक है।", "TEXT_REQUIRED");
  if (Array.from(value).length > maximum) fail(label + " निर्धारित आकार-सीमा से बड़ा है।", "TEXT_TOO_LONG");
  return value.normalize("NFC");
}

function checkAbort(signal) {
  if (signal && signal.aborted) fail("गायन कार्य रद्द कर दिया गया।", "TASK_ABORTED");
}

function freezeRecord(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(key => freezeRecord(value[key]));
  return Object.freeze(value);
}

function normalizeModelManifest(backend) {
  if (!backend || typeof backend !== "object") fail("स्थानीय Singing Backend उपलब्ध नहीं है।", "SINGING_BACKEND_NOT_CONFIGURED");
  if (typeof backend.id !== "string" || !ID_PATTERN.test(backend.id)) fail("Singing Backend ID अमान्य है।", "INVALID_BACKEND_ID");
  if (backend.kind !== "local-neural-singing" || backend.executionMode !== "local" || backend.inferenceRequiresNetwork !== false) {
    fail("केवल local-neural-singing और network-free inference वाला Backend स्वीकार्य है।", "NON_LOCAL_BACKEND_REJECTED");
  }
  const requiredMethods = ["probe", "initialize", "getVoices", "synthesize", "pause", "resume", "cancel", "dispose"];
  const missing = requiredMethods.filter(name => typeof backend[name] !== "function");
  if (missing.length) fail("Singing Backend contract अधूरा है: " + missing.join(", "), "BACKEND_CONTRACT_INCOMPLETE", { missing });
  const model = backend.model;
  if (!isPlainObject(model) || !String(model.id || "").trim() || !String(model.version || "").trim() ||
      !String(model.license || "").trim() || !/^https:\/\//i.test(String(model.source || "")) ||
      !SHA256_PATTERN.test(String(model.manifestSha256 || ""))) {
    fail("Model manifest में ID, version, licence, HTTPS provenance source और manifest SHA-256 अनिवार्य हैं।", "MODEL_PROVENANCE_INCOMPLETE");
  }
  if (!isPlainObject(backend.capabilities) || backend.capabilities.sanskrit !== true ||
      backend.capabilities.melody !== true || backend.capabilities.streamingPcm !== true) {
    fail("Backend को Sanskrit, melody और streaming PCM क्षमताएँ स्पष्ट रूप से घोषित करनी होंगी।", "SINGING_CAPABILITY_MISSING");
  }
  if (backend.capabilities.remoteInference === true) fail("Remote inference स्वीकार्य नहीं है।", "REMOTE_INFERENCE_REJECTED");
  return Object.freeze({
    id: backend.id,
    kind: backend.kind,
    executionMode: backend.executionMode,
    inferenceRequiresNetwork: false,
    model: Object.freeze({
      id: String(model.id),
      version: String(model.version),
      license: String(model.license),
      manifestSha256: String(model.manifestSha256).toLowerCase(),
      source: typeof model.source === "string" ? model.source : null
    }),
    capabilities: Object.freeze({
      sanskrit: true,
      melody: true,
      streamingPcm: true,
      remoteInference: false,
      vedicAccents: backend.capabilities.vedicAccents === true
    })
  });
}

function validateVoiceList(voices) {
  if (!Array.isArray(voices)) fail("Backend ने आवाज़ों की सूची Array के रूप में नहीं दी।", "INVALID_VOICE_LIST");
  const seen = new Set();
  return voices.map(voice => {
    if (!isPlainObject(voice) || typeof voice.id !== "string" || !ID_PATTERN.test(voice.id) ||
        typeof voice.label !== "string" || !voice.label.trim()) {
      fail("Backend voice descriptor अमान्य है।", "INVALID_VOICE_DESCRIPTOR");
    }
    if (seen.has(voice.id)) fail("Voice ID दोहराया गया है: " + voice.id, "DUPLICATE_VOICE_ID");
    seen.add(voice.id);
    if (voice.presentation !== "feminine" || voice.voiceMode !== "pretrained-synthetic") {
      fail("इस परियोजना के लिए पूर्व-प्रशिक्षित, अलग feminine synthetic voice आवश्यक है।", "VOICE_PROFILE_NOT_ALLOWED", { voiceId: voice.id });
    }
    return Object.freeze({
      id: voice.id,
      label: voice.label.trim(),
      presentation: "feminine",
      voiceMode: "pretrained-synthetic",
      language: Array.isArray(voice.languages) ? voice.languages.filter(item => typeof item === "string") : []
    });
  });
}

function buildSingingRequest(text, ttsEngine, planner, options = {}) {
  const originalText = safeText(text, "संस्कृत पाठ");
  const shakha = typeof options.shakha === "string" && options.shakha.trim() ? options.shakha.trim() : undefined;
  const patha = typeof options.patha === "string" && options.patha.trim() ? options.patha.trim() : undefined;
  const context = isPlainObject(options.context) ? options.context : {};
  const prepared = ttsEngine.prepareSpeech(originalText, {
    backendType: "neural",
    ...(shakha ? { shakha } : {}),
    ...(patha ? { patha } : {}),
    context
  });
  const g2p = prepared && prepared.g2pAnalysis;
  if (!g2p || g2p.schema !== "swar-sadhika.sanskrit-g2p" || g2p.originalText !== originalText) {
    fail("TTS Engine से सत्यापित Sanskrit G2P परिणाम प्राप्त नहीं हुआ।", "G2P_RESULT_INVALID");
  }
  if (g2p.status === "partial" || g2p.hasUnsupportedGraphemes) {
    fail("पाठ में ऐसे वर्ण हैं जिनका G2P मान उपलब्ध नहीं है; अनुमान से गायन नहीं बनाया जाएगा।", "G2P_UNSUPPORTED_GRAPHEMES", {
      warnings: g2p.warnings || []
    });
  }
  if (g2p.status === "needs-context" || g2p.requiresContext) {
    fail("इस पाठ के वैदिक/शाखा-सापेक्ष उच्चारण के लिए स्पष्ट संदर्भ आवश्यक है।", "G2P_CONTEXT_REQUIRED", {
      warnings: g2p.warnings || []
    });
  }
  if (g2p.status === "context-sensitive" && options.allowContextSensitive !== true) {
    fail("पाठ में संदर्भ-संवेदी ध्वनि है। सत्यापित संदर्भ देने या allowContextSensitive की स्पष्ट स्वीकृति के बिना गायन रोका गया है।", "G2P_CONTEXT_SENSITIVE", {
      warnings: g2p.warnings || []
    });
  }

  const baseFrequency = finiteNumber(options.baseFrequency, 246.94, 170, 390);
  const tempo = finiteNumber(options.tempo, 1, 0.55, 1.7);
  const noteDurationMs = finiteNumber(options.noteDurationMs, 390, 180, 900);
  const melody = Array.isArray(options.melody) && options.melody.length
    ? options.melody.map(value => finiteNumber(value, 0, -12, 12))
    : DEFAULT_MELODY;
  if (melody.length > 256) fail("Melody में अधिकतम 256 note offsets स्वीकार्य हैं।", "MELODY_TOO_LONG");

  const plan = planner.prepareText(originalText, { baseFrequency, tempo, noteDurationMs, melody });
  const spokenUnits = (g2p.orthographicUnits || []).filter(unit =>
    unit && !["separator", "punctuation"].includes(unit.kind) && String(unit.text || "").trim()
  );
  const syllables = plan.events.filter(event => event && event.type === "syllable");
  if (spokenUnits.length !== syllables.length) {
    fail("G2P अक्षर-खंड और गायन Planner के syllable खंडों का मेल नहीं हुआ; गलत सुर-संरेखण से बचने के लिए कार्य रोका गया।", "SYLLABLE_ALIGNMENT_MISMATCH", {
      g2pUnitCount: spokenUnits.length,
      plannerSyllableCount: syllables.length
    });
  }

  let unitCursor = 0;
  const timeline = plan.events.map(event => {
    if (event.type === "pause") return Object.freeze({
      type: "pause",
      durationSeconds: finiteNumber(event.duration, 0.2, 0, 3),
      reason: String(event.reason || "phrase")
    });
    const unit = spokenUnits[unitCursor++];
    if (!unit || unit.text !== event.source) {
      fail("G2P और melody Planner के अक्षर-स्रोत में असंगति मिली।", "SYLLABLE_SOURCE_MISMATCH", {
        plannerSource: event.source || null,
        g2pSource: unit && unit.text ? unit.text : null
      });
    }
    const tokens = g2p.phonemeSequence.filter(token => token && token.orthographicUnitIndex === unit.index);
    if (!tokens.length) fail("अक्षर के लिए phoneme sequence अनुपस्थित है।", "PHONEME_SEQUENCE_EMPTY", { unit: unit.text });
    return Object.freeze({
      type: "syllable",
      index: unitCursor - 1,
      orthographicUnitIndex: unit.index,
      grapheme: unit.text,
      transliteration: unit.transliteration,
      phonemes: Object.freeze(tokens.map(token => Object.freeze({
        symbol: token.symbol,
        type: token.type,
        grapheme: token.grapheme,
        features: token.features
      }))),
      vowelNucleus: (g2p.vowelNuclei || []).find(item => item.orthographicUnitIndex === unit.index) || null,
      frequencyHz: finiteNumber(event.frequency, baseFrequency, 60, 1200),
      durationSeconds: finiteNumber(event.duration, noteDurationMs / 1000 / tempo, 0.08, 4),
      sourceSpan: Object.freeze({ start: unit.startCodePointIndex, end: unit.endCodePointIndex })
    });
  });

  return Object.freeze({
    schema: "swar-sadhika.singing-request",
    schemaVersion: 1,
    text: originalText,
    language: "sa-IN",
    phonemicTransliteration: g2p.phonemicTransliteration,
    phonemeSequence: g2p.phonemeSequence,
    timeline: Object.freeze(timeline),
    syllableCount: syllables.length,
    totalPlannedDurationSeconds: finiteNumber(plan.totalDuration, 0, 0, MAX_OUTPUT_SECONDS),
    baseFrequency,
    tempo,
    modelInput: Object.freeze({
      task: "text-to-singing",
      executionMode: "local",
      voiceMode: "pretrained-synthetic",
      accompaniment: false,
      output: Object.freeze({ format: "pcm-f32", channels: 1, sampleRate: 24000, streaming: true })
    }),
    pronunciation: Object.freeze({
      g2pVersion: g2p.engineVersion,
      status: g2p.status,
      warnings: Object.freeze((g2p.warnings || []).map(item => Object.freeze({
        code: item.code,
        severity: item.severity,
        message: item.message
      }))),
      originalTextPreserved: g2p.originalTextPreserved === true
    })
  });
}

function createPcmPlayer(host) {
  const Context = host && (host.AudioContext || host.webkitAudioContext);
  let context = null;
  let gain = null;
  let nextStartTime = 0;
  let sequence = 0;
  let disposed = false;
  const sources = new Map();
  const drainWaiters = new Set();
  let totalSamples = 0;

  function ensureContext() {
    if (disposed) fail("PCM Player बंद हो चुका है।", "PCM_PLAYER_DISPOSED");
    if (!Context) fail("इस Browser में Web Audio API उपलब्ध नहीं है।", "WEB_AUDIO_UNAVAILABLE");
    if (!context) {
      context = new Context({ latencyHint: "interactive" });
      gain = context.createGain();
      gain.gain.value = 0.9;
      gain.connect(context.destination);
    }
    return context;
  }

  function notifyDrained() {
    if (sources.size) return;
    for (const resolve of drainWaiters) resolve(true);
    drainWaiters.clear();
  }

  async function resume() {
    const audio = ensureContext();
    if (audio.state === "suspended") await audio.resume();
    if (audio.state !== "running") fail("ऑडियो आउटपुट शुरू नहीं हुआ। गायन बटन दबाकर पुनः प्रयास करें।", "AUDIO_CONTEXT_NOT_RUNNING");
    return Object.freeze({ sampleRate: audio.sampleRate, state: audio.state });
  }

  function push(pcm, metadata = {}) {
    const audio = ensureContext();
    if (!(pcm instanceof Float32Array) || pcm.length === 0) fail("Backend PCM chunk को non-empty Float32Array होना चाहिए।", "INVALID_PCM_CHUNK");
    const sampleRate = Number(metadata.sampleRate);
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
      fail("प्रत्येक PCM chunk के लिए 8–96 kHz sampleRate आवश्यक है।", "INVALID_PCM_SAMPLE_RATE");
    }
    if (metadata.channels !== undefined && metadata.channels !== 1) fail("केवल mono PCM स्वीकार्य है।", "INVALID_PCM_CHANNEL_COUNT");
    if (pcm.length / sampleRate > MAX_PCM_CHUNK_SECONDS) fail("PCM chunk अनुमत अवधि से बड़ा है।", "PCM_CHUNK_TOO_LARGE");
    for (let index = 0; index < pcm.length; index += 1) {
      if (!Number.isFinite(pcm[index])) fail("PCM chunk में NaN या Infinity मिला।", "PCM_NON_FINITE_SAMPLE");
    }
    const buffer = audio.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel ? buffer.copyToChannel(pcm, 0) : buffer.getChannelData(0).set(pcm);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const now = audio.currentTime;
    const startAt = Math.max(now + 0.035, nextStartTime);
    const token = ++sequence;
    sources.set(token, source);
    source.onended = () => {
      sources.delete(token);
      try { source.disconnect(); } catch (_) {}
      notifyDrained();
    };
    source.start(startAt);
    nextStartTime = startAt + pcm.length / sampleRate;
    totalSamples += pcm.length / sampleRate;
    return Object.freeze({ sequence: token, durationSeconds: pcm.length / sampleRate, scheduledAt: startAt });
  }

  function drain() {
    if (!sources.size) return Promise.resolve(true);
    return new Promise(resolve => drainWaiters.add(resolve));
  }

  async function pause() {
    if (!context || context.state !== "running") return false;
    await context.suspend();
    return context.state === "suspended";
  }

  async function stop() {
    for (const [token, source] of sources) {
      sources.delete(token);
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    nextStartTime = context ? context.currentTime : 0;
    notifyDrained();
    return true;
  }

  function resetMeter() {
    if (sources.size) fail("चलते PCM playback का meter reset नहीं किया जा सकता।", "PCM_PLAYER_BUSY");
    totalSamples = 0;
    nextStartTime = context ? context.currentTime : 0;
    return true;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await stop();
    if (context && context.state !== "closed") {
      try { await context.close(); } catch (_) {}
    }
    context = null;
    gain = null;
  }

  return Object.freeze({ resume, push, drain, pause, stop, resetMeter, dispose, getStatus: () => Object.freeze({
    created: Boolean(context),
    state: context ? context.state : "not-created",
    queuedSources: sources.size,
    scheduledDurationSeconds: totalSamples,
    sampleRate: context ? context.sampleRate : null
  }) });
}

export function createBrainSpeechSingingAdapterPart2(options = {}) {
  if (!isPlainObject(options)) fail("Adapter options एक साधारण Object होना चाहिए।", "INVALID_ADAPTER_OPTIONS");
  const host = options.target || globalThis;
  const ttsEngine = options.ttsEngine;
  const planner = options.planner;
  if (!ttsEngine || typeof ttsEngine.prepareSpeech !== "function" || typeof ttsEngine.analyzeG2P !== "function") {
    fail("मौजूदा TTS Engine का prepareSpeech/analyzeG2P contract उपलब्ध नहीं है।", "TTS_ENGINE_CONTRACT_INVALID");
  }
  if (!planner || typeof planner.prepareText !== "function") {
    fail("मौजूदा Vocal Singing Engine का prepareText Planner contract उपलब्ध नहीं है।", "SINGING_PLANNER_CONTRACT_INVALID");
  }
  const player = createPcmPlayer(host);
  const listeners = new Map();
  let backend = options.singingBackend || null;
  let manifest = null;
  let voices = Object.freeze([]);
  let state = backend ? "configured" : "unconfigured";
  let initializePromise = null;
  let active = null;
  let disposed = false;
  let lastError = null;
  let lastResult = null;
  let registeredCore = null;

  function ensureUsable() {
    if (disposed) fail("Speech/Singing Adapter बंद हो चुका है।", "ADAPTER_DISPOSED");
  }

  function emit(type, detail = {}) {
    const callbacks = listeners.get(type);
    if (!callbacks) return;
    const event = Object.freeze({ type, state, adapterVersion: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2, ...detail });
    callbacks.forEach(callback => { try { callback(event); } catch (_) {} });
  }

  function setState(next, detail = {}) {
    state = next;
    emit("statechange", detail);
  }

  function on(type, callback) {
    ensureUsable();
    if (!EVENT_NAMES.has(type) || typeof callback !== "function") fail("Event subscription अमान्य है।", "INVALID_EVENT_SUBSCRIPTION");
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => {
      const group = listeners.get(type);
      if (group) {
        group.delete(callback);
        if (!group.size) listeners.delete(type);
      }
    };
  }

  function configureBackend(nextBackend) {
    ensureUsable();
    if (active || initializePromise || state === "ready") fail("चलते या initialized Adapter का Backend नहीं बदला जा सकता।", "BACKEND_CHANGE_LOCKED");
    manifest = normalizeModelManifest(nextBackend);
    backend = nextBackend;
    voices = Object.freeze([]);
    lastError = null;
    setState("configured", { backendId: manifest.id, modelId: manifest.model.id });
    return manifest;
  }

  async function initialize(initOptions = {}) {
    ensureUsable();
    if (!backend) return getStatus();
    if (state === "ready") return getStatus();
    if (initializePromise) return initializePromise;
    manifest = manifest || normalizeModelManifest(backend);
    initializePromise = (async () => {
      setState("initializing", { modelId: manifest.model.id });
      lastError = null;
      try {
        const probe = await backend.probe({ target: host, executionMode: "local" });
        if (!probe || probe.supported !== true || probe.executionMode !== "local" || probe.inferenceRequiresNetwork !== false) {
          fail((probe && probe.reason) || "स्थानीय Singing Model इस Browser पर उपलब्ध नहीं है।", "SINGING_BACKEND_UNSUPPORTED", probe || null);
        }
        checkAbort(initOptions.signal);
        await backend.initialize({
          target: host,
          executionMode: "local",
          signal: initOptions.signal,
          onProgress: detail => emit("progress", detail || {})
        });
        checkAbort(initOptions.signal);
        voices = Object.freeze(validateVoiceList(await backend.getVoices()));
        if (!voices.length) fail("स्थानीय Backend में कोई पूर्व-प्रशिक्षित feminine voice उपलब्ध नहीं है।", "FEMININE_VOICE_UNAVAILABLE");
        if (!voices.some(voice => voice.language.some(language => ["sa", "sa-IN", "hi", "hi-IN"].includes(language)))) {
          fail("Backend की किसी feminine voice ने संस्कृत/हिंदी भाषा-संगतता घोषित नहीं की।", "VOICE_LANGUAGE_UNSUPPORTED");
        }
        setState("ready", { backendId: manifest.id, modelId: manifest.model.id, voiceCount: voices.length });
        return getStatus();
      } catch (error) {
        lastError = Object.freeze({ code: error && error.code || "SINGING_BACKEND_INITIALIZATION_FAILED", message: error && error.message || String(error) });
        setState("error", { error: lastError });
        throw error instanceof BrainSpeechSingingErrorPart2 ? error : new BrainSpeechSingingErrorPart2(
          "स्थानीय Singing Backend प्रारंभ नहीं हो सका।", lastError.code, null, error
        );
      } finally {
        initializePromise = null;
      }
    })();
    return initializePromise;
  }

  function prepare(text, prepareOptions = {}) {
    ensureUsable();
    return buildSingingRequest(text, ttsEngine, planner, prepareOptions);
  }

  async function sing(text, singOptions = {}) {
    ensureUsable();
    if (active) fail("एक गायन पहले से चल रहा है।", "SINGING_BUSY");
    if (!backend) fail("अभी कोई सत्यापित स्थानीय Neural Singing Backend स्थापित नहीं है।", "SINGING_BACKEND_NOT_CONFIGURED");
    const request = prepare(text, singOptions);
    const externalSignal = singOptions.signal || null;
    checkAbort(externalSignal);

    // Unlock the output immediately from the user's click/tap, before inference begins.
    await player.resume();
    if (state !== "ready") await initialize({ signal: externalSignal });
    checkAbort(externalSignal);

    const voiceId = String(singOptions.voiceId || voices[0].id);
    const selectedVoice = voices.find(voice => voice.id === voiceId);
    if (!selectedVoice) fail("चुनी गई feminine voice Backend की सत्यापित सूची में नहीं है।", "VOICE_NOT_FOUND", { voiceId });
    const AbortControllerCtor = host && typeof host.AbortController === "function"
      ? host.AbortController : (typeof AbortController === "function" ? AbortController : null);
    if (!AbortControllerCtor) fail("इस Browser में AbortController उपलब्ध नहीं है।", "ABORT_CONTROLLER_UNAVAILABLE");
    const controller = new AbortControllerCtor();
    const externalAbort = () => { try { controller.abort(externalSignal.reason || "external-abort"); } catch (_) { controller.abort(); } };
    if (externalSignal) externalSignal.addEventListener("abort", externalAbort, { once: true });
    const run = { controller, chunkCount: 0, audioSeconds: 0, voiceId, finished: false };
    active = run;
    totalSamplesReset();
    setState("singing", { voiceId, syllableCount: request.syllableCount });
    emit("speechstart", { voiceId, textLength: Array.from(request.text).length, modelId: manifest.model.id });

    try {
      const backendResult = await backend.synthesize(request, {
        signal: controller.signal,
        voice: selectedVoice,
        onChunk: (pcm, metadata = {}) => {
          checkAbort(controller.signal);
          if (active !== run) fail("यह Audio Chunk अब सक्रिय गायन का हिस्सा नहीं है।", "STALE_AUDIO_CHUNK");
          const chunk = player.push(pcm, metadata);
          run.chunkCount += 1;
          run.audioSeconds += chunk.durationSeconds;
          if (run.audioSeconds > MAX_OUTPUT_SECONDS) fail("गायन ऑडियो अधिकतम अवधि सीमा से बड़ा है।", "PCM_OUTPUT_TOO_LONG");
          emit("audiochunk", { sequence: chunk.sequence, durationSeconds: chunk.durationSeconds, chunkCount: run.chunkCount });
        }
      });
      checkAbort(controller.signal);
      if (!backendResult || backendResult.status !== "completed") {
        fail("Singing Backend ने पूर्ण PCM generation की पुष्टि नहीं की।", "SINGING_BACKEND_INCOMPLETE", backendResult || null);
      }
      if (!run.chunkCount) fail("Backend ने कोई PCM audio chunk नहीं दिया।", "SINGING_BACKEND_NO_AUDIO");
      await player.drain();
      const result = Object.freeze({
        status: "completed",
        adapterVersion: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2,
        backendId: manifest.id,
        modelId: manifest.model.id,
        modelVersion: manifest.model.version,
        voiceId,
        voiceMode: "pretrained-synthetic",
        audioMode: "mono-pcm-stream",
        audioChunkCount: run.chunkCount,
        audioDurationSeconds: Number(run.audioSeconds.toFixed(3)),
        plannedDurationSeconds: Number(request.totalPlannedDurationSeconds.toFixed(3)),
        localOnly: true,
        accompaniment: false
      });
      lastResult = result;
      setState("ready", { result });
      emit("speechend", { result });
      return result;
    } catch (error) {
      await player.stop();
      if (controller.signal.aborted) {
        setState("ready", { cancelled: true });
        emit("speechcancel", { voiceId });
        throw new BrainSpeechSingingErrorPart2("गायन रद्द कर दिया गया।", "TASK_ABORTED", null, error);
      }
      lastError = Object.freeze({ code: error && error.code || "SINGING_FAILED", message: error && error.message || String(error) });
      setState("error", { error: lastError });
      emit("error", { error: lastError });
      throw error instanceof BrainSpeechSingingErrorPart2 ? error : new BrainSpeechSingingErrorPart2(
        "स्थानीय Neural Singing विफल हुआ।", lastError.code, null, error
      );
    } finally {
      run.finished = true;
      if (active === run) active = null;
      if (externalSignal) externalSignal.removeEventListener("abort", externalAbort);
    }
  }

  function totalSamplesReset() {
    return player.resetMeter();
  }

  async function pause() {
    ensureUsable();
    if (!active) return false;
    const [providerPaused, audioPaused] = await Promise.all([backend.pause(), player.pause()]);
    return providerPaused !== false && audioPaused !== false;
  }

  async function resume() {
    ensureUsable();
    if (!active) return false;
    const audio = await player.resume();
    const providerResumed = await backend.resume();
    return Boolean(audio && providerResumed !== false);
  }

  async function stop(reason = "user") {
    ensureUsable();
    const run = active;
    if (!run) return false;
    try { run.controller.abort(String(reason).slice(0, 120)); } catch (_) { run.controller.abort(); }
    await Promise.allSettled([backend.cancel(), player.stop()]);
    return true;
  }

  function createCoreSkillDescriptor() {
    ensureUsable();
    return Object.freeze({
      id: BRAIN_SPEECH_SINGING_ADAPTER_ID_PART2,
      title: "स्थानीय संस्कृत स्त्री-स्वर गायन",
      version: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2,
      risk: "medium",
      capabilities: Object.freeze(["tts.speak"]),
      enabled: true,
      execute: async taskContext => {
        if (!taskContext || !isPlainObject(taskContext.input)) fail("Core Skill input अमान्य है।", "INVALID_SKILL_INPUT");
        const input = taskContext.input;
        return sing(input.text, {
          voiceId: input.voiceId,
          melody: input.melody,
          baseFrequency: input.baseFrequency,
          tempo: input.tempo,
          noteDurationMs: input.noteDurationMs,
          shakha: input.shakha,
          patha: input.patha,
          allowContextSensitive: input.allowContextSensitive === true,
          signal: taskContext.signal
        });
      }
    });
  }

  function registerWithCore(core) {
    ensureUsable();
    if (!core || typeof core.registerModule !== "function") fail("वास्तविक Brain Core आवश्यक है।", "BRAIN_CORE_REQUIRED");
    if (!backend) fail("Core Skill पंजीकृत करने से पहले वास्तविक स्थानीय Singing Backend configure करें।", "SINGING_BACKEND_NOT_CONFIGURED");
    if (registeredCore) fail("यह Adapter पहले से Brain Core में पंजीकृत है।", "CORE_REGISTRATION_DUPLICATE");
    const descriptor = createCoreSkillDescriptor();
    const result = core.registerModule(descriptor);
    registeredCore = core;
    return result;
  }

  function getStatus() {
    return Object.freeze({
      version: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2,
      id: BRAIN_SPEECH_SINGING_ADAPTER_ID_PART2,
      state,
      configured: Boolean(backend),
      ready: state === "ready",
      active: Boolean(active),
      localOnly: true,
      backendId: manifest ? manifest.id : null,
      modelId: manifest ? manifest.model.id : null,
      voiceCount: voices.length,
      pcmPlayer: player.getStatus(),
      ttsEngineVersion: ttsEngine.version || null,
      singingAvailable: Boolean(backend && state === "ready"),
      lastError,
      lastResult
    });
  }

  async function dispose() {
    if (disposed) return;
    if (active) await stop("adapter-disposed");
    disposed = true;
    await player.dispose();
    if (options.disposeBackendOnDispose === true && backend) await backend.dispose();
    if (options.disposeTtsEngineOnDispose === true && typeof ttsEngine.dispose === "function") await ttsEngine.dispose();
    if (options.disposePlannerOnDispose === true && typeof planner.dispose === "function") await planner.dispose();
    listeners.clear();
    state = "disposed";
  }

  return Object.freeze({
    version: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2,
    id: BRAIN_SPEECH_SINGING_ADAPTER_ID_PART2,
    configureBackend,
    initialize,
    prepare,
    sing,
    pause,
    resume,
    stop,
    on,
    getVoices: () => voices,
    getStatus,
    createCoreSkillDescriptor,
    registerWithCore,
    dispose
  });
}

export async function selfTest() {
  const checks = [];
  const add = (name, passed, details = null) => checks.push(Object.freeze({ name, passed: Boolean(passed), ...(details ? { details } : {}) }));
  const text = "नमः शिवाय।";
  const units = [
    { index: 0, kind: "akshara", text: "न", transliteration: "na", startCodePointIndex: 0, endCodePointIndex: 1 },
    { index: 1, kind: "akshara", text: "मः", transliteration: "maḥ", startCodePointIndex: 1, endCodePointIndex: 3 },
    { index: 2, kind: "separator", text: " ", transliteration: " ", startCodePointIndex: 3, endCodePointIndex: 4 },
    { index: 3, kind: "akshara", text: "शि", transliteration: "śi", startCodePointIndex: 4, endCodePointIndex: 6 },
    { index: 4, kind: "akshara", text: "वा", transliteration: "vā", startCodePointIndex: 6, endCodePointIndex: 8 },
    { index: 5, kind: "akshara", text: "य", transliteration: "ya", startCodePointIndex: 8, endCodePointIndex: 9 },
    { index: 6, kind: "punctuation", text: "।", transliteration: "।", startCodePointIndex: 9, endCodePointIndex: 10 }
  ];
  const phonemeSequence = [];
  units.filter(unit => unit.kind === "akshara").forEach(unit => {
    phonemeSequence.push(
      { orthographicUnitIndex: unit.index, symbol: unit.transliteration, type: "phoneme", grapheme: unit.text, features: {} },
      { orthographicUnitIndex: unit.index, symbol: "a", type: "vowel", grapheme: "अ", features: {} }
    );
  });
  const g2p = {
    schema: "swar-sadhika.sanskrit-g2p",
    originalText: text,
    originalTextPreserved: true,
    status: "complete",
    phonemicTransliteration: "namaḥśivāya",
    phonemeSequence,
    vowelNuclei: [],
    orthographicUnits: units,
    warnings: [],
    engineVersion: "self-test"
  };
  const ttsEngine = {
    version: "self-test-tts",
    prepareSpeech: () => ({ originalText: text, speechText: text, g2pAnalysis: g2p }),
    analyzeG2P: () => g2p,
    dispose: async () => true
  };
  const planner = {
    prepareText: () => Object.freeze({
      syllableCount: 5,
      totalDuration: 1.95,
      events: Object.freeze([
        { type: "syllable", source: "न", frequency: 246.94, duration: 0.39 },
        { type: "syllable", source: "मः", frequency: 277.18, duration: 0.39 },
        { type: "pause", duration: 0.13, reason: "word" },
        { type: "syllable", source: "शि", frequency: 293.66, duration: 0.39 },
        { type: "syllable", source: "वा", frequency: 311.13, duration: 0.39 },
        { type: "syllable", source: "य", frequency: 349.23, duration: 0.39 },
        { type: "pause", duration: 0.55, reason: "sentence" }
      ])
    }),
    dispose: async () => true
  };
  let adapter = null;
  try {
    adapter = createBrainSpeechSingingAdapterPart2({ target: {}, ttsEngine, planner });
    const prepared = adapter.prepare(text);
    add("existing-tts-g2p-is-used", prepared.pronunciation.originalTextPreserved && prepared.phonemeSequence.length > 0);
    add("existing-vocal-engine-melody-plan-is-used", prepared.timeline.some(item => item.type === "syllable" && item.frequencyHz > 0));
    add("no-backend-is-reported-as-unconfigured", adapter.getStatus().state === "unconfigured" && adapter.getStatus().singingAvailable === false);
    let remoteRejected = false;
    try {
      adapter.configureBackend({
        id: "remote-test", kind: "local-neural-singing", executionMode: "remote", inferenceRequiresNetwork: true,
        model: { id: "test", version: "1.0.0", license: "test", source: "https://example.org/model", manifestSha256: "0".repeat(64) },
        capabilities: { sanskrit: true, melody: true, streamingPcm: true },
        probe() {}, initialize() {}, getVoices() {}, synthesize() {}, pause() {}, resume() {}, cancel() {}, dispose() {}
      });
    } catch (error) { remoteRejected = error && error.code === "NON_LOCAL_BACKEND_REJECTED"; }
    add("remote-inference-is-rejected", remoteRejected);
    let voiceCloneRejected = false;
    try {
      validateVoiceList([{ id: "reference-clone", label: "Reference", presentation: "feminine", voiceMode: "voice-clone" }]);
    } catch (error) { voiceCloneRejected = error && error.code === "VOICE_PROFILE_NOT_ALLOWED"; }
    add("reference-voice-cloning-is-rejected", voiceCloneRejected);
    add("no-audio-is-claimed-before-pcm-arrives", adapter.getStatus().lastResult === null);
  } catch (error) {
    add("runtime-self-test-completed", false, { code: error && error.code || "SELF_TEST_ERROR", message: error && error.message || String(error) });
  } finally {
    if (adapter) {
      try { await adapter.dispose(); } catch (_) {}
    }
  }
  const failed = checks.filter(item => !item.passed);
  return Object.freeze({
    module: "brain-speech-singing-adapter-part2",
    version: BRAIN_SPEECH_SINGING_ADAPTER_VERSION_PART2,
    status: failed.length ? "FAILED" : "PASSED",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks: Object.freeze(checks)
  });
}

export async function mount(context = {}) {
  const target = context.target || (context.document && context.document.defaultView) || globalThis;
  let ttsEngine = context.ttsEngine || null;
  let planner = context.planner || null;
  let ownsTtsEngine = false;
  let ownsPlanner = false;
  if (!ttsEngine) {
    const ttsModule = await import("../tts/tts-engine.js");
    if (typeof ttsModule.createTtsEngine !== "function") fail("स्थानीय TTS Engine factory उपलब्ध नहीं है।", "TTS_FACTORY_UNAVAILABLE");
    ttsEngine = ttsModule.createTtsEngine({ target, defaultBackend: "native", autoLoadKnowledge: false });
    ownsTtsEngine = true;
  }
  if (!planner) {
    const singingModule = await import("../../../modules/vocal-singing-engine-part2.js");
    if (typeof singingModule.createVocalSingingEngine !== "function") fail("मौजूदा Vocal Singing Engine Planner उपलब्ध नहीं है।", "SINGING_PLANNER_UNAVAILABLE");
    planner = singingModule.createVocalSingingEngine({ target });
    ownsPlanner = true;
  }
  const adapter = createBrainSpeechSingingAdapterPart2({
    target,
    ttsEngine,
    planner,
    singingBackend: context.singingBackend,
    disposeBackendOnDispose: context.disposeBackendOnDispose === true,
    disposeTtsEngineOnDispose: ownsTtsEngine,
    disposePlannerOnDispose: ownsPlanner
  });
  let coreRegistration = null;
  if (context.core && context.singingBackend) coreRegistration = adapter.registerWithCore(context.core);
  const initialize = context.preload === true ? adapter.initialize() : Promise.resolve(adapter.getStatus());
  return Object.freeze({
    adapter,
    coreRegistration,
    initialize,
    onShow: () => adapter.getStatus(),
    onHide: () => adapter.pause(),
    unmount: () => adapter.dispose()
  });
}

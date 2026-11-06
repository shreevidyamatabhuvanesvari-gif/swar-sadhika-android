/* Swar-Sadhika — local Singing Voice Synthesis inference coordinator.
 * Version 0.1.0. Requires a compatible local pretrained model and adapter.
 * No model weights are included here. User reference-audio conditioning is unsupported.
 */
export const LOCAL_SVS_ENGINE_VERSION = "0.1.0";
export const LOCAL_SVS_ADAPTER_KIND = "swar-sadhika-local-svs-adapter";
const MODEL_DIR = "speech-to-singing/models/";
const FORMATS = new Set(["float32", "int16"]);
const PROVIDERS = new Set(["webgpu", "wasm"]);
const MIN_RATE = 8000, MAX_RATE = 96000, MAX_CHANNELS = 2, MAX_CHUNK_SECONDS = 5;
const DEFAULT_MAX_SECONDS = 180;

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = Object.getPrototypeOf(value);
  return p === Object.prototype || p === null;
}
function number(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(label + " एक सीमित संख्या होना चाहिए।");
  return n;
}
function fail(message, name = "Error", code = name) {
  const error = new Error(String(message)); error.name = name; error.code = code; return error;
}
function messageOf(error) {
  return error && typeof error.message === "string" && error.message.trim() ? error.message.trim() : "अज्ञात त्रुटि";
}

/** Validate a local-only, checksum-pinned model descriptor. */
export function validateLocalModelManifest(input) {
  if (!plain(input)) throw new TypeError("SVS model manifest plain object होना चाहिए।");
  if (input.schemaVersion !== 1) throw new RangeError("केवल schemaVersion 1 समर्थित है।");
  const modelId = String(input.modelId || "").trim();
  const version = String(input.version || "").trim();
  const architecture = String(input.architecture || "").trim();
  if (!modelId || !version || !architecture) throw new TypeError("modelId, version और architecture आवश्यक हैं।");
  if (input.task !== "singing-voice-synthesis") throw new RangeError("Model task singing-voice-synthesis होना चाहिए।");
  if (input.modelDirectory !== MODEL_DIR) throw new RangeError("Model files केवल speech-to-singing/models/ में रखे जाएँ।");
  const sampleRate = Number(input.sampleRate), channelCount = Number(input.channelCount);
  const audioFormat = String(input.audioFormat || "");
  if (!Number.isInteger(sampleRate) || sampleRate < MIN_RATE || sampleRate > MAX_RATE) throw new RangeError("sampleRate 8000–96000 Hz होना चाहिए।");
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > MAX_CHANNELS) throw new RangeError("channelCount केवल 1 या 2 हो सकता है।");
  if (!FORMATS.has(audioFormat)) throw new RangeError("audioFormat float32 या int16 होना चाहिए।");
  if (!Array.isArray(input.supportedLanguages) || !input.supportedLanguages.length ||
      input.supportedLanguages.some(x => typeof x !== "string" || !x.trim())) throw new TypeError("supportedLanguages सूची आवश्यक है।");
  if (!Array.isArray(input.phonemeInventory) || !input.phonemeInventory.length ||
      input.phonemeInventory.some(x => typeof x !== "string" || !x.trim())) throw new TypeError("phonemeInventory सूची आवश्यक है।");
  if (!Array.isArray(input.executionProviders) || !input.executionProviders.length ||
      input.executionProviders.some(x => !PROVIDERS.has(String(x)))) throw new TypeError("executionProviders में केवल webgpu/wasm मान्य हैं।");
  const artifacts = input.artifacts;
  if (!Array.isArray(artifacts) || !artifacts.length) throw new TypeError("कम-से-कम एक model artifact आवश्यक है।");
  const seenArtifacts = new Set();
  const safeArtifacts = artifacts.map((item, i) => {
    if (!plain(item)) throw new TypeError("Artifact " + i + " object होना चाहिए।");
    const id = String(item.id || "").trim(), role = String(item.role || "").trim();
    const path = String(item.path || "").replace(/\\/g, "/");
    const sizeBytes = Number(item.sizeBytes), sha256 = String(item.sha256 || "").toLowerCase();
    if (!id || !role || seenArtifacts.has(id)) throw new TypeError("हर artifact की unique id और role आवश्यक है।");
    seenArtifacts.add(id);
    if (!path.startsWith(MODEL_DIR) || path.includes("..") || path.includes(":") || path.startsWith("/") || path.includes("?") || path.includes("#")) {
      throw new RangeError("Artifact path केवल local models folder में हो सकता है: " + path);
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new RangeError("Artifact sizeBytes सकारात्मक पूर्णांक होना चाहिए।");
    if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new TypeError("हर artifact में SHA-256 checksum होना चाहिए।");
    return Object.freeze({ id, role, path, sizeBytes, sha256 });
  });
  if (!Array.isArray(input.speakerProfiles) || !input.speakerProfiles.length) throw new TypeError("Pretrained speakerProfiles आवश्यक हैं।");
  const speakerProfiles = input.speakerProfiles.map((item, i) => {
    if (!plain(item) || !String(item.id || "").trim()) throw new TypeError("speakerProfiles[" + i + "] में id आवश्यक है।");
    return Object.freeze({
      id: String(item.id).trim(), label: String(item.label || item.id),
      description: item.description == null ? null : String(item.description),
      voiceType: item.voiceType == null ? "unspecified" : String(item.voiceType)
    });
  });
  if (new Set(speakerProfiles.map(x => x.id)).size !== speakerProfiles.length) throw new RangeError("speakerProfiles में duplicate ids हैं।");
  const defaultSpeakerId = input.defaultSpeakerId == null ? speakerProfiles[0].id : String(input.defaultSpeakerId);
  if (!speakerProfiles.some(x => x.id === defaultSpeakerId)) throw new RangeError("defaultSpeakerId सूची में होना चाहिए।");
  const conditioning = input.conditioning == null ? {} : input.conditioning;
  if (!plain(conditioning)) throw new TypeError("conditioning plain object होना चाहिए।");
  if (conditioning.requiresReferenceAudio === true || conditioning.requiresPromptAudio === true) {
    throw new RangeError("इस engine में user reference/prompt audio समर्थित नहीं है।");
  }
  const maxOutputSeconds = input.maxOutputSeconds == null ? DEFAULT_MAX_SECONDS : Number(input.maxOutputSeconds);
  if (!Number.isFinite(maxOutputSeconds) || maxOutputSeconds <= 0 || maxOutputSeconds > 900) {
    throw new RangeError("Model maxOutputSeconds 0 से अधिक और 900 तक होना चाहिए।");
  }
  return Object.freeze({
    schemaVersion: 1, modelId, version, architecture, task: input.task, modelDirectory: MODEL_DIR,
    sampleRate, channelCount, audioFormat,
    supportedLanguages: Object.freeze([...new Set(input.supportedLanguages.map(x => x.trim().toLowerCase()))]),
    phonemeInventory: Object.freeze([...new Set(input.phonemeInventory.map(x => x.trim()))]),
    executionProviders: Object.freeze([...new Set(input.executionProviders.map(String))]),
    artifacts: Object.freeze(safeArtifacts), speakerProfiles: Object.freeze(speakerProfiles), defaultSpeakerId,
    conditioning: Object.freeze({ requiresReferenceAudio: false, requiresPromptAudio: false, mode: conditioning.mode == null ? null : String(conditioning.mode) }),
    maxOutputSeconds
  });
}

function validateAdapter(adapter) {
  if (!plain(adapter) || adapter.kind !== LOCAL_SVS_ADAPTER_KIND) throw new TypeError("स्थानीय SVS adapter contract आवश्यक है।");
  for (const key of ["initialize", "synthesize", "dispose"]) {
    if (typeof adapter[key] !== "function") throw new TypeError("SVS adapter में " + key + "() आवश्यक है।");
  }
  return adapter;
}
function validateInputs(score, phonemes) {
  if (!plain(score) || !Array.isArray(score.notes) || !Array.isArray(score.events)) throw new TypeError("Singing score में notes और events arrays आवश्यक हैं।");
  if (!plain(phonemes) || !Array.isArray(phonemes.units) || !Array.isArray(phonemes.phonemes) || !Array.isArray(phonemes.boundaries)) {
    throw new TypeError("Phoneme result में units, phonemes और boundaries arrays आवश्यक हैं।");
  }
  if (score.sourceText && phonemes.sourceText && score.sourceText !== phonemes.sourceText) throw new RangeError("Score और phoneme sourceText मेल नहीं खाते।");
  if (!score.notes.length) throw fail("Singing score में कोई note नहीं है।", "EmptyScoreError");
  for (const note of score.notes) {
    if (!plain(note) || !Number.isInteger(note.unitIndex) || note.unitIndex < 0 || note.unitIndex >= phonemes.units.length) throw new TypeError("Score note का unitIndex अमान्य है।");
    if (!note.pitch || !Number.isFinite(Number(note.pitch.frequencyHz)) || Number(note.pitch.frequencyHz) <= 0) throw new TypeError("Score note का pitch.frequencyHz अमान्य है।");
    if (!Number.isFinite(Number(note.durationSeconds)) || Number(note.durationSeconds) <= 0) throw new TypeError("Score note durationSeconds अमान्य है।");
  }
  for (const token of phonemes.phonemes) {
    if (!plain(token) || !Number.isInteger(token.unitIndex) || token.unitIndex < 0 || token.unitIndex >= phonemes.units.length) throw new TypeError("Phoneme का unitIndex अमान्य है।");
  }
}
function languageMatches(language, supported) {
  return supported.some(item => item === language || item === language.split("-")[0] || language.startsWith(item + "-"));
}

/** Build a deterministic phoneme + score payload for an adapter. */
export function createSynthesisInput(score, phonemeResult, manifest, options = {}) {
  validateInputs(score, phonemeResult);
  const language = String(phonemeResult.language || "sa-IN").trim().toLowerCase();
  if (!languageMatches(language, manifest.supportedLanguages)) throw fail("Model इस भाषा को समर्थित नहीं करता: " + language, "UnsupportedLanguageError");
  const inventory = new Set(manifest.phonemeInventory);
  const phonemeTokens = phonemeResult.phonemes.map(token => {
    const sourceSymbol = token.symbol == null ? null : String(token.symbol);
    let symbol = sourceSymbol;
    if (!symbol || token.type === "unknown") {
      if (inventory.has("UNK")) symbol = "UNK";
      else throw fail("अज्ञात phoneme मिला और model inventory में UNK नहीं है।", "UnsupportedPhonemeError");
    }
    if (!inventory.has(symbol)) throw fail("Model phoneme inventory में symbol उपलब्ध नहीं: " + symbol, "UnsupportedPhonemeError");
    return Object.freeze({ index: token.index, unitIndex: token.unitIndex, symbol, sourceSymbol, type: token.type || "phoneme", features: token.features || null });
  });
  const phonemesByUnit = new Map(), notesByUnit = new Map();
  for (const token of phonemeTokens) {
    if (!phonemesByUnit.has(token.unitIndex)) phonemesByUnit.set(token.unitIndex, []);
    phonemesByUnit.get(token.unitIndex).push(token);
  }
  for (const note of score.notes) {
    if (!notesByUnit.has(note.unitIndex)) notesByUnit.set(note.unitIndex, []);
    notesByUnit.get(note.unitIndex).push(note);
  }
  const units = phonemeResult.units.map((unit, index) => Object.freeze({
    index, text: String(unit.text || ""), kind: String(unit.kind || "akshara"),
    phonemes: Object.freeze((phonemesByUnit.get(index) || []).slice()),
    notes: Object.freeze((notesByUnit.get(index) || []).map(note => Object.freeze({
      swara: note.swara && note.swara.solfege ? String(note.swara.solfege) : null,
      frequencyHz: Number(note.pitch.frequencyHz), midiNumber: Number(note.pitch.midiNumber),
      durationSeconds: Number(note.durationSeconds), durationBeats: Number(note.durationBeats),
      vowelLength: note.vowelLength || null
    }))),
    recitationAccents: Object.freeze(Array.isArray(unit.accents) ? unit.accents.map(x => Object.freeze({ ...x })) : []),
    recitationMarks: Object.freeze(Array.isArray(unit.marks) ? unit.marks.map(x => Object.freeze({ ...x })) : [])
  }));
  const timeline = score.events.map(event => {
    if (event.type === "note") return Object.freeze({
      type: "note", unitIndex: event.unitIndex, startBeat: Number(event.startBeat), durationBeats: Number(event.durationBeats),
      startSeconds: Number(event.startSeconds), durationSeconds: Number(event.durationSeconds),
      frequencyHz: Number(event.pitch.frequencyHz), midiNumber: Number(event.pitch.midiNumber),
      swara: event.swara && event.swara.solfege ? String(event.swara.solfege) : null
    });
    if (event.type === "rest") return Object.freeze({
      type: "rest", reason: String(event.reason || "rest"), startBeat: Number(event.startBeat),
      durationBeats: Number(event.durationBeats), startSeconds: Number(event.startSeconds), durationSeconds: Number(event.durationSeconds)
    });
    throw new TypeError("Unknown score event type: " + event.type);
  });
  return Object.freeze({
    schemaVersion: 1, language, sourceText: String(phonemeResult.sourceText || score.sourceText || ""),
    compilerVersion: phonemeResult.version == null ? null : String(phonemeResult.version),
    scoreEngineVersion: score.version == null ? null : String(score.version),
    tempoBpm: Number(score.music && score.music.tempoBpm), tonicHz: Number(score.music && score.music.tonicHz),
    scaleProfileId: score.music && score.music.scaleProfile ? String(score.music.scaleProfile.id || "") : null,
    ragaName: score.music && score.music.raga ? score.music.raga.name : null, ragaRulesApplied: false,
    tala: score.music && score.music.tala ? Object.freeze({
      id: score.music.tala.id, beatsPerAvartan: score.music.tala.beatsPerAvartan, vibhags: score.music.tala.vibhags
    }) : null,
    phonemeTokens: Object.freeze(phonemeTokens), units: Object.freeze(units), timeline: Object.freeze(timeline),
    boundaries: Object.freeze(phonemeResult.boundaries.map(item => Object.freeze({
      kind: String(item.kind), text: item.text == null ? "" : String(item.text),
      afterUnitIndex: Number.isInteger(item.afterUnitIndex) ? item.afterUnitIndex : -1, canPause: item.canPause !== false
    }))),
    voiceProfileId: options.voiceProfileId || manifest.defaultSpeakerId,
    conditioning: Object.freeze({ referenceAudioProvided: false, promptAudioProvided: false })
  });
}

export function validatePcmChunk(chunk, manifest) {
  if (!plain(chunk)) throw new TypeError("PCM chunk object होना चाहिए।");
  const sampleRate = chunk.sampleRate == null ? manifest.sampleRate : Number(chunk.sampleRate);
  const channelCount = chunk.channelCount == null ? manifest.channelCount : Number(chunk.channelCount);
  const format = chunk.format == null ? manifest.audioFormat : String(chunk.format);
  if (sampleRate !== manifest.sampleRate) throw new RangeError("PCM sampleRate manifest से अलग है।");
  if (channelCount !== manifest.channelCount) throw new RangeError("PCM channelCount manifest से अलग है।");
  if (format !== manifest.audioFormat) throw new RangeError("PCM format manifest से अलग है।");
  const data = chunk.data, tag = Object.prototype.toString.call(data);
  let copy;
  if (tag === "[object Float32Array]" && format === "float32") copy = Float32Array.from(data);
  else if (tag === "[object Int16Array]" && format === "int16") copy = Int16Array.from(data);
  else if (tag === "[object ArrayBuffer]") {
    if (format === "float32") {
      if (data.byteLength % 4) throw new RangeError("Float32 byteLength चार से विभाज्य होना चाहिए।");
      copy = new Float32Array(data.slice(0));
    } else {
      if (data.byteLength % 2) throw new RangeError("Int16 byteLength दो से विभाज्य होना चाहिए।");
      copy = new Int16Array(data.slice(0));
    }
  } else throw new TypeError("PCM data manifest format से मेल नहीं खाता।");
  if (!copy.length || copy.length % channelCount) throw new RangeError("PCM chunk में पूर्ण audio frames आवश्यक हैं।");
  if (format === "float32") {
    for (let i = 0; i < copy.length; i++) {
      if (!Number.isFinite(copy[i]) || copy[i] < -1 || copy[i] > 1) throw new RangeError("Float32 PCM sample -1 से +1 के बीच होना चाहिए।");
    }
  }
  const frames = copy.length / channelCount, durationSeconds = frames / sampleRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_CHUNK_SECONDS) throw new RangeError("PCM chunk पाँच सेकंड से छोटा होना चाहिए।");
  return Object.freeze({ data: copy, format, sampleRate, channelCount, frames, durationSeconds });
}

export function createLocalSVSEngine(options = {}) {
  if (!plain(options)) throw new TypeError("Engine options plain object होना चाहिए।");
  const manifest = options.modelManifest == null ? null : validateLocalModelManifest(options.modelManifest);
  const adapter = options.adapter == null ? null : validateAdapter(options.adapter);
  const maxOutputSeconds = options.maxOutputSeconds == null
    ? (manifest ? manifest.maxOutputSeconds : DEFAULT_MAX_SECONDS) : number(options.maxOutputSeconds, "maxOutputSeconds");
  if (maxOutputSeconds <= 0 || maxOutputSeconds > 900) throw new RangeError("Engine maxOutputSeconds 0 से अधिक और 900 तक होना चाहिए।");
  if (manifest && maxOutputSeconds > manifest.maxOutputSeconds) throw new RangeError("Engine maxOutputSeconds model manifest की सीमा से अधिक नहीं हो सकता।");

  let phase = "idle", initialized = false, initializing = null, active = false, disposed = false;
  let generation = 0, lastError = null, provider = null, adapterInfo = null, progressState = null;

  function getStatus() {
    return Object.freeze({
      version: LOCAL_SVS_ENGINE_VERSION, phase, ready: initialized && !disposed,
      modelAvailable: Boolean(manifest && adapter), modelId: manifest ? manifest.modelId : null,
      modelVersion: manifest ? manifest.version : null, executionProvider: provider,
      active, disposed,
      lastError: lastError ? Object.freeze({ code: lastError.code || lastError.name || "ERROR", message: messageOf(lastError) }) : null
    });
  }
  function report(callback, update) {
    progressState = Object.freeze({
      phase: String(update.phase || phase), progress: update.progress == null ? null : Number(update.progress),
      message: String(update.message || "")
    });
    if (typeof callback === "function") { try { callback(progressState); } catch (_) {} }
  }
  async function initialize(initOptions = {}) {
    if (disposed) throw fail("Engine dispose हो चुका है।", "DisposedError");
    if (!plain(initOptions)) throw new TypeError("initialize() options plain object होना चाहिए।");
    if (initialized) return getStatus();
    if (initializing) return initializing;
    if (!manifest) {
      phase = "model-unavailable";
      lastError = fail("speech-to-singing/models/ में local model manifest उपलब्ध नहीं है।", "ModelUnavailableError", "MODEL_MANIFEST_MISSING");
      return getStatus();
    }
    if (!adapter) {
      phase = "adapter-unavailable";
      lastError = fail("Local inference adapter उपलब्ध नहीं है; engine स्वयं कोई synthetic PCM नहीं बनाएगा।", "AdapterUnavailableError", "LOCAL_ADAPTER_MISSING");
      return getStatus();
    }
    const selected = initOptions.executionProvider == null ? manifest.executionProviders[0] : String(initOptions.executionProvider);
    if (!PROVIDERS.has(selected) || !manifest.executionProviders.includes(selected)) throw new RangeError("executionProvider manifest द्वारा समर्थित नहीं है।");
    const token = ++generation;
    phase = "initializing";
    lastError = null;
    initializing = Promise.resolve().then(async () => {
      try {
        const result = await adapter.initialize(Object.freeze({
          modelManifest: manifest, executionProvider: selected, modelDirectory: MODEL_DIR,
          remoteFetchAllowed: false, referenceAudioAllowed: false,
          onProgress: update => report(initOptions.onProgress, update)
        }));
        if (disposed || token !== generation) throw fail("Initialization cancel हो गया।", "AbortError");
        if (!plain(result) || result.ready !== true) throw fail(result && result.message || "Local model तैयार नहीं हुआ।", "ModelInitializationError");
        const usedProvider = String(result.executionProvider || selected);
        if (!manifest.executionProviders.includes(usedProvider)) throw fail("Adapter ने unsupported execution provider चुना।", "RuntimeContractError");
        if (result.modelId != null && String(result.modelId) !== manifest.modelId) throw fail("Loaded modelId manifest से मेल नहीं खाता।", "ModelIdentityError");
        if (result.artifactsVerified !== true) throw fail("Adapter ने local artifact checksum verification की पुष्टि नहीं की।", "ArtifactVerificationError");
        provider = usedProvider;
        adapterInfo = Object.freeze({
          modelId: manifest.modelId, modelVersion: manifest.version, executionProvider: usedProvider,
          runtimeVersion: result.runtimeVersion == null ? null : String(result.runtimeVersion), artifactsVerified: true
        });
        initialized = true;
        phase = "ready";
        report(initOptions.onProgress, { phase: "ready", progress: 1, message: "Local SVS model तैयार है।" });
        return getStatus();
      } catch (error) {
        initialized = false; phase = disposed ? "disposed" : "failed"; lastError = error; throw error;
      } finally { initializing = null; }
    });
    return initializing;
  }

  async function synthesize(request = {}) {
    if (disposed) throw fail("Engine dispose हो चुका है।", "DisposedError");
    if (!plain(request)) throw new TypeError("synthesize() request plain object होना चाहिए।");
    if (active) throw fail("एक synthesis पहले से चल रहा है।", "SynthesisBusyError");
    if (!initialized || !adapter || !manifest) throw fail("पहले initialize() सफल होना चाहिए।", "EngineNotReadyError");
    if (typeof request.onPcmChunk !== "function") throw new TypeError("PCM Producer handoff के लिए onPcmChunk आवश्यक है।");
    const voiceProfileId = request.voiceProfileId == null ? manifest.defaultSpeakerId : String(request.voiceProfileId);
    if (!manifest.speakerProfiles.some(item => item.id === voiceProfileId)) throw fail("Pretrained voice profile उपलब्ध नहीं: " + voiceProfileId, "UnknownSpeakerProfileError");
    const input = createSynthesisInput(request.score, request.phonemeResult, manifest, { voiceProfileId });
    const requestedMax = request.maxOutputSeconds == null ? maxOutputSeconds : number(request.maxOutputSeconds, "request.maxOutputSeconds");
    if (requestedMax <= 0 || requestedMax > maxOutputSeconds || requestedMax > manifest.maxOutputSeconds) {
      throw new RangeError("Request maxOutputSeconds engine और model दोनों की सीमा के भीतर होना चाहिए।");
    }
    const token = ++generation;
    let framesTotal = 0, chunks = 0, secondsTotal = 0;
    active = true; phase = "synthesizing"; lastError = null;
    const cancellation = Object.freeze({
      isCancelled: () => disposed || token !== generation,
      throwIfCancelled: () => { if (disposed || token !== generation) throw fail("Synthesis cancel हो गया।", "AbortError"); }
    });
    const onProgress = update => { cancellation.throwIfCancelled(); report(request.onProgress, update); };
    const onPcmChunk = async raw => {
      cancellation.throwIfCancelled();
      const chunk = validatePcmChunk(raw, manifest);
      const nextSeconds = secondsTotal + chunk.durationSeconds;
      if (nextSeconds > requestedMax + 1e-9) throw fail("Output duration सीमा पार हुई।", "OutputDurationLimitError");
      const delivered = Object.freeze({
        data: chunk.data, format: chunk.format, sampleRate: chunk.sampleRate,
        channelCount: chunk.channelCount, frames: chunk.frames,
        durationSeconds: chunk.durationSeconds, sequence: chunks
      });
      await request.onPcmChunk(delivered); // Back-pressure: wait for PCM Producer to accept this chunk.
      cancellation.throwIfCancelled();
      framesTotal += chunk.frames; secondsTotal = nextSeconds; chunks += 1;
      return Object.freeze({ accepted: true, sequence: delivered.sequence, totalFrames: framesTotal, totalSeconds: secondsTotal });
    };
    try {
      report(request.onProgress, { phase: "synthesizing", progress: 0, message: "स्थानीय SVS inference शुरू हो रहा है।" });
      const result = await adapter.synthesize(Object.freeze({
        input, modelManifest: manifest, executionProvider: provider, cancellation, onPcmChunk, onProgress
      }));
      cancellation.throwIfCancelled();
      if (!plain(result) || result.completed !== true) throw fail(result && result.message || "Adapter ने synthesis पूरा होने की पुष्टि नहीं की।", "SynthesisIncompleteError");
      if (!chunks || !framesTotal) throw fail("Model ने कोई valid PCM chunk नहीं दिया।", "EmptyPcmOutputError");
      if (result.sampleRate != null && Number(result.sampleRate) !== manifest.sampleRate) throw fail("Output sampleRate manifest से मेल नहीं खाता।", "RuntimeContractError");
      phase = "ready";
      report(request.onProgress, { phase: "completed", progress: 1, message: "Local SVS synthesis पूरा हुआ।" });
      return Object.freeze({
        status: "completed", modelId: manifest.modelId, modelVersion: manifest.version, voiceProfileId,
        executionProvider: provider, sampleRate: manifest.sampleRate, channelCount: manifest.channelCount,
        format: manifest.audioFormat, chunkCount: chunks, totalFrames: framesTotal,
        durationSeconds: secondsTotal, pcmDeliveredToProducer: true
      });
    } catch (error) {
      lastError = error;
      phase = disposed ? "disposed" : error && error.name === "AbortError" ? "ready" : "failed";
      throw error;
    } finally {
      active = false;
      if (!disposed && phase === "synthesizing") phase = "ready";
    }
  }
  async function cancel(reason = "Synthesis उपयोगकर्ता द्वारा रोका गया।") {
    if (!active) return false;
    generation += 1;
    if (adapter && typeof adapter.cancel === "function") { try { await adapter.cancel(String(reason)); } catch (_) {} }
    active = false; if (!disposed) phase = "ready";
    lastError = fail(reason, "AbortError"); return true;
  }
  async function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; active = false; initialized = false; phase = "disposed";
    if (adapter) { try { await adapter.dispose(); } catch (error) { lastError = error; } }
    adapterInfo = null;
  }
  function getDiagnostics() {
    return Object.freeze({
      ...getStatus(), adapterKind: adapter ? adapter.kind : null, adapterInfo,
      modelArtifactCount: manifest ? manifest.artifacts.length : 0,
      speakerProfiles: manifest ? Object.freeze(manifest.speakerProfiles.map(item => item.id)) : Object.freeze([]),
      progress: progressState, localOnly: true, userReferenceAudioSupported: false,
      modelWeightsBundledInThisModule: false, inferenceImplementedBy: "external-local-model-adapter"
    });
  }
  return Object.freeze({
    version: LOCAL_SVS_ENGINE_VERSION, initialize, synthesize, cancel, dispose, getStatus, getDiagnostics,
    validateModelManifest: validateLocalModelManifest
  });
}

export function selfTest() {
  const checks = [];
  const add = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  const manifest = () => ({
    schemaVersion: 1, modelId: "test-svs", version: "1", architecture: "test-adapter",
    task: "singing-voice-synthesis", modelDirectory: MODEL_DIR, sampleRate: 48000,
    channelCount: 1, audioFormat: "float32", supportedLanguages: ["sa", "sa-in"],
    phonemeInventory: ["k", "ā", "UNK"], executionProviders: ["wasm", "webgpu"],
    artifacts: [{ id: "acoustic", role: "acoustic", path: MODEL_DIR + "model.onnx", sizeBytes: 1024, sha256: "a".repeat(64) }],
    speakerProfiles: [{ id: "pretrained", label: "Pretrained profile" }], defaultSpeakerId: "pretrained",
    conditioning: { requiresReferenceAudio: false, requiresPromptAudio: false }, maxOutputSeconds: 60
  });
  const phonemes = {
    version: "0.2.0", language: "sa-IN", sourceText: "का",
    units: [{ index: 0, text: "का", kind: "akshara", hasVowel: true, vowelSymbol: "ā", vowelLength: "long", mora: 2, accents: [], marks: [] }],
    phonemes: [{ index: 0, unitIndex: 0, symbol: "k", type: "consonant" }, { index: 1, unitIndex: 0, symbol: "ā", type: "vowel" }],
    boundaries: [], warnings: []
  };
  const score = {
    version: "0.1.0", sourceText: "का",
    notes: [{ unitIndex: 0, pitch: { frequencyHz: 261.6, midiNumber: 60 }, swara: { solfege: "Sa" }, durationSeconds: 0.5, durationBeats: 1 }],
    events: [{ type: "note", unitIndex: 0, startBeat: 0, durationBeats: 1, startSeconds: 0, durationSeconds: 0.5, pitch: { frequencyHz: 261.6, midiNumber: 60 }, swara: { solfege: "Sa" } }],
    music: { tempoBpm: 120, tonicHz: 261.6, scaleProfile: { id: "test" }, raga: { name: null }, tala: null }
  };
  const valid = () => validateLocalModelManifest(manifest());
  add("valid-manifest", valid().modelId === "test-svs");
  add("local-path-only", valid().artifacts[0].path.startsWith(MODEL_DIR));
  add("reject-remote-path", (() => { const m = manifest(); m.artifacts[0].path = "https://example.org/a.onnx"; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-traversal", (() => { const m = manifest(); m.artifacts[0].path = MODEL_DIR + "../x"; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-checksum", (() => { const m = manifest(); m.artifacts[0].sha256 = "bad"; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof TypeError; } })());
  add("reject-reference-audio", (() => { const m = manifest(); m.conditioning.requiresPromptAudio = true; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-task", (() => { const m = manifest(); m.task = "tts"; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-rate", (() => { const m = manifest(); m.sampleRate = 1000; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-channels", (() => { const m = manifest(); m.channelCount = 3; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-provider", (() => { const m = manifest(); m.executionProviders = ["cloud"]; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof TypeError; } })());
  add("reject-no-speaker", (() => { const m = manifest(); m.speakerProfiles = []; try { validateLocalModelManifest(m); return false; } catch (e) { return e instanceof TypeError; } })());
  add("phoneme-inventory", createSynthesisInput(score, phonemes, valid()).phonemeTokens.length === 2);
  add("reject-missing-phoneme", (() => { const m = manifest(); m.phonemeInventory = ["k"]; try { createSynthesisInput(score, phonemes, validateLocalModelManifest(m)); return false; } catch (e) { return e.code === "UnsupportedPhonemeError"; } })());
  add("unknown-maps-to-unk", (() => { const p = { ...phonemes, phonemes: [{ index: 0, unitIndex: 0, symbol: null, type: "unknown" }] }; return createSynthesisInput(score, p, valid()).phonemeTokens[0].symbol === "UNK"; })());
  add("reject-language", (() => { try { createSynthesisInput(score, { ...phonemes, language: "en-US" }, valid()); return false; } catch (e) { return e.code === "UnsupportedLanguageError"; } })());
  add("reject-source-mismatch", (() => { try { createSynthesisInput(score, { ...phonemes, sourceText: "अन्य" }, valid()); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-empty-score", (() => { try { createSynthesisInput({ ...score, notes: [] }, phonemes, valid()); return false; } catch (e) { return e.code === "EmptyScoreError"; } })());
  add("pcm-float32", validatePcmChunk({ data: new Float32Array([0, 0.5]), format: "float32" }, valid()).frames === 2);
  add("pcm-int16", (() => { const m = manifest(); m.audioFormat = "int16"; return validatePcmChunk({ data: new Int16Array([0, 1]), format: "int16" }, validateLocalModelManifest(m)).frames === 2; })());
  add("pcm-reject-nan", (() => { try { validatePcmChunk({ data: new Float32Array([NaN]), format: "float32" }, valid()); return false; } catch (e) { return e instanceof RangeError; } })());
  add("pcm-reject-range", (() => { try { validatePcmChunk({ data: new Float32Array([2]), format: "float32" }, valid()); return false; } catch (e) { return e instanceof RangeError; } })());
  add("pcm-reject-long-chunk", (() => { try { validatePcmChunk({ data: new Float32Array(48000 * 6), format: "float32" }, valid()); return false; } catch (e) { return e instanceof RangeError; } })());
  add("require-local-adapter", (() => { try { validateAdapter({ kind: "cloud", initialize() {}, synthesize() {}, dispose() {} }); return false; } catch (e) { return e instanceof TypeError; } })());
  add("model-unavailable-explicit", createLocalSVSEngine().getStatus().modelAvailable === false);
  add("no-model-weights-claim", createLocalSVSEngine().getDiagnostics().modelWeightsBundledInThisModule === false);
  add("reference-audio-api-absent", !Object.prototype.hasOwnProperty.call(createLocalSVSEngine(), "setReferenceAudio"));
  add("rest-preserved", (() => { const s = { ...score, events: [...score.events, { type: "rest", reason: "verse", startBeat: 1, durationBeats: 1, startSeconds: 0.5, durationSeconds: 0.5 }] }; return createSynthesisInput(s, phonemes, valid()).timeline.some(x => x.type === "rest"); })());
  add("vedic-accent-preserved", (() => { const p = { ...phonemes, units: [{ ...phonemes.units[0], accents: [{ label: "udatta" }] }] }; return createSynthesisInput(score, p, valid()).units[0].recitationAccents[0].label === "udatta"; })());
  add("manifest-frozen", Object.isFrozen(valid().artifacts));
  add("reference-audio-not-provided", createSynthesisInput(score, phonemes, valid()).conditioning.referenceAudioProvided === false);
  add("engine-limit-cannot-exceed-model", (() => { try { createLocalSVSEngine({ modelManifest: manifest(), maxOutputSeconds: 61 }); return false; } catch (e) { return e instanceof RangeError; } })());
  add("request-limit-check-is-explicit", (() => { const engine = createLocalSVSEngine({ modelManifest: manifest(), maxOutputSeconds: 20 }); return engine.getDiagnostics().modelArtifactCount === 1; })());
  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({ module: "local-svs-engine", version: LOCAL_SVS_ENGINE_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED", total: checks.length, passed,
    failed: checks.length - passed, checks: Object.freeze(checks) });
}

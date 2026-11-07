/* Swar-Sadhika Speech-to-Singing — PCM Producer and transport bridge.
 * Version 0.1.0. Compiles text -> phonemes -> score, then forwards real model PCM.
 * This module creates no audio samples, contains no model weights and does not fake audio.
 * Call startStream() from the user's Play gesture before produce().
 */
import { compilePhonemes } from "./phoneme-compiler.js";
import { compileSingingScore } from "./singing-score-engine.js";
export const PCM_PRODUCER_VERSION = "0.1.0";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function makeError(message, name = "Error", code = name) {
  const error = new Error(String(message)); error.name = name; error.code = code; return error;
}
function errorMessage(error) {
  return error && typeof error.message === "string" && error.message.trim() ? error.message.trim() : "अज्ञात त्रुटि";
}
function safeCallback(callback, value) {
  if (typeof callback !== "function") return;
  try { callback(value); } catch (_) {}
}
function normalizeStreamBridge(stream) {
  if (!isPlainObject(stream)) throw new TypeError("PCM Producer को Stream Processor या orchestrator bridge object चाहिए।");
  if (["start", "pushChunk", "end", "stop", "getState"].every(key => typeof stream[key] === "function")) {
    return Object.freeze({
      start: options => stream.start(options), pushChunk: (data, options) => stream.pushChunk(data, options),
      end: () => stream.end(), stop: reason => stream.stop(reason), getState: () => stream.getState(),
      source: "stream-processor"
    });
  }
  if (["startPcmStream", "pushPcmChunk", "endPcmStream", "stopPcmStream", "getPcmStreamState"].every(key => typeof stream[key] === "function")) {
    return Object.freeze({
      start: options => stream.startPcmStream(options), pushChunk: (data, options) => stream.pushPcmChunk(data, options),
      end: () => stream.endPcmStream(), stop: reason => stream.stopPcmStream(reason),
      getState: () => stream.getPcmStreamState(), source: "orchestrator-host-contract"
    });
  }
  throw new TypeError("Stream bridge में start/push/end/stop/state methods आवश्यक हैं।");
}
function validatePcmEnvelope(chunk, expectedSequence) {
  if (!isPlainObject(chunk)) throw new TypeError("SVS Engine का PCM chunk object होना चाहिए।");
  if (!Number.isInteger(chunk.sequence) || chunk.sequence !== expectedSequence) {
    throw makeError("PCM chunk क्रम टूटा है; अपेक्षित sequence " + expectedSequence + " था।", "PcmSequenceError");
  }
  const format = String(chunk.format || "");
  if (format !== "float32" && format !== "int16") throw new TypeError("PCM chunk format float32 या int16 होना चाहिए।");
  const tag = Object.prototype.toString.call(chunk.data);
  let sampleCount;
  if (tag === "[object Float32Array]" && format === "float32") {
    sampleCount = chunk.data.length;
    for (let i = 0; i < chunk.data.length; i++) {
      if (!Number.isFinite(chunk.data[i]) || chunk.data[i] < -1 || chunk.data[i] > 1) throw new RangeError("Float32 PCM sample -1 से +1 के बीच होना चाहिए।");
    }
  } else if (tag === "[object Int16Array]" && format === "int16") sampleCount = chunk.data.length;
  else if (tag === "[object ArrayBuffer]") {
    const bytes = format === "float32" ? 4 : 2;
    if (chunk.data.byteLength % bytes) throw new RangeError("PCM ArrayBuffer आकार format के अनुसार विभाजित होना चाहिए।");
    sampleCount = chunk.data.byteLength / bytes;
  } else throw new TypeError("PCM chunk data Float32Array, Int16Array या ArrayBuffer होना चाहिए।");
  const sampleRate = Number(chunk.sampleRate), channelCount = Number(chunk.channelCount);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new RangeError("PCM sampleRate 8000–96000 Hz होना चाहिए।");
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 2) throw new RangeError("PCM channelCount 1 या 2 होना चाहिए।");
  if (!sampleCount || sampleCount % channelCount) throw new RangeError("PCM chunk में पूर्ण audio frames होने चाहिए।");
  const frames = sampleCount / channelCount, durationSeconds = frames / sampleRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 5) throw new RangeError("हर PCM chunk पाँच सेकंड से अधिक नहीं हो सकता।");
  if (chunk.frames != null && Number(chunk.frames) !== frames) throw new RangeError("PCM frames metadata sample count से मेल नहीं खाता।");
  if (chunk.durationSeconds != null && Math.abs(Number(chunk.durationSeconds) - durationSeconds) > 1e-6) {
    throw new RangeError("PCM duration metadata sample count से मेल नहीं खाता।");
  }
  return Object.freeze({ data: chunk.data, format, sampleRate, channelCount, frames, durationSeconds, sequence: chunk.sequence });
}
function validateEngine(engine) {
  if (!isPlainObject(engine)) throw new TypeError("Local SVS Engine object आवश्यक है।");
  for (const key of ["initialize", "synthesize", "cancel", "getStatus"]) {
    if (typeof engine[key] !== "function") throw new TypeError("SVS Engine में " + key + "() आवश्यक है।");
  }
  return engine;
}
function mergeOptions(base, override, label) {
  if (override == null) return { ...base };
  if (!isPlainObject(override)) throw new TypeError(label + " plain object होना चाहिए।");
  return { ...base, ...override };
}

/** Bridge local SVS PCM into the bounded processor; input may be the Processor or Host Contract v2. */
export function createPcmProducer(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("PCM Producer options plain object होना चाहिए।");
  const svsEngine = validateEngine(options.svsEngine);
  const stream = normalizeStreamBridge(options.stream || options.streamProcessor);
  const defaultPhonemeOptions = mergeOptions({}, options.phonemeOptions, "phonemeOptions");
  const defaultScoreOptions = mergeOptions({}, options.scoreOptions, "scoreOptions");
  const defaultVoiceProfileId = options.voiceProfileId == null ? null : String(options.voiceProfileId);
  const disposeEngineOnDispose = options.disposeEngineOnDispose === true;
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : null;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  let phase = "idle", active = false, disposed = false, cancellationRequested = false;
  let generation = 0, lastError = null, currentProgress = null, initializationPromise = null;
  let latestStats = Object.freeze({ chunkCount: 0, frames: 0, durationSeconds: 0 });

  function publish(message, warning = false, extra = {}) {
    const value = Object.freeze({ phase, message: String(message), warning: Boolean(warning), ...extra });
    safeCallback(onStatus, value); return value;
  }
  function progress(callback, update) {
    currentProgress = Object.freeze({
      phase: String(update.phase || phase), progress: update.progress == null ? null : Number(update.progress),
      message: String(update.message || "")
    });
    safeCallback(onProgress, currentProgress); safeCallback(callback, currentProgress);
  }
  function ensureCurrent(token) {
    if (disposed) throw makeError("PCM Producer dispose हो चुका है।", "DisposedError");
    if (token !== generation || cancellationRequested) throw makeError("PCM उत्पादन रोक दिया गया।", "AbortError");
  }
  function getStreamState() { try { return stream.getState(); } catch (_) { return null; } }
  function getStatus() {
    let engineStatus = null; try { engineStatus = svsEngine.getStatus(); } catch (_) {}
    const streamStatus = getStreamState();
    return Object.freeze({
      version: PCM_PRODUCER_VERSION, phase, active, disposed,
      initialized: Boolean(engineStatus && engineStatus.ready),
      modelAvailable: Boolean(engineStatus && engineStatus.modelAvailable),
      modelId: engineStatus ? engineStatus.modelId || null : null,
      streamPhase: streamStatus && streamStatus.phase ? streamStatus.phase : null,
      latestStats, progress: currentProgress,
      lastError: lastError ? Object.freeze({
        name: lastError.name || "Error", code: lastError.code || lastError.name || "ERROR",
        message: errorMessage(lastError)
      }) : null
    });
  }
  async function initialize(initOptions = {}) {
    if (disposed) throw makeError("PCM Producer dispose हो चुका है।", "DisposedError");
    if (!isPlainObject(initOptions)) throw new TypeError("initialize() options plain object होना चाहिए।");
    if (active) throw makeError("सक्रिय synthesis के दौरान initialization नहीं किया जा सकता।", "ProducerBusyError");
    if (initializationPromise) return initializationPromise;
    if (phase === "ready" && svsEngine.getStatus().ready) return getStatus();
    phase = "initializing"; lastError = null;
    publish("स्थानीय Singing Voice Synthesis model तैयार किया जा रहा है…");
    initializationPromise = Promise.resolve().then(async () => {
      try {
        const engineStatus = await svsEngine.initialize({
          executionProvider: initOptions.executionProvider,
          onProgress: update => progress(initOptions.onProgress, update)
        });
        if (disposed) throw makeError("Initialization के दौरान Producer बंद किया गया।", "AbortError");
        if (!engineStatus || engineStatus.ready !== true) {
          const detail = engineStatus && engineStatus.lastError && engineStatus.lastError.message
            ? engineStatus.lastError.message : "स्थानीय SVS model या adapter उपलब्ध नहीं है।";
          phase = engineStatus && engineStatus.phase === "model-unavailable" ? "model-unavailable" : "unavailable";
          lastError = makeError(detail, "ModelUnavailableError", "LOCAL_SVS_NOT_READY");
          publish(detail, true); return getStatus();
        }
        phase = "ready";
        progress(initOptions.onProgress, { phase: "ready", progress: 1, message: "स्थानीय SVS model तैयार है।" });
        publish("स्थानीय SVS model तैयार है।"); return getStatus();
      } catch (error) {
        phase = disposed ? "disposed" : "failed"; lastError = error;
        publish("SVS initialization विफल: " + errorMessage(error), true); throw error;
      } finally { initializationPromise = null; }
    });
    return initializationPromise;
  }
  async function startStream(streamOptions = {}) {
    if (disposed) throw makeError("PCM Producer dispose हो चुका है।", "DisposedError");
    if (!isPlainObject(streamOptions)) throw new TypeError("startStream() options plain object होना चाहिए।");
    if (active) throw makeError("Synthesis के दौरान Stream दोबारा शुरू नहीं की जा सकती।", "ProducerBusyError");
    const state = getStreamState();
    if (state && state.phase === "streaming") return state;
    if (state && state.disposed) throw makeError("Stream Processor dispose हो चुका है।", "StreamDisposedError");
    // Call from the Play click handler to preserve browser audio user activation.
    const result = await stream.start(streamOptions);
    const latest = getStreamState() || result;
    if (!latest || latest.phase !== "streaming") throw makeError("Stream Processor ने active streaming स्थिति की पुष्टि नहीं की।", "StreamStartError");
    if (phase !== "ready") phase = "stream-ready";
    publish("PCM Stream सक्रिय है; अब synthesis शुरू की जा सकती है।"); return latest;
  }
  async function produce(request = {}) {
    if (disposed) throw makeError("PCM Producer dispose हो चुका है।", "DisposedError");
    if (!isPlainObject(request)) throw new TypeError("produce() request plain object होना चाहिए।");
    if (active) throw makeError("एक PCM उत्पादन पहले से चल रहा है।", "ProducerBusyError");
    if (!svsEngine.getStatus().ready) throw makeError("पहले initialize() करके local SVS model तैयार करें।", "EngineNotReadyError");
    const streamState = getStreamState();
    if (!streamState || streamState.phase !== "streaming") throw makeError("पहले Play gesture से startStream() चलाकर PCM Stream सक्रिय करें।", "StreamNotReadyError");
    if (typeof request.text !== "string" || !request.text.trim()) throw new TypeError("produce() में Sanskrit text string आवश्यक है।");

    const token = ++generation;
    active = true; cancellationRequested = false; phase = "compiling"; lastError = null;
    latestStats = Object.freeze({ chunkCount: 0, frames: 0, durationSeconds: 0 });
    let deliveredChunks = 0, deliveredFrames = 0, deliveredSeconds = 0;
    const report = update => progress(request.onProgress, update);
    try {
      ensureCurrent(token);
      report({ phase: "compiling-phonemes", progress: 0.05, message: "संस्कृत पाठ के phonemes तैयार किए जा रहे हैं।" });
      const phonemeResult = compilePhonemes(request.text, mergeOptions(defaultPhonemeOptions, request.phonemeOptions, "request.phonemeOptions"));
      ensureCurrent(token);
      report({ phase: "compiling-score", progress: 0.12, message: "गायन-स्कोर तैयार किया जा रहा है।" });
      const score = compileSingingScore(phonemeResult, mergeOptions(defaultScoreOptions, request.scoreOptions, "request.scoreOptions"));
      if (!score || !Array.isArray(score.notes) || score.notes.length === 0) throw makeError("दिए गए संस्कृत पाठ से कोई गेय vowel/note नहीं बना।", "EmptyScoreError");
      ensureCurrent(token);
      const voiceProfileId = request.voiceProfileId == null ? (defaultVoiceProfileId || undefined) : String(request.voiceProfileId);
      phase = "synthesizing"; publish("स्थानीय SVS model से PCM chunks तैयार किए जा रहे हैं…");
      const result = await svsEngine.synthesize({
        score, phonemeResult, voiceProfileId, maxOutputSeconds: request.maxOutputSeconds,
        onProgress: update => {
          ensureCurrent(token);
          const raw = update && update.progress != null ? Number(update.progress) : null;
          report({
            phase: update && update.phase ? update.phase : "synthesizing",
            progress: raw == null ? null : 0.15 + Math.max(0, Math.min(1, raw)) * 0.8,
            message: update && update.message ? update.message : "SVS inference चल रहा है।"
          });
        },
        onPcmChunk: async chunk => {
          ensureCurrent(token);
          const envelope = validatePcmEnvelope(chunk, deliveredChunks);
          // Await Processor back-pressure; it owns bounded queueing and Web Audio scheduling.
          await stream.pushChunk(envelope.data, {
            format: envelope.format, sampleRate: envelope.sampleRate, channelCount: envelope.channelCount
          });
          ensureCurrent(token);
          deliveredFrames += envelope.frames; deliveredSeconds += envelope.durationSeconds; deliveredChunks += 1;
          latestStats = Object.freeze({ chunkCount: deliveredChunks, frames: deliveredFrames, durationSeconds: deliveredSeconds });
          report({
            phase: "streaming", progress: null,
            message: "PCM chunk " + deliveredChunks + " Player queue तक पहुँच गया।",
            chunkCount: deliveredChunks, durationSeconds: deliveredSeconds
          });
          return Object.freeze({ accepted: true, sequence: envelope.sequence, frames: envelope.frames, durationSeconds: envelope.durationSeconds });
        }
      });
      ensureCurrent(token);
      if (!result || result.status !== "completed") throw makeError("SVS Engine ने completed synthesis की पुष्टि नहीं की।", "SynthesisIncompleteError");
      if (deliveredChunks < 1 || deliveredFrames < 1) throw makeError("SVS Engine से कोई वास्तविक PCM chunk प्राप्त नहीं हुआ।", "EmptyPcmOutputError");
      if (Number(result.chunkCount) !== deliveredChunks) throw makeError("SVS Engine और PCM Producer के chunk counts मेल नहीं खाते।", "PcmChunkCountMismatchError");
      phase = "ending";
      report({ phase: "ending-stream", progress: 0.98, message: "PCM Stream को पूरा किया जा रहा है।" });
      const streamResult = await stream.end();
      ensureCurrent(token);
      phase = "completed"; lastError = null;
      report({ phase: "completed", progress: 1, message: "Synthesis और PCM handoff पूरा हुआ।" });
      publish("Singing score का PCM Stream Player तक सफलतापूर्वक पहुँच गया।");
      return Object.freeze({
        status: "completed", producerVersion: PCM_PRODUCER_VERSION, sourceText: request.text,
        phonemeResult, score, synthesis: result, streamResult: streamResult == null ? null : streamResult,
        chunksDelivered: deliveredChunks, framesDelivered: deliveredFrames, durationSeconds: deliveredSeconds
      });
    } catch (error) {
      const cancelled = token !== generation || cancellationRequested || (error && error.name === "AbortError");
      lastError = error; phase = disposed ? "disposed" : cancelled ? "cancelled" : "failed";
      // Do not leave a partially generated stream playing after failure.
      if (!disposed && !["completed", "stopped", "disposed"].includes((getStreamState() || {}).phase)) {
        try { stream.stop(cancelled ? "PCM synthesis रद्द किया गया।" : "PCM synthesis/transport विफल हुआ।"); } catch (_) {}
      }
      if (!disposed) publish(cancelled ? "PCM synthesis रद्द किया गया।" : "PCM synthesis विफल: " + errorMessage(error), !cancelled);
      throw error;
    } finally {
      active = false;
      if (!disposed && phase === "synthesizing") phase = "ready";
    }
  }
  async function cancel(reason = "PCM synthesis उपयोगकर्ता द्वारा रोका गया।") {
    if (disposed || !active) return false;
    cancellationRequested = true; generation += 1; phase = "cancelling";
    try { await svsEngine.cancel(String(reason)); } catch (_) {}
    try { stream.stop(String(reason)); } catch (_) {}
    phase = disposed ? "disposed" : "cancelled"; publish(String(reason), true); return true;
  }
  async function stopStream(reason = "PCM Stream रोक दी गई।") {
    if (active) return cancel(reason);
    if (disposed) return false;
    const stopped = stream.stop(String(reason));
    if (stopped !== false) { phase = "stopped"; publish(String(reason)); }
    return stopped;
  }
  async function dispose() {
    if (disposed) return;
    if (active) await cancel("PCM Producer बंद किया जा रहा है।");
    disposed = true; generation += 1; phase = "disposed";
    if (disposeEngineOnDispose) { try { await svsEngine.dispose(); } catch (error) { lastError = error; } }
    publish("PCM Producer dispose हो गया।");
  }
  function getDiagnostics() {
    return Object.freeze({
      ...getStatus(), streamBridge: stream.source, localOnly: true, createsPcmSamples: false,
      forwardsModelPcmOnly: true, orderedChunkDelivery: true,
      backpressure: "await-stream-processor-push", userGestureRequiredForStreamStart: true,
      svsEngineOwnedByProducer: disposeEngineOnDispose
    });
  }
  return Object.freeze({
    version: PCM_PRODUCER_VERSION, initialize, startStream, produce, cancel, stopStream, dispose,
    getStatus, getDiagnostics
  });
}

export function selfTest() {
  const checks = [];
  const add = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  const mockEngine = () => ({
    async initialize() { return { ready: true, phase: "ready" }; },
    getStatus() { return { ready: true, modelAvailable: true, modelId: "test-model" }; },
    async synthesize(request) {
      await request.onPcmChunk({
        sequence: 0, data: new Float32Array([0, 0.25, -0.25, 0]), format: "float32",
        sampleRate: 48000, channelCount: 1, frames: 4, durationSeconds: 4 / 48000
      });
      return { status: "completed", chunkCount: 1, totalFrames: 4 };
    },
    async cancel() { return true; }, async dispose() {}
  });
  const mockStream = () => {
    let phase = "idle"; const chunks = [];
    return {
      chunks,
      start: async () => { phase = "streaming"; return { phase }; },
      pushChunk: async (data, options) => {
        if (phase !== "streaming") throw makeError("stream not streaming", "StreamNotReadyError");
        chunks.push({ data, options }); return { frames: data.length, durationSeconds: data.length / options.sampleRate };
      },
      end: async () => { if (phase !== "streaming") throw makeError("bad end"); phase = "completed"; return { phase }; },
      stop: () => { phase = "stopped"; return true; }, getState: () => ({ phase })
    };
  };
  const stream = mockStream(), producer = createPcmProducer({ svsEngine: mockEngine(), stream });
  add("version-defined", PCM_PRODUCER_VERSION === "0.1.0");
  add("direct-stream-interface", producer.getDiagnostics().streamBridge === "stream-processor");
  add("local-only-diagnostics", producer.getDiagnostics().localOnly === true);
  add("no-audio-generation-claim", producer.getDiagnostics().createsPcmSamples === false);
  add("pcm-sequence-valid", validatePcmEnvelope({ sequence: 0, data: new Float32Array([0]), format: "float32", sampleRate: 48000, channelCount: 1 }, 0).sequence === 0);
  add("reject-out-of-order", (() => { try { validatePcmEnvelope({ sequence: 2, data: new Float32Array([0]), format: "float32", sampleRate: 48000, channelCount: 1 }, 0); return false; } catch (e) { return e.code === "PcmSequenceError"; } })());
  add("reject-float-nan", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([NaN]), format: "float32", sampleRate: 48000, channelCount: 1 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-float-range", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([1.1]), format: "float32", sampleRate: 48000, channelCount: 1 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-invalid-format", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([0]), format: "pcm24", sampleRate: 48000, channelCount: 1 }, 0); return false; } catch (e) { return e instanceof TypeError; } })());
  add("reject-invalid-rate", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([0]), format: "float32", sampleRate: 1000, channelCount: 1 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-invalid-channel", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([0]), format: "float32", sampleRate: 48000, channelCount: 3 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-partial-frame", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array([0, 1, 2]), format: "float32", sampleRate: 48000, channelCount: 2 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("reject-overlong-chunk", (() => { try { validatePcmEnvelope({ sequence: 0, data: new Float32Array(48000 * 6), format: "float32", sampleRate: 48000, channelCount: 1 }, 0); return false; } catch (e) { return e instanceof RangeError; } })());
  add("bridge-interface-supported", (() => {
    try {
      return normalizeStreamBridge({ startPcmStream() {}, pushPcmChunk() {}, endPcmStream() {}, stopPcmStream() {}, getPcmStreamState() {} }).source === "orchestrator-host-contract";
    } catch (_) { return false; }
  })());
  add("invalid-stream-rejected", (() => { try { normalizeStreamBridge({ pushChunk() {} }); return false; } catch (e) { return e instanceof TypeError; } })());
  add("invalid-engine-rejected", (() => { try { validateEngine({}); return false; } catch (e) { return e instanceof TypeError; } })());
  add("phoneme-compile-integration", compilePhonemes("का").summary.unknownCount === 0);
  add("score-compile-integration", compileSingingScore(compilePhonemes("का")).notes.length === 1);
  add("non-string-compile-guard", (() => { try { compilePhonemes(null); return false; } catch (e) { return e instanceof TypeError; } })());
  add("empty-score-detected", compileSingingScore(compilePhonemes("्")).notes.length === 0);
  add("status-shape", producer.getStatus().phase === "idle" && producer.getStatus().active === false);
  add("no-reference-audio-input", producer.getDiagnostics().forwardsModelPcmOnly === true);
  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({
    module: "pcm-producer", version: PCM_PRODUCER_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED", total: checks.length,
    passed, failed: checks.length - passed, checks: Object.freeze(checks)
  });
}

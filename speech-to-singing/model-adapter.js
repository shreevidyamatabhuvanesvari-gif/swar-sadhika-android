/* Swar-Sadhika — same-origin ONNX model adapter for Local SVS Engine.
 * Version 0.1.0. Verifies local model artifacts, creates ONNX sessions and delegates
 * architecture-specific phoneme/acoustic/vocoder inference to a local graph adapter.
 * No model weights, remote inference, user voice recording or synthetic PCM are bundled here.
 */
import { LOCAL_SVS_ADAPTER_KIND } from "./local-svs-engine.js";
export const MODEL_ADAPTER_VERSION = "0.1.0";
const MODEL_DIR = "speech-to-singing/models/";
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const PROVIDERS = new Set(["wasm", "webgpu"]);

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function error(message, name = "Error", code = name) {
  const result = new Error(String(message)); result.name = name; result.code = code; return result;
}
function messageOf(value) {
  return value && typeof value.message === "string" && value.message.trim() ? value.message.trim() : "Unknown error";
}
function assertRuntime(runtime) {
  if (!plain(runtime) || !plain(runtime.InferenceSession) ||
      typeof runtime.InferenceSession.create !== "function" || typeof runtime.Tensor !== "function") {
    throw new TypeError("ONNX Runtime Web compatible InferenceSession.create() और Tensor आवश्यक हैं।");
  }
  return runtime;
}
function assertGraphAdapter(graph) {
  if (!plain(graph) || typeof graph.getSessionSpecs !== "function" || typeof graph.synthesize !== "function") {
    throw new TypeError("Local graph adapter में getSessionSpecs() और synthesize() आवश्यक हैं।");
  }
  return graph;
}
function makeBaseUrl(value, URLCtor) {
  if (typeof URLCtor !== "function") throw new TypeError("Browser URL constructor उपलब्ध नहीं है।");
  if (typeof value !== "string" || !value.trim()) throw new TypeError("assetBaseUrl में GitHub Pages app-root URL आवश्यक है।");
  const url = new URLCtor(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError("assetBaseUrl एक HTTP(S) URL होना चाहिए; credentials, query और hash अनुमत नहीं हैं।");
  }
  if (!url.pathname.endsWith("/")) throw new TypeError("assetBaseUrl के अंत में / होना चाहिए।");
  return url;
}
function validateManifest(manifest) {
  if (!plain(manifest) || manifest.task !== "singing-voice-synthesis" ||
      manifest.modelDirectory !== MODEL_DIR || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new TypeError("Validated local singing-voice-synthesis manifest आवश्यक है।");
  }
  const ids = new Set();
  for (const item of manifest.artifacts) {
    const assetPath = String(item && item.path || "");
    if (!plain(item) || !item.id || ids.has(item.id) || !assetPath.startsWith(MODEL_DIR) ||
        assetPath.includes("..") || assetPath.includes("%") || assetPath.includes("\\") ||
        assetPath.includes(":") || assetPath.startsWith("/") || assetPath.includes("?") || assetPath.includes("#") ||
        !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0 ||
        !/^[a-f0-9]{64}$/u.test(String(item.sha256 || ""))) {
      throw new TypeError("Model artifact की unique id, local path, byte size और SHA-256 checksum अमान्य है।");
    }
    ids.add(item.id);
  }
}
function validateSessionSpecs(specs, manifest) {
  if (!Array.isArray(specs) || !specs.length) throw new TypeError("Graph adapter ने ONNX session specs नहीं दिए।");
  const artifacts = new Map(manifest.artifacts.map(item => [item.id, item]));
  const sessionIds = new Set();
  return specs.map((spec, index) => {
    if (!plain(spec)) throw new TypeError("Session spec " + index + " plain object होना चाहिए।");
    const id = String(spec.id || "").trim(), artifactId = String(spec.artifactId || "").trim();
    if (!id || sessionIds.has(id)) throw new TypeError("हर ONNX session का unique id आवश्यक है।");
    sessionIds.add(id);
    const artifact = artifacts.get(artifactId);
    if (!artifact) throw new RangeError("Session artifactId manifest में उपलब्ध नहीं: " + artifactId);
    if (spec.sessionOptions != null && !plain(spec.sessionOptions)) throw new TypeError("sessionOptions plain object होना चाहिए।");
    return Object.freeze({ id, artifactId, artifact, sessionOptions: Object.freeze({ ...(spec.sessionOptions || {}) }) });
  });
}
function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function releaseSessions(sessions) {
  await Promise.all([...sessions.values()].map(session => {
    if (!session || typeof session.release !== "function") return Promise.resolve();
    try { return Promise.resolve(session.release()).catch(() => {}); }
    catch (_) { return Promise.resolve(); }
  }));
}

/**
 * Factory for the adapter contract required by createLocalSVSEngine().
 * graphAdapter performs model-specific tensor preparation, acoustic inference,
 * vocoder inference and decoding to PCM; this module deliberately never guesses
 * tensor names, phoneme IDs or a model's acoustic/vocoder layout.
 */
export function createModelAdapter(options = {}) {
  if (!plain(options)) throw new TypeError("Model Adapter options plain object होना चाहिए।");
  const runtime = assertRuntime(options.runtime);
  const graphAdapter = assertGraphAdapter(options.graphAdapter);
  const URLCtor = options.URLCtor || (typeof URL === "function" ? URL : null);
  const baseUrl = makeBaseUrl(options.assetBaseUrl, URLCtor);
  const fetchImpl = options.fetchImpl || (typeof globalThis !== "undefined" ? globalThis.fetch : null);
  const cryptoImpl = options.cryptoImpl || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
  if (typeof fetchImpl !== "function") throw new TypeError("Same-origin model files के लिए fetch() आवश्यक है।");
  if (!cryptoImpl || !cryptoImpl.subtle || typeof cryptoImpl.subtle.digest !== "function") {
    throw new TypeError("Model SHA-256 जाँच के लिए Web Crypto subtle.digest() आवश्यक है।");
  }
  const maxTotalBytes = options.maxTotalArtifactBytes == null ? DEFAULT_MAX_BYTES : Number(options.maxTotalArtifactBytes);
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1024 || maxTotalBytes > 2 * 1024 * 1024 * 1024) {
    throw new RangeError("maxTotalArtifactBytes 1 KiB से 2 GiB के बीच होना चाहिए।");
  }

  let phase = "idle", initialized = false, active = false, disposed = false;
  let generation = 0, lastError = null, modelId = null, modelVersion = null;
  let executionProvider = null, sessions = new Map(), buffers = new Map();
  let initialization = null, activeCancel = null, progressState = null;

  function status() {
    return Object.freeze({
      version: MODEL_ADAPTER_VERSION, kind: LOCAL_SVS_ADAPTER_KIND, phase,
      ready: initialized && !disposed, active, disposed, modelId, modelVersion,
      executionProvider, loadedSessionCount: sessions.size, verifiedArtifactCount: buffers.size,
      lastError: lastError ? Object.freeze({
        name: lastError.name || "Error", code: lastError.code || lastError.name || "ERROR",
        message: messageOf(lastError)
      }) : null
    });
  }
  function report(callback, value) {
    progressState = Object.freeze({
      phase: String(value.phase || phase), progress: value.progress == null ? null : Number(value.progress),
      message: String(value.message || "")
    });
    if (typeof callback === "function") { try { callback(progressState); } catch (_) {} }
  }
  function ensureCurrent(token) {
    if (disposed) throw error("Model Adapter dispose हो चुका है।", "DisposedError");
    if (token !== generation) throw error("Model operation cancel हो गया।", "AbortError");
  }
  async function fetchArtifact(artifact, token) {
    ensureCurrent(token);
    const url = new URLCtor(artifact.path, baseUrl);
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname + MODEL_DIR) ||
        url.username || url.password || url.search || url.hash) {
      throw error("Model artifact URL same-origin models folder के बाहर है।", "UnsafeModelUrlError");
    }
    const response = await fetchImpl(url.href, {
      method: "GET", credentials: "same-origin", cache: "default", redirect: "error"
    });
    ensureCurrent(token);
    if (!response || response.ok !== true || typeof response.arrayBuffer !== "function") {
      throw error("Local model artifact प्राप्त नहीं हुआ: " + artifact.id, "ModelArtifactFetchError");
    }
    if (response.url) {
      const finalUrl = new URLCtor(response.url, url);
      if (finalUrl.origin !== baseUrl.origin || finalUrl.pathname !== url.pathname) {
        throw error("Model artifact redirect अस्वीकार किया गया।", "UnsafeModelRedirectError");
      }
    }
    const buffer = await response.arrayBuffer();
    ensureCurrent(token);
    if (Object.prototype.toString.call(buffer) !== "[object ArrayBuffer]" || buffer.byteLength !== artifact.sizeBytes) {
      throw error("Model artifact byte size manifest से मेल नहीं खाता: " + artifact.id, "ModelArtifactSizeError");
    }
    const digest = await cryptoImpl.subtle.digest("SHA-256", buffer);
    ensureCurrent(token);
    if (bytesToHex(digest) !== artifact.sha256) {
      throw error("Model artifact SHA-256 checksum मेल नहीं खाता: " + artifact.id, "ModelArtifactChecksumError");
    }
    return buffer;
  }

  async function initialize(context = {}) {
    if (disposed) throw error("Model Adapter dispose हो चुका है।", "DisposedError");
    if (!plain(context)) throw new TypeError("initialize() context plain object होना चाहिए।");
    if (initialized) return Object.freeze({
      ready: true, modelId, executionProvider, artifactsVerified: true,
      runtimeVersion: runtime.version || null
    });
    if (initialization) return initialization;
    const manifest = context.modelManifest;
    validateManifest(manifest);
    if (context.remoteFetchAllowed !== false || context.referenceAudioAllowed !== false) {
      throw error("Remote fetch और reference-audio दोनों बंद होना आवश्यक है।", "ModelPolicyError");
    }
    const selectedProvider = String(context.executionProvider || "");
    if (!PROVIDERS.has(selectedProvider) || !Array.isArray(manifest.executionProviders) ||
        !manifest.executionProviders.includes(selectedProvider)) {
      throw new RangeError("Execution provider model manifest में उपलब्ध नहीं है।");
    }
    const specs = validateSessionSpecs(graphAdapter.getSessionSpecs({ modelManifest: manifest, runtime }), manifest);
    const totalBytes = manifest.artifacts.reduce((sum, item) => sum + item.sizeBytes, 0);
    if (!Number.isSafeInteger(totalBytes) || totalBytes > maxTotalBytes) throw new RangeError("Model files configured memory limit से बड़े हैं।");
    if (typeof graphAdapter.validateModel === "function") {
      const valid = await graphAdapter.validateModel({ modelManifest: manifest, runtime });
      if (valid !== true) throw error("Graph adapter ने इस model architecture को स्वीकार नहीं किया।", "ModelArchitectureMismatchError");
    }

    const token = ++generation;
    phase = "loading";
    lastError = null;
    initialization = Promise.resolve().then(async () => {
      const candidateBuffers = new Map(), candidateSessions = new Map();
      try {
        for (let i = 0; i < manifest.artifacts.length; i++) {
          ensureCurrent(token);
          const artifact = manifest.artifacts[i];
          report(context.onProgress, {
            phase: "verifying-model-assets", progress: 0.45 * i / manifest.artifacts.length,
            message: "स्थानीय model checksum जाँचा जा रहा है: " + artifact.id
          });
          candidateBuffers.set(artifact.id, await fetchArtifact(artifact, token));
        }
        for (let i = 0; i < specs.length; i++) {
          ensureCurrent(token);
          const spec = specs[i];
          report(context.onProgress, {
            phase: "loading-onnx-sessions", progress: 0.45 + 0.5 * i / specs.length,
            message: "ONNX model session लोड हो रहा है: " + spec.id
          });
          const sessionOptions = { ...spec.sessionOptions, executionProviders: [selectedProvider] };
          const session = await runtime.InferenceSession.create(candidateBuffers.get(spec.artifactId), sessionOptions);
          ensureCurrent(token);
          if (!session || typeof session.run !== "function" || typeof session.release !== "function") {
            throw error("ONNX Runtime ने valid session नहीं लौटाया: " + spec.id, "RuntimeContractError");
          }
          candidateSessions.set(spec.id, session);
        }
        if (typeof graphAdapter.validateSessions === "function") {
          const valid = await graphAdapter.validateSessions({ modelManifest: manifest, sessions: candidateSessions, runtime });
          if (valid !== true) throw error("Loaded sessions model architecture से मेल नहीं खाते।", "ModelSessionMismatchError");
        }
        ensureCurrent(token);
        buffers = candidateBuffers; sessions = candidateSessions;
        modelId = manifest.modelId; modelVersion = manifest.version;
        executionProvider = selectedProvider; initialized = true; phase = "ready";
        report(context.onProgress, { phase: "ready", progress: 1, message: "स्थानीय ONNX model sessions तैयार हैं।" });
        return Object.freeze({
          ready: true, modelId, executionProvider, artifactsVerified: true,
          runtimeVersion: runtime.version || null
        });
      } catch (errorValue) {
        await releaseSessions(candidateSessions);
        candidateBuffers.clear();
        phase = disposed ? "disposed" : "failed";
        lastError = errorValue;
        throw errorValue;
      } finally { initialization = null; }
    });
    return initialization;
  }

  async function synthesize(context = {}) {
    if (disposed) throw error("Model Adapter dispose हो चुका है।", "DisposedError");
    if (!plain(context)) throw new TypeError("synthesize() context plain object होना चाहिए।");
    if (!initialized || !sessions.size) throw error("पहले verified model sessions initialize करें।", "ModelNotReadyError");
    if (active) throw error("एक model inference पहले से चल रहा है।", "ModelBusyError");
    if (typeof context.onPcmChunk !== "function") throw new TypeError("Real PCM handoff के लिए onPcmChunk callback आवश्यक है।");
    if (context.referenceAudio != null || context.promptAudio != null || context.referenceAudioProvided === true) {
      throw error("User reference/prompt audio इस adapter में स्वीकार नहीं है।", "ReferenceAudioNotSupportedError");
    }
    if (context.executionProvider !== executionProvider) throw error("Execution provider initialized model से मेल नहीं खाता।", "RuntimeContractError");
    const token = ++generation;
    let emitted = 0;
    active = true; phase = "synthesizing"; lastError = null;
    const cancellation = Object.freeze({
      isCancelled: () => disposed || token !== generation,
      throwIfCancelled: () => { if (disposed || token !== generation) throw error("Model inference cancel हो गया।", "AbortError"); }
    });
    activeCancel = async reason => {
      generation += 1;
      if (typeof graphAdapter.cancel === "function") await graphAdapter.cancel({ reason: String(reason), sessions });
    };
    const onPcmChunk = async chunk => {
      cancellation.throwIfCancelled();
      if (!plain(chunk)) throw new TypeError("Architecture adapter का PCM chunk object होना चाहिए।");
      if (chunk.sequence != null && Number(chunk.sequence) !== emitted) throw error("Architecture adapter ने PCM chunks गलत क्रम में दिए।", "PcmSequenceError");
      const result = await context.onPcmChunk({
        data: chunk.data, format: chunk.format, sampleRate: chunk.sampleRate,
        channelCount: chunk.channelCount, frames: chunk.frames,
        durationSeconds: chunk.durationSeconds, sequence: emitted
      });
      cancellation.throwIfCancelled();
      emitted += 1;
      return result;
    };
    try {
      report(context.onProgress, { phase: "model-inference", progress: 0, message: "Local acoustic model और vocoder inference शुरू हो रहा है।" });
      const result = await graphAdapter.synthesize({
        input: context.input, modelManifest: context.modelManifest, runtime,
        sessions, artifactBuffers: buffers, executionProvider,
        cancellation, onPcmChunk,
        onProgress: value => { cancellation.throwIfCancelled(); report(context.onProgress, value || {}); },
        conditioning: Object.freeze({ referenceAudioProvided: false, promptAudioProvided: false })
      });
      cancellation.throwIfCancelled();
      if (!plain(result) || result.completed !== true) {
        throw error(result && result.message ? result.message : "Graph adapter ने synthesis completion की पुष्टि नहीं की।", "SynthesisIncompleteError");
      }
      if (!emitted) throw error("Model ने कोई PCM chunk उत्पन्न नहीं किया।", "EmptyPcmOutputError");
      phase = "ready";
      report(context.onProgress, { phase: "completed", progress: 1, message: "Local ONNX SVS inference पूरा हुआ।" });
      return Object.freeze({
        completed: true, sampleRate: result.sampleRate || context.modelManifest.sampleRate,
        chunkCount: emitted, modelId, modelVersion, executionProvider
      });
    } catch (errorValue) {
      lastError = errorValue;
      phase = disposed ? "disposed" : errorValue && errorValue.name === "AbortError" ? "ready" : "failed";
      throw errorValue;
    } finally {
      active = false; activeCancel = null;
      if (!disposed && phase === "synthesizing") phase = "ready";
    }
  }
  async function cancel(reason = "Model inference उपयोगकर्ता द्वारा रोका गया।") {
    if (!active) return false;
    const handler = activeCancel;
    try { if (handler) await handler(reason); } catch (errorValue) { lastError = errorValue; }
    active = false; if (!disposed) phase = "ready";
    return true;
  }
  async function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; phase = "disposed";
    const cancelHandler = activeCancel;
    if (cancelHandler) { try { await cancelHandler("Model Adapter dispose किया जा रहा है।"); } catch (errorValue) { lastError = errorValue; } }
    active = false;
    const oldSessions = sessions;
    sessions = new Map(); buffers = new Map();
    await releaseSessions(oldSessions);
    if (typeof graphAdapter.dispose === "function") {
      try { await graphAdapter.dispose(); } catch (errorValue) { lastError = errorValue; }
    }
    initialized = false;
  }
  function diagnostics() {
    return Object.freeze({
      ...status(), runtime: "ONNX Runtime Web compatible API",
      graphAdapterId: graphAdapter.id || null, sameOriginAssetsOnly: true,
      sha256Verified: true, remoteInferenceAllowed: false, referenceAudioSupported: false,
      modelWeightsBundledInThisModule: false,
      architectureSpecificSynthesisProvidedBy: "local graph adapter"
    });
  }
  return Object.freeze({
    kind: LOCAL_SVS_ADAPTER_KIND, version: MODEL_ADAPTER_VERSION,
    initialize, synthesize, cancel, dispose, getStatus: status, getDiagnostics: diagnostics
  });
}

export function selfTest() {
  const checks = [];
  const add = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  add("version-defined", MODEL_ADAPTER_VERSION === "0.1.0");
  add("adapter-kind-matches-local-svs", LOCAL_SVS_ADAPTER_KIND === "swar-sadhika-local-svs-adapter");
  add("runtime-contract-required", (() => { try { assertRuntime({}); return false; } catch (e) { return e instanceof TypeError; } })());
  add("graph-adapter-contract-required", (() => { try { assertGraphAdapter({}); return false; } catch (e) { return e instanceof TypeError; } })());
  add("base-url-must-be-app-root", (() => { try { makeBaseUrl("https://example.org/app", URL); return false; } catch (e) { return e instanceof TypeError; } })());
  add("base-url-rejects-query", (() => { try { makeBaseUrl("https://example.org/app/?x=1", URL); return false; } catch (e) { return e instanceof TypeError; } })());
  add("manifest-requires-local-task", (() => { try { validateManifest({ task: "tts" }); return false; } catch (e) { return e instanceof TypeError; } })());
  add("manifest-rejects-traversal", (() => {
    try { validateManifest({ task: "singing-voice-synthesis", modelDirectory: MODEL_DIR, artifacts: [{ id: "a", path: MODEL_DIR + "../a", sizeBytes: 1, sha256: "a".repeat(64) }] }); return false; }
    catch (e) { return e instanceof TypeError; }
  })());
  add("manifest-requires-sha256", (() => {
    try { validateManifest({ task: "singing-voice-synthesis", modelDirectory: MODEL_DIR, artifacts: [{ id: "a", path: MODEL_DIR + "a.onnx", sizeBytes: 1, sha256: "bad" }] }); return false; }
    catch (e) { return e instanceof TypeError; }
  })());
  add("session-spec-requires-manifest-artifact", (() => {
    try { validateSessionSpecs([{ id: "acoustic", artifactId: "missing" }], { artifacts: [] }); return false; }
    catch (e) { return e instanceof RangeError; }
  })());
  add("session-spec-rejects-duplicate-id", (() => {
    const manifest = { artifacts: [{ id: "a", path: MODEL_DIR + "a.onnx", sizeBytes: 1, sha256: "a".repeat(64) }] };
    try { validateSessionSpecs([{ id: "s", artifactId: "a" }, { id: "s", artifactId: "a" }], manifest); return false; }
    catch (e) { return e instanceof TypeError; }
  })());
  add("diagnostics-disclose-no-weights", (() => {
    try {
      const adapter = createModelAdapter({
        runtime: { Tensor: function Tensor() {}, InferenceSession: { create: async () => ({ run() {}, release: async () => {} }) } },
        graphAdapter: { getSessionSpecs: () => [{ id: "s", artifactId: "m" }], synthesize: async () => ({ completed: true }) },
        assetBaseUrl: "https://example.org/app/", fetchImpl: async () => ({ ok: false }),
        cryptoImpl: { subtle: { digest: async () => new ArrayBuffer(32) } }
      });
      return adapter.getDiagnostics().modelWeightsBundledInThisModule === false;
    } catch (_) { return false; }
  })());
  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({
    module: "model-adapter", version: MODEL_ADAPTER_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED",
    total: checks.length, passed, failed: checks.length - passed, checks: Object.freeze(checks)
  });
}

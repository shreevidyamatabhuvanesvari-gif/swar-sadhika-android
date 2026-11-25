/* Swar-Sadhika Nano Brain — Avatar Adapter Part 2.
 * Connects local Avatar TTS and the local Singing Adapter to a renderer surface.
 *
 * page-avatar.js currently keeps its facial mesh state private. This adapter
 * therefore accepts an explicit avatarSurface.renderFrame(frame) bridge and
 * also emits "swar-sadhika:avatar-frame" CustomEvents. A renderer must consume
 * one of these interfaces before this adapter can visibly animate that page.
 *
 * This module does not claim full 3D reconstruction, real body tracking, neural
 * singing, or exact phoneme synchronization where the source API only supplies
 * word/syllable timing.
 */
import {
  createAvatarTtsEngine,
  SOFT_YOUNG_FEMININE_PRESET
} from "../tts/avatar-tts-engine.js";

export const BRAIN_AVATAR_ADAPTER_VERSION_PART2 = "1.0.0";
export const BRAIN_AVATAR_ADAPTER_ID_PART2 = "brain-avatar";
export const BRAIN_AVATAR_FRAME_EVENT_PART2 = "swar-sadhika:avatar-frame";

const EVENT_NAMES = new Set([
  "statechange", "frame", "speechstart", "speechend", "speechcancel",
  "speecherror", "viseme", "warning", "error", "voiceschanged"
]);
const EXPRESSION_PRESETS = new Set(["gentle", "reverent", "focused", "neutral"]);
const GAZE_PRESETS = new Set(["auto", "center", "left", "right"]);
const MAX_TEXT_CODE_POINTS = 20000;
const FRAME_INTERVAL_MS = 1000 / 24;
const DEFAULT_MOTION_INTENSITY = 0.35;

export class BrainAvatarAdapterErrorPart2 extends Error {
  constructor(message, code = "BRAIN_AVATAR_ERROR", details = null, cause = null) {
    super(message);
    this.name = "BrainAvatarAdapterErrorPart2";
    this.code = code;
    if (details) this.details = details;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, details = null, cause = null) {
  throw new BrainAvatarAdapterErrorPart2(message, code, details, cause);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeText(value) {
  if (typeof value !== "string" || !value.trim()) fail("अवतार वाचन के लिए पाठ आवश्यक है।", "TEXT_REQUIRED");
  const text = value.normalize("NFC").trim();
  if (Array.from(text).length > MAX_TEXT_CODE_POINTS) fail("अवतार पाठ निर्धारित सीमा से बड़ा है।", "TEXT_TOO_LONG");
  return text;
}

function safeError(error, fallbackCode = "AVATAR_OPERATION_FAILED") {
  return Object.freeze({
    code: error && typeof error.code === "string" ? error.code : fallbackCode,
    message: error && typeof error.message === "string" ? error.message : String(error || fallbackCode)
  });
}

function getNow(host) {
  try {
    if (host && host.performance && typeof host.performance.now === "function") return host.performance.now();
  } catch (_) {}
  return Date.now();
}

function normalizeGaze(value) {
  const mode = String(value || "auto").toLowerCase();
  return GAZE_PRESETS.has(mode) ? mode : "auto";
}

function normalizeExpression(value) {
  const expression = String(value || "gentle").toLowerCase();
  return EXPRESSION_PRESETS.has(expression) ? expression : "gentle";
}

function validateAvatarSurface(surface) {
  if (surface == null) return null;
  if (typeof surface !== "object" || Array.isArray(surface) || typeof surface.renderFrame !== "function") {
    fail("Avatar Surface में renderFrame(frame) आवश्यक है।", "AVATAR_SURFACE_CONTRACT_INVALID");
  }
  return surface;
}

function extractGraphemeAt(text, utf16Index) {
  if (typeof text !== "string" || !text.length) return "";
  const index = Math.max(0, Math.min(text.length - 1, Number(utf16Index) || 0));
  const tail = Array.from(text.slice(index));
  if (!tail.length) return "";
  let output = tail[0];
  const combining = /^[\u0900-\u0903\u093A-\u094D\u0951-\u0957\u1CD0-\u1CFF\uA8E0-\uA8FF]$/u;
  for (let cursor = 1; cursor < tail.length && cursor < 7; cursor += 1) {
    const char = tail[cursor];
    const previous = Array.from(output).slice(-1)[0] || "";
    if (combining.test(char) || (previous === "्" && /^[क-हक़-य़]$/u.test(char))) output += char;
    else break;
  }
  return output;
}

/** Conservative Devanagari viseme mapping; this is not a full articulatory model. */
export function mapDevanagariVisemePart2(value) {
  const grapheme = String(value || "").normalize("NFC");
  if (!grapheme || /^[\s।॥,;:!?]+$/u.test(grapheme)) {
    return Object.freeze({ viseme: "rest", openness: 0.02, rounded: false, confidence: "rule-based" });
  }
  if (/[पफबभम]/u.test(grapheme)) {
    return Object.freeze({ viseme: "closed", openness: 0.035, rounded: false, confidence: "rule-based" });
  }
  if (/[उऊुूओऔोौ]/u.test(grapheme)) {
    return Object.freeze({ viseme: "rounded", openness: 0.29, rounded: true, confidence: "rule-based" });
  }
  if (/[इईिीएेऐै]/u.test(grapheme)) {
    return Object.freeze({ viseme: "wide", openness: 0.25, rounded: false, confidence: "rule-based" });
  }
  if (/[आा]/u.test(grapheme)) {
    return Object.freeze({ viseme: "open", openness: 0.78, rounded: false, confidence: "rule-based" });
  }
  if (/[अऋॠऌॡ]/u.test(grapheme)) {
    return Object.freeze({ viseme: "open", openness: 0.46, rounded: false, confidence: "rule-based" });
  }
  if (/[ंःँ]/u.test(grapheme)) {
    return Object.freeze({ viseme: "nasal", openness: 0.27, rounded: false, confidence: "rule-based" });
  }
  if (/[कखगघङचछजझञटठडढणतथदधनयरलवशषसह]/u.test(grapheme)) {
    return Object.freeze({ viseme: "consonant", openness: 0.17, rounded: false, confidence: "rule-based" });
  }
  return Object.freeze({ viseme: "neutral", openness: 0.20, rounded: false, confidence: "fallback" });
}

function summarizeVoice(item) {
  return Object.freeze({
    key: String(item.key || ""),
    name: String(item.name || "अज्ञात आवाज़"),
    language: String(item.lang || ""),
    local: item.locality === "local" || item.local === true,
    femaleNameHinted: item.femaleNameHinted === true,
    genderEvidence: item.femaleNameHinted === true ? "name-hint-unverified" : "unverified",
    selectable: item.selectable !== false
  });
}

function deepFreezeFrame(frame) {
  Object.freeze(frame.mouth);
  Object.freeze(frame.face.gaze);
  Object.freeze(frame.face);
  Object.freeze(frame.body);
  Object.freeze(frame.sync);
  return Object.freeze(frame);
}

export function createBrainAvatarAdapterPart2(options = {}) {
  if (!isPlainObject(options)) fail("Avatar Adapter options साधारण Object होना चाहिए।", "INVALID_OPTIONS");
  const host = options.target || globalThis;
  const ownsTtsEngine = !options.avatarTtsEngine;
  const ttsEngine = options.avatarTtsEngine || createAvatarTtsEngine({ target: host });
  const ttsMethods = ["initialize", "refreshVoices", "getInventory", "getStatus", "speak", "on", "cancel", "pause", "resume", "dispose"];
  const missingTts = ttsMethods.filter(name => typeof ttsEngine[name] !== "function");
  if (missingTts.length) fail("Avatar TTS Engine contract अधूरा है: " + missingTts.join(", "), "AVATAR_TTS_CONTRACT_INVALID", { missing: missingTts });

  const singingAdapter = options.singingAdapter || null;
  if (singingAdapter) {
    const missing = ["prepare", "sing", "pause", "resume", "stop"].filter(name => typeof singingAdapter[name] !== "function");
    if (missing.length) fail("Speech/Singing Adapter contract अधूरा है: " + missing.join(", "), "SINGING_ADAPTER_CONTRACT_INVALID", { missing });
  }

  const listeners = new Map();
  const unsubscribe = [];
  let surface = validateAvatarSurface(options.avatarSurface || null);
  let state = "new";
  let inventory = null;
  let initializePromise = null;
  let activeRun = null;
  let disposed = false;
  let visible = true;
  let rafId = 0;
  let lastFrameAt = 0;
  let lastError = null;
  let lastResult = null;
  let voiceKey = "";
  let gazeMode = normalizeGaze(options.gazeMode);
  let expression = normalizeExpression(options.expression);
  let motionIntensity = clamp(options.motionIntensity, 0, 1, DEFAULT_MOTION_INTENSITY);
  let mouthCurrent = 0.02;
  let mouthTarget = 0.02;
  let currentViseme = "rest";
  let currentGrapheme = "";
  let currentPhoneme = "";
  let currentCharIndex = 0;
  let lastBoundaryAt = 0;
  let pausedAt = 0;
  let pausedDuration = 0;

  function ensureUsable() {
    if (disposed) fail("Avatar Adapter बंद हो चुका है।", "ADAPTER_DISPOSED");
  }

  function emit(type, detail = {}) {
    if (!EVENT_NAMES.has(type)) return;
    const callbacks = listeners.get(type);
    if (!callbacks) return;
    const event = Object.freeze({
      type,
      adapterVersion: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
      state,
      timestamp: getNow(host),
      ...detail
    });
    for (const callback of [...callbacks]) {
      try { callback(event); } catch (_) {}
    }
  }

  function setState(next, detail = {}) {
    state = next;
    emit("statechange", detail);
  }

  function dispatchFrameEvent(frame) {
    try {
      if (host && typeof host.dispatchEvent === "function" && typeof host.CustomEvent === "function") {
        host.dispatchEvent(new host.CustomEvent(BRAIN_AVATAR_FRAME_EVENT_PART2, { detail: frame }));
      } else if (host && host.document && typeof host.document.createEvent === "function" && typeof host.dispatchEvent === "function") {
        const event = host.document.createEvent("CustomEvent");
        event.initCustomEvent(BRAIN_AVATAR_FRAME_EVENT_PART2, false, false, frame);
        host.dispatchEvent(event);
      }
    } catch (error) {
      emit("warning", { code: "AVATAR_FRAME_EVENT_DISPATCH_FAILED", message: error && error.message || String(error) });
    }
  }

  function publishFrame(frame) {
    const immutable = deepFreezeFrame(frame);
    if (surface) {
      try { surface.renderFrame(immutable); }
      catch (error) {
        emit("warning", { code: "AVATAR_SURFACE_RENDER_FAILED", message: error && error.message || String(error) });
      }
    }
    dispatchFrameEvent(immutable);
    emit("frame", { frame: immutable });
    return immutable;
  }

  function getVoices() {
    ensureUsable();
    const selectable = inventory && Array.isArray(inventory.selectable) ? inventory.selectable : [];
    return Object.freeze(selectable.map(summarizeVoice));
  }

  function chooseVoice(requestedKey) {
    const selectable = inventory && Array.isArray(inventory.selectable) ? inventory.selectable : [];
    if (!selectable.length) fail(
      "इस डिवाइस पर स्थानीय Hindi/Sanskrit TTS आवाज़ उपलब्ध नहीं है। Android में स्थानीय आवाज़ स्थापित करके सूची ताज़ा करें।",
      "LOCAL_AVATAR_VOICE_UNAVAILABLE"
    );
    const requested = String(requestedKey || voiceKey || "");
    let selected = requested ? selectable.find(item => item.key === requested) : null;
    if (requested && !selected) fail("चुनी हुई Voice वर्तमान स्थानीय आवाज़ सूची में उपलब्ध नहीं है।", "AVATAR_VOICE_NOT_FOUND");
    if (!selected) selected = selectable.find(item => item.femaleNameHinted === true) ||
      selectable.find(item => item.default === true) || selectable[0];
    voiceKey = selected.key;
    return selected;
  }

  function activeElapsed(run, now) {
    return run ? Math.max(0, now - run.startedAt - pausedDuration) : 0;
  }

  function markPaused(run) {
    if (!run || run.paused) return;
    const now = getNow(host);
    run.elapsedBeforePause = activeElapsed(run, now);
    run.paused = true;
    pausedAt = now;
    mouthTarget = 0.02;
    emitImmediateFrame();
  }

  function markResumed(run) {
    if (!run || !run.paused) return;
    const now = getNow(host);
    if (pausedAt) pausedDuration += now - pausedAt;
    pausedAt = 0;
    run.paused = false;
    run.startedAt = now - (Number(run.elapsedBeforePause) || 0) - pausedDuration;
    mouthTarget = 0.02;
    startFrameLoop();
    emitImmediateFrame();
  }

  function makeFaceState(now) {
    const run = activeRun;
    const speaking = Boolean(run && !run.paused);
    const seconds = (speaking ? activeElapsed(run, now) : now) / 1000;
    const gazeX = gazeMode === "left" ? -0.75 :
      gazeMode === "right" ? 0.75 :
      gazeMode === "center" ? 0 : Math.sin(seconds * 0.37) * 0.34;
    const gazeY = gazeMode === "center" ? 0 : Math.sin(seconds * 0.21) * 0.09;
    const blinkPhase = seconds % 4.2;
    const blink = blinkPhase < 0.18 ? Math.sin(Math.PI * blinkPhase / 0.18) : 0;
    return {
      speaking,
      elapsedMs: seconds * 1000,
      gaze: Object.freeze({ x: gazeX, y: gazeY, mode: gazeMode }),
      blink,
      expression
    };
  }

  function timelineCue(run, now) {
    if (!run || !Array.isArray(run.timeline) || !run.timeline.length || run.paused) return null;
    const elapsed = activeElapsed(run, now) / 1000;
    let cursor = 0;
    for (const item of run.timeline) {
      const duration = item.type === "pause"
        ? clamp(item.durationSeconds, 0, 3, 0)
        : clamp(item.durationSeconds, 0.08, 4, 0.3);
      if (elapsed < cursor + duration) {
        return item.type === "pause" ? null : {
          grapheme: String(item.grapheme || ""),
          phoneme: item.phonemes && item.phonemes.length ? String(item.phonemes[0].symbol || "") : "",
          index: Number(item.index) || 0
        };
      }
      cursor += duration;
    }
    return null;
  }

  function estimateSpeechCue(run, now) {
    if (!run || run.mode !== "speech" || run.paused || !run.text) return null;
    const chars = Array.from(run.text);
    if (!chars.length) return null;
    const elapsed = activeElapsed(run, now);
    const estimatedDuration = Math.max(650, chars.length * 92 / Math.max(0.55, run.rate || 1));
    const index = Math.min(chars.length - 1, Math.floor(elapsed / estimatedDuration * chars.length));
    return { grapheme: chars[Math.max(0, index)] || "", phoneme: "", index };
  }

  function updateCue(run, now) {
    if (!run || run.paused) {
      mouthTarget = 0.02;
      currentViseme = "rest";
      currentGrapheme = "";
      currentPhoneme = "";
      return;
    }
    if (run.mode === "singing") {
      const cue = timelineCue(run, now);
      if (!cue) {
        mouthTarget = 0.02;
        currentViseme = "rest";
        currentGrapheme = "";
        currentPhoneme = "";
        return;
      }
      const shape = mapDevanagariVisemePart2(cue.grapheme);
      mouthTarget = shape.openness;
      currentViseme = shape.viseme;
      currentGrapheme = cue.grapheme;
      currentPhoneme = cue.phoneme;
      currentCharIndex = cue.index;
      return;
    }
    if (run.mode === "speech" && !(lastBoundaryAt > 0 && now - lastBoundaryAt <= 650)) {
      const cue = estimateSpeechCue(run, now);
      if (!cue) return;
      const shape = mapDevanagariVisemePart2(cue.grapheme);
      mouthTarget = shape.openness;
      currentViseme = shape.viseme;
      currentGrapheme = cue.grapheme;
      currentPhoneme = "";
      currentCharIndex = cue.index;
      run.syncQuality = "time-estimate";
      run.syncConfidence = "low";
    }
  }

  function buildFrame(now) {
    const run = activeRun;
    const face = makeFaceState(now);
    updateCue(run, now);
    const smoothing = face.speaking ? 0.48 : 0.24;
    mouthCurrent += (mouthTarget - mouthCurrent) * smoothing;
    const intensity = motionIntensity * (face.speaking ? 1 : 0.42);
    const seconds = face.elapsedMs / 1000;
    return {
      version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
      active: face.speaking,
      paused: Boolean(run && run.paused),
      mode: run ? run.mode : "idle",
      timestamp: now,
      mouth: {
        viseme: face.speaking ? currentViseme : "rest",
        openness: clamp(mouthCurrent, 0, 1, 0.02),
        grapheme: currentGrapheme,
        phoneme: currentPhoneme,
        charIndex: currentCharIndex
      },
      face: { expression, gaze: face.gaze, blink: face.blink },
      body: {
        mode: "subtle-2.5d-photo-cues",
        posture: "upright",
        headSway: Math.sin(seconds * 0.72) * 0.010 * intensity,
        headNod: Math.sin(seconds * 1.15) * 0.006 * intensity,
        shoulderSway: Math.sin(seconds * 0.48) * 0.004 * intensity,
        fullBodyGesturesAvailable: false
      },
      sync: {
        source: run ? (run.mode === "singing" ? "singing-timeline" : "native-tts-boundary-or-estimate") : "idle",
        quality: run ? run.syncQuality : "idle",
        confidence: run ? run.syncConfidence : "none",
        exactPhonemeTiming: false
      }
    };
  }

  function stopFrameLoop() {
    if (!rafId) return;
    try { if (host && typeof host.cancelAnimationFrame === "function") host.cancelAnimationFrame(rafId); } catch (_) {}
    rafId = 0;
  }

  function scheduleFrame() {
    if (rafId || disposed || !visible) return;
    if (host && typeof host.requestAnimationFrame === "function") rafId = host.requestAnimationFrame(frameLoop);
  }

  function frameLoop(timestamp) {
    rafId = 0;
    if (disposed || !visible) return;
    const now = Number.isFinite(timestamp) ? timestamp : getNow(host);
    if (!lastFrameAt || now - lastFrameAt >= FRAME_INTERVAL_MS - 1) {
      lastFrameAt = now;
      publishFrame(buildFrame(now));
    }
    scheduleFrame();
  }

  function startFrameLoop() {
    if (visible && !disposed) scheduleFrame();
  }

  function emitImmediateFrame() {
    publishFrame(buildFrame(getNow(host)));
  }

  function beginRun(mode, text, settings = {}) {
    pausedDuration = 0;
    pausedAt = 0;
    mouthCurrent = 0.02;
    mouthTarget = 0.02;
    currentViseme = "rest";
    currentGrapheme = "";
    currentPhoneme = "";
    currentCharIndex = 0;
    lastBoundaryAt = 0;
    activeRun = {
      mode,
      text,
      rate: clamp(settings.rate, 0.65, 1.25, SOFT_YOUNG_FEMININE_PRESET.rate),
      voiceKey: settings.voiceKey || null,
      timeline: settings.timeline || null,
      startedAt: getNow(host),
      elapsedBeforePause: 0,
      paused: false,
      syncQuality: mode === "singing" ? "planned-syllable-timing" : "native-boundary",
      syncConfidence: mode === "singing" ? "estimated" : "event-dependent"
    };
    setState(mode === "singing" ? "singing" : "speaking", { mode });
    startFrameLoop();
    emitImmediateFrame();
  }

  function endRun(result, reason = "ended") {
    if (!activeRun) return;
    const prior = activeRun;
    activeRun = null;
    mouthTarget = 0.02;
    currentViseme = "rest";
    currentGrapheme = "";
    currentPhoneme = "";
    if (reason === "cancelled") {
      setState("ready", { mode: prior.mode, reason });
      emit("speechcancel", { mode: prior.mode, result: result || null });
    } else if (reason === "error") {
      lastError = safeError(result);
      setState("error", { mode: prior.mode, error: lastError });
      emit("speecherror", { mode: prior.mode, error: lastError });
    } else {
      setState("ready", { mode: prior.mode, result: result || null });
      emit("speechend", { mode: prior.mode, result: result || null });
    }
    lastResult = result || null;
    emitImmediateFrame();
  }

  function handleTtsBoundary(detail) {
    if (!activeRun || activeRun.mode !== "speech" || activeRun.paused || !detail) return;
    const index = Math.max(0, Number(detail.charIndex) || 0);
    const grapheme = extractGraphemeAt(activeRun.text, index);
    const shape = mapDevanagariVisemePart2(grapheme);
    currentCharIndex = Array.from(activeRun.text.slice(0, index)).length;
    currentGrapheme = grapheme;
    currentPhoneme = "";
    currentViseme = shape.viseme;
    mouthTarget = shape.openness;
    lastBoundaryAt = getNow(host);
    activeRun.syncQuality = "native-boundary";
    activeRun.syncConfidence = detail.name === "word" || detail.charLength > 0 ? "medium" : "event-dependent";
    emit("viseme", {
      mode: "speech",
      grapheme,
      viseme: shape.viseme,
      openness: shape.openness,
      charIndex: currentCharIndex,
      syncQuality: activeRun.syncQuality,
      syncConfidence: activeRun.syncConfidence
    });
    emitImmediateFrame();
  }

  function markTtsStarted(detail) {
    if (!activeRun || activeRun.mode !== "speech") return;
    activeRun.startedAt = getNow(host);
    activeRun.elapsedBeforePause = 0;
    activeRun.paused = false;
    emit("speechstart", { mode: "speech", voiceKey: activeRun.voiceKey, textLength: Array.from(activeRun.text).length, detail: detail || null });
  }

  function attachTtsEvents() {
    unsubscribe.push(
      ttsEngine.on("boundary", handleTtsBoundary),
      ttsEngine.on("speechstart", markTtsStarted),
      ttsEngine.on("speechend", detail => {
        if (activeRun && activeRun.mode === "speech") endRun({ status: "ended", voiceKey: activeRun.voiceKey, detail }, "ended");
      }),
      ttsEngine.on("speechcancel", detail => {
        if (activeRun && activeRun.mode === "speech") endRun({ status: "cancelled", detail }, "cancelled");
      }),
      ttsEngine.on("speecherror", detail => {
        if (activeRun && activeRun.mode === "speech") endRun(safeError(detail, "AVATAR_TTS_ERROR"), "error");
      }),
      ttsEngine.on("pause", () => {
        if (activeRun && activeRun.mode === "speech") {
          markPaused(activeRun);
          setState("paused", { mode: "speech" });
        }
      }),
      ttsEngine.on("resume", () => {
        if (activeRun && activeRun.mode === "speech") {
          markResumed(activeRun);
          setState("speaking", { mode: "speech" });
        }
      }),
      ttsEngine.on("voiceschanged", detail => {
        inventory = ttsEngine.getInventory();
        emit("voiceschanged", { voiceCount: inventory.total, selectableVoiceCount: inventory.selectable.length, detail });
      }),
      ttsEngine.on("warning", detail => emit("warning", { source: "avatar-tts", detail }))
    );
  }

  function assertVoiceReady(requestedKey) {
    if (!inventory) fail("पहले Avatar TTS Engine initialize करें।", "AVATAR_NOT_INITIALIZED");
    return chooseVoice(requestedKey);
  }

  async function initialize() {
    ensureUsable();
    if (state === "ready" || state === "unsupported") return getStatus();
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      setState("initializing");
      try {
        const initialized = await ttsEngine.initialize();
        inventory = initialized && initialized.inventory ? initialized.inventory : ttsEngine.getInventory();
        if (!initialized || initialized.ready !== true) {
          setState("unsupported", { reason: "Native SpeechSynthesis उपलब्ध नहीं है।" });
          return getStatus();
        }
        setState("ready", {
          voiceCount: inventory.total,
          selectableVoiceCount: inventory.selectable.length,
          surfaceConnected: Boolean(surface),
          singingAvailable: Boolean(singingAdapter)
        });
        return getStatus();
      } catch (error) {
        lastError = safeError(error, "AVATAR_INITIALIZATION_FAILED");
        setState("error", { error: lastError });
        throw error instanceof BrainAvatarAdapterErrorPart2 ? error :
          new BrainAvatarAdapterErrorPart2("Avatar Adapter प्रारंभ नहीं हो सका।", lastError.code, null, error);
      } finally {
        initializePromise = null;
      }
    })();
    return initializePromise;
  }

  async function refreshVoices() {
    ensureUsable();
    inventory = await ttsEngine.refreshVoices();
    emit("voiceschanged", { voiceCount: inventory.total, selectableVoiceCount: inventory.selectable.length });
    return getVoices();
  }

  function setVoice(nextKey) {
    ensureUsable();
    assertVoiceReady(nextKey);
    return voiceKey;
  }

  async function speak(text, settings = {}) {
    ensureUsable();
    if (!isPlainObject(settings)) fail("वाचन विकल्प साधारण Object होना चाहिए।", "INVALID_SPEECH_OPTIONS");
    if (activeRun) fail("अवतार में एक वाचन/गायन पहले से चल रहा है।", "AVATAR_BUSY");
    if (settings.signal && settings.signal.aborted) fail("वाचन कार्य पहले ही रद्द हो चुका है।", "TASK_ABORTED");
    if (state !== "ready") await initialize();
    const cleanText = normalizeText(text);
    const selected = assertVoiceReady(settings.voiceKey);
    const rate = clamp(settings.rate, 0.65, 1.25, SOFT_YOUNG_FEMININE_PRESET.rate);
    const preset = settings.preset === "neutral"
      ? { rate: 1, pitch: 1, volume: 1 }
      : SOFT_YOUNG_FEMININE_PRESET;
    beginRun("speech", cleanText, { rate, voiceKey: selected.key });

    const signal = settings.signal || null;
    const abort = () => { try { ttsEngine.cancel("task-aborted"); } catch (_) {} };
    if (signal) signal.addEventListener("abort", abort, { once: true });
    try {
      const result = await ttsEngine.speak(cleanText, {
        ...preset,
        rate,
        pitch: clamp(settings.pitch, 0.5, 1.5, preset.pitch),
        volume: clamp(settings.volume, 0, 1, preset.volume),
        voiceKey: selected.key,
        replace: false
      });
      if (activeRun && activeRun.mode === "speech") endRun(result, result && result.status === "cancelled" ? "cancelled" : "ended");
      return result;
    } catch (error) {
      if (activeRun && activeRun.mode === "speech") endRun(safeError(error), "error");
      throw error;
    } finally {
      if (signal) signal.removeEventListener("abort", abort);
    }
  }

  async function sing(text, settings = {}) {
    ensureUsable();
    if (!singingAdapter) fail("स्थानीय Speech/Singing Adapter अभी उपलब्ध नहीं है।", "SINGING_ADAPTER_UNAVAILABLE");
    if (activeRun) fail("अवतार में एक वाचन/गायन पहले से चल रहा है।", "AVATAR_BUSY");
    if (!isPlainObject(settings)) fail("गायन विकल्प साधारण Object होना चाहिए।", "INVALID_SINGING_OPTIONS");
    if (settings.signal && settings.signal.aborted) fail("गायन कार्य पहले ही रद्द हो चुका है।", "TASK_ABORTED");
    const singingStatus = typeof singingAdapter.getStatus === "function" ? singingAdapter.getStatus() : null;
    if (singingStatus && singingStatus.configured === false) fail("स्थानीय Singing Model अभी configure नहीं है।", "SINGING_BACKEND_NOT_CONFIGURED");
    if (singingStatus && singingStatus.localOnly === false) fail("Remote Singing Backend अस्वीकृत है।", "REMOTE_SINGING_REJECTED");
    const cleanText = normalizeText(text);
    const request = singingAdapter.prepare(cleanText, settings);
    if (!request || !Array.isArray(request.timeline)) fail("Singing Adapter ने मान्य syllable timeline नहीं दिया।", "SINGING_TIMELINE_INVALID");

    beginRun("singing", cleanText, { timeline: request.timeline });
    let removeStartListener = null;
    if (typeof singingAdapter.on === "function") {
      removeStartListener = singingAdapter.on("speechstart", () => {
        if (activeRun && activeRun.mode === "singing") {
          activeRun.startedAt = getNow(host);
          activeRun.elapsedBeforePause = 0;
          pausedDuration = 0;
          emit("speechstart", {
            mode: "singing",
            syllableCount: request.syllableCount,
            syncQuality: "planned-syllable-timing",
            syncConfidence: "estimated"
          });
        }
      });
    }
    if (settings.signal && typeof singingAdapter.on === "function") {
      const offCancel = singingAdapter.on("speechcancel", detail => {
        if (activeRun && activeRun.mode === "singing") endRun({ status: "cancelled", detail }, "cancelled");
      });
      const offEnd = singingAdapter.on("speechend", detail => {
        if (activeRun && activeRun.mode === "singing") endRun({ status: "ended", detail }, "ended");
      });
      const offError = singingAdapter.on("error", detail => {
        if (activeRun && activeRun.mode === "singing") endRun(safeError(detail), "error");
      });
      const previousRemove = removeStartListener;
      removeStartListener = () => {
        if (typeof previousRemove === "function") previousRemove();
        offCancel(); offEnd(); offError();
      };
    }
    try {
      const result = await singingAdapter.sing(cleanText, { ...settings, signal: settings.signal });
      if (activeRun && activeRun.mode === "singing") endRun(result, result && result.status === "cancelled" ? "cancelled" : "ended");
      return result;
    } catch (error) {
      if (activeRun && activeRun.mode === "singing") {
        endRun(safeError(error, "SINGING_ERROR"), error && error.code === "TASK_ABORTED" ? "cancelled" : "error");
      }
      throw error;
    } finally {
      if (typeof removeStartListener === "function") removeStartListener();
    }
  }

  async function pause() {
    ensureUsable();
    if (!activeRun || activeRun.paused) return false;
    const run = activeRun;
    if (run.mode === "singing") {
      const result = await singingAdapter.pause();
      if (result === false) return false;
      markPaused(run);
      setState("paused", { mode: "singing" });
      return true;
    }
    const result = await ttsEngine.pause();
    if (result === false) return false;
    if (!run.paused) markPaused(run);
    setState("paused", { mode: "speech" });
    return true;
  }

  async function resume() {
    ensureUsable();
    if (!activeRun || !activeRun.paused) return false;
    const run = activeRun;
    if (run.mode === "singing") {
      const result = await singingAdapter.resume();
      if (result === false) return false;
      markResumed(run);
      setState("singing", { mode: "singing" });
      return true;
    }
    const result = await ttsEngine.resume();
    if (result === false) return false;
    if (run.paused) markResumed(run);
    setState("speaking", { mode: "speech" });
    return true;
  }

  async function stop(reason = "user") {
    ensureUsable();
    if (!activeRun) return false;
    const run = activeRun;
    try {
      if (run.mode === "singing") await singingAdapter.stop(String(reason).slice(0, 120));
      else ttsEngine.cancel(String(reason).slice(0, 120));
    } finally {
      if (activeRun === run) endRun({ status: "cancelled", reason }, "cancelled");
    }
    return true;
  }

  function connectSurface(nextSurface) {
    ensureUsable();
    surface = validateAvatarSurface(nextSurface);
    if (activeRun) emitImmediateFrame();
    emit("statechange", { surfaceConnected: Boolean(surface) });
    return Boolean(surface);
  }

  function disconnectSurface() {
    ensureUsable();
    surface = null;
    emit("statechange", { surfaceConnected: false });
    return true;
  }

  function setGaze(mode) {
    ensureUsable();
    gazeMode = normalizeGaze(mode);
    emitImmediateFrame();
    return gazeMode;
  }

  function setExpression(preset) {
    ensureUsable();
    expression = normalizeExpression(preset);
    emitImmediateFrame();
    return expression;
  }

  function setMotionIntensity(value) {
    ensureUsable();
    motionIntensity = clamp(value, 0, 1, DEFAULT_MOTION_INTENSITY);
    emitImmediateFrame();
    return motionIntensity;
  }

  function createSpeakSkillDescriptor() {
    ensureUsable();
    return Object.freeze({
      id: "avatar.speak",
      title: "स्थानीय फोटो अवतार वाचन और Lip-Sync",
      version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
      risk: "medium",
      capabilities: Object.freeze(["avatar.control", "tts.speak"]),
      enabled: true,
      execute: async taskContext => {
        if (!taskContext || !isPlainObject(taskContext.input)) fail("Avatar speak Skill input अमान्य है।", "INVALID_SKILL_INPUT");
        const input = taskContext.input;
        return speak(input.text, {
          voiceKey: input.voiceKey,
          rate: input.rate,
          pitch: input.pitch,
          volume: input.volume,
          signal: taskContext.signal
        });
      }
    });
  }

  function createSingSkillDescriptor() {
    ensureUsable();
    return Object.freeze({
      id: "avatar.sing",
      title: "स्थानीय गायन के साथ फोटो अवतार Lip-Sync",
      version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
      risk: "medium",
      capabilities: Object.freeze(["avatar.control", "tts.speak", "model.inference"]),
      enabled: Boolean(singingAdapter),
      execute: async taskContext => {
        if (!taskContext || !isPlainObject(taskContext.input)) fail("Avatar sing Skill input अमान्य है।", "INVALID_SKILL_INPUT");
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
    if (!core || typeof core.registerModule !== "function" || typeof core.listModules !== "function") {
      fail("वास्तविक Brain Core आवश्यक है।", "BRAIN_CORE_REQUIRED");
    }
    const existing = new Set(core.listModules().map(item => item.id));
    const descriptors = [createSpeakSkillDescriptor(), createSingSkillDescriptor()];
    const duplicates = descriptors.filter(item => existing.has(item.id)).map(item => item.id);
    if (duplicates.length) fail("Avatar Skill पहले से Registered है: " + duplicates.join(", "), "AVATAR_SKILL_DUPLICATE");
    const registered = [];
    try {
      for (const descriptor of descriptors) registered.push(core.registerModule(descriptor));
    } catch (error) {
      for (const item of registered) {
        try { core.unregisterModule(item.id); } catch (_) {}
      }
      throw error;
    }
    return Object.freeze(registered);
  }

  function getStatus() {
    const ttsStatus = ttsEngine.getStatus();
    const singingStatus = singingAdapter && typeof singingAdapter.getStatus === "function"
      ? singingAdapter.getStatus() : null;
    const selected = voiceKey ? getVoices().find(item => item.key === voiceKey) : null;
    return Object.freeze({
      version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
      id: BRAIN_AVATAR_ADAPTER_ID_PART2,
      state,
      initialized: Boolean(inventory),
      localOnly: true,
      disposed,
      rendererConnected: Boolean(surface),
      rendererMode: surface ? "injected-avatar-surface" : "custom-event-bridge-only",
      active: Boolean(activeRun),
      mode: activeRun ? activeRun.mode : "idle",
      paused: Boolean(activeRun && activeRun.paused),
      voiceCount: inventory ? inventory.total : 0,
      selectableLocalVoiceCount: inventory ? inventory.selectable.length : 0,
      selectedVoiceKey: voiceKey || null,
      selectedVoiceGenderEvidence: selected ? selected.genderEvidence : "unselected",
      nativeTtsVersion: ttsStatus && ttsStatus.version || null,
      nativeTtsAvailable: Boolean(ttsStatus && ttsStatus.supported),
      singingAvailable: Boolean(singingAdapter),
      singingConfigured: Boolean(singingStatus && singingStatus.configured),
      singingReady: Boolean(singingStatus && singingStatus.ready),
      lipSyncMode: activeRun ? activeRun.syncQuality : "idle",
      exactPhonemeTiming: false,
      bodyLanguageMode: "subtle-2.5d-photo-cues",
      fullBodyGesturesAvailable: false,
      motionIntensity,
      gazeMode,
      expression,
      lastError,
      lastResult
    });
  }

  function on(type, callback) {
    ensureUsable();
    if (!EVENT_NAMES.has(type) || typeof callback !== "function") fail("Avatar Event subscription अमान्य है।", "INVALID_EVENT_SUBSCRIPTION");
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => {
      const group = listeners.get(type);
      if (!group) return;
      group.delete(callback);
      if (!group.size) listeners.delete(type);
    };
  }

  function setVisible(value) {
    ensureUsable();
    visible = value !== false;
    if (visible) {
      startFrameLoop();
      if (activeRun) emitImmediateFrame();
    } else {
      stopFrameLoop();
    }
    if (surface && typeof surface.setVisible === "function") {
      try { surface.setVisible(visible); } catch (_) {}
    }
    return visible;
  }

  async function dispose() {
    if (disposed) return;
    if (activeRun) {
      try { await stop("adapter-disposed"); } catch (_) {}
    }
    stopFrameLoop();
    unsubscribe.splice(0).forEach(off => { try { off(); } catch (_) {} });
    if (surface && typeof surface.resetFrame === "function") {
      try { surface.resetFrame(); } catch (_) {}
    }
    if (ownsTtsEngine && typeof ttsEngine.dispose === "function") {
      try { await ttsEngine.dispose(); } catch (_) {}
    }
    if (options.disposeSingingAdapter === true && singingAdapter && typeof singingAdapter.dispose === "function") {
      try { await singingAdapter.dispose(); } catch (_) {}
    }
    surface = null;
    disposed = true;
    setState("disposed");
    listeners.clear();
  }

  attachTtsEvents();

  return Object.freeze({
    version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
    id: BRAIN_AVATAR_ADAPTER_ID_PART2,
    initialize,
    refreshVoices,
    getVoices,
    setVoice,
    speak,
    sing,
    pause,
    resume,
    stop,
    connectSurface,
    disconnectSurface,
    setGaze,
    setExpression,
    setMotionIntensity,
    setVisible,
    getStatus,
    createSpeakSkillDescriptor,
    createSingSkillDescriptor,
    registerWithCore,
    on,
    dispose
  });
}

export async function selfTest() {
  const checks = [];
  const add = (id, passed, details = null) => checks.push(Object.freeze({
    id, passed: Boolean(passed), ...(details ? { details } : {})
  }));
  const open = mapDevanagariVisemePart2("आ");
  const wide = mapDevanagariVisemePart2("ई");
  const round = mapDevanagariVisemePart2("ऊ");
  const closed = mapDevanagariVisemePart2("म");
  const rest = mapDevanagariVisemePart2("।");
  add("long-a-opens-mouth", open.viseme === "open" && open.openness > 0.7);
  add("front-vowel-uses-wide-viseme", wide.viseme === "wide");
  add("rounded-vowel-uses-rounded-viseme", round.viseme === "rounded" && round.rounded);
  add("bilabial-consonant-closes-lips", closed.viseme === "closed" && closed.openness < 0.06);
  add("punctuation-resets-mouth", rest.viseme === "rest");

  const emittedFrames = [];
  const engineListeners = new Map();
  const voice = {
    key: "local-hi-female-hint", name: "Hindi Female", lang: "hi-IN",
    locality: "local", local: true, femaleNameHinted: true,
    selectable: true, default: true,
    voice: { name: "Hindi Female", lang: "hi-IN", localService: true }
  };
  const inventory = { total: 1, selectable: [voice], informational: [], message: "test inventory" };
  const fakeTts = {
    version: "self-test",
    initialize: async () => ({ ready: true, inventory }),
    refreshVoices: async () => inventory,
    getInventory: () => inventory,
    getStatus: () => ({ supported: true, version: "self-test" }),
    on(type, callback) {
      if (!engineListeners.has(type)) engineListeners.set(type, new Set());
      engineListeners.get(type).add(callback);
      return () => engineListeners.get(type).delete(callback);
    },
    fire(type, detail = {}) {
      for (const callback of engineListeners.get(type) || []) callback(detail);
    },
    async speak(text) {
      this.fire("speechstart", { text });
      this.fire("boundary", { text, charIndex: 0, charLength: 1, name: "word" });
      this.fire("speechend", { text });
      return { status: "ended", voiceKey: voice.key };
    },
    pause: () => true,
    resume: () => true,
    cancel: () => true,
    dispose: async () => true
  };
  const fakeHost = {
    performance: { now: () => 1000 },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    dispatchEvent(event) { emittedFrames.push(event); return true; }
  };
  const fakeSurface = {
    renderFrame(frame) { emittedFrames.push(frame); },
    resetFrame() { emittedFrames.push({ reset: true }); }
  };

  let adapter = null;
  try {
    adapter = createBrainAvatarAdapterPart2({
      target: fakeHost, avatarTtsEngine: fakeTts, avatarSurface: fakeSurface
    });
    await adapter.initialize();
    add("local-tts-inventory-initializes", adapter.getVoices().length === 1 && adapter.getStatus().nativeTtsAvailable);
    const result = await adapter.speak("ॐ नमः शिवाय।", { voiceKey: voice.key });
    add("native-tts-speech-run-completes", result && result.status === "ended" && adapter.getStatus().active === false);
    add("native-boundary-drives-viseme-frame", emittedFrames.some(item =>
      item && item.mouth && item.mouth.grapheme === "ॐ" && item.mouth.viseme !== "rest"
    ));
    add("renderer-surface-receives-frames", emittedFrames.some(item =>
      item && item.version === BRAIN_AVATAR_ADAPTER_VERSION_PART2
    ));
    add("voice-gender-is-not-claimed-from-name", adapter.getVoices()[0].genderEvidence === "name-hint-unverified");
    add("single-photo-limits-full-body-claims", adapter.getStatus().fullBodyGesturesAvailable === false);
    add("core-skill-contracts-are-declared", adapter.createSpeakSkillDescriptor().id === "avatar.speak" &&
      adapter.createSingSkillDescriptor().id === "avatar.sing");
  } catch (error) {
    add("avatar-adapter-runtime-self-test", false, {
      code: error && error.code || "SELF_TEST_ERROR",
      message: error && error.message || String(error)
    });
  } finally {
    if (adapter) {
      try { await adapter.dispose(); } catch (_) {}
    }
  }

  let unavailableSingingRejected = false;
  try {
    const engine = {
      initialize: async () => ({ ready: true, inventory }),
      refreshVoices: async () => inventory,
      getInventory: () => inventory,
      getStatus: () => ({ supported: true }),
      on: () => () => {},
      speak: async () => ({ status: "ended" }),
      pause: () => true,
      resume: () => true,
      cancel: () => true,
      dispose: async () => true
    };
    const singingTest = createBrainAvatarAdapterPart2({ target: {}, avatarTtsEngine: engine });
    await singingTest.initialize();
    try { await singingTest.sing("ॐ नमः शिवाय।"); }
    catch (error) { unavailableSingingRejected = error && error.code === "SINGING_ADAPTER_UNAVAILABLE"; }
    await singingTest.dispose();
  } catch (_) {}
  add("singing-is-not-fabricated-without-singing-adapter", unavailableSingingRejected);

  const failed = checks.filter(item => !item.passed);
  return Object.freeze({
    module: "brain-avatar-adapter-part2",
    version: BRAIN_AVATAR_ADAPTER_VERSION_PART2,
    status: failed.length ? "FAILED" : "PASSED",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    skipped: 0,
    checks: Object.freeze(checks)
  });
}

export async function mount(context = {}) {
  const target = context.target || (context.document && context.document.defaultView) || globalThis;
  const adapter = createBrainAvatarAdapterPart2({
    target,
    avatarTtsEngine: context.avatarTtsEngine || null,
    singingAdapter: context.singingAdapter || null,
    avatarSurface: context.avatarSurface || null,
    gazeMode: context.gazeMode,
    expression: context.expression,
    motionIntensity: context.motionIntensity,
    disposeSingingAdapter: context.disposeSingingAdapter === true
  });
  const initialized = context.preload === true ? await adapter.initialize() : adapter.getStatus();
  let disposed = false;
  return Object.freeze({
    adapter,
    initialize: () => adapter.initialize(),
    getStatus: () => adapter.getStatus(),
    onShow: () => adapter.setVisible(true),
    onHide: async () => {
      adapter.setVisible(false);
      if (adapter.getStatus().active) await adapter.pause();
    },
    unmount: async () => {
      if (disposed) return;
      disposed = true;
      await adapter.dispose();
    },
    initialized
  });
}

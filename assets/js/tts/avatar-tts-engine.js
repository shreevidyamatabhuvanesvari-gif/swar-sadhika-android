/* Swar-Sadhika Avatar TTS Engine — native, model-free browser speech.
 * Uses only the device's SpeechSynthesis inventory. No model, API, worker or server.
 * Only verified local Hindi/Sanskrit voices are selectable for offline playback.
 */
export const AVATAR_TTS_ENGINE_VERSION = "1.2.0";
// Gentle delivery controls; age is not measurable from a device voice.
export const SOFT_YOUNG_FEMININE_PRESET = Object.freeze({rate:0.88,pitch:1.14,volume:0.98});
const SUPPORTED_LANGUAGES = new Set(["hi", "sa"]);
const FEMALE_NAME_HINTS = /(?:female|woman|girl|zira|samantha|susan|heera|lekha|swara|kavya)/i;
const SAMPLE_TEXT = Object.freeze({
  hi: "नमस्कार, मैं स्वर-साधिका हूँ। आइए, मधुर स्वर में पाठ आरम्भ करें।",
  sa: "ॐ नमः शिवाय। शान्तिः, शान्तिः, शान्तिः।"
});
const EVENT_NAMES = new Set([
  "voiceschanged", "speechrequest", "speechstart", "boundary", "speechend",
  "speechcancel", "speecherror", "pause", "resume", "punctuationpause", "warning"
]);

function normalizeLanguageTag(value) {
  return String(value || "").trim().replace(/_/g, "-").toLowerCase().split("-")[0] || "";
}
function getLocality(voice) {
  if (voice && voice.localService === true) return "local";
  if (voice && voice.localService === false) return "remote";
  return "unknown";
}
function voiceKey(voice) {
  const uri = String(voice && voice.voiceURI || "").trim();
  const name = String(voice && voice.name || "").trim();
  const lang = String(voice && voice.lang || "").trim();
  return uri || [name, lang, getLocality(voice)].join("\u241f");
}
function isSupportedLanguage(voice) {
  return SUPPORTED_LANGUAGES.has(normalizeLanguageTag(voice && voice.lang));
}
function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function splitSpeechAtPunctuation(value) {
  const text = String(value == null ? "" : value);
  const parts = [];
  const commaMarks = new Set([",", "，", ";", "؛"]);
  const sentenceMarks = new Set(["।", "॥", ".", "!", "?", "…"]);
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (!commaMarks.has(mark) && !sentenceMarks.has(mark)) continue;
    const raw = text.slice(start, index + 1);
    const leading = raw.search(/\S/u);
    if (leading >= 0) {
      parts.push(Object.freeze({
        text: raw.trim(), start: start + leading,
        punctuation: mark
      }));
    }
    start = index + 1;
  }
  const tail = text.slice(start);
  const leading = tail.search(/\S/u);
  if (leading >= 0) {
    parts.push(Object.freeze({text:tail.trim(),start:start+leading,punctuation:""}));
  }
  return Object.freeze(parts);
}

export function inspectAvatarTtsVoice(voice) {
  const lang = String(voice && voice.lang || "");
  const language = normalizeLanguageTag(lang);
  const locality = getLocality(voice);
  const supportedLanguage = SUPPORTED_LANGUAGES.has(language);
  const selectable = locality === "local" && supportedLanguage;
  const name = String(voice && voice.name || "अज्ञात आवाज़");
  const femaleHint = FEMALE_NAME_HINTS.test(name)
    ? "नाम के आधार पर संभावित स्त्री-स्वर; सुनकर पुष्टि करें"
    : "स्वर-प्रकार की पुष्टि सुनकर करें";
  const localityLabel = locality === "local"
    ? "स्थानीय · ऑफलाइन playback के योग्य"
    : locality === "remote"
      ? "ऑनलाइन/दूरस्थ · ऑफलाइन के रूप में चयन योग्य नहीं"
      : "स्थानीयता अज्ञात · ऑफलाइन होने का दावा नहीं";
  return Object.freeze({
    key: voiceKey(voice), name, lang, language, locality, localityLabel,
    supportedLanguage, selectable, default: Boolean(voice && voice.default),
    femaleNameHinted: FEMALE_NAME_HINTS.test(name),
    femaleHint, voice
  });
}

function copyInventory(voices) {
  const all = voices.map(inspectAvatarTtsVoice);
  const selectable = all.filter(item => item.selectable);
  const informational = all.filter(item => item.supportedLanguage && !item.selectable);
  let message = "स्थानीय Hindi/Sanskrit आवाज़ उपलब्ध है। आवाज़ चुनकर नमूना सुनें।";
  if (!selectable.length) {
    if (informational.some(item => item.locality === "remote")) {
      message = "Hindi/Sanskrit आवाज़ मिली, लेकिन वह ऑनलाइन/दूरस्थ है। स्थानीय offline playback के लिए Android में स्थानीय आवाज़ स्थापित करें।";
    } else if (informational.length) {
      message = "Hindi/Sanskrit आवाज़ मिली, लेकिन उसकी स्थानीयता अज्ञात है। उसे offline आवाज़ मानकर उपयोग नहीं किया जाएगा।";
    } else {
      message = "इस डिवाइस में स्थानीय Hindi/Sanskrit आवाज़ उपलब्ध नहीं है। Android Text-to-speech settings में Hindi या Sanskrit आवाज़ स्थापित करके सूची ताज़ा करें।";
    }
  }
  return Object.freeze({
    all: Object.freeze(all), selectable: Object.freeze(selectable.sort((a,b)=>Number(b.femaleNameHinted)-Number(a.femaleNameHinted))),
    informational: Object.freeze(informational), message, total: all.length
  });
}

export function createAvatarTtsEngine(options = {}) {
  const host = options.target || (typeof window !== "undefined" ? window : null);
  const synthesis = host && host.speechSynthesis;
  const Utterance = host && host.SpeechSynthesisUtterance;
  const listeners = new Map();
  let inventory = copyInventory([]);
  let pending = null;
  let sequence = 0;
  let disposed = false;
  let paused = false;
  let voiceChangeHandler = null;
  let previousVoiceHandler = null;

  function ensureActive() {
    if (disposed) throw new Error("Avatar TTS Engine बंद हो चुका है।");
  }
  function emit(type, detail = {}) {
    const callbacks = listeners.get(type);
    if (!callbacks) return;
    const event = Object.freeze({
      type, detail: Object.freeze({ ...detail }), timestamp: Date.now(),
      version: AVATAR_TTS_ENGINE_VERSION
    });
    for (const callback of [...callbacks]) {
      try { callback(event.detail, event); }
      catch (error) {
        try { host && host.console && host.console.error("[Avatar TTS] Listener failed", error); } catch (_) {}
      }
    }
  }
  function on(type, callback) {
    ensureActive();
    if (!EVENT_NAMES.has(type)) throw new TypeError("अज्ञात Avatar TTS event: " + type);
    if (typeof callback !== "function") throw new TypeError("Event listener function होना चाहिए।");
    let bucket = listeners.get(type);
    if (!bucket) { bucket = new Set(); listeners.set(type, bucket); }
    bucket.add(callback);
    return () => bucket.delete(callback);
  }
  function getStatus() {
    return Object.freeze({
      version: AVATAR_TTS_ENGINE_VERSION,
      supported: Boolean(synthesis && Utterance && typeof synthesis.speak === "function"),
      modelFree: true, localOnly: true,
      voiceCount: inventory.total, selectableVoiceCount: inventory.selectable.length,
      speaking: Boolean(pending && !paused), paused, busy: Boolean(pending),
      voicePreset: SOFT_YOUNG_FEMININE_PRESET,
      message: inventory.message
    });
  }
  async function refreshVoices() {
    ensureActive();
    if (!synthesis || typeof synthesis.getVoices !== "function") {
      inventory = copyInventory([]);
      emit("warning", { code: "SPEECH_SYNTHESIS_UNAVAILABLE", message: "इस browser में SpeechSynthesis उपलब्ध नहीं है।" });
      return inventory;
    }
    let raw;
    try { raw = synthesis.getVoices(); }
    catch (error) {
      emit("warning", { code: "VOICE_ENUMERATION_FAILED", message: error && error.message || String(error) });
      throw error;
    }
    inventory = copyInventory(Array.isArray(raw) ? raw : []);
    emit("voiceschanged", {
      total: inventory.total, selectable: inventory.selectable.length,
      informational: inventory.informational.length, message: inventory.message
    });
    return inventory;
  }
  function getInventory() { ensureActive(); return inventory; }
  function resolveVoice(key) {
    const found = inventory.selectable.find(item => item.key === String(key || ""));
    if (!found) throw new Error("चुनी हुई आवाज़ स्थानीय Hindi/Sanskrit आवाज़ों में उपलब्ध नहीं है। आवाज़ सूची ताज़ा करें।");
    return found.voice;
  }
  export function punctuationPauseMs(mark) {
    const value = String(mark || "");
    if (value === "॥") return 780;
    if (value === "…") return 700;
    if (value === "।" || value === "." || value === "!" || value === "?") return 560;
    if (value === ";") return 380;
    if (value === "," || value === "，") return 240;
    return 0;
  }

  function waitForPunctuationPause(record, part) {
    const duration = punctuationPauseMs(part && part.punctuation);
    if (duration <= 0) return Promise.resolve(true);
    emit("punctuationpause", {punctuation:part.punctuation,durationMs:duration});
    return new Promise(resolve => {
      const complete = result => {
        if (record.pauseTimer) clearTimeout(record.pauseTimer);
        record.pauseTimer = null;
        record.pauseTimerStarted = 0;
        record.pauseWaitResolve = null;
        record.continuePause = null;
        resolve(result);
      };
      const tick = () => {
        if (pending !== record || record.settled) { complete(false); return; }
        if (paused) return;
        if (record.pauseRemainingMs <= 0) { complete(true); return; }
        record.pauseTimerStarted = Date.now();
        record.pauseTimer = setTimeout(() => { record.pauseRemainingMs = 0; complete(true); }, record.pauseRemainingMs);
      };
      record.pauseRemainingMs = duration;
      record.pauseWaitResolve = complete;
      record.continuePause = tick;
      tick();
    });
  }

  function settle(record, result, error) {
    if (!record || pending !== record || record.settled) return;
    record.settled = true;
    pending = null;
    paused = false;
    if (error) record.reject(error);
    else record.resolve(Object.freeze(result));
  }
  function cancel(reason = "user") {
    ensureActive();
    const current = pending;
    if (!current) return false;
    sequence += 1;
    try { synthesis.cancel(); } catch (_) {}
    if (current.pauseWaitResolve) current.pauseWaitResolve(false);
    emit("speechcancel", { reason, text: current.text, voiceKey: current.voiceKey });
    settle(current, { status: "cancelled", reason, voiceKey: current.voiceKey });
    return true;
  }
  function speak(text, settings = {}) {
    ensureActive();
    if (!synthesis || !Utterance) return Promise.reject(new Error("इस Android browser में Native SpeechSynthesis उपलब्ध नहीं है।"));
    const cleanText = String(text == null ? "" : text).trim();
    if (!cleanText) return Promise.reject(new TypeError("वाचन के लिए पाठ आवश्यक है।"));
    let voice;
    try { voice = resolveVoice(settings.voiceKey); }
    catch (error) { return Promise.reject(error); }
    if (!isSupportedLanguage(voice) || voice.localService !== true) {
      return Promise.reject(new Error("केवल स्थानीय Hindi/Sanskrit आवाज़ से offline वाचन की अनुमति है।"));
    }
    if (pending) {
      if (settings.replace === false) return Promise.reject(new Error("एक वाचन पहले से चल रहा है।"));
      cancel("replaced");
    }
    const parts = splitSpeechAtPunctuation(cleanText);

    return new Promise((resolve, reject) => {
      const token = ++sequence;
      const record = {
        token, resolve, reject, settled:false, text:cleanText,
        voiceKey:voiceKey(voice), parts, partIndex:0,
        started:false, pauseTimer:null, pauseTimerStarted:0, pauseRemainingMs:0,
        pauseWaitResolve:null, continuePause:null
      };
      pending = record;
      paused = false;
      const rate = clamp(settings.rate,0.65,1.25,SOFT_YOUNG_FEMININE_PRESET.rate);
      const pitch = clamp(settings.pitch,0.5,1.5,SOFT_YOUNG_FEMININE_PRESET.pitch);
      const volume = clamp(settings.volume,0,1,SOFT_YOUNG_FEMININE_PRESET.volume);
      emit("speechrequest", {
        text:cleanText,voiceKey:record.voiceKey,lang:String(voice.lang||"hi-IN"),
        rate,pitch,segments:parts.length
      });

      const finish = () => {
        if (pending !== record || record.token !== token) return;
        emit("speechend",{text:cleanText,voiceKey:record.voiceKey,segments:parts.length});
        settle(record,{status:"ended",voiceKey:record.voiceKey,segments:parts.length});
      };

      const playPart = () => {
        if (pending !== record || record.token !== token || record.settled) return;
        const part = parts[record.partIndex];
        if (!part) { finish(); return; }
        const utterance = new Utterance(part.text);
        utterance.voice = voice;
        utterance.lang = String(voice.lang || (normalizeLanguageTag(voice.lang)==="sa" ? "sa-IN" : "hi-IN"));
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;
        record.utterance = utterance;
        utterance.onstart = event => {
          if (pending !== record || record.token !== token) return;
          if (!record.started) {
            record.started = true;
            emit("speechstart",{text:cleanText,voiceKey:record.voiceKey,charIndex:part.start,rate,pitch});
          }
        };
        utterance.onboundary = event => {
          if (pending !== record || record.token !== token) return;
          emit("boundary",{
            text:cleanText,voiceKey:record.voiceKey,
            charIndex:part.start+Math.max(0,Number(event&&event.charIndex)||0),
            charLength:Math.max(0,Number(event&&event.charLength)||0),
            name:String(event&&event.name||""),
            elapsedTime:Math.max(0,Number(event&&event.elapsedTime)||0)
          });
        };
        utterance.onend = () => {
          if (pending !== record || record.token !== token) return;
          record.partIndex += 1;
          if (record.partIndex >= parts.length) { finish(); return; }
          void waitForPunctuationPause(record,part).then(ready=>{
            if (ready && pending === record && record.token === token) playPart();
          });
        };
        utterance.onerror = event => {
          if (pending !== record || record.token !== token) return;
          const code=String(event&&event.error||"unknown");
          if (code==="canceled" || code==="interrupted") {
            emit("speechcancel",{reason:code,text:cleanText,voiceKey:record.voiceKey});
            settle(record,{status:"cancelled",reason:code,voiceKey:record.voiceKey});
          } else {
            const error=new Error("Android Native TTS त्रुटि: "+code);
            emit("speecherror",{code,message:error.message,text:cleanText,voiceKey:record.voiceKey});
            settle(record,null,error);
          }
        };
        try { synthesis.speak(utterance); }
        catch (error) {
          emit("speecherror",{code:"SPEAK_FAILED",message:error&&error.message||String(error)});
          settle(record,null,error);
        }
      };
      playPart();
    });
  }
  async function playSample(voiceKeyValue, settings = {}) {
    const selected = inventory.selectable.find(item => item.key === String(voiceKeyValue || ""));
    if (!selected) throw new Error("नमूना सुनाने के लिए स्थानीय Hindi/Sanskrit आवाज़ चुनें।");
    const sample = String(settings.text || SAMPLE_TEXT[selected.language] || SAMPLE_TEXT.hi);
    return speak(sample, { ...SOFT_YOUNG_FEMININE_PRESET, ...settings, voiceKey:selected.key, replace:true });
  }
  function pause() {
    ensureActive();
    if (!pending || paused || !synthesis || typeof synthesis.pause !== "function") return false;
    try {
      if (pending && pending.pauseTimer) {
        clearTimeout(pending.pauseTimer);
        pending.pauseTimer = null;
        const elapsed = Math.max(0,Date.now()-pending.pauseTimerStarted);
        pending.pauseRemainingMs = Math.max(0,pending.pauseRemainingMs-elapsed);
        pending.pauseTimerStarted = 0;
      }
      synthesis.pause(); paused = true;
      emit("pause", { voiceKey: pending.voiceKey, text: pending.text });
      return true;
    } catch (error) {
      emit("warning", { code: "PAUSE_FAILED", message: error && error.message || String(error) });
      return false;
    }
  }
  function resume() {
    ensureActive();
    if (!pending || !paused || !synthesis || typeof synthesis.resume !== "function") return false;
    try {
      synthesis.resume(); paused = false;
      if (pending && pending.continuePause) pending.continuePause();
      emit("resume", { voiceKey: pending.voiceKey, text: pending.text });
      return true;
    } catch (error) {
      emit("warning", { code: "RESUME_FAILED", message: error && error.message || String(error) });
      return false;
    }
  }
  if (synthesis) {
    if (typeof synthesis.addEventListener === "function") {
      voiceChangeHandler = () => { void refreshVoices().catch(() => {}); };
      synthesis.addEventListener("voiceschanged", voiceChangeHandler);
    } else if ("onvoiceschanged" in synthesis) {
      previousVoiceHandler = synthesis.onvoiceschanged;
      voiceChangeHandler = event => {
        try { if (typeof previousVoiceHandler === "function") previousVoiceHandler.call(synthesis, event); } catch (_) {}
        void refreshVoices().catch(() => {});
      };
      synthesis.onvoiceschanged = voiceChangeHandler;
    }
  }
  async function initialize() {
    ensureActive();
    if (!synthesis || !Utterance) {
      return Object.freeze({ ready: false, status: getStatus(), inventory: await refreshVoices() });
    }
    const voices = await refreshVoices();
    return Object.freeze({ ready: true, status: getStatus(), inventory: voices });
  }
  async function dispose() {
    if (disposed) return;
    if (pending) cancel("disposed");
    if (synthesis && voiceChangeHandler) {
      try {
        if (typeof synthesis.removeEventListener === "function") synthesis.removeEventListener("voiceschanged", voiceChangeHandler);
        else if (synthesis.onvoiceschanged === voiceChangeHandler) synthesis.onvoiceschanged = previousVoiceHandler || null;
      } catch (_) {}
    }
    disposed = true;
    listeners.clear();
  }
  return Object.freeze({
    version: AVATAR_TTS_ENGINE_VERSION,
    initialize, refreshVoices, getInventory, getStatus,
    speak, playSample, pause, resume, cancel, on, dispose
  });
}

export function selfTest() {
  const localHindi = inspectAvatarTtsVoice({ name: "Hindi Female", lang: "hi-IN", localService: true, voiceURI: "local-hi" });
  const localSanskrit = inspectAvatarTtsVoice({ name: "Sanskrit Local", lang: "sa_IN", localService: true, voiceURI: "local-sa" });
  const remoteHindi = inspectAvatarTtsVoice({ name: "Hindi Online", lang: "hi-IN", localService: false, voiceURI: "remote-hi" });
  const unknownHindi = inspectAvatarTtsVoice({ name: "Hindi Unknown", lang: "hi-IN", voiceURI: "unknown-hi" });
  const englishLocal = inspectAvatarTtsVoice({ name: "English Local", lang: "en-US", localService: true, voiceURI: "local-en" });
  const checks = [
    { id: "local-hindi-selectable", passed: localHindi.selectable && localHindi.locality === "local" },
    { id: "local-sanskrit-selectable", passed: localSanskrit.selectable && localSanskrit.language === "sa" },
    { id: "remote-hindi-information-only", passed: !remoteHindi.selectable && remoteHindi.localityLabel.includes("ऑनलाइन") },
    { id: "unknown-locality-information-only", passed: !unknownHindi.selectable && unknownHindi.locality === "unknown" },
    { id: "unsupported-language-not-selectable", passed: !englishLocal.selectable },
    { id: "female-is-only-a-name-hint", passed: localHindi.femaleHint.includes("सुनकर पुष्टि") },
    { id: "female-name-hint-detected", passed: localHindi.femaleNameHinted === true },
    { id: "soft-feminine-preset-is-gentle", passed: SOFT_YOUNG_FEMININE_PRESET.pitch > 1 && SOFT_YOUNG_FEMININE_PRESET.pitch <= 1.2 && SOFT_YOUNG_FEMININE_PRESET.rate < 1 },
    { id: "comma-pause-is-human-scale", passed: punctuationPauseMs(",") >= 200 && punctuationPauseMs(",") <= 300 },
    { id: "full-stop-pause-is-longer-than-comma", passed: punctuationPauseMs("।") > punctuationPauseMs(",") && punctuationPauseMs(".") === punctuationPauseMs("।") },
    { id: "verse-pause-is-longest", passed: punctuationPauseMs("॥") > punctuationPauseMs("।") },
    { id: "punctuation-split-retains-marks", passed: splitSpeechAtPunctuation("नमस्ते, संसार।")[0]?.punctuation === "," && splitSpeechAtPunctuation("नमस्ते, संसार।")[1]?.punctuation === "।" },
    { id: "voice-key-is-stable", passed: localHindi.key === "local-hi" },
    { id: "sample-texts-available", passed: SAMPLE_TEXT.hi.length > 0 && SAMPLE_TEXT.sa.length > 0 }
  ];
  return Object.freeze({
    status: checks.every(check => check.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(check => check.passed).length,
    failed: checks.filter(check => !check.passed).length,
    checks: Object.freeze(checks.map(check => Object.freeze(check)))
  });
}

export async function runIntegrationSelfTest() {
  class TestUtterance {
    constructor(text) { this.text = text; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; }
  }
  const voice = { name: "Hindi Local", lang: "hi-IN", localService: true, default: true, voiceURI: "test-hi" };
  const calls = [];
  const listeners = new Map();
  const synthesis = {
    speaking: false, paused: false,
    getVoices: () => [voice],
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    speak(utterance) {
      calls.push(utterance); this.speaking = true;
      queueMicrotask(() => {
        utterance.onstart && utterance.onstart({ charIndex: 0 });
        utterance.onboundary && utterance.onboundary({ charIndex: 2, charLength: 1, name: "word", elapsedTime: 20 });
        this.speaking = false;
        utterance.onend && utterance.onend({ elapsedTime: 80 });
      });
    },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    cancel() { this.speaking = false; this.paused = false; }
  };
  const host = { speechSynthesis: synthesis, SpeechSynthesisUtterance: TestUtterance, console: { error() {} } };
  const engine = createAvatarTtsEngine({ target: host });
  const events = [];
  const off = engine.on("boundary", detail => events.push(detail.charIndex));
  const initialized = await engine.initialize();
  const selected = initialized.inventory.selectable[0];
  const result = await engine.speak("नमस्ते", { voiceKey: selected.key });
  off();
  await engine.dispose();
  const checks = [
    { id: "mock-native-inventory-found", passed: initialized.inventory.selectable.length === 1 },
    { id: "mock-speech-runs", passed: result.status === "ended" && calls.length === 1 },
    { id: "character-boundary-forwarded", passed: events.length === 1 && events[0] === 2 },
    { id: "voice-change-listener-cleaned", passed: listeners.size === 0 }
  ];
  return Object.freeze({
    status: checks.every(check => check.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(check => check.passed).length,
    failed: checks.filter(check => !check.passed).length,
    checks: Object.freeze(checks.map(check => Object.freeze(check)))
  });
}

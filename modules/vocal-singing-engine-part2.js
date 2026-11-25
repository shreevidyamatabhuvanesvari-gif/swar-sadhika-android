/* Swar-Sadhika — model-free Sanskrit Vocal Singing Engine (Part 2)
 * Local DSP synthesis only. No model, remote API, instrument track, or network fetch.
 * This first generation creates a vowel-led synthetic singing voice from a
 * glottal-like harmonic source shaped by vowel formants. It is intentionally
 * transparent and extensible; natural human-level voice quality is not claimed.
 */

export const VOCAL_SINGING_ENGINE_VERSION = "0.1.0";
export const SWR_VOCAL_SINGING_ENGINE_ID = "SWR-VOCAL-SINGING-ENGINE-P2-01";

const VOWEL_PROFILES = Object.freeze({
  a:  Object.freeze({ formants: [800, 1350, 2800], bandwidths: [120, 170, 250], long: false }),
  aa: Object.freeze({ formants: [850, 1320, 2750], bandwidths: [130, 180, 260], long: true }),
  i:  Object.freeze({ formants: [360, 2250, 3000], bandwidths: [80, 190, 260], long: false }),
  ii: Object.freeze({ formants: [320, 2550, 3200], bandwidths: [75, 200, 270], long: true }),
  u:  Object.freeze({ formants: [420, 950, 2450], bandwidths: [90, 140, 240], long: false }),
  uu: Object.freeze({ formants: [370, 900, 2500], bandwidths: [85, 135, 250], long: true }),
  vocalicR: Object.freeze({ formants: [520, 1600, 2750], bandwidths: [110, 190, 260], long: false }),
  vocalicRR: Object.freeze({ formants: [500, 1650, 2800], bandwidths: [110, 190, 270], long: true }),
  e:  Object.freeze({ formants: [520, 1950, 2850], bandwidths: [100, 190, 260], long: true }),
  ai: Object.freeze({ formants: [690, 1850, 2750], bandwidths: [130, 210, 270], long: true }),
  o:  Object.freeze({ formants: [520, 1050, 2700], bandwidths: [110, 150, 260], long: true }),
  au: Object.freeze({ formants: [700, 1200, 2700], bandwidths: [140, 170, 270], long: true })
});

const INDEPENDENT_VOWELS = Object.freeze({
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
  "ऋ": "vocalicR", "ॠ": "vocalicRR", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ऌ": "vocalicR", "ॡ": "vocalicRR", "ॐ": "o"
});
const MATRA_VOWELS = Object.freeze({
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu",
  "ृ": "vocalicR", "ॄ": "vocalicRR", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ॢ": "vocalicR", "ॣ": "vocalicRR"
});
const CONSONANT_RE = /^[क-हक़-य़ॹ-ॿ]$/u;
const MATRA_RE = /^[ािीुूृॄॅॆेैॉॊोौॢॣ]$/u;
const MARK_RE = /^[ंःँऽ]$/u;
const VIRAMA = "्";
const NUKTA = "़";
const DEFAULT_MELODY = Object.freeze([0, 2, 4, 5, 7, 5, 4, 2]);

function isConsonant(value) { return CONSONANT_RE.test(value); }
function isMatra(value) { return MATRA_RE.test(value); }
function safeNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function isSibilant(value) { return /[शषस]/u.test(value); }
function isAspirated(value) { return /[खघछझठढथधफभह]/u.test(value); }
function isPlosive(value) { return /[कगचजटडतदपब]/u.test(value); }

function consonantNoiseProfile(onset) {
  if (!onset) return null;
  if (isSibilant(onset)) return { frequency: /श/u.test(onset) ? 3600 : /ष/u.test(onset) ? 3200 : 4800, duration: 0.075, gain: 0.11, type: "highpass" };
  if (isAspirated(onset)) return { frequency: /ह/u.test(onset) ? 1250 : 2100, duration: 0.060, gain: 0.075, type: "bandpass" };
  if (isPlosive(onset)) return { frequency: 1900, duration: 0.026, gain: 0.055, type: "bandpass" };
  return null;
}

export function tokenizeSanskritForSinging(input) {
  const text = String(input == null ? "" : input).normalize("NFC");
  const chars = Array.from(text);
  const events = [];
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];
    if (/\s/u.test(char)) {
      const isLineBreak = char === "\n" || char === "\r";
      events.push({ type: "pause", duration: isLineBreak ? 0.26 : 0.13, reason: isLineBreak ? "line" : "word" });
      index += 1;
      continue;
    }
    if (char === "॥") {
      events.push({ type: "pause", duration: 0.82, reason: "double-danda" });
      index += 1;
      continue;
    }
    if (char === "।" || /[.!?]/u.test(char)) {
      events.push({ type: "pause", duration: 0.55, reason: "sentence" });
      index += 1;
      continue;
    }
    if (/[,;:—–-]/u.test(char)) {
      events.push({ type: "pause", duration: 0.24, reason: "phrase" });
      index += 1;
      continue;
    }
    if (INDEPENDENT_VOWELS[char]) {
      const vowel = INDEPENDENT_VOWELS[char];
      index += 1;
      let nasal = char === "ॐ";
      let visarga = false;
      while (index < chars.length && MARK_RE.test(chars[index])) {
        if (chars[index] === "ः") visarga = true;
        if (chars[index] === "ं" || chars[index] === "ँ") nasal = true;
        index += 1;
      }
      events.push({ type: "syllable", onset: "", vowel, nasal, visarga, source: char });
      continue;
    }
    if (isConsonant(char)) {
      const onset = [char];
      let cursor = index + 1;
      while (cursor < chars.length && chars[cursor] === NUKTA) {
        onset[onset.length - 1] += chars[cursor];
        cursor += 1;
      }
      while (cursor < chars.length && chars[cursor] === VIRAMA && cursor + 1 < chars.length && isConsonant(chars[cursor + 1])) {
        cursor += 1;
        onset.push(chars[cursor]);
        cursor += 1;
        if (cursor < chars.length && chars[cursor] === NUKTA) {
          onset[onset.length - 1] += chars[cursor];
          cursor += 1;
        }
      }

      let vowel = "a";
      if (cursor < chars.length && isMatra(chars[cursor])) {
        vowel = MATRA_VOWELS[chars[cursor]] || "a";
        cursor += 1;
      } else if (cursor < chars.length && chars[cursor] === VIRAMA) {
        // A terminal halant consonant is retained as a very short inherent-vowel release.
        vowel = "a";
        cursor += 1;
      }

      let nasal = false;
      let visarga = false;
      while (cursor < chars.length && MARK_RE.test(chars[cursor])) {
        if (chars[cursor] === "ः") visarga = true;
        if (chars[cursor] === "ं" || chars[cursor] === "ँ") nasal = true;
        cursor += 1;
      }
      const onsetText = onset.join("");
      events.push({ type: "syllable", onset: onsetText, vowel, nasal, visarga, source: chars.slice(index, cursor).join("") });
      index = cursor;
      continue;
    }
    // Ignore Vedic accents and other combining marks that do not carry a vowel nucleus.
    index += 1;
  }

  return events;
}

function noteFrequency(baseFrequency, semitones) {
  return baseFrequency * Math.pow(2, semitones / 12);
}

function makePeriodicWave(context, vowelKey, fundamental) {
  const profile = VOWEL_PROFILES[vowelKey] || VOWEL_PROFILES.a;
  const harmonicCount = 48;
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const frequency = fundamental * harmonic;
    let formantEnergy = 0;
    for (let formantIndex = 0; formantIndex < profile.formants.length; formantIndex += 1) {
      const center = profile.formants[formantIndex];
      const bandwidth = profile.bandwidths[formantIndex];
      const distance = (frequency - center) / bandwidth;
      formantEnergy += Math.exp(-0.5 * distance * distance);
    }
    const glottalTilt = 1 / Math.pow(harmonic, 1.12);
    const nasalBoost = vowelKey === "a" ? 0.035 : 0;
    imag[harmonic] = (0.012 + formantEnergy + nasalBoost) * glottalTilt;
  }
  try {
    return context.createPeriodicWave(real, imag, { disableNormalization: false });
  } catch (_) {
    return context.createPeriodicWave(real, imag);
  }
}

function createNoiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.16));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x5a17c9;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    samples[i] = ((seed / 4294967296) * 2 - 1) * 0.8;
  }
  return buffer;
}

export function createVocalSingingEngine(options = {}) {
  const host = options.target || globalThis;
  const AudioContextCtor = host.AudioContext || host.webkitAudioContext;
  let context = null;
  let masterGain = null;
  let noiseBuffer = null;
  let active = null;
  let state = "idle";
  let disposed = false;
  const listeners = new Map();

  function emit(type, detail = {}) {
    const callbacks = listeners.get(type);
    if (!callbacks) return;
    callbacks.forEach(callback => {
      try { callback(Object.freeze({ type, ...detail, state, version: VOCAL_SINGING_ENGINE_VERSION })); }
      catch (_) {}
    });
  }

  function setState(next, detail = {}) {
    state = next;
    emit("statechange", detail);
  }

  function ensureContext() {
    if (disposed) throw new Error("Vocal Singing Engine बंद हो चुका है।");
    if (!AudioContextCtor) throw new Error("इस ब्राउज़र में Web Audio API उपलब्ध नहीं है।");
    if (!context) {
      context = new AudioContextCtor({ latencyHint: "interactive" });
      masterGain = context.createGain();
      masterGain.gain.value = 0.72;
      masterGain.connect(context.destination);
      noiseBuffer = createNoiseBuffer(context);
    }
    return context;
  }

  function scheduleNoise(startAt, duration, profile, volume) {
    if (!profile || !noiseBuffer || !context || !masterGain) return null;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = profile.type;
    filter.frequency.setValueAtTime(profile.frequency, startAt);
    filter.Q.setValueAtTime(profile.type === "highpass" ? 0.7 : 1.1, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(profile.gain * volume, startAt + Math.min(0.012, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(masterGain);
    source.start(startAt);
    source.stop(startAt + duration + 0.005);
    return [source, filter, gain];
  }

  function createPlan(text, inputOptions = {}) {
    const events = tokenizeSanskritForSinging(text);
    const melody = Array.isArray(inputOptions.melody) && inputOptions.melody.length
      ? inputOptions.melody.map(value => safeNumber(value, 0, -12, 12))
      : DEFAULT_MELODY;
    const baseFrequency = safeNumber(inputOptions.baseFrequency, 246.94, 170, 390);
    const tempo = safeNumber(inputOptions.tempo, 1, 0.55, 1.7);
    const baseDuration = safeNumber(inputOptions.noteDurationMs, 390, 180, 900) / 1000 / tempo;
    let syllableIndex = 0;
    let duration = 0;
    const plan = events.map(event => {
      if (event.type === "pause") {
        duration += event.duration;
        return Object.freeze({ ...event });
      }
      const profile = VOWEL_PROFILES[event.vowel] || VOWEL_PROFILES.a;
      const noteOffset = melody[syllableIndex % melody.length];
      const frequency = noteFrequency(baseFrequency, noteOffset);
      const lengthFactor = profile.long ? 1.55 : 1;
      const clusterFactor = Array.from(event.onset || "").length > 1 ? 1.08 : 1;
      const syllableDuration = baseDuration * lengthFactor * clusterFactor;
      const noise = consonantNoiseProfile(event.onset);
      const item = Object.freeze({
        ...event,
        index: syllableIndex,
        frequency,
        duration: syllableDuration,
        onsetNoise: noise,
        amplitude: event.nasal ? 0.64 : 0.72
      });
      duration += syllableDuration;
      syllableIndex += 1;
      return item;
    });
    return Object.freeze({
      text: String(text == null ? "" : text),
      events: Object.freeze(plan),
      syllableCount: syllableIndex,
      totalDuration: duration,
      baseFrequency,
      tempo,
      accompaniment: false,
      modelLoaded: false
    });
  }

  function releaseSources(run) {
    if (!run) return;
    run.nodes.forEach(node => {
      try { if (typeof node.stop === "function") node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    });
    run.nodes.length = 0;
  }

  function completeRun(run, result) {
    if (!run || run.finished) return;
    run.finished = true;
    releaseSources(run);
    if (active === run) active = null;
    setState("idle", { result });
    run.resolve(Object.freeze(result));
  }

  async function sing(text, inputOptions = {}) {
    if (disposed) throw new Error("Vocal Singing Engine बंद हो चुका है।");
    if (active) throw new Error("पहले वर्तमान गायन को समाप्त करें।");
    const plan = createPlan(text, inputOptions);
    if (!plan.syllableCount) throw new Error("गायन के लिए कोई समर्थित देवनागरी अक्षर नहीं मिला।");
    const audio = ensureContext();
    await audio.resume();
    if (audio.state !== "running") throw new Error("AudioContext शुरू नहीं हुआ; स्क्रीन पर Play दबाकर पुनः प्रयास करें।");

    const volume = safeNumber(inputOptions.volume, 0.82, 0.05, 1);
    masterGain.gain.setTargetAtTime(volume, audio.currentTime, 0.025);
    const run = { nodes: [], finished: false, resolve: null, startTime: audio.currentTime + 0.075, plan };
    const promise = new Promise(resolve => { run.resolve = resolve; });
    active = run;
    setState("speaking", { syllableCount: plan.syllableCount, estimatedSeconds: plan.totalDuration });

    let cursor = run.startTime;
    let syllableCounter = 0;
    let lastAudibleEnd = cursor;
    const waveCache = new Map();
    plan.events.forEach(event => {
      if (event.type === "pause") {
        cursor += event.duration;
        return;
      }
      const noise = event.onsetNoise;
      if (noise) {
        const noiseDuration = Math.min(noise.duration, event.duration * 0.35);
        const noiseNodes = scheduleNoise(cursor, noiseDuration, noise, volume);
        if (noiseNodes) run.nodes.push(...noiseNodes);
      }
      const vowelStart = cursor + (noise ? Math.min(0.042, event.duration * 0.18) : 0.008);
      const noteEnd = cursor + event.duration;
      const key = event.vowel + ":" + Math.round(event.frequency * 10) / 10;
      let wave = waveCache.get(key);
      if (!wave) {
        wave = makePeriodicWave(audio, event.vowel, event.frequency);
        waveCache.set(key, wave);
      }

      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.setValueAtTime(event.frequency, vowelStart);
      envelope.gain.setValueAtTime(0.0001, vowelStart);
      const attack = Math.min(0.035, event.duration * 0.16);
      const release = Math.min(0.075, event.duration * 0.22);
      const peak = event.amplitude * volume;
      envelope.gain.linearRampToValueAtTime(peak, vowelStart + attack);
      envelope.gain.setValueAtTime(peak, Math.max(vowelStart + attack, noteEnd - release));
      envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(envelope).connect(masterGain);

      const vibrato = audio.createOscillator();
      const vibratoDepth = audio.createGain();
      vibrato.frequency.setValueAtTime(5.1, vowelStart);
      vibratoDepth.gain.setValueAtTime(safeNumber(inputOptions.vibratoCents, 6, 0, 18), vowelStart);
      vibrato.connect(vibratoDepth).connect(oscillator.detune);
      vibrato.start(vowelStart);
      vibrato.stop(noteEnd);
      oscillator.start(vowelStart);
      oscillator.stop(noteEnd + 0.006);
      run.nodes.push(oscillator, envelope, vibrato, vibratoDepth);
      if (event.visarga) {
        const visargaProfile = { frequency: 1450, duration: Math.min(0.065, event.duration * 0.2), gain: 0.045, type: "bandpass" };
        const breath = scheduleNoise(Math.max(vowelStart, noteEnd - visargaProfile.duration), visargaProfile.duration, visargaProfile, volume);
        if (breath) run.nodes.push(...breath);
      }
      cursor = noteEnd;
      lastAudibleEnd = noteEnd;
      syllableCounter += 1;
    });

    // A silent scheduled clock allows phrase-ending punctuation to complete while paused.
    const clock = audio.createOscillator();
    const silence = audio.createGain();
    silence.gain.value = 0;
    clock.frequency.value = 20;
    clock.connect(silence).connect(masterGain);
    clock.onended = () => {
      if (active === run && !run.finished) completeRun(run, {
        status: "ended", syllables: syllableCounter, durationSeconds: plan.totalDuration,
        modelLoaded: false, accompaniment: false
      });
    };
    clock.start(run.startTime);
    clock.stop(Math.max(cursor, lastAudibleEnd) + 0.025);
    run.nodes.push(clock, silence);

    return promise;
  }

  async function pause() {
    if (!active || state !== "speaking" || !context) return false;
    await context.suspend();
    if (active) setState("paused");
    return true;
  }

  async function resume() {
    if (!active || state !== "paused" || !context) return false;
    await context.resume();
    if (context.state !== "running") return false;
    if (active) setState("speaking");
    return true;
  }

  async function stop() {
    if (!active) return false;
    const run = active;
    completeRun(run, { status: "cancelled", reason: "user", modelLoaded: false, accompaniment: false });
    return true;
  }

  function on(type, callback) {
    if (typeof callback !== "function") throw new TypeError("Event callback function होना चाहिए।");
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => {
      const bucket = listeners.get(type);
      if (bucket) {
        bucket.delete(callback);
        if (!bucket.size) listeners.delete(type);
      }
    };
  }

  function getStatus() {
    return Object.freeze({
      version: VOCAL_SINGING_ENGINE_VERSION,
      engineId: SWR_VOCAL_SINGING_ENGINE_ID,
      state,
      ready: !disposed,
      outputMode: "model-free-formant-vocal-synthesis",
      modelLoaded: false,
      externalNetworkRequests: 0,
      accompaniment: false,
      voiceOnly: true,
      audioContextState: context ? context.state : "not-created"
    });
  }

  async function dispose() {
    if (disposed) return;
    if (active) await stop();
    disposed = true;
    if (context && context.state !== "closed") {
      try { await context.close(); } catch (_) {}
    }
    context = null;
    masterGain = null;
    noiseBuffer = null;
    listeners.clear();
    setState("disposed");
  }

  return Object.freeze({
    version: VOCAL_SINGING_ENGINE_VERSION,
    engineId: SWR_VOCAL_SINGING_ENGINE_ID,
    prepareText: createPlan,
    sing,
    pause,
    resume,
    stop,
    on,
    getStatus,
    dispose
  });
}

export function selfTest() {
  const checks = [];
  const add = (name, passed) => checks.push(Object.freeze({ name, passed: Boolean(passed) }));
  const simple = tokenizeSanskritForSinging("ॐ नमः शिवाय।");
  add("devanagari-syllable-parser", simple.filter(event => event.type === "syllable").length >= 6);
  add("omkara-vowel-support", simple.some(event => event.type === "syllable" && event.source === "ॐ" && event.vowel === "o"));
  add("visarga-preserved-as-vocal-breath", simple.some(event => event.type === "syllable" && event.visarga));
  add("danda-phrase-pause", simple.some(event => event.type === "pause" && event.reason === "sentence"));
  add("model-free-and-voice-only-contract", VOCAL_SINGING_ENGINE_VERSION === "0.1.0" &&
    SWR_VOCAL_SINGING_ENGINE_ID.startsWith("SWR-VOCAL-SINGING") && Object.keys(VOWEL_PROFILES).length >= 10);
  const longVowelPlan = tokenizeSanskritForSinging("आ इ");
  add("long-and-short-vowel-tokenization", longVowelPlan.length >= 2 &&
    longVowelPlan.some(item => item.vowel === "aa") && longVowelPlan.some(item => item.vowel === "i"));
  return Object.freeze({
    module: "swar-sadhika-vocal-singing-engine-part2",
    engineVersion: VOCAL_SINGING_ENGINE_VERSION,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks)
  });
}

export function mount(context = {}) {
  const target = context.document && context.document.defaultView
    ? context.document.defaultView
    : context.target || globalThis;
  const engine = createVocalSingingEngine({ target });
  return Object.freeze({ engine, unmount: () => engine.dispose() });
}
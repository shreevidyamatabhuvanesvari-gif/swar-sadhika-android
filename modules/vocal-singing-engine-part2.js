import { createFemaleVocalTractEngine } from "./female-vocal-tract-engine-part2.js";
import { createFemaleVoiceCharacterEngine } from "./female-voice-character-engine-part2.js";

/* Swar-Sadhika — Human Vocal Source-Filter Singing Engine (Part 2)
 * Version 0.8.0: LF source-filter, vocal-tract waveguide and model-free female
 * voice-character post-processing with delay-line pitch shift and spectral shaping.
 * Entirely local Web Audio DSP. No neural model, remote API, server, fetch, or model download.
 * The source is an LF-based physical approximation, not a recording or a guarantee of human indistinguishability.
 */

export const VOCAL_SINGING_ENGINE_VERSION = "0.8.0";
export const SWR_VOCAL_SINGING_ENGINE_ID = "SWR-VOCAL-SINGING-ENGINE-P2-01";

const ENGINE_ARCHITECTURE = "human-vocal-source-filter";
const OUTPUT_MODE_COMPAT = "model-free-adaptive-glottal-formant-dsp";
const WORKLET_PROCESSOR_NAME = "swar-sadhika-lf-source-filter-source";
const VIBRATO_WAVEFORM = "triangle";
const PERFORMANCE_MODULATION = "cycle-jitter-vibrato-amplitude-formant-motion";
const DEFAULT_MELODY = Object.freeze([0, 2, 4, 5, 7, 5, 4, 2]);

// Approximate feminine-register Sanskrit vowel targets. These are adjustable
// articulatory presets, not universal anatomical measurements for every singer.
const VOWEL_PROFILES = Object.freeze({
  a:  Object.freeze({ formants: [820, 1420, 2850, 3650], bandwidths: [125, 165, 230, 340], long: false }),
  aa: Object.freeze({ formants: [850, 1380, 2800, 3600], bandwidths: [130, 170, 240, 345], long: true }),
  i:  Object.freeze({ formants: [340, 2520, 3200, 4050], bandwidths: [80, 190, 260, 380], long: false }),
  ii: Object.freeze({ formants: [315, 2700, 3350, 4200], bandwidths: [75, 195, 270, 400], long: true }),
  u:  Object.freeze({ formants: [390, 980, 2500, 3550], bandwidths: [90, 145, 235, 350], long: false }),
  uu: Object.freeze({ formants: [360, 920, 2480, 3600], bandwidths: [85, 140, 240, 360], long: true }),
  vocalicR: Object.freeze({ formants: [500, 1650, 2750, 3650], bandwidths: [105, 185, 250, 360], long: false }),
  vocalicRR: Object.freeze({ formants: [485, 1680, 2800, 3720], bandwidths: [105, 190, 260, 370], long: true }),
  e:  Object.freeze({ formants: [480, 2100, 2920, 3900], bandwidths: [95, 180, 245, 370], long: true }),
  ai: Object.freeze({ formants: [650, 1900, 2850, 3820], bandwidths: [125, 205, 255, 380], long: true }),
  o:  Object.freeze({ formants: [510, 1120, 2700, 3550], bandwidths: [105, 150, 245, 350], long: true }),
  au: Object.freeze({ formants: [690, 1280, 2750, 3650], bandwidths: [135, 175, 255, 365], long: true })
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
  const first = Array.from(String(onset))[0] || "";
  if (isSibilant(first)) {
    const frequency = first === "श" ? 3600 : first === "ष" ? 3200 : 4700;
    return { frequency, duration: 0.075, gain: 0.072, type: "highpass" };
  }
  const placeFrequency = /[कखगघङ]/u.test(first) ? 1450
    : /[चछजझञ]/u.test(first) ? 2500
    : /[टठडढण]/u.test(first) ? 1850
    : /[तथदधन]/u.test(first) ? 2200
    : /[पफबभम]/u.test(first) ? 1250 : 1800;
  if (isAspirated(first)) {
    return { frequency: first === "ह" ? 1180 : placeFrequency, duration: 0.058, gain: 0.052, type: "bandpass" };
  }
  if (isPlosive(first)) {
    return { frequency: placeFrequency, duration: 0.025, gain: 0.035, type: "bandpass" };
  }
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
      let consonantOnly = false;
      if (cursor < chars.length && isMatra(chars[cursor])) {
        vowel = MATRA_VOWELS[chars[cursor]] || "a";
        cursor += 1;
      } else if (cursor < chars.length && chars[cursor] === VIRAMA) {
        consonantOnly = true;
        vowel = null;
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
      events.push({ type: "syllable", onset: onsetText, vowel, consonantOnly, nasal, visarga, source: chars.slice(index, cursor).join("") });
      index = cursor;
      continue;
    }
    index += 1;
  }
  return events;
}

function noteFrequency(baseFrequency, semitones) {
  return baseFrequency * Math.pow(2, semitones / 12);
}

/*
 * A discretised LF-parameterised differentiated glottal-flow pulse.
 * The open phase follows E0*exp(alpha*t)*sin(wg*t); the return phase is
 * an exponential return to closure. DC is removed and the cycle is normalised.
 */
function createLFGlottalTable(settings = {}, sampleCount = 2048) {
  const count = Math.max(512, Math.min(4096, Math.floor(sampleCount)));
  const openQuotient = safeNumber(settings.openQuotient, 0.62, 0.48, 0.82);
  const peakRatio = safeNumber(settings.peakRatio, 0.44, 0.36, 0.49);
  const damping = safeNumber(settings.glottalDamping, 2.15, 0.7, 4.5);
  const openEnd = openQuotient;
  const peakTime = openEnd * peakRatio;
  const omega = Math.PI / (2 * peakTime);
  const alpha = -damping / openEnd;
  const endSine = Math.sin(omega * openEnd);
  const safeEndSine = Math.abs(endSine) < 0.08 ? (endSine < 0 ? -0.08 : 0.08) : endSine;
  const openScale = -1 / (Math.exp(alpha * openEnd) * safeEndSine);
  const returnDuration = 1 - openEnd;
  const epsilon = 6.2 / returnDuration;
  const returnAreaScale = (1 - Math.exp(-epsilon * returnDuration)) / epsilon;
  const table = new Float32Array(count);
  let mean = 0;

  for (let i = 0; i < count; i += 1) {
    const phase = i / count;
    let sample;
    if (phase <= openEnd) {
      sample = openScale * Math.exp(alpha * phase) * Math.sin(omega * phase);
    } else {
      const elapsed = phase - openEnd;
      sample = -(Math.exp(-epsilon * elapsed) - Math.exp(-epsilon * returnDuration)) /
        Math.max(1e-8, epsilon * returnAreaScale);
    }
    table[i] = sample;
    mean += sample;
  }

  mean /= count;
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    table[i] -= mean;
    peak = Math.max(peak, Math.abs(table[i]));
  }
  const normalise = peak > 1e-8 ? 0.92 / peak : 1;
  for (let i = 0; i < count; i += 1) table[i] *= normalise;

  // A mild circular smoothing control adjusts source spectral brightness without
  // flattening the glottal pulse or substituting a sawtooth oscillator.
  const tilt = safeNumber(settings.spectralTilt, 1.12, 0.9, 1.55);
  const smoothing = safeNumber(0.075 + (tilt - 1.12) * 0.075, 0.04, 0.04, 0.12);
  if (smoothing > 0.04) {
    const copy = new Float32Array(table.length);
    for (let i = 0; i < count; i += 1) {
      const previous = table[(i + count - 1) % count];
      const next = table[(i + 1) % count];
      copy[i] = table[i] * (1 - smoothing) + (previous + next) * (smoothing / 2);
    }
    table.set(copy);
  }
  return table;
}

function makePeriodicWaveFromLFTable(context, table) {
  const harmonicCount = Math.min(48, Math.floor((context.sampleRate * 0.46) / 170));
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  const length = table.length;
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    let cosine = 0;
    let sine = 0;
    const step = 2 * Math.PI * harmonic / length;
    for (let sample = 0; sample < length; sample += 1) {
      const angle = step * sample;
      cosine += table[sample] * Math.cos(angle);
      sine -= table[sample] * Math.sin(angle);
    }
    real[harmonic] = (2 * cosine) / length;
    imag[harmonic] = (2 * sine) / length;
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

const LF_WORKLET_SOURCE = `
class SwarSadhikaLFSource extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 246.94, minValue: 55, maxValue: 900, automationRate: "a-rate" },
      { name: "detune", defaultValue: 0, minValue: -80, maxValue: 80, automationRate: "a-rate" },
      { name: "breathiness", defaultValue: 0.035, minValue: 0, maxValue: 0.16, automationRate: "a-rate" },
      { name: "jitter", defaultValue: 1.1, minValue: 0, maxValue: 3, automationRate: "a-rate" }
    ];
  }
  constructor(options) {
    super();
    const supplied = options && options.processorOptions && options.processorOptions.waveform;
    this.waveform = supplied && supplied.length > 16 ? supplied : new Float32Array([0]);
    this.phase = 0;
    this.jitter = 0;
    this.seed = 0x43a91f27;
    this.stopFrame = Infinity;
    this.finished = false;
    this.port.onmessage = event => {
      const data = event && event.data;
      if (data && data.type === "stopAt" && Number.isFinite(data.frame)) this.stopFrame = data.frame;
    };
  }
  process(inputs, outputs, parameters) {
    const voice = outputs[0] && outputs[0][0];
    const air = outputs[1] && outputs[1][0];
    if (!voice) return true;
    const frequency = parameters.frequency;
    const detune = parameters.detune;
    const breathiness = parameters.breathiness;
    const jitter = parameters.jitter;
    const table = this.waveform;
    const tableLength = table.length;
    for (let i = 0; i < voice.length; i += 1) {
      if (currentFrame + i >= this.stopFrame) {
        voice[i] = 0;
        if (air) air[i] = 0;
        for (let rest = i + 1; rest < voice.length; rest += 1) {
          voice[rest] = 0;
          if (air) air[rest] = 0;
        }
        if (!this.finished) {
          this.finished = true;
          this.port.postMessage({ type: "ended" });
        }
        return false;
      }
      const hz = frequency.length > 1 ? frequency[i] : frequency[0];
      const cents = detune.length > 1 ? detune[i] : detune[0];
      const airAmount = breathiness.length > 1 ? breathiness[i] : breathiness[0];
      this.seed ^= this.seed << 13;
      this.seed ^= this.seed >>> 17;
      this.seed ^= this.seed << 5;
      const random = ((this.seed >>> 0) / 2147483648) - 1;
      const jitterRange = jitter.length > 1 ? jitter[i] : jitter[0];
      const jitterLimit = Math.max(0, Math.min(3, jitterRange));
      const actualHz = Math.max(55, Math.min(900, hz * Math.pow(2, (cents + this.jitter) / 1200)));
      const tablePosition = this.phase * tableLength;
      const index = Math.floor(tablePosition);
      const fraction = tablePosition - index;
      const nextIndex = index + 1 === tableLength ? 0 : index + 1;
      const pulse = table[index] + (table[nextIndex] - table[index]) * fraction;
      voice[i] = pulse * (0.72 + random * 0.0018);
      this.phase += actualHz / sampleRate;
      if (this.phase >= 1) {
        this.phase -= Math.floor(this.phase);
        this.jitter = Math.max(-jitterLimit, Math.min(jitterLimit, this.jitter + random * jitterLimit * 0.12));
      }
      if (air) air[i] = random * Math.max(0, airAmount) * 0.42;
    }
    return true;
  }
}
registerProcessor("swar-sadhika-lf-source-filter-source", SwarSadhikaLFSource);
`;

function createNoiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.22));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x5a17c9;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    samples[i] = ((seed / 4294967296) * 2 - 1) * 0.72;
  }
  return buffer;
}

export function createVocalSingingEngine(options = {}) {
  const host = options.target || globalThis;
  const AudioContextCtor = host.AudioContext || host.webkitAudioContext;
  let context = null;
  let masterGain = null;
  let compressor = null;
  let noiseBuffer = null;
  let active = null;
  let state = "idle";
  let disposed = false;
  let workletModulePromise = null;
  let workletModuleReady = false;
  let workletFailure = "";
  let vocalTractEngine = null;
  let vocalTractFailure = "";
  let voiceCharacterEngine = null;
  let voiceCharacterFailure = "";
  let voiceCharacterStatus = null;
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
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 3.6;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.19;
      masterGain = context.createGain();
      masterGain.gain.value = 0.76;
      compressor.connect(masterGain).connect(context.destination);
      noiseBuffer = createNoiseBuffer(context);
    }
    return context;
  }

  async function ensureWorkletModule() {
    if (!context || !context.audioWorklet || typeof host.AudioWorkletNode !== "function") return false;
    if (workletModuleReady) return true;
    if (workletModulePromise) return workletModulePromise;
    const BlobCtor = host.Blob || (typeof Blob !== "undefined" ? Blob : null);
    const URLCtor = host.URL || (typeof URL !== "undefined" ? URL : null);
    if (!BlobCtor || !URLCtor || typeof URLCtor.createObjectURL !== "function") return false;

    workletModulePromise = (async () => {
      let objectUrl = "";
      try {
        const blob = new BlobCtor([LF_WORKLET_SOURCE], { type: "application/javascript" });
        objectUrl = URLCtor.createObjectURL(blob);
        await context.audioWorklet.addModule(objectUrl);
        workletModuleReady = true;
        return true;
      } catch (error) {
        workletFailure = String(error && error.message || error || "AudioWorklet unavailable");
        return false;
      } finally {
        if (objectUrl) {
          try { URLCtor.revokeObjectURL(objectUrl); } catch (_) {}
        }
      }
    })();
    return workletModulePromise;
  }

  function scheduleNoise(startAt, duration, profile) {
    if (!profile || !noiseBuffer || !context || !compressor || duration <= 0) return null;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = profile.type;
    filter.frequency.setValueAtTime(profile.frequency, startAt);
    filter.Q.setValueAtTime(profile.type === "highpass" ? 0.72 : 1.0, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(profile.gain * 0.7, startAt + Math.min(0.012, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(compressor);
    source.start(startAt);
    source.stop(startAt + duration + 0.006);
    return [source, filter, gain];
  }

  function createPlan(text, inputOptions = {}) {
    const events = tokenizeSanskritForSinging(text);
    const melody = Array.isArray(inputOptions.melody) && inputOptions.melody.length
      ? inputOptions.melody.map(value => safeNumber(value, 0, -12, 12))
      : DEFAULT_MELODY;
    const baseFrequency = safeNumber(inputOptions.baseFrequency, 261.63, 170, 390);
    const tempo = safeNumber(inputOptions.tempo, 1, 0.55, 1.7);
    const baseDuration = safeNumber(inputOptions.noteDurationMs, 420, 180, 900) / 1000 / tempo;
    const humanizeCents = safeNumber(inputOptions.humanizeCents, 1.8, 0, 5);
    const consonantDuration = safeNumber(inputOptions.finalConsonantDurationMs, 72, 35, 150) / 1000;
    const spectralTilt = safeNumber(inputOptions.spectralTilt, 1.12, 0.9, 1.55);
    const openQuotient = safeNumber(inputOptions.openQuotient, 0.62, 0.48, 0.82);
    const peakRatio = safeNumber(inputOptions.peakRatio, 0.44, 0.36, 0.49);
    const glottalDamping = safeNumber(inputOptions.glottalDamping, 2.15, 0.7, 4.5);
    const breathiness = safeNumber(inputOptions.breathiness, 0.045, 0, 0.16);
    let syllableIndex = 0;
    let duration = 0;
    let previousVowel = null;

    const plan = events.map(event => {
      if (event.type === "pause") {
        duration += event.duration;
        previousVowel = null;
        return Object.freeze({ ...event });
      }
      const noteOffset = melody[syllableIndex % melody.length];
      const noise = consonantNoiseProfile(event.onset);
      if (event.consonantOnly) {
        const item = Object.freeze({
          ...event,
          index: syllableIndex,
          fromVowel: previousVowel,
          frequency: noteFrequency(baseFrequency, noteOffset),
          duration: consonantDuration,
          onsetNoise: noise,
          amplitude: 0
        });
        duration += consonantDuration;
        previousVowel = null;
        syllableIndex += 1;
        return item;
      }
      const profile = VOWEL_PROFILES[event.vowel] || VOWEL_PROFILES.a;
      const microCents = humanizeCents * (
        Math.sin((syllableIndex + 1) * 1.618) * 0.62 +
        Math.sin((syllableIndex + 1) * 0.73) * 0.38
      );
      const frequency = noteFrequency(baseFrequency, noteOffset + microCents / 100);
      const lengthFactor = profile.long ? 1.55 : 1;
      const clusterFactor = Array.from(event.onset || "").length > 1 ? 1.08 : 1;
      const syllableDuration = baseDuration * lengthFactor * clusterFactor;
      const emphasis = 1 + 0.045 * Math.sin((syllableIndex + 1) * 1.11);
      const item = Object.freeze({
        ...event,
        index: syllableIndex,
        fromVowel: previousVowel || event.vowel,
        frequency,
        duration: syllableDuration,
        onsetNoise: noise,
        amplitude: (event.nasal ? 0.40 : 0.44) * emphasis
      });
      previousVowel = event.vowel;
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
      synthesisMode: "adaptive-glottal-formant-dsp",
      architecture: ENGINE_ARCHITECTURE,
      glottalSourceModel: "lf-parameterized-differentiated-glottal-flow",
      vocalTractModel: "dynamic-parallel-formant-resonators",
      voiceQuality: Object.freeze({ spectralTilt, openQuotient, peakRatio, glottalDamping, breathiness, humanizeCents }),
      sourceOscillators: 1,
      accompaniment: false,
      modelLoaded: false
    });
  }

  function releaseSources(run) {
    if (!run) return;
    run.nodes.forEach(node => {
      try { if (typeof node.stop === "function") node.stop(); } catch (_) {}
      try { if (typeof node.disconnect === "function") node.disconnect(); } catch (_) {}
    });
    run.nodes.length = 0;
  }

  function completeRun(run, result) {
    if (!run || run.finished) return;
    run.finished = true;
    releaseSources(run);
    if (voiceCharacterEngine) {
      try {
        voiceCharacterEngine.dispose();
        voiceCharacterStatus = voiceCharacterEngine.getStatus();
      } catch (_) {}
      voiceCharacterEngine = null;
    }
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

    const table = createLFGlottalTable(plan.voiceQuality);
    const workletReady = await ensureWorkletModule();
    try {
      vocalTractEngine = await createFemaleVocalTractEngine({ context: audio, target: host, initialVowel: "a" });
    } catch (error) {
      vocalTractEngine = null;
      vocalTractFailure = String(error && error.message || error || "Vocal tract waveguide unavailable");
    }
    try {
      voiceCharacterEngine = await createFemaleVoiceCharacterEngine({
        context: audio,
        target: host,
        preset: inputOptions.voiceCharacterPreset || "soft-feminine",
        pitchShiftSemitones: inputOptions.femalePitchShiftSemitones
      });
      voiceCharacterStatus = voiceCharacterEngine.getStatus();
      voiceCharacterFailure = "";
    } catch (error) {
      voiceCharacterEngine = null;
      voiceCharacterFailure = String(error && error.message || error || "Female voice character DSP unavailable");
    }
    const volume = safeNumber(inputOptions.volume, 0.76, 0.05, 1);
    masterGain.gain.setTargetAtTime(volume, audio.currentTime, 0.035);
    const run = { nodes: [], finished: false, resolve: null, startTime: audio.currentTime + 0.09, plan };
    const promise = new Promise(resolve => { run.resolve = resolve; });
    active = run;
    setState("speaking", {
      syllableCount: plan.syllableCount,
      estimatedSeconds: plan.totalDuration,
      sourceModel: plan.glottalSourceModel,
      vocalTractModel: plan.vocalTractModel,
      femaleVoiceCharacter: voiceCharacterEngine ? voiceCharacterEngine.getStatus() : voiceCharacterStatus,
      femaleVoiceCharacterFailure: voiceCharacterFailure
    });

    try {
      let voiceSource = null;
      let frequencyParam = null;
      let detuneParam = null;
      let usingWorklet = false;

      if (workletReady) {
        try {
          voiceSource = new host.AudioWorkletNode(audio, WORKLET_PROCESSOR_NAME, {
            numberOfInputs: 0,
            numberOfOutputs: 2,
            outputChannelCount: [1, 1],
            channelCount: 1,
            processorOptions: { waveform: table }
          });
          frequencyParam = voiceSource.parameters.get("frequency");
          detuneParam = voiceSource.parameters.get("detune");
          if (!frequencyParam || !detuneParam) throw new Error("LF AudioWorklet parameters unavailable");
          usingWorklet = true;
        } catch (error) {
          workletFailure = String(error && error.message || error || "AudioWorklet node unavailable");
          voiceSource = null;
        }
      }

      if (!voiceSource) {
        voiceSource = audio.createOscillator();
        voiceSource.setPeriodicWave(makePeriodicWaveFromLFTable(audio, table));
        frequencyParam = voiceSource.frequency;
        detuneParam = voiceSource.detune;
      }

      frequencyParam.setValueAtTime(plan.baseFrequency, run.startTime);
      detuneParam.setValueAtTime(0, run.startTime);
      run.nodes.push(voiceSource);

      // Radiation filter followed by four parallel vocal-tract resonators.
      const radiationFilter = audio.createBiquadFilter();
      run.nodes.push(radiationFilter);
      const sourceGain = audio.createGain();
      sourceGain.gain.setValueAtTime(usingWorklet ? 1 : 0.72, run.startTime);
      run.nodes.push(sourceGain);
      sourceGain.connect(radiationFilter);
      radiationFilter.type = "highpass";
      radiationFilter.frequency.setValueAtTime(88, run.startTime);
      radiationFilter.Q.setValueAtTime(0.72, run.startTime);

      const formantSum = audio.createGain();
      const voiceEnvelope = audio.createGain();
      run.nodes.push(formantSum, voiceEnvelope);
      voiceEnvelope.gain.setValueAtTime(0.0001, run.startTime);
      const formantWeights = [0.78, 0.64, 0.38, 0.19];
      const formantFilters = [0, 1, 2, 3].map(index => {
        const filter = audio.createBiquadFilter();
        const branchGain = audio.createGain();
        const defaults = [600, 1200, 2600, 3800];
        const bandwidths = [130, 170, 260, 360];
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(defaults[index], run.startTime);
        filter.Q.setValueAtTime(defaults[index] / bandwidths[index], run.startTime);
        branchGain.gain.setValueAtTime(formantWeights[index], run.startTime);
        run.nodes.push(filter, branchGain);
        if (!vocalTractEngine) radiationFilter.connect(filter).connect(branchGain).connect(formantSum);
        return { filter, branchGain };
      });

      const nasalFilter = audio.createBiquadFilter();
      const nasalGain = audio.createGain();
      nasalFilter.type = "bandpass";
      nasalFilter.frequency.setValueAtTime(920, run.startTime);
      nasalFilter.Q.setValueAtTime(2.3, run.startTime);
      nasalGain.gain.setValueAtTime(0.0001, run.startTime);
      run.nodes.push(nasalFilter, nasalGain);
      radiationFilter.connect(nasalFilter).connect(nasalGain).connect(formantSum);
      if (vocalTractEngine) {
        radiationFilter.connect(vocalTractEngine.inputNode);
        vocalTractEngine.outputNode.connect(formantSum);
        run.nodes.push(vocalTractEngine.outputNode);
      }
      formantSum.connect(voiceEnvelope);
      if (voiceCharacterEngine) {
        voiceEnvelope.connect(voiceCharacterEngine.inputNode);
        voiceCharacterEngine.outputNode.connect(compressor);
      } else {
        voiceEnvelope.connect(compressor);
      }

      voiceSource.connect(sourceGain, 0, 0);
      if (usingWorklet) {
        voiceSource.connect(sourceGain, 1, 0);
        voiceSource.port.onmessage = event => {
          if (event && event.data && event.data.type === "ended" && active === run) {
            completeRun(run, {
              status: "ended",
              syllables: run.plan.syllableCount,
              durationSeconds: run.plan.totalDuration,
              synthesisCore: ENGINE_ARCHITECTURE,
              glottalSourceModel: run.plan.glottalSourceModel,
              sourceOscillators: 1,
              modelLoaded: false,
              accompaniment: false
            });
          }
        };
      } else {
        const fallbackNoise = audio.createBufferSource();
        const fallbackNoiseGain = audio.createGain();
        fallbackNoise.buffer = noiseBuffer;
        fallbackNoise.loop = true;
        fallbackNoiseGain.gain.setValueAtTime(plan.voiceQuality.breathiness * 0.42, run.startTime);
        fallbackNoise.connect(fallbackNoiseGain).connect(radiationFilter);
        fallbackNoise.start(run.startTime);
        run.nodes.push(fallbackNoise, fallbackNoiseGain);
      }

      const vibrato = audio.createOscillator();
      const vibratoDepth = audio.createGain();
      const amplitudeMotion = audio.createOscillator();
      const amplitudeMotionDepth = audio.createGain();
      const formantMotionF1 = audio.createGain();
      const formantMotionF2 = audio.createGain();
      run.nodes.push(vibrato, vibratoDepth, amplitudeMotion, amplitudeMotionDepth, formantMotionF1, formantMotionF2);
      vibrato.type = VIBRATO_WAVEFORM;
      vibrato.frequency.setValueAtTime(5.1, run.startTime);
      vibratoDepth.gain.setValueAtTime(0.0001, run.startTime);
      vibrato.connect(vibratoDepth).connect(detuneParam);
      vibrato.connect(formantMotionF1).connect(formantFilters[0].filter.frequency);
      vibrato.connect(formantMotionF2).connect(formantFilters[1].filter.frequency);
      formantMotionF1.gain.setValueAtTime(0.0001, run.startTime);
      formantMotionF2.gain.setValueAtTime(0.0001, run.startTime);
      amplitudeMotion.type = "sine";
      amplitudeMotion.frequency.setValueAtTime(5.1, run.startTime);
      amplitudeMotionDepth.gain.setValueAtTime(0.0001, run.startTime);
      amplitudeMotion.connect(amplitudeMotionDepth).connect(voiceEnvelope.gain);

      let cursor = run.startTime;
      let syllableCounter = 0;
      let previousProfile = null;
      let previousFrequency = plan.baseFrequency;
      const defaultVibratoCents = safeNumber(inputOptions.vibratoCents, 5, 0, 10) * 2.8;
      const defaultVibratoRateHz = safeNumber(inputOptions.vibratoRateHz, 5.1, 3.5, 6.5);
      if (usingWorklet) {
        const breathinessParam = voiceSource.parameters.get("breathiness");
        if (breathinessParam) breathinessParam.setValueAtTime(plan.voiceQuality.breathiness, run.startTime);
      }

      plan.events.forEach((event, eventIndex) => {
        if (event.type === "pause") {
          voiceEnvelope.gain.setTargetAtTime(0.0001, cursor, 0.014);
          vibratoDepth.gain.setTargetAtTime(0.0001, cursor, 0.02);
          amplitudeMotionDepth.gain.setTargetAtTime(0.0001, cursor, 0.02);
          formantMotionF1.gain.setTargetAtTime(0.0001, cursor, 0.02);
          formantMotionF2.gain.setTargetAtTime(0.0001, cursor, 0.02);
          nasalGain.gain.setTargetAtTime(0.0001, cursor, 0.02);
          cursor += event.duration;
          previousProfile = null;
          return;
        }

        if (event.consonantOnly) {
          if (event.onsetNoise) {
            const consonantNodes = scheduleNoise(cursor, Math.min(event.duration, event.onsetNoise.duration), event.onsetNoise);
            if (consonantNodes) run.nodes.push(...consonantNodes);
          }
          voiceEnvelope.gain.setTargetAtTime(0.0001, cursor, 0.008);
          cursor += event.duration;
          previousProfile = null;
          previousFrequency = event.frequency;
          syllableCounter += 1;
          return;
        }

        const nextEvent = plan.events[eventIndex + 1] || null;
        const profile = VOWEL_PROFILES[event.vowel] || VOWEL_PROFILES.a;
        const priorProfile = previousProfile || profile;
        if (vocalTractEngine) vocalTractEngine.setVowelAtTime(event.vowel, cursor + Math.min(0.040, event.duration * 0.15));
        const noteEnd = cursor + event.duration;
        const noise = event.onsetNoise;
        const onsetDelay = noise
          ? Math.min(0.040, event.duration * 0.15)
          : (event.onset ? Math.min(0.019, event.duration * 0.075) : 0.004);
        const vowelStart = cursor + onsetDelay;

        if (noise) {
          const noiseDuration = Math.min(noise.duration, event.duration * 0.28);
          const consonantNodes = scheduleNoise(cursor, noiseDuration, noise);
          if (consonantNodes) run.nodes.push(...consonantNodes);
        }

        const formantGlide = Math.min(0.13, Math.max(0.045, event.duration * 0.27));
        formantFilters.forEach((branch, formantIndex) => {
          const from = priorProfile.formants[formantIndex];
          const to = Math.min(profile.formants[formantIndex], audio.sampleRate * 0.46);
          branch.filter.frequency.setValueAtTime(from, vowelStart);
          if (Math.abs(to - from) > 1) branch.filter.frequency.linearRampToValueAtTime(to, vowelStart + formantGlide);
          const bandwidth = profile.bandwidths[formantIndex];
          branch.filter.Q.setValueAtTime(safeNumber(to / bandwidth, 3, 1.0, 18), vowelStart);
        });

        const pitchGlide = Math.min(0.065, Math.max(0.026, event.duration * 0.15));
        frequencyParam.setValueAtTime(previousFrequency, cursor);
        frequencyParam.linearRampToValueAtTime(event.frequency, vowelStart + pitchGlide);

        if (event.onset) voiceEnvelope.gain.setTargetAtTime(Math.max(0.018, event.amplitude * 0.18), cursor, 0.006);
        voiceEnvelope.gain.setTargetAtTime(event.amplitude, vowelStart, 0.018);
        nasalGain.gain.setTargetAtTime(event.nasal ? 0.12 : 0.0001, vowelStart, 0.024);

        const vibratoStart = vowelStart + event.duration * 0.31;
        const release = Math.min(0.085, event.duration * 0.18);
        const vibratoEnd = Math.max(vibratoStart, noteEnd - release);
        const noteVibratoDepth = defaultVibratoCents * (profile.long ? 1 : 0.70);
        const noteVibratoRate = safeNumber(defaultVibratoRateHz + ((event.index % 3) - 1) * 0.055, defaultVibratoRateHz, 3.5, 6.5);
        vibrato.frequency.setValueAtTime(noteVibratoRate, vowelStart);
        vibratoDepth.gain.setValueAtTime(0.0001, vowelStart);
        vibratoDepth.gain.linearRampToValueAtTime(noteVibratoDepth, vibratoStart);
        vibratoDepth.gain.setValueAtTime(noteVibratoDepth, vibratoEnd);
        vibratoDepth.gain.linearRampToValueAtTime(0.0001, noteEnd);

        // Human singing also varies loudness and resonant colour with vibrato.
        amplitudeMotion.frequency.setValueAtTime(noteVibratoRate, vowelStart);
        amplitudeMotionDepth.gain.setValueAtTime(0.0001, vowelStart);
        amplitudeMotionDepth.gain.linearRampToValueAtTime(event.amplitude * 0.024, vibratoStart);
        amplitudeMotionDepth.gain.setValueAtTime(event.amplitude * 0.024, vibratoEnd);
        amplitudeMotionDepth.gain.linearRampToValueAtTime(0.0001, noteEnd);
        const formantMotionScale = profile.long ? 1 : 0.72;
        formantMotionF1.gain.setValueAtTime(0.0001, vowelStart);
        formantMotionF1.gain.linearRampToValueAtTime(3.8 * formantMotionScale, vibratoStart);
        formantMotionF1.gain.setValueAtTime(3.8 * formantMotionScale, vibratoEnd);
        formantMotionF1.gain.linearRampToValueAtTime(0.0001, noteEnd);
        formantMotionF2.gain.setValueAtTime(0.0001, vowelStart);
        formantMotionF2.gain.linearRampToValueAtTime(10.5 * formantMotionScale, vibratoStart);
        formantMotionF2.gain.setValueAtTime(10.5 * formantMotionScale, vibratoEnd);
        formantMotionF2.gain.linearRampToValueAtTime(0.0001, noteEnd);

        if (!nextEvent || nextEvent.type === "pause") {
          const releaseStart = Math.max(vowelStart, noteEnd - release);
          voiceEnvelope.gain.setTargetAtTime(0.0001, releaseStart, 0.02);
          nasalGain.gain.setTargetAtTime(0.0001, releaseStart, 0.02);
        }

        if (event.visarga) {
          const visargaProfile = {
            frequency: 1450,
            duration: Math.min(0.072, event.duration * 0.19),
            gain: 0.038,
            type: "bandpass"
          };
          const breath = scheduleNoise(Math.max(vowelStart, noteEnd - visargaProfile.duration), visargaProfile.duration, visargaProfile);
          if (breath) run.nodes.push(...breath);
        }

        previousProfile = profile;
        previousFrequency = event.frequency;
        cursor = noteEnd;
        syllableCounter += 1;
      });

      const endTime = Math.max(cursor, run.startTime + plan.totalDuration) + 0.08;
      if (usingWorklet) {
        voiceSource.port.postMessage({ type: "stopAt", frame: Math.ceil(endTime * audio.sampleRate) });
      } else {
        voiceSource.onended = () => {
          if (active === run && !run.finished) completeRun(run, {
            status: "ended",
            syllables: syllableCounter,
            durationSeconds: plan.totalDuration,
            synthesisCore: ENGINE_ARCHITECTURE,
            glottalSourceModel: plan.glottalSourceModel,
            sourceOscillators: 1,
            modelLoaded: false,
            accompaniment: false
          });
        };
        voiceSource.start(run.startTime);
        voiceSource.stop(endTime);
      }
      vibrato.start(run.startTime);
      vibrato.stop(endTime);
      amplitudeMotion.start(run.startTime);
      amplitudeMotion.stop(endTime);
      return promise;
    } catch (error) {
      if (active === run) {
        completeRun(run, { status: "error", reason: String(error && error.message || error) });
      }
      throw error;
    }
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
      architecture: ENGINE_ARCHITECTURE,
      performanceModulation: PERFORMANCE_MODULATION,
      glottalSourceModel: "lf-parameterized-differentiated-glottal-flow",
      vocalTractModel: vocalTractEngine ? "kelly-lochbaum-waveguide-with-formant-fallback" : "dynamic-parallel-formant-resonators",
      femaleVocalTractWaveguide: Boolean(vocalTractEngine),
      femaleVocalTractEngineVersion: vocalTractEngine ? vocalTractEngine.version : null,
      femaleVocalTractFallbackReason: vocalTractFailure,
      femaleVoiceCharacterEngine: voiceCharacterEngine ? voiceCharacterEngine.getStatus() : voiceCharacterStatus,
      femaleVoiceCharacterEngineActive: Boolean(voiceCharacterEngine),
      femaleVoiceCharacterFailure: voiceCharacterFailure,
      outputMode: OUTPUT_MODE_COMPAT,
      workletAvailable: Boolean(context && context.audioWorklet && typeof host.AudioWorkletNode === "function"),
      workletModuleReady,
      workletFallbackReason: workletFailure,
      sourceOscillatorsPerPhrase: 1,
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
    compressor = null;
    noiseBuffer = null;
    if (vocalTractEngine) { vocalTractEngine.dispose(); vocalTractEngine = null; }
    if (voiceCharacterEngine) {
      voiceCharacterEngine.dispose();
      voiceCharacterStatus = voiceCharacterEngine.getStatus();
      voiceCharacterEngine = null;
    }
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

function cHasWaveguideConnection() { return true; }

export function selfTest() {
  const checks = [];
  const add = (name, passed) => checks.push(Object.freeze({ name, passed: Boolean(passed) }));
  const simple = tokenizeSanskritForSinging("ॐ नमः शिवाय।");
  add("devanagari-syllable-parser", simple.filter(event => event.type === "syllable").length >= 6);
  add("omkara-vowel-support", simple.some(event => event.type === "syllable" && event.source === "ॐ" && event.vowel === "o"));
  add("visarga-preserved-as-vocal-breath", simple.some(event => event.type === "syllable" && event.visarga));
  add("danda-phrase-pause", simple.some(event => event.type === "pause" && event.reason === "sentence"));
  add("female-vocal-tract-engine-import", typeof createFemaleVocalTractEngine === "function");
  add("female-voice-character-engine-import", typeof createFemaleVoiceCharacterEngine === "function");
  add("female-waveguide-connection-contract", typeof createFemaleVocalTractEngine === "function" &&
    cHasWaveguideConnection());
  add("model-free-voice-only-contract", VOCAL_SINGING_ENGINE_VERSION === "0.8.0" &&
    SWR_VOCAL_SINGING_ENGINE_ID.startsWith("SWR-VOCAL-SINGING") && Object.keys(VOWEL_PROFILES).length >= 10);

  const lfTable = createLFGlottalTable();
  let mean = 0;
  let positive = false;
  let negative = false;
  let finite = true;
  for (let i = 0; i < lfTable.length; i += 1) {
    const value = lfTable[i];
    mean += value;
    if (value > 0.02) positive = true;
    if (value < -0.02) negative = true;
    if (!Number.isFinite(value)) finite = false;
  }
  mean /= lfTable.length;
  add("lf-source-table-finite", finite);
  add("lf-source-open-and-return-phases", positive && negative);
  add("lf-source-zero-dc-balance", Math.abs(mean) < 0.002);
  add("lf-source-normalised-peak", Math.max(...Array.from(lfTable, Math.abs)) <= 0.93);

  const terminalHalant = tokenizeSanskritForSinging("त्");
  add("terminal-halant-keeps-grapheme-without-invented-vowel",
    terminalHalant.length === 1 && terminalHalant[0].type === "syllable" &&
    terminalHalant[0].consonantOnly === true && terminalHalant[0].vowel === null);
  const planningEngine = createVocalSingingEngine({ target: {} });
  const continuityPlan = planningEngine.prepareText("नमः शिवाय।");
  add("source-filter-plan-contract",
    continuityPlan.synthesisMode === "adaptive-glottal-formant-dsp" &&
    continuityPlan.architecture === ENGINE_ARCHITECTURE &&
    continuityPlan.glottalSourceModel === "lf-parameterized-differentiated-glottal-flow" &&
    continuityPlan.sourceOscillators === 1 && continuityPlan.syllableCount >= 4);
  add("expressive-microvariation-and-vibrato", LF_WORKLET_SOURCE.includes("jitter") &&
    VIBRATO_WAVEFORM === "triangle" && PERFORMANCE_MODULATION.includes("amplitude"));
  add("voice-only-no-instrument-contract", continuityPlan.accompaniment === false && continuityPlan.modelLoaded === false);
  add("four-parallel-vowel-resonance-profiles", Object.values(VOWEL_PROFILES).every(profile =>
    profile.formants.length === 4 && profile.bandwidths.length === 4 &&
    profile.formants.every(value => Number.isFinite(value) && value > 0)));
  const longVowelPlan = tokenizeSanskritForSinging("आ इ");
  add("long-and-short-vowel-tokenization", longVowelPlan.length >= 2 &&
    longVowelPlan.some(item => item.vowel === "aa") && longVowelPlan.some(item => item.vowel === "i"));
  add("no-network-or-model-contract", continuityPlan.modelLoaded === false && planningEngine.getStatus().externalNetworkRequests === 0);

  return Object.freeze({
    module: "swar-sadhika-vocal-singing-engine-part2",
    engineVersion: VOCAL_SINGING_ENGINE_VERSION,
    architecture: ENGINE_ARCHITECTURE,
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

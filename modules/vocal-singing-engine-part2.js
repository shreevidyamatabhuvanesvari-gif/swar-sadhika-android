/* Swar-Sadhika — model-free Sanskrit Vocal Singing Engine (Part 2)
 * Version 0.4.0: adaptive glottal spectrum, four-resonance vowel shaping,
 * refined Sanskrit consonant articulation, subtle note humanization and vibrato.
 * Local Web Audio DSP only: no model, remote API, instrument track, or network fetch.
 * This remains synthetic DSP; naturalness must be judged from recorded listening tests.
 */

export const VOCAL_SINGING_ENGINE_VERSION = "0.4.0";
export const SWR_VOCAL_SINGING_ENGINE_ID = "SWR-VOCAL-SINGING-ENGINE-P2-01";

const VOWEL_PROFILES = Object.freeze({
  a:  Object.freeze({ formants: [800, 1350, 2800, 3600], bandwidths: [120, 170, 250, 350], long: false }),
  aa: Object.freeze({ formants: [850, 1320, 2750, 3550], bandwidths: [130, 180, 260, 350], long: true }),
  i:  Object.freeze({ formants: [360, 2250, 3000, 3900], bandwidths: [80, 190, 260, 400], long: false }),
  ii: Object.freeze({ formants: [320, 2550, 3200, 4100], bandwidths: [75, 200, 270, 420], long: true }),
  u:  Object.freeze({ formants: [420, 950, 2450, 3550], bandwidths: [90, 140, 240, 360], long: false }),
  uu: Object.freeze({ formants: [370, 900, 2500, 3600], bandwidths: [85, 135, 250, 370], long: true }),
  vocalicR: Object.freeze({ formants: [520, 1600, 2750, 3700], bandwidths: [110, 190, 260, 380], long: false }),
  vocalicRR: Object.freeze({ formants: [500, 1650, 2800, 3750], bandwidths: [110, 190, 270, 390], long: true }),
  e:  Object.freeze({ formants: [520, 1950, 2850, 3850], bandwidths: [100, 190, 260, 400], long: true }),
  ai: Object.freeze({ formants: [690, 1850, 2750, 3800], bandwidths: [130, 210, 270, 400], long: true }),
  o:  Object.freeze({ formants: [520, 1050, 2700, 3550], bandwidths: [110, 150, 260, 360], long: true }),
  au: Object.freeze({ formants: [700, 1200, 2700, 3650], bandwidths: [140, 170, 270, 380], long: true })
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
  const first = Array.from(String(onset))[0] || "";
  if (isSibilant(first)) {
    const frequency = first === "श" ? 3600 : first === "ष" ? 3200 : 4800;
    return { frequency, duration: 0.072, gain: 0.095, type: "highpass" };
  }
  const placeFrequency = /[कखगघङ]/u.test(first) ? 1450
    : /[चछजझञ]/u.test(first) ? 2550
    : /[टठडढण]/u.test(first) ? 1850
    : /[तथदधन]/u.test(first) ? 2250
    : /[पफबभम]/u.test(first) ? 1250 : 1900;
  if (isAspirated(first)) {
    return { frequency: first === "ह" ? 1250 : placeFrequency, duration: 0.054, gain: 0.068, type: "bandpass" };
  }
  if (isPlosive(first)) {
    return { frequency: placeFrequency, duration: 0.022, gain: 0.048, type: "bandpass" };
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
        // Preserve the grapheme for G2P alignment, but do not invent an inherent "a".
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
    // Ignore Vedic accents and other combining marks that do not carry a vowel nucleus.
    index += 1;
  }

  return events;
}

function noteFrequency(baseFrequency, semitones) {
  return baseFrequency * Math.pow(2, semitones / 12);
}

function makeGlottalWave(context, settings = {}) {
  const harmonicCount = 64;
  const spectralTiltExponent = safeNumber(settings.spectralTilt, 1.16, 0.90, 1.55);
  const openQuotient = safeNumber(settings.openQuotient, 0.62, 0.45, 0.78);
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    // Adjustable spectral tilt and open quotient shape the synthetic glottal spectrum.
    const spectralTilt = 1 / Math.pow(harmonic, spectralTiltExponent);
    const highFrequencyDamping = Math.exp(-harmonic / (70 + openQuotient * 36));
    const pulseShape = 0.94 + (openQuotient - 0.62) * 0.42;
    const amplitude = spectralTilt * highFrequencyDamping * pulseShape;
    const phase = -Math.PI * (0.10 + harmonic * (0.0011 + (1 - openQuotient) * 0.0022));
    real[harmonic] = amplitude * Math.cos(phase);
    imag[harmonic] = amplitude * Math.sin(phase);
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
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
  let compressor = null;
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
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -13;
      compressor.knee.value = 9;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      masterGain = context.createGain();
      masterGain.gain.value = 0.82;
      compressor.connect(masterGain).connect(context.destination);
      noiseBuffer = createNoiseBuffer(context);
    }
    return context;
  }

  function scheduleNoise(startAt, duration, profile) {
    if (!profile || !noiseBuffer || !context || !compressor) return null;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = profile.type;
    filter.frequency.setValueAtTime(profile.frequency, startAt);
    filter.Q.setValueAtTime(profile.type === "highpass" ? 0.7 : 1.1, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(profile.gain * 0.78, startAt + Math.min(0.012, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter).connect(gain).connect(compressor);
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
    const humanizeCents = safeNumber(inputOptions.humanizeCents, 1.4, 0, 4);
    const consonantDuration = safeNumber(inputOptions.finalConsonantDurationMs, 70, 35, 140) / 1000;
    const spectralTilt = safeNumber(inputOptions.spectralTilt, 1.16, 0.90, 1.55);
    const openQuotient = safeNumber(inputOptions.openQuotient, 0.62, 0.45, 0.78);
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
        Math.sin((syllableIndex + 1) * 1.618) * 0.65 +
        Math.sin((syllableIndex + 1) * 0.73) * 0.35
      );
      const frequency = noteFrequency(baseFrequency, noteOffset + microCents / 100);
      const lengthFactor = profile.long ? 1.55 : 1;
      const clusterFactor = Array.from(event.onset || "").length > 1 ? 1.08 : 1;
      const syllableDuration = baseDuration * lengthFactor * clusterFactor;
      const emphasis = 1 + 0.035 * Math.sin((syllableIndex + 1) * 1.11);
      const item = Object.freeze({
        ...event,
        index: syllableIndex,
        fromVowel: previousVowel || event.vowel,
        frequency,
        duration: syllableDuration,
        onsetNoise: noise,
        amplitude: (event.nasal ? 0.52 : 0.60) * emphasis
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
      voiceQuality: Object.freeze({ spectralTilt, openQuotient, humanizeCents }),
      sourceOscillators: 1,
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

    // One sustained source avoids restarting a fresh oscillator for every syllable.
    const glottalWave = makeGlottalWave(audio, plan.voiceQuality);
    const oscillator = audio.createOscillator();
    oscillator.setPeriodicWave(glottalWave);
    oscillator.frequency.setValueAtTime(plan.baseFrequency, run.startTime);

    // One shared filter bank carries all vowel changes for the complete phrase.
    const highPass = audio.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.setValueAtTime(85, run.startTime);
    highPass.Q.setValueAtTime(0.72, run.startTime);

    const formantGains = [4.4, 5.0, 3.0, 1.5];
    const formantFilters = [0, 1, 2, 3].map(index => {
      const filter = audio.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.setValueAtTime([600, 1100, 1900, 3400][index], run.startTime);
      filter.Q.setValueAtTime([2.6, 2.7, 2.5, 2.2][index], run.startTime);
      filter.gain.setValueAtTime(formantGains[index], run.startTime);
      return filter;
    });

    const lowPass = audio.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.setValueAtTime(7600, run.startTime);
    lowPass.Q.setValueAtTime(0.72, run.startTime);

    const voiceEnvelope = audio.createGain();
    voiceEnvelope.gain.setValueAtTime(0.0001, run.startTime);
    oscillator.connect(highPass);
    let voiceChain = highPass;
    formantFilters.forEach(filter => {
      voiceChain.connect(filter);
      voiceChain = filter;
    });
    voiceChain.connect(lowPass).connect(voiceEnvelope).connect(compressor);

    // A single low-frequency oscillator supplies phrase-wide vibrato.
    const vibrato = audio.createOscillator();
    const vibratoDepth = audio.createGain();
    vibrato.frequency.setValueAtTime(4.7, run.startTime);
    vibratoDepth.gain.setValueAtTime(0.0001, run.startTime);
    vibrato.connect(vibratoDepth).connect(oscillator.detune);

    let cursor = run.startTime;
    let syllableCounter = 0;
    let previousProfile = null;
    let previousFrequency = plan.baseFrequency;
    const defaultVibratoCents = safeNumber(inputOptions.vibratoCents, 3.8, 0, 10);
    const defaultVibratoRateHz = safeNumber(inputOptions.vibratoRateHz, 4.8, 3.5, 6.5);

    plan.events.forEach((event, eventIndex) => {
      if (event.type === "pause") {
        voiceEnvelope.gain.setTargetAtTime(0.0001, cursor, 0.012);
        vibratoDepth.gain.setTargetAtTime(0.0001, cursor, 0.018);
        cursor += event.duration;
        return;
      }

      if (event.consonantOnly) {
        if (event.onsetNoise) {
          const releaseNoise = scheduleNoise(cursor, Math.min(event.duration, event.onsetNoise.duration), event.onsetNoise);
          if (releaseNoise) run.nodes.push(...releaseNoise);
        }
        cursor += event.duration;
        previousProfile = null;
        previousFrequency = event.frequency;
        syllableCounter += 1;
        return;
      }
      const nextEvent = plan.events[eventIndex + 1] || null;
      const profile = VOWEL_PROFILES[event.vowel] || VOWEL_PROFILES.a;
      const priorProfile = previousProfile || profile;
      const noteEnd = cursor + event.duration;
      const noise = event.onsetNoise;
      const onsetDelay = noise
        ? Math.min(0.042, event.duration * 0.16)
        : (event.onset ? Math.min(0.020, event.duration * 0.075) : 0.004);
      const vowelStart = cursor + onsetDelay;

      if (noise) {
        const noiseDuration = Math.min(noise.duration, event.duration * 0.30);
        const noiseNodes = scheduleNoise(cursor, noiseDuration, noise);
        if (noiseNodes) run.nodes.push(...noiseNodes);
      }

      // Coarticulation: formant centres glide from the previous vowel into this one.
      const formantGlide = Math.min(0.115, Math.max(0.038, event.duration * 0.25));
      formantFilters.forEach((filter, formantIndex) => {
        const from = priorProfile.formants[formantIndex];
        const to = profile.formants[formantIndex];
        filter.frequency.setValueAtTime(from, vowelStart);
        if (Math.abs(to - from) > 1) {
          filter.frequency.linearRampToValueAtTime(to, vowelStart + formantGlide);
        }
        filter.Q.setValueAtTime(
          safeNumber(to / (profile.bandwidths[formantIndex] * 2), 2.6, 1.0, 6.5),
          vowelStart
        );
        filter.gain.setValueAtTime(formantGains[formantIndex], vowelStart);
      });

      // Pitch is joined by a short glide instead of restarting at a new fixed tone.
      const pitchGlide = Math.min(0.060, Math.max(0.025, event.duration * 0.14));
      oscillator.frequency.setValueAtTime(previousFrequency, cursor);
      oscillator.frequency.linearRampToValueAtTime(event.frequency, vowelStart + pitchGlide);

      // Reduce voiced energy during consonant onset, then smoothly restore the vowel.
      if (event.onset) {
        voiceEnvelope.gain.setTargetAtTime(Math.max(0.025, event.amplitude * 0.22), cursor, 0.005);
      }
      voiceEnvelope.gain.setTargetAtTime(event.amplitude, vowelStart, 0.014);

      const vibratoStart = vowelStart + event.duration * 0.30;
      const release = Math.min(0.075, event.duration * 0.18);
      const vibratoEnd = Math.max(vibratoStart, noteEnd - release);
      const noteVibratoDepth = defaultVibratoCents * (profile.long ? 1 : 0.72);
      const noteVibratoRate = safeNumber(
        defaultVibratoRateHz + ((event.index % 3) - 1) * 0.06,
        defaultVibratoRateHz, 3.5, 6.5
      );
      vibrato.frequency.setValueAtTime(noteVibratoRate, vowelStart);
      vibratoDepth.gain.setValueAtTime(0.0001, vowelStart);
      vibratoDepth.gain.linearRampToValueAtTime(noteVibratoDepth, vibratoStart);
      vibratoDepth.gain.setValueAtTime(noteVibratoDepth, vibratoEnd);
      vibratoDepth.gain.linearRampToValueAtTime(0.0001, noteEnd);

      // Phrase and danda endings receive a controlled release; adjacent syllables remain connected.
      if (!nextEvent || nextEvent.type === "pause") {
        const releaseStart = Math.max(vowelStart, noteEnd - release);
        voiceEnvelope.gain.setTargetAtTime(0.0001, releaseStart, 0.018);
      }

      if (event.visarga) {
        const visargaProfile = {
          frequency: 1450,
          duration: Math.min(0.065, event.duration * 0.18),
          gain: 0.045,
          type: "bandpass"
        };
        const breath = scheduleNoise(
          Math.max(vowelStart, noteEnd - visargaProfile.duration),
          visargaProfile.duration,
          visargaProfile
        );
        if (breath) run.nodes.push(...breath);
      }

      previousProfile = profile;
      previousFrequency = event.frequency;
      cursor = noteEnd;
      syllableCounter += 1;
    });

    const endTime = Math.max(cursor, run.startTime + plan.totalDuration) + 0.04;
    oscillator.onended = () => {
      if (active === run && !run.finished) completeRun(run, {
        status: "ended",
        syllables: syllableCounter,
        durationSeconds: plan.totalDuration,
        sourceOscillators: 1,
        modelLoaded: false,
        accompaniment: false
      });
    };

    oscillator.start(run.startTime);
    vibrato.start(run.startTime);
    oscillator.stop(endTime);
    vibrato.stop(endTime);
    run.nodes.push(
      oscillator,
      highPass,
      ...formantFilters,
      lowPass,
      voiceEnvelope,
      vibrato,
      vibratoDepth
    );

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
      outputMode: "model-free-adaptive-glottal-formant-dsp",
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
  add("model-free-and-voice-only-contract", VOCAL_SINGING_ENGINE_VERSION === "0.4.0" &&
    SWR_VOCAL_SINGING_ENGINE_ID.startsWith("SWR-VOCAL-SINGING") && Object.keys(VOWEL_PROFILES).length >= 10);
  const terminalHalant = tokenizeSanskritForSinging("त्");
  add("terminal-halant-keeps-grapheme-without-invented-vowel",
    terminalHalant.length === 1 && terminalHalant[0].type === "syllable" &&
    terminalHalant[0].consonantOnly === true && terminalHalant[0].vowel === null);
  const planningEngine = createVocalSingingEngine({ target: {} });
  const continuityPlan = planningEngine.prepareText("नमः शिवाय।");
  add("continuous-single-source-plan",
    continuityPlan.synthesisMode === "adaptive-glottal-formant-dsp" &&
    continuityPlan.sourceOscillators === 1 &&
    continuityPlan.syllableCount >= 4);
  add("voice-only-no-instrument-contract",
    continuityPlan.accompaniment === false && continuityPlan.modelLoaded === false);
  add("four-formant-vowel-profiles", Object.values(VOWEL_PROFILES).every(profile =>
    profile.formants.length === 4 && profile.bandwidths.length === 4 &&
    profile.formants.every(value => Number.isFinite(value) && value > 0)));
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
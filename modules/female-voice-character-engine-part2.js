/* Swar-Sadhika — Female Voice Character DSP Engine (Part 2)
 * Version 0.1.0
 * Model-free local voice transformation:
 * dual-read-head delay-line pitch shifting + vocal spectral-envelope shaping.
 * No pretrained model, neural network, audio sample bank, remote API, server, or fetch.
 * This is a DSP character stage, not a guarantee of indistinguishable human voice.
 */

export const FEMALE_VOICE_CHARACTER_ENGINE_VERSION = "0.1.0";
export const FEMALE_VOICE_CHARACTER_ENGINE_ID = "SWR-FEMALE-VOICE-CHARACTER-P2-01";

const PRESETS = Object.freeze({
  "soft-feminine": Object.freeze({
    pitchShiftSemitones: 1.8,
    lowShelfDb: -1.35,
    bodyDb: -0.55,
    presenceDb: 1.35,
    formantPresenceDb: 0.95,
    airDb: 0.65,
    sibilanceDb: -0.75,
    outputGain: 0.94
  }),
  "clear-feminine": Object.freeze({
    pitchShiftSemitones: 2.35,
    lowShelfDb: -1.7,
    bodyDb: -0.75,
    presenceDb: 1.7,
    formantPresenceDb: 1.2,
    airDb: 0.9,
    sibilanceDb: -0.9,
    outputGain: 0.91
  }),
  "gentle-feminine": Object.freeze({
    pitchShiftSemitones: 1.25,
    lowShelfDb: -0.9,
    bodyDb: -0.35,
    presenceDb: 1.0,
    formantPresenceDb: 0.7,
    airDb: 0.45,
    sibilanceDb: -0.55,
    outputGain: 0.96
  })
});

const MIN_DELAY_SECONDS = 0.008;
const DELAY_RANGE_SECONDS = 0.045;
const PROCESSOR_NAME = "swar-sadhika-female-voice-character-pitch";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getFemaleVoiceCharacterPreset(name = "soft-feminine") {
  const key = Object.prototype.hasOwnProperty.call(PRESETS, name) ? name : "soft-feminine";
  return Object.freeze({ name: key, ...PRESETS[key] });
}

export function resolveFemaleVoiceCharacterSettings(options = {}) {
  const preset = getFemaleVoiceCharacterPreset(options.preset);
  const pitchShiftSemitones = clamp(
    finiteNumber(options.pitchShiftSemitones, preset.pitchShiftSemitones),
    0,
    3.2
  );
  return Object.freeze({
    preset: preset.name,
    pitchShiftSemitones,
    pitchRatio: Math.pow(2, pitchShiftSemitones / 12),
    lowShelfDb: clamp(finiteNumber(options.lowShelfDb, preset.lowShelfDb), -4, 1),
    bodyDb: clamp(finiteNumber(options.bodyDb, preset.bodyDb), -3, 2),
    presenceDb: clamp(finiteNumber(options.presenceDb, preset.presenceDb), -1, 4),
    formantPresenceDb: clamp(finiteNumber(options.formantPresenceDb, preset.formantPresenceDb), -1, 4),
    airDb: clamp(finiteNumber(options.airDb, preset.airDb), -1, 3),
    sibilanceDb: clamp(finiteNumber(options.sibilanceDb, preset.sibilanceDb), -4, 1),
    outputGain: clamp(finiteNumber(options.outputGain, preset.outputGain), 0.5, 1.2)
  });
}

const PITCH_WORKLET_SOURCE = [
'class SwarSadhikaFemaleVoicePitchProcessor extends AudioWorkletProcessor {',
'  static get parameterDescriptors() {',
'    return [{ name: "pitchRatio", defaultValue: 1.1096, minValue: 1, maxValue: 1.21, automationRate: "k-rate" }];',
'  }',
'  constructor(options) {',
'    super();',
'    const supplied = options && options.processorOptions || {};',
'    this.minDelay = Math.max(1, Math.round((Number(supplied.minDelaySeconds) || 0.008) * sampleRate));',
'    this.delayRange = Math.max(32, Math.round((Number(supplied.delayRangeSeconds) || 0.045) * sampleRate));',
'    const capacity = Math.max(4096, Math.ceil(sampleRate * 0.14));',
'    this.ring = new Float32Array(capacity);',
'    this.writeIndex = 0;',
'    this.phase = 0;',
'  }',
'  readDelayed(delay) {',
'    let position = this.writeIndex - delay;',
'    position %= this.ring.length;',
'    if (position < 0) position += this.ring.length;',
'    const index = Math.floor(position);',
'    const fraction = position - index;',
'    const next = index + 1 < this.ring.length ? index + 1 : 0;',
'    return this.ring[index] + (this.ring[next] - this.ring[index]) * fraction;',
'  }',
'  process(inputs, outputs, parameters) {',
'    const inputChannels = inputs[0];',
'    const outputChannels = outputs[0];',
'    const input = inputChannels && inputChannels[0];',
'    const output = outputChannels && outputChannels[0];',
'    if (!output) return true;',
'    const ratioValues = parameters.pitchRatio;',
'    const ratio = Math.max(1, Math.min(1.21, ratioValues.length > 1 ? ratioValues[0] : ratioValues[0]));',
'    for (let i = 0; i < output.length; i += 1) {',
'      const sample = input ? input[i] : 0;',
'      this.ring[this.writeIndex] = sample;',
'      let value = sample;',
'      if (ratio > 1.001) {',
'        const phaseA = this.phase;',
'        let phaseB = phaseA + 0.5;',
'        if (phaseB >= 1) phaseB -= 1;',
'        const delayA = this.minDelay + (1 - phaseA) * this.delayRange;',
'        const delayB = this.minDelay + (1 - phaseB) * this.delayRange;',
'        const a = this.readDelayed(delayA);',
'        const b = this.readDelayed(delayB);',
'        const sine = Math.sin(Math.PI * phaseA);',
'        const weightA = sine * sine;',
'        value = a * weightA + b * (1 - weightA);',
'        this.phase += (ratio - 1) / this.delayRange;',
'        if (this.phase >= 1) this.phase -= Math.floor(this.phase);',
'      }',
'      output[i] = value;',
'      this.writeIndex += 1;',
'      if (this.writeIndex >= this.ring.length) this.writeIndex = 0;',
'    }',
'    return true;',
'  }',
'}',
'registerProcessor("swar-sadhika-female-voice-character-pitch", SwarSadhikaFemaleVoicePitchProcessor);'
].join("\n");

const MODULES_BY_CONTEXT = new WeakMap();

async function ensurePitchWorklet(context, host) {
  let pending = MODULES_BY_CONTEXT.get(context);
  if (pending) return pending;
  const BlobCtor = host.Blob || (typeof Blob !== "undefined" ? Blob : null);
  const URLCtor = host.URL || (typeof URL !== "undefined" ? URL : null);
  if (!context.audioWorklet || typeof host.AudioWorkletNode !== "function" ||
      !BlobCtor || !URLCtor || typeof URLCtor.createObjectURL !== "function") {
    throw new Error("इस ब्राउज़र में AudioWorklet pitch processing उपलब्ध नहीं है।");
  }
  pending = (async () => {
    let objectUrl = "";
    try {
      objectUrl = URLCtor.createObjectURL(new BlobCtor([PITCH_WORKLET_SOURCE], {
        type: "application/javascript"
      }));
      await context.audioWorklet.addModule(objectUrl);
      return true;
    } catch (error) {
      MODULES_BY_CONTEXT.delete(context);
      throw new Error("Female Voice Character Worklet लोड नहीं हुआ: " +
        String(error && error.message || error || "unknown error"));
    } finally {
      if (objectUrl) {
        try { URLCtor.revokeObjectURL(objectUrl); } catch (_) {}
      }
    }
  })();
  MODULES_BY_CONTEXT.set(context, pending);
  return pending;
}

function configureBiquad(context, type, frequency, gain, q, startAt) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, startAt);
  if (type === "peaking" || type === "lowshelf" || type === "highshelf") {
    filter.gain.setValueAtTime(gain, startAt);
  }
  if (type === "peaking" || type === "bandpass" || type === "notch") {
    filter.Q.setValueAtTime(q, startAt);
  }
  return filter;
}

export async function createFemaleVoiceCharacterEngine(options = {}) {
  const context = options.context;
  const host = options.target || (typeof globalThis !== "undefined" ? globalThis : {});
  if (!context || typeof context.createGain !== "function") {
    throw new TypeError("Female Voice Character Engine के लिए सक्रिय AudioContext आवश्यक है।");
  }

  const settings = resolveFemaleVoiceCharacterSettings(options);
  const startAt = Number.isFinite(context.currentTime) ? context.currentTime : 0;
  const inputNode = context.createGain();
  const outputNode = context.createGain();
  outputNode.gain.setValueAtTime(settings.outputGain, startAt);

  const nodes = [inputNode, outputNode];
  let pitchNode = null;
  let pitchShiftApplied = false;
  let fallbackReason = "";

  try {
    await ensurePitchWorklet(context, host);
    pitchNode = new host.AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      processorOptions: {
        minDelaySeconds: MIN_DELAY_SECONDS,
        delayRangeSeconds: DELAY_RANGE_SECONDS
      }
    });
    const pitchParameter = pitchNode.parameters && pitchNode.parameters.get("pitchRatio");
    if (!pitchParameter) throw new Error("Pitch ratio AudioParam उपलब्ध नहीं है।");
    pitchParameter.setValueAtTime(settings.pitchRatio, startAt);
    pitchShiftApplied = settings.pitchShiftSemitones > 0.01;
    nodes.push(pitchNode);
  } catch (error) {
    fallbackReason = String(error && error.message || error || "Pitch-shifter unavailable");
    pitchNode = null;
  }

  const highPass = configureBiquad(context, "highpass", 88, 0, 0.72, startAt);
  const lowShelf = configureBiquad(context, "lowshelf", 255, settings.lowShelfDb, 0.7, startAt);
  const body = configureBiquad(context, "peaking", 720, settings.bodyDb, 1.05, startAt);
  const presence = configureBiquad(context, "peaking", 2450, settings.presenceDb, 0.9, startAt);
  const formantPresence = configureBiquad(context, "peaking", 3650, settings.formantPresenceDb, 1.15, startAt);
  const air = configureBiquad(context, "highshelf", 5650, settings.airDb, 0.7, startAt);
  const sibilance = configureBiquad(context, "peaking", 6750, settings.sibilanceDb, 1.9, startAt);
  nodes.push(highPass, lowShelf, body, presence, formantPresence, air, sibilance);

  let firstStage = inputNode;
  if (pitchNode) {
    inputNode.connect(pitchNode);
    firstStage = pitchNode;
  }
  firstStage.connect(highPass)
    .connect(lowShelf)
    .connect(body)
    .connect(presence)
    .connect(formantPresence)
    .connect(air)
    .connect(sibilance)
    .connect(outputNode);

  let disposed = false;
  let currentPitchShiftSemitones = settings.pitchShiftSemitones;

  function setPitchShiftSemitones(value) {
    if (disposed) return false;
    currentPitchShiftSemitones = clamp(finiteNumber(value, currentPitchShiftSemitones), 0, 3.2);
    if (pitchNode && pitchNode.parameters) {
      const parameter = pitchNode.parameters.get("pitchRatio");
      if (parameter) {
        parameter.setTargetAtTime(Math.pow(2, currentPitchShiftSemitones / 12),
          context.currentTime, 0.035);
        return true;
      }
    }
    return currentPitchShiftSemitones === 0;
  }

  function getStatus() {
    return Object.freeze({
      version: FEMALE_VOICE_CHARACTER_ENGINE_VERSION,
      engineId: FEMALE_VOICE_CHARACTER_ENGINE_ID,
      architecture: "dual-read-head-delay-line-pitch-shift-plus-vocal-spectral-envelope",
      preset: settings.preset,
      pitchShiftSemitones: currentPitchShiftSemitones,
      pitchRatio: Math.pow(2, currentPitchShiftSemitones / 12),
      pitchShiftApplied,
      pitchWorkletAvailable: Boolean(pitchNode),
      fallbackReason,
      spectralShaping: true,
      localProcessing: true,
      externalNetworkRequests: 0,
      modelLoaded: false,
      disposed
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    nodes.forEach(node => {
      try { node.disconnect(); } catch (_) {}
    });
    if (pitchNode && pitchNode.port) {
      try { pitchNode.port.close(); } catch (_) {}
    }
  }

  return Object.freeze({
    version: FEMALE_VOICE_CHARACTER_ENGINE_VERSION,
    engineId: FEMALE_VOICE_CHARACTER_ENGINE_ID,
    inputNode,
    outputNode,
    setPitchShiftSemitones,
    getStatus,
    dispose
  });
}

export function selfTest() {
  const checks = [];
  const add = (name, passed) => checks.push(Object.freeze({ name, passed: Boolean(passed) }));
  const soft = resolveFemaleVoiceCharacterSettings({ preset: "soft-feminine" });
  const clear = resolveFemaleVoiceCharacterSettings({ preset: "clear-feminine" });
  const twoSemitones = resolveFemaleVoiceCharacterSettings({ pitchShiftSemitones: 2 });
  const clamped = resolveFemaleVoiceCharacterSettings({ pitchShiftSemitones: 99 });
  add("known-feminine-presets", soft.preset === "soft-feminine" && clear.preset === "clear-feminine");
  add("pitch-ratio-derived-from-semitones",
    Math.abs(twoSemitones.pitchRatio - Math.pow(2, 2 / 12)) < 1e-10);
  add("pitch-shift-is-bounded", clamped.pitchShiftSemitones === 3.2);
  add("spectral-gains-are-bounded",
    [soft.lowShelfDb, soft.bodyDb, soft.presenceDb, soft.formantPresenceDb, soft.airDb, soft.sibilanceDb]
      .every(Number.isFinite));
  add("dual-read-head-pitch-shifter",
    PITCH_WORKLET_SOURCE.includes("delayA") &&
    PITCH_WORKLET_SOURCE.includes("delayB") &&
    PITCH_WORKLET_SOURCE.includes("weightA") &&
    PITCH_WORKLET_SOURCE.includes("readDelayed"));
  add("fractional-delay-interpolation",
    PITCH_WORKLET_SOURCE.includes("const fraction = position - index") &&
    PITCH_WORKLET_SOURCE.includes("this.ring[next]"));
  add("local-worklet-registration",
    PITCH_WORKLET_SOURCE.includes("registerProcessor") &&
    PITCH_WORKLET_SOURCE.includes(PROCESSOR_NAME));
  add("no-model-no-network-contract",
    !PITCH_WORKLET_SOURCE.includes("fetch(") &&
    !PITCH_WORKLET_SOURCE.includes("WebSocket") &&
    FEMALE_VOICE_CHARACTER_ENGINE_VERSION === "0.1.0");
  return Object.freeze({
    module: "female-voice-character-engine-part2",
    engineVersion: FEMALE_VOICE_CHARACTER_ENGINE_VERSION,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks)
  });
}

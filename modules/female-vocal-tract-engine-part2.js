/* Swar-Sadhika — Female Vocal-Tract Waveguide Engine (Part 2)
 * Version 0.1.0: local Kelly–Lochbaum-inspired oral-tract waveguide.
 * Applies time-varying vowel area profiles to LF glottal excitation.
 * No pretrained voice, neural model, remote API, server, or network fetch.
 * This is physical acoustic synthesis, not a guarantee of indistinguishable human singing.
 */

export const FEMALE_VOCAL_TRACT_ENGINE_VERSION = "0.1.0";
export const FEMALE_VOCAL_TRACT_ENGINE_ID = "SWR-FEMALE-VOCAL-TRACT-WAVEGUIDE-P2-01";

const SECTION_COUNT = 20;
const PROCESSOR_NAME = "swar-sadhika-female-vocal-tract-waveguide";
const MODULES_BY_CONTEXT = new WeakMap();

const VOWEL_AREA_PROFILES = Object.freeze({
  a: Object.freeze([1.15,1.25,1.45,1.8,2.4,3.0,3.6,4.1,4.3,4.0,3.55,3.1,2.7,2.45,2.3,2.4,2.7,3.2,4.0,5.1]),
  aa: Object.freeze([1.1,1.2,1.4,1.7,2.3,2.9,3.5,4.0,4.2,4.0,3.6,3.2,2.8,2.6,2.55,2.7,3.0,3.5,4.3,5.4]),
  i: Object.freeze([1.0,1.1,1.3,1.7,2.2,2.8,3.4,3.8,3.7,3.2,2.6,1.7,0.95,0.65,0.55,0.7,1.1,2.0,3.5,5.0]),
  ii: Object.freeze([0.95,1.05,1.25,1.65,2.15,2.75,3.35,3.75,3.6,3.05,2.35,1.45,0.82,0.58,0.5,0.66,1.08,2.05,3.65,5.2]),
  u: Object.freeze([0.95,1.05,1.25,1.6,2.1,2.6,3.0,3.2,3.1,2.8,2.45,2.1,1.8,1.5,1.25,1.05,0.88,0.78,0.72,0.68]),
  uu: Object.freeze([0.9,1.0,1.2,1.5,1.95,2.4,2.8,3.0,2.9,2.6,2.25,1.9,1.6,1.3,1.08,0.9,0.75,0.65,0.59,0.54]),
  vocalicR: Object.freeze([1.05,1.15,1.35,1.7,2.2,2.7,3.1,3.4,3.3,2.9,2.5,2.15,1.9,1.75,1.8,2.0,2.5,3.2,4.1,5.0]),
  vocalicRR: Object.freeze([1.0,1.1,1.3,1.65,2.15,2.65,3.05,3.35,3.25,2.85,2.45,2.1,1.85,1.7,1.75,1.95,2.45,3.15,4.05,5.0]),
  e: Object.freeze([1.0,1.1,1.3,1.7,2.2,2.8,3.35,3.8,3.7,3.2,2.55,1.75,1.1,0.82,0.9,1.25,2.0,3.0,4.1,5.2]),
  ai: Object.freeze([1.05,1.15,1.35,1.75,2.25,2.85,3.4,3.85,3.75,3.25,2.65,1.95,1.35,1.05,1.1,1.5,2.2,3.15,4.2,5.3]),
  o: Object.freeze([1.0,1.1,1.3,1.65,2.15,2.7,3.15,3.4,3.3,3.0,2.6,2.25,1.95,1.7,1.45,1.22,1.02,0.9,0.82,0.78]),
  au: Object.freeze([1.05,1.15,1.35,1.75,2.25,2.85,3.35,3.65,3.55,3.2,2.8,2.45,2.15,1.9,1.7,1.5,1.35,1.2,1.1,1.0])
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getFemaleVocalTractAreaProfile(vowel = "a") {
  const key = Object.prototype.hasOwnProperty.call(VOWEL_AREA_PROFILES, vowel) ? vowel : "a";
  return new Float32Array(VOWEL_AREA_PROFILES[key]);
}

export function createVocalTractReflectionCoefficients(areaProfile) {
  const areas = Array.from(areaProfile || []);
  if (areas.length !== SECTION_COUNT || areas.some(area => !Number.isFinite(area) || area <= 0)) {
    throw new TypeError("Vocal tract area profile में 20 सकारात्मक और finite खंड आवश्यक हैं।");
  }
  const coefficients = new Float32Array(SECTION_COUNT - 1);
  for (let index = 0; index < coefficients.length; index += 1) {
    const left = areas[index];
    const right = areas[index + 1];
    coefficients[index] = clamp((left - right) / (left + right), -0.94, 0.94);
  }
  return coefficients;
}

const WORKLET_SOURCE = [
'class SwarSadhikaFemaleTractProcessor extends AudioWorkletProcessor {',
'  constructor(options) {',
'    super();',
'    const supplied = options && options.processorOptions && options.processorOptions.areas;',
'    this.sections = 20;',
'    this.reflections = new Float32Array(19);',
'    this.targetReflections = new Float32Array(19);',
'    this.right = new Float32Array(20);',
'    this.left = new Float32Array(20);',
'    this.nextRight = new Float32Array(20);',
'    this.nextLeft = new Float32Array(20);',
'    this.pending = [];',
'    this.loss = 0.997;',
'    this.glottalReflection = 0.68;',
'    this.lipReflection = -0.72;',
'    this.outputCompensation = 3.2;',
'    if (supplied && supplied.length === 20) this.setAreas(supplied);',
'    this.port.onmessage = event => {',
'      const data = event && event.data;',
'      if (!data || data.type !== "set-areas" || !data.areas || data.areas.length !== 20) return;',
'      const frame = Number.isFinite(data.frame) ? data.frame : currentFrame;',
'      this.pending.push({ frame: frame, areas: data.areas });',
'      this.pending.sort((a, b) => a.frame - b.frame);',
'    };',
'    this.port.postMessage({ type: "ready" });',
'  }',
'  setAreas(areas) {',
'    for (let index = 0; index < 19; index += 1) {',
'      const a = Math.max(0.08, Number(areas[index]) || 0.08);',
'      const b = Math.max(0.08, Number(areas[index + 1]) || 0.08);',
'      this.targetReflections[index] = Math.max(-0.94, Math.min(0.94, (a - b) / (a + b)));',
'    }',
'  }',
'  process(inputs, outputs) {',
'    const inputChannels = inputs[0];',
'    const outputChannels = outputs[0];',
'    const input = inputChannels && inputChannels[0];',
'    const output = outputChannels && outputChannels[0];',
'    if (!output) return true;',
'    const sections = this.sections;',
'    let right = this.right;',
'    let left = this.left;',
'    let nextRight = this.nextRight;',
'    let nextLeft = this.nextLeft;',
'    for (let sample = 0; sample < output.length; sample += 1) {',
'      const absoluteFrame = currentFrame + sample;',
'      while (this.pending.length && this.pending[0].frame <= absoluteFrame) {',
'        const item = this.pending.shift();',
'        this.setAreas(item.areas);',
'      }',
'      for (let index = 0; index < 19; index += 1) {',
'        this.reflections[index] += (this.targetReflections[index] - this.reflections[index]) * 0.0025;',
'      }',
'      const excitation = input ? input[sample] : 0;',
'      nextRight[0] = (excitation + this.glottalReflection * left[0]) * this.loss;',
'      for (let junction = 1; junction < sections; junction += 1) {',
'        const incomingFromGlottis = right[junction - 1];',
'        const incomingFromLips = left[junction];',
'        const reflection = this.reflections[junction - 1];',
'        nextRight[junction] = ((1 + reflection) * incomingFromGlottis - reflection * incomingFromLips) * this.loss;',
'        nextLeft[junction - 1] = (reflection * incomingFromGlottis + (1 - reflection) * incomingFromLips) * this.loss;',
'      }',
'      const lipIncoming = right[sections - 1];',
'      nextLeft[sections - 1] = this.lipReflection * lipIncoming * this.loss;',
'      output[sample] = lipIncoming * (1 + this.lipReflection) * this.outputCompensation;',
'      const swapRight = right;',
'      const swapLeft = left;',
'      right = nextRight;',
'      left = nextLeft;',
'      nextRight = swapRight;',
'      nextLeft = swapLeft;',
'    }',
'    return true;',
'  }',
'}',
'registerProcessor("swar-sadhika-female-vocal-tract-waveguide", SwarSadhikaFemaleTractProcessor);'
].join("\n");

async function ensureWorkletModule(context, host) {
  let pending = MODULES_BY_CONTEXT.get(context);
  if (pending) return pending;
  const BlobCtor = host.Blob || (typeof Blob !== "undefined" ? Blob : null);
  const URLCtor = host.URL || (typeof URL !== "undefined" ? URL : null);
  if (!context.audioWorklet || typeof host.AudioWorkletNode !== "function" ||
      !BlobCtor || !URLCtor || typeof URLCtor.createObjectURL !== "function") {
    throw new Error("इस ब्राउज़र में आवश्यक AudioWorklet सुविधा उपलब्ध नहीं है।");
  }
  pending = (async () => {
    let objectUrl = "";
    try {
      objectUrl = URLCtor.createObjectURL(new BlobCtor([WORKLET_SOURCE], { type: "application/javascript" }));
      await context.audioWorklet.addModule(objectUrl);
      return true;
    } catch (error) {
      MODULES_BY_CONTEXT.delete(context);
      throw new Error("Female Vocal Tract Worklet लोड नहीं हुआ: " + String(error && error.message || error));
    } finally {
      if (objectUrl) {
        try { URLCtor.revokeObjectURL(objectUrl); } catch (_) {}
      }
    }
  })();
  MODULES_BY_CONTEXT.set(context, pending);
  return pending;
}

export async function createFemaleVocalTractEngine(options = {}) {
  const context = options.context;
  const host = options.target || (typeof globalThis !== "undefined" ? globalThis : {});
  if (!context || typeof context.createGain !== "function") {
    throw new TypeError("Female Vocal Tract Engine के लिए सक्रिय AudioContext आवश्यक है।");
  }
  await ensureWorkletModule(context, host);
  const initialVowel = options.initialVowel || "a";
  const initialAreas = getFemaleVocalTractAreaProfile(initialVowel);
  const node = new host.AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    processorOptions: { areas: Array.from(initialAreas) }
  });
  let disposed = false;
  let messageCount = 0;

  function setVowelAtTime(vowel, when = context.currentTime) {
    if (disposed) return false;
    const key = Object.prototype.hasOwnProperty.call(VOWEL_AREA_PROFILES, vowel) ? vowel : "a";
    const areas = getFemaleVocalTractAreaProfile(key);
    const frame = Math.max(0, Math.round(Math.max(context.currentTime, Number(when) || context.currentTime) * context.sampleRate));
    node.port.postMessage({ type: "set-areas", frame, areas: Array.from(areas) });
    messageCount += 1;
    return true;
  }

  function setAreaProfileAtTime(areas, when = context.currentTime) {
    if (disposed) return false;
    const reflectionCheck = createVocalTractReflectionCoefficients(areas);
    const profile = Array.from(areas, value => Number(value));
    const frame = Math.max(0, Math.round(Math.max(context.currentTime, Number(when) || context.currentTime) * context.sampleRate));
    node.port.postMessage({ type: "set-areas", frame, areas: profile });
    messageCount += 1;
    return reflectionCheck.length === SECTION_COUNT - 1;
  }

  function getStatus() {
    return Object.freeze({
      version: FEMALE_VOCAL_TRACT_ENGINE_VERSION,
      engineId: FEMALE_VOCAL_TRACT_ENGINE_ID,
      architecture: "kelly-lochbaum-inspired-time-varying-waveguide",
      tractSections: SECTION_COUNT,
      voicePreset: "feminine-vocal-tract-acoustic-preset",
      localProcessing: true,
      externalNetworkRequests: 0,
      modelLoaded: false,
      scheduledArticulations: messageCount,
      disposed
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    try { node.disconnect(); } catch (_) {}
    try { node.port.close(); } catch (_) {}
  }

  return Object.freeze({
    version: FEMALE_VOCAL_TRACT_ENGINE_VERSION,
    engineId: FEMALE_VOCAL_TRACT_ENGINE_ID,
    inputNode: node,
    outputNode: node,
    setVowelAtTime,
    setAreaProfileAtTime,
    getStatus,
    dispose
  });
}

export function selfTest() {
  const checks = [];
  const add = (name, passed) => checks.push(Object.freeze({ name, passed: Boolean(passed) }));
  const vowels = Object.keys(VOWEL_AREA_PROFILES);
  add("twelve-sanskrit-vowel-profiles", vowels.length >= 12);
  add("all-profiles-have-twenty-tract-sections", vowels.every(vowel =>
    VOWEL_AREA_PROFILES[vowel].length === SECTION_COUNT));
  add("all-area-values-positive-and-finite", vowels.every(vowel =>
    VOWEL_AREA_PROFILES[vowel].every(value => Number.isFinite(value) && value > 0)));
  const coefficients = vowels.map(vowel =>
    createVocalTractReflectionCoefficients(VOWEL_AREA_PROFILES[vowel]));
  add("stable-kelly-lochbaum-reflection-coefficients", coefficients.every(list =>
    list.length === SECTION_COUNT - 1 &&
    Array.from(list).every(value => Number.isFinite(value) && Math.abs(value) < 0.95)));
  add("distinct-front-and-rounded-vowels",
    VOWEL_AREA_PROFILES.i[13] < VOWEL_AREA_PROFILES.a[13] &&
    VOWEL_AREA_PROFILES.uu[18] < VOWEL_AREA_PROFILES.aa[18]);
  let invalidProfileRejected = false;
  try { createVocalTractReflectionCoefficients([1, 2, 3]); }
  catch (_) { invalidProfileRejected = true; }
  add("invalid-area-profile-rejected", invalidProfileRejected);
  add("local-worklet-source-contract",
    WORKLET_SOURCE.includes("registerProcessor") &&
    WORKLET_SOURCE.includes("this.reflections") &&
    !WORKLET_SOURCE.includes("fetch("));
  return Object.freeze({
    module: "swar-sadhika-female-vocal-tract-engine-part2",
    engineVersion: FEMALE_VOCAL_TRACT_ENGINE_VERSION,
    architecture: "kelly-lochbaum-inspired-time-varying-waveguide",
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks)
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_TTS_LAYA_VERSION,
  splitNativeTtsLayaPhrases,
  createNativeTtsLayaPlan,
  runNativeTtsLayaPlan,
  createNativeTtsLayaEngine,
  selfTest
} from "../native-tts-laya-engine.js";

function makeCompilerResult(sourceText) {
  const units = [];
  const pattern = /[^\s।॥,;:.!?]+/gu;
  for (const match of sourceText.matchAll(pattern)) {
    units.push(Object.freeze({
      index: units.length,
      text: match[0],
      kind: "akshara",
      hasVowel: true,
      vowelSymbol: "a",
      vowelLength: "short",
      mora: 1
    }));
  }
  return Object.freeze({
    version: "test",
    sourceText,
    units: Object.freeze(units),
    phonemes: Object.freeze([]),
    boundaries: Object.freeze([])
  });
}

function makeScore(compilerResult) {
  return Object.freeze({
    notes: Object.freeze(compilerResult.units.map((unit, index) => Object.freeze({
      type: "note",
      unitIndex: unit.index,
      durationBeats: index % 2 ? 2 : 1,
      swara: Object.freeze({ semitonesFromSa: [0, 2, 4, 5, 7][index % 5] })
    }))),
    summary: Object.freeze({ estimatedDurationSeconds: compilerResult.units.length * 0.5 })
  });
}

test("module self-test passes", () => {
  const result = selfTest();
  assert.equal(result.status, "PASSED");
  assert.equal(result.failed, 0);
  assert.ok(NATIVE_TTS_LAYA_VERSION);
});

test("phrases preserve source words and line boundaries", () => {
  const source = "ॐ नमः शिवाय।\nसर्वे भवन्तु सुखिनः॥";
  const phrases = splitNativeTtsLayaPhrases(source);
  assert.equal(phrases.length, 2);
  assert.deepEqual(phrases.map(item => item.text), ["ॐ नमः शिवाय।", "सर्वे भवन्तु सुखिनः॥"]);
  assert.ok(phrases.every(item => source.slice(item.start, item.end) === item.text));
});

test("punctuation closes a phrase, including a trailing quotation mark", () => {
  const phrases = splitNativeTtsLayaPhrases("मंत्रः। “द्वितीयः॥”");
  assert.equal(phrases.length, 2);
  assert.equal(phrases[0].text, "मंत्रः।");
});

test("phrase limits are bounded and no word is split", () => {
  const phrases = splitNativeTtsLayaPhrases("एक दो तीन चार पाँच छह सात", { maxWordsPerPhrase: 3, maxCharsPerPhrase: 40 });
  assert.deepEqual(phrases.map(item => item.text), ["एक दो तीन", "चार पाँच छह", "सात"]);
});

test("empty, non-string and oversized input are rejected", () => {
  assert.throws(() => splitNativeTtsLayaPhrases("  "), TypeError);
  assert.throws(() => splitNativeTtsLayaPhrases(null), TypeError);
  assert.throws(() => splitNativeTtsLayaPhrases("अ".repeat(100001)), RangeError);
});

test("score produces bounded pitch/rate phrase plan", () => {
  const source = "ॐ नमः शिवाय। सर्वे भवन्तु सुखिनः॥";
  const compilerResult = makeCompilerResult(source);
  const plan = createNativeTtsLayaPlan(source, compilerResult, makeScore(compilerResult), { pitch: 1.02, rate: 0.88 });
  assert.equal(plan.status, "ready");
  assert.equal(plan.phrases.length, 2);
  for (const phrase of plan.phrases) {
    assert.ok(phrase.pitch >= 0.90 && phrase.pitch <= 1.14);
    assert.ok(phrase.rate >= 0.65 && phrase.rate <= 1.15);
    assert.ok(phrase.noteCount > 0);
  }
  assert.equal(plan.capabilities.createsPcm, false);
  assert.equal(plan.capabilities.exactSargam, false);
});

test("invalid compiler and score contracts fail closed", () => {
  assert.throws(() => createNativeTtsLayaPlan("अ", {}, { notes: [] }), TypeError);
  assert.throws(() => createNativeTtsLayaPlan("अ", makeCompilerResult("अ"), {}), TypeError);
});

test("playback is sequential and sends phrase-specific pitch/rate", async () => {
  const calls = [];
  const plan = { phrases: [
    { text: "अ", pitch: 1.01, rate: 0.9 },
    { text: "आ", pitch: 1.04, rate: 0.86 }
  ] };
  const result = await runNativeTtsLayaPlan(plan, async (text, settings) => {
    calls.push({ text, settings });
    return { status: "ended" };
  });
  assert.equal(result.status, "ended");
  assert.deepEqual(calls.map(item => item.text), ["अ", "आ"]);
  assert.equal(calls[1].settings.pitch, 1.04);
  assert.equal(calls[1].settings.replace, false);
});

test("pause between phrases returns the next unspoken phrase index", async () => {
  let completed = 0;
  const result = await runNativeTtsLayaPlan({ phrases: [{ text: "अ" }, { text: "आ" }] }, async () => {
    completed += 1;
    return { status: "ended" };
  }, { shouldPause: () => completed === 1 });
  assert.equal(result.status, "paused");
  assert.equal(result.nextIndex, 1);
});

test("cancellation stops before the next phrase", async () => {
  let allowNext = true;
  const calls = [];
  const result = await runNativeTtsLayaPlan({ phrases: [{ text: "अ" }, { text: "आ" }] }, async text => {
    calls.push(text);
    allowNext = false;
    return { status: "ended" };
  }, { shouldContinue: () => allowNext });
  assert.equal(result.status, "cancelled");
  assert.deepEqual(calls, ["अ"]);
});

test("engine loads its local dependencies and compiles a plan", async () => {
  const compiler = {
    compilePhonemes(text) { return makeCompilerResult(text); }
  };
  const score = {
    compileSingingScore(result) { return makeScore(result); }
  };
  const engine = createNativeTtsLayaEngine({ phonemeCompiler: compiler, singingScoreEngine: score });
  const initialized = await engine.initialize();
  assert.equal(initialized.ready, true);
  const plan = await engine.createPlan("ॐ नमः शिवाय।", { pitch: 1.02, rate: 0.88 });
  assert.equal(plan.status, "ready");
  assert.equal(plan.phrases.length, 1);
});

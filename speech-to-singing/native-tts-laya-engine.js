/* Swar-Sadhika Native TTS Laya Mode — local phrase planner.
 * It modulates the existing browser TTS voice; it does not synthesize PCM or true singing.
 */
export const NATIVE_TTS_LAYA_VERSION = "1.0.0";

const LIMITS = Object.freeze({
  maxInputLength: 100000,
  maxWordsPerPhrase: 5,
  maxCharsPerPhrase: 84,
  minRate: 0.65,
  maxRate: 1.15,
  minPitch: 0.90,
  maxPitch: 1.14
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function splitNativeTtsLayaPhrases(sourceText, options = {}) {
  if (typeof sourceText !== "string") throw new TypeError("Laya Mode का पाठ string होना चाहिए।");
  if (!sourceText.trim()) throw new TypeError("Laya Mode के लिए अर्थपूर्ण पाठ आवश्यक है।");
  if (sourceText.length > LIMITS.maxInputLength) throw new RangeError("Laya Mode पाठ 100000 characters से अधिक है।");
  if (!isPlainObject(options)) throw new TypeError("Phrase विभाजन विकल्प object होना चाहिए।");
  const maxWords = Math.round(clamp(finite(options.maxWordsPerPhrase, LIMITS.maxWordsPerPhrase), 1, 12));
  const maxChars = Math.round(clamp(finite(options.maxCharsPerPhrase, LIMITS.maxCharsPerPhrase), 16, 240));
  const phrases = [];
  const lines = sourceText.matchAll(/[^\r\n]+/gu);
  for (const lineMatch of lines) {
    const line = lineMatch[0];
    const lineOffset = lineMatch.index;
    const words = Array.from(line.matchAll(/\S+/gu));
    let groupStart = null;
    let groupEnd = null;
    let groupWords = 0;
    const flush = () => {
      if (groupStart === null || groupEnd === null) return;
      const text = sourceText.slice(groupStart, groupEnd);
      if (text.trim()) phrases.push(Object.freeze({ index: phrases.length, text, start: groupStart, end: groupEnd }));
      groupStart = null;
      groupEnd = null;
      groupWords = 0;
    };
    for (const wordMatch of words) {
      const word = wordMatch[0];
      const start = lineOffset + wordMatch.index;
      const end = start + word.length;
      const proposedLength = groupStart === null ? word.length : end - groupStart;
      if (groupStart !== null && (groupWords >= maxWords || proposedLength > maxChars)) flush();
      if (groupStart === null) groupStart = start;
      groupEnd = end;
      groupWords += 1;
      if (/[।॥!?;:][\]"'”’»)}\]]*$/u.test(word)) flush();
    }
    flush();
  }
  return Object.freeze(phrases);
}

function locateCompilerUnits(sourceText, units) {
  let cursor = 0;
  return units.map((unit, index) => {
    const value = String(unit && unit.text || "");
    if (!value) return Object.freeze({ unitIndex: Number.isInteger(unit && unit.index) ? unit.index : index, start: -1, end: -1 });
    let start = sourceText.indexOf(value, cursor);
    if (start < 0) start = sourceText.indexOf(value);
    if (start < 0) return Object.freeze({ unitIndex: Number.isInteger(unit && unit.index) ? unit.index : index, start: -1, end: -1 });
    cursor = start + value.length;
    return Object.freeze({ unitIndex: Number.isInteger(unit && unit.index) ? unit.index : index, start, end: cursor });
  });
}

function summarizePhraseNotes(phrase, locatedUnits, notes, settings) {
  const unitIndexes = new Set(locatedUnits
    .filter(unit => unit.start >= phrase.start && unit.end <= phrase.end)
    .map(unit => unit.unitIndex));
  const phraseNotes = notes.filter(note => note && unitIndexes.has(note.unitIndex) && note.type !== "rest");
  const semitones = phraseNotes.map(note => finite(note && note.swara && note.swara.semitonesFromSa, NaN)).filter(Number.isFinite);
  const durations = phraseNotes.map(note => finite(note && note.durationBeats, NaN)).filter(Number.isFinite);
  const meanSemitones = semitones.length ? semitones.reduce((sum, value) => sum + value, 0) / semitones.length : 6;
  const contour = semitones.length > 1 ? clamp((semitones[semitones.length - 1] - semitones[0]) / 12, -1, 1) : 0;
  const pitchDelta = ((meanSemitones - 6) / 6) * 0.045 + contour * 0.025;
  const basePitch = clamp(finite(settings.pitch, 1.02), 0, 2);
  const pitch = clamp(basePitch + pitchDelta, LIMITS.minPitch, LIMITS.maxPitch);
  const meanDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 1;
  const rateFactor = clamp(1 - Math.max(0, meanDuration - 1) * 0.035, 0.93, 1);
  const baseRate = clamp(finite(settings.rate, 0.88), LIMITS.minRate, LIMITS.maxRate);
  const rate = clamp(baseRate * rateFactor, LIMITS.minRate, LIMITS.maxRate);
  return Object.freeze({
    text: phrase.text,
    index: phrase.index,
    sourceStart: phrase.start,
    sourceEnd: phrase.end,
    pitch,
    rate,
    noteCount: phraseNotes.length,
    meanSemitones,
    meanDurationBeats: meanDuration
  });
}

export function createNativeTtsLayaPlan(sourceText, compilerResult, score, options = {}) {
  if (typeof sourceText !== "string" || !sourceText.trim()) throw new TypeError("Laya Plan के लिए मूल पाठ आवश्यक है।");
  if (!isPlainObject(compilerResult) || !Array.isArray(compilerResult.units) || !Array.isArray(compilerResult.phonemes) || !Array.isArray(compilerResult.boundaries)) {
    throw new TypeError("Phoneme Compiler का वैध units/phonemes/boundaries परिणाम आवश्यक है।");
  }
  if (!isPlainObject(score) || !Array.isArray(score.notes)) throw new TypeError("Singing Score का वैध notes परिणाम आवश्यक है।");
  if (!isPlainObject(options)) throw new TypeError("Laya Plan विकल्प object होना चाहिए।");
  const phrases = splitNativeTtsLayaPhrases(sourceText, options);
  const locatedUnits = locateCompilerUnits(sourceText, compilerResult.units);
  const phrasePlans = phrases.map(phrase => summarizePhraseNotes(phrase, locatedUnits, score.notes, options));
  if (!phrasePlans.length) throw new Error("पाठ से कोई वाक्यांश तैयार नहीं हुआ।");
  const totalNotes = phrasePlans.reduce((sum, phrase) => sum + phrase.noteCount, 0);
  return Object.freeze({
    version: NATIVE_TTS_LAYA_VERSION,
    status: "ready",
    sourceText,
    phrases: Object.freeze(phrasePlans),
    summary: Object.freeze({ phraseCount: phrasePlans.length, noteCount: totalNotes, estimatedScoreSeconds: finite(score.summary && score.summary.estimatedDurationSeconds, 0) }),
    warnings: Object.freeze([
      "Native TTS के Pitch/Rate परिवर्तन वाक्यांश स्तर पर अनुमानित हैं; यह वास्तविक गान या सटीक सुर-साधना नहीं है।",
      "वैदिक स्वराघात और शाखा-विशिष्ट पाठ-परंपरा को इस संगीतात्मक contour में स्वतः नहीं बदला गया है।"
    ]),
    capabilities: Object.freeze({ usesNativeTts: true, createsPcm: false, synthesizesVoice: false, exactSargam: false })
  });
}

export async function runNativeTtsLayaPlan(plan, speakPhrase, options = {}) {
  if (!isPlainObject(plan) || !Array.isArray(plan.phrases)) throw new TypeError("चलाने के लिए वैध Laya Plan आवश्यक है।");
  if (typeof speakPhrase !== "function") throw new TypeError("speakPhrase एक function होना चाहिए।");
  if (!isPlainObject(options)) throw new TypeError("Playback विकल्प object होना चाहिए।");
  const startIndex = Math.round(clamp(finite(options.startIndex, 0), 0, plan.phrases.length));
  const shouldContinue = typeof options.shouldContinue === "function" ? options.shouldContinue : () => true;
  const shouldPause = typeof options.shouldPause === "function" ? options.shouldPause : () => false;
  const onPhraseStart = typeof options.onPhraseStart === "function" ? options.onPhraseStart : () => {};
  const onPhraseEnd = typeof options.onPhraseEnd === "function" ? options.onPhraseEnd : () => {};
  let completedCount = 0;
  for (let index = startIndex; index < plan.phrases.length; index += 1) {
    if (!shouldContinue()) return Object.freeze({ status: "cancelled", nextIndex: index, completedCount });
    if (shouldPause()) return Object.freeze({ status: "paused", nextIndex: index, completedCount });
    const phrase = plan.phrases[index];
    onPhraseStart(index, phrase);
    let result;
    try {
      result = await speakPhrase(phrase.text, Object.freeze({ pitch: phrase.pitch, rate: phrase.rate, replace: false }), phrase);
    } finally {
      onPhraseEnd(index, phrase);
    }
    if (result && result.status === "cancelled") return Object.freeze({ status: "cancelled", nextIndex: index, completedCount });
    completedCount += 1;
    if (!shouldContinue()) return Object.freeze({ status: "cancelled", nextIndex: index + 1, completedCount });
    if (shouldPause()) return Object.freeze({ status: "paused", nextIndex: index + 1, completedCount });
  }
  return Object.freeze({ status: "ended", nextIndex: plan.phrases.length, completedCount });
}

export function selfTest() {
  const checks = [];
  const add = (id, condition) => checks.push(Object.freeze({ id, passed: Boolean(condition) }));
  add("version-present", typeof NATIVE_TTS_LAYA_VERSION === "string" && Boolean(NATIVE_TTS_LAYA_VERSION));
  add("phrase-split-keeps-words", splitNativeTtsLayaPhrases("ॐ नमः शिवाय। सर्वे भवन्तु सुखिनः॥").every(item => item.text.trim().length > 0));
  add("line-boundaries-preserved", splitNativeTtsLayaPhrases("प्रथम पंक्ति\nद्वितीय पंक्ति").length === 2);
  add("punctuation-boundary", splitNativeTtsLayaPhrases("ॐ नमः। शिवाय॥").length === 2);
  add("phrase-limit-applied", splitNativeTtsLayaPhrases("एक दो तीन चार पाँच छह सात", { maxWordsPerPhrase: 3 }).length === 3);
  add("empty-input-rejected", (() => { try { splitNativeTtsLayaPhrases(" "); return false; } catch (_) { return true; } })());
  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({ module: "native-tts-laya-engine", version: NATIVE_TTS_LAYA_VERSION, status: passed === checks.length ? "PASSED" : "FAILED", total: checks.length, passed, failed: checks.length - passed, checks: Object.freeze(checks) });
}

export function createNativeTtsLayaEngine(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("Native TTS Laya Engine options object होना चाहिए।");
  let dependencyPromise = null;
  async function loadDependencies() {
    if (dependencyPromise) return dependencyPromise;
    dependencyPromise = (async () => {
      const [compiler, score] = await Promise.all([
        options.phonemeCompiler ? Promise.resolve(options.phonemeCompiler) : import("./phoneme-compiler.js"),
        options.singingScoreEngine ? Promise.resolve(options.singingScoreEngine) : import("./singing-score-engine.js")
      ]);
      if (!compiler || typeof compiler.compilePhonemes !== "function" || !score || typeof score.compileSingingScore !== "function") {
        throw new TypeError("Phoneme Compiler या Singing Score Engine का आवश्यक API उपलब्ध नहीं है।");
      }
      return Object.freeze({ compiler, score });
    })().catch(error => {
      dependencyPromise = null;
      throw error;
    });
    return dependencyPromise;
  }
  async function initialize() {
    await loadDependencies();
    const result = selfTest();
    if (result.status !== "PASSED") throw new Error("Native TTS Laya Engine Self-Test विफल है।");
    return Object.freeze({ ready: true, version: NATIVE_TTS_LAYA_VERSION, selfTest: result });
  }
  async function createPlan(sourceText, speechSettings = {}) {
    const { compiler, score } = await loadDependencies();
    const compiled = compiler.compilePhonemes(sourceText, { language: "sa-IN" });
    const singingScore = score.compileSingingScore(compiled, speechSettings.scoreOptions || {});
    return createNativeTtsLayaPlan(sourceText, compiled, singingScore, speechSettings);
  }
  return Object.freeze({ version: NATIVE_TTS_LAYA_VERSION, initialize, createPlan, loadDependencies, selfTest });
}

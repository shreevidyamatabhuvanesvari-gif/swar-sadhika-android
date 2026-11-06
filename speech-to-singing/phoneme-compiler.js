/* Swar-Sadhika Speech-to-Singing — Vedic-aware Devanagari phoneme compiler.
 * Version 0.2.0. Pure local parser; no network, model, audio capture or synthesis.
 * Lexical matching accepts an injected local lexicon; this file is not itself a dictionary.
 * Vedic accents/cantillation remain source-labelled metadata unless tradition rules are supplied.
 */

export const PHONEME_COMPILER_VERSION = "0.2.0";

const VIRAMA = "्";
const CANDRABINDU = "ँ";
const ANUSVARA = "ं";
const VISARGA = "ः";
const AVAGRAHA = "ऽ";
const OM = "ॐ";
const DEFAULT_MAX_INPUT_LENGTH = 100000;
const cp = hex => String.fromCodePoint(parseInt(hex, 16));
const codePointLabel = character => "U+" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");

const VOWEL_ROWS = [
  ["अ", "a", "ɐ", "short", 1], ["आ", "ā", "aː", "long", 2],
  ["इ", "i", "i", "short", 1], ["ई", "ī", "iː", "long", 2],
  ["उ", "u", "u", "short", 1], ["ऊ", "ū", "uː", "long", 2],
  ["ऋ", "ṛ", "r̩", "short", 1], ["ॠ", "ṝ", "r̩ː", "long", 2],
  ["ऌ", "ḷ", "l̩", "short", 1], ["ॡ", "ḹ", "l̩ː", "long", 2],
  ["ए", "e", "eː", "long", 2], ["ऐ", "ai", "ai̯", "long", 2],
  ["ओ", "o", "oː", "long", 2], ["औ", "au", "au̯", "long", 2]
];
const VOWELS = new Map(VOWEL_ROWS.map(([character, symbol, ipa, length, mora]) => [
  character, Object.freeze({ character, symbol, ipa, length, mora })
]));
const VOWEL_SIGNS = new Map([
  ["ा", "ā"], ["ि", "i"], ["ी", "ī"], ["ु", "u"], ["ू", "ū"],
  ["ृ", "ṛ"], ["ॄ", "ṝ"], ["ॢ", "ḷ"], ["ॣ", "ḹ"], ["े", "e"],
  ["ै", "ai"], ["ो", "o"], ["ौ", "au"]
]);
const VOWEL_BY_SYMBOL = new Map(VOWEL_ROWS.map(row => [row[1], Object.freeze({
  symbol: row[1], ipa: row[2], length: row[3], mora: row[4]
})]));

const CONSONANT_ROWS = [
  ["क", "k", "k", "velar", "stop", false, false], ["ख", "kh", "kʰ", "velar", "stop", false, true],
  ["ग", "g", "ɡ", "velar", "stop", true, false], ["घ", "gh", "ɡʱ", "velar", "stop", true, true],
  ["ङ", "ṅ", "ŋ", "velar", "nasal", true, false],
  ["च", "c", "t͡ɕ", "palatal", "affricate", false, false], ["छ", "ch", "t͡ɕʰ", "palatal", "affricate", false, true],
  ["ज", "j", "d͡ʑ", "palatal", "affricate", true, false], ["झ", "jh", "d͡ʑʱ", "palatal", "affricate", true, true],
  ["ञ", "ñ", "ɲ", "palatal", "nasal", true, false],
  ["ट", "ṭ", "ʈ", "retroflex", "stop", false, false], ["ठ", "ṭh", "ʈʰ", "retroflex", "stop", false, true],
  ["ड", "ḍ", "ɖ", "retroflex", "stop", true, false], ["ढ", "ḍh", "ɖʱ", "retroflex", "stop", true, true],
  ["ण", "ṇ", "ɳ", "retroflex", "nasal", true, false],
  ["त", "t", "t̪", "dental", "stop", false, false], ["थ", "th", "t̪ʰ", "dental", "stop", false, true],
  ["द", "d", "d̪", "dental", "stop", true, false], ["ध", "dh", "d̪ʱ", "dental", "stop", true, true],
  ["न", "n", "n", "dental", "nasal", true, false],
  ["प", "p", "p", "labial", "stop", false, false], ["फ", "ph", "pʰ", "labial", "stop", false, true],
  ["ब", "b", "b", "labial", "stop", true, false], ["भ", "bh", "bʱ", "labial", "stop", true, true],
  ["म", "m", "m", "labial", "nasal", true, false],
  ["य", "y", "j", "approximant", "approximant", true, false], ["र", "r", "r", "approximant", "trill", true, false],
  ["ल", "l", "l", "approximant", "lateral", true, false], ["व", "v", "ʋ", "approximant", "approximant", true, false],
  ["श", "ś", "ɕ", "sibilant", "fricative", false, false], ["ष", "ṣ", "ʂ", "sibilant", "fricative", false, false],
  ["स", "s", "s", "sibilant", "fricative", false, false], ["ह", "h", "ɦ", "glottal", "fricative", true, false]
];
const CONSONANTS = new Map(CONSONANT_ROWS.map(([character, symbol, ipa, place, manner, voiced, aspirated]) => [
  character, Object.freeze({ character, symbol, ipa, place, manner, voiced, aspirated })
]));
// ळ is retained as a branch/text-specific Vedic form, not assumed to occur in every recension.
CONSONANTS.set("ळ", Object.freeze({ character: "ळ", symbol: "ḷ", ipa: "ɭ", place: "retroflex", manner: "lateral", voiced: true, aspirated: false, branchSpecific: true }));

const ACCENT_LABELS = new Map([
  ["॑", { label: "udatta", pitchClass: "high", tradition: "general-deva-vedic-mark" }],
  ["॒", { label: "anudatta", pitchClass: "low", tradition: "general-deva-vedic-mark" }]
]);
const LEGACY_TRANSLITERATION_MARKS = new Map([
  ["॓", "grave-accent-for-legacy-transliteration"],
  ["॔", "acute-accent-for-legacy-transliteration"]
]);

const VEDIC_EXTENSION_INFO = new Map([
  ["1CD0", ["samaveda-tone", "karshana", "samaveda"]],
  ["1CD1", ["samaveda-tone", "shara", "samaveda"]],
  ["1CD2", ["samaveda-vibrato", "prenkha", "samaveda"]],
  ["1CD4", ["yajurveda-tone", "midline-svarita", "yajurveda"]],
  ["1CD5", ["yajurveda-tone", "aggravated-independent-svarita", "yajurveda"]],
  ["1CD6", ["yajurveda-tone", "independent-svarita", "yajurveda"]],
  ["1CD7", ["yajurveda-tone", "kathaka-independent-svarita", "kathaka"]],
  ["1CD8", ["vowel-quantity-or-tone", "candra-below", "branch-specific"]],
  ["1CD9", ["yajurveda-tone", "kathaka-independent-svarita-schroeder", "kathaka"]],
  ["1CDA", ["vedic-tone", "double-svarita", "branch-specific"]],
  ["1CDB", ["vedic-tone", "triple-svarita", "branch-specific"]],
  ["1CDC", ["yajurveda-tone", "kathaka-anudatta", "kathaka"]],
  ["1CDD", ["vedic-tone", "dot-below", "branch-specific"]],
  ["1CDE", ["vedic-tone", "two-dots-below", "branch-specific"]],
  ["1CDF", ["vedic-tone", "three-dots-below", "branch-specific"]],
  ["1CE0", ["rigveda-tone", "kashmiri-independent-svarita", "rigveda-kashmiri"]],
  ["1CE1", ["atharvaveda-tone", "independent-svarita", "atharvaveda"]],
  ["1CE2", ["visarga-tone", "svarita", "branch-specific"]],
  ["1CE3", ["visarga-tone", "udatta", "branch-specific"]],
  ["1CE4", ["visarga-tone", "reversed-udatta", "branch-specific"]],
  ["1CE5", ["visarga-tone", "anudatta", "branch-specific"]],
  ["1CE6", ["visarga-tone", "reversed-anudatta", "branch-specific"]],
  ["1CE7", ["visarga-tone", "udatta-with-tail", "branch-specific"]],
  ["1CE8", ["visarga-tone", "anudatta-with-tail", "branch-specific"]],
  ["1CE9", ["nasalization", "anusvara-antargomukha", "branch-specific"]],
  ["1CEA", ["nasalization", "anusvara-bahirmukha", "branch-specific"]],
  ["1CEB", ["nasalization", "anusvara-vamagomukha", "branch-specific"]],
  ["1CEC", ["nasalization", "anusvara-vamagomukha-with-tail", "branch-specific"]],
  ["1CED", ["nasalization", "tiryak", "branch-specific"]],
  ["1CEE", ["long-anusvara", "hexiform-long-anusvara", "branch-specific"]],
  ["1CEF", ["long-anusvara", "long-anusvara", "branch-specific"]],
  ["1CF0", ["long-anusvara", "rthang-long-anusvara", "branch-specific"]],
  ["1CF1", ["compound-nasal-visarga", "anusvara-ubhayato-mukha", "branch-specific"]],
  ["1CF7", ["vedic-recitation-mark", "atikrama", "branch-specific"]],
  ["1CF8", ["samaveda-tone", "jaiminiya-ring-above", "samaveda-jaiminiya"]],
  ["1CF9", ["samaveda-tone", "jaiminiya-double-ring-above", "samaveda-jaiminiya"]],
  ["1CFA", ["nasalization", "double-anusvara-antargomukha", "branch-specific"]]
]);
const VEDIC_PRECONSONANT_SIGNS = new Map([
  [cp("1CF2"), { kind: "ardhavisarga", name: "ardhavisarga" }],
  [cp("1CF3"), { kind: "ardhavisarga", name: "rotated-ardhavisarga" }],
  [cp("1CF5"), { kind: "visarga-allophone", name: "jihvamuliya", before: ["क", "ख"], symbol: "ẖ", ipa: "x" }],
  [cp("1CF6"), { kind: "visarga-allophone", name: "upadhmaniya", before: ["प", "फ"], symbol: "ḫ", ipa: "ɸ" }]
]);

const SAMAVEDA_MARKS = new Map([
  ["A8E0", ["samaveda-cantillation-digit", "zero", null]],
  ["A8E1", ["samaveda-cantillation-digit", "one", "udatta-hint"]],
  ["A8E2", ["samaveda-cantillation-digit", "two", "svarita-hint"]],
  ["A8E3", ["samaveda-cantillation-digit", "three", "anudatta-hint"]],
  ["A8E4", ["samaveda-cantillation-digit", "four", null]],
  ["A8E5", ["samaveda-cantillation-digit", "five", null]],
  ["A8E6", ["samaveda-cantillation-digit", "six", null]],
  ["A8E7", ["samaveda-cantillation-digit", "seven", null]],
  ["A8E8", ["samaveda-cantillation-digit", "eight", null]],
  ["A8E9", ["samaveda-cantillation-digit", "nine", null]],
  ["A8EA", ["samaveda-cantillation-letter", "a-abhinihita", null]],
  ["A8EB", ["samaveda-cantillation-letter", "u", null]],
  ["A8EC", ["samaveda-cantillation-letter", "ka", null]],
  ["A8ED", ["samaveda-cantillation-letter", "na-namana", null]],
  ["A8EE", ["samaveda-cantillation-letter", "pa-prannatam", null]],
  ["A8EF", ["samaveda-cantillation-letter", "ra", null]],
  ["A8F0", ["samaveda-cantillation-letter", "vi-vinata", null]],
  ["A8F1", ["samaveda-avagraha", "dirghibhava", null]]
]);
const DEVANAGARI_NASAL_MARKS = new Map([
  ["A8F2", "spacing-candrabindu"], ["A8F3", "candrabindu-virama"],
  ["A8F4", "double-candrabindu-virama"], ["A8F5", "candrabindu-two"],
  ["A8F6", "candrabindu-three"], ["A8F7", "candrabindu-avagraha"]
]);
const EDITORIAL_MARKS = new Map([
  ["A8F8", "pushpika"], ["A8F9", "gap-filler"], ["A8FA", "caret-insertion-point"], ["A8FB", "headstroke-uncertain-reading"],
  ["A8FC", "siddham-invocation"], ["A8FD", "jain-om-sign"]
]);
const LONG_ANUSVARA_CODES = new Set(["1CEE", "1CEF", "1CF0"]);
const NASAL_ANNOTATION_CODES = new Set(["1CE9", "1CEA", "1CEB", "1CEC", "1CED", "1CF1", "1CFA"]);
const VISARGA_TONE_CODES = new Set(["1CE2", "1CE3", "1CE4", "1CE5", "1CE6", "1CE7", "1CE8"]);

const LEXICON_REFERENCES = Object.freeze([
  Object.freeze({ id: "GRA", title: "Hermann Grassmann, Wörterbuch zum Rig-Veda (1873)", scope: "Ṛgveda vocabulary", coverage: "Rigvedic concordance-dictionary; not a complete dictionary of all four Vedas" }),
  Object.freeze({ id: "CDSL", title: "Cologne Digital Sanskrit Dictionaries", scope: "multiple Sanskrit dictionaries and specialized Vedic indices", coverage: "includes GRA and Vedic reference works; source-by-source scope varies" }),
  Object.freeze({ id: "VedaWeb", title: "VedaWeb / VedaWeb 2.0", scope: "Vedic text corpus with lemmas, forms and morphological/metrical annotations", coverage: "text-corpus resource; coverage differs by text and release" }),
  Object.freeze({ id: "VEI", title: "Macdonell & Keith, The Vedic Index of Names and Subjects (1912)", scope: "Vedic names and subjects", coverage: "specialized index, not a general phoneme dictionary" })
]);

function addWarning(warnings, code, message, source, unitIndex = null) {
  warnings.push({ code, message, source, unitIndex });
}
function normalizeLexiconKey(word) {
  return String(word).normalize("NFC").trim();
}
function normalizeOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Phoneme Compiler options एक object होना चाहिए।");
  }
  const maxInputLength = options.maxInputLength == null ? DEFAULT_MAX_INPUT_LENGTH : Number(options.maxInputLength);
  if (!Number.isInteger(maxInputLength) || maxInputLength < 1 || maxInputLength > 1000000) {
    throw new RangeError("maxInputLength 1 से 1000000 के बीच पूर्णांक होना चाहिए।");
  }
  const language = options.language == null ? "sa-IN" : String(options.language).trim();
  if (!language) throw new TypeError("language खाली नहीं हो सकती।");
  let lexicon = null;
  if (options.lexicon != null) {
    if (options.lexicon instanceof Map) lexicon = new Map(options.lexicon);
    else if (typeof options.lexicon === "object" && !Array.isArray(options.lexicon) &&
      (Object.getPrototypeOf(options.lexicon) === Object.prototype || Object.getPrototypeOf(options.lexicon) === null)) {
      lexicon = Object.freeze({ ...options.lexicon });
    } else {
      throw new TypeError("lexicon एक स्थानीय Map या plain object होना चाहिए; compiler कोई ऑनलाइन सेवा नहीं बुलाता।");
    }
  }
  const lexiconInfo = options.lexiconInfo == null ? {} : options.lexiconInfo;
  if (!lexiconInfo || typeof lexiconInfo !== "object" || Array.isArray(lexiconInfo)) {
    throw new TypeError("lexiconInfo एक object होना चाहिए।");
  }
  return Object.freeze({ language, maxInputLength, lexicon, lexiconInfo: Object.freeze({ ...lexiconInfo }) });
}
function lookupLexiconEntry(lexicon, key) {
  if (!lexicon) return null;
  const raw = lexicon instanceof Map ? lexicon.get(key) : Object.prototype.hasOwnProperty.call(lexicon, key) ? lexicon[key] : null;
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("स्थानीय lexicon entry object होना चाहिए: " + key);
  const allowed = ["lemma", "gloss", "partOfSpeech", "grammar", "veda", "recension", "textReference", "padaPatha", "accent", "notes", "source", "dictionaryId", "dictionaryReference"];
  const entry = { form: key };
  for (const field of allowed) {
    if (raw[field] == null) continue;
    if (typeof raw[field] !== "string") throw new TypeError("lexicon entry का " + field + " string होना चाहिए: " + key);
    entry[field] = raw[field];
  }
  return Object.freeze(entry);
}
function readConsonant(characters, index) {
  const character = characters[index];
  const info = CONSONANTS.get(character);
  return info ? { info, length: 1 } : null;
}
function classifyMark(character) {
  if (character === CANDRABINDU || character === "ऀ") return "candrabindu";
  if (character === ANUSVARA) return "anusvara";
  if (character === VISARGA) return "visarga";
  if (ACCENT_LABELS.has(character)) return "vedic-accent";
  if (LEGACY_TRANSLITERATION_MARKS.has(character)) return "legacy-transliteration-mark";
  const code = character.codePointAt(0).toString(16).toUpperCase();
  if (VISARGA_TONE_CODES.has(code)) return "visarga-tone";
  if (LONG_ANUSVARA_CODES.has(code)) return "long-anusvara";
  if (NASAL_ANNOTATION_CODES.has(code)) return "vedic-nasalization";
  if (VEDIC_EXTENSION_INFO.has(code)) return "vedic-extension";
  if (SAMAVEDA_MARKS.has(code)) return "samaveda-cantillation";
  if (DEVANAGARI_NASAL_MARKS.has(code)) return "devanagari-vedic-nasalization";
  if (EDITORIAL_MARKS.has(code)) return "vedic-editorial-mark";
  return null;
}
function getVowel(symbol) {
  return VOWEL_BY_SYMBOL.get(symbol) || null;
}
function makeUnit(index, text, kind, phonemeStart, vowel = null) {
  return {
    index, text, kind, phonemeStart, vowel, vowelPhonemeIndex: null, visargaPhonemeIndex: null,
    nasalized: false, consonants: [], accents: [], marks: [], hasVowel: Boolean(vowel)
  };
}

/**
 * Converts Vedic/Sanskrit Devanagari orthography to a conservative phoneme plan.
 * Exact recitational realization remains recension-specific; this is not an SVS engine.
 */
export function compilePhonemes(input, options = {}) {
  if (typeof input !== "string") throw new TypeError("compilePhonemes() का input string होना चाहिए।");
  const settings = normalizeOptions(options);
  if (input.length > settings.maxInputLength) throw new RangeError("पाठ configured maxInputLength सीमा से बड़ा है।");

  const text = input.normalize("NFC");
  const characters = Array.from(text);
  const phonemes = [];
  const units = [];
  const boundaries = [];
  const annotations = [];
  const warnings = [];
  let cursor = 0;

  function pushPhoneme(unitIndex, data) {
    const record = Object.freeze({ index: phonemes.length, unitIndex, ...data });
    phonemes.push(record);
    return record.index;
  }
  function annotate(unit, unitIndex, data) {
    const record = { unitIndex, ...data };
    unit.marks.push(record);
    annotations.push(record);
    return record;
  }
  function attachMark(unit, unitIndex, mark) {
    const category = classifyMark(mark);
    const hex = mark.codePointAt(0).toString(16).toUpperCase();
    const cpLabel = codePointLabel(mark);

    if (category === "candrabindu") {
      unit.nasalized = true;
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: "nasalization", interpretation: "vowel-nasalization" });
      if (Number.isInteger(unit.vowelPhonemeIndex)) {
        const previous = phonemes[unit.vowelPhonemeIndex];
        phonemes[unit.vowelPhonemeIndex] = Object.freeze({ ...previous, nasalized: true });
      } else addWarning(warnings, "NASALIZATION_WITHOUT_VOWEL", "अनुनासिकता चिह्न के साथ संबद्ध स्वर नहीं मिला।", mark, unitIndex);
      return;
    }
    if (category === "anusvara") {
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: "anusvara", interpretation: "context-dependent-nasal" });
      pushPhoneme(unitIndex, { symbol: "ṃ", ipa: null, type: "nasal-mark", source: mark, contextDependent: true, realization: "place-assimilation-requires-phonetic-context" });
      addWarning(warnings, "ANUSVARA_CONTEXT_REQUIRED", "अनुस्वार का सटीक नासिक्य उच्चारण अगले वर्ण और पाठ-परंपरा पर निर्भर है।", mark, unitIndex);
      return;
    }
    if (category === "visarga") {
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: "visarga", interpretation: "context-dependent-visarga" });
      unit.visargaPhonemeIndex = pushPhoneme(unitIndex, { symbol: "ḥ", ipa: null, type: "visarga", source: mark, contextDependent: true, accentMarks: Object.freeze([]) });
      addWarning(warnings, "VISARGA_CONTEXT_REQUIRED", "विसर्ग का वास्तविक उच्चारण और allophone संदर्भ तथा पाठ-परंपरा के अनुसार बदल सकता है।", mark, unitIndex);
      return;
    }
    if (category === "vedic-accent") {
      const info = ACCENT_LABELS.get(mark);
      const accent = Object.freeze({ character: mark, codePoint: cpLabel, label: info.label, pitchClass: info.pitchClass, tradition: info.tradition, interpretation: "source-mark-preserved; detailed contour requires recension rules" });
      unit.accents.push(accent);
      if (Number.isInteger(unit.visargaPhonemeIndex)) {
        const previous = phonemes[unit.visargaPhonemeIndex];
        phonemes[unit.visargaPhonemeIndex] = Object.freeze({ ...previous, accentMarks: Object.freeze([...(previous.accentMarks || []), accent]) });
      } else if (Number.isInteger(unit.vowelPhonemeIndex)) {
        const previous = phonemes[unit.vowelPhonemeIndex];
        phonemes[unit.vowelPhonemeIndex] = Object.freeze({ ...previous, accentMarks: Object.freeze([...(previous.accentMarks || []), accent]) });
      } else addWarning(warnings, "ORPHAN_VEDIC_ACCENT", "वैदिक स्वर-चिह्न के साथ संबद्ध स्वर/विसर्ग नहीं मिला।", mark, unitIndex);
      annotate(unit, unitIndex, { ...accent, category: "vedic-accent" });
      return;
    }
    if (category === "legacy-transliteration-mark") {
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category, interpretation: LEGACY_TRANSLITERATION_MARKS.get(mark) });
      addWarning(warnings, "LEGACY_TRANSLITERATION_MARK", "यह चिह्न देवनागरी वैदिक स्वराघात का मानक चिह्न नहीं; इसे केवल transliteration annotation के रूप में रखा गया है।", mark, unitIndex);
      return;
    }
    if (category === "visarga-tone") {
      const [kind, label, tradition] = VEDIC_EXTENSION_INFO.get(hex) || [];
      const tone = Object.freeze({ character: mark, codePoint: cpLabel, label, tradition, category: kind, interpretation: "visarga-tone-metadata" });
      if (Number.isInteger(unit.visargaPhonemeIndex)) {
        const previous = phonemes[unit.visargaPhonemeIndex];
        phonemes[unit.visargaPhonemeIndex] = Object.freeze({ ...previous, accentMarks: Object.freeze([...(previous.accentMarks || []), tone]) });
      } else addWarning(warnings, "ORPHAN_VISARGA_TONE", "विसर्ग-स्वराघात चिह्न से पहले विसर्ग नहीं मिला।", mark, unitIndex);
      unit.accents.push(tone);
      annotate(unit, unitIndex, { ...tone });
      return;
    }
    if (category === "long-anusvara") {
      const [kind, label, tradition] = VEDIC_EXTENSION_INFO.get(hex) || [];
      const previousVowel = Number.isInteger(unit.vowelPhonemeIndex) ? phonemes[unit.vowelPhonemeIndex] : null;
      const vowelIsShort = Boolean(previousVowel && previousVowel.vowelLength === "short");
      pushPhoneme(unitIndex, { symbol: "ṃː", ipa: null, type: "long-anusvara", source: mark, contextDependent: true, duration: "long", expectedAfterShortVowel: true, followsShortVowel: vowelIsShort });
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: kind, label, tradition, realization: "long-anusvara-after-short-vowel" });
      if (!vowelIsShort) addWarning(warnings, "LONG_ANUSVARA_EXPECTS_SHORT_VOWEL", "दीर्घ अनुस्वार चिह्न के ठीक पहले पहचाना गया स्वर ह्रस्व नहीं है; मूल चिह्न सुरक्षित रखा गया है।", mark, unitIndex);
      return;
    }
    if (category === "vedic-nasalization" || category === "devanagari-vedic-nasalization") {
      const [kind, label, tradition] = VEDIC_EXTENSION_INFO.get(hex) || [];
      const nasalLabel = DEVANAGARI_NASAL_MARKS.get(hex) || label || "vedic-nasalization";
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: kind || "vedic-nasalization", label: nasalLabel, tradition: tradition || "samaveda-or-branch-specific", interpretation: "nasalization-mark-preserved-without-forced-allophone" });
      if (Number.isInteger(unit.vowelPhonemeIndex) && (hex === "A8F2")) {
        unit.nasalized = true;
        const previous = phonemes[unit.vowelPhonemeIndex];
        phonemes[unit.vowelPhonemeIndex] = Object.freeze({ ...previous, nasalized: true });
      }
      return;
    }
    if (category === "samaveda-cantillation") {
      const [kind, label, tonalHint] = SAMAVEDA_MARKS.get(hex) || [];
      const markInfo = Object.freeze({ character: mark, codePoint: cpLabel, category: kind, label, tonalHint: tonalHint || null, tradition: "samaveda", interpretation: "cantillation-metadata-only; no melody inferred" });
      annotate(unit, unitIndex, markInfo);
      return;
    }
    if (category === "vedic-extension") {
      const [kind, label, tradition] = VEDIC_EXTENSION_INFO.get(hex) || [];
      const markInfo = Object.freeze({ character: mark, codePoint: cpLabel, category: kind, label, tradition, interpretation: hex === "1CD8" ? "possible-short-e-or-o-marker; inspect-host-vowel" : "source-sign-preserved; recension-specific" });
      if (hex === "1CD8" && Number.isInteger(unit.vowelPhonemeIndex)) {
        const previous = phonemes[unit.vowelPhonemeIndex];
        if (previous.symbol === "e" || previous.symbol === "o") {
          const shortIpa = previous.symbol === "e" ? "e" : "o";
          phonemes[unit.vowelPhonemeIndex] = Object.freeze({ ...previous, ipa: shortIpa, vowelLength: "short", mora: 1, quantitySource: "U+1CD8 VEDIC TONE CANDRA BELOW" });
          unit.vowel = Object.freeze({ ...unit.vowel, ipa: shortIpa, length: "short", mora: 1 });
        } else {
          addWarning(warnings, "CANDRA_BELOW_WITHOUT_E_O", "U+1CD8 सामान्यतः e/o के ह्रस्व प्रयोग को दर्शा सकता है; यहाँ e/o स्वर नहीं मिला।", mark, unitIndex);
        }
      }
      annotate(unit, unitIndex, markInfo);
      return;
    }
    if (category === "vedic-editorial-mark") {
      const label = EDITORIAL_MARKS.get(hex);
      annotate(unit, unitIndex, { character: mark, codePoint: cpLabel, category: "vedic-editorial-mark", label, interpretation: "editorial-or-invocation-mark; not a phoneme" });
      return;
    }
  }

  function consumeMarks(unit, unitIndex, from) {
    let next = from;
    while (next < characters.length && classifyMark(characters[next])) {
      attachMark(unit, unitIndex, characters[next]);
      next += 1;
    }
    return next;
  }
  function finalizeUnit(unit) {
    const end = phonemes.length;
    units.push(Object.freeze({
      index: unit.index, text: unit.text, kind: unit.kind || "akshara",
      hasVowel: Boolean(unit.vowel), vowelSymbol: unit.vowel ? unit.vowel.symbol : null,
      vowelLength: unit.vowel ? unit.vowel.length : null, mora: unit.vowel ? unit.vowel.mora : 0,
      nasalized: Boolean(unit.nasalized), consonants: Object.freeze(unit.consonants.slice()),
      accents: Object.freeze(unit.accents.slice()), marks: Object.freeze(unit.marks.slice()),
      phonemeStart: unit.phonemeStart, phonemeEnd: end, phonemeCount: end - unit.phonemeStart
    }));
  }

  while (cursor < characters.length) {
    const start = cursor;
    const character = characters[cursor];
    const hex = character.codePointAt(0).toString(16).toUpperCase();

    if (/\s/u.test(character)) {
      let value = "";
      while (cursor < characters.length && /\s/u.test(characters[cursor])) value += characters[cursor++];
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "word-boundary", text: value, afterUnitIndex: units.length - 1, canPause: true }));
      continue;
    }

    // U+1CD3 is a Samavedic section marker across which pausing is disallowed.
    if (hex === "1CD3") {
      cursor += 1;
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "samaveda-no-pause-boundary", text: character, codePoint: codePointLabel(character), afterUnitIndex: units.length - 1, canPause: false, source: "U+1CD3 VEDIC SIGN NIHSHVASA" }));
      annotations.push(Object.freeze({ category: "samaveda-breathing-boundary", character, codePoint: codePointLabel(character), interpretation: "separates-recitation-sections-between-which-pause-is-disallowed" }));
      continue;
    }

    // Jihvamuliya/upadhmaniya/ardhavisarga occur before the homorganic stop in logical text.
    if (VEDIC_PRECONSONANT_SIGNS.has(character)) {
      const sign = VEDIC_PRECONSONANT_SIGNS.get(character);
      const nextCharacter = characters[cursor + 1] || "";
      const unitIndex = units.length;
      const unit = makeUnit(unitIndex, character, "vedic-preconsonant-visarga", phonemes.length, null);
      const nextInfo = CONSONANTS.get(nextCharacter);
      let realization = sign.name;
      let valid = true;
      if (sign.before) valid = sign.before.includes(nextCharacter);
      if (sign.kind === "ardhavisarga") {
        if (["क", "ख"].includes(nextCharacter)) realization = "jihvamuliya-context";
        else if (["प", "फ"].includes(nextCharacter)) realization = "upadhmaniya-context";
        else { realization = "unresolved-ardhavisarga"; valid = false; }
      }
      if (sign.kind === "visarga-allophone" && !nextInfo) valid = false;
      pushPhoneme(unitIndex, { symbol: sign.symbol || "ḥ", ipa: sign.ipa || null, type: sign.kind, source: character, realization, contextDependent: true, followedBy: nextCharacter || null });
      unit.text = character;
      unit.marks.push(Object.freeze({ character, codePoint: codePointLabel(character), category: sign.kind, label: sign.name, realization }));
      finalizeUnit(unit);
      annotations.push(Object.freeze({ unitIndex, character, codePoint: codePointLabel(character), category: sign.kind, label: sign.name, realization }));
      if (!valid) addWarning(warnings, "VISARGA_ALLOPHONE_CONTEXT_MISMATCH", "जिह्वामूलीय/उपध्मानीय/अर्धविसर्ग चिह्न के बाद अपेक्षित क-वर्ग या प-वर्ग संदर्भ नहीं मिला।", character, unitIndex);
      cursor += 1;
      continue;
    }

    if (character === AVAGRAHA) {
      cursor += 1;
      annotations.push(Object.freeze({ category: "avagraha", character, codePoint: codePointLabel(character), interpretation: "elision-marker; not a spoken phoneme" }));
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "elision-marker", text: character, afterUnitIndex: units.length - 1, canPause: false }));
      continue;
    }

    if (character === OM) {
      const unitIndex = units.length;
      const unit = makeUnit(unitIndex, character, "sacred-syllable", phonemes.length, null);
      pushPhoneme(unitIndex, { symbol: "oṃ", ipa: null, type: "sacred-syllable", source: character, contextDependent: true, realization: "recitation-specific; no fixed mora assigned" });
      unit.marks.push(Object.freeze({ character, codePoint: codePointLabel(character), category: "sacred-sign", interpretation: "om-symbol-preserved-without-fixed-duration" }));
      finalizeUnit(unit);
      annotations.push(Object.freeze({ unitIndex, character, codePoint: codePointLabel(character), category: "sacred-sign", interpretation: "om-symbol-preserved-without-fixed-duration" }));
      addWarning(warnings, "OM_REALIZATION_CONTEXT_REQUIRED", "ॐ का काल और स्वर-पद्धति पाठ तथा परंपरा के अनुसार निर्धारित करें; compiler ने निश्चित मात्रा नहीं थोपी।", character, unitIndex);
      cursor += 1;
      continue;
    }

    const consonant = readConsonant(characters, cursor);
    if (consonant) {
      const unitIndex = units.length;
      const cluster = [];
      let next = cursor;
      let terminalVirama = false;
      while (next < characters.length) {
        const current = readConsonant(characters, next);
        if (!current) break;
        cluster.push(current.info);
        next += current.length;
        if (characters[next] === VIRAMA) {
          next += 1;
          if (readConsonant(characters, next)) continue;
          terminalVirama = true;
          break;
        }
        break;
      }
      let vowel = null;
      if (!terminalVirama && next < characters.length && VOWEL_SIGNS.has(characters[next])) {
        vowel = getVowel(VOWEL_SIGNS.get(characters[next]));
        next += 1;
      } else if (!terminalVirama) vowel = getVowel("a");

      const unit = makeUnit(unitIndex, characters.slice(start, next).join(""), "akshara", phonemes.length, vowel);
      unit.consonants = cluster.map(item => item.symbol);
      for (const item of cluster) {
        pushPhoneme(unitIndex, { symbol: item.symbol, ipa: item.ipa, type: "consonant", source: item.character,
          features: Object.freeze({ place: item.place, manner: item.manner, voiced: item.voiced, aspirated: item.aspirated, branchSpecific: Boolean(item.branchSpecific) }) });
      }
      if (vowel) unit.vowelPhonemeIndex = pushPhoneme(unitIndex, { symbol: vowel.symbol, ipa: vowel.ipa, type: "vowel", source: characters.slice(start, next).join(""),
        vowelLength: vowel.length, mora: vowel.mora, independent: false, nasalized: false, accentMarks: Object.freeze([]) });
      next = consumeMarks(unit, unitIndex, next);
      cursor = next;
      unit.text = characters.slice(start, cursor).join("");
      finalizeUnit(unit);
      continue;
    }

    const independentVowel = VOWELS.get(character);
    if (independentVowel) {
      const unitIndex = units.length;
      const unit = makeUnit(unitIndex, character, "akshara", phonemes.length, independentVowel);
      unit.vowelPhonemeIndex = pushPhoneme(unitIndex, { symbol: independentVowel.symbol, ipa: independentVowel.ipa, type: "vowel", source: character,
        vowelLength: independentVowel.length, mora: independentVowel.mora, independent: true, nasalized: false, accentMarks: Object.freeze([]) });
      cursor += 1;
      cursor = consumeMarks(unit, unitIndex, cursor);
      unit.text = characters.slice(start, cursor).join("");
      finalizeUnit(unit);
      continue;
    }

    if (classifyMark(character)) {
      const unitIndex = units.length;
      const unit = makeUnit(unitIndex, character, "orphan-mark", phonemes.length, null);
      attachMark(unit, unitIndex, character);
      cursor += 1;
      finalizeUnit(unit);
      addWarning(warnings, "ORPHAN_DIACRITIC", "यह वैदिक/ध्वनि-चिह्न आधार अक्षर से अलग मिला; मूल चिह्न सुरक्षित रखा गया है।", character, unitIndex);
      continue;
    }

    if (character === "।" || character === "॥" || /[.,;:!?।॥]/u.test(character)) {
      cursor += 1;
      const kind = character === "॥" ? "verse-pause" : character === "।" ? "danda-pause" : "punctuation-pause";
      boundaries.push(Object.freeze({ index: boundaries.length, kind, text: character, afterUnitIndex: units.length - 1, canPause: true }));
      continue;
    }

    if (/^[०-९0-9]$/u.test(character)) {
      cursor += 1;
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "number-marker", text: character, afterUnitIndex: units.length - 1, canPause: false }));
      annotations.push(Object.freeze({ category: "number", character, codePoint: codePointLabel(character), interpretation: "not-expanded-to-spoken-number" }));
      continue;
    }

    cursor += 1;
    const unitIndex = units.length;
    const unknown = Object.freeze({ index: phonemes.length, unitIndex, symbol: null, ipa: null, type: "unknown", source: character, codePoint: codePointLabel(character) });
    phonemes.push(unknown);
    units.push(Object.freeze({ index: unitIndex, text: character, kind: "unknown", hasVowel: false, vowelSymbol: null, vowelLength: null, mora: 0,
      nasalized: false, consonants: Object.freeze([]), accents: Object.freeze([]), marks: Object.freeze([]), phonemeStart: unknown.index, phonemeEnd: unknown.index + 1, phonemeCount: 1 }));
    addWarning(warnings, "UNRECOGNIZED_CHARACTER", "यह वर्ण/चिह्न compiler की ज्ञात देवनागरी-वैदिक सूची में नहीं है; इसे हटाने के बजाय unknown के रूप में सुरक्षित रखा गया है।", character, unitIndex);
  }

  const wordForms = text.match(/[^\s।॥,;:.!?]+/gu) || [];
  const words = wordForms.map((form, index) => {
    const key = normalizeLexiconKey(form);
    const entry = lookupLexiconEntry(settings.lexicon, key);
    return Object.freeze({ index, form, normalizedForm: key, lookupStatus: entry ? "matched" : settings.lexicon ? "not-found" : "lexicon-not-loaded", entry });
  });
  const matchedWords = words.filter(word => word.lookupStatus === "matched").length;

  return Object.freeze({
    version: PHONEME_COMPILER_VERSION,
    language: settings.language,
    script: "Devanagari",
    sourceText: input,
    normalizedText: text,
    phonemes: Object.freeze(phonemes.slice()),
    units: Object.freeze(units.slice()),
    boundaries: Object.freeze(boundaries.slice()),
    annotations: Object.freeze(annotations.slice()),
    warnings: Object.freeze(warnings.map(item => Object.freeze({ ...item }))),
    words: Object.freeze(words),
    lexicon: Object.freeze({
      loaded: Boolean(settings.lexicon),
      id: settings.lexiconInfo.id == null ? null : String(settings.lexiconInfo.id),
      name: settings.lexiconInfo.name == null ? null : String(settings.lexiconInfo.name),
      version: settings.lexiconInfo.version == null ? null : String(settings.lexiconInfo.version),
      matchedWords,
      unmatchedWords: words.length - matchedWords,
      lookupMode: "exact-NFC-word-form-only; no automatic sandhi splitting or lemma guessing",
      references: LEXICON_REFERENCES
    }),
    summary: Object.freeze({
      inputCodePoints: characters.length, unitCount: units.length, phonemeCount: phonemes.length,
      vowelCount: phonemes.filter(item => item.type === "vowel").length,
      consonantCount: phonemes.filter(item => item.type === "consonant").length,
      unknownCount: phonemes.filter(item => item.type === "unknown").length,
      warningCount: warnings.length, wordCount: words.length, lexiconMatchedWordCount: matchedWords
    }),
    policy: Object.freeze({
      inherentVowel: "preserved-unless-virama-or-dependent-vowel-sign",
      scriptNormalization: "NFC",
      accentHandling: "source-labelled metadata; no branch-specific pitch contour inferred",
      samavedaNihshvasa: "no-pause boundary; never convert to an ordinary pause",
      anusvaraHandling: "preserved; contextual/recension-specific realization; no forced assimilation",
      visargaHandling: "visarga accents and pre-consonant allophones preserved with context checks",
      lexiconHandling: "optional caller-supplied local dataset; no external lookup; no claim of complete built-in lexicon",
      outputRole: "orthographic/phonetic plan; not a syllable meter, singing score or audio"
    })
  });
}

export function createPhonemeCompiler(defaultOptions = {}) {
  const defaults = normalizeOptions(defaultOptions);
  return Object.freeze({
    version: PHONEME_COMPILER_VERSION,
    compile(text, overrides = {}) {
      if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new TypeError("compile() overrides एक object होना चाहिए।");
      return compilePhonemes(text, { ...defaults, ...overrides });
    },
    selfTest
  });
}

export function selfTest() {
  const checks = [];
  const add = (id, passed, detail = "") => checks.push(Object.freeze({ id, passed: Boolean(passed), detail: String(detail || "") }));
  const symbols = text => compilePhonemes(text).phonemes.map(item => item.symbol);
  const code = hex => String.fromCodePoint(parseInt(hex, 16));

  add("all-independent-vowels", VOWEL_ROWS.every(([character]) => compilePhonemes(character).summary.vowelCount === 1));
  add("all-dependent-vowel-signs", [...VOWEL_SIGNS].every(([sign, symbol]) => compilePhonemes("क" + sign).phonemes.some(item => item.type === "vowel" && item.symbol === symbol)));
  add("inherent-a", JSON.stringify(symbols("क")) === JSON.stringify(["k", "a"]));
  add("long-vowel", JSON.stringify(symbols("का")) === JSON.stringify(["k", "ā"]));
  add("halant", JSON.stringify(symbols("क्")) === JSON.stringify(["k"]));
  add("kssa-conjunct", JSON.stringify(symbols("क्ष")) === JSON.stringify(["k", "ṣ", "a"]));
  add("jna-conjunct", JSON.stringify(symbols("ज्ञ")) === JSON.stringify(["j", "ñ", "a"]));
  add("candrabindu", compilePhonemes("कँ").units[0].nasalized === true && compilePhonemes("कँ").phonemes[1].nasalized === true);
  add("anusvara-context-preserved", compilePhonemes("किं").phonemes.some(item => item.type === "nasal-mark" && item.contextDependent));
  add("visarga-preserved", compilePhonemes("नमः").phonemes.some(item => item.type === "visarga"));
  add("udatta-metadata", compilePhonemes("अ॑").phonemes[0].accentMarks[0]?.label === "udatta");
  add("anudatta-metadata", compilePhonemes("अ॒").phonemes[0].accentMarks[0]?.label === "anudatta");
  add("vedic-short-e", compilePhonemes("के" + code("1CD8")).phonemes.find(item => item.type === "vowel")?.vowelLength === "short");
  add("vedic-short-o", compilePhonemes("को" + code("1CD8")).phonemes.find(item => item.type === "vowel")?.mora === 1);
  add("samaveda-cantillation", compilePhonemes("अ" + code("A8E1")).annotations.some(item => item.label === "one" && item.tradition === "samaveda"));
  add("vedic-nasal-sign", compilePhonemes("अ" + code("A8F2")).units[0].nasalized === true);
  add("vedic-editorial-mark", compilePhonemes("अ" + code("A8F8")).annotations.some(item => item.label === "pushpika"));
  add("nihshvasa-no-pause", compilePhonemes("अ" + code("1CD3") + "इ").boundaries.some(item => item.kind === "samaveda-no-pause-boundary" && item.canPause === false));
  add("jihvamuliya-context", compilePhonemes("अ" + code("1CF5") + "क").phonemes.some(item => item.realization === "jihvamuliya"));
  add("upadhmaniya-context", compilePhonemes("अ" + code("1CF6") + "प").phonemes.some(item => item.realization === "upadhmaniya"));
  add("wrong-allophone-context-warning", compilePhonemes("अ" + code("1CF5") + "प").warnings.some(item => item.code === "VISARGA_ALLOPHONE_CONTEXT_MISMATCH"));
  add("visarga-tone-linked", compilePhonemes("अः" + code("1CE2")).phonemes.some(item => item.type === "visarga" && item.accentMarks.length === 1));
  add("long-anusvara", compilePhonemes("अ" + code("1CEF")).phonemes.some(item => item.type === "long-anusvara"));
  add("om-contextual", compilePhonemes("ॐ").phonemes[0]?.type === "sacred-syllable" && compilePhonemes("ॐ").phonemes[0]?.mora === undefined);
  add("word-lexicon-exact-match", compilePhonemes("अग्निः", { lexicon: { "अग्निः": { lemma: "अग्नि", source: "GRA" } }, lexiconInfo: { id: "GRA" } }).words[0]?.entry?.lemma === "अग्नि");
  add("lexicon-absent-is-explicit", compilePhonemes("अग्निः").words[0]?.lookupStatus === "lexicon-not-loaded");
  add("unknown-letter-preserved", compilePhonemes("कA").summary.unknownCount === 1);
  add("non-string-guard", (() => { try { compilePhonemes(null); return false; } catch (error) { return error instanceof TypeError; } })());
  add("input-length-guard", (() => { try { compilePhonemes("राम", { maxInputLength: 2 }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("invalid-lexicon-guard", (() => { try { compilePhonemes("राम", { lexicon: () => null }); return false; } catch (error) { return error instanceof TypeError; } })());

  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({ module: "phoneme-compiler", version: PHONEME_COMPILER_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED", total: checks.length, passed,
    failed: checks.length - passed, checks: Object.freeze(checks) });
}

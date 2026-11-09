/* Swar-Sadhika — Sanskrit Grapheme-to-Phoneme (G2P) Engine.
 * Version 1.0.0 — deterministic, local, model-independent broad phonemic analysis.
 *
 * This module:
 * - reuses the existing Vedic Analyzer's character inventory and akshara segmentation;
 * - maps supported Devanagari vowels/consonants to a conservative IAST-like phoneme alphabet;
 * - models inherent अ, virama suppression, dependent vowel signs and consonant clusters;
 * - preserves anusvara/visarga distinctions and refuses unsupported/branch-specific guesses.
 *
 * It does NOT:
 * - produce IPA, acoustic audio, a Native-TTS replacement string, melody or singing;
 * - perform Sanskrit sandhi resolution, morphology-based schwa deletion, anusvara assimilation,
 *   visarga allophones, Vedic accent realization or shakha-specific recitation;
 * - claim orthographic aksharas are identical to phonetic syllables.
 *
 * Devanagari encoding rules follow the Unicode Standard's Devanagari chapter:
 * consonants carry an inherent vowel; virama suppresses it; dependent signs replace it.
 * Source: https://unicode.org/versions/Unicode18.0.0/core-spec/chapter-12/
 */
import {
  VEDIC_PRONUNCIATION_VERSION,
  VOWELS,
  CONSONANTS,
  VEDIC_ADDITIONAL_CONSONANTS,
  VOWEL_SIGNS,
  analyzeAksharaPhonetics,
  analyzeVedicText,
  getCharacterInfo,
  segmentDevanagariAksharas
} from "./vedic-sanskrit-pronunciation.js";

export const SANSKRIT_G2P_ENGINE_VERSION = "1.0.0";
export const SANSKRIT_G2P_CONTRACT_VERSION = "1.0.0";
export const SANSKRIT_G2P_ALPHABET = "SwarSadhika-IAST-broad-v1";

const MAX_INPUT_CODE_POINTS = 20000;
const VIRAMA = "्";
const NUKTA = "़";
const JOINERS = new Set(["‍", "‌"]);
const VEDIC_CONTEXT_CATEGORIES = new Set([
  "vedic-accent",
  "accent-or-transliteration-mark",
  "special-nasalization"
]);
const NASALIZATION_MARKS = new Set(["ँ", "ं"]);
const VISARGA_MARKS = new Set(["ः"]);
const DANDA_MARKS = new Set(["।", "॥"]);
const PUNCTUATION_PATTERN = /^[\s\p{P}\p{Z}]+$/u;

const VOWEL_SYMBOLS = Object.freeze({
  अ: "a", आ: "ā", इ: "i", ई: "ī", उ: "u", ऊ: "ū",
  ऋ: "r̥", ॠ: "r̥̄", ऌ: "l̥", ॡ: "l̥̄",
  ए: "e", ऐ: "ai", ओ: "o", औ: "au"
});
const CONSONANT_SYMBOLS = Object.freeze({
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ṅ",
  च: "c", छ: "ch", ज: "j", झ: "jh", ञ: "ñ",
  ट: "ṭ", ठ: "ṭh", ड: "ḍ", ढ: "ḍh", ण: "ṇ",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v",
  श: "ś", ष: "ṣ", स: "s", ह: "h"
});

const VOWEL_BY_ID = new Map(VOWELS.map(item => [item.id, item]));
const VOWEL_BY_CHARACTER = new Map(VOWELS.map(item => [item.character, item]));
const VOWEL_SIGN_BY_CHARACTER = new Map(VOWEL_SIGNS.map(item => [item.character, item]));
const CONSONANT_BY_CHARACTER = new Map(CONSONANTS.map(item => [item.character, item]));
const VEDIC_CONSONANT_CHARACTERS = new Set(VEDIC_ADDITIONAL_CONSONANTS.map(item => item.character));

export class SanskritG2PError extends Error {
  constructor(message, code = "SANSKRIT_G2P_ERROR", details = null) {
    super(message);
    this.name = "SanskritG2PError";
    this.code = code;
    this.details = details;
  }
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function freezeRecord(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeRecord));
  if (!isObject(value)) return value;
  const result = {};
  Object.keys(value).forEach(key => { result[key] = freezeRecord(value[key]); });
  return Object.freeze(result);
}

function codePointLength(value) {
  return Array.from(value).length;
}

function getCharacterCategory(character) {
  const info = getCharacterInfo(character);
  return info && info.found ? info.category : (info && info.category) || "unknown";
}

function makeToken({
  symbol,
  type,
  grapheme,
  startCodePointIndex,
  endCodePointIndex,
  orthographicUnitIndex,
  features = {},
  durationUnits = 0,
  contextSensitive = false
}) {
  return Object.freeze({
    symbol: symbol === undefined ? null : symbol,
    type,
    grapheme,
    startCodePointIndex,
    endCodePointIndex,
    orthographicUnitIndex,
    features: freezeRecord(features),
    durationUnits,
    contextSensitive
  });
}

function makeIssue(code, message, severity = "warning", details = null) {
  return freezeRecord({ code, message, severity, details });
}

function findVowelSymbol(vowelNucleus) {
  if (!vowelNucleus) return null;
  const vowel = vowelNucleus.vowel || (vowelNucleus.vowelId && VOWEL_BY_ID.get(vowelNucleus.vowelId)?.character);
  return vowel ? (VOWEL_SYMBOLS[vowel] || null) : null;
}

function findVowelGrapheme(unit, vowelNucleus, unitFeatures) {
  if (!vowelNucleus) return null;
  if (vowelNucleus.source === "independent-vowel") {
    return { character: vowelNucleus.character, localIndex: 0 };
  }
  if (vowelNucleus.source === "vowel-sign") {
    const sign = unitFeatures.vowelSigns[unitFeatures.vowelSigns.length - 1];
    if (!sign) return null;
    const characters = Array.from(unit.text);
    return { character: sign.character, localIndex: characters.lastIndexOf(sign.character) };
  }
  if (vowelNucleus.source === "inherent-vowel") {
    const consonant = unitFeatures.consonants[unitFeatures.consonants.length - 1];
    if (!consonant) return null;
    return { character: "अ", localIndex: consonant.localCodePointIndex };
  }
  return null;
}

function isOnlyWhitespace(text) {
  return /^\s+$/u.test(text);
}

function isOnlyPunctuation(text) {
  return PUNCTUATION_PATTERN.test(text);
}

function addBaseVowel({
  symbol,
  vowel,
  unit,
  unitIndex,
  localIndex,
  unitFeatures,
  tokens,
  nuclei
}) {
  const info = VOWEL_BY_CHARACTER.get(vowel);
  if (!info || !symbol) return false;
  const start = unit.startCodePointIndex + Math.max(0, localIndex);
  const token = makeToken({
    symbol,
    type: "vowel",
    grapheme: vowel,
    startCodePointIndex: start,
    endCodePointIndex: start + 1,
    orthographicUnitIndex: unitIndex,
    features: {
      vowelId: info.id,
      length: info.teachingMatras === 1 ? "short" : "long",
      teachingMatras: info.teachingMatras,
      source: unitFeatures.vowelNucleus?.source || "orthographic"
    },
    durationUnits: info.teachingMatras
  });
  tokens.push(token);
  nuclei.push(Object.freeze({
    index: nuclei.length,
    symbol,
    vowel,
    length: token.features.length,
    teachingMatras: token.durationUnits,
    startCodePointIndex: token.startCodePointIndex,
    endCodePointIndex: token.endCodePointIndex,
    orthographicUnitIndex: unitIndex,
    unitKind: "orthographic-akshara-nucleus"
  }));
  return true;
}

function analyzeOneUnit(unit, unitFeatures, unitIndex, state) {
  const characters = Array.from(unit.text);
  const tokens = [];
  const issues = [];
  const segmentKind = "akshara";
  const localConsonantIndexes = new Map(
    unitFeatures.consonants.map(item => [item.localCodePointIndex, item])
  );
  const vowelGrapheme = findVowelGrapheme(unit, unitFeatures.vowelNucleus, unitFeatures);
  const vowelLocalIndex = vowelGrapheme ? vowelGrapheme.localIndex : -1;
  const processed = new Set();
  let unitRequiresContext = false;

  if (unit.text === "ॐ") {
    tokens.push(makeToken({
      symbol: "oṃ",
      type: "sacred-syllable",
      grapheme: "ॐ",
      startCodePointIndex: unit.startCodePointIndex,
      endCodePointIndex: unit.endCodePointIndex,
      orthographicUnitIndex: unitIndex,
      features: { conventionalReading: "oṃ", note: "ओंकार का पारंपरिक लिपि-पाठ; यह वैदिक स्वराघात का विश्लेषण नहीं है।" }
    }));
    return { kind: "sacred-syllable", text: unit.text, tokens, issues, transliteration: "oṃ" };
  }

  if (unit.text === "ऽ") {
    tokens.push(makeToken({
      symbol: "’",
      type: "elision-marker",
      grapheme: "ऽ",
      startCodePointIndex: unit.startCodePointIndex,
      endCodePointIndex: unit.endCodePointIndex,
      orthographicUnitIndex: unitIndex,
      features: { phoneticSegment: false, note: "अवग्रह लेखन-संकेत है; इसे स्वतंत्र ध्वनि न मानें।" }
    }));
    return { kind: "editorial-marker", text: unit.text, tokens, issues, transliteration: "’" };
  }

  if (DANDA_MARKS.has(unit.text)) {
    return {
      kind: "punctuation",
      text: unit.text,
      tokens,
      issues,
      transliteration: unit.text,
      pauseHint: unit.text === "॥" ? "verse-boundary" : "text-boundary"
    };
  }

  if (isOnlyWhitespace(unit.text) || isOnlyPunctuation(unit.text)) {
    return { kind: isOnlyWhitespace(unit.text) ? "separator" : "punctuation", text: unit.text, tokens, issues, transliteration: unit.text };
  }

  if (characters.length === 1) {
    const category = getCharacterCategory(characters[0]);
    if (category === "digit") {
      issues.push(makeIssue(
        "NUMERIC_READING_REQUIRED",
        "अंक पहचाना गया है, लेकिन संख्या/श्लोक-संख्या को शब्दों में पढ़ने का नियम इस G2P संस्करण में शामिल नहीं है।",
        "context"
      ));
      state.contextRequired = true;
      return { kind: "editorial-number", text: unit.text, tokens, issues, transliteration: null };
    }
  }

  for (const character of characters) {
    if (!VEDIC_CONSONANT_CHARACTERS.has(character)) continue;
    issues.push(makeIssue(
      "BRANCH_SPECIFIC_CONSONANT",
      "यह अतिरिक्त व्यंजन शाखा/पाठ-सापेक्ष है; स्रोत-सत्यापन के बिना इसका ध्वनि-मान लागू नहीं किया गया।",
      "unsupported",
      { character, orthographicUnit: unit.text }
    ));
    state.unsupported = true;
  }

  for (const consonant of unitFeatures.consonants) {
    const symbol = CONSONANT_SYMBOLS[consonant.character];
    const start = unit.startCodePointIndex + consonant.localCodePointIndex;
    if (!symbol) {
      const isBranchConsonant = VEDIC_CONSONANT_CHARACTERS.has(consonant.character);
      issues.push(makeIssue(
        isBranchConsonant ? "BRANCH_SPECIFIC_CONSONANT" : "UNMAPPED_CONSONANT",
        isBranchConsonant
          ? "यह अतिरिक्त व्यंजन शाखा/पाठ-सापेक्ष है; स्रोत-सत्यापन के बिना इसका ध्वनि-मान लागू नहीं किया गया।"
          : "इस व्यंजन के लिए स्वीकृत G2P mapping उपलब्ध नहीं है।",
        "unsupported",
        { character: consonant.character, orthographicUnit: unit.text }
      ));
      state.unsupported = true;
      continue;
    }
    const consonantInfo = CONSONANT_BY_CHARACTER.get(consonant.character);
    tokens.push(makeToken({
      symbol,
      type: "consonant",
      grapheme: consonant.character,
      startCodePointIndex: start,
      endCodePointIndex: start + 1,
      orthographicUnitIndex: unitIndex,
      features: {
        placeId: consonant.placeId || (consonantInfo && consonantInfo.placeId) || null,
        place: consonant.place || (consonantInfo && consonantInfo.place) || null,
        manner: consonant.manner || "not-further-classified",
        voicing: consonant.voicing || "not-further-classified",
        aspiration: consonant.aspiration || (consonantInfo && consonantInfo.aspiration) || "not-further-classified",
        evidenceLevel: consonant.evidenceLevel || "existing-vedic-analyzer-inventory"
      }
    }));
    processed.add(consonant.localCodePointIndex);
  }

  if (unitFeatures.vowelNucleus) {
    const symbol = findVowelSymbol(unitFeatures.vowelNucleus);
    const vowel = unitFeatures.vowelNucleus.vowel ||
      (unitFeatures.vowelNucleus.vowelId && VOWEL_BY_ID.get(unitFeatures.vowelNucleus.vowelId)?.character);
    if (!symbol || !vowel || vowelLocalIndex < 0) {
      issues.push(makeIssue(
        "VOWEL_NUCLEUS_UNRESOLVED",
        "अक्षर का स्वर-केंद्र पहचाना गया, लेकिन उसका G2P मान निश्चित नहीं हुआ।",
        "unsupported",
        { orthographicUnit: unit.text, vowelNucleus: unitFeatures.vowelNucleus }
      ));
      state.unsupported = true;
    } else {
      addBaseVowel({
        symbol,
        vowel,
        unit,
        unitIndex,
        localIndex: vowelLocalIndex,
        unitFeatures,
        tokens,
        nuclei: state.nuclei
      });
      processed.add(vowelLocalIndex);
      if (unitFeatures.vowelNucleus.source === "inherent-vowel") {
        state.rulesApplied.add("inherent-short-a");
      } else if (unitFeatures.vowelNucleus.source === "vowel-sign") {
        state.rulesApplied.add("dependent-vowel-sign");
      } else if (unitFeatures.vowelNucleus.source === "independent-vowel") {
        state.rulesApplied.add("independent-vowel");
      }
    }
  } else if (!unitFeatures.endsInVirama && unitFeatures.consonants.length) {
    issues.push(makeIssue(
      "CONSONANT_WITHOUT_RESOLVED_NUCLEUS",
      "व्यंजन-अक्षर में अंतर्निहित स्वर अपेक्षित था, लेकिन Analyzer ने स्वर-केंद्र नहीं दिया; सुरक्षित रूप से रोक दिया गया।",
      "unsupported",
      { orthographicUnit: unit.text }
    ));
    state.unsupported = true;
  }

  if (unitFeatures.consonants.length > 1) state.rulesApplied.add("virama-consonant-cluster");
  if (unitFeatures.endsInVirama) state.rulesApplied.add("virama-suppresses-inherent-a");

  let transliteration = tokens.map(token => token.symbol || "").join("");
  let lastVowelTokenIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === "vowel") { lastVowelTokenIndex = i; break; }
  }

  for (let localIndex = 0; localIndex < characters.length; localIndex++) {
    if (processed.has(localIndex)) continue;
    const character = characters[localIndex];
    if (JOINERS.has(character) || character === VIRAMA) continue;
    if (character === NUKTA) {
      issues.push(makeIssue(
        "NUKTA_CONSONANT_REQUIRES_REVIEW",
        "नुक्तायुक्त व्यंजन को इस संस्करण में सामान्य संस्कृत व्यंजन के बराबर मानकर transliterate नहीं किया गया।",
        "unsupported",
        { orthographicUnit: unit.text, localCodePointIndex: localIndex }
      ));
      state.unsupported = true;
      continue;
    }

    const category = getCharacterCategory(character);
    const characterInfo = getCharacterInfo(character);
    const absoluteStart = unit.startCodePointIndex + localIndex;
    if (!characterInfo.found && /\p{M}/u.test(character)) {
      issues.push(makeIssue(
        "UNSUPPORTED_COMBINING_MARK",
        "अज्ञात combining mark सुरक्षित रखा गया; उसका phonemic मान अनुमानित नहीं किया गया।",
        "unsupported",
        { character, codePoint: characterInfo.codePoint || null }
      ));
      state.unsupported = true;
      continue;
    }
    if (category === "nasalization" && character === "ं") {
      tokens.push(makeToken({
        symbol: "ṃ",
        type: "anusvara",
        grapheme: character,
        startCodePointIndex: absoluteStart,
        endCodePointIndex: absoluteStart + 1,
        orthographicUnitIndex: unitIndex,
        features: { realization: "preserved; homorganic assimilation not inferred" },
        contextSensitive: true
      }));
      transliteration += "ṃ";
      issues.push(makeIssue(
        "ANUSVARA_REALIZATION_CONTEXTUAL",
        "अनुस्वार को ṃ के रूप में सुरक्षित रखा गया है; अगले वर्ण/पाठ-परंपरा के अनुसार नासिक्य रूप अपने-आप नहीं बदला गया।",
        "context"
      ));
      state.contextSensitive = true;
      state.rulesApplied.add("anusvara-preserved");
      continue;
    }
    if (category === "nasalization" && character === "ँ") {
      if (lastVowelTokenIndex < 0) {
        issues.push(makeIssue(
          "CANDRABINDU_WITHOUT_LOCAL_VOWEL",
          "चन्द्रबिन्दु मिला, लेकिन उसी अक्षर-खंड में स्वर-केंद्र नहीं मिला; नासिक्यकरण का लक्ष्य अनुमानित नहीं किया गया।",
          "unsupported",
          { orthographicUnit: unit.text }
        ));
        state.unsupported = true;
      } else {
        tokens.push(makeToken({
          symbol: null,
          type: "vowel-nasalization",
          grapheme: character,
          startCodePointIndex: absoluteStart,
          endCodePointIndex: absoluteStart + 1,
          orthographicUnitIndex: unitIndex,
          features: { attachesToTokenIndex: lastVowelTokenIndex, renderingMark: "\u0303" },
          contextSensitive: true
        }));
        transliteration += "\u0303";
        state.rulesApplied.add("chandrabindu-nasalizes-vowel");
      }
      continue;
    }
    if (category === "visarga" && VISARGA_MARKS.has(character)) {
      tokens.push(makeToken({
        symbol: "ḥ",
        type: "visarga",
        grapheme: character,
        startCodePointIndex: absoluteStart,
        endCodePointIndex: absoluteStart + 1,
        orthographicUnitIndex: unitIndex,
        features: { realization: "preserved; jihvamuliya/upadhmaniya not inferred" },
        contextSensitive: true
      }));
      transliteration += "ḥ";
      issues.push(makeIssue(
        "VISARGA_REALIZATION_CONTEXTUAL",
        "विसर्ग को ḥ के रूप में सुरक्षित रखा गया है; जिह्वामूलीय/उपध्मानीय या अन्य रूप संदर्भ के बिना नहीं चुना गया।",
        "context"
      ));
      state.contextSensitive = true;
      state.rulesApplied.add("visarga-preserved");
      continue;
    }
    if (category === "vedic-accent" || category === "accent-or-transliteration-mark" ||
        category === "special-nasalization" || getCharacterInfo(character).pronunciationStatus === "unknown-preserve-original") {
      issues.push(makeIssue(
        "VEDIC_OR_SPECIAL_MARK_REQUIRES_CONTEXT",
        "वैदिक/विशेष चिह्न पहचाना गया है, लेकिन उसकी शाखा-विशिष्ट ध्वनि-प्राप्ति इस G2P संस्करण में लागू नहीं है। मूल चिह्न सुरक्षित है।",
        "context",
        { character, codePoint: getCharacterInfo(character).codePoint || null }
      ));
      state.contextRequired = true;
      unitRequiresContext = true;
      continue;
    }
    if (category === "avagraha") {
      tokens.push(makeToken({
        symbol: "’",
        type: "elision-marker",
        grapheme: character,
        startCodePointIndex: absoluteStart,
        endCodePointIndex: absoluteStart + 1,
        orthographicUnitIndex: unitIndex,
        features: { phoneticSegment: false }
      }));
      transliteration += "’";
      continue;
    }
    if (category === "punctuation" || category === "editorial-mark") continue;
    if (category === "digit") {
      issues.push(makeIssue(
        "NUMERIC_READING_REQUIRED",
        "संख्या को संस्कृत शब्दों में बदलने की नीति इस G2P संस्करण में लागू नहीं है।",
        "context",
        { character }
      ));
      state.contextRequired = true;
      continue;
    }
    if (category === "vowel-sign" || category === "consonant" || category === "vowel") continue;
    if (category === "orthographic-mark") {
      issues.push(makeIssue(
        "ORTHOGRAPHIC_MARK_REQUIRES_REVIEW",
        "यह लिप्यात्मक चिह्न पहचाना गया, लेकिन इसके phonemic व्यवहार का नियम निर्धारित नहीं है।",
        "unsupported",
        { character, orthographicUnit: unit.text }
      ));
      state.unsupported = true;
      continue;
    }
    if (category === "unknown" || category === "outside-pronunciation-inventory" ||
        category === "unmapped-or-unassigned-block-codepoint" || category === "unknown-combining-mark") {
      issues.push(makeIssue(
        "UNSUPPORTED_GRAPHEME",
        "असमर्थित अक्षर/चिह्न मिला; उसे हटाया या अनुमान से बदला नहीं गया।",
        "unsupported",
        { character, codePoint: getCharacterInfo(character).codePoint || null }
      ));
      state.unsupported = true;
    }
  }

  if (unitFeatures.vowelSigns.length > 1) {
    issues.push(makeIssue(
      "MULTIPLE_VOWEL_SIGNS_IN_UNIT",
      "एक अक्षर-खंड में एक से अधिक स्वर-मात्राएँ मिलीं; अंतिम मात्रा को स्वतः सही मानकर पूरा G2P प्रमाणित नहीं किया गया।",
      "unsupported",
      { orthographicUnit: unit.text, vowelSigns: unitFeatures.vowelSigns.map(item => item.character) }
    ));
    state.unsupported = true;
  }

  return {
    kind: segmentKind,
    text: unit.text,
    tokens,
    issues,
    transliteration: (state.unsupported && issues.some(item => item.severity === "unsupported")) || unitRequiresContext
      ? null
      : transliteration
  };
}

function resolveStatus(state) {
  if (state.unsupported) return "partial";
  if (state.contextRequired) return "needs-context";
  if (state.contextSensitive) return "context-sensitive";
  return "complete";
}

export function analyzeSanskritG2P(text, options = {}) {
  if (typeof text !== "string") {
    throw new SanskritG2PError("G2P input string होना चाहिए।", "INVALID_G2P_INPUT");
  }
  if (!isObject(options)) {
    throw new SanskritG2PError("G2P options एक plain Object होना चाहिए।", "INVALID_G2P_OPTIONS");
  }
  const inputLength = codePointLength(text);
  if (inputLength > MAX_INPUT_CODE_POINTS) {
    throw new SanskritG2PError(
      "G2P input अधिकतम " + MAX_INPUT_CODE_POINTS + " Unicode code points का हो सकता है।",
      "G2P_INPUT_TOO_LONG",
      { inputLength, maxInputCodePoints: MAX_INPUT_CODE_POINTS }
    );
  }

  const analyzerOptions = {};
  if (typeof options.shakha === "string" && options.shakha.trim()) analyzerOptions.shakha = options.shakha;
  const orthographicAnalysis = analyzeAksharaPhonetics(text, analyzerOptions);
  const vedicAnalysis = analyzeVedicText(text, analyzerOptions);
  const aksharas = segmentDevanagariAksharas(text);
  if (orthographicAnalysis.orthographicUnits.length !== aksharas.length ||
      orthographicAnalysis.orthographicUnits.some((item, index) =>
        item.text !== aksharas[index].text ||
        item.startCodePointIndex !== aksharas[index].startCodePointIndex
      )) {
    throw new SanskritG2PError(
      "मौजूदा Vedic Analyzer और Akshara Segmenter के परिणामों में असंगति मिली।",
      "ANALYZER_SEGMENTATION_MISMATCH"
    );
  }

  const state = {
    unsupported: false,
    contextRequired: false,
    contextSensitive: false,
    rulesApplied: new Set(),
    nuclei: []
  };
  const segments = [];
  const issues = [];
  const phonemeSequence = [];

  aksharas.forEach((unit, unitIndex) => {
    const feature = orthographicAnalysis.orthographicUnits[unitIndex];
    const result = analyzeOneUnit(unit, feature, unitIndex, state);
    result.tokens.forEach(token => phonemeSequence.push(token));
    result.issues.forEach(item => issues.push(item));
    segments.push(freezeRecord({
      index: unitIndex,
      kind: result.kind,
      text: result.text,
      startCodePointIndex: unit.startCodePointIndex,
      endCodePointIndex: unit.endCodePointIndex,
      transliteration: result.transliteration,
      tokens: result.tokens,
      issues: result.issues,
      pauseHint: result.pauseHint || null
    }));
  });

  if (vedicAnalysis.needsBranchContext || vedicAnalysis.vedicMarks.length) {
    state.contextRequired = true;
    if (!issues.some(item => item.code === "VEDIC_OR_SPECIAL_MARK_REQUIRES_CONTEXT")) {
      issues.push(makeIssue(
        "VEDIC_BRANCH_CONTEXT_REQUIRED",
        "पाठ में वैदिक/शाखा-सापेक्ष संकेत हैं। केवल लिपि-पहचान से उनका स्वराघात या गायन-रूप निर्धारित नहीं किया जाएगा।",
        "context",
        { shakha: orthographicAnalysis.shakha || null, vedicMarkCount: vedicAnalysis.vedicMarks.length }
      ));
    }
  }
  if (vedicAnalysis.unclassifiedMarks.length) {
    state.unsupported = true;
    vedicAnalysis.unclassifiedMarks.forEach(item => {
      issues.push(makeIssue(
        "UNCLASSIFIED_COMBINING_MARK",
        "अज्ञात combining mark सुरक्षित रखा गया; उसका phonemic मान अनुमानित नहीं किया गया।",
        "unsupported",
        { character: item.character, codePoint: item.codePoint, index: item.index }
      ));
    });
  }

  const status = resolveStatus(state);
  const transliterationComplete = !state.contextRequired &&
    segments.every(segment => segment.transliteration !== null);
  const phonemicTransliteration = transliterationComplete ? segments.map(segment => segment.transliteration).join("") : null;
  const wordCount = (text.match(/[^\s]+/gu) || []).length;
  const output = {
    schema: "swar-sadhika.sanskrit-g2p",
    schemaVersion: 1,
    engineVersion: SANSKRIT_G2P_ENGINE_VERSION,
    contractVersion: SANSKRIT_G2P_CONTRACT_VERSION,
    sourceAnalyzerVersion: VEDIC_PRONUNCIATION_VERSION,
    alphabet: SANSKRIT_G2P_ALPHABET,
    originalText: text,
    originalTextPreserved: true,
    inputCodePointCount: inputLength,
    wordCount,
    status,
    complete: status === "complete",
    contextSensitive: status === "context-sensitive",
    requiresContext: status === "needs-context",
    hasUnsupportedGraphemes: status === "partial",
    phonemicTransliteration,
    phonemeSequence: Object.freeze(phonemeSequence),
    phonemeCount: phonemeSequence.filter(item => item.type !== "elision-marker").length,
    vowelNuclei: Object.freeze(state.nuclei),
    orthographicUnits: Object.freeze(segments),
    rulesApplied: Object.freeze(Array.from(state.rulesApplied).sort()),
    warnings: Object.freeze(issues),
    analysis: orthographicAnalysis,
    vedicAnalysis: freezeRecord({
      needsBranchContext: vedicAnalysis.needsBranchContext,
      vedicMarkCount: vedicAnalysis.vedicMarks.length,
      unclassifiedMarkCount: vedicAnalysis.unclassifiedMarks.length,
      originalTextPreserved: vedicAnalysis.originalTextPreserved
    }),
    outputContract: freezeRecord({
      ipa: null,
      nativeSpeechText: null,
      phoneticSyllablesInferred: false,
      melodyGenerated: false,
      audioGenerated: false,
      note: "यह broad phonemic G2P analysis है; IPA, syllable timing, Native TTS rendering या singing audio नहीं।"
    }),
    policy: "मूल पाठ अक्षरशः सुरक्षित है। केवल स्पष्ट orthographic mappings लागू हैं; संदिग्ध नियम अनुमान से लागू नहीं होते।"
  };
  return freezeRecord(output);
}

export function transliterateSanskritG2P(text, options = {}) {
  const result = analyzeSanskritG2P(text, options);
  return result.phonemicTransliteration;
}

export function getSanskritG2PDiagnostics(text, options = {}) {
  const result = analyzeSanskritG2P(text, options);
  return freezeRecord({
    engineVersion: result.engineVersion,
    status: result.status,
    complete: result.complete,
    inputCodePointCount: result.inputCodePointCount,
    wordCount: result.wordCount,
    orthographicUnitCount: result.orthographicUnits.length,
    phonemeCount: result.phonemeCount,
    vowelNucleusCount: result.vowelNuclei.length,
    ruleCount: result.rulesApplied.length,
    rulesApplied: result.rulesApplied,
    warningCount: result.warnings.length,
    warningCodes: result.warnings.map(item => item.code),
    originalTextPreserved: result.originalTextPreserved,
    nativeSpeechTextProduced: false,
    ipaProduced: false,
    note: result.outputContract.note
  });
}

export function selfTest() {
  const checks = [];
  const check = (id, passed, details = "") => checks.push(Object.freeze({
    id, passed: Boolean(passed), details: String(details || "")
  }));
  const run = (text, options = {}) => analyzeSanskritG2P(text, options);
  const basic = run("ॐ नमः शिवाय");

  check("API-VERSION", SANSKRIT_G2P_ENGINE_VERSION === "1.0.0");
  check("EXISTING-VEDIC-ANALYZER-REUSED", typeof analyzeAksharaPhonetics === "function" &&
    typeof analyzeVedicText === "function" && typeof segmentDevanagariAksharas === "function");
  check("OM-NAMAH-SHIVAYA-TRANSLITERATION",
    basic.phonemicTransliteration === "oṃ namaḥ śivāya",
    basic.phonemicTransliteration || "null");
  check("OM-NAMAH-SHIVAYA-STATUS", basic.status === "context-sensitive",
    basic.status);
  check("ORIGINAL-TEXT-IMMUTABLE", basic.originalText === "ॐ नमः शिवाय" && basic.originalTextPreserved);

  const inherent = run("क");
  check("INHERENT-A", inherent.phonemicTransliteration === "ka" &&
    inherent.phonemeSequence.length === 2 && inherent.phonemeSequence[1].features.source === "inherent-vowel");

  const virama = run("क्");
  check("VIRAMA-SUPPRESSES-INHERENT-A", virama.phonemicTransliteration === "k" &&
    virama.phonemeSequence.length === 1 && virama.rulesApplied.includes("virama-suppresses-inherent-a"));

  const conjunct = run("क्ष");
  check("CONJUNCT-CLUSTER", conjunct.phonemicTransliteration === "kṣa" &&
    conjunct.phonemeSequence.filter(item => item.type === "consonant").length === 2);

  const aspirate = run("ख");
  check("ASPIRATED-STOP-IS-ONE-PHONEME", aspirate.phonemicTransliteration === "kha" &&
    aspirate.phonemeSequence[0].symbol === "kh" &&
    aspirate.phonemeSequence[0].features.aspiration === "aspirated");

  const retroflex = run("ट");
  const dental = run("त");
  check("RETROFLEX-DENTAL-DISTINCTION", retroflex.phonemicTransliteration === "ṭa" &&
    dental.phonemicTransliteration === "ta");

  const shortLong = run("अआ");
  check("SHORT-LONG-VOWEL-QUANTITY", shortLong.phonemicTransliteration === "aā" &&
    shortLong.vowelNuclei.map(item => item.teachingMatras).join(",") === "1,2");

  const allVowels = run("अआइईउऊऋॠऌॡएऐओऔ");
  check("ALL-FOURTEEN-VOWELS", allVowels.phonemicTransliteration === "aāiīuūr̥r̥̄l̥l̥̄eaioau" &&
    allVowels.vowelNuclei.length === 14);

  const dependentVowel = run("कि");
  check("DEPENDENT-VOWEL-SIGN", dependentVowel.phonemicTransliteration === "ki" &&
    dependentVowel.phonemeSequence[1].features.source === "vowel-sign");

  const anusvara = run("अं");
  const candrabindu = run("अँ");
  check("ANUSVARA-AND-CANDRABINDU-DIFFER", anusvara.phonemicTransliteration === "aṃ" &&
    candrabindu.phonemicTransliteration === "ã" &&
    anusvara.phonemeSequence.some(item => item.type === "anusvara") &&
    candrabindu.phonemeSequence.some(item => item.type === "vowel-nasalization"));

  const visarga = run("अः");
  check("VISARGA-PRESERVED-NOT-ALLOPHONIZED", visarga.phonemicTransliteration === "aḥ" &&
    visarga.warnings.some(item => item.code === "VISARGA_REALIZATION_CONTEXTUAL"));

  const avagraha = run("सोऽहम्");
  check("AVAGRAHA-ELISION-MARKER", avagraha.phonemicTransliteration === "so’ham" &&
    avagraha.phonemeSequence.some(item => item.type === "elision-marker"));

  const danda = run("रामः।");
  check("DANDA-PAUSE-PRESERVED", danda.phonemicTransliteration === "rāmaḥ।" &&
    danda.orthographicUnits.some(item => item.pauseHint === "text-boundary"));

  const doubleDanda = run("रामः॥");
  check("DOUBLE-DANDA-VERSE-BOUNDARY", doubleDanda.orthographicUnits.some(item => item.pauseHint === "verse-boundary"));

  const separated = run("क ख");
  check("WHITESPACE-PRESERVED", separated.phonemicTransliteration === "ka kha");

  const unknownCombining = run("अ\u{1CFB}");
  check("UNKNOWN-COMBINING-MARK-SAFE-PARTIAL", unknownCombining.status === "partial" &&
    unknownCombining.phonemicTransliteration === null &&
    unknownCombining.warnings.some(item => item.code === "UNCLASSIFIED_COMBINING_MARK"));

  const accent = run("अ॑ग्नि");
  check("VEDIC-ACCENT-REQUIRES-CONTEXT", accent.status === "needs-context" &&
    accent.phonemicTransliteration === null &&
    accent.warnings.some(item => item.code === "VEDIC_OR_SPECIAL_MARK_REQUIRES_CONTEXT"));

  const branchConsonant = run("ळ");
  check("BRANCH-CONSONANT-NOT-GUESSED", branchConsonant.status === "partial" &&
    branchConsonant.warnings.some(item => item.code === "BRANCH_SPECIFIC_CONSONANT"));

  const nukta = run("क़");
  check("NUKTA-CHARACTER-NOT-ASSUMED", nukta.status === "partial" &&
    nukta.warnings.some(item => item.code === "NUKTA_CONSONANT_REQUIRES_REVIEW"));

  const digit = run("१२");
  check("DIGITS-REQUIRE-READING-POLICY", digit.status === "needs-context" &&
    digit.phonemicTransliteration === null);

  const mixed = run("ॐ, नमः!");
  check("PUNCTUATION-PRESERVED", mixed.phonemicTransliteration === "oṃ, namaḥ!");

  const noMutation = run("क् ष");
  check("NO-SOURCE-MUTATION", noMutation.originalText === "क् ष" &&
    noMutation.orthographicUnits.map(item => item.text).join("") === "क् ष");

  let invalidInput = false;
  try { run(12); } catch (error) { invalidInput = error.code === "INVALID_G2P_INPUT"; }
  check("INVALID-INPUT-REJECTED", invalidInput);

  let invalidOptions = false;
  try { run("क", []); } catch (error) { invalidOptions = error.code === "INVALID_G2P_OPTIONS"; }
  check("INVALID-OPTIONS-REJECTED", invalidOptions);

  let oversized = false;
  try { run("क".repeat(MAX_INPUT_CODE_POINTS + 1)); }
  catch (error) { oversized = error.code === "G2P_INPUT_TOO_LONG"; }
  check("INPUT-LENGTH-LIMIT", oversized);

  check("OUTPUT-DEEPLY-FROZEN", Object.isFrozen(basic) &&
    Object.isFrozen(basic.phonemeSequence) && Object.isFrozen(basic.phonemeSequence[0]) &&
    Object.isFrozen(basic.warnings));

  check("NO-IPA-OR-AUDIO-CLAIM", basic.outputContract.ipa === null &&
    basic.outputContract.nativeSpeechText === null &&
    basic.outputContract.audioGenerated === false &&
    basic.outputContract.melodyGenerated === false);

  const failed = checks.filter(item => !item.passed);
  return Object.freeze({
    module: "sanskrit-g2p-engine",
    version: SANSKRIT_G2P_ENGINE_VERSION,
    sourceAnalyzerVersion: VEDIC_PRONUNCIATION_VERSION,
    status: failed.length ? "FAILED" : "PASSED",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks: Object.freeze(checks),
    failures: Object.freeze(failed)
  });
}

export const SANSKRIT_G2P_API = Object.freeze({
  version: SANSKRIT_G2P_ENGINE_VERSION,
  contractVersion: SANSKRIT_G2P_CONTRACT_VERSION,
  alphabet: SANSKRIT_G2P_ALPHABET,
  analyze: analyzeSanskritG2P,
  transliterate: transliterateSanskritG2P,
  getDiagnostics: getSanskritG2PDiagnostics,
  selfTest
});

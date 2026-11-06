/* Swar-Sadhika Speech-to-Singing — conservative Devanagari phoneme compiler.
 * Version 0.1.0. Pure JavaScript: no network, model, audio capture or synthesis.
 * Converts script-level Sanskrit aksharas into inspectable phoneme metadata.
 * It deliberately preserves context-sensitive Vedic signs as annotations.
 */

export const PHONEME_COMPILER_VERSION = "0.1.0";

const VIRAMA = "्";
const NUKTA = "़";
const CANDRABINDU = "ँ";
const ANUSVARA = "ं";
const VISARGA = "ः";
const AVAGRAHA = "ऽ";
const OM = "ॐ";
const DEFAULT_MAX_INPUT_LENGTH = 100000;

const VOWEL_DATA = [
  ["अ", "a", "ɐ", "short", 1],
  ["आ", "ā", "aː", "long", 2],
  ["इ", "i", "i", "short", 1],
  ["ई", "ī", "iː", "long", 2],
  ["उ", "u", "u", "short", 1],
  ["ऊ", "ū", "uː", "long", 2],
  ["ऋ", "ṛ", "r̩", "short", 1],
  ["ॠ", "ṝ", "r̩ː", "long", 2],
  ["ऌ", "ḷ", "l̩", "short", 1],
  ["ॡ", "ḹ", "l̩ː", "long", 2],
  ["ए", "e", "eː", "long", 2],
  ["ऐ", "ai", "ai̯", "long", 2],
  ["ओ", "o", "oː", "long", 2],
  ["औ", "au", "au̯", "long", 2]
];

const VOWELS = new Map(VOWEL_DATA.map(([character, symbol, ipa, length, mora]) => [
  character, Object.freeze({ character, symbol, ipa, length, mora })
]));

const VOWEL_SIGN_DATA = [
  ["ा", "ā"], ["ि", "i"], ["ी", "ī"], ["ु", "u"], ["ू", "ū"],
  ["ृ", "ṛ"], ["ॄ", "ṝ"], ["ॢ", "ḷ"], ["ॣ", "ḹ"], ["े", "e"],
  ["ै", "ai"], ["ो", "o"], ["ौ", "au"]
];
const VOWEL_SIGNS = new Map(VOWEL_SIGN_DATA.map(([sign, symbol]) => [sign, symbol]));
const VOWEL_BY_SYMBOL = new Map(VOWEL_DATA.map(row => [row[1], Object.freeze({
  symbol: row[1], ipa: row[2], length: row[3], mora: row[4]
})]));

const CONSONANT_ROWS = [
  ["क", "k", "k", "velar", "stop", false, false],
  ["ख", "kh", "kʰ", "velar", "stop", false, true],
  ["ग", "g", "ɡ", "velar", "stop", true, false],
  ["घ", "gh", "ɡʱ", "velar", "stop", true, true],
  ["ङ", "ṅ", "ŋ", "velar", "nasal", true, false],
  ["च", "c", "t͡ɕ", "palatal", "affricate", false, false],
  ["छ", "ch", "t͡ɕʰ", "palatal", "affricate", false, true],
  ["ज", "j", "d͡ʑ", "palatal", "affricate", true, false],
  ["झ", "jh", "d͡ʑʱ", "palatal", "affricate", true, true],
  ["ञ", "ñ", "ɲ", "palatal", "nasal", true, false],
  ["ट", "ṭ", "ʈ", "retroflex", "stop", false, false],
  ["ठ", "ṭh", "ʈʰ", "retroflex", "stop", false, true],
  ["ड", "ḍ", "ɖ", "retroflex", "stop", true, false],
  ["ढ", "ḍh", "ɖʱ", "retroflex", "stop", true, true],
  ["ण", "ṇ", "ɳ", "retroflex", "nasal", true, false],
  ["त", "t", "t̪", "dental", "stop", false, false],
  ["थ", "th", "t̪ʰ", "dental", "stop", false, true],
  ["द", "d", "d̪", "dental", "stop", true, false],
  ["ध", "dh", "d̪ʱ", "dental", "stop", true, true],
  ["न", "n", "n", "dental", "nasal", true, false],
  ["प", "p", "p", "labial", "stop", false, false],
  ["फ", "ph", "pʰ", "labial", "stop", false, true],
  ["ब", "b", "b", "labial", "stop", true, false],
  ["भ", "bh", "bʱ", "labial", "stop", true, true],
  ["म", "m", "m", "labial", "nasal", true, false],
  ["य", "y", "j", "approximant", "approximant", true, false],
  ["र", "r", "r", "approximant", "trill", true, false],
  ["ल", "l", "l", "approximant", "lateral", true, false],
  ["व", "v", "ʋ", "approximant", "approximant", true, false],
  ["श", "ś", "ɕ", "sibilant", "fricative", false, false],
  ["ष", "ṣ", "ʂ", "sibilant", "fricative", false, false],
  ["स", "s", "s", "sibilant", "fricative", false, false],
  ["ह", "h", "ɦ", "glottal", "fricative", true, false],
  ["ळ", "ḷ", "ɭ", "retroflex", "lateral", true, false]
];

const CONSONANTS = new Map(CONSONANT_ROWS.map(([character, symbol, ipa, place, manner, voiced, aspirated]) => [
  character, Object.freeze({ character, symbol, ipa, place, manner, voiced, aspirated })
]));

const NUKTA_CONSONANTS = new Map([
  ["क़", ["q", "q", "uvular", "stop", false, false]],
  ["ख़", ["x", "x", "velar", "fricative", false, false]],
  ["ग़", ["ġ", "ɣ", "velar", "fricative", true, false]],
  ["ज़", ["z", "z", "alveolar", "fricative", true, false]],
  ["ड़", ["ṛ", "ɽ", "retroflex", "tap", true, false]],
  ["ढ़", ["ṛh", "ɽʱ", "retroflex", "tap", true, true]],
  ["फ़", ["f", "f", "labiodental", "fricative", false, false]],
  ["य़", ["ẏ", "j", "palatal", "approximant", true, false]]
]);
const PRECOMPOSED_NUKTA = new Map([
  ["क़", "क़"], ["ख़", "ख़"], ["ग़", "ग़"], ["ज़", "ज़"],
  ["ड़", "ड़"], ["ढ़", "ढ़"], ["फ़", "फ़"], ["य़", "य़"]
]);

const ACCENT_LABELS = new Map([
  ["॑", "udatta-name"],
  ["॒", "anudatta-name"],
  ["॓", "grave-accent"],
  ["॔", "acute-accent"]
]);

const VEDIC_EXTENSION_START = 0x1cd0;
const VEDIC_EXTENSION_END = 0x1cfa;
const VEDIC_SPECIAL_SIGNS = new Map([
  [String.fromCodePoint(0x1cf5), "jihvamuliya"],
  [String.fromCodePoint(0x1cf6), "upadhmaniya"]
]);

function codePointLabel(character) {
  return "U+" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
}

function freezeArray(items) {
  return Object.freeze(items.map(item => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      const copy = { ...item };
      for (const key of Object.keys(copy)) {
        if (Array.isArray(copy[key])) copy[key] = Object.freeze(copy[key].slice());
        else if (copy[key] && typeof copy[key] === "object" && !Object.isFrozen(copy[key])) {
          copy[key] = Object.freeze({ ...copy[key] });
        }
      }
      return Object.freeze(copy);
    }
    return item;
  }));
}

function normalizeOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Phoneme Compiler options एक object होना चाहिए।");
  }
  const maxInputLength = options.maxInputLength == null
    ? DEFAULT_MAX_INPUT_LENGTH : Number(options.maxInputLength);
  if (!Number.isInteger(maxInputLength) || maxInputLength < 1 || maxInputLength > 1000000) {
    throw new RangeError("maxInputLength 1 से 1000000 के बीच पूर्णांक होना चाहिए।");
  }
  const language = options.language == null ? "sa-IN" : String(options.language).trim();
  if (!language) throw new TypeError("language खाली नहीं हो सकती।");
  return Object.freeze({ language, maxInputLength });
}

function readConsonant(characters, index) {
  const character = characters[index];
  if (!character) return null;
  const precomposed = PRECOMPOSED_NUKTA.get(character);
  if (precomposed) {
    const row = NUKTA_CONSONANTS.get(precomposed);
    return { info: Object.freeze({ character, symbol: row[0], ipa: row[1], place: row[2], manner: row[3], voiced: row[4], aspirated: row[5], nukta: true }), length: 1 };
  }
  if (characters[index + 1] === NUKTA) {
    const combined = character + NUKTA;
    const row = NUKTA_CONSONANTS.get(combined);
    if (row) {
      return { info: Object.freeze({ character: combined, symbol: row[0], ipa: row[1], place: row[2], manner: row[3], voiced: row[4], aspirated: row[5], nukta: true }), length: 2 };
    }
  }
  const info = CONSONANTS.get(character);
  return info ? { info, length: 1 } : null;
}

function getVowel(symbol) {
  return VOWEL_BY_SYMBOL.get(symbol) || null;
}

function classifyMark(character) {
  if (character === CANDRABINDU || character === "ऀ") return "candrabindu";
  if (character === ANUSVARA) return "anusvara";
  if (character === VISARGA) return "visarga";
  if (ACCENT_LABELS.has(character)) return "accent";
  if (VEDIC_SPECIAL_SIGNS.has(character)) return "vedic-special-visarga";
  const cp = character.codePointAt(0);
  if (cp >= VEDIC_EXTENSION_START && cp <= VEDIC_EXTENSION_END) return "vedic-extension";
  return null;
}

function makeWarning(code, message, source, unitIndex = null) {
  return { code, message, source, unitIndex };
}

/**
 * Converts Sanskrit Devanagari text into a conservative phoneme/akshara plan.
 * The output is linguistic metadata, not synthesized audio or a finished meter.
 */
export function compilePhonemes(input, options = {}) {
  if (typeof input !== "string") throw new TypeError("compilePhonemes() का input string होना चाहिए।");
  const settings = normalizeOptions(options);
  if (input.length > settings.maxInputLength) {
    throw new RangeError("पाठ configured maxInputLength सीमा से बड़ा है।");
  }

  const text = input.normalize("NFC");
  const characters = Array.from(text);
  const phonemes = [];
  const units = [];
  const boundaries = [];
  const annotations = [];
  const warnings = [];
  let cursor = 0;

  function pushPhoneme(data, unitIndex) {
    const record = Object.freeze({ index: phonemes.length, unitIndex, ...data });
    phonemes.push(record);
    return record.index;
  }

  function attachMark(unit, mark, unitIndex) {
    const category = classifyMark(mark);
    const cp = codePointLabel(mark);
    if (category === "candrabindu") {
      unit.nasalized = true;
      unit.marks.push({ character: mark, codePoint: cp, category: "nasalization" });
      if (Number.isInteger(unit.vowelPhonemeIndex)) {
        const previous = phonemes[unit.vowelPhonemeIndex];
        phonemes[unit.vowelPhonemeIndex] = Object.freeze({ ...previous, nasalized: true });
      }
      annotations.push({ unitIndex, character: mark, codePoint: cp, category: "nasalization", interpretation: "vowel-nasalization" });
      return;
    }
    if (category === "anusvara") {
      unit.marks.push({ character: mark, codePoint: cp, category: "anusvara" });
      pushPhoneme({
        symbol: "ṃ", ipa: null, type: "nasal-mark", source: mark,
        contextDependent: true, realization: "place-assimilation-requires-context"
      }, unitIndex);
      annotations.push({ unitIndex, character: mark, codePoint: cp, category: "anusvara", interpretation: "preserved-context-dependent-nasal" });
      warnings.push(makeWarning("ANUSVARA_CONTEXT_REQUIRED", "अनुस्वार का सटीक नासिक्य उच्चारण अगले वर्ण और पाठ-परंपरा पर निर्भर है।", mark, unitIndex));
      return;
    }
    if (category === "visarga") {
      unit.marks.push({ character: mark, codePoint: cp, category: "visarga" });
      pushPhoneme({
        symbol: "ḥ", ipa: null, type: "visarga", source: mark,
        contextDependent: true, realization: "visarga-allophone-requires-context"
      }, unitIndex);
      annotations.push({ unitIndex, character: mark, codePoint: cp, category: "visarga", interpretation: "preserved-context-dependent-visarga" });
      warnings.push(makeWarning("VISARGA_CONTEXT_REQUIRED", "विसर्ग का वास्तविक उच्चारण संदर्भ और पाठ-परंपरा के अनुसार बदल सकता है।", mark, unitIndex));
      return;
    }
    if (category === "accent") {
      const label = ACCENT_LABELS.get(mark);
      const accent = { character: mark, codePoint: cp, label, interpretation: "metadata-only; no pitch assigned" };
      unit.accents.push(accent);
      if (Number.isInteger(unit.vowelPhonemeIndex)) {
        const previous = phonemes[unit.vowelPhonemeIndex];
        phonemes[unit.vowelPhonemeIndex] = Object.freeze({
          ...previous, accentMarks: Object.freeze([...(previous.accentMarks || []), Object.freeze(accent)])
        });
      }
      unit.marks.push({ character: mark, codePoint: cp, category: "accent" });
      annotations.push({ unitIndex, ...accent, category: "vedic-accent" });
      warnings.push(makeWarning("VEDIC_ACCENT_REQUIRES_RECITATION_CONTEXT", "स्वर-चिह्न सुरक्षित रखा गया है; शाखा/पाठ-स्रोत के बिना pitch contour निर्धारित नहीं किया गया।", mark, unitIndex));
      return;
    }
    if (category === "vedic-extension" || category === "vedic-special-visarga") {
      const item = {
        character: mark,
        codePoint: cp,
        category,
        realization: VEDIC_SPECIAL_SIGNS.get(mark) || null,
        interpretation: "recognized-but-not-realized; branch-specific rules required"
      };
      unit.marks.push(item);
      annotations.push({ unitIndex, ...item });
      warnings.push(makeWarning("VEDIC_EXTENSION_NOT_INTERPRETED", "वैदिक चिह्न को सुरक्षित रखा गया है; संबंधित शाखा और पाठ-स्रोत के बिना उसका गायन-निर्देश लागू नहीं किया गया।", mark, unitIndex));
    }
  }

  function consumeMarks(unit, unitIndex, start) {
    let next = start;
    while (next < characters.length) {
      const mark = characters[next];
      if (!classifyMark(mark)) break;
      attachMark(unit, mark, unitIndex);
      next += 1;
    }
    return next;
  }

  function addUnit(unit) {
    unit.phonemeEnd = phonemes.length;
    unit.phonemeCount = unit.phonemeEnd - unit.phonemeStart;
    unit.hasVowel = Boolean(unit.vowel);
    unit.mora = unit.vowel ? unit.vowel.mora : 0;
    unit.vowelSymbol = unit.vowel ? unit.vowel.symbol : null;
    unit.vowelLength = unit.vowel ? unit.vowel.length : null;
    units.push(Object.freeze({
      index: unit.index,
      text: unit.text,
      kind: unit.kind || "akshara",
      hasVowel: unit.hasVowel,
      vowelSymbol: unit.vowelSymbol,
      vowelLength: unit.vowelLength,
      mora: unit.mora,
      nasalized: unit.nasalized,
      consonants: Object.freeze(unit.consonants.slice()),
      accents: freezeArray(unit.accents),
      marks: freezeArray(unit.marks),
      phonemeStart: unit.phonemeStart,
      phonemeEnd: unit.phonemeEnd,
      phonemeCount: unit.phonemeCount
    }));
  }

  while (cursor < characters.length) {
    const start = cursor;
    const character = characters[cursor];

    if (/\s/u.test(character)) {
      let value = "";
      while (cursor < characters.length && /\s/u.test(characters[cursor])) value += characters[cursor++];
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "word-boundary", text: value, afterUnitIndex: units.length - 1 }));
      continue;
    }

    if (character === AVAGRAHA) {
      cursor += 1;
      const annotation = Object.freeze({ index: annotations.length, category: "avagraha", character, codePoint: codePointLabel(character), interpretation: "elision-marker; not a spoken phoneme" });
      annotations.push(annotation);
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "elision-marker", text: character, afterUnitIndex: units.length - 1 }));
      continue;
    }

    if (character === OM) {
      const unitIndex = units.length;
      const unit = {
        index: unitIndex, text: character, kind: "sacred-syllable", phonemeStart: phonemes.length,
        vowel: getVowel("o"), vowelPhonemeIndex: null, nasalized: false, consonants: [], accents: [], marks: []
      };
      unit.vowelPhonemeIndex = pushPhoneme({ symbol: "o", ipa: "oː", type: "vowel", source: character, vowelLength: "long", mora: 2, independent: true, sacredSignExpansion: "ॐ", nasalized: false, accentMarks: Object.freeze([]) }, unitIndex);
      unit.marks.push({ character, codePoint: codePointLabel(character), category: "sacred-sign", interpretation: "conventional-om-expansion" });
      pushPhoneme({ symbol: "ṃ", ipa: null, type: "nasal-mark", source: character, contextDependent: true, realization: "om-nasal-ending" }, unitIndex);
      warnings.push(makeWarning("OM_REALIZATION_CONTEXT_REQUIRED", "ॐ को o + ṃ के कार्यकारी रूप में रखा गया है; परंपरा के अनुसार उच्चारण/मात्रा की पुष्टि आवश्यक है।", character, unitIndex));
      cursor += 1;
      addUnit(unit);
      annotations.push({ unitIndex, character, codePoint: codePointLabel(character), category: "sacred-sign", interpretation: "conventional-om-expansion" });
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
          const following = readConsonant(characters, next);
          if (following) continue;
          terminalVirama = true;
          break;
        }
        break;
      }

      let vowel = null;
      if (!terminalVirama && next < characters.length && VOWEL_SIGNS.has(characters[next])) {
        vowel = getVowel(VOWEL_SIGNS.get(characters[next]));
        next += 1;
      } else if (!terminalVirama) {
        vowel = getVowel("a");
      }

      const unit = {
        index: unitIndex,
        text: characters.slice(start, next).join(""),
        kind: "akshara",
        phonemeStart: phonemes.length,
        vowel,
        nasalized: false,
        vowelPhonemeIndex: null,
        consonants: cluster.map(item => item.symbol),
        accents: [],
        marks: []
      };
      cluster.forEach(item => pushPhoneme({
        symbol: item.symbol, ipa: item.ipa, type: "consonant", source: item.character,
        features: Object.freeze({ place: item.place, manner: item.manner, voiced: item.voiced, aspirated: item.aspirated, nukta: Boolean(item.nukta) })
      }, unitIndex));
      if (vowel) unit.vowelPhonemeIndex = pushPhoneme({
        symbol: vowel.symbol, ipa: vowel.ipa, type: "vowel", source: characters.slice(start, next).join(""),
        vowelLength: vowel.length, mora: vowel.mora, independent: false, nasalized: false, accentMarks: Object.freeze([])
      }, unitIndex);
      next = consumeMarks(unit, unitIndex, next);
      cursor = next;
      unit.text = characters.slice(start, cursor).join("");
      addUnit(unit);
      continue;
    }

    const independentVowel = VOWELS.get(character);
    if (independentVowel) {
      const unitIndex = units.length;
      const unit = {
        index: unitIndex, text: character, kind: "akshara", phonemeStart: phonemes.length,
        vowel: independentVowel, vowelPhonemeIndex: null, nasalized: false, consonants: [], accents: [], marks: []
      };
      unit.vowelPhonemeIndex = pushPhoneme({
        symbol: independentVowel.symbol, ipa: independentVowel.ipa, type: "vowel", source: character,
        vowelLength: independentVowel.length, mora: independentVowel.mora, independent: true, nasalized: false, accentMarks: Object.freeze([])
      }, unitIndex);
      cursor += 1;
      cursor = consumeMarks(unit, unitIndex, cursor);
      unit.text = characters.slice(start, cursor).join("");
      addUnit(unit);
      continue;
    }

    if (classifyMark(character)) {
      const unitIndex = units.length;
      const unit = { index: unitIndex, text: character, kind: "orphan-mark", phonemeStart: phonemes.length, vowel: null, vowelPhonemeIndex: null, nasalized: false, consonants: [], accents: [], marks: [] };
      attachMark(unit, character, unitIndex);
      cursor += 1;
      addUnit(unit);
      warnings.push(makeWarning("ORPHAN_DIACRITIC", "यह ध्वनि/स्वर-चिह्न पिछले स्वर-अक्षर से अलग मिला; मूल चिह्न सुरक्षित रखा गया है।", character, unitIndex));
      continue;
    }

    if (character === "।" || character === "॥" || /[.,;:!?।॥]/u.test(character)) {
      cursor += 1;
      const kind = character === "॥" ? "verse-pause" : character === "।" ? "danda-pause" : "punctuation-pause";
      boundaries.push(Object.freeze({ index: boundaries.length, kind, text: character, afterUnitIndex: units.length - 1 }));
      continue;
    }

    if (/^[०-९0-9]$/u.test(character)) {
      cursor += 1;
      boundaries.push(Object.freeze({ index: boundaries.length, kind: "number-marker", text: character, afterUnitIndex: units.length - 1 }));
      annotations.push({ category: "number", character, codePoint: codePointLabel(character), interpretation: "not-expanded-to-spoken-number" });
      continue;
    }

    cursor += 1;
    const unitIndex = units.length;
    warnings.push(makeWarning("UNRECOGNIZED_CHARACTER", "यह चिह्न phoneme mapping में पहचाना नहीं गया; इसे हटाने के बजाय unknown record में रखा गया है।", character, unitIndex));
    const unknown = Object.freeze({ index: phonemes.length, unitIndex, symbol: null, ipa: null, type: "unknown", source: character, codePoint: codePointLabel(character) });
    phonemes.push(unknown);
    units.push(Object.freeze({
      index: unitIndex, text: character, kind: "unknown", hasVowel: false, vowelSymbol: null,
      vowelLength: null, mora: 0, nasalized: false, consonants: Object.freeze([]),
      accents: Object.freeze([]), marks: Object.freeze([]), phonemeStart: unknown.index,
      phonemeEnd: unknown.index + 1, phonemeCount: 1
    }));
  }

  return Object.freeze({
    version: PHONEME_COMPILER_VERSION,
    language: settings.language,
    script: "Devanagari",
    sourceText: input,
    normalizedText: text,
    phonemes: Object.freeze(phonemes.slice()),
    units: Object.freeze(units.slice()),
    boundaries: Object.freeze(boundaries.slice()),
    annotations: freezeArray(annotations),
    warnings: freezeArray(warnings),
    summary: Object.freeze({
      inputCodePoints: characters.length,
      unitCount: units.length,
      phonemeCount: phonemes.length,
      vowelCount: phonemes.filter(item => item.type === "vowel").length,
      consonantCount: phonemes.filter(item => item.type === "consonant").length,
      unknownCount: phonemes.filter(item => item.type === "unknown").length,
      warningCount: warnings.length
    }),
    policy: Object.freeze({
      inherentVowel: "preserved",
      scriptNormalization: "NFC",
      accentHandling: "metadata-only; no pitch contour inferred",
      anusvaraHandling: "preserved; context-dependent; no forced place assimilation",
      visargaHandling: "preserved; context-dependent; no forced allophone",
      outputRole: "orthographic phoneme plan; not syllable meter, singing score or audio"
    })
  });
}

export function createPhonemeCompiler(defaultOptions = {}) {
  const defaults = normalizeOptions(defaultOptions);
  return Object.freeze({
    version: PHONEME_COMPILER_VERSION,
    compile(text, overrides = {}) {
      if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        throw new TypeError("compile() overrides एक object होना चाहिए।");
      }
      return compilePhonemes(text, { ...defaults, ...overrides });
    },
    selfTest
  });
}

export function selfTest() {
  const checks = [];
  const add = (id, passed, detail = "") => checks.push(Object.freeze({ id, passed: Boolean(passed), detail: String(detail || "") }));
  const symbols = text => compilePhonemes(text).phonemes.map(item => item.symbol);

  add("independent-vowel", JSON.stringify(symbols("अ")) === JSON.stringify(["a"]));
  add("full-independent-vowel-set", VOWEL_DATA.every(([character]) => compilePhonemes(character).summary.vowelCount === 1));
  add("full-dependent-matra-set", VOWEL_SIGN_DATA.every(([sign, symbol]) => compilePhonemes("क" + sign).phonemes.some(item => item.type === "vowel" && item.symbol === symbol)));
  add("long-vowel-matra", JSON.stringify(symbols("का")) === JSON.stringify(["k", "ā"]));
  add("inherent-vowel-preserved", JSON.stringify(symbols("क")) === JSON.stringify(["k", "a"]));
  add("terminal-virama", JSON.stringify(symbols("क्")) === JSON.stringify(["k"]));
  add("conjunct-cluster", JSON.stringify(symbols("क्ष")) === JSON.stringify(["k", "ṣ", "a"]));
  add("complex-conjunct", JSON.stringify(symbols("ज्ञ")) === JSON.stringify(["j", "ñ", "a"]));
  add("anusvara-preserved", JSON.stringify(symbols("किं")) === JSON.stringify(["k", "i", "ṃ"]));
  add("visarga-preserved", JSON.stringify(symbols("नमः")) === JSON.stringify(["n", "a", "m", "a", "ḥ"]));
  add("chandrabindu-nasalizes-vowel", compilePhonemes("कँ").units[0].nasalized === true && compilePhonemes("कँ").phonemes[1].nasalized === true);
  add("vedic-accent-preserved", compilePhonemes("अ॑").units[0].accents[0]?.label === "udatta-name" && compilePhonemes("अ॑").phonemes[0].accentMarks[0]?.label === "udatta-name");
  add("vedic-jihvamuliya-recognized", compilePhonemes("अᳵ").annotations.some(item => item.realization === "jihvamuliya"));
  add("orphan-vedic-mark-preserved", compilePhonemes("॑अ").annotations.some(item => item.category === "vedic-accent"));
  add("om-expanded-conservatively", JSON.stringify(symbols("ॐ")) === JSON.stringify(["o", "ṃ"]));
  add("punctuation-boundary", compilePhonemes("रामः॥").boundaries.some(item => item.kind === "verse-pause"));
  add("nukta-consonant", JSON.stringify(symbols("ज़")) === JSON.stringify(["z", "a"]));
  add("unknown-character-retained", compilePhonemes("क🙂").summary.unknownCount === 1);
  add("input-type-guard", (() => { try { compilePhonemes(null); return false; } catch (error) { return error instanceof TypeError; } })());
  add("input-length-guard", (() => { try { compilePhonemes("राम", { maxInputLength: 2 }); return false; } catch (error) { return error instanceof RangeError; } })());

  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({
    module: "phoneme-compiler",
    version: PHONEME_COMPILER_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED",
    total: checks.length,
    passed,
    failed: checks.length - passed,
    checks: Object.freeze(checks)
  });
}

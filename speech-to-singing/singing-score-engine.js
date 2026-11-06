/* Swar-Sadhika Speech-to-Singing — local singing score planner.
 * Version 0.1.0. Converts a phoneme-compiler result into note/timing/tala metadata.
 * It does not synthesize audio, infer a Vedic recension, or claim to validate a raga.
 * Vedic recitation accents remain separate from the optional musical pitch contour.
 */
export const SINGING_SCORE_ENGINE_VERSION = "0.1.0";
const DEFAULT_TEMPO_BPM = 72, DEFAULT_TONIC_HZ = 261.625565;
const MIN_TEMPO_BPM = 30, MAX_TEMPO_BPM = 240, MIN_TONIC_HZ = 55, MAX_TONIC_HZ = 880;
const EPSILON = 1e-9;

const DEFAULT_SCALE_PROFILE = Object.freeze({
  id: "shuddha-saptak-practice",
  name: "शुद्ध सप्तक अभ्यास — राग-निर्दिष्ट नहीं",
  system: "sargam-reference",
  swaras: Object.freeze([
    Object.freeze({ index: 0, label: "सा", solfege: "Sa", semitones: 0 }),
    Object.freeze({ index: 1, label: "रे", solfege: "Re", semitones: 2 }),
    Object.freeze({ index: 2, label: "ग", solfege: "Ga", semitones: 4 }),
    Object.freeze({ index: 3, label: "म", solfege: "Ma", semitones: 5 }),
    Object.freeze({ index: 4, label: "प", solfege: "Pa", semitones: 7 }),
    Object.freeze({ index: 5, label: "ध", solfege: "Dha", semitones: 9 }),
    Object.freeze({ index: 6, label: "नि", solfege: "Ni", semitones: 11 }),
    Object.freeze({ index: 7, label: "सा′", solfege: "Sa'", semitones: 12 })
  ])
});

// Zero-based beat positions. These are structural tala guides; theka bols are not synthesized here.
const TALA_PROFILES = Object.freeze({
  dadra: Object.freeze({
    id: "dadra", name: "दादरा", beatsPerAvartan: 6, vibhags: Object.freeze([3, 3]),
    taliBeats: Object.freeze([0]), khaliBeats: Object.freeze([3])
  }),
  keharwa: Object.freeze({
    id: "keharwa", name: "कहरवा", beatsPerAvartan: 8, vibhags: Object.freeze([4, 4]),
    taliBeats: Object.freeze([0]), khaliBeats: Object.freeze([4])
  }),
  teentaal: Object.freeze({
    id: "teentaal", name: "तीनताल", beatsPerAvartan: 16, vibhags: Object.freeze([4, 4, 4, 4]),
    taliBeats: Object.freeze([0, 4, 12]), khaliBeats: Object.freeze([8])
  }),
  ektal: Object.freeze({
    id: "ektal", name: "एकताल", beatsPerAvartan: 12, vibhags: Object.freeze([2, 2, 2, 2, 2, 2]),
    taliBeats: Object.freeze([0, 2, 4, 8, 10]), khaliBeats: Object.freeze([6])
  }),
  rupak: Object.freeze({
    id: "rupak", name: "रूपक", beatsPerAvartan: 7, vibhags: Object.freeze([3, 2, 2]),
    taliBeats: Object.freeze([3, 5]), khaliBeats: Object.freeze([0])
  })
});
const DEFAULT_MELODY_PATTERN = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function finiteNumber(value, fallback, label) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number)) throw new TypeError(label + " एक सीमित संख्या होना चाहिए।");
  return number;
}
function normalizeScaleProfile(profile) {
  if (profile == null) return DEFAULT_SCALE_PROFILE;
  if (!isPlainObject(profile)) throw new TypeError("scaleProfile एक object होना चाहिए।");
  if (!Array.isArray(profile.swaras) || profile.swaras.length < 2 || profile.swaras.length > 16) {
    throw new RangeError("scaleProfile.swaras में 2 से 16 स्वर होने चाहिए।");
  }
  const seen = new Set();
  const swaras = profile.swaras.map((swara, index) => {
    if (!isPlainObject(swara)) throw new TypeError("scaleProfile का प्रत्येक swara object होना चाहिए।");
    const label = String(swara.label == null ? "" : swara.label).trim();
    const solfege = String(swara.solfege == null ? "" : swara.solfege).trim();
    const semitones = Number(swara.semitones);
    if (!label || !solfege || !Number.isFinite(semitones) || semitones < 0 || semitones > 24) {
      throw new RangeError("हर swara में label, solfege और 0–24 semitones आवश्यक हैं।");
    }
    if (seen.has(semitones)) throw new RangeError("scaleProfile में दो swaras का semitone स्थान समान है।");
    seen.add(semitones);
    return Object.freeze({ index, label, solfege, semitones });
  });
  for (let i = 1; i < swaras.length; i += 1) {
    if (swaras[i].semitones <= swaras[i - 1].semitones) {
      throw new RangeError("scaleProfile.swaras आरोही semitone क्रम में होने चाहिए।");
    }
  }
  return Object.freeze({
    id: String(profile.id || "custom-scale"),
    name: String(profile.name || "Custom Sargam Scale"),
    system: String(profile.system || "custom"),
    swaras: Object.freeze(swaras)
  });
}
function validateBeatMarks(value, label, beatsPerAvartan) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(label + " array होना चाहिए।");
  const values = value.map(Number), seen = new Set();
  for (const beat of values) {
    if (!Number.isInteger(beat) || beat < 0 || beat >= beatsPerAvartan) {
      throw new RangeError(label + " में 0 से beatsPerAvartan-1 तक के पूर्णांक होने चाहिए।");
    }
    if (seen.has(beat)) throw new RangeError(label + " में duplicate beat नहीं हो सकते।");
    seen.add(beat);
  }
  return Object.freeze(values);
}
function normalizeTala(tala) {
  if (tala == null || tala === false || tala === "free") return null;
  let source;
  if (typeof tala === "string") {
    source = TALA_PROFILES[tala.toLowerCase()];
    if (!source) throw new RangeError("अज्ञात tala preset: " + tala);
  } else {
    if (!isPlainObject(tala)) throw new TypeError("tala एक preset नाम, object या null होना चाहिए।");
    source = tala;
  }
  const beatsPerAvartan = Number(source.beatsPerAvartan);
  if (!Number.isInteger(beatsPerAvartan) || beatsPerAvartan < 1 || beatsPerAvartan > 64) {
    throw new RangeError("tala.beatsPerAvartan 1 से 64 तक पूर्णांक होना चाहिए।");
  }
  if (!Array.isArray(source.vibhags) || !source.vibhags.length || source.vibhags.some(value => !Number.isInteger(Number(value)) || Number(value) <= 0)) {
    throw new TypeError("tala.vibhags सकारात्मक पूर्णांकों की array होना चाहिए।");
  }
  const vibhags = source.vibhags.map(Number);
  if (vibhags.reduce((sum, value) => sum + value, 0) !== beatsPerAvartan) {
    throw new RangeError("tala.vibhags का योग beatsPerAvartan के बराबर होना चाहिए।");
  }
  const taliBeats = validateBeatMarks(source.taliBeats, "taliBeats", beatsPerAvartan);
  const khaliBeats = validateBeatMarks(source.khaliBeats, "khaliBeats", beatsPerAvartan);
  if (taliBeats.some(beat => khaliBeats.includes(beat))) {
    throw new RangeError("एक ही beat को tali और khali दोनों नहीं रखा जा सकता।");
  }
  return Object.freeze({
    id: String(source.id || "custom-tala"), name: String(source.name || "Custom Tala"),
    beatsPerAvartan, vibhags: Object.freeze(vibhags), taliBeats, khaliBeats,
    samBeat: 0, notation: "zero-based; matra labels are one-based in output"
  });
}
function normalizeOptions(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("Singing Score Engine options एक plain object होना चाहिए।");
  const tempoBpm = finiteNumber(options.tempoBpm, DEFAULT_TEMPO_BPM, "tempoBpm");
  if (tempoBpm < MIN_TEMPO_BPM || tempoBpm > MAX_TEMPO_BPM) throw new RangeError("tempoBpm 30 से 240 के बीच होना चाहिए।");
  const tonicHz = finiteNumber(options.tonicHz, DEFAULT_TONIC_HZ, "tonicHz");
  if (tonicHz < MIN_TONIC_HZ || tonicHz > MAX_TONIC_HZ) throw new RangeError("tonicHz 55 से 880 Hz के बीच होना चाहिए।");
  const shortVowelBeats = finiteNumber(options.shortVowelBeats, 1, "shortVowelBeats");
  const longVowelBeats = finiteNumber(options.longVowelBeats, 2, "longVowelBeats");
  const plutaVowelBeats = finiteNumber(options.plutaVowelBeats, 3, "plutaVowelBeats");
  const wordGapBeats = finiteNumber(options.wordGapBeats, 0.2, "wordGapBeats");
  const dandaPauseBeats = finiteNumber(options.dandaPauseBeats, 0.75, "dandaPauseBeats");
  const versePauseBeats = finiteNumber(options.versePauseBeats, 1.5, "versePauseBeats");
  const punctuationPauseBeats = finiteNumber(options.punctuationPauseBeats, 0.5, "punctuationPauseBeats");
  for (const [name, value] of Object.entries({ shortVowelBeats, longVowelBeats, plutaVowelBeats })) {
    if (value <= 0 || value > 16) throw new RangeError(name + " शून्य से अधिक और अधिकतम 16 होना चाहिए।");
  }
  for (const [name, value] of Object.entries({ wordGapBeats, dandaPauseBeats, versePauseBeats, punctuationPauseBeats })) {
    if (value < 0 || value > 16) throw new RangeError(name + " 0 से 16 के बीच होना चाहिए।");
  }
  const scaleProfile = normalizeScaleProfile(options.scaleProfile);
  const melodyPattern = options.melodyPattern == null ? DEFAULT_MELODY_PATTERN : options.melodyPattern;
  if (!Array.isArray(melodyPattern) || !melodyPattern.length || melodyPattern.length > 256) {
    throw new TypeError("melodyPattern 1 से 256 indices की array होना चाहिए।");
  }
  const pattern = melodyPattern.map(Number);
  if (pattern.some(index => !Number.isInteger(index) || index < 0 || index >= scaleProfile.swaras.length)) {
    throw new RangeError("melodyPattern के सभी indices scaleProfile.swaras की सीमा में होने चाहिए।");
  }
  const tala = normalizeTala(options.tala);
  const laya = options.laya == null ? "unspecified" : String(options.laya).trim().toLowerCase();
  if (laya && !["unspecified", "vilambit", "madhya", "drut", "custom"].includes(laya)) {
    throw new RangeError("laya केवल vilambit, madhya, drut, custom या unspecified हो सकता है।");
  }
  const ragaName = options.ragaName == null ? null : String(options.ragaName).trim() || null;
  return Object.freeze({
    tempoBpm, tonicHz, shortVowelBeats, longVowelBeats, plutaVowelBeats,
    wordGapBeats, dandaPauseBeats, versePauseBeats, punctuationPauseBeats,
    scaleProfile, melodyPattern: Object.freeze(pattern), tala, laya: laya || "unspecified", ragaName
  });
}
function validateCompilerResult(result) {
  if (!isPlainObject(result)) throw new TypeError("compileScore() को phoneme compiler result object चाहिए।");
  if (!Array.isArray(result.units) || !Array.isArray(result.phonemes) || !Array.isArray(result.boundaries)) {
    throw new TypeError("Compiler result में units, phonemes और boundaries arrays आवश्यक हैं।");
  }
  for (let i = 0; i < result.units.length; i += 1) {
    const unit = result.units[i];
    if (!isPlainObject(unit)) throw new TypeError("Compiler unit " + i + " object नहीं है।");
    if (unit.index != null && unit.index !== i) throw new RangeError("Compiler units के index क्रमबद्ध नहीं हैं।");
    if (unit.hasVowel === true && (typeof unit.vowelSymbol !== "string" || !unit.vowelSymbol)) {
      throw new TypeError("Vowel unit " + i + " में vowelSymbol उपलब्ध होना चाहिए।");
    }
  }
  for (const phoneme of result.phonemes) {
    if (!isPlainObject(phoneme) || !Number.isInteger(phoneme.unitIndex) || phoneme.unitIndex < 0 || phoneme.unitIndex >= result.units.length) {
      throw new TypeError("Compiler phoneme में वैध unitIndex आवश्यक है।");
    }
  }
  for (const boundary of result.boundaries) {
    if (!isPlainObject(boundary) || typeof boundary.kind !== "string") throw new TypeError("Compiler boundary में kind आवश्यक है।");
  }
}
function getDurationBeats(unit, settings) {
  if (unit.vowelLength === "pluta" || Number(unit.mora) === 3) return settings.plutaVowelBeats;
  if (unit.vowelLength === "long" || Number(unit.mora) === 2) return settings.longVowelBeats;
  if (unit.vowelLength === "short" || Number(unit.mora) === 1) return settings.shortVowelBeats;
  return settings.shortVowelBeats;
}
function getTalaPosition(startBeat, tala) {
  if (!tala) return null;
  const cycle = tala.beatsPerAvartan;
  const cycleNumber = Math.floor((startBeat + EPSILON) / cycle);
  const beatInCycle = ((startBeat % cycle) + cycle) % cycle;
  const integerBeat = Math.floor(beatInCycle + EPSILON);
  const fraction = beatInCycle - integerBeat;
  let accumulated = 0, vibhagIndex = tala.vibhags.length - 1, matraInVibhag = 1;
  for (let i = 0; i < tala.vibhags.length; i += 1) {
    const end = accumulated + tala.vibhags[i];
    if (beatInCycle < end - EPSILON || i === tala.vibhags.length - 1) {
      vibhagIndex = i;
      matraInVibhag = beatInCycle - accumulated + 1;
      break;
    }
    accumulated = end;
  }
  return Object.freeze({
    avartan: cycleNumber + 1, matraInAvartan: integerBeat + 1, fractionalMatra: fraction,
    vibhagIndex: vibhagIndex + 1, matraInVibhag,
    isSam: integerBeat === tala.samBeat && fraction < EPSILON,
    isTali: fraction < EPSILON && tala.taliBeats.includes(integerBeat),
    isKhali: fraction < EPSILON && tala.khaliBeats.includes(integerBeat)
  });
}
function getPhraseResetBoundary(kind) {
  return ["danda-pause", "verse-pause", "punctuation-pause"].includes(kind);
}

/**
 * Build a note/rest timeline from the conservative phoneme-compiler output.
 * A vowel nucleus receives one note event; consonants remain articulation metadata.
 * Short/long/pluta duration ratios are configurable score defaults, not a claim of
 * exact Vedic chandas or a substitute for a source-specific Samaveda notation.
 */
export function compileSingingScore(compilerResult, options = {}) {
  validateCompilerResult(compilerResult);
  const settings = normalizeOptions(options);
  const events = [], notes = [], directives = [], articulationEvents = [], recitationAnnotations = [];
  const warnings = Array.isArray(compilerResult.warnings) ? compilerResult.warnings.map(item => Object.freeze({ ...item })) : [];
  const boundariesAfter = new Map();
  for (const boundary of compilerResult.boundaries) {
    const key = Number.isInteger(boundary.afterUnitIndex) ? boundary.afterUnitIndex : -1;
    if (!boundariesAfter.has(key)) boundariesAfter.set(key, []);
    boundariesAfter.get(key).push(boundary);
  }
  let beatCursor = 0, phraseNoteIndex = 0, eventIndex = 0;
  const secondsPerBeat = 60 / settings.tempoBpm;

  function addEvent(type, payload, durationBeats) {
    const base = {
      index: eventIndex++, type, startBeat: beatCursor, durationBeats,
      endBeat: beatCursor + durationBeats,
      startSeconds: beatCursor * secondsPerBeat,
      durationSeconds: durationBeats * secondsPerBeat,
      endSeconds: (beatCursor + durationBeats) * secondsPerBeat,
      talaPosition: getTalaPosition(beatCursor, settings.tala)
    };
    const event = Object.freeze({ ...base, ...payload });
    events.push(event);
    beatCursor += durationBeats;
    return event;
  }
  function handleBoundary(boundary) {
    const kind = boundary.kind;
    const directive = Object.freeze({
      kind, text: boundary.text == null ? "" : String(boundary.text),
      afterUnitIndex: Number.isInteger(boundary.afterUnitIndex) ? boundary.afterUnitIndex : -1,
      canPause: boundary.canPause !== false, source: boundary.source || null, createsRest: false
    });
    directives.push(directive);
    if (kind === "samaveda-no-pause-boundary" || boundary.canPause === false || kind === "elision-marker" || kind === "number-marker") return;
    let gap = 0;
    if (kind === "word-boundary") gap = settings.wordGapBeats;
    else if (kind === "danda-pause") gap = settings.dandaPauseBeats;
    else if (kind === "verse-pause") gap = settings.versePauseBeats;
    else if (kind === "punctuation-pause") gap = settings.punctuationPauseBeats;
    if (gap > 0) {
      const rest = addEvent("rest", { reason: kind, boundaryText: directive.text, unitIndex: directive.afterUnitIndex }, gap);
      directives[directives.length - 1] = Object.freeze({ ...directive, createsRest: true, eventIndex: rest.index });
    }
    if (getPhraseResetBoundary(kind)) phraseNoteIndex = 0;
  }

  for (const boundary of boundariesAfter.get(-1) || []) handleBoundary(boundary);
  for (const unit of compilerResult.units) {
    const unitIndex = unit.index;
    const unitPhonemes = compilerResult.phonemes.filter(phoneme => phoneme.unitIndex === unitIndex);
    const unitAccents = Array.isArray(unit.accents) ? unit.accents.map(item => Object.freeze({ ...item })) : [];
    const unitMarks = Array.isArray(unit.marks) ? unit.marks.map(item => Object.freeze({ ...item })) : [];
    if (unitAccents.length || unitMarks.length) {
      recitationAnnotations.push(Object.freeze({
        unitIndex, sourceText: String(unit.text || ""),
        accents: Object.freeze(unitAccents), marks: Object.freeze(unitMarks), pitchMappingApplied: false
      }));
    }
    if (unit.hasVowel === true) {
      const patternIndex = phraseNoteIndex % settings.melodyPattern.length;
      const swaraIndex = settings.melodyPattern[patternIndex];
      const swara = settings.scaleProfile.swaras[swaraIndex];
      const durationBeats = getDurationBeats(unit, settings);
      const frequencyHz = settings.tonicHz * Math.pow(2, swara.semitones / 12);
      const midiNumber = 69 + 12 * Math.log2(frequencyHz / 440);
      const event = addEvent("note", {
        unitIndex, syllableText: String(unit.text || ""),
        vowelSymbol: unit.vowelSymbol, vowelLength: unit.vowelLength || null,
        linguisticMora: Number.isFinite(Number(unit.mora)) ? Number(unit.mora) : null,
        durationBasis: "configurable-vowel-length-ratio",
        swara: Object.freeze({
          index: swara.index, label: swara.label, solfege: swara.solfege,
          semitonesFromSa: swara.semitones, octaveFromSa: Math.floor(swara.semitones / 12)
        }),
        pitch: Object.freeze({
          tonicHz: settings.tonicHz, frequencyHz, midiNumber,
          source: "configured-scale-profile", tuningSystem: "equal-tempered-frequency-reference"
        }),
        phonemeIndices: Object.freeze(unitPhonemes.map(item => item.index).filter(Number.isInteger)),
        consonantArticulation: Object.freeze(unitPhonemes.filter(item => item.type === "consonant").map(item => Object.freeze({
          symbol: item.symbol, source: item.source, features: item.features || null
        }))),
        recitationAccents: Object.freeze(unitAccents), recitationMarks: Object.freeze(unitMarks),
        ragaName: settings.ragaName, ragaRulesApplied: false
      }, durationBeats);
      notes.push(event);
      phraseNoteIndex += 1;
    } else if (unitPhonemes.length || unitMarks.length || unitAccents.length) {
      articulationEvents.push(Object.freeze({
        unitIndex, text: String(unit.text || ""), kind: unit.kind || "non-vowel-unit",
        phonemes: Object.freeze(unitPhonemes.map(item => Object.freeze({
          index: item.index, symbol: item.symbol, type: item.type, source: item.source
        }))),
        accents: Object.freeze(unitAccents), marks: Object.freeze(unitMarks), noteCreated: false
      }));
    }
    for (const boundary of boundariesAfter.get(unitIndex) || []) handleBoundary(boundary);
  }

  if (!notes.length) warnings.push(Object.freeze({
    code: "NO_VOWEL_NUCLEI",
    message: "Compiler result में कोई vowel nucleus नहीं मिला; singing score में note event नहीं बना।"
  }));
  const ragaMetadata = Object.freeze({
    name: settings.ragaName, profileValidated: false, arohaAvrohaValidated: false, pakadValidated: false,
    note: settings.ragaName
      ? "यह label उपयोगकर्ता metadata है; राग-व्याकरण या बंदिश की शास्त्रीय पुष्टि इस engine ने नहीं की।"
      : "कोई राग निर्दिष्ट नहीं; default shuddha-saptak अभ्यास contour को राग न समझें।"
  });

  return Object.freeze({
    version: SINGING_SCORE_ENGINE_VERSION,
    sourceCompilerVersion: compilerResult.version || null,
    sourceText: compilerResult.sourceText == null ? "" : String(compilerResult.sourceText),
    status: notes.length ? "score-ready" : "no-notes",
    events: Object.freeze(events), notes: Object.freeze(notes),
    directives: Object.freeze(directives), articulationEvents: Object.freeze(articulationEvents),
    recitationAnnotations: Object.freeze(recitationAnnotations), warnings: Object.freeze(warnings),
    music: Object.freeze({
      tempoBpm: settings.tempoBpm, laya: settings.laya, secondsPerBeat, tonicHz: settings.tonicHz,
      scaleProfile: settings.scaleProfile, melodyPattern: settings.melodyPattern, tala: settings.tala,
      raga: ragaMetadata,
      accentPolicy: "vedic-recitation-metadata-preserved; never auto-mapped to raga swaras",
      durationPolicy: "short/long/pluta vowel ratios are configurable score defaults, not asserted Vedic meter"
    }),
    summary: Object.freeze({
      noteCount: notes.length, restCount: events.filter(item => item.type === "rest").length,
      articulationCount: articulationEvents.length, directiveCount: directives.length,
      totalBeats: beatCursor, estimatedDurationSeconds: beatCursor * secondsPerBeat,
      unknownPhonemeCount: compilerResult.phonemes.filter(item => item.type === "unknown").length,
      warningCount: warnings.length
    }),
    capabilities: Object.freeze({
      generatesPcm: false, synthesizesVoice: false, validatesRagaGrammar: false, rendersThekaAudio: false,
      createsNoteAndTalaTimeline: true, keepsVedicRecitationSeparate: true
    })
  });
}

export function createSingingScoreEngine(defaultOptions = {}) {
  const defaults = normalizeOptions(defaultOptions);
  return Object.freeze({
    version: SINGING_SCORE_ENGINE_VERSION,
    compile(compilerResult, overrides = {}) {
      if (!isPlainObject(overrides)) throw new TypeError("compile() overrides plain object होना चाहिए।");
      return compileSingingScore(compilerResult, { ...defaults, ...overrides });
    },
    selfTest
  });
}
export function getTalaProfiles() {
  return Object.freeze(Object.values(TALA_PROFILES));
}
export function getDefaultScaleProfile() {
  return DEFAULT_SCALE_PROFILE;
}
export function selfTest() {
  const checks = [];
  const add = (id, passed, detail = "") => checks.push(Object.freeze({ id, passed: Boolean(passed), detail: String(detail || "") }));
  const fixture = (count = 1, vowelLength = "short", boundaries = []) => {
    const units = [], phonemes = [];
    for (let i = 0; i < count; i += 1) {
      const start = phonemes.length;
      phonemes.push(Object.freeze({ index: start, unitIndex: i, symbol: "a", type: "vowel", source: "अ" }));
      units.push(Object.freeze({
        index: i, text: "अ", kind: "akshara", hasVowel: true, vowelSymbol: "a",
        vowelLength, mora: vowelLength === "long" ? 2 : vowelLength === "pluta" ? 3 : 1,
        phonemeStart: start, phonemeEnd: start + 1, phonemeCount: 1,
        accents: Object.freeze([]), marks: Object.freeze([])
      }));
    }
    return { version: "0.2.0", sourceText: "अ".repeat(count), units, phonemes, boundaries, warnings: [] };
  };
  const symbols = input => compileSingingScore(input).notes.map(item => item.swara.solfege);
  add("default-score-created", compileSingingScore(fixture()).status === "score-ready");
  add("default-is-not-a-raga", compileSingingScore(fixture()).music.raga.name === null && compileSingingScore(fixture()).music.raga.profileValidated === false);
  add("short-vowel-duration", compileSingingScore(fixture(1, "short")).notes[0].durationBeats === 1);
  add("long-vowel-duration", compileSingingScore(fixture(1, "long")).notes[0].durationBeats === 2);
  add("pluta-vowel-duration", compileSingingScore(fixture(1, "pluta")).notes[0].durationBeats === 3);
  add("gentle-sargam-contour", JSON.stringify(symbols(fixture(5))) === JSON.stringify(["Sa", "Re", "Ga", "Ma", "Pa"]));
  add("frequency-doubles-at-octave", Math.abs(compileSingingScore(fixture(), {
    scaleProfile: { name: "octave", swaras: [{ label: "सा", solfege: "Sa", semitones: 0 }, { label: "सा′", solfege: "Sa'", semitones: 12 }] }, melodyPattern: [1]
  }).notes[0].pitch.frequencyHz / DEFAULT_TONIC_HZ - 2) < 1e-9);
  add("tempo-to-seconds", Math.abs(compileSingingScore(fixture(), { tempoBpm: 60 }).notes[0].durationSeconds - 1) < EPSILON);
  add("tonic-frequency-configurable", compileSingingScore(fixture(), { tonicHz: 220 }).notes[0].pitch.frequencyHz === 220);
  add("teentaal-cycle", compileSingingScore(fixture(17), { tala: "teentaal" }).notes[16].talaPosition.avartan === 2);
  add("teentaal-khali", compileSingingScore(fixture(9), { tala: "teentaal" }).notes[8].talaPosition.isKhali === true);
  add("teentaal-sam", compileSingingScore(fixture(17), { tala: "teentaal" }).notes[16].talaPosition.isSam === true);
  add("dadra-cycle-size", TALA_PROFILES.dadra.beatsPerAvartan === 6);
  add("keharwa-vibhag-sum", TALA_PROFILES.keharwa.vibhags.reduce((sum, value) => sum + value, 0) === 8);
  add("free-time-default", compileSingingScore(fixture()).music.tala === null);
  add("word-gap-rest", compileSingingScore(fixture(2, "short", [{ kind: "word-boundary", text: " ", afterUnitIndex: 0 }]), { wordGapBeats: 0.5 }).summary.restCount === 1);
  add("punctuation-rest", compileSingingScore(fixture(1, "short", [{ kind: "verse-pause", text: "॥", afterUnitIndex: 0 }])).events.some(item => item.type === "rest" && item.reason === "verse-pause"));
  add("samaveda-no-pause-no-rest", compileSingingScore(fixture(1, "short", [{ kind: "samaveda-no-pause-boundary", text: "᳓", canPause: false, afterUnitIndex: 0 }])).summary.restCount === 0);
  const accentFixture = fixture();
  accentFixture.units[0] = Object.freeze({ ...accentFixture.units[0], accents: Object.freeze([{ label: "udatta", pitchClass: "high" }]) });
  add("vedic-accent-preserved", compileSingingScore(accentFixture).notes[0].recitationAccents[0].label === "udatta");
  add("vedic-accent-does-not-change-swara", compileSingingScore(accentFixture).notes[0].swara.solfege === compileSingingScore(fixture()).notes[0].swara.solfege);
  add("custom-scale-profile", compileSingingScore(fixture(), {
    scaleProfile: { id: "custom", name: "Custom", swaras: [{ label: "सा", solfege: "Sa", semitones: 0 }, { label: "कोमल रे", solfege: "re♭", semitones: 1 }] }, melodyPattern: [1]
  }).notes[0].pitch.frequencyHz > DEFAULT_TONIC_HZ);
  add("custom-tala-valid", compileSingingScore(fixture(4), {
    tala: { name: "custom-four", beatsPerAvartan: 4, vibhags: [2, 2], taliBeats: [0], khaliBeats: [2] }
  }).music.tala.beatsPerAvartan === 4);
  add("custom-raga-label-not-validated", compileSingingScore(fixture(), { ragaName: "User label" }).music.raga.arohaAvrohaValidated === false);
  const noVowel = {
    version: "0.2.0", units: [{ index: 0, text: "क्", hasVowel: false, marks: [], accents: [] }],
    phonemes: [{ index: 0, unitIndex: 0, type: "consonant", symbol: "k" }], boundaries: [], warnings: []
  };
  add("consonant-only-unit-retained", compileSingingScore(noVowel).articulationEvents.length === 1);
  add("no-vowel-status", compileSingingScore(noVowel).status === "no-notes");
  add("phoneme-unit-index-validation", (() => { try { compileSingingScore({ units: [], phonemes: [{ unitIndex: 0 }], boundaries: [] }); return false; } catch (error) { return error instanceof TypeError; } })());
  add("tempo-validation", (() => { try { compileSingingScore(fixture(), { tempoBpm: 500 }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("tonic-validation", (() => { try { compileSingingScore(fixture(), { tonicHz: 10 }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("scale-validation", (() => { try { compileSingingScore(fixture(), { scaleProfile: { swaras: [{ label: "x", solfege: "x", semitones: 2 }, { label: "y", solfege: "y", semitones: 1 }] } }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("tala-validation", (() => { try { compileSingingScore(fixture(), { tala: { beatsPerAvartan: 8, vibhags: [3, 3] } }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("pattern-validation", (() => { try { compileSingingScore(fixture(), { melodyPattern: [99] }); return false; } catch (error) { return error instanceof RangeError; } })());
  add("input-not-mutated", (() => { const original = fixture(); const before = JSON.stringify(original); compileSingingScore(original); return JSON.stringify(original) === before; })());
  add("output-is-frozen", Object.isFrozen(compileSingingScore(fixture()).events));
  add("unknown-phoneme-count", compileSingingScore({ ...fixture(), phonemes: [{ index: 0, unitIndex: 0, type: "unknown" }] }).summary.unknownPhonemeCount === 1);
  const passed = checks.filter(item => item.passed).length;
  return Object.freeze({
    module: "singing-score-engine", version: SINGING_SCORE_ENGINE_VERSION,
    status: passed === checks.length ? "PASSED" : "FAILED", total: checks.length, passed,
    failed: checks.length - passed, checks: Object.freeze(checks)
  });
}

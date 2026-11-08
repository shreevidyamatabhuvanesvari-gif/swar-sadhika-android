/* Swar-Sadhika — Sanskrit Pronunciation Compiler.
 * SWR-TTS-COMPILER-04 — deterministic, review-gated Native TTS text compiler.
 * No DOM, network, storage, dynamic imports, code execution, or global browser access.
 * Original Sanskrit text changes only when one exact, reviewed, voice-tested Lexicon
 * entry authorizes a single-word replacement.
 */
import {
  analyzeVedicText,
  analyzePronunciationCandidates
} from "./vedic-sanskrit-pronunciation.js";

export const SANSKRIT_PRONUNCIATION_COMPILER_VERSION = "1.0.0";
export const SWR_TTS_COMPILER_IMPROVEMENT_ID = "SWR-TTS-COMPILER-04";

const NATIVE_TTS_ENGINE = "Web Speech API SpeechSynthesis";
const MAX_TEXT_LENGTH = 100000;
const DEVANAGARI_TOKEN = /^[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+$/u;
const WORD_PATTERN_SOURCE = "[\\u0900-\\u097F\\uA8E0-\\uA8FF\\u{11B00}-\\u{11B0A}\\u{1CD0}-\\u{1CFA}]+";
const CONFIDENCE_STATES = new Set(["verified", "fallback", "ambiguous"]);

export class SanskritPronunciationCompilerError extends Error {
  constructor(message, code = "SANSKRIT_COMPILER_ERROR", details = null) {
    super(message);
    this.name = "SanskritPronunciationCompilerError";
    this.code = code;
    this.details = details;
  }
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function deepFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (!isObject(value)) return value;
  const copy = {};
  Object.keys(value).forEach(key => { copy[key] = deepFreeze(value[key]); });
  return Object.freeze(copy);
}

function makeWarning(code, message, severity = "warning", details = null) {
  return deepFreeze({ code, message, severity, details });
}

function normalizeTextToken(value) {
  return String(value || "").normalize("NFC").trim();
}

function normalizeLocale(value) {
  return typeof value === "string" ? value.trim().replace(/_/g, "-").toLowerCase() : "";
}

function isValidLocale(value) {
  return typeof value === "string" && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim());
}

function normalizeShakha(value) {
  if (!isNonEmptyString(value)) return "";
  const normalized = value.trim().toLowerCase();
  if (normalized === "shaakala" || normalized === "shakala" || normalized === "rigveda-shakala") {
    return "rigveda-shakala";
  }
  return normalized;
}

function countCodePoints(text) {
  return Array.from(text).length;
}

function codePointOffset(text, utf16Offset) {
  return countCodePoints(text.slice(0, utf16Offset));
}

function tokenizeWithOffsets(text) {
  const regex = new RegExp(WORD_PATTERN_SOURCE, "gu");
  return Array.from(text.matchAll(regex), match => ({
    text: match[0],
    normalized: normalizeTextToken(match[0]),
    startUtf16Index: match.index,
    endUtf16Index: match.index + match[0].length
  }));
}

function completePrimarySource(source) {
  if (!isObject(source)) return false;
  const values = Object.entries(source).filter(([, value]) =>
    (typeof value === "string" && value.trim().length > 0) ||
    (typeof value === "number" && Number.isFinite(value))
  );
  const hasWork = values.some(([key]) => /text|grantha|title|name|work|source/i.test(key));
  const hasLocator = values.some(([key]) => /chapter|section|verse|citation|locator|reference|passage/i.test(key));
  return values.length >= 2 && hasWork && hasLocator;
}

function hasStructuredVoiceEvidence(evidence) {
  if (!isObject(evidence)) return false;
  const keys = Object.entries(evidence)
    .filter(([, value]) => isNonEmptyString(value))
    .map(([key]) => key.toLowerCase());
  return keys.some(key => /date|testedat/.test(key)) &&
    keys.some(key => /phrase|utterance|testtext/.test(key)) &&
    keys.some(key => /result|observation|accepted/.test(key)) &&
    keys.some(key => /reviewer|reviewedby|tester/.test(key));
}

function resolveVoiceProfile(voice, suppliedProfile = {}) {
  if (!isObject(voice)) {
    return { valid: false, code: "NATIVE_VOICE_MISSING", message: "चयनित Native Speech Voice उपलब्ध नहीं है।" };
  }
  if (voice.localService === false) {
    return { valid: false, code: "NATIVE_VOICE_NOT_LOCAL", message: "चयनित Voice स्थानीय Native Voice नहीं है।" };
  }

  const name = isNonEmptyString(voice.name) ? voice.name.trim() : "";
  const voiceURI = isNonEmptyString(voice.voiceURI) ? voice.voiceURI.trim() : "";
  const locale = isNonEmptyString(voice.lang) ? voice.lang.trim() : "";
  const engine = isNonEmptyString(suppliedProfile.engine) ? suppliedProfile.engine.trim() : NATIVE_TTS_ENGINE;
  const platform = isNonEmptyString(suppliedProfile.platform) ? suppliedProfile.platform.trim() : "";

  if (!name || !voiceURI || !isValidLocale(locale)) {
    return { valid: false, code: "NATIVE_VOICE_PROFILE_INCOMPLETE", message: "चयनित Native Voice का नाम, voiceURI और BCP-47 locale आवश्यक हैं।" };
  }
  if (!platform) {
    return { valid: false, code: "NATIVE_VOICE_PLATFORM_UNSPECIFIED", message: "Native Voice का सत्यापित platform स्पष्ट रूप से देना आवश्यक है।" };
  }
  if (engine !== NATIVE_TTS_ENGINE) {
    return { valid: false, code: "NATIVE_TTS_ENGINE_UNSUPPORTED", message: "केवल Web Speech API SpeechSynthesis Voice Profile समर्थित है।" };
  }

  const mismatches = [];
  if (suppliedProfile.voiceName && suppliedProfile.voiceName !== name) mismatches.push("voiceName");
  if (suppliedProfile.name && suppliedProfile.name !== name) mismatches.push("name");
  if (suppliedProfile.voiceURI && suppliedProfile.voiceURI !== voiceURI) mismatches.push("voiceURI");
  if (suppliedProfile.locale && normalizeLocale(suppliedProfile.locale) !== normalizeLocale(locale)) mismatches.push("locale");
  if (mismatches.length) {
    return {
      valid: false,
      code: "SELECTED_VOICE_PROFILE_MISMATCH",
      message: "दिए गए Voice Profile और वास्तव में चयनित Native Voice में अंतर है।",
      details: { mismatches }
    };
  }

  return {
    valid: true,
    profile: deepFreeze({
      engine,
      platform,
      voiceName: name,
      voiceURI,
      locale,
      localService: voice.localService === true
    })
  };
}

function validateLexiconEntryForSpeech(entry, selectedVoiceProfile) {
  const reasons = [];
  if (!isObject(entry)) return { ready: false, reasons: ["entry-not-an-object"] };

  if (entry.reviewStatus !== "reviewed") reasons.push("entry-not-reviewed");
  if (!isObject(entry.source) ||
      entry.source.primarySourceVerified !== true ||
      entry.source.sourceReviewStatus !== "reviewed" ||
      !completePrimarySource(entry.source.primarySource)) {
    reasons.push("primary-source-not-verified");
  }
  if (!isObject(entry.phoneticStructure) ||
      entry.phoneticStructure.status !== "verified" ||
      !Array.isArray(entry.phoneticStructure.orthographicUnits) ||
      !entry.phoneticStructure.orthographicUnits.length ||
      !Array.isArray(entry.phoneticStructure.phonemeSequence) ||
      !entry.phoneticStructure.phonemeSequence.length) {
    reasons.push("structured-phonetics-not-verified");
  }
  if (!isObject(entry.phonemeReference) ||
      entry.phonemeReference.status !== "verified" ||
      !isNonEmptyString(entry.phonemeReference.value)) {
    reasons.push("phoneme-reference-not-verified");
  }
  if (!isNonEmptyString(entry.nativeSpeechText) ||
      !DEVANAGARI_TOKEN.test(entry.nativeSpeechText.trim()) ||
      /\s/u.test(entry.nativeSpeechText)) {
    reasons.push("native-speech-text-invalid");
  }
  if (!Array.isArray(entry.voiceLocales) ||
      !entry.voiceLocales.some(locale => normalizeLocale(locale) === normalizeLocale(selectedVoiceProfile.locale))) {
    reasons.push("voice-locale-not-declared");
  }
  if (!isObject(entry.voiceProfile)) {
    reasons.push("voice-profile-missing");
  } else {
    const profile = entry.voiceProfile;
    if (profile.engine !== selectedVoiceProfile.engine ||
        profile.platform !== selectedVoiceProfile.platform ||
        profile.voiceName !== selectedVoiceProfile.voiceName ||
        profile.voiceURI !== selectedVoiceProfile.voiceURI ||
        normalizeLocale(profile.locale) !== normalizeLocale(selectedVoiceProfile.locale)) {
      reasons.push("voice-profile-mismatch");
    }
    if (profile.testStatus !== "passed" || !hasStructuredVoiceEvidence(profile.testEvidence)) {
      reasons.push("voice-test-not-passed-or-evidenced");
    }
  }
  if (!isObject(entry.activation) ||
      entry.activation.enabled !== true ||
      entry.activation.lookupEnabled !== true) {
    reasons.push("lexicon-lookup-not-enabled");
  }
  if (!isObject(entry.speechApplication) || entry.speechApplication.enabled !== true) {
    reasons.push("speech-application-not-authorized");
  }
  if (!["exact", "contextual-exact"].includes(entry.matchType)) reasons.push("unsupported-match-type");
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.term) ||
      !DEVANAGARI_TOKEN.test(normalizeTextToken(entry.term))) {
    reasons.push("invalid-entry-identity");
  }
  if (!isObject(entry.documentSource) ||
      !isNonEmptyString(entry.documentSource.id) ||
      !isNonEmptyString(entry.documentSource.documentVersion) ||
      !isNonEmptyString(entry.documentVersion)) {
    reasons.push("document-source-or-version-missing");
  }
  if (!["general", "shakha-specific"].includes(entry.scope) ||
      !isObject(entry.context) || entry.context.scope !== entry.scope) {
    reasons.push("invalid-context-scope");
  }
  if (entry.scope === "general" && entry.context && entry.context.shakha !== null) {
    reasons.push("general-entry-has-shakha");
  }
  if (entry.scope === "shakha-specific" && !isNonEmptyString(entry.context && entry.context.shakha)) {
    reasons.push("shakha-specific-entry-missing-shakha");
  }
  return { ready: reasons.length === 0, reasons };
}

function sequenceMatches(tokens, sequence, startIndex) {
  if (!Array.isArray(sequence) || !sequence.length ||
      startIndex < 0 || startIndex + sequence.length > tokens.length) return false;
  return sequence.every((word, offset) =>
    tokens[startIndex + offset].normalized === normalizeTextToken(word)
  );
}

function contextMatches(entry, match, originalText, options) {
  const context = entry.context || {};
  const tokens = tokenizeWithOffsets(originalText);
  const startIndex = tokens.findIndex(token => token.startUtf16Index === match.startUtf16Index);
  const endIndex = tokens.findIndex(token => token.endUtf16Index === match.endUtf16Index);
  if (startIndex < 0 || endIndex < startIndex) return false;

  const sequence = entry.matchType === "contextual-exact" ? context.requiredSequence : [entry.term];
  if (!Array.isArray(sequence) || !sequence.length ||
      endIndex - startIndex + 1 !== sequence.length ||
      !sequenceMatches(tokens, sequence, startIndex)) return false;

  const termIndex = tokens.findIndex(token =>
    token.startUtf16Index === match.termStartUtf16Index &&
    token.endUtf16Index === match.termEndUtf16Index
  );
  if (termIndex < startIndex || termIndex > endIndex ||
      tokens[termIndex].normalized !== normalizeTextToken(entry.term)) return false;

  if (entry.matchType === "exact" && (startIndex !== termIndex || endIndex !== termIndex)) return false;
  if (entry.matchType === "contextual-exact") {
    if (!Array.isArray(context.requiredSequence) ||
        context.requiredSequence.filter(word => normalizeTextToken(word) === normalizeTextToken(entry.term)).length !== 1 ||
        termIndex !== startIndex + context.requiredSequence.findIndex(word => normalizeTextToken(word) === normalizeTextToken(entry.term))) {
      return false;
    }
  }

  const selectedContext = isObject(options.context) ? options.context : {};
  const requestedShakha = normalizeShakha(options.shakha || selectedContext.shakha);
  const requiredShakha = normalizeShakha(context.shakha);
  if (entry.scope === "shakha-specific" && (!requestedShakha || requestedShakha !== requiredShakha)) return false;

  const requestedPatha = options.patha || selectedContext.patha || "";
  if (context.patha && requestedPatha !== context.patha) return false;

  const preceding = Array.isArray(context.precedingWords) ? context.precedingWords : [];
  const following = Array.isArray(context.followingWords) ? context.followingWords : [];
  if (preceding.length && !sequenceMatches(tokens, preceding, startIndex - preceding.length)) return false;
  if (following.length && !sequenceMatches(tokens, following, endIndex + 1)) return false;

  const requestedSequence = selectedContext.requiredSequence || options.requiredSequence;
  if (Array.isArray(requestedSequence) &&
      JSON.stringify(requestedSequence.map(normalizeTextToken)) !== JSON.stringify(sequence.map(normalizeTextToken))) return false;

  return true;
}

function buildSourceMap(originalText, replacements) {
  const sourceMap = [];
  let sourceCursor = 0;
  let outputCursor = 0;
  let speechText = "";

  function appendCopy(start, end) {
    if (end <= start) return;
    const text = originalText.slice(start, end);
    const outputStartCodePoint = countCodePoints(speechText);
    sourceMap.push({
      kind: "copy",
      sourceStartUtf16: start,
      sourceEndUtf16: end,
      sourceStartCodePoint: codePointOffset(originalText, start),
      sourceEndCodePoint: codePointOffset(originalText, end),
      outputStartUtf16: outputCursor,
      outputEndUtf16: outputCursor + text.length,
      outputStartCodePoint,
      outputEndCodePoint: outputStartCodePoint + countCodePoints(text),
      sourceText: text,
      outputText: text
    });
    speechText += text;
    outputCursor += text.length;
  }

  for (const replacement of replacements) {
    appendCopy(sourceCursor, replacement.startUtf16);
    const outputText = replacement.entry.nativeSpeechText.trim();
    const sourceText = originalText.slice(replacement.startUtf16, replacement.endUtf16);
    const outputStartCodePoint = countCodePoints(speechText);
    sourceMap.push({
      kind: "replace",
      ruleId: replacement.ruleId,
      entryId: replacement.entry.id,
      sourceStartUtf16: replacement.startUtf16,
      sourceEndUtf16: replacement.endUtf16,
      sourceStartCodePoint: codePointOffset(originalText, replacement.startUtf16),
      sourceEndCodePoint: codePointOffset(originalText, replacement.endUtf16),
      outputStartUtf16: outputCursor,
      outputEndUtf16: outputCursor + outputText.length,
      outputStartCodePoint,
      outputEndCodePoint: outputStartCodePoint + countCodePoints(outputText),
      sourceText,
      outputText,
      source: replacement.entry.source,
      documentSource: replacement.entry.documentSource,
      documentVersion: replacement.entry.documentVersion
    });
    speechText += outputText;
    outputCursor += outputText.length;
    sourceCursor = replacement.endUtf16;
  }
  appendCopy(sourceCursor, originalText.length);
  return { speechText, sourceMap: deepFreeze(sourceMap) };
}

function fallbackResult(originalText, warnings, analysis = null) {
  const mapped = buildSourceMap(originalText, []);
  return deepFreeze({
    originalText,
    speechText: originalText,
    modified: false,
    confidence: warnings.some(item => item.severity === "ambiguous") ? "ambiguous" : "fallback",
    matchedLexiconEntries: [],
    appliedRules: [],
    warnings,
    sourceMap: mapped.sourceMap,
    compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
    analysisSummary: analysis ? {
      originalTextPreserved: analysis.originalTextPreserved === true,
      orthographicUnitCount: analysis.phoneticStructure && Array.isArray(analysis.phoneticStructure.orthographicUnits)
        ? analysis.phoneticStructure.orthographicUnits.length : 0
    } : null
  });
}

function normalizeCompileRequest(input, options) {
  if (typeof input === "string") {
    if (!isObject(options)) throw new SanskritPronunciationCompilerError("Compiler options object होना चाहिए।", "INVALID_COMPILER_OPTIONS");
    return { ...options, originalText: input };
  }
  if (!isObject(input)) throw new SanskritPronunciationCompilerError("Compiler input object या मूल text string होना चाहिए।", "INVALID_COMPILER_INPUT");
  return input;
}

export function validateCompiledSpeech(compiled) {
  const errors = [];
  if (!isObject(compiled)) return deepFreeze({ valid: false, errors: ["compiled-result-must-be-an-object"] });
  if (typeof compiled.originalText !== "string" || typeof compiled.speechText !== "string") {
    errors.push("originalText-and-speechText-must-be-strings");
  }
  if (typeof compiled.modified !== "boolean") errors.push("modified-must-be-boolean");
  if (!CONFIDENCE_STATES.has(compiled.confidence)) errors.push("invalid-confidence-state");
  if (!Array.isArray(compiled.matchedLexiconEntries)) errors.push("matchedLexiconEntries-must-be-an-array");
  if (!Array.isArray(compiled.appliedRules)) errors.push("appliedRules-must-be-an-array");
  if (!Array.isArray(compiled.warnings)) errors.push("warnings-must-be-an-array");
  if (!Array.isArray(compiled.sourceMap)) errors.push("sourceMap-must-be-an-array");
  if (compiled.compilerVersion !== SANSKRIT_PRONUNCIATION_COMPILER_VERSION) errors.push("compiler-version-mismatch");

  if (typeof compiled.originalText === "string" && typeof compiled.speechText === "string" &&
      Array.isArray(compiled.sourceMap)) {
    if (compiled.modified !== (compiled.originalText !== compiled.speechText)) errors.push("modified-flag-does-not-match-text");
    if (compiled.confidence === "fallback" && compiled.modified) errors.push("fallback-must-preserve-original-text");
    let sourceCursor = 0;
    let outputCursor = 0;
    let outputCodePointCursor = 0;
    let replacementCount = 0;

    for (const segment of compiled.sourceMap) {
      if (!isObject(segment)) {
        errors.push("source-map-segment-must-be-an-object");
        break;
      }
      if (!["copy", "replace"].includes(segment.kind)) errors.push("source-map-segment-kind-invalid");
      if (segment.sourceStartUtf16 !== sourceCursor ||
          !Number.isInteger(segment.sourceEndUtf16) ||
          segment.sourceEndUtf16 < segment.sourceStartUtf16) errors.push("source-map-source-range-not-contiguous");
      if (segment.outputStartUtf16 !== outputCursor ||
          !Number.isInteger(segment.outputEndUtf16) ||
          segment.outputEndUtf16 < segment.outputStartUtf16) errors.push("source-map-output-range-not-contiguous");

      const sourceText = compiled.originalText.slice(segment.sourceStartUtf16, segment.sourceEndUtf16);
      const outputText = compiled.speechText.slice(segment.outputStartUtf16, segment.outputEndUtf16);
      if (sourceText !== segment.sourceText || outputText !== segment.outputText) errors.push("source-map-text-does-not-match-ranges");
      if (segment.kind === "copy" && sourceText !== outputText) errors.push("copy-segment-changed-source-text");
      if (segment.outputStartCodePoint !== outputCodePointCursor ||
          segment.outputEndCodePoint !== outputCodePointCursor + countCodePoints(outputText)) {
        errors.push("source-map-code-point-output-offset-invalid");
      }

      if (segment.kind === "replace") {
        replacementCount += 1;
        if (!isNonEmptyString(segment.ruleId) || !isNonEmptyString(segment.entryId) ||
            !isObject(segment.source) || !isObject(segment.documentSource) ||
            !isNonEmptyString(segment.documentVersion)) errors.push("replacement-provenance-incomplete");
        if (!DEVANAGARI_TOKEN.test(outputText) || /\s/u.test(outputText)) errors.push("replacement-output-is-not-a-single-devanagari-token");
      }

      sourceCursor = segment.sourceEndUtf16;
      outputCursor = segment.outputEndUtf16;
      outputCodePointCursor += countCodePoints(outputText);
    }
    if (sourceCursor !== compiled.originalText.length) errors.push("source-map-does-not-cover-original-text");
    if (outputCursor !== compiled.speechText.length) errors.push("source-map-does-not-cover-speech-text");
    if (replacementCount !== compiled.appliedRules.length) errors.push("applied-rules-and-source-map-count-mismatch");
    if (compiled.confidence === "fallback" && compiled.modified) errors.push("modified-text-cannot-have-fallback-confidence");
  }

  return deepFreeze({ valid: errors.length === 0, errors });
}

export function compileSanskritSpeech(input, options = {}) {
  const request = normalizeCompileRequest(input, options);
  const originalText = request.originalText;
  if (typeof originalText !== "string") {
    throw new SanskritPronunciationCompilerError("originalText string आवश्यक है।", "ORIGINAL_TEXT_REQUIRED");
  }
  if (originalText.length > MAX_TEXT_LENGTH) {
    return fallbackResult(originalText, [
      makeWarning("TEXT_LENGTH_LIMIT_EXCEEDED", "मूल पाठ निर्धारित Compiler सीमा से बड़ा है; मूल पाठ सुरक्षित रखा गया।", "warning")
    ]);
  }

  const warnings = [];
  try {
    const shakha = request.shakha || (isObject(request.context) ? request.context.shakha : null) || null;
    const analyzer = isObject(request.analyzer) ? request.analyzer : {};
    const runAnalysis = typeof analyzer.analyzeVedicText === "function" ? analyzer.analyzeVedicText : analyzeVedicText;
    const runCandidateAnalysis = typeof analyzer.analyzePronunciationCandidates === "function"
      ? analyzer.analyzePronunciationCandidates : analyzePronunciationCandidates;

    const analysis = request.analysis || runAnalysis(originalText, { shakha });
    if (!isObject(analysis) || analysis.originalText !== originalText ||
        analysis.originalTextPreserved !== true || !isObject(analysis.phoneticStructure) ||
        analysis.phoneticStructure.originalText !== originalText ||
        !Array.isArray(analysis.phoneticStructure.orthographicUnits)) {
      return fallbackResult(originalText, [
        makeWarning("ANALYZER_RESULT_INVALID", "Analyzer का Structured Phonetic Result मूल पाठ से मेल नहीं खाता; कोई परिवर्तन लागू नहीं किया गया।", "warning")
      ], analysis);
    }

    if (Array.isArray(analysis.unclassifiedMarks) && analysis.unclassifiedMarks.length) {
      warnings.push(makeWarning("UNCLASSIFIED_MARKS_PRESERVED", "अज्ञात लिपि/संयोजन चिह्न यथावत रखे गए; उनसे जुड़े शब्दों पर अनुमानित परिवर्तन लागू नहीं होगा।", "ambiguous", {
        count: analysis.unclassifiedMarks.length
      }));
    }
    if ((Array.isArray(analysis.accentMarks) && analysis.accentMarks.length) ||
        (Array.isArray(analysis.vedicMarks) && analysis.vedicMarks.length) ||
        analysis.hasVedicExtensions === true || analysis.hasSamavedaExtended === true) {
      warnings.push(makeWarning("VEDIC_MARKS_PRESERVED", "वैदिक स्वराघात/विशेष चिह्न यथावत रखे गए; Compiler उनके लिए स्वराघात उत्पन्न या परिवर्तित नहीं करता।", "ambiguous"));
    }

    const adapter = request.adapter || request.knowledgeAdapter;
    if (!isObject(adapter) || typeof adapter.getPronunciationEntries !== "function") {
      warnings.push(makeWarning("PRONUNCIATION_ADAPTER_UNAVAILABLE", "सत्यापित Pronunciation Lexicon उपलब्ध नहीं है; Native TTS को मूल पाठ दिया जाएगा।", "warning"));
      return fallbackResult(originalText, warnings, analysis);
    }

    const voiceResult = resolveVoiceProfile(request.voice || request.selectedVoice, request.voiceProfile || {});
    if (!voiceResult.valid) {
      warnings.push(makeWarning(voiceResult.code, voiceResult.message, "warning", voiceResult.details || null));
      return fallbackResult(originalText, warnings, analysis);
    }
    const selectedVoiceProfile = voiceResult.profile;
    const pronunciationOptions = {
      voiceLocale: selectedVoiceProfile.locale,
      voiceProfile: {
        engine: selectedVoiceProfile.engine,
        platform: selectedVoiceProfile.platform,
        voiceName: selectedVoiceProfile.voiceName,
        voiceURI: selectedVoiceProfile.voiceURI
      },
      shakha,
      patha: request.patha || (isObject(request.context) ? request.context.patha : null) || null,
      context: request.context || {}
    };

    const requestedShakha = pronunciationOptions.shakha;
    const shakhaQueries = requestedShakha
      ? Array.from(new Set([
          requestedShakha,
          normalizeShakha(requestedShakha),
          normalizeShakha(requestedShakha) === "rigveda-shakala" ? "shaakala" : requestedShakha,
          normalizeShakha(requestedShakha) === "rigveda-shakala" ? "shakala" : requestedShakha
        ]))
      : [null];
    const candidateMap = new Map();
    for (const queryShakha of shakhaQueries) {
      const queryOptions = { ...pronunciationOptions, shakha: queryShakha || undefined };
      const batch = adapter.getPronunciationEntries(originalText, queryOptions);
      if (!Array.isArray(batch)) {
        warnings.push(makeWarning("LEXICON_RESULT_INVALID", "Adapter ने वैध Pronunciation Entry सूची नहीं दी; मूल पाठ सुरक्षित रखा गया।", "warning"));
        return fallbackResult(originalText, warnings, analysis);
      }
      for (const entry of batch) {
        if (isObject(entry) && isNonEmptyString(entry.id) && !candidateMap.has(entry.id)) {
          candidateMap.set(entry.id, entry);
        }
      }
    }
    const candidates = Array.from(candidateMap.values());
    if (!candidates.length) {
      warnings.push(makeWarning("NO_VERIFIED_LEXICON_MATCH", "चयनित Voice और Context के लिए कोई सत्यापित Pronunciation Entry उपलब्ध नहीं है; Native TTS Fallback लागू है।", "warning"));
      return fallbackResult(originalText, warnings, analysis);
    }

    const candidateAnalysis = runCandidateAnalysis(originalText, candidates, { shakha });
    if (!isObject(candidateAnalysis) || candidateAnalysis.originalText !== originalText ||
        candidateAnalysis.speechText !== originalText || candidateAnalysis.speechTextModified !== false ||
        !Array.isArray(candidateAnalysis.matches)) {
      warnings.push(makeWarning("CANDIDATE_ANALYSIS_INVALID", "Pronunciation Analyzer का candidate result अमान्य है; मूल पाठ सुरक्षित रखा गया।", "warning"));
      return fallbackResult(originalText, warnings, analysis);
    }

    const adapterDiagnostics = typeof adapter.getDiagnostics === "function" ? adapter.getDiagnostics() : null;
    const tokens = tokenizeWithOffsets(originalText);
    const tokenSet = new Set(tokens.map(token => token.normalized));
    const blockedTerms = new Set();
    if (isObject(adapterDiagnostics) && isObject(adapterDiagnostics.indexDiagnostics)) {
      const groups = [
        ...(Array.isArray(adapterDiagnostics.indexDiagnostics.pronunciationConflictGroups)
          ? adapterDiagnostics.indexDiagnostics.pronunciationConflictGroups : []),
        ...(Array.isArray(adapterDiagnostics.indexDiagnostics.pronunciationDuplicateGroups)
          ? adapterDiagnostics.indexDiagnostics.pronunciationDuplicateGroups : [])
      ];
      for (const group of groups) {
        if (isObject(group) && isNonEmptyString(group.term) && tokenSet.has(normalizeTextToken(group.term))) {
          blockedTerms.add(normalizeTextToken(group.term));
          warnings.push(makeWarning(
            group.kind === "conflict" ? "LEXICON_PRONUNCIATION_CONFLICT" : "LEXICON_DUPLICATE_IDENTITY",
            "इस शब्द की Lexicon Entries में duplicate या परस्पर-विरोधी उच्चारण मिले; इस शब्द पर परिवर्तन रोक दिया गया।",
            "ambiguous",
            { term: group.term, entryIds: group.entryIds || [] }
          ));
        }
      }
    }

    if (candidateAnalysis.conflicts && candidateAnalysis.conflicts.length) {
      warnings.push(makeWarning("CANDIDATE_MATCH_CONFLICT", "एक से अधिक Lexicon matches एक ही पाठ-क्षेत्र पर लागू हो रहे हैं; अस्पष्टता दूर होने तक कोई candidate परिवर्तन लागू नहीं होगा।", "ambiguous", {
        conflicts: candidateAnalysis.conflicts
      }));
    }
    if (candidateAnalysis.contextRequired && candidateAnalysis.contextRequired.length) {
      warnings.push(makeWarning("EXPLICIT_SHAKHA_REQUIRED", "शाखा-विशिष्ट उच्चारण के लिए स्पष्ट Shakha Context आवश्यक है।", "ambiguous", {
        entries: candidateAnalysis.contextRequired
      }));
    }
    if (candidateAnalysis.rejected && candidateAnalysis.rejected.length) {
      warnings.push(makeWarning("CANDIDATE_REJECTED", "एक या अधिक Pronunciation candidates की पहचान/Context अमान्य होने से उन्हें निष्क्रिय रखा गया।", "ambiguous", {
        entries: candidateAnalysis.rejected
      }));
    }
    if (candidateAnalysis.inactive && candidateAnalysis.inactive.length) {
      warnings.push(makeWarning("CANDIDATE_INACTIVE", "एक या अधिक Pronunciation candidates सक्रिय समीक्षा/lookup स्थिति में नहीं हैं।", "warning", {
        entries: candidateAnalysis.inactive
      }));
    }

    const candidateById = new Map();
    candidates.forEach(entry => {
      if (isObject(entry) && isNonEmptyString(entry.id) && !candidateById.has(entry.id)) candidateById.set(entry.id, entry);
    });

    const eligibleMatches = [];
    const matchedLexiconEntries = [];
    for (const match of candidateAnalysis.matches) {
      const entry = candidateById.get(match.id);
      if (!entry) {
        warnings.push(makeWarning("MATCHED_ENTRY_NOT_FOUND", "Analyzer का matched entry Adapter सूची में नहीं मिला।", "ambiguous", { entryId: match.id || null }));
        continue;
      }
      if (blockedTerms.has(normalizeTextToken(entry.term))) continue;

      const readiness = validateLexiconEntryForSpeech(entry, selectedVoiceProfile);
      if (!readiness.ready) {
        warnings.push(makeWarning("LEXICON_ENTRY_NOT_COMPILER_READY", "Lexicon Entry सभी समीक्षा, स्रोत, ध्वन्यात्मक और Voice परीक्षण शर्तें पूरी नहीं करती; मूल शब्द सुरक्षित रखा गया।", "warning", {
          entryId: entry.id,
          reasons: readiness.reasons
        }));
        continue;
      }
      if (!contextMatches(entry, match, originalText, request)) {
        warnings.push(makeWarning("LEXICON_CONTEXT_MISMATCH", "Exact Word, Context, Shakha या Patha का पूरा मिलान नहीं हुआ; संबंधित शब्द अपरिवर्तित रखा गया।", "ambiguous", {
          entryId: entry.id,
          term: entry.term
        }));
        continue;
      }
      if (!Number.isInteger(match.termStartUtf16Index) || !Number.isInteger(match.termEndUtf16Index) ||
          match.termStartUtf16Index < 0 || match.termEndUtf16Index <= match.termStartUtf16Index ||
          match.termEndUtf16Index > originalText.length) {
        warnings.push(makeWarning("MATCH_OFFSETS_INVALID", "Analyzer ने सुरक्षित source offsets नहीं दिए; संबंधित परिवर्तन अस्वीकार किया गया।", "ambiguous", {
          entryId: entry.id
        }));
        continue;
      }
      const sourceTerm = originalText.slice(match.termStartUtf16Index, match.termEndUtf16Index);
      if (normalizeTextToken(sourceTerm) !== normalizeTextToken(entry.term)) {
        warnings.push(makeWarning("SOURCE_TERM_MISMATCH", "Analyzer का exact source term Lexicon term से मेल नहीं खाता; परिवर्तन अस्वीकार किया गया।", "ambiguous", {
          entryId: entry.id
        }));
        continue;
      }

      const ruleId = "lexicon:" + entry.id + ":" + match.termStartUtf16Index;
      const record = {
        entry,
        match,
        ruleId,
        startUtf16: match.termStartUtf16Index,
        endUtf16: match.termEndUtf16Index
      };
      eligibleMatches.push(record);
      matchedLexiconEntries.push(deepFreeze({
        id: entry.id,
        term: entry.term,
        matchType: entry.matchType,
        source: entry.source,
        documentSource: entry.documentSource,
        documentVersion: entry.documentVersion,
        voiceProfile: entry.voiceProfile,
        sourceStartUtf16: record.startUtf16,
        sourceEndUtf16: record.endUtf16,
        applied: entry.nativeSpeechText.trim() !== sourceTerm
      }));
    }

    if (candidateAnalysis.conflicts && candidateAnalysis.conflicts.length) {
      eligibleMatches.length = 0;
      matchedLexiconEntries.length = 0;
    }

    eligibleMatches.sort((left, right) => left.startUtf16 - right.startUtf16);
    const nonOverlapping = [];
    let previousEnd = -1;
    for (const item of eligibleMatches) {
      if (item.startUtf16 < previousEnd) {
        warnings.push(makeWarning("OVERLAPPING_REPLACEMENT_BLOCKED", "परस्पर overlapping replacement रोक दिया गया।", "ambiguous", {
          entryId: item.entry.id,
          sourceStartUtf16: item.startUtf16
        }));
        continue;
      }
      previousEnd = item.endUtf16;
      nonOverlapping.push(item);
    }

    const replacements = nonOverlapping.filter(item =>
      item.entry.nativeSpeechText.trim() !== originalText.slice(item.startUtf16, item.endUtf16)
    );
    const mapped = buildSourceMap(originalText, replacements);
    const appliedRules = replacements.map(item => deepFreeze({
      ruleId: item.ruleId,
      entryId: item.entry.id,
      term: item.entry.term,
      matchType: item.entry.matchType,
      originalForm: originalText.slice(item.startUtf16, item.endUtf16),
      nativeSpeechText: item.entry.nativeSpeechText.trim(),
      source: item.entry.source,
      documentSource: item.entry.documentSource,
      documentVersion: item.entry.documentVersion,
      voiceProfile: item.entry.voiceProfile,
      sourceStartUtf16: item.startUtf16,
      sourceEndUtf16: item.endUtf16
    }));

    if (!matchedLexiconEntries.length && !warnings.length) {
      warnings.push(makeWarning("NO_APPLICABLE_PRONUNCIATION_RULE", "इस पाठ के लिए कोई लागू और सत्यापित Pronunciation Rule नहीं मिला; Native TTS Fallback लागू है।", "warning"));
    }
    if (!matchedLexiconEntries.length && candidateAnalysis.matches.length) {
      warnings.push(makeWarning("ALL_MATCHES_REJECTED", "सभी matched entries Compiler की स्वतंत्र सत्यापन शर्तों पर अस्वीकृत हुईं; मूल पाठ सुरक्षित है।", "warning"));
    }

    const ambiguous = warnings.some(item => item.severity === "ambiguous");
    const confidence = ambiguous ? "ambiguous" : (matchedLexiconEntries.length ? "verified" : "fallback");
    const compiled = deepFreeze({
      originalText,
      speechText: mapped.speechText,
      modified: mapped.speechText !== originalText,
      confidence,
      matchedLexiconEntries,
      appliedRules,
      warnings,
      sourceMap: mapped.sourceMap,
      compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
      improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
      analysisSummary: {
        originalTextPreserved: analysis.originalTextPreserved,
        orthographicUnitCount: analysis.phoneticStructure.orthographicUnits.length,
        phonemeSequenceInferredByAnalyzer: false,
        lexiconPhoneticsRequired: true
      }
    });

    const validation = validateCompiledSpeech(compiled);
    if (!validation.valid) {
      return fallbackResult(originalText, [
        ...warnings,
        makeWarning("COMPILED_OUTPUT_VALIDATION_FAILED", "अंतिम Speech Text या Source Mapping validation विफल हुई; मूल पाठ वापस किया गया।", "warning", {
          errors: validation.errors
        })
      ], analysis);
    }
    return compiled;
  } catch (error) {
    return fallbackResult(originalText, [
      ...warnings,
      makeWarning(
        error && error.code ? error.code : "COMPILER_INTERNAL_ERROR",
        error && error.message ? error.message : "Compiler त्रुटि हुई; मूल पाठ सुरक्षित रखा गया।",
        "warning"
      )
    ]);
  }
}

export function getCompilerDiagnostics(compiledSpeech = null) {
  const validation = compiledSpeech === null ? null : validateCompiledSpeech(compiledSpeech);
  return deepFreeze({
    compiler: "sanskrit-pronunciation-compiler",
    version: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
    analyzer: "vedic-sanskrit-pronunciation",
    adapterContract: "getPronunciationEntries(text, options)",
    confidenceStates: ["verified", "fallback", "ambiguous"],
    policy: {
      originalTextPreservedOnError: true,
      onlyReviewedEntries: true,
      primarySourceRequired: true,
      verifiedPhoneticStructureRequired: true,
      testedNativeVoiceRequired: true,
      exactAndContextualMatchingOnly: true,
      guidanceParagraphToSpeech: false,
      ipaToNativeSpeech: false,
      preservePunctuation: true,
      preserveWordBoundaries: true,
      preserveUnmatchedConjuncts: true,
      networkAccess: false,
      indexedDbAccess: false,
      domAccess: false,
      dynamicCodeExecution: false
    },
    outputValidation: validation
  });
}

function fixtureEntry(overrides = {}) {
  return {
    id: "agni-verified",
    term: "अग्निः",
    matchType: "exact",
    phoneticStructure: {
      status: "verified",
      orthographicUnits: ["अ", "ग्नि", "ः"],
      phonemeSequence: ["a", "g", "n", "i", "h"],
      syllableBoundaries: [0, 1, 2]
    },
    phonemeReference: { system: "IPA", value: "ˈɐɡ.nɪ", status: "verified", source: "test reference" },
    ipa: "ˈɐɡ.nɪ",
    nativeSpeechText: "अग्नि",
    voiceLocales: ["hi-IN"],
    voiceProfile: {
      engine: NATIVE_TTS_ENGINE,
      platform: "Android Chrome",
      voiceName: "Test Female",
      voiceURI: "test://hi-IN/female",
      locale: "hi-IN",
      testStatus: "passed",
      testEvidence: {
        testDate: "2026-11-08",
        testPhrase: "अग्निः",
        observedResult: "accepted",
        reviewer: "compiler-self-test"
      },
      testedAt: "2026-11-08"
    },
    context: {
      scope: "general",
      shakha: null,
      patha: null,
      requiredSequence: null,
      precedingWords: [],
      followingWords: [],
      notes: "self-test"
    },
    scope: "general",
    source: {
      type: "primary-source",
      documentId: "fixture-source",
      documentVersion: "1.0.0",
      entryId: "agni-source",
      reportedReference: null,
      primarySourceVerified: true,
      sourceReviewStatus: "reviewed",
      primarySource: {
        textName: "Test Veda",
        section: "1.1",
        verse: "1",
        citation: "Test Veda 1.1.1"
      }
    },
    documentVersion: "1.0.1",
    documentSource: {
      id: "fixture-lexicon",
      title: "Fixture Lexicon",
      documentVersion: "1.0.1",
      sha256: "a".repeat(64),
      catalogVersion: "test"
    },
    documentPolicy: {
      requiredEngine: NATIVE_TTS_ENGINE,
      targetPlatform: "Android Chrome"
    },
    reviewStatus: "reviewed",
    activation: {
      enabled: true,
      lookupEnabled: true,
      analysisEnabled: true,
      reviewEnabled: true
    },
    speechApplication: { enabled: true, status: "verified" },
    ...overrides
  };
}

function createFixtureAdapter(entries) {
  return {
    getPronunciationEntries() {
      return entries;
    },
    getDiagnostics() {
      return { indexDiagnostics: { pronunciationConflictGroups: [], pronunciationDuplicateGroups: [] } };
    }
  };
}

export function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  const voice = {
    name: "Test Female",
    voiceURI: "test://hi-IN/female",
    lang: "hi-IN",
    localService: true
  };
  const voiceProfile = { engine: NATIVE_TTS_ENGINE, platform: "Android Chrome" };
  const compile = (text, entries, extra = {}) => compileSanskritSpeech({
    originalText: text,
    adapter: createFixtureAdapter(entries),
    voice,
    voiceProfile,
    ...extra
  });

  try {
    const exact = compile("ॐ अग्निः, नमः!", [fixtureEntry()]);
    check("exact-word-replacement", exact.speechText === "ॐ अग्नि, नमः!" && exact.modified);
    check("punctuation-preserved", exact.speechText.endsWith(", नमः!") && exact.sourceMap.some(segment => segment.kind === "copy" && segment.sourceText.includes(", नमः!")));
    check("reviewed-entry-confidence", exact.confidence === "verified");
    check("source-provenance-retained", exact.appliedRules.length === 1 && exact.appliedRules[0].source.primarySourceVerified === true && exact.appliedRules[0].documentVersion === "1.0.1");
    check("source-map-valid", validateCompiledSpeech(exact).valid);

    const substring = compile("भुजङ्गतुङ्ग", [fixtureEntry({ term: "भुजङ्ग", nativeSpeechText: "भुजङ्गः" })]);
    check("exact-token-does-not-match-substring", substring.speechText === "भुजङ्गतुङ्ग" && !substring.modified);

    const unreviewed = compile("अग्निः", [fixtureEntry({ reviewStatus: "needs-review" })]);
    check("unreviewed-entry-rejected", unreviewed.speechText === "अग्निः" && !unreviewed.modified && unreviewed.confidence === "fallback");

    const unsupportedVoice = compile("अग्निः", [fixtureEntry()], { voice: null });
    check("missing-voice-safe-fallback", unsupportedVoice.speechText === "अग्निः" && unsupportedVoice.warnings.some(item => item.code === "NATIVE_VOICE_MISSING"));

    const voiceMismatch = compile("अग्निः", [fixtureEntry({ voiceProfile: { ...fixtureEntry().voiceProfile, voiceURI: "test://another-voice" } })]);
    check("voice-profile-mismatch-rejected", voiceMismatch.speechText === "अग्निः" && !voiceMismatch.modified);

    const contextualEntry = fixtureEntry({
      id: "sadashivam-context",
      term: "सदाशिवं",
      matchType: "contextual-exact",
      nativeSpeechText: "सदाशिवम्",
      context: {
        scope: "general",
        shakha: null,
        patha: null,
        requiredSequence: ["सदाशिवं", "भजे"],
        precedingWords: [],
        followingWords: [],
        notes: "contextual self-test"
      }
    });
    const contextual = compile("सदाशिवं भजे।", [contextualEntry]);
    check("contextual-sequence-replaces-term-only", contextual.speechText === "सदाशिवम् भजे।" && contextual.modified);

    const wrongContext = compile("सदाशिवं नमः।", [contextualEntry]);
    check("contextual-mismatch-fallback", wrongContext.speechText === "सदाशिवं नमः।" && !wrongContext.modified);

    const branchEntry = fixtureEntry({
      id: "shakha-entry",
      scope: "shakha-specific",
      context: {
        scope: "shakha-specific",
        shakha: "shaakala",
        patha: null,
        requiredSequence: null,
        precedingWords: [],
        followingWords: [],
        notes: "branch self-test"
      }
    });
    const missingShakha = compile("अग्निः", [branchEntry]);
    check("shakha-requires-explicit-context", missingShakha.speechText === "अग्निः" && !missingShakha.modified);
    const selectedShakha = compile("अग्निः", [branchEntry], { shakha: "rigveda-shakala" });
    check("shakha-alias-matches-explicitly", selectedShakha.speechText === "अग्नि" && selectedShakha.modified);

    const conflict = compile("अग्निः", [
      fixtureEntry(),
      fixtureEntry({ id: "agni-alternative", nativeSpeechText: "अग्निः" })
    ]);
    check("ambiguous-overlap-blocked", conflict.speechText === "अग्निः" && !conflict.modified && conflict.confidence === "ambiguous");

    const invalidAnalysis = compile("अग्निः", [fixtureEntry()], {
      analysis: { originalText: "भिन्न", originalTextPreserved: true, phoneticStructure: { originalText: "भिन्न", orthographicUnits: [] } }
    });
    check("analysis-source-mismatch-fallback", invalidAnalysis.speechText === "अग्निः" && !invalidAnalysis.modified);

    const ipaResult = compile("अग्निः", [fixtureEntry({ ipa: "ˈɐɡ.nɪ", nativeSpeechText: "अग्नि" })]);
    check("ipa-is-not-native-speech-output", ipaResult.speechText === "अग्नि" && ipaResult.speechText !== "ˈɐɡ.nɪ");

    const malformedSource = compile("अग्निः", [fixtureEntry({
      source: { primarySourceVerified: false, sourceReviewStatus: "needs-review", primarySource: null }
    })]);
    check("unverified-source-rejected", malformedSource.speechText === "अग्निः" && !malformedSource.modified);

    const outputCorruption = validateCompiledSpeech({
      ...exact,
      sourceMap: [{ kind: "replace", sourceStartUtf16: 0, sourceEndUtf16: 1, outputStartUtf16: 0, outputEndUtf16: 1,
        sourceText: "X", outputText: "Y" }]
    });
    check("invalid-source-map-rejected", outputCorruption.valid === false);

    const identity = compile("अग्निः", [fixtureEntry({ nativeSpeechText: "अग्निः" })]);
    check("identity-reading-preserves-original", identity.speechText === "अग्निः" && !identity.modified && identity.confidence === "verified");

    const noLexicon = compile("अग्निः", []);
    check("missing-lexicon-fallback", noLexicon.speechText === "अग्निः" && noLexicon.confidence === "fallback");
    check("diagnostics-contract", getCompilerDiagnostics(exact).outputValidation.valid === true);
  } catch (_) {
    check("self-test-unexpected-exception", false);
  }

  const failed = checks.filter(item => !item.passed);
  return deepFreeze({
    module: "sanskrit-pronunciation-compiler",
    improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
    version: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    status: failed.length ? "FAILED" : "PASSED",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks
  });
}

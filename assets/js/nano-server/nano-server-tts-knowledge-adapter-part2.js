/* Swar-Sadhika — Nano Server TTS Knowledge Adapter Part 2.
 * Separates legacy guidance from the reviewed Structured Pronunciation Lexicon.
 * All document reads pass through the existing SHA-256-validating Knowledge API.
 * This module never guesses pronunciation from prose or executes downloaded code.
 */
export const NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION = "1.1.0";
export const SWR_TTS_ADAPTER_IMPROVEMENT_ID = "SWR-TTS-ADAPTER-03";
export const TTS_KNOWLEDGE_DOCUMENT_SCHEMA = "swar-sadhika.sanskrit-tts-knowledge";
export const TTS_PRONUNCIATION_LEXICON_SCHEMA = "swar-sadhika.sanskrit-pronunciation-lexicon";

const MAX_DOCUMENTS = 100;
const MAX_ENTRIES = 5000;
const ID = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
const DEVANAGARI = /^[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+$/u;
const WORDS_SOURCE = "[\\u0900-\\u097F\\uA8E0-\\uA8FF\\u{11B00}-\\u{11B0A}\\u{1CD0}-\\u{1CFA}]+";
const API_METHODS = ["initialize","getManifest","listEntries","readDocument"];
const LEXICON_FIELDS = ["id","term","matchType","phoneticStructure","phonemeReference","ipa","nativeSpeechText","voiceLocales","voiceProfile","context","scope","source","reviewStatus","activation","speechApplication"];
const REVIEW_STATUSES = new Set(["draft","needs-review","reviewed"]);
const PATHA_VALUES = new Set(["samhita","pada","krama","other"]);

export class NanoServerTtsKnowledgeAdapterError extends Error {
  constructor(message, code = "TTS_KNOWLEDGE_ADAPTER_ERROR", details = null) {
    super(message); this.name = "NanoServerTtsKnowledgeAdapterError"; this.code = code; this.details = details;
  }
}

function fail(message, code, details) { throw new NanoServerTtsKnowledgeAdapterError(message, code, details || null); }

function object(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!object(value)) return value;
  const copy = {}; Object.keys(value).forEach(key => { copy[key] = freeze(value[key]); }); return Object.freeze(copy);
}

function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }

function normalizeTerm(value) { return String(value || "").normalize("NFC").trim(); }

function normalizeLocale(value) { return typeof value === "string" ? value.trim().replace(/_/g, "-").toLowerCase() : ""; }

function validLocale(value) { return typeof value === "string" && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim()); }

function termKey(term, scope, shakha) { return term + "\u0000" + scope + "\u0000" + (shakha || ""); }

function validateApi(api) {
  if (!object(api)) fail("Nano Server Knowledge API object आवश्यक है।", "KNOWLEDGE_API_REQUIRED");
  const missing = API_METHODS.filter(name => typeof api[name] !== "function");
  if (missing.length) fail("Knowledge API contract अधूरा है: " + missing.join(", "), "KNOWLEDGE_API_CONTRACT_MISMATCH", { missing });
  return api;
}

function sourceMetadata(source, version) {
  return freeze({ id: source.id, title: source.title || source.id, documentVersion: version,
    sha256: source.sha256 || null, catalogVersion: source.catalogVersion || null });
}

function validateGuidanceDocument(doc, source) {
  if (!object(doc) || doc.schema !== TTS_KNOWLEDGE_DOCUMENT_SCHEMA || doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    fail("Knowledge JSON document का schema अमान्य है।", "INVALID_KNOWLEDGE_DOCUMENT", { sourceId: source.id });
  }
  if (doc.entries.length > MAX_ENTRIES) fail("Knowledge entries सीमा से अधिक हैं।", "KNOWLEDGE_ENTRY_LIMIT");
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  const language = typeof doc.language === "string" ? doc.language.trim() : "sa";
  if (!version || version.length > 40) fail("Knowledge document version अमान्य है।", "INVALID_KNOWLEDGE_VERSION");
  if (!/^sa(?:-|$)/i.test(language)) fail("केवल संस्कृत (sa) Knowledge document स्वीकार है।", "INVALID_KNOWLEDGE_LANGUAGE", { language });
  const ids = new Set(), keys = new Set();
  const entries = doc.entries.map((item, index) => {
    if (!object(item) || typeof item.id !== "string" || !ID.test(item.id)) fail("Knowledge entry ID अमान्य है।", "INVALID_KNOWLEDGE_ENTRY", { index });
    if (ids.has(item.id)) fail("Duplicate Knowledge entry ID है।", "DUPLICATE_KNOWLEDGE_ENTRY_ID", { entryId: item.id });
    ids.add(item.id);
    const term = normalizeTerm(item.term);
    const guidance = typeof item.guidance === "string" ? item.guidance.trim() : "";
    const scope = item.scope === undefined ? "general" : String(item.scope);
    const shakha = item.shakha == null ? "" : String(item.shakha).trim();
    const reviewStatus = item.reviewStatus === undefined ? "needs-review" : String(item.reviewStatus);
    if (!term || term.length > 128 || !DEVANAGARI.test(term)) fail("Knowledge term वैध देवनागरी शब्द होना चाहिए।", "INVALID_KNOWLEDGE_TERM", { entryId: item.id });
    if (!guidance || guidance.length > 1200) fail("Knowledge guidance रिक्त या बहुत लंबा है।", "INVALID_KNOWLEDGE_GUIDANCE", { entryId: item.id });
    if (!["general", "shakha-specific"].includes(scope) || (scope === "shakha-specific" && !shakha) || shakha.length > 64) {
      fail("Knowledge scope/shakha metadata अमान्य है।", "INVALID_KNOWLEDGE_SCOPE", { entryId: item.id });
    }
    if (!REVIEW_STATUSES.has(reviewStatus)) fail("reviewStatus अमान्य है।", "INVALID_REVIEW_STATUS", { entryId: item.id });
    const key = termKey(term, scope, shakha);
    if (keys.has(key)) fail("Duplicate term/scope/shakha entry है।", "DUPLICATE_KNOWLEDGE_TERM", { term, scope, shakha });
    keys.add(key);
    return freeze({ id: item.id, term, guidance, scope, shakha: shakha || null,
      category: typeof item.category === "string" ? item.category.slice(0, 64) : "pronunciation",
      reviewStatus, source: { id: source.id, title: source.title || source.id, documentVersion: version, sha256: source.sha256 || null } });
  });
  return freeze({ kind: "guidance", schema: doc.schema, schemaVersion: 1, version,
    language: language.slice(0, 16), entries, invalidEntries: [] });
}

function populatedArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item =>
    (typeof item === "string" && item.trim().length > 0) || (object(item) && Object.keys(item).length > 0));
}

function completePrimarySource(value) {
  if (!object(value)) return false;
  const pairs = Object.entries(value).filter(([, item]) =>
    (typeof item === "string" && item.trim()) || (typeof item === "number" && Number.isFinite(item)));
  const hasText = pairs.some(([key]) => /text|grantha|title|name|work|source/i.test(key));
  const hasLocator = pairs.some(([key]) => /chapter|section|verse|citation|locator|reference|passage/i.test(key));
  return pairs.length >= 2 && hasText && hasLocator;
}

function validateLexiconEntry(item, index, source, version, policy) {
  if (!object(item)) fail("Lexicon entry object अमान्य है।", "INVALID_LEXICON_ENTRY", { index });
  const missing = LEXICON_FIELDS.filter(key => !Object.prototype.hasOwnProperty.call(item, key));
  if (missing.length) fail("Lexicon entry में आवश्यक fields अनुपस्थित हैं।", "INVALID_LEXICON_ENTRY_FIELDS", { index, missing });
  if (typeof item.id !== "string" || !ID.test(item.id)) fail("Lexicon entry ID अमान्य है।", "INVALID_LEXICON_ENTRY_ID", { index });
  const term = normalizeTerm(item.term);
  if (!term || term.length > 256 || !DEVANAGARI.test(term)) fail("Lexicon term देवनागरी शब्द होना चाहिए।", "INVALID_LEXICON_TERM", { entryId: item.id });
  if (!["exact", "contextual-exact"].includes(item.matchType)) fail("Lexicon matchType अमान्य है।", "INVALID_LEXICON_MATCH_TYPE", { entryId: item.id });
  if (!object(item.phoneticStructure) ||
      !["pending-review", "needs-review", "verified", "invalid"].includes(item.phoneticStructure.status) ||
      !Array.isArray(item.phoneticStructure.orthographicUnits) ||
      !Array.isArray(item.phoneticStructure.phonemeSequence) ||
      !Array.isArray(item.phoneticStructure.syllableBoundaries)) {
    fail("Lexicon phoneticStructure schema अमान्य है।", "INVALID_PHONETIC_STRUCTURE", { entryId: item.id });
  }
  if (!object(item.phonemeReference) ||
      !["pending-review", "needs-review", "verified", "invalid"].includes(item.phonemeReference.status) ||
      !nonEmpty(item.phonemeReference.system) ||
      !(item.phonemeReference.value === null || typeof item.phonemeReference.value === "string")) {
    fail("Lexicon phonemeReference schema अमान्य है।", "INVALID_PHONEME_REFERENCE", { entryId: item.id });
  }
  if (!(item.ipa === null || typeof item.ipa === "string") ||
      !(item.nativeSpeechText === null || typeof item.nativeSpeechText === "string")) {
    fail("Lexicon IPA/nativeSpeechText प्रकार अमान्य है।", "INVALID_LEXICON_SPEECH_TEXT", { entryId: item.id });
  }
  if (!Array.isArray(item.voiceLocales) || item.voiceLocales.some(locale => !validLocale(locale))) {
    fail("Lexicon voiceLocales में अमान्य BCP-47 locale है।", "INVALID_VOICE_LOCALES", { entryId: item.id });
  }
  if (!object(item.voiceProfile)) fail("Lexicon voiceProfile object आवश्यक है।", "INVALID_VOICE_PROFILE", { entryId: item.id });
  const profile = item.voiceProfile;
  for (const key of ["engine", "platform", "voiceName", "voiceURI", "locale", "testStatus", "testedAt"]) {
    if (!(profile[key] === null || profile[key] === undefined || typeof profile[key] === "string")) {
      fail("Lexicon voiceProfile field अमान्य है।", "INVALID_VOICE_PROFILE", { entryId: item.id, field: key });
    }
  }
  if (profile.locale && !validLocale(profile.locale)) fail("voiceProfile.locale अमान्य है।", "INVALID_VOICE_PROFILE_LOCALE", { entryId: item.id });
  if (!["not-tested", "passed", "failed", "inconclusive"].includes(profile.testStatus)) {
    fail("voiceProfile.testStatus अमान्य है।", "INVALID_VOICE_TEST_STATUS", { entryId: item.id });
  }
  if (!(profile.testEvidence === null || object(profile.testEvidence) || typeof profile.testEvidence === "string")) {
    fail("voiceProfile.testEvidence अमान्य है।", "INVALID_VOICE_TEST_EVIDENCE", { entryId: item.id });
  }
  if (!object(item.context)) fail("Lexicon context object आवश्यक है।", "INVALID_LEXICON_CONTEXT", { entryId: item.id });
  const context = item.context, scope = item.scope;
  if (!["general", "shakha-specific"].includes(scope) || context.scope !== scope) {
    fail("Lexicon scope/context.scope असंगत है।", "INVALID_LEXICON_SCOPE", { entryId: item.id });
  }
  if (scope === "general" && context.shakha !== null) fail("General Lexicon entry में context.shakha null होना चाहिए।", "INVALID_LEXICON_SHAKHA", { entryId: item.id });
  if (scope === "shakha-specific" && !nonEmpty(context.shakha)) fail("Shakha-specific entry में Shakha आवश्यक है।", "INVALID_LEXICON_SHAKHA", { entryId: item.id });
  if (!(context.patha === null || PATHA_VALUES.has(context.patha))) fail("Lexicon context.patha अमान्य है।", "INVALID_LEXICON_PATHA", { entryId: item.id });
  if (!(context.requiredSequence === null || Array.isArray(context.requiredSequence))) fail("Lexicon requiredSequence अमान्य है।", "INVALID_LEXICON_SEQUENCE", { entryId: item.id });
  for (const key of ["precedingWords", "followingWords"]) {
    if (!Array.isArray(context[key]) || context[key].some(word => !DEVANAGARI.test(normalizeTerm(word)))) {
      fail("Lexicon context word sequence अमान्य है।", "INVALID_LEXICON_CONTEXT_WORDS", { entryId: item.id, field: key });
    }
  }
  if (item.matchType === "contextual-exact") {
    if (!Array.isArray(context.requiredSequence) || !context.requiredSequence.length ||
        context.requiredSequence.some(word => !DEVANAGARI.test(normalizeTerm(word))) ||
        context.requiredSequence.filter(word => normalizeTerm(word) === term).length !== 1) {
      fail("contextual-exact में requiredSequence के भीतर term ठीक एक बार होना चाहिए।", "INVALID_CONTEXTUAL_SEQUENCE", { entryId: item.id });
    }
  } else if (Array.isArray(context.requiredSequence) && context.requiredSequence.length) {
    fail("exact entry में requiredSequence नहीं होना चाहिए।", "INVALID_EXACT_SEQUENCE", { entryId: item.id });
  }
  if (!object(item.source) || !REVIEW_STATUSES.has(item.source.sourceReviewStatus || "needs-review") ||
      typeof item.source.primarySourceVerified !== "boolean") {
    fail("Lexicon source metadata अमान्य है।", "INVALID_LEXICON_SOURCE", { entryId: item.id });
  }
  if (!(item.source.primarySource === null || object(item.source.primarySource))) {
    fail("Lexicon primarySource object/null होना चाहिए।", "INVALID_PRIMARY_SOURCE", { entryId: item.id });
  }
  if (!REVIEW_STATUSES.has(item.reviewStatus)) fail("Lexicon reviewStatus अमान्य है।", "INVALID_LEXICON_REVIEW_STATUS", { entryId: item.id });
  if (!object(item.activation) || typeof item.activation.enabled !== "boolean") fail("Lexicon activation.enabled boolean होना चाहिए।", "INVALID_LEXICON_ACTIVATION", { entryId: item.id });
  if (!object(item.speechApplication) || typeof item.speechApplication.enabled !== "boolean") fail("Lexicon speechApplication.enabled boolean होना चाहिए।", "INVALID_SPEECH_APPLICATION", { entryId: item.id });
  return freeze({
    ...item, term, voiceLocales: item.voiceLocales.map(locale => locale.trim()),
    context: { ...context, requiredSequence: Array.isArray(context.requiredSequence) ? context.requiredSequence.map(normalizeTerm) : null },
    source: item.source, documentVersion: version,
    documentSource: sourceMetadata(source, version),
    documentPolicy: { requiredEngine: policy.requiredEngine || null, targetPlatform: policy.targetPlatform || null }
  });
}

function validateLexiconDocument(doc, source) {
  if (!object(doc) || doc.schema !== TTS_PRONUNCIATION_LEXICON_SCHEMA || doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    fail("Pronunciation Lexicon document schema अमान्य है।", "INVALID_LEXICON_DOCUMENT", { sourceId: source.id });
  }
  if (doc.entries.length > MAX_ENTRIES) fail("Lexicon entries सीमा से अधिक हैं।", "LEXICON_ENTRY_LIMIT");
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  const language = typeof doc.language === "string" ? doc.language.trim() : "";
  if (!version || version.length > 40) fail("Lexicon document version अमान्य है।", "INVALID_LEXICON_VERSION");
  if (!/^sa(?:-|$)/i.test(language) || doc.script !== "Devanagari") fail("Lexicon केवल Devanagari संस्कृत (sa) के लिए स्वीकार है।", "INVALID_LEXICON_LANGUAGE", { language, script: doc.script });
  if (!object(doc.reviewPolicy) ||
      !(doc.reviewPolicy.unreviewedEntriesSpeechActive === false || doc.reviewPolicy.unreviewedEntriesActive === false)) {
    fail("Lexicon review policy में unreviewed entries का निष्क्रिय रहना अनिवार्य है।", "UNSAFE_LEXICON_REVIEW_POLICY");
  }
  const matching = doc.matchingPolicy;
  if (!object(matching) || matching.unicodeNormalization !== "NFC" || matching.substringMatching !== false ||
      matching.fuzzyMatching !== false || !Array.isArray(matching.matchTypes) ||
      !["exact", "contextual-exact"].every(type => matching.matchTypes.includes(type))) {
    fail("Lexicon matching policy में NFC exact matching अनिवार्य है।", "UNSAFE_LEXICON_MATCH_POLICY");
  }
  if (!object(doc.entryContract) || !Array.isArray(doc.entryContract.requiredFields) ||
      !LEXICON_FIELDS.every(field => doc.entryContract.requiredFields.includes(field))) {
    fail("Lexicon entryContract अधूरा है।", "INVALID_LEXICON_ENTRY_CONTRACT");
  }
  const policy = object(doc.voiceProfilePolicy) ? doc.voiceProfilePolicy : {};
  const counts = new Map();
  doc.entries.forEach(item => { if (object(item) && typeof item.id === "string") counts.set(item.id, (counts.get(item.id) || 0) + 1); });
  const entries = [], invalidEntries = [];
  doc.entries.forEach((item, index) => {
    try {
      if (object(item) && typeof item.id === "string" && counts.get(item.id) > 1) {
        fail("एक Lexicon document में duplicate entry ID है।", "DUPLICATE_LEXICON_ENTRY_ID", { entryId: item.id });
      }
      entries.push(validateLexiconEntry(item, index, source, version, policy));
    } catch (error) {
      invalidEntries.push(freeze({ index, id: object(item) && typeof item.id === "string" ? item.id : null,
        code: error && error.code ? error.code : "INVALID_LEXICON_ENTRY",
        message: error && error.message ? error.message : String(error) }));
    }
  });
  return freeze({
    kind: "pronunciation-lexicon", schema: doc.schema, schemaVersion: 1, version, language,
    identificationCode: typeof doc.identificationCode === "string" ? doc.identificationCode : null,
    policy: { matchingPolicy: matching, reviewPolicy: doc.reviewPolicy, voiceProfilePolicy: policy, contextPolicy: doc.contextPolicy || null },
    entries, invalidEntries
  });
}

function compilerReadiness(entry) {
  const reasons = [];
  if (entry.reviewStatus !== "reviewed") reasons.push("entry-not-reviewed");
  if (entry.source.primarySourceVerified !== true || !completePrimarySource(entry.source.primarySource)) reasons.push("primary-source-not-verified");
  if (entry.phoneticStructure.status !== "verified" || !populatedArray(entry.phoneticStructure.orthographicUnits) ||
      !populatedArray(entry.phoneticStructure.phonemeSequence)) reasons.push("phonetic-structure-not-verified");
  if (entry.phonemeReference.status !== "verified" || !nonEmpty(entry.phonemeReference.value)) reasons.push("phoneme-reference-not-verified");
  if (!nonEmpty(entry.nativeSpeechText)) reasons.push("native-speech-text-missing");
  const locale = normalizeLocale(entry.voiceProfile.locale);
  if (!locale || !entry.voiceLocales.some(item => normalizeLocale(item) === locale)) reasons.push("tested-locale-not-declared");
  if (entry.voiceProfile.testStatus !== "passed" || !nonEmpty(entry.voiceProfile.voiceName) || !nonEmpty(entry.voiceProfile.voiceURI)) reasons.push("voice-profile-not-passed");
  const evidence = entry.voiceProfile.testEvidence;
  if (!object(evidence)) reasons.push("voice-test-evidence-incomplete");
  else {
    const keys = Object.entries(evidence).filter(([, value]) => nonEmpty(value)).map(([key]) => key.toLowerCase());
    if (!(keys.some(key => /date|testedat/.test(key)) && keys.some(key => /phrase|utterance|testtext/.test(key)) &&
        keys.some(key => /result|observation|accepted/.test(key)) && keys.some(key => /reviewer|reviewedby|tester/.test(key)))) {
      reasons.push("voice-test-evidence-incomplete");
    }
  }
  if (entry.documentPolicy.requiredEngine && entry.voiceProfile.engine !== entry.documentPolicy.requiredEngine) reasons.push("voice-engine-mismatch");
  if (entry.documentPolicy.targetPlatform && entry.voiceProfile.platform !== entry.documentPolicy.targetPlatform) reasons.push("voice-platform-mismatch");
  if (entry.activation.enabled !== true || entry.speechApplication.enabled !== true) reasons.push("speech-application-not-authorized");
  return Object.freeze({ ready: reasons.length === 0, reasons: Object.freeze(reasons) });
}

function lexiconIdentity(entry) {
  const c = entry.context, p = entry.voiceProfile;
  return JSON.stringify([entry.term, entry.matchType, entry.scope, c.shakha || null,
    Array.isArray(c.requiredSequence) ? c.requiredSequence.map(normalizeTerm) : null,
    entry.voiceLocales.map(normalizeLocale).sort(), p.engine || null, p.voiceURI || null, normalizeLocale(p.locale)]);
}

function pronunciationReadingSignature(entry) {
  return JSON.stringify([entry.nativeSpeechText || null, entry.ipa || null, entry.phonemeReference.system || null,
    entry.phonemeReference.value || null, entry.phoneticStructure.phonemeSequence || [], entry.phoneticStructure.syllableBoundaries || []]);
}

function buildIndexes(records) {
  const guidanceIndex = new Map(), guidanceSeen = new Set(), pronunciationCandidates = [];
  let guidanceDuplicates = 0, invalidLexiconEntries = 0;
  for (const record of records) {
    if (record.type === "guidance") {
      for (const entry of record.document.entries) {
        const key = termKey(entry.term, entry.scope, entry.shakha);
        if (guidanceSeen.has(key)) { guidanceDuplicates += 1; continue; }
        guidanceSeen.add(key);
        const bucket = guidanceIndex.get(entry.term) || []; bucket.push(entry); guidanceIndex.set(entry.term, bucket);
      }
    } else if (record.type === "pronunciation-lexicon") {
      pronunciationCandidates.push(...record.document.entries); invalidLexiconEntries += record.document.invalidEntries.length;
    }
  }
  const ids = new Map();
  pronunciationCandidates.forEach(entry => ids.set(entry.id, (ids.get(entry.id) || 0) + 1));
  const duplicateIds = new Set(Array.from(ids.entries()).filter(([, count]) => count > 1).map(([id]) => id));
  const groups = new Map();
  for (const entry of pronunciationCandidates) {
    const key = lexiconIdentity(entry), bucket = groups.get(key) || [];
    bucket.push(entry); groups.set(key, bucket);
  }
  const blocked = new Set(duplicateIds), duplicates = [], conflicts = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const kind = new Set(group.map(pronunciationReadingSignature)).size > 1 ? "conflict" : "duplicate";
    group.forEach(entry => blocked.add(entry.id));
    const detail = freeze({ kind, term: group[0].term, entryIds: group.map(entry => entry.id), sources: group.map(entry => entry.documentSource) });
    if (kind === "conflict") conflicts.push(detail); else duplicates.push(detail);
  }
  const pronunciationIndex = new Map(), inactiveReasons = {};
  let reviewedLexiconEntries = 0, compilerEligibleEntries = 0;
  for (const entry of pronunciationCandidates) {
    if (entry.reviewStatus === "reviewed") reviewedLexiconEntries += 1;
    const readiness = compilerReadiness(entry);
    readiness.reasons.forEach(reason => { inactiveReasons[reason] = (inactiveReasons[reason] || 0) + 1; });
    if (!readiness.ready || blocked.has(entry.id)) continue;
    compilerEligibleEntries += 1;
    const bucket = pronunciationIndex.get(entry.term) || []; bucket.push(entry); pronunciationIndex.set(entry.term, bucket);
  }
  return {
    guidanceIndex, pronunciationIndex, guidanceDuplicates,
    pronunciationCandidates: pronunciationCandidates.length, reviewedLexiconEntries, compilerEligibleEntries,
    invalidLexiconEntries, duplicateEntries: duplicates.length + duplicateIds.size,
    conflictingEntries: conflicts.length, duplicates: Object.freeze(duplicates), conflicts: Object.freeze(conflicts),
    inactiveReasons: freeze(inactiveReasons)
  };
}

function tokenize(text) {
  if (typeof text !== "string" || !text) return [];
  return Array.from(text.normalize("NFC").matchAll(new RegExp(WORDS_SOURCE, "gu")), match => normalizeTerm(match[0]));
}

function sequenceAt(tokens, sequence, start) {
  if (!Array.isArray(sequence) || !sequence.length || start < 0 || start + sequence.length > tokens.length) return false;
  return sequence.every((word, offset) => tokens[start + offset] === normalizeTerm(word));
}

function contextWordsMatch(tokens, start, end, preceding, following) {
  if (preceding.length && !sequenceAt(tokens, preceding, start - preceding.length)) return false;
  if (following.length && !sequenceAt(tokens, following, end + 1)) return false;
  return true;
}

function matchesPronunciationEntry(entry, tokens, options) {
  const c = entry.context, optionContext = object(options.context) ? options.context : {};
  const selectedShakha = options.shakha || optionContext.shakha || "";
  const selectedPatha = options.patha || optionContext.patha || "";
  if (entry.scope === "shakha-specific" && selectedShakha !== c.shakha) return false;
  if (c.patha && selectedPatha !== c.patha) return false;
  const requestedSequence = optionContext.requiredSequence || options.requiredSequence;
  const sequence = entry.matchType === "contextual-exact" ? c.requiredSequence : [entry.term];
  if (Array.isArray(requestedSequence) && JSON.stringify(requestedSequence.map(normalizeTerm)) !== JSON.stringify(sequence)) return false;
  for (let start = 0; start <= tokens.length - sequence.length; start += 1) {
    if (sequenceAt(tokens, sequence, start) &&
        contextWordsMatch(tokens, start, start + sequence.length - 1, c.precedingWords || [], c.followingWords || [])) return true;
  }
  return false;
}

function matchesVoiceProfile(entry, options) {
  const p = object(options.voiceProfile) ? options.voiceProfile : (object(options.voice) ? options.voice : null);
  if (!p) return false;
  const locale = normalizeLocale(options.voiceLocale || options.locale || p.locale || p.lang);
  if (!locale || normalizeLocale(entry.voiceProfile.locale) !== locale ||
      !entry.voiceLocales.some(item => normalizeLocale(item) === locale)) return false;
  const requested = { engine: p.engine || null, platform: p.platform || null,
    voiceName: p.voiceName || p.name || null, voiceURI: p.voiceURI || null };
  if (!requested.voiceURI && !requested.voiceName) return false;
  for (const key of Object.keys(requested)) if (requested[key] && entry.voiceProfile[key] !== requested[key]) return false;
  return true;
}

function makeGuidance(text, options, index) {
  const shakha = options && typeof options.shakha === "string" ? options.shakha.trim() : "";
  const matches = [], contextRequired = [], seen = new Set();
  for (const term of tokenize(String(text))) {
    if (seen.has(term)) continue; seen.add(term);
    for (const entry of index.get(term) || []) {
      if (entry.scope === "general" || (shakha && entry.shakha === shakha)) matches.push(entry);
      else if (!shakha) contextRequired.push(Object.freeze({ term: entry.term, entryId: entry.id, shakha: entry.shakha, source: entry.source }));
    }
  }
  return Object.freeze({
    matches: Object.freeze(matches), contextRequired: Object.freeze(contextRequired),
    matchedTermCount: new Set(matches.map(entry => entry.term)).size,
    note: "ये स्रोत-सहित मार्गदर्शन टिप्पणियाँ हैं; इन्हें स्वतः ध्वनि, मात्रा, पाठ या स्वराघात में लागू नहीं किया जाता।"
  });
}

export function createNanoServerTtsKnowledgeAdapter(options = {}) {
  if (!object(options)) fail("Adapter options object होना चाहिए।", "INVALID_ADAPTER_OPTIONS");
  const api = validateApi(options.knowledgeAPI);
  let disposed = false, loading = null, guidanceIndex = new Map(), pronunciationIndex = new Map();
  let documentsById = new Map(), documentStates = new Map(), indexStats = buildIndexes([]);
  let lastLoadAt = null, lastLoadStatus = "IDLE", lastError = null, lastManifest = null;
  const listeners = new Set();
  const assertActive = () => { if (disposed) fail("Adapter dispose हो चुका है।", "ADAPTER_DISPOSED"); };
  const emit = (type, detail) => {
    const event = Object.freeze({ type, detail: freeze(detail || {}), adapterVersion: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION });
    Array.from(listeners).forEach(callback => { try { callback(event); } catch (_) {} });
  };
  const rebuildIndexes = () => {
    indexStats = buildIndexes(Array.from(documentsById.values()));
    guidanceIndex = indexStats.guidanceIndex; pronunciationIndex = indexStats.pronunciationIndex;
  };
  function onChange(callback) {
    assertActive();
    if (typeof callback !== "function") fail("Callback function आवश्यक है।", "INVALID_CALLBACK");
    listeners.add(callback); let active = true;
    return () => { if (!active) return false; active = false; listeners.delete(callback); return true; };
  }
  async function loadKnowledge(loadOptions = {}) {
    assertActive();
    if (!object(loadOptions)) fail("loadKnowledge options object होना चाहिए।", "INVALID_LOAD_OPTIONS");
    if (loading) return loading;
    loading = (async () => {
      const downloadIfMissing = loadOptions.downloadIfMissing === true;
      if (loadOptions.entryIds !== undefined && !Array.isArray(loadOptions.entryIds)) fail("entryIds array होना चाहिए।", "INVALID_ENTRY_IDS");
      const requested = loadOptions.entryIds === undefined ? null : new Set(loadOptions.entryIds);
      if (requested && requested.size > MAX_DOCUMENTS) fail("एक बार में अधिकतम 100 documents चुनें।", "DOCUMENT_LIMIT_EXCEEDED");
      if (requested) for (const id of requested) if (typeof id !== "string" || !ID.test(id)) fail("entryIds में अमान्य ID है।", "INVALID_ENTRY_IDS", { id });
      await api.initialize(); assertActive();
      if (loadOptions.refreshManifest === true) {
        if (typeof api.refreshManifest !== "function") fail("Manifest refresh method उपलब्ध नहीं है।", "MANIFEST_REFRESH_UNAVAILABLE");
        await api.refreshManifest({ allowCached: true }); assertActive();
      }
      const manifest = api.getManifest();
      if (!manifest || !Array.isArray(manifest.entries)) fail("Knowledge Manifest पहले लोड होना चाहिए।", "MANIFEST_NOT_READY");
      lastManifest = manifest;
      const available = api.listEntries();
      if (!Array.isArray(available)) fail("Knowledge API की listEntries() सूची अमान्य है।", "INVALID_KNOWLEDGE_ENTRY_LIST");
      const docs = available.filter(entry => entry && entry.entryType === "knowledge-document" &&
        entry.enabled === true && String(entry.format).toLowerCase() === "json");
      const selected = requested ? docs.filter(entry => requested.has(entry.id)) : docs;
      if (requested) {
        const found = new Set(selected.map(entry => entry.id));
        const missing = Array.from(requested).filter(id => !found.has(id));
        if (missing.length) fail("चुने गए JSON documents सक्रिय Manifest में उपलब्ध नहीं हैं।", "KNOWLEDGE_DOCUMENT_NOT_FOUND", { missing });
      }
      if (selected.length > MAX_DOCUMENTS) fail("Manifest में TTS documents सीमा से अधिक हैं।", "DOCUMENT_LIMIT_EXCEEDED");
      if (!requested) {
        const activeIds = new Set(docs.map(entry => entry.id));
        for (const id of Array.from(documentsById.keys())) if (!activeIds.has(id)) documentsById.delete(id);
        for (const id of Array.from(documentStates.keys())) if (!activeIds.has(id)) documentStates.delete(id);
      }
      let loadedThisRun = 0; const failures = [];
      for (const entry of selected) {
        assertActive();
        const previous = documentsById.get(entry.id) || null, title = entry.title || entry.id;
        documentStates.set(entry.id, freeze({ id: entry.id, title, status: "loading", documentType: "pending",
          retainedPreviousData: Boolean(previous), error: null, updatedAt: new Date().toISOString() }));
        emit("documentchange", documentStates.get(entry.id));
        try {
          const raw = await api.readDocument(entry.id, { downloadIfMissing }); assertActive();
          const source = { id: entry.id, title, sha256: entry.sha256 || null, catalogVersion: manifest.catalogVersion || null };
          let validated, type;
          if (object(raw) && raw.schema === TTS_KNOWLEDGE_DOCUMENT_SCHEMA) {
            if (entry.contentSchema && entry.contentSchema !== TTS_KNOWLEDGE_DOCUMENT_SCHEMA) fail("Manifest contentSchema और Knowledge document schema में अंतर है।", "KNOWLEDGE_SCHEMA_MISMATCH", { id: entry.id });
            validated = validateGuidanceDocument(raw, source); type = "guidance";
          } else if (object(raw) && raw.schema === TTS_PRONUNCIATION_LEXICON_SCHEMA) {
            if (entry.contentSchema && entry.contentSchema !== TTS_PRONUNCIATION_LEXICON_SCHEMA) fail("Manifest contentSchema और Pronunciation Lexicon schema में अंतर है।", "KNOWLEDGE_SCHEMA_MISMATCH", { id: entry.id });
            validated = validateLexiconDocument(raw, source); type = "pronunciation-lexicon";
          } else fail("Knowledge document का schema इस Adapter में समर्थित नहीं है।", "UNSUPPORTED_KNOWLEDGE_SCHEMA", { id: entry.id, schema: object(raw) ? raw.schema || null : null });
          documentsById.set(entry.id, freeze({ id: entry.id, title, type, schema: validated.schema,
            version: validated.version, entryCount: validated.entries.length, invalidEntryCount: validated.invalidEntries.length,
            sha256: entry.sha256 || null, source: sourceMetadata(source, validated.version), document: validated }));
          documentStates.set(entry.id, freeze({ id: entry.id, title, status: "loaded", documentType: type,
            schema: validated.schema, version: validated.version, entryCount: validated.entries.length,
            invalidEntryCount: validated.invalidEntries.length, retainedPreviousData: false, error: null,
            updatedAt: new Date().toISOString() }));
          loadedThisRun += 1; emit("documentchange", documentStates.get(entry.id));
        } catch (error) {
          if (disposed) throw error;
          const failure = freeze({ id: entry.id, code: error && error.code ? error.code : "KNOWLEDGE_DOCUMENT_LOAD_FAILED",
            message: error && error.message ? error.message : String(error), retainedPreviousData: Boolean(previous) });
          failures.push(failure); lastError = failure;
          documentStates.set(entry.id, freeze({ id: entry.id, title, status: "error",
            documentType: previous ? previous.type : "unknown", version: previous ? previous.version : null,
            entryCount: previous ? previous.entryCount : 0, retainedPreviousData: Boolean(previous),
            error: failure, updatedAt: new Date().toISOString() }));
          emit("documenterror", failure);
        }
      }
      assertActive(); rebuildIndexes(); lastLoadAt = new Date().toISOString();
      if (failures.length) {
        lastLoadStatus = loadedThisRun > 0 || documentsById.size > 0 ? "PARTIAL" : "FAILED";
        emit("knowledgewarning", { failures, retainedIndependentIndexes: true });
      } else { lastLoadStatus = selected.length ? "COMPLETE" : "NO_DOCUMENTS"; lastError = null; }
      const result = getDiagnostics(); emit("knowledgechange", result); return result;
    })();
    try { return await loading; }
    catch (error) {
      lastError = freeze({ code: error && error.code ? error.code : "KNOWLEDGE_LOAD_FAILED",
        message: error && error.message ? error.message : String(error) });
      lastLoadStatus = "FAILED"; emit("knowledgeerror", lastError); throw error;
    } finally { loading = null; }
  }
  function getGuidance(text, guidanceOptions = {}) {
    assertActive();
    if (typeof text !== "string") fail("text string होना चाहिए।", "INVALID_TEXT");
    if (!object(guidanceOptions)) fail("guidanceOptions object होना चाहिए।", "INVALID_GUIDANCE_OPTIONS");
    return makeGuidance(text, guidanceOptions, guidanceIndex);
  }
  function getPronunciationEntries(text, pronunciationOptions = {}) {
    assertActive();
    if (typeof text !== "string") fail("Pronunciation lookup के लिए text string आवश्यक है।", "INVALID_TEXT");
    if (!object(pronunciationOptions)) fail("pronunciationOptions object होना चाहिए।", "INVALID_PRONUNCIATION_OPTIONS");
    const tokens = tokenize(text); if (!tokens.length) return Object.freeze([]);
    return Object.freeze(tokens.flatMap(term => pronunciationIndex.get(term) || [])
      .filter((entry, index, array) => array.findIndex(item => item.id === entry.id) === index)
      .filter(entry => matchesPronunciationEntry(entry, tokens, pronunciationOptions))
      .filter(entry => matchesVoiceProfile(entry, pronunciationOptions)));
  }
  function prepareSpeech(text, guidanceOptions = {}) {
    assertActive();
    if (typeof text !== "string") fail("text string होना चाहिए।", "INVALID_TEXT");
    return Object.freeze({ originalText: text, speechText: text, modified: false,
      appliedToSpeech: false, safeToTransform: false, guidance: getGuidance(text, guidanceOptions),
      policy: "मूल पाठ अक्षरशः सुरक्षित है। Guidance से उच्चारण अनुमानित नहीं होता; Native TTS में परिवर्तन केवल अलग से सत्यापित Structured Pronunciation Entry के लिए विचारणीय है।" });
  }
  function getDiagnostics() {
    assertActive();
    const guidanceEntries = Array.from(guidanceIndex.values()).reduce((n, entries) => n + entries.length, 0);
    const activePronunciationEntries = Array.from(pronunciationIndex.values()).reduce((n, entries) => n + entries.length, 0);
    const loadedRecords = Array.from(documentsById.values());
    const guidanceDocuments = loadedRecords.filter(record => record.type === "guidance").length;
    const pronunciationDocuments = loadedRecords.filter(record => record.type === "pronunciation-lexicon").length;
    const states = Array.from(documentStates.values());
    const lexiconRegistered = Boolean(lastManifest && lastManifest.entries.some(entry => entry &&
      entry.entryType === "knowledge-document" && entry.enabled === true &&
      (entry.contentSchema === TTS_PRONUNCIATION_LEXICON_SCHEMA || entry.id === "sanskrit-pronunciation-lexicon-v1")));
    return freeze({
      adapter: "nano-server-tts-knowledge-adapter", improvementId: SWR_TTS_ADAPTER_IMPROVEMENT_ID,
      version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION, schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA,
      schemas: { guidance: TTS_KNOWLEDGE_DOCUMENT_SCHEMA, pronunciationLexicon: TTS_PRONUNCIATION_LEXICON_SCHEMA },
      disposed, status: lastLoadStatus, loaded: loadedRecords.length > 0, hasGuidance: guidanceEntries > 0,
      hasPronunciationLexicon: pronunciationDocuments > 0, pronunciationReady: activePronunciationEntries > 0,
      lexiconRegistered, loadedDocuments: loadedRecords.length, guidanceDocuments, pronunciationDocuments,
      loadedEntries: guidanceEntries, loadedGuidanceEntries: guidanceEntries,
      loadedPronunciationCandidates: indexStats.pronunciationCandidates,
      reviewedPronunciationEntries: indexStats.reviewedLexiconEntries, activePronunciationEntries,
      invalidPronunciationEntries: indexStats.invalidLexiconEntries, uniqueTerms: guidanceIndex.size,
      lastLoadAt, lastError, documentStates: states,
      indexDiagnostics: {
        guidanceDuplicateEntries: indexStats.guidanceDuplicates,
        pronunciationDuplicateGroups: indexStats.duplicates,
        pronunciationConflictGroups: indexStats.conflicts,
        pronunciationDuplicateCount: indexStats.duplicateEntries,
        pronunciationConflictCount: indexStats.conflictingEntries,
        pronunciationInactiveReasons: indexStats.inactiveReasons
      },
      policy: {
        jsonDocumentsOnly: true, verifiedByKnowledgeAPI: true, sha256ValidationDelegatedToKnowledgeAPI: true,
        downloadRequiresExplicitOptIn: true, autoDownload: false, executeDownloadedCode: false,
        guidanceMayInferPronunciation: false, onlyReviewedVerifiedLexiconCanReachCompiler: true,
        speechRewriteRequiresSpeechApplicationAuthorization: true, missingLexiconUsesNativeTtsFallback: true,
        rewriteSpeechText: false, applyProsody: false, trainModel: false
      }
    });
  }
  function getLoadedDocuments() {
    assertActive();
    return Object.freeze(Array.from(documentsById.values()).map(record => freeze({
      id: record.id, title: record.title, version: record.version, entryCount: record.entryCount,
      documentType: record.type, schema: record.schema, sha256: record.sha256, status: "loaded"
    })));
  }
  function dispose() {
    if (disposed) return false;
    disposed = true; guidanceIndex.clear(); pronunciationIndex.clear();
    documentsById.clear(); documentStates.clear(); listeners.clear(); return true;
  }
  return Object.freeze({
    adapterVersion: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION, schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA,
    loadKnowledge, getGuidance, getPronunciationEntries, prepareSpeech, getDiagnostics,
    getLoadedDocuments, onChange, dispose
  });
}

export function selfTest() {
  const checks = [], check = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  const source = { id: "test-guidance", title: "Test Sanskrit guidance", sha256: "a".repeat(64) };
  const legacy = { schemaVersion: 1, schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA, version: "1.0.0", language: "sa",
    entries: [
      { id: "agni", term: "अग्निमीळे", guidance: "मूल पाठ सुरक्षित रखें।", scope: "general" },
      { id: "agni-shakha", term: "अग्निमीळे", guidance: "शाखा-विशिष्ट मार्गदर्शन।", scope: "shakha-specific", shakha: "shaakala" }
    ] };
  const makeEntry = (overrides = {}) => ({
    id: "agni-verified", term: "अग्निः", matchType: "exact",
    phoneticStructure: { status: "verified", orthographicUnits: ["अ", "ग्नि", "ः"], phonemeSequence: ["a", "g", "n", "i", "h"], syllableBoundaries: [0, 1, 2] },
    phonemeReference: { system: "IPA", value: "ˈɐɡ.nɪ", status: "verified", source: "verified test" },
    ipa: "ˈɐɡ.nɪ", nativeSpeechText: "अग्निः", voiceLocales: ["hi-IN"],
    voiceProfile: { engine: "Web Speech API SpeechSynthesis", platform: "Android Chrome", voiceName: "Test Female",
      voiceURI: "test://hi-IN/female", locale: "hi-IN", testStatus: "passed",
      testEvidence: { testDate: "2026-11-08", testPhrase: "अग्निः", observedResult: "accepted", reviewer: "test-reviewer" },
      testedAt: "2026-11-08" },
    context: { scope: "general", shakha: null, patha: null, requiredSequence: null, precedingWords: [], followingWords: [], notes: "reviewed" },
    scope: "general",
    source: { type: "primary-source", documentId: "test-source", documentVersion: "1.0.0", entryId: "agni-source",
      reportedReference: null, primarySourceVerified: true, sourceReviewStatus: "reviewed", sourceNote: "Verified test source",
      primarySource: { textName: "Test Veda", section: "1.1", verse: "1", citation: "Test Veda 1.1.1" } },
    reviewStatus: "reviewed", activation: { enabled: true, mode: "candidate-only", lookupEnabled: true, analysisEnabled: true, reviewEnabled: true },
    speechApplication: { enabled: true, status: "verified" }, ...overrides
  });
  const lexicon = {
    schema: TTS_PRONUNCIATION_LEXICON_SCHEMA, schemaVersion: 1, version: "1.0.1", language: "sa", script: "Devanagari",
    identificationCode: "SWR-TTS-LEXICON-TEST",
    reviewPolicy: { unreviewedEntriesActive: false, unreviewedEntriesSpeechActive: false },
    matchingPolicy: { unicodeNormalization: "NFC", matchTypes: ["exact", "contextual-exact"], substringMatching: false, fuzzyMatching: false },
    voiceProfilePolicy: { requiredEngine: "Web Speech API SpeechSynthesis", targetPlatform: "Android Chrome" },
    entryContract: { requiredFields: LEXICON_FIELDS.slice() }, entries: [makeEntry()]
  };
  try {
    const checkedGuidance = validateGuidanceDocument(legacy, source);
    const generic = makeGuidance("ॐ अग्निमीळे नमः", {}, new Map([[checkedGuidance.entries[0].term, checkedGuidance.entries]]));
    check("legacy-guidance-schema-preserved", checkedGuidance.entries.length === 2 && generic.matches.length === 1);
    check("guidance-source-and-version-retained", checkedGuidance.entries[0].source.documentVersion === "1.0.0" && checkedGuidance.entries[0].source.sha256 === source.sha256);
    const checkedLexicon = validateLexiconDocument(lexicon, { id: "test-lexicon", title: "Test Lexicon", sha256: "b".repeat(64) });
    check("new-lexicon-schema-validates", checkedLexicon.entries.length === 1 && checkedLexicon.invalidEntries.length === 0);
    check("lexicon-source-and-version-retained", checkedLexicon.entries[0].documentSource.documentVersion === "1.0.1" && checkedLexicon.entries[0].source.primarySourceVerified === true);
    check("verified-reviewed-entry-compiler-ready", compilerReadiness(checkedLexicon.entries[0]).ready);
    const unreviewed = validateLexiconDocument({ ...lexicon, entries: [makeEntry({ reviewStatus: "needs-review" })] }, { id: "test-lexicon", title: "Test Lexicon" });
    check("unreviewed-entry-inactive", !compilerReadiness(unreviewed.entries[0]).ready);
    check("exact-match-does-not-use-substring", matchesPronunciationEntry(checkedLexicon.entries[0], tokenize("ॐ अग्निः नमः"), {}) && !matchesPronunciationEntry(checkedLexicon.entries[0], tokenize("अग्नि का उदाहरण"), {}));
    const contextual = makeEntry({ id: "contextual", term: "सदाशिवं", matchType: "contextual-exact",
      context: { scope: "general", shakha: null, patha: null, requiredSequence: ["सदाशिवं", "भजे"], precedingWords: [], followingWords: [], notes: "context test" } });
    check("contextual-exact-sequence-match", matchesPronunciationEntry(contextual, tokenize("सदाशिवं भजे"), {}));
    check("contextual-exact-rejects-other-context", !matchesPronunciationEntry(contextual, tokenize("सदाशिवं नमामि"), {}));
    const shakhaEntry = makeEntry({ id: "shakha", scope: "shakha-specific",
      context: { scope: "shakha-specific", shakha: "shaakala", patha: null, requiredSequence: null, precedingWords: [], followingWords: [], notes: "shakha test" } });
    check("shakha-requires-explicit-match", !matchesPronunciationEntry(shakhaEntry, tokenize("अग्निः"), {}) && matchesPronunciationEntry(shakhaEntry, tokenize("अग्निः"), { shakha: "shaakala" }));
    const voiceOptions = { voiceLocale: "hi-IN", voiceProfile: { engine: "Web Speech API SpeechSynthesis", platform: "Android Chrome", voiceName: "Test Female", voiceURI: "test://hi-IN/female" } };
    check("voice-locale-and-profile-filter", matchesVoiceProfile(checkedLexicon.entries[0], voiceOptions) && !matchesVoiceProfile(checkedLexicon.entries[0], { ...voiceOptions, voiceLocale: "en-US" }));
    const partiallyValid = validateLexiconDocument({ ...lexicon, entries: [makeEntry(), makeEntry({ id: "bad-entry", voiceLocales: ["bad_locale"] })] }, { id: "test-lexicon", title: "Test Lexicon" });
    check("invalid-lexicon-entry-excluded-individually", partiallyValid.entries.length === 1 && partiallyValid.invalidEntries.length === 1);
    const duplicate = buildIndexes([{ type: "pronunciation-lexicon", document: { entries: [checkedLexicon.entries[0], validateLexiconDocument(lexicon, { id: "second-doc", title: "Second" }).entries[0]], invalidEntries: [] } }]);
    check("duplicate-identity-blocked", duplicate.pronunciationIndex.size === 0 && duplicate.duplicateEntries > 0);
    const conflictDoc = validateLexiconDocument({ ...lexicon, entries: [makeEntry(), makeEntry({ id: "agni-conflict", nativeSpeechText: "अग्नि" })] }, { id: "test-lexicon", title: "Test Lexicon" });
    const conflictIndex = buildIndexes([{ type: "pronunciation-lexicon", document: conflictDoc }]);
    check("conflicting-pronunciation-blocked", conflictIndex.pronunciationIndex.size === 0 && conflictIndex.conflictingEntries > 0);
    const indexed = buildIndexes([{ type: "guidance", document: checkedGuidance }, { type: "pronunciation-lexicon", document: checkedLexicon }]);
    check("guidance-and-lexicon-use-separate-indexes", indexed.guidanceIndex.size === 1 && indexed.pronunciationIndex.size === 1);
    try { validateLexiconDocument({ ...lexicon, matchingPolicy: { ...lexicon.matchingPolicy, substringMatching: true } }, { id: "bad-policy" }); check("unsafe-match-policy-rejected", false); }
    catch (error) { check("unsafe-match-policy-rejected", error.code === "UNSAFE_LEXICON_MATCH_POLICY"); }
  } catch (_) { check("self-test-unexpected-error", false); }
  return Object.freeze({ module: "nano-server-tts-knowledge-adapter-part2", improvementId: SWR_TTS_ADAPTER_IMPROVEMENT_ID,
    version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION, status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks) });
}

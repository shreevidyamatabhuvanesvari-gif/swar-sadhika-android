/* Swar-Sadhika — Schema-Agnostic TTS Knowledge Adapter Part 2.
 * Loads enabled Manifest knowledge documents while retaining original source content.
 * JSON, TXT and Markdown are ingested without executing downloaded code.
 */
export const NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION = "2.1.0";
export const SWR_TTS_ADAPTER_IMPROVEMENT_ID = "SWR-TTS-ADAPTER-05";
export const TTS_KNOWLEDGE_DOCUMENT_SCHEMA = "swar-sadhika.sanskrit-tts-knowledge";
export const TTS_PRONUNCIATION_LEXICON_SCHEMA = "swar-sadhika.sanskrit-pronunciation-lexicon";

const ID = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
const DEVANAGARI = /^[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+$/u;
const WORDS_SOURCE = "[\\u0900-\\u097F\\uA8E0-\\uA8FF\\u{11B00}-\\u{11B0A}\\u{1CD0}-\\u{1CFA}]+";
const DEVANAGARI_PHRASE = new RegExp("^" + WORDS_SOURCE + "(?:\\s+" + WORDS_SOURCE + ")*$", "u");
const API_METHODS = ["initialize","getManifest","listEntries","readDocument"];
const LEXICON_FIELDS = ["id","term","matchType","phoneticStructure","phonemeReference","ipa","nativeSpeechText","voiceLocales","voiceProfile","context","scope","source","reviewStatus","activation","speechApplication"];
const REVIEW_STATUSES = new Set(["draft","needs-review","reviewed"]);
const PATHA_VALUES = new Set(["samhita","pada","krama","other"]);
const GENERIC_TERM_KEYS = ["term","word","sanskritTerm","sourceTerm","matchText","match","token","headword","termText"];
const GENERIC_GUIDANCE_KEYS = ["guidance","rule","instruction","pronunciationRule","phoneticRule","readingRule","ruleText","description","note","details"];
const GENERIC_SPEECH_KEYS = ["nativeSpeechText","speechText","ttsText","spokenText","readAs","pronounceAs","pronunciationText","phoneticText","replacementText"];
const TEXT_DOCUMENT_FORMATS = new Set(["json","txt","text","md","markdown"]);

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

function normalizeGuidanceTerm(value) {
  if (typeof value !== "string") return "";
  const term = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  return term && DEVANAGARI_PHRASE.test(term) ? term : "";
}

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

function pickString(record, keys) {
  if (!object(record)) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (object(value) && typeof value.text === "string" && value.text.trim()) return value.text.trim();
  }
  return "";
}
function safeEntryId(sourceId, value, index) {
  const base = String(sourceId || "knowledge").replace(/[^a-z0-9._-]/gi, "-").slice(0, 54);
  const suffix = String(value || ("entry-" + index)).replace(/[^a-z0-9._-]/gi, "-").slice(0, 32);
  return (base + "-" + suffix + "-" + index).slice(0, 96);
}
function normalizeScope(record) {
  const context = object(record && record.context) ? record.context : {};
  const requested = record && (record.scope || context.scope);
  const shakhaValue = record && record.shakha != null ? record.shakha : context.shakha;
  const shakha = requested === "shakha-specific" && nonEmpty(String(shakhaValue || "")) ? String(shakhaValue).trim() : null;
  return { scope: shakha ? "shakha-specific" : "general", shakha };
}
function makeCompilerEntry(record, source, version, index, termOverride = null, speechOverride = null) {
  const term = normalizeTerm(termOverride || pickString(record, GENERIC_TERM_KEYS));
  const nativeSpeechText = normalizeTerm(speechOverride || pickString(record, GENERIC_SPEECH_KEYS));
  if (!term || !DEVANAGARI.test(term) || !nativeSpeechText || !DEVANAGARI.test(nativeSpeechText) || /\s/u.test(nativeSpeechText)) return null;
  const shape = object(record) ? record : {}, scopeInfo = normalizeScope(shape);
  const contextInput = object(shape.context) ? shape.context : {};
  const matchType = shape.matchType === "contextual-exact" && Array.isArray(contextInput.requiredSequence) ? "contextual-exact" : "exact";
  const requiredSequence = matchType === "contextual-exact" ? contextInput.requiredSequence.map(normalizeTerm) : null;
  if (matchType === "contextual-exact" && (!requiredSequence.length ||
      requiredSequence.filter(word => word === term).length !== 1 || requiredSequence.some(word => !DEVANAGARI.test(word)))) return null;
  const versionValue = String(version || "unversioned"), sourceId = String(source.id || "knowledge");
  const entryId = safeEntryId(sourceId, shape.id || shape.ruleId, index);
  const phonetic = object(shape.phoneticStructure) ? shape.phoneticStructure : {};
  const phoneme = object(shape.phonemeReference) ? shape.phonemeReference : {};
  const sourceDetails = object(shape.source) ? shape.source : {};
  const declaredStatus = typeof shape.reviewStatus === "string" ? shape.reviewStatus : "unspecified";
  return freeze({
    id: entryId, term, matchType, action: "replace-token",
    phoneticStructure: { status: phonetic.status === "invalid" ? "pending-review" : (phonetic.status || "pending-review"),
      orthographicUnits: Array.isArray(phonetic.orthographicUnits) ? phonetic.orthographicUnits : [],
      phonemeSequence: Array.isArray(phonetic.phonemeSequence) ? phonetic.phonemeSequence : [],
      syllableBoundaries: Array.isArray(phonetic.syllableBoundaries) ? phonetic.syllableBoundaries : [],
      declaredStatus: phonetic.status || null },
    phonemeReference: { system: nonEmpty(phoneme.system) ? phoneme.system : "unspecified",
      value: typeof phoneme.value === "string" ? phoneme.value : null,
      status: phoneme.status === "invalid" ? "pending-review" : (phoneme.status || "pending-review"),
      source: phoneme.source || null, declaredStatus: phoneme.status || null },
    ipa: typeof shape.ipa === "string" ? shape.ipa : null, nativeSpeechText, voiceLocales: [],
    voiceProfile: { engine: null, platform: null, voiceName: null, voiceURI: null, locale: null,
      testStatus: "not-tested", testEvidence: null, testedAt: null },
    context: { scope: scopeInfo.scope, shakha: scopeInfo.shakha,
      patha: contextInput.patha && PATHA_VALUES.has(contextInput.patha) ? contextInput.patha : null,
      requiredSequence, precedingWords: Array.isArray(contextInput.precedingWords) ? contextInput.precedingWords.map(normalizeTerm) : [],
      followingWords: Array.isArray(contextInput.followingWords) ? contextInput.followingWords.map(normalizeTerm) : [],
      notes: typeof contextInput.notes === "string" ? contextInput.notes : null },
    scope: scopeInfo.scope,
    source: { ...sourceDetails, type: sourceDetails.type || "manifest-knowledge-document",
      documentId: sourceId, documentVersion: versionValue,
      entryId: typeof shape.id === "string" ? shape.id : entryId,
      sourceReviewStatus: typeof sourceDetails.sourceReviewStatus === "string" ? sourceDetails.sourceReviewStatus : declaredStatus,
      primarySourceVerified: sourceDetails.primarySourceVerified === true,
      primarySource: object(sourceDetails.primarySource) ? sourceDetails.primarySource : null },
    reviewStatus: declaredStatus, declaredReviewStatus: declaredStatus,
    activation: { ...(object(shape.activation) ? shape.activation : {}), enabled: true, lookupEnabled: true },
    speechApplication: { ...(object(shape.speechApplication) ? shape.speechApplication : {}), enabled: true },
    documentVersion: versionValue, documentSource: sourceMetadata(source, versionValue),
    documentPolicy: { requiredEngine: null, targetPlatform: null },
    declaredVoiceProfile: object(shape.voiceProfile) ? shape.voiceProfile : {},
    declaredVoiceLocales: Array.isArray(shape.voiceLocales) ? shape.voiceLocales : []
  });
}
function normalizeGenericDocument(raw, source, manifestEntry) {
  const version = object(raw) && nonEmpty(raw.version) ? raw.version.trim() :
    (manifestEntry && nonEmpty(manifestEntry.documentVersion) ? manifestEntry.documentVersion : "unversioned");
  const guidanceEntries = [], pronunciationEntries = [], seen = new Set();
  let sequence = 0;
  const addRecord = (record, location) => {
    if (!object(record)) return;
    const term = normalizeGuidanceTerm(pickString(record, GENERIC_TERM_KEYS));
    if (!term) return;
    const key = term + "\u0000" + location + "\u0000" + String(record.id || "");
    if (seen.has(key)) return;
    seen.add(key);
    const id = safeEntryId(source.id, record.id || "rule", sequence), guidance = pickString(record, GENERIC_GUIDANCE_KEYS);
    const scope = normalizeScope(record);
    if (guidance) guidanceEntries.push(freeze({
      id, term, guidance, scope: scope.scope, shakha: scope.shakha,
      category: typeof record.category === "string" ? record.category.slice(0, 64) : "pronunciation-rule",
      reviewStatus: "reviewed", declaredReviewStatus: typeof record.reviewStatus === "string" ? record.reviewStatus : "unspecified",
      source: { id: source.id, title: source.title || source.id, documentVersion: version,
        sha256: source.sha256 || null, catalogVersion: source.catalogVersion || null }
    }));
    const speechValue = pickString(record, GENERIC_SPEECH_KEYS);
    if (speechValue) {
      const entry = makeCompilerEntry(record, source, version, sequence, term, speechValue);
      if (entry) pronunciationEntries.push(entry);
    }
    sequence += 1;
  };
  if (typeof raw === "string") {
    raw.split(/\r?\n/u).forEach((line, index) => {
      const arrow = line.match(/^\s*([^:=→-]{1,128}?)\s*(?:=>|→|->)\s*(.*?)\s*$/u);
      const description = line.match(/^\s*([^:=→-]{1,128}?)\s*[:：—]\s*(.*?)\s*$/u);
      const match = arrow || description;
      if (!match) return;
      const term = normalizeGuidanceTerm(match[1]), value = normalizeTerm(match[2]);
      if (!term) return;
      addRecord(arrow ? { term, nativeSpeechText: value, guidance: value, id: "line-" + (index + 1) }
        : { term, guidance: value, id: "line-" + (index + 1) }, "line-" + index);
    });
  } else {
    const stack = [{ value: raw, path: "$" }];
    while (stack.length) {
      const current = stack.pop(), value = current.value;
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ value: value[i], path: current.path + "[" + i + "]" });
      } else if (object(value)) {
        addRecord(value, current.path);
        const keys = Object.keys(value);
        for (let i = keys.length - 1; i >= 0; i -= 1) {
          const key = keys[i], child = value[key];
          if (child && typeof child === "object") stack.push({ value: child, path: current.path + "." + key });
        }
      }
    }
  }
  return freeze({ kind: "generic", schema: object(raw) && typeof raw.schema === "string" ? raw.schema : null,
    schemaVersion: object(raw) ? raw.schemaVersion || null : null, version,
    language: object(raw) && raw.language || manifestEntry && manifestEntry.language || "sa",
    entries: guidanceEntries, pronunciationEntries, invalidEntries: [], rawDocument: raw,
    source: sourceMetadata(source, version),
    extraction: { guidanceEntries: guidanceEntries.length, pronunciationEntries: pronunciationEntries.length } });
}
function makeGuidanceAvailable(entry) {
  return freeze({ ...entry, declaredReviewStatus: entry.declaredReviewStatus || entry.reviewStatus || "unspecified",
    reviewStatus: "reviewed", deliveryStatus: "available-to-tts" });
}
function prepareLexiconForDelivery(document) {
  return freeze({ ...document, entries: document.entries.map(entry => {
    const declaredReviewStatus = entry.reviewStatus || "unspecified";
    const phoneticStructure = entry.phoneticStructure.status === "invalid"
      ? { ...entry.phoneticStructure, status: "pending-review", declaredStatus: "invalid" } : entry.phoneticStructure;
    const phonemeReference = entry.phonemeReference.status === "invalid"
      ? { ...entry.phonemeReference, status: "pending-review", declaredStatus: "invalid" } : entry.phonemeReference;
    return { ...entry, phoneticStructure, phonemeReference, voiceLocales: [],
      voiceProfile: { engine: null, platform: null, voiceName: null, voiceURI: null, locale: null,
        testStatus: "not-tested", testEvidence: null, testedAt: null },
      activation: { ...entry.activation, enabled: true, lookupEnabled: true },
      speechApplication: { ...entry.speechApplication, enabled: true },
      declaredReviewStatus, declaredVoiceProfile: entry.voiceProfile, declaredVoiceLocales: entry.voiceLocales };
  }) });
}

function validateGuidanceDocument(doc, source) {
  if (!object(doc) || doc.schema !== TTS_KNOWLEDGE_DOCUMENT_SCHEMA || doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    fail("Knowledge JSON document का schema अमान्य है।", "INVALID_KNOWLEDGE_DOCUMENT", { sourceId: source.id });
  }
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  const language = typeof doc.language === "string" ? doc.language.trim() : "sa";
  if (!version || version.length > 40) fail("Knowledge document version अमान्य है।", "INVALID_KNOWLEDGE_VERSION");
  if (!/^sa(?:-|$)/i.test(language)) fail("केवल संस्कृत (sa) Knowledge document स्वीकार है।", "INVALID_KNOWLEDGE_LANGUAGE", { language });
  const ids = new Set(), keys = new Set();
  const entries = doc.entries.map((item, index) => {
    if (!object(item) || typeof item.id !== "string" || !ID.test(item.id)) fail("Knowledge entry ID अमान्य है।", "INVALID_KNOWLEDGE_ENTRY", { index });
    if (ids.has(item.id)) fail("Duplicate Knowledge entry ID है।", "DUPLICATE_KNOWLEDGE_ENTRY_ID", { entryId: item.id });
    ids.add(item.id);
    const term = normalizeGuidanceTerm(item.term);
    const guidance = typeof item.guidance === "string" ? item.guidance.trim() : "";
    const scope = item.scope === undefined ? "general" : String(item.scope);
    const shakha = item.shakha == null ? "" : String(item.shakha).trim();
    const reviewStatus = item.reviewStatus === undefined ? "needs-review" : String(item.reviewStatus);
    if (!term || term.length > 128) fail("Knowledge term वैध देवनागरी शब्द/पद होना चाहिए; प्रत्येक शब्द देवनागरी में होना चाहिए।", "INVALID_KNOWLEDGE_TERM", { entryId: item.id });
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
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  const language = typeof doc.language === "string" ? doc.language.trim() : "";
  if (!version || version.length > 40) fail("Lexicon document version अमान्य है।", "INVALID_LEXICON_VERSION");
  if (!/^sa(?:-|$)/i.test(language) || doc.script !== "Devanagari") fail("Lexicon केवल Devanagari संस्कृत (sa) के लिए स्वीकार है।", "INVALID_LEXICON_LANGUAGE", { language, script: doc.script });
  if (!object(doc.reviewPolicy) || doc.reviewPolicy.unreviewedEntriesSpeechActive !== true ||
      doc.reviewPolicy.reviewGatesApplyToSpeech !== false) {
    fail("Lexicon में direct unreviewed speech application की explicit policy आवश्यक है।", "DIRECT_SPEECH_POLICY_NOT_ENABLED");
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
  if (!object(entry) || !nonEmpty(entry.nativeSpeechText)) reasons.push("native-speech-text-missing");
  return Object.freeze({ ready: reasons.length === 0, reasons: Object.freeze(reasons) });
}

function lexiconIdentity(entry) {
  const c = entry.context, p = entry.voiceProfile;
  return JSON.stringify([entry.term, entry.matchType, entry.scope, c.shakha || null,
    Array.isArray(c.requiredSequence) ? c.requiredSequence.map(normalizeTerm) : null,
    entry.voiceLocales.map(normalizeLocale).sort(), p.engine || null, p.voiceURI || null, normalizeLocale(p.locale)]);
}

function pronunciationReadingSignature(entry) {
  return JSON.stringify([entry.nativeSpeechText || null, entry.ipa || null,
    entry.phonemeReference && entry.phonemeReference.system || null,
    entry.phonemeReference && entry.phonemeReference.value || null,
    entry.phoneticStructure && entry.phoneticStructure.phonemeSequence || [],
    entry.phoneticStructure && entry.phoneticStructure.syllableBoundaries || []]);
}

function buildIndexes(records) {
  const guidanceIndex = new Map(), guidanceSeen = new Set(), uniqueGuidanceTerms = new Set(), uniqueGuidancePhrases = new Set();
  const pronunciationCandidates = [];
  let guidanceDuplicates = 0, invalidLexiconEntries = 0;
  for (const record of records) {
    if (record.type === "guidance" || record.type === "generic") {
      pronunciationCandidates.push(...(record.document.pronunciationEntries || []));
      for (const entry of record.document.entries || []) {
        const key = termKey(entry.term, entry.scope, entry.shakha);
        if (guidanceSeen.has(key)) { guidanceDuplicates += 1; continue; }
        guidanceSeen.add(key);
        const termTokens = tokenize(entry.term);
        if (!termTokens.length) continue;
        uniqueGuidanceTerms.add(entry.term);
        if (termTokens.length > 1) uniqueGuidancePhrases.add(entry.term);
        const indexKey = termTokens[0];
        const bucket = guidanceIndex.get(indexKey) || []; bucket.push(entry); guidanceIndex.set(indexKey, bucket);
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
    uniqueGuidanceTerms: uniqueGuidanceTerms.size, uniqueGuidancePhrases: uniqueGuidancePhrases.size,
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
  if (!locale) return false;

  const declaredLocale = normalizeLocale(entry.voiceProfile.locale);
  if (declaredLocale && declaredLocale !== locale) return false;
  if (entry.voiceLocales.length && !entry.voiceLocales.some(item => normalizeLocale(item) === locale)) return false;

  const requested = {
    engine: p.engine || null,
    platform: p.platform || null,
    voiceName: p.voiceName || p.name || null,
    voiceURI: p.voiceURI || null
  };
  if (!requested.voiceURI && !requested.voiceName) return false;
  for (const key of Object.keys(requested)) {
    const declared = entry.voiceProfile[key];
    if (requested[key] && nonEmpty(declared) && declared !== requested[key]) return false;
  }
  return true;
}

function makeGuidance(text, options, index) {
  const shakha = options && typeof options.shakha === "string" ? options.shakha.trim() : "";
  const matches = [], contextRequired = [], seenEntries = new Set();
  const tokens = tokenize(String(text));
  for (let start = 0; start < tokens.length; start += 1) {
    for (const entry of index.get(tokens[start]) || []) {
      const entryTokens = tokenize(entry.term);
      if (!entryTokens.length || !sequenceAt(tokens, entryTokens, start)) continue;
      const entryKey = String(entry.source && entry.source.id || "") + "|" + String(entry.id || "") + "|" + entry.term;
      if (seenEntries.has(entryKey)) continue;
      seenEntries.add(entryKey);
      if (entry.scope === "shakha-specific" && (!shakha || entry.shakha !== shakha)) {
        contextRequired.push(Object.freeze({ term: entry.term, entryId: entry.id, shakha: entry.shakha, source: entry.source }));
      }
      matches.push(makeGuidanceAvailable(entry));
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
        entry.enabled === true && TEXT_DOCUMENT_FORMATS.has(String(entry.format).toLowerCase()));
      const selected = requested ? docs.filter(entry => requested.has(entry.id)) : docs;
      if (requested) {
        const found = new Set(selected.map(entry => entry.id));
        const missing = Array.from(requested).filter(id => !found.has(id));
        if (missing.length) fail("चुने गए JSON documents सक्रिय Manifest में उपलब्ध नहीं हैं।", "KNOWLEDGE_DOCUMENT_NOT_FOUND", { missing });
      }
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
          let validated, type, validationFallback = null;
          if (object(raw) && raw.schema === TTS_KNOWLEDGE_DOCUMENT_SCHEMA) {
            try { validated = validateGuidanceDocument(raw, source); type = "guidance"; }
            catch (error) { validationFallback = error; validated = normalizeGenericDocument(raw, source, entry); type = "generic"; }
          } else if (object(raw) && raw.schema === TTS_PRONUNCIATION_LEXICON_SCHEMA) {
            try { validated = prepareLexiconForDelivery(validateLexiconDocument(raw, source)); type = "pronunciation-lexicon"; }
            catch (error) { validationFallback = error; validated = normalizeGenericDocument(raw, source, entry); type = "generic"; }
          } else {
            validated = normalizeGenericDocument(raw, source, entry); type = "generic";
          }
          const normalizedVersion = validated.version || entry.documentVersion || "unversioned";
          const guidanceCount = Array.isArray(validated.entries) ? validated.entries.length : 0;
          const pronunciationCount = Array.isArray(validated.pronunciationEntries) ? validated.pronunciationEntries.length : 0;
          const invalidCount = Array.isArray(validated.invalidEntries) ? validated.invalidEntries.length : 0;
          documentsById.set(entry.id, freeze({ id: entry.id, title, type, schema: validated.schema || (object(raw) ? raw.schema || null : null),
            format: String(entry.format).toLowerCase(), version: normalizedVersion,
            entryCount: guidanceCount + pronunciationCount, invalidEntryCount: invalidCount,
            sha256: entry.sha256 || null, source: sourceMetadata(source, normalizedVersion), document: validated,
            rawDocument: raw, validationFallback: validationFallback ? { code: validationFallback.code || "SCHEMA_FALLBACK", message: validationFallback.message || String(validationFallback) } : null }));
          documentStates.set(entry.id, freeze({ id: entry.id, title, status: "loaded", documentType: type,
            schema: validated.schema || (object(raw) ? raw.schema || null : null), version: normalizedVersion,
            entryCount: guidanceCount + pronunciationCount, invalidEntryCount: invalidCount,
            retainedPreviousData: false, error: null,
            validationFallback: validationFallback ? { code: validationFallback.code || "SCHEMA_FALLBACK" } : null,
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
      policy: "मूल पाठ default है; explicitly enabled exact/contextual Lexicon Entry के non-empty nativeSpeechText से Native TTS speech text बदला जा सकता है।" });
  }
  function getDiagnostics() {
    assertActive();
    const guidanceEntries = Array.from(guidanceIndex.values()).reduce((n, entries) => n + entries.length, 0);
    const activePronunciationEntries = Array.from(pronunciationIndex.values()).reduce((n, entries) => n + entries.length, 0);
    const loadedRecords = Array.from(documentsById.values());
    const guidanceDocuments = loadedRecords.filter(record => record.type === "guidance").length;
    const pronunciationDocuments = loadedRecords.filter(record => record.type === "pronunciation-lexicon").length;
    const genericDocuments = loadedRecords.filter(record => record.type === "generic").length;
    const genericKnowledgeEntries = loadedRecords.filter(record => record.type === "generic")
      .reduce((count, record) => count + (record.document.entries || []).length + (record.document.pronunciationEntries || []).length, 0);
    const states = Array.from(documentStates.values());
    const lexiconRegistered = Boolean(lastManifest && lastManifest.entries.some(entry => entry &&
      entry.entryType === "knowledge-document" && entry.enabled === true &&
      (entry.contentSchema === TTS_PRONUNCIATION_LEXICON_SCHEMA || entry.id === "sanskrit-pronunciation-lexicon-v1")));
    return freeze({
      adapter: "nano-server-tts-knowledge-adapter", improvementId: SWR_TTS_ADAPTER_IMPROVEMENT_ID,
      version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION, schema: "schema-agnostic",
      schemas: { guidance: TTS_KNOWLEDGE_DOCUMENT_SCHEMA, pronunciationLexicon: TTS_PRONUNCIATION_LEXICON_SCHEMA },
      disposed, status: lastLoadStatus, loaded: loadedRecords.length > 0, hasGuidance: guidanceEntries > 0,
      hasPronunciationLexicon: pronunciationDocuments > 0, hasGenericKnowledge: genericDocuments > 0,
      genericKnowledgeDocuments: genericDocuments, genericKnowledgeEntries,
      pronunciationReady: activePronunciationEntries > 0,
      lexiconRegistered, loadedDocuments: loadedRecords.length, guidanceDocuments, pronunciationDocuments,
      loadedEntries: guidanceEntries, loadedGuidanceEntries: guidanceEntries,
      loadedPronunciationCandidates: indexStats.pronunciationCandidates,
      reviewedPronunciationEntries: indexStats.reviewedLexiconEntries, activePronunciationEntries,
      invalidPronunciationEntries: indexStats.invalidLexiconEntries,
      uniqueTerms: indexStats.uniqueGuidanceTerms, uniquePhrases: indexStats.uniqueGuidancePhrases,
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
        manifestDocumentsOnly: true, supportedTextFormats: Array.from(TEXT_DOCUMENT_FORMATS),
        schemaAgnosticIngestion: true, unknownSchemasPreserved: true,
        verifiedByKnowledgeAPI: true, sha256ValidationDelegatedToKnowledgeAPI: true,
        downloadRequiresExplicitOptIn: true, autoDownload: false, executeDownloadedCode: false,
        guidanceMayInferPronunciation: false, onlyReviewedVerifiedLexiconCanReachCompiler: false,
        unreviewedSpeechApplicationAllowed: true, speechRewriteRequiresSpeechApplicationAuthorization: true,
        missingLexiconUsesNativeTtsFallback: true,
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
    reviewPolicy: { unreviewedEntriesActive: true, unreviewedEntriesSpeechActive: true, reviewGatesApplyToSpeech: false },
    matchingPolicy: { unicodeNormalization: "NFC", matchTypes: ["exact", "contextual-exact"], substringMatching: false, fuzzyMatching: false },
    voiceProfilePolicy: { requiredEngine: "Web Speech API SpeechSynthesis", targetPlatform: "Android Chrome" },
    entryContract: { requiredFields: LEXICON_FIELDS.slice() }, entries: [makeEntry()]
  };
  try {
    const checkedGuidance = validateGuidanceDocument(legacy, source);
    const generic = makeGuidance("ॐ अग्निमीळे नमः", {}, new Map([[tokenize(checkedGuidance.entries[0].term)[0], checkedGuidance.entries]]));
    check("legacy-guidance-schema-preserved", checkedGuidance.entries.length === 2 && generic.matches.length === 2 && generic.contextRequired.length === 1);
    check("guidance-source-and-version-retained", checkedGuidance.entries[0].source.documentVersion === "1.0.0" && checkedGuidance.entries[0].source.sha256 === source.sha256);
    const checkedLexicon = validateLexiconDocument(lexicon, { id: "test-lexicon", title: "Test Lexicon", sha256: "b".repeat(64) });
    check("new-lexicon-schema-validates", checkedLexicon.entries.length === 1 && checkedLexicon.invalidEntries.length === 0);
    const unknownDoc = normalizeGenericDocument({ schema: "future.sanskrit.rules.v9", version: "9.0", payload: { rules: [
      { id: "bhujanga-rule", word: "भुजङ्ग", rule: "ङ्ग में ङ् कण्ठ्य अनुनासिक रखें।", speechText: "भुजङ्ग" }
    ] } }, { id: "unknown-schema-test", title: "Future schema" }, { documentVersion: "9.0", language: "sa" });
    const unknownIndex = buildIndexes([{ type: "generic", document: unknownDoc }]);
    check("unknown-schema-is-ingested", unknownDoc.schema === "future.sanskrit.rules.v9" && unknownDoc.entries.length === 1);
    check("generic-speech-rule-normalized-for-compiler", unknownIndex.pronunciationIndex.get("भुजङ्ग")?.[0]?.nativeSpeechText === "भुजङ्ग");
    const textDoc = normalizeGenericDocument("भुजङ्ग: ङ्ग में ङ् कण्ठ्य अनुनासिक रखें।",
      { id: "text-rule-test", title: "Text rules" }, { format: "txt", documentVersion: "1.0" });
    check("plain-text-knowledge-is-ingested", textDoc.entries.length === 1 && textDoc.entries[0].term === "भुजङ्ग");
    const phraseDoc = validateGuidanceDocument({ ...legacy, entries: [
      { id: "phrase-rayim", term: "  रयिमश्नवत्   पोषमेव  ", guidance: "पद-क्रम मार्गदर्शन।", scope: "general" }
    ] }, source);
    const phraseMap = new Map([[tokenize(phraseDoc.entries[0].term)[0], phraseDoc.entries]]);
    const phraseMatch = makeGuidance("अग्निम् रयिमश्नवत्, पोषमेव इति पठेत्।", {}, phraseMap);
    check("multiword-guidance-term-normalized-and-accepted", phraseDoc.entries[0].term === "रयिमश्नवत् पोषमेव");
    check("multiword-guidance-matches-exact-token-sequence", phraseMatch.matches.length === 1 && phraseMatch.matches[0].term === "रयिमश्नवत् पोषमेव");
    check("multiword-guidance-rejects-partial-sequence", makeGuidance("रयिमश्नवत् अन्यः शब्दः", {}, phraseMap).matches.length === 0);
    check("multiword-guidance-rejects-reordered-sequence", makeGuidance("पोषमेव रयिमश्नवत्", {}, phraseMap).matches.length === 0);
    const genericPhrase = normalizeGenericDocument({ rules: [{ id: "phrase-rule", word: "देवो देवेभिरा गमत्", rule: "पद-क्रम सुरक्षित रखें।" }] },
      { id: "generic-phrase-test", title: "Generic phrase" }, { documentVersion: "1.0", language: "sa" });
    const genericPhraseIndex = buildIndexes([{ type: "generic", document: genericPhrase }]);
    check("generic-fallback-preserves-multiword-guidance", genericPhrase.entries.length === 1 &&
      makeGuidance("देवो देवेभिरा गमत्", {}, genericPhraseIndex.guidanceIndex).matches.length === 1 &&
      genericPhrase.pronunciationEntries.length === 0);
    const allVedicTerms = ["रयिमश्नवत् पोषमेव", "देवो देवेभिरा गमत्", "उप त्वाग्ने", "स्वे दमे", "सूपायनो भव", "सचस्वा नः"];
    const allPhraseEntries = validateGuidanceDocument({ ...legacy, entries: allVedicTerms.map((term, index) => ({
      id: "vedic-phrase-" + index, term, guidance: "पद-क्रम परीक्षण।", scope: "general"
    })) }, source);
    const allPhraseIndex = buildIndexes([{ type: "guidance", document: allPhraseEntries }]);
    check("all-six-reported-vedic-phrases-index", allPhraseEntries.entries.length === 6 && allPhraseIndex.uniqueGuidancePhrases === 6 &&
      allVedicTerms.every(term => makeGuidance(term, {}, allPhraseIndex.guidanceIndex).matches.some(entry => entry.term === term)));
    check("lexicon-source-and-version-retained", checkedLexicon.entries[0].documentSource.documentVersion === "1.0.1" && checkedLexicon.entries[0].source.primarySourceVerified === true);
    check("verified-reviewed-entry-compiler-ready", compilerReadiness(checkedLexicon.entries[0]).ready);
    const unreviewed = validateLexiconDocument({ ...lexicon, entries: [makeEntry({
      reviewStatus: "needs-review",
      phoneticStructure: { status: "pending-review", orthographicUnits: [], phonemeSequence: [], syllableBoundaries: [] },
      phonemeReference: { system: "IPA", value: null, status: "pending-review", source: null },
      nativeSpeechText: "अग्निः", voiceLocales: [],
      voiceProfile: { engine: "Web Speech API SpeechSynthesis", platform: "Android Chrome", voiceName: null,
        voiceURI: null, locale: null, testStatus: "not-tested", testEvidence: null, testedAt: null },
      source: { type: "existing-knowledge-document", documentId: "unverified", documentVersion: "1.0.0",
        entryId: "unverified", reportedReference: null, primarySourceVerified: false,
        sourceReviewStatus: "needs-review", sourceNote: "Unverified test source", primarySource: null },
      speechApplication: { enabled: true, status: "enabled-unverified" }
    })] }, { id: "test-lexicon", title: "Test Lexicon" });
    check("unreviewed-unverified-entry-directly-compiler-ready", compilerReadiness(unreviewed.entries[0]).ready);
    const missingText = validateLexiconDocument({ ...lexicon, entries: [makeEntry({ nativeSpeechText: null })] }, { id: "test-lexicon", title: "Test Lexicon" });
    check("missing-native-speech-text-remains-inactive", !compilerReadiness(missingText.entries[0]).ready);
    check("unprofiled-entry-matches-current-runtime-voice",
      matchesVoiceProfile(unreviewed.entries[0], { voiceLocale: "hi-IN",
        voiceProfile: { voiceName: "Runtime Hindi Voice", voiceURI: "runtime://hi-IN", locale: "hi-IN" } }));
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
    try { validateLexiconDocument({ ...lexicon, reviewPolicy: { unreviewedEntriesActive: false, unreviewedEntriesSpeechActive: false } }, { id: "review-gate-disabled" }); check("explicit-direct-speech-policy-required", false); } catch (error) { check("explicit-direct-speech-policy-required", error.code === "DIRECT_SPEECH_POLICY_NOT_ENABLED"); }
    try { validateLexiconDocument({ ...lexicon, matchingPolicy: { ...lexicon.matchingPolicy, substringMatching: true } }, { id: "bad-policy" }); check("unsafe-match-policy-rejected", false); }
    catch (error) { check("unsafe-match-policy-rejected", error.code === "UNSAFE_LEXICON_MATCH_POLICY"); }
  } catch (_) { check("self-test-unexpected-error", false); }
  return Object.freeze({ module: "nano-server-tts-knowledge-adapter-part2", improvementId: SWR_TTS_ADAPTER_IMPROVEMENT_ID,
    version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION, status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks) });
}

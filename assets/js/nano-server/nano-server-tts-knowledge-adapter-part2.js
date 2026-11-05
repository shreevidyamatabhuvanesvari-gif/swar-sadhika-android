/* Swar-Sadhika — Nano Server TTS Knowledge Adapter Part 2.
 * Reads SHA-256-verified JSON knowledge documents through the in-app Knowledge API.
 * Returns source-linked pronunciation guidance; never rewrites speech, executes code,
 * downloads automatically, changes prosody, trains models, or owns the shared API.
 */
export const NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION = "1.0.0";
export const TTS_KNOWLEDGE_DOCUMENT_SCHEMA = "swar-sadhika.sanskrit-tts-knowledge";

const MAX_DOCUMENTS = 100;
const MAX_ENTRIES = 5000;
const ID = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
const DEVANAGARI = /^[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+$/u;
const WORDS = /[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+/gu;
const API_METHODS = ["initialize", "getManifest", "listEntries", "readDocument"];

export class NanoServerTtsKnowledgeAdapterError extends Error {
  constructor(message, code = "TTS_KNOWLEDGE_ADAPTER_ERROR", details = null) {
    super(message);
    this.name = "NanoServerTtsKnowledgeAdapterError";
    this.code = code;
    this.details = details;
  }
}
const fail = (message, code, details) => { throw new NanoServerTtsKnowledgeAdapterError(message, code, details); };
const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
const freeze = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!object(value)) return value;
  const copy = {};
  Object.keys(value).forEach(key => { copy[key] = freeze(value[key]); });
  return Object.freeze(copy);
};
const termKey = (term, scope, shakha) => term + "\u0000" + scope + "\u0000" + (shakha || "");

function validateApi(api) {
  if (!object(api)) fail("Nano Server Knowledge API object आवश्यक है।", "KNOWLEDGE_API_REQUIRED");
  const missing = API_METHODS.filter(name => typeof api[name] !== "function");
  if (missing.length) fail("Knowledge API contract अधूरा है: " + missing.join(", "), "KNOWLEDGE_API_CONTRACT_MISMATCH", { missing });
  return api;
}

function validateDocument(doc, source) {
  if (!object(doc) || doc.schema !== TTS_KNOWLEDGE_DOCUMENT_SCHEMA ||
      doc.schemaVersion !== 1 || !Array.isArray(doc.entries)) {
    fail("Knowledge JSON document का schema अमान्य है।", "INVALID_KNOWLEDGE_DOCUMENT", { sourceId: source.id });
  }
  if (doc.entries.length > MAX_ENTRIES) fail("Knowledge entries सीमा से अधिक हैं।", "KNOWLEDGE_ENTRY_LIMIT");
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  const language = typeof doc.language === "string" ? doc.language.trim() : "sa";
  if (!version || version.length > 40) fail("Knowledge document version अमान्य है।", "INVALID_KNOWLEDGE_VERSION");
  if (!/^sa(?:-|$)/i.test(language)) fail("केवल संस्कृत (sa) Knowledge document स्वीकार है।", "INVALID_KNOWLEDGE_LANGUAGE", { language });

  const ids = new Set();
  const keys = new Set();
  const entries = doc.entries.map((item, index) => {
    if (!object(item) || typeof item.id !== "string" || !ID.test(item.id)) {
      fail("Knowledge entry ID अमान्य है।", "INVALID_KNOWLEDGE_ENTRY", { index });
    }
    if (ids.has(item.id)) fail("Duplicate Knowledge entry ID है।", "DUPLICATE_KNOWLEDGE_ENTRY_ID", { entryId: item.id });
    ids.add(item.id);
    const term = String(item.term || "").normalize("NFC").trim();
    const guidance = typeof item.guidance === "string" ? item.guidance.trim() : "";
    const scope = item.scope === undefined ? "general" : String(item.scope);
    const shakha = item.shakha == null ? "" : String(item.shakha).trim();
    const reviewStatus = item.reviewStatus === undefined ? "needs-review" : String(item.reviewStatus);
    if (!term || term.length > 128 || !DEVANAGARI.test(term)) fail("Knowledge term वैध देवनागरी शब्द होना चाहिए।", "INVALID_KNOWLEDGE_TERM", { entryId: item.id });
    if (!guidance || guidance.length > 1200) fail("Knowledge guidance रिक्त या बहुत लंबा है।", "INVALID_KNOWLEDGE_GUIDANCE", { entryId: item.id });
    if (!["general", "shakha-specific"].includes(scope) || (scope === "shakha-specific" && !shakha) || shakha.length > 64) {
      fail("Knowledge scope/shakha metadata अमान्य है।", "INVALID_KNOWLEDGE_SCOPE", { entryId: item.id });
    }
    if (!["draft", "reviewed", "needs-review"].includes(reviewStatus)) fail("reviewStatus अमान्य है।", "INVALID_REVIEW_STATUS", { entryId: item.id });
    const key = termKey(term, scope, shakha);
    if (keys.has(key)) fail("Duplicate term/scope/shakha entry है।", "DUPLICATE_KNOWLEDGE_TERM", { term, scope, shakha });
    keys.add(key);
    return Object.freeze({
      id: item.id, term, guidance, scope, shakha: shakha || null,
      category: typeof item.category === "string" ? item.category.slice(0, 64) : "pronunciation",
      reviewStatus,
      source: Object.freeze({ id: source.id, title: source.title, documentVersion: version })
    });
  });
  return Object.freeze({ schema: doc.schema, schemaVersion: 1, version, language: language.slice(0, 16), entries: Object.freeze(entries) });
}

function makeGuidance(text, options, index) {
  const shakha = options && typeof options.shakha === "string" ? options.shakha.trim() : "";
  const matches = [];
  const contextRequired = [];
  const seen = new Set();
  for (const match of String(text).matchAll(WORDS)) {
    const term = match[0].normalize("NFC");
    if (seen.has(term)) continue;
    seen.add(term);
    for (const entry of index.get(term) || []) {
      if (entry.scope === "general" || (shakha && entry.shakha === shakha)) matches.push(entry);
      else if (!shakha) contextRequired.push(Object.freeze({
        term: entry.term, entryId: entry.id, shakha: entry.shakha, source: entry.source
      }));
    }
  }
  return Object.freeze({
    matches: Object.freeze(matches),
    contextRequired: Object.freeze(contextRequired),
    matchedTermCount: new Set(matches.map(entry => entry.term)).size,
    note: "ये स्रोत-सहित मार्गदर्शन टिप्पणियाँ हैं; इन्हें स्वतः ध्वनि, मात्रा, पाठ या स्वराघात में लागू नहीं किया जाता।"
  });
}

export function createNanoServerTtsKnowledgeAdapter(options = {}) {
  if (!object(options)) fail("Adapter options object होना चाहिए।", "INVALID_ADAPTER_OPTIONS");
  const api = validateApi(options.knowledgeAPI);
  let disposed = false;
  let loading = null;
  let index = new Map();
  let documents = Object.freeze([]);
  let lastLoadAt = null;
  let lastError = null;
  const listeners = new Set();
  const assertActive = () => { if (disposed) fail("Adapter dispose हो चुका है।", "ADAPTER_DISPOSED"); };
  const emit = (type, detail) => {
    const event = Object.freeze({ type, detail: freeze(detail || {}), adapterVersion: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION });
    Array.from(listeners).forEach(callback => { try { callback(event); } catch (_) {} });
  };

  function onChange(callback) {
    assertActive();
    if (typeof callback !== "function") fail("Callback function आवश्यक है।", "INVALID_CALLBACK");
    listeners.add(callback);
    let active = true;
    return () => { if (!active) return false; active = false; listeners.delete(callback); return true; };
  }

  async function loadKnowledge(loadOptions = {}) {
    assertActive();
    if (!object(loadOptions)) fail("loadKnowledge options object होना चाहिए۔", "INVALID_LOAD_OPTIONS");
    if (loading) return loading;
    loading = (async () => {
      const downloadIfMissing = loadOptions.downloadIfMissing === true;
      if (loadOptions.entryIds !== undefined && !Array.isArray(loadOptions.entryIds)) fail("entryIds array होना चाहिए।", "INVALID_ENTRY_IDS");
      const requested = loadOptions.entryIds === undefined ? null : new Set(loadOptions.entryIds);
      if (requested && requested.size > MAX_DOCUMENTS) fail("एक बार में अधिकतम 100 documents चुनें।", "DOCUMENT_LIMIT_EXCEEDED");
      await api.initialize();
      assertActive();
      if (loadOptions.refreshManifest === true) {
        if (typeof api.refreshManifest !== "function") fail("Manifest refresh method उपलब्ध नहीं है।", "MANIFEST_REFRESH_UNAVAILABLE");
        await api.refreshManifest({ allowCached: true });
        assertActive();
      }
      const manifest = api.getManifest();
      if (!manifest || !Array.isArray(manifest.entries)) fail("Knowledge Manifest पहले लोड होना चाहिए।", "MANIFEST_NOT_READY");
      const available = api.listEntries();
      const docs = available.filter(entry => entry && entry.entryType === "knowledge-document" &&
        entry.enabled === true && String(entry.format).toLowerCase() === "json");
      const selected = requested ? docs.filter(entry => requested.has(entry.id)) : docs;
      if (requested) {
        const found = new Set(selected.map(entry => entry.id));
        const missing = Array.from(requested).filter(id => !found.has(id));
        if (missing.length) fail("चुने गए JSON documents सक्रिय Manifest में उपलब्ध नहीं हैं।", "KNOWLEDGE_DOCUMENT_NOT_FOUND", { missing });
      }
      if (selected.length > MAX_DOCUMENTS) fail("Manifest में TTS documents सीमा से अधिक हैं।", "DOCUMENT_LIMIT_EXCEEDED");
      const nextIndex = new Map();
      const nextDocuments = [];
      for (const entry of selected) {
        assertActive();
        const raw = await api.readDocument(entry.id, { downloadIfMissing });
        assertActive();
        const validated = validateDocument(raw, { id: entry.id, title: entry.title || entry.id });
        nextDocuments.push(Object.freeze({ id: entry.id, title: entry.title || entry.id, version: validated.version, entryCount: validated.entries.length }));
        for (const item of validated.entries) {
          const bucket = nextIndex.get(item.term) || [];
          if (bucket.some(old => termKey(old.term, old.scope, old.shakha) === termKey(item.term, item.scope, item.shakha))) {
            fail("अलग documents में duplicate term/scope/shakha entry है।", "DUPLICATE_KNOWLEDGE_TERM", { term: item.term, sourceId: entry.id });
          }
          bucket.push(item);
          nextIndex.set(item.term, bucket);
        }
      }
      assertActive();
      index = nextIndex;
      documents = Object.freeze(nextDocuments);
      lastLoadAt = new Date().toISOString();
      lastError = null;
      const result = getDiagnostics();
      emit("knowledgechange", result);
      return result;
    })();
    try {
      return await loading;
    } catch (error) {
      lastError = Object.freeze({ code: error && error.code || "KNOWLEDGE_LOAD_FAILED", message: error && error.message || String(error) });
      throw error;
    } finally {
      loading = null;
    }
  }

  function getGuidance(text, guidanceOptions = {}) {
    assertActive();
    if (typeof text !== "string") fail("text string होना चाहिए।", "INVALID_TEXT");
    if (!object(guidanceOptions)) fail("guidanceOptions object होना चाहिए।", "INVALID_GUIDANCE_OPTIONS");
    return makeGuidance(text, guidanceOptions, index);
  }

  function prepareSpeech(text, guidanceOptions = {}) {
    assertActive();
    if (typeof text !== "string") fail("text string होना चाहिए।", "INVALID_TEXT");
    return Object.freeze({
      originalText: text, speechText: text, modified: false,
      appliedToSpeech: false, safeToTransform: false,
      guidance: getGuidance(text, guidanceOptions),
      policy: "मूल पाठ अक्षरशः सुरक्षित है। यह Adapter केवल Knowledge annotations देता है; Native TTS उच्चारण, लय, pitch या गायन नहीं बदलता।"
    });
  }

  function getDiagnostics() {
    assertActive();
    const count = Array.from(index.values()).reduce((total, entries) => total + entries.length, 0);
    return Object.freeze({
      adapter: "nano-server-tts-knowledge-adapter", version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION,
      schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA, disposed, loaded: documents.length > 0,
      hasGuidance: count > 0, loadedDocuments: documents.length, loadedEntries: count,
      uniqueTerms: index.size, lastLoadAt, lastError,
      policy: Object.freeze({
        jsonDocumentsOnly: true, verifiedByKnowledgeAPI: true, autoDownload: false,
        executeDownloadedCode: false, rewriteSpeechText: false, applyProsody: false, trainModel: false
      })
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    index.clear();
    documents = Object.freeze([]);
    listeners.clear();
    return true;
  }

  return Object.freeze({
    adapterVersion: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION,
    schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA,
    loadKnowledge, getGuidance, prepareSpeech, getDiagnostics,
    getLoadedDocuments: () => { assertActive(); return Object.freeze(documents.slice()); },
    onChange, dispose
  });
}

export function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
  const source = { id: "test-knowledge", title: "Test Sanskrit knowledge" };
  const valid = {
    schemaVersion: 1, schema: TTS_KNOWLEDGE_DOCUMENT_SCHEMA, version: "1.0.0", language: "sa",
    entries: [
      { id: "agni", term: "अग्निमीळे", guidance: "पाठ-स्रोत के अनुसार उच्चारण जाँचें।", scope: "general" },
      { id: "agni-shakha", term: "अग्निमीळे", guidance: "शाखा-सापेक्ष निर्देश।", scope: "shakha-specific", shakha: "shaakala" }
    ]
  };
  try {
    const checked = validateDocument(valid, source);
    check("valid-schema-and-source", checked.entries.length === 2 && checked.entries[0].source.id === source.id);
    const map = new Map([[checked.entries[0].term, checked.entries]]);
    const generic = makeGuidance("ॐ अग्निमीळे नमः", {}, map);
    check("general-term-match", generic.matches.length === 1);
    check("shakha-context-required", generic.contextRequired.length === 1);
    check("shakha-specific-match", makeGuidance("अग्निमीळे", { shakha: "shaakala" }, map).matches.length === 2);
    check("nfc-normalization", "अग्निमीळे".normalize("NFC") === "अग्निमीळे");
  } catch (_) {
    ["valid-schema-and-source", "general-term-match", "shakha-context-required", "shakha-specific-match", "nfc-normalization"].forEach(id => check(id, false));
  }
  const rejects = (id, doc, code) => {
    try { validateDocument(doc, source); check(id, false); }
    catch (error) { check(id, error.code === code); }
  };
  rejects("reject-invalid-schema", { ...valid, schema: "javascript" }, "INVALID_KNOWLEDGE_DOCUMENT");
  rejects("reject-non-sanskrit-language", { ...valid, language: "hi" }, "INVALID_KNOWLEDGE_LANGUAGE");
  rejects("reject-invalid-term", { ...valid, entries: [{ id: "bad", term: "https://x", guidance: "x" }] }, "INVALID_KNOWLEDGE_TERM");
  rejects("reject-empty-guidance", { ...valid, entries: [{ id: "empty", term: "मन्त्र", guidance: " " }] }, "INVALID_KNOWLEDGE_GUIDANCE");
  rejects("reject-missing-shakha", { ...valid, entries: [{ id: "shakha", term: "मन्त्र", guidance: "x", scope: "shakha-specific" }] }, "INVALID_KNOWLEDGE_SCOPE");
  rejects("reject-duplicate-term", { ...valid, entries: [valid.entries[0], { ...valid.entries[0], id: "another" }] }, "DUPLICATE_KNOWLEDGE_TERM");
  rejects("reject-duplicate-id", { ...valid, entries: [{ id: "same", term: "मन्त्र", guidance: "x" }, { id: "same", term: "स्तोत्र", guidance: "y" }] }, "DUPLICATE_KNOWLEDGE_ENTRY_ID");
  rejects("reject-entry-limit", { ...valid, entries: Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({ id: "e" + i, term: "मन्त्र", guidance: "x" })) }, "KNOWLEDGE_ENTRY_LIMIT");
  return Object.freeze({
    module: "nano-server-tts-knowledge-adapter-part2", version: NANO_SERVER_TTS_KNOWLEDGE_ADAPTER_VERSION,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks)
  });
}
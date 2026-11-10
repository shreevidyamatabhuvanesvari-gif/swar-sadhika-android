/* Swar-Sadhika — Sanskrit Pronunciation Compiler.
 * SWR-TTS-COMPILER-07 — exact-token Hindi Native TTS phonetic-spelling trial.
 * No DOM, network, storage, dynamic imports, code execution, or global browser access.
 * Original Sanskrit text changes only for exact/contextual-exact Lexicon matches whose
 * speech application is explicitly enabled and whose nativeSpeechText is valid, or for
 * the narrowly scoped, exact Hindi-voice compatibility forms declared below.
 * Review, primary-source verification, phonetic review, and voice-test status are not
 * speech-application gates; declared voice restrictions and structural safety checks remain.
 */
import {
  analyzeVedicText,
  analyzePronunciationCandidates
} from "./vedic-sanskrit-pronunciation.js";

export const SANSKRIT_PRONUNCIATION_COMPILER_VERSION = "1.4.1";
export const SWR_TTS_COMPILER_IMPROVEMENT_ID = "SWR-TTS-COMPILER-07";

const NATIVE_TTS_ENGINE = "Web Speech API SpeechSynthesis";
const MAX_TEXT_LENGTH = 100000;
const DEVANAGARI_TOKEN = /^[\u0900-\u097F\uA8E0-\uA8FF\u{11B00}-\u{11B0A}\u{1CD0}-\u{1CFA}]+$/u;
const WORD_PATTERN_SOURCE = "[\\u0900-\\u097F\\uA8E0-\\uA8FF\\u{11B00}-\\u{11B0A}\\u{1CD0}-\\u{1CFA}]+";
const CONFIDENCE_STATES = new Set(["verified", "fallback", "ambiguous"]);

/*
 * These exact-token aliases are a temporary Native Hindi TTS compatibility layer.
 * They affect only speechText for hi-IN local voices. The original Sanskrit, on-screen
 * text, and G2P source remain unchanged. These are not grammar/orthography corrections,
 * IPA, voice-cloning, or a claim of verified recitation; they require device listening.
 */
const NATIVE_HI_TTS_COMPATIBILITY_RULES = Object.freeze([
  Object.freeze({ id: "shiv-tandava-compound-01", term: "जटाटवीगलज्जलप्रवाहपावितस्थले", nativeSpeechText: "जटाटवी गलज्जल प्रवाह पावित स्थले" }),
  Object.freeze({ id: "shiv-tandava-compound-02", term: "तुङ्गमालिकाम्", nativeSpeechText: "तुङ्ग मालिकाम्" }),
  Object.freeze({ id: "shiv-tandava-compound-03", term: "चण्डताण्डवं", nativeSpeechText: "चण्ड ताण्डवं" }),
  Object.freeze({ id: "shiv-tandava-compound-04", term: "जटाकटाहसम्भ्रमभ्रमन्निलिम्पनिर्झरी", nativeSpeechText: "जटा कटाह सम्भ्रम भ्रमन् निलिम्प निर्झरी" }),
  Object.freeze({ id: "shiv-tandava-compound-05", term: "विलोलवीचिवल्लरीविराजमानमूर्धनि", nativeSpeechText: "विलोल वीचि वल्लरी विराजमान मूर्धनि" }),
  Object.freeze({ id: "shiv-tandava-compound-06", term: "किशोरचन्द्रशेखरे", nativeSpeechText: "किशोर चन्द्र शेखरे" }),
  Object.freeze({ id: "shiv-tandava-compound-07", term: "धराधरेन्द्रनन्दिनीविलासबन्धुबन्धुर", nativeSpeechText: "धराधरेन्द्र नन्दिनी विलास बन्धु बन्धुर" }),
  Object.freeze({ id: "shiv-tandava-compound-08", term: "स्फुरद्दिगन्तसन्ततिप्रमोदमानमानसे", nativeSpeechText: "स्फुरद् दिगन्त सन्तति प्रमोदमान मानसे" }),
  Object.freeze({ id: "shiv-tandava-compound-09", term: "कृपाकटाक्षधोरणीनिरुद्धदुर्धरापदि", nativeSpeechText: "कृपा कटाक्ष धोरणी निरुद्ध दुर्धरापदि" }),
  Object.freeze({ id: "shiv-tandava-compound-10", term: "क्वचिद्दिगम्बरे", nativeSpeechText: "क्वचिद् दिगम्बरे" }),
  Object.freeze({ id: "shiv-tandava-compound-11", term: "पिङ्गलस्फुरत्फणा", nativeSpeechText: "पिङ्गल स्फुरत् फणा" }),
  Object.freeze({ id: "shiv-tandava-compound-12", term: "कदम्बकुङ्कुमद्रवप्रलिप्तदिग्वधूमुखे", nativeSpeechText: "कदम्ब कुङ्कुम द्रव प्रलिप्त दिग्वधू मुखे" }),
  Object.freeze({ id: "shiv-tandava-compound-13", term: "मदान्धसिन्धुरस्फुरत्त्वगुत्तरीयमेदुरे", nativeSpeechText: "मदान्ध सिन्धुर स्फुरत् त्वगुत्तरीय मेदुरे" }),
  Object.freeze({ id: "shiv-tandava-compound-14", term: "विनोदमद्भुतं", nativeSpeechText: "विनोद मद्भुतं" }),
  Object.freeze({ id: "shiv-tandava-compound-15", term: "सहस्रलोचनप्रभृत्यशेषलेखशेखर", nativeSpeechText: "सहस्र लोचन प्रभृत्यशेष लेख शेखर" }),
  Object.freeze({ id: "shiv-tandava-compound-16", term: "प्रसूनधूलिधोरणीविधूसराङ्घ्रिपीठभूः", nativeSpeechText: "प्रसून धूलि धोरणी विधूसराङ्घ्रि पीठ भूः" }),
  Object.freeze({ id: "shiv-tandava-compound-17", term: "चकोरबन्धुशेखरः", nativeSpeechText: "चकोर बन्धु शेखरः" }),
  Object.freeze({ id: "shiv-tandava-compound-18", term: "ललाटचत्वरज्वलद्धनञ्जयस्फुलिङ्गभा", nativeSpeechText: "ललाट चत्वर ज्वलद् धनञ्जय स्फुलिङ्ग भा" }),
  Object.freeze({ id: "shiv-tandava-compound-19", term: "निपीतपञ्चसायकं", nativeSpeechText: "निपीत पञ्च सायकं" }),
  Object.freeze({ id: "shiv-tandava-compound-20", term: "नमन्निलिम्पनायकम्", nativeSpeechText: "नमन् निलिम्प नायकम्" }),
  Object.freeze({ id: "shiv-tandava-compound-21", term: "सुधामयूखलेखया", nativeSpeechText: "सुधा मयूख लेखया" }),
  Object.freeze({ id: "shiv-tandava-compound-22", term: "विराजमानशेखरं", nativeSpeechText: "विराजमान शेखरं" }),
  Object.freeze({ id: "shiv-tandava-compound-23", term: "महाकपालिसम्पदे", nativeSpeechText: "महाकपालि सम्पदे" }),
  Object.freeze({ id: "shiv-tandava-compound-24", term: "नवीनमेघमण्डलीनिरुद्धदुर्धरस्फुरत्", nativeSpeechText: "नवीन मेघ मण्डली निरुद्ध दुर्धर स्फुरत्" }),
  Object.freeze({ id: "shiv-tandava-compound-25", term: "कुहूनिशीथिनीतमःप्रबन्धबद्धकन्धरः", nativeSpeechText: "कुहू निशीथिनी तमः प्रबन्ध बद्ध कन्धरः" }),
  Object.freeze({ id: "shiv-tandava-compound-26", term: "कृत्तिसिन्धुरः", nativeSpeechText: "कृत्ति सिन्धुरः" }),
  Object.freeze({ id: "shiv-tandava-compound-27", term: "कलानिधानबन्धुरः", nativeSpeechText: "कला निधान बन्धुरः" }),
  Object.freeze({ id: "shiv-tandava-compound-28", term: "जगद्धुरन्धरः", nativeSpeechText: "जगद् धुरन्धरः" }),
  Object.freeze({ id: "shiv-tandava-compound-29", term: "प्रफुल्लनीलपङ्कजप्रपञ्चकालिमप्रभावलम्बिकण्ठकन्दलीरुचिप्रबद्धकन्धरम्", nativeSpeechText: "प्रफुल्ल नील पङ्कज प्रपञ्च कालिम प्रभा वलम्बि कण्ठ कन्दली रुचि प्रबद्ध कन्धरम्" }),
  Object.freeze({ id: "shiv-tandava-compound-30", term: "अखर्वसर्वमङ्गलाकलाकदम्बमञ्जरी", nativeSpeechText: "अखर्व सर्वमङ्गला कला कदम्ब मञ्जरी" }),
  Object.freeze({ id: "shiv-tandava-compound-31", term: "रसप्रवाहमाधुरीविजृम्भणामधुव्रतम्", nativeSpeechText: "रस प्रवाह माधुरी विजृम्भणा मधुव्रतम्" }),
  Object.freeze({ id: "shiv-tandava-compound-32", term: "विनिर्गमत्क्रमस्फुरत्करालभालहव्यवाट्", nativeSpeechText: "विनिर्गमत् क्रम स्फुरत् कराल भाल हव्यवाट्" }),
  Object.freeze({ id: "shiv-tandava-compound-33", term: "ध्वनिक्रमप्रवर्तितप्रचण्डताण्डवः", nativeSpeechText: "ध्वनि क्रम प्रवर्तित प्रचण्ड ताण्डवः" }),
  Object.freeze({ id: "shiv-tandava-compound-34", term: "गरिष्ठरत्नलोष्ठयोः", nativeSpeechText: "गरिष्ठ रत्न लोष्ठयोः" }),
  Object.freeze({ id: "shiv-tandava-compound-35", term: "सुहृद्विपक्षपक्षयोः", nativeSpeechText: "सुहृद् विपक्ष पक्षयोः" }),
  Object.freeze({ id: "shiv-tandava-compound-36", term: "तृणारविन्दचक्षुषोः", nativeSpeechText: "तृणारविन्द चक्षुषोः" }),
  Object.freeze({ id: "shiv-tandava-compound-37", term: "प्रजामहीमहेन्द्रयोः", nativeSpeechText: "प्रजा मही महेन्द्रयोः" }),
  Object.freeze({ id: "shiv-tandava-compound-38", term: "समप्रवृत्तिकः", nativeSpeechText: "सम प्रवृत्तिकः" }),
  Object.freeze({ id: "shiv-tandava-compound-39", term: "निलिम्पनिर्झरीनिकुञ्जकोटरे", nativeSpeechText: "निलिम्प निर्झरी निकुञ्ज कोटरे" }),
  Object.freeze({ id: "shiv-tandava-compound-40", term: "विमुक्तदुर्मतिः", nativeSpeechText: "विमुक्त दुर्मतिः" }),
  Object.freeze({ id: "shiv-tandava-compound-41", term: "विमुक्तलोललोचनो", nativeSpeechText: "विमुक्त लोल लोचनो" }),
  Object.freeze({ id: "shiv-tandava-compound-42", term: "ललामभाललग्नकः", nativeSpeechText: "ललाम भाल लग्नकः" }),
  Object.freeze({ id: "shiv-tandava-compound-43", term: "दशवक्त्रगीतं", nativeSpeechText: "दश वक्त्र गीतं" }),
  Object.freeze({ id: "shiv-tandava-compound-44", term: "शम्भुपूजनपरं", nativeSpeechText: "शम्भु पूजन परं" }),
  Object.freeze({ id: "shiv-tandava-compound-45", term: "रथगजेन्द्रतुरङ्गयुक्तां", nativeSpeechText: "रथ गजेन्द्र तुरङ्ग युक्तां" }),

  Object.freeze({ id: "rudrashtaka-final-anusvara-nirvanarupam", term: "निर्वाणरूपं", nativeSpeechText: "निर्वाणरूपम्" }),
  Object.freeze({ id: "rudrashtaka-final-anusvara-nijam", term: "निजं", nativeSpeechText: "निजम्" }),
  Object.freeze({ id: "rudrashtaka-final-anusvara-niriham", term: "निरीहं", nativeSpeechText: "निरीहम्" }),
  Object.freeze({ id: "rudrashtaka-final-anusvara-gotitamisham", term: "गोतीतमीशं", nativeSpeechText: "गोतीतमीशम्" }),
  Object.freeze({ id: "rudrashtaka-janga-short-hi-tts", term: "भुजङ्ग", nativeSpeechText: "भुजन्ग" }),
  Object.freeze({ id: "rudrashtaka-janga-hi-tts", term: "भुजङ्गा", nativeSpeechText: "भुजन्गा" }),
  Object.freeze({ id: "rudrashtaka-avagraha-bajeham", term: "भजेऽहं", nativeSpeechText: "भजेहम्" }),
  Object.freeze({ id: "rudrashtaka-avagraha-natoham", term: "नतोऽहम्", nativeSpeechText: "नतोहम्" })
]);


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

function normalizeBcp47Locale(value) {
  if (!isNonEmptyString(value)) return "";
  const candidate = value.trim().replace(/_/g, "-");
  if (!isValidLocale(candidate)) return "";
  return candidate.split("-").map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[a-z]{4}$/i.test(part)) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
    if (/^(?:[a-z]{2}|[0-9]{3})$/i.test(part)) return part.toUpperCase();
    return part.toLowerCase();
  }).join("-");
}

function isValidLocale(value) {
  return typeof value === "string" && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim());
}


function createNativeHiTtsCompatibilityEntries(selectedVoiceProfile, existingEntries = []) {
  if (!selectedVoiceProfile || normalizeLocale(selectedVoiceProfile.locale) !== "hi-in") return [];
  const existingTerms = new Set(existingEntries
    .filter(entry => isObject(entry) && isNonEmptyString(entry.term))
    .map(entry => normalizeTextToken(entry.term)));
  const documentId = "native-hi-tts-compatibility-rules";
  const documentVersion = "1.0.0";
  return NATIVE_HI_TTS_COMPATIBILITY_RULES
    .filter(rule => !existingTerms.has(normalizeTextToken(rule.term)))
    .map(rule => ({
      id: "native-compatibility:" + rule.id,
      term: rule.term,
      matchType: "exact",
      phoneticStructure: {
        status: "pending-review",
        orthographicUnits: [],
        phonemeSequence: [],
        syllableBoundaries: [],
        analysisSource: "explicit-user-reported-native-tts-compatibility-hint",
        reviewedBy: null,
        reviewedAt: null
      },
      phonemeReference: { system: "IPA", value: null, status: "pending-review", source: null },
      ipa: null,
      nativeSpeechText: rule.nativeSpeechText,
      voiceLocales: ["hi-IN"],
      voiceProfile: {
        engine: NATIVE_TTS_ENGINE,
        platform: null,
        voiceName: null,
        voiceURI: null,
        locale: null,
        testStatus: "not-tested",
        testEvidence: null,
        testedAt: null
      },
      context: {
        scope: "general",
        shakha: null,
        patha: null,
        requiredSequence: null,
        precedingWords: [],
        followingWords: [],
        notes: "सीमित exact-token Hindi Native TTS compatibility hint; मूल संस्कृत पाठ और G2P अपरिवर्तित। वास्तविक Voice परीक्षण लंबित।"
      },
      scope: "general",
      source: {
        type: "user-reported-native-tts-compatibility-trial",
        documentId,
        documentVersion,
        entryId: rule.id,
        reportedReference: null,
        primarySourceVerified: false,
        sourceReviewStatus: "needs-review",
        sourceNote: "यह रूप केवल उपयोगकर्ता द्वारा बताई गई Native TTS उच्चारण समस्या के लिए परीक्षणार्थ है; इसे संस्कृत वर्तनी या शास्त्रीय पाठ का संशोधन न मानें।",
        primarySource: null
      },
      documentVersion,
      documentSource: {
        id: documentId,
        title: "Swar-Sadhika Native Hindi TTS compatibility rules",
        documentVersion,
        sha256: null,
        catalogVersion: "built-in"
      },
      reviewStatus: "needs-review",
      activation: {
        enabled: true,
        lookupEnabled: true,
        analysisEnabled: true,
        reviewEnabled: true,
        reason: "केवल घोषित hi-IN Voice और पूर्ण exact-token match पर सीमित speech-only परीक्षण।"
      },
      speechApplication: {
        enabled: true,
        status: "experimental-device-listening-required",
        reason: "मूल पाठ/विश्लेषण सुरक्षित रखते हुए केवल स्थानीय Hindi TTS के लिए परीक्षणार्थ वाचन-रूप।"
      }
    }));
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

function utf16OffsetFromCodePoint(text, codePointIndex) {
  if (!Number.isInteger(codePointIndex) || codePointIndex < 0) return null;
  let utf16Offset = 0;
  let remaining = codePointIndex;
  for (const character of text) {
    if (remaining === 0) return utf16Offset;
    utf16Offset += character.length;
    remaining -= 1;
  }
  return remaining === 0 ? utf16Offset : null;
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

function resolveVoiceProfile(voice, suppliedProfile = {}) {
  if (!isObject(voice)) {
    return { valid: false, code: "NATIVE_VOICE_MISSING", message: "चयनित Native Speech Voice उपलब्ध नहीं है।" };
  }
  if (voice.localService !== true) {
    return {
      valid: false,
      code: voice.localService === false ? "NATIVE_VOICE_NOT_LOCAL" : "NATIVE_VOICE_LOCALITY_UNVERIFIED",
      message: "केवल localService=true वाली सत्यापित स्थानीय Native Voice स्वीकार है।"
    };
  }

  const name = isNonEmptyString(voice.name) ? voice.name.trim() : "";
  const voiceURI = isNonEmptyString(voice.voiceURI) ? voice.voiceURI.trim() : "";
  const rawLocale = isNonEmptyString(voice.lang) ? voice.lang.trim() : "";
  const normalizedVoiceLocale = normalizeBcp47Locale(rawLocale);
  const suppliedNormalizedLocale = normalizeBcp47Locale(
    suppliedProfile.normalizedLocale || suppliedProfile.locale || rawLocale
  );
  const locale = normalizedVoiceLocale;
  const engine = isNonEmptyString(suppliedProfile.engine) ? suppliedProfile.engine.trim() : NATIVE_TTS_ENGINE;
  const platform = isNonEmptyString(suppliedProfile.platform) ? suppliedProfile.platform.trim() : "";

  if (!name || !voiceURI || !rawLocale || !normalizedVoiceLocale) {
    return { valid: false, code: "NATIVE_VOICE_PROFILE_INCOMPLETE", message: "चयनित Native Voice का नाम, voiceURI और मान्य BCP-47 locale आवश्यक हैं।" };
  }
  if (!suppliedNormalizedLocale || normalizeLocale(suppliedNormalizedLocale) !== normalizeLocale(normalizedVoiceLocale)) {
    return {
      valid: false,
      code: "SELECTED_VOICE_PROFILE_MISMATCH",
      message: "Raw locale और supplied normalizedLocale एक ही भाषा पहचान नहीं बताते।",
      details: { rawLocale, normalizedLocale: normalizedVoiceLocale, suppliedNormalizedLocale }
    };
  }
  if (suppliedProfile.rawLocale && String(suppliedProfile.rawLocale).trim() !== rawLocale) {
    return {
      valid: false,
      code: "SELECTED_VOICE_PROFILE_MISMATCH",
      message: "दिए गए Raw locale और वास्तविक Native Voice.lang में अंतर है।",
      details: { rawLocale, suppliedRawLocale: suppliedProfile.rawLocale }
    };
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
      platformVerified: Boolean(platform),
      runtimeBrowser: isNonEmptyString(suppliedProfile.runtimeBrowser) ? suppliedProfile.runtimeBrowser : "",
      platformEvidence: isNonEmptyString(suppliedProfile.platformEvidence) ? suppliedProfile.platformEvidence : "",
      voiceName: name,
      voiceURI,
      rawLocale,
      locale,
      normalizedLocale: locale,
      localService: true
    })
  };
}

function validateLexiconEntryForSpeech(entry, selectedVoiceProfile) {
  const reasons = [];
  if (!isObject(entry)) return { ready: false, reasons: ["entry-not-an-object"] };

  // Review and evidence states remain provenance metadata, not speech-application gates.
  if (!isObject(entry.source)) reasons.push("source-metadata-missing");
  if (!isObject(entry.phoneticStructure)) reasons.push("phonetic-structure-missing");
  else if (entry.phoneticStructure.status === "invalid") reasons.push("phonetic-structure-marked-invalid");
  if (!isObject(entry.phonemeReference)) reasons.push("phoneme-reference-missing");
  else if (entry.phonemeReference.status === "invalid") reasons.push("phoneme-reference-marked-invalid");

  const nativeSpeechText = isNonEmptyString(entry.nativeSpeechText)
    ? entry.nativeSpeechText.trim()
    : "";
  if (!nativeSpeechText ||
      !nativeSpeechText.split(/\s+/u).every(part => DEVANAGARI_TOKEN.test(part))) {
    reasons.push("native-speech-text-invalid");
  }

  if (!Array.isArray(entry.voiceLocales) ||
      entry.voiceLocales.some(locale => !isValidLocale(locale))) {
    reasons.push("voice-locales-invalid");
  } else if (entry.voiceLocales.length &&
      !entry.voiceLocales.some(locale => normalizeLocale(locale) === normalizeLocale(selectedVoiceProfile.locale))) {
    reasons.push("voice-locale-mismatch");
  }

  if (!isObject(entry.voiceProfile)) {
    reasons.push("voice-profile-missing");
  } else {
    const profile = entry.voiceProfile;
    const declaredVoiceName = profile.voiceName || profile.name;
    const declaredLocale = profile.locale;
    if (isNonEmptyString(profile.engine) && profile.engine !== selectedVoiceProfile.engine) {
      reasons.push("voice-engine-mismatch");
    }
    if (isNonEmptyString(profile.platform)) {
      if (!isNonEmptyString(selectedVoiceProfile.platform)) {
        reasons.push("voice-platform-unverified");
      } else if (profile.platform !== selectedVoiceProfile.platform) {
        reasons.push("voice-platform-mismatch");
      }
    }
    if (isNonEmptyString(declaredVoiceName) && declaredVoiceName !== selectedVoiceProfile.voiceName) {
      reasons.push("voice-name-mismatch");
    }
    if (isNonEmptyString(profile.voiceURI) && profile.voiceURI !== selectedVoiceProfile.voiceURI) {
      reasons.push("voice-uri-mismatch");
    }
    if (isNonEmptyString(declaredLocale) &&
        (!isValidLocale(declaredLocale) ||
         normalizeLocale(declaredLocale) !== normalizeLocale(selectedVoiceProfile.locale))) {
      reasons.push("voice-profile-locale-mismatch");
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
  if (isObject(entry.context)) {
    if (entry.context.patha !== null && entry.context.patha !== undefined &&
        !isNonEmptyString(entry.context.patha)) reasons.push("invalid-context-patha");
    if (!Array.isArray(entry.context.precedingWords) || !Array.isArray(entry.context.followingWords)) {
      reasons.push("invalid-context-word-arrays");
    }
    if (entry.matchType === "contextual-exact" &&
        (!Array.isArray(entry.context.requiredSequence) || !entry.context.requiredSequence.length)) {
      reasons.push("contextual-sequence-missing");
    }
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


function compileNativeHiTtsCompatibility(originalText, selectedVoiceProfile, analysis = null) {
  if (!selectedVoiceProfile ||
      normalizeLocale(selectedVoiceProfile.locale) !== "hi-in" ||
      selectedVoiceProfile.localService !== true) return null;

  const tokens = tokenizeWithOffsets(originalText);
  const rulesByTerm = new Map(NATIVE_HI_TTS_COMPATIBILITY_RULES.map(rule => [
    normalizeTextToken(rule.term), rule
  ]));
  const documentId = "native-hi-tts-compatibility-rules";
  const documentVersion = "1.0.1";
  const source = {
    type: "user-reported-native-tts-compatibility-trial",
    documentId,
    documentVersion,
    entryId: "exact-token-hindi-voice-compatibility",
    reportedReference: null,
    primarySourceVerified: false,
    sourceReviewStatus: "needs-review",
    sourceNote: "यह वाचन-रूप केवल उपयोगकर्ता द्वारा रिपोर्ट किए गए Hindi Native TTS दोषों के लिए परीक्षणार्थ है; यह संस्कृत वर्तनी/पाठ का संशोधन या प्रमाणित IPA नहीं है।",
    primarySource: null
  };
  const documentSource = {
    id: documentId,
    title: "Swar-Sadhika Native Hindi TTS compatibility rules",
    documentVersion,
    sha256: null,
    catalogVersion: "built-in"
  };
  const voiceProfile = {
    engine: selectedVoiceProfile.engine,
    platform: selectedVoiceProfile.platform || null,
    voiceName: selectedVoiceProfile.voiceName || null,
    voiceURI: selectedVoiceProfile.voiceURI || null,
    locale: selectedVoiceProfile.locale,
    testStatus: "not-tested",
    testEvidence: null,
    testedAt: null
  };
  const replacements = [];

  tokens.forEach(token => {
    const rule = rulesByTerm.get(token.normalized);
    if (!rule || rule.nativeSpeechText === token.text) return;
    const entry = {
      id: "native-compatibility:" + rule.id,
      term: rule.term,
      matchType: "exact",
      nativeSpeechText: rule.nativeSpeechText,
      source,
      documentSource,
      documentVersion,
      voiceProfile
    };
    replacements.push({
      entry,
      ruleId: "native-compatibility:" + rule.id + ":" + token.startUtf16Index,
      startUtf16: token.startUtf16Index,
      endUtf16: token.endUtf16Index
    });
  });

  if (!replacements.length) return null;
  const mapped = buildSourceMap(originalText, replacements);
  const matchedLexiconEntries = replacements.map(item => deepFreeze({
    id: item.entry.id,
    term: item.entry.term,
    matchType: "exact",
    source,
    documentSource,
    documentVersion,
    voiceProfile,
    sourceStartUtf16: item.startUtf16,
    sourceEndUtf16: item.endUtf16,
    applied: true
  }));
  const appliedRules = replacements.map(item => deepFreeze({
    ruleId: item.ruleId,
    entryId: item.entry.id,
    term: item.entry.term,
    matchType: "exact",
    originalForm: originalText.slice(item.startUtf16, item.endUtf16),
    nativeSpeechText: item.entry.nativeSpeechText,
    source,
    documentSource,
    documentVersion,
    voiceProfile,
    sourceStartUtf16: item.startUtf16,
    sourceEndUtf16: item.endUtf16
  }));
  const compiled = deepFreeze({
    originalText,
    speechText: mapped.speechText,
    modified: mapped.speechText !== originalText,
    confidence: "verified",
    matchedLexiconEntries,
    appliedRules,
    warnings: [
      makeWarning(
        "NATIVE_HI_TTS_COMPATIBILITY_TRIAL",
        "Hindi स्थानीय Voice के लिए exact शब्द-मिलान का परीक्षणार्थ वाचन-रूप लागू हुआ। वास्तविक ध्वनि की पुष्टि डिवाइस पर श्रवण से ही होगी।",
        "warning",
        { locale: selectedVoiceProfile.locale, voiceURI: selectedVoiceProfile.voiceURI || null }
      )
    ],
    sourceMap: mapped.sourceMap,
    compilerVersion: SANSKRIT_PRONUNCIATION_COMPILER_VERSION,
    improvementId: SWR_TTS_COMPILER_IMPROVEMENT_ID,
    analysisSummary: {
      originalTextPreserved: true,
      orthographicUnitCount: analysis && analysis.phoneticStructure &&
        Array.isArray(analysis.phoneticStructure.orthographicUnits)
        ? analysis.phoneticStructure.orthographicUnits.length : 0,
      phonemeSequenceInferredByAnalyzer: false,
      lexiconPhoneticsRequired: false,
      speechApplicationRequiresExplicitAuthorization: true,
      sourceEvidenceReviewRequiredForSpeech: false
    }
  });
  const validation = validateCompiledSpeech(compiled);
  return validation.valid ? compiled : null;
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
        if (!outputText.split(/\s+/u).every(part => DEVANAGARI_TOKEN.test(part))) errors.push("replacement-output-is-not-devanagari-word-sequence");
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

    const voiceResult = resolveVoiceProfile(request.voice || request.selectedVoice, request.voiceProfile || {});
    if (!voiceResult.valid) {
      warnings.push(makeWarning(voiceResult.code, voiceResult.message, "warning", voiceResult.details || null));
      return fallbackResult(originalText, warnings, analysis);
    }
    const selectedVoiceProfile = voiceResult.profile;
    if (!selectedVoiceProfile.platformVerified) {
      warnings.push(makeWarning(
        "NATIVE_VOICE_PLATFORM_UNVERIFIED",
        "Chrome ब्राउज़र की पहचान उपलब्ध है, लेकिन Android OS/platform की पुष्टि browser metadata से नहीं हुई। Android Chrome-विशिष्ट Lexicon नियम तब तक लागू नहीं होंगे जब तक platform सत्यापित न हो।",
        "warning",
        { browser: selectedVoiceProfile.runtimeBrowser || null, evidence: selectedVoiceProfile.platformEvidence || null }
      ));
    }

    const compatibilityOutput = compileNativeHiTtsCompatibility(originalText, selectedVoiceProfile, analysis);
    if (compatibilityOutput) return compatibilityOutput;

    const adapter = request.adapter || request.knowledgeAdapter;
    if (!isObject(adapter) || typeof adapter.getPronunciationEntries !== "function") {
      warnings.push(makeWarning("PRONUNCIATION_ADAPTER_UNAVAILABLE", "सत्यापित Pronunciation Lexicon उपलब्ध नहीं है; Native TTS को मूल पाठ दिया जाएगा।", "warning"));
      return fallbackResult(originalText, warnings, analysis);
    }
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
    const existingCandidates = Array.from(candidateMap.values());
    for (const entry of createNativeHiTtsCompatibilityEntries(selectedVoiceProfile, existingCandidates)) {
      candidateMap.set(entry.id, entry);
    }
    const candidates = Array.from(candidateMap.values());
    if (!candidates.length) {
      warnings.push(makeWarning("NO_ACTIVE_LEXICON_MATCH", "चयनित Voice और Context के लिए कोई सक्रिय तथा उपयोग योग्य Pronunciation Entry उपलब्ध नहीं है; Native TTS Fallback लागू है।", "warning"));
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
        warnings.push(makeWarning("LEXICON_ENTRY_NOT_COMPILER_READY", "Lexicon Entry की संरचना, स्पष्ट Speech Authorization, Native Speech Text या घोषित Voice प्रतिबंध अमान्य हैं; मूल शब्द सुरक्षित रखा गया।", "warning", {
          entryId: entry.id,
          reasons: readiness.reasons
        }));
        continue;
      }
      const normalizedMatch = {
        ...match,
        termStartUtf16Index: Number.isInteger(match.termStartUtf16Index)
          ? match.termStartUtf16Index
          : utf16OffsetFromCodePoint(originalText, match.termStartCodePointIndex),
        termEndUtf16Index: Number.isInteger(match.termEndUtf16Index)
          ? match.termEndUtf16Index
          : utf16OffsetFromCodePoint(originalText, match.termEndCodePointIndex)
      };
      if (!contextMatches(entry, normalizedMatch, originalText, request)) {
        warnings.push(makeWarning("LEXICON_CONTEXT_MISMATCH", "Exact Word, Context, Shakha या Patha का पूरा मिलान नहीं हुआ; संबंधित शब्द अपरिवर्तित रखा गया।", "ambiguous", {
          entryId: entry.id,
          term: entry.term
        }));
        continue;
      }
      if (!Number.isInteger(normalizedMatch.termStartUtf16Index) || !Number.isInteger(normalizedMatch.termEndUtf16Index) ||
          normalizedMatch.termStartUtf16Index < 0 || normalizedMatch.termEndUtf16Index <= normalizedMatch.termStartUtf16Index ||
          normalizedMatch.termEndUtf16Index > originalText.length) {
        warnings.push(makeWarning("MATCH_OFFSETS_INVALID", "Analyzer ने सुरक्षित source offsets नहीं दिए; संबंधित परिवर्तन अस्वीकार किया गया।", "ambiguous", {
          entryId: entry.id
        }));
        continue;
      }
      const sourceTerm = originalText.slice(normalizedMatch.termStartUtf16Index, normalizedMatch.termEndUtf16Index);
      if (normalizeTextToken(sourceTerm) !== normalizeTextToken(entry.term)) {
        warnings.push(makeWarning("SOURCE_TERM_MISMATCH", "Analyzer का exact source term Lexicon term से मेल नहीं खाता; परिवर्तन अस्वीकार किया गया।", "ambiguous", {
          entryId: entry.id
        }));
        continue;
      }

      const ruleId = "lexicon:" + entry.id + ":" + normalizedMatch.termStartUtf16Index;
      const record = {
        entry,
        match: normalizedMatch,
        ruleId,
        startUtf16: normalizedMatch.termStartUtf16Index,
        endUtf16: normalizedMatch.termEndUtf16Index
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
      warnings.push(makeWarning("NO_APPLICABLE_PRONUNCIATION_RULE", "इस पाठ के लिए कोई लागू और स्पष्ट रूप से अधिकृत Pronunciation Rule नहीं मिला; Native TTS Fallback लागू है।", "warning"));
    }
    if (!matchedLexiconEntries.length && candidateAnalysis.matches.length) {
      warnings.push(makeWarning("ALL_MATCHES_REJECTED", "सभी matched entries Compiler की संरचनात्मक, Authorization, Native Speech Text या declared-Voice जाँच में अस्वीकृत हुईं; मूल पाठ सुरक्षित है।", "warning"));
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
        lexiconPhoneticsRequired: false,
        speechApplicationRequiresExplicitAuthorization: true,
        sourceEvidenceReviewRequiredForSpeech: false
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
      onlyReviewedEntries: false,
      primarySourceRequired: false,
      verifiedPhoneticStructureRequired: false,
      testedNativeVoiceRequired: false,
      explicitSpeechAuthorizationRequired: true,
      nonEmptyNativeSpeechTextRequired: true,
      declaredVoiceRestrictionsEnforced: true,
      invalidPhoneticMetadataRejected: true,
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

    const unreviewedDirectEntry = fixtureEntry({
      reviewStatus: "needs-review",
      source: {
        type: "existing-knowledge-document",
        documentId: "secondary-reference",
        documentVersion: "1.0.0",
        entryId: "unreviewed-agni",
        reportedReference: null,
        primarySourceVerified: false,
        sourceReviewStatus: "needs-review",
        primarySource: null
      },
      phoneticStructure: { status: "pending-review", orthographicUnits: [], phonemeSequence: [] },
      phonemeReference: { system: "IPA", value: null, status: "pending-review", source: null },
      voiceLocales: [],
      voiceProfile: {
        engine: NATIVE_TTS_ENGINE,
        platform: "Android Chrome",
        voiceName: null,
        voiceURI: null,
        locale: null,
        testStatus: "not-tested",
        testEvidence: null
      },
      speechApplication: { enabled: true, status: "enabled-awaiting-native-speech-text" }
    });
    const unreviewed = compile("अग्निः", [unreviewedDirectEntry]);
    check("unreviewed-unverified-unprofiled-entry-can-apply", unreviewed.speechText === "अग्नि" && unreviewed.modified);
    check("direct-application-retains-unverified-provenance", unreviewed.appliedRules.length === 1 &&
      unreviewed.appliedRules[0].source.primarySourceVerified === false &&
      unreviewed.appliedRules[0].voiceProfile.testStatus === "not-tested");
    check("explicit-authorization-diagnostics", getCompilerDiagnostics(unreviewed).policy.onlyReviewedEntries === false &&
      getCompilerDiagnostics(unreviewed).policy.primarySourceRequired === false &&
      getCompilerDiagnostics(unreviewed).policy.explicitSpeechAuthorizationRequired === true);

    const underscoreLocale = compile("अग्निः", [fixtureEntry()], {
      voice: { ...voice, lang: "hi_IN" },
      voiceProfile: {
        ...voiceProfile,
        rawLocale: "hi_IN",
        locale: "hi-IN",
        normalizedLocale: "hi-IN"
      }
    });
    check("underscore-native-locale-normalized-to-bcp47", underscoreLocale.speechText === "अग्नि" &&
      underscoreLocale.modified && !underscoreLocale.warnings.some(item => item.code === "NATIVE_VOICE_PROFILE_INCOMPLETE"));

    const normalizedLocaleMismatch = compile("अग्निः", [fixtureEntry()], {
      voice: { ...voice, lang: "hi_IN" },
      voiceProfile: { ...voiceProfile, normalizedLocale: "en-US", locale: "en-US" }
    });
    check("normalized-locale-mismatch-safe-fallback", normalizedLocaleMismatch.speechText === "अग्निः" &&
      normalizedLocaleMismatch.warnings.some(item => item.code === "SELECTED_VOICE_PROFILE_MISMATCH"));

    const unverifiedPlatform = compile("अग्निः", [fixtureEntry()], {
      voice: { ...voice, lang: "hi_IN" },
      voiceProfile: {
        engine: NATIVE_TTS_ENGINE,
        platform: "",
        rawLocale: "hi_IN",
        locale: "hi-IN",
        normalizedLocale: "hi-IN",
        runtimeBrowser: "Chrome"
      }
    });
    check("unverified-platform-does-not-authorize-platform-specific-lexicon", unverifiedPlatform.speechText === "अग्निः" &&
      !unverifiedPlatform.modified &&
      unverifiedPlatform.warnings.some(item => item.code === "NATIVE_VOICE_PLATFORM_UNVERIFIED") &&
      unverifiedPlatform.warnings.some(item => item.details && Array.isArray(item.details.reasons) &&
        item.details.reasons.includes("voice-platform-unverified")));

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
    const contextual = compile("सदाशिवं भजे", [contextualEntry]);
    check("contextual-sequence-replaces-term-only", contextual.speechText === "सदाशिवम् भजे" && contextual.modified);

    const wrongContext = compile("सदाशिवं नमः", [contextualEntry]);
    check("contextual-mismatch-fallback", wrongContext.speechText === "सदाशिवं नमः" && !wrongContext.modified);

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

    const malformedSource = compile("अग्निः", [fixtureEntry({ source: null })]);
    check("missing-source-metadata-rejected", malformedSource.speechText === "अग्निः" && !malformedSource.modified);

    const missingSpeechText = compile("अग्निः", [fixtureEntry({ nativeSpeechText: null })]);
    check("missing-native-speech-text-rejected", missingSpeechText.speechText === "अग्निः" && !missingSpeechText.modified);

    const invalidPhonetics = compile("अग्निः", [fixtureEntry({
      phoneticStructure: { status: "invalid", orthographicUnits: [], phonemeSequence: [] }
    })]);
    check("explicitly-invalid-phonetics-rejected", invalidPhonetics.speechText === "अग्निः" && !invalidPhonetics.modified);

    const unauthorizedSpeech = compile("अग्निः", [fixtureEntry({ speechApplication: { enabled: false } })]);
    check("speech-application-authorization-required", unauthorizedSpeech.speechText === "अग्निः" && !unauthorizedSpeech.modified);

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

    const exactUserWords = compile("भुजङ्ग, भजेऽहं", [
      fixtureEntry({ id: "inactive-bhujanga", term: "भुजङ्ग", nativeSpeechText: null,
        voiceProfile: { ...fixtureEntry().voiceProfile, platform: "Android Chrome" } })
    ]);
    check("reported-bhujanga-bhajeham-forms-applied-before-inactive-lexicon",
      exactUserWords.speechText === "भुजन्ग, भजेहम्" &&
      exactUserWords.appliedRules.length === 2 &&
      exactUserWords.appliedRules[0].originalForm === "भुजङ्ग" &&
      exactUserWords.appliedRules[1].originalForm === "भजेऽहं");
    check("reported-bhujanga-bhajeham-source-map-valid",
      exactUserWords.originalText === "भुजङ्ग, भजेऽहं" &&
      validateCompiledSpeech(exactUserWords).valid &&
      exactUserWords.appliedRules.every(rule => rule.source.primarySourceVerified === false &&
        rule.voiceProfile.testStatus === "not-tested"));
    const phoneticBhujanga = compile("भुजङ्ग", []);
    check("bhujanga-phonetic-hint-uses-halant-na",
      phoneticBhujanga.speechText === "भुजन्ग" &&
      phoneticBhujanga.appliedRules.length === 1 &&
      validateCompiledSpeech(phoneticBhujanga).valid);
    const phoneticBhujangaLong = compile("भुजङ्गा", []);
    check("bhujanga-long-form-phonetic-hint-uses-halant-na",
      phoneticBhujangaLong.speechText === "भुजन्गा" &&
      phoneticBhujangaLong.appliedRules.length === 1 &&
      validateCompiledSpeech(phoneticBhujangaLong).valid);
    const avagrahaOnly = compile("भजेऽहं", []);
    check("avagraha-word-exact-match", avagrahaOnly.speechText === "भजेहम्" &&
      avagrahaOnly.appliedRules.length === 1);
    const bhujangaSubstring = compile("भुजङ्गाधिप", []);
    check("bhujanga-compatibility-does-not-rewrite-compound-substring",
      bhujangaSubstring.speechText === "भुजङ्गाधिप" && !bhujangaSubstring.modified);

    const compatibilityInput = "निर्वाणरूपं निजं निरीहं गोतीतमीशं भुजङ्गा भजेऽहं नतोऽहम्";
    const compatibilityExpected = "निर्वाणरूपम् निजम् निरीहम् गोतीतमीशम् भुजन्गा भजेहम् नतोहम्";
    const compatibility = compile(compatibilityInput, []);
    check("hi-in-compatibility-exact-forms", compatibility.speechText === compatibilityExpected &&
      compatibility.modified && compatibility.appliedRules.length === 7);
    check("compatibility-preserves-original-and-source-map", compatibility.originalText === compatibilityInput &&
      validateCompiledSpeech(compatibility).valid &&
      compatibility.appliedRules.every(rule => rule.source.primarySourceVerified === false &&
        rule.voiceProfile.testStatus === "not-tested"));
    const compatibilityNearMatch = compile("निर्वाणरूपंकार", []);
    check("compatibility-does-not-rewrite-substrings", compatibilityNearMatch.speechText === "निर्वाणरूपंकार" &&
      !compatibilityNearMatch.modified);
    const sanskritLocaleCompatibility = compile(compatibilityInput, [], {
      voice: { ...voice, lang: "sa-IN" }
    });
    check("compatibility-is-limited-to-hi-in-voice", sanskritLocaleCompatibility.speechText === compatibilityInput &&
      !sanskritLocaleCompatibility.modified);

    const shivaCompoundInput = "जटाटवीगलज्जलप्रवाहपावितस्थले विलोलवीचिवल्लरीविराजमानमूर्धनि"; 
    const shivaCompound = compile(shivaCompoundInput, []);
    check("shiv-tandava-long-compounds-get-recitation-chunks",
      shivaCompound.speechText === "जटाटवी गलज्जल प्रवाह पावित स्थले विलोल वीचि वल्लरी विराजमान मूर्धनि" &&
      shivaCompound.appliedRules.length === 2);
    check("shiv-tandava-chunking-preserves-original-text",
      shivaCompound.originalText === shivaCompoundInput &&
      shivaCompound.modified &&
      validateCompiledSpeech(shivaCompound).valid &&
      shivaCompound.appliedRules.every(rule =>
        [...rule.originalForm].join("") === [...rule.nativeSpeechText.replace(/\\s+/gu, "")].join("")));
    const shivaDamaru = compile("डमड्डमड्डमड्डमन्निनादवड्डमर्वयं", []);
    check("shiv-tandava-damaru-onomatopoeia-remains-unchanged",
      shivaDamaru.speechText === "डमड्डमड्डमड्डमन्निनादवड्डमर्वयं" && !shivaDamaru.modified);
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

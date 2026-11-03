export const LANGUAGE_MODES = Object.freeze({
  vedic: Object.freeze({
    id: 'vedic',
    label: 'वैदिक संस्कृत',
    speechLang: 'sa-IN',
    primaryLanguage: 'sa',
    fallbackLanguage: 'hi',
    hint: 'वैदिक पाठ में उदात्त, अनुदात्त और स्वरित चिह्न (जहाँ उपलब्ध हों) यथावत रखें। डिवाइस की सामान्य आवाज़ वैदिक स्वर-पाठ प्रमाणित नहीं करती।'
  }),
  sanskrit: Object.freeze({
    id: 'sanskrit',
    label: 'सामान्य संस्कृत',
    speechLang: 'sa-IN',
    primaryLanguage: 'sa',
    fallbackLanguage: 'hi',
    hint: 'संस्कृत-विशिष्ट आवाज़ उपलब्ध हो तो वही चुनी जाएगी; अन्यथा सीमित हिंदी ध्वनि-सहायक Preview दिया जाएगा।'
  }),
  hindi: Object.freeze({
    id: 'hindi',
    label: 'हिंदी',
    speechLang: 'hi-IN',
    primaryLanguage: 'hi',
    fallbackLanguage: null,
    hint: 'हिंदी भाषा के लिए डिवाइस की उपलब्ध हिंदी आवाज़ प्रयोग होगी।'
  })
});

export function resolveLanguageVoices(voices, modeId) {
  const mode = LANGUAGE_MODES[modeId] || LANGUAGE_MODES.sanskrit;
  const list = Array.isArray(voices) ? voices : [];
  const matches = language => list.filter(voice =>
    String(voice.lang || '').toLowerCase().split('-')[0] === language
  );

  const native = matches(mode.primaryLanguage);
  if (native.length) {
    return { mode, voices: native, path: 'native', speechLang: mode.speechLang };
  }

  if (mode.fallbackLanguage) {
    const fallback = matches(mode.fallbackLanguage);
    if (fallback.length) {
      return {
        mode,
        voices: fallback,
        path: 'hindi-fallback',
        speechLang: 'hi-IN'
      };
    }
  }

  return { mode, voices: [], path: 'unavailable', speechLang: mode.speechLang };
}

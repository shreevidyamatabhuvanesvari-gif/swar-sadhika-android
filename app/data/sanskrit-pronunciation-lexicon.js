// Sanskrit fallback spellings for Hindi speech engines that drop conjunct /r/.
// The displayed/source text is never changed; these replacements apply only to TTS input.
export const SANSKRIT_PRONUNCIATION_LEXICON = Object.freeze({
  'सर्वे': 'सर्-वे',
  'सर्वम्': 'सर्-वम्',
  'सर्वदा': 'सर्-व-दा',
  'सर्वत्र': 'सर्-व-त्र',
  'सर्वेषु': 'सर्-वे-षु',
  'सर्वेषाम्': 'सर्-वे-षाम्',
  'सर्वेभ्यः': 'सर्-वे-भ्यः',
  'सर्वस्य': 'सर्-व-स्य'
});

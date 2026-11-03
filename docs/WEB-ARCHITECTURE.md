# Swar-Sadhika Web Architecture

## Runtime
`index.html` → `app.js` → `app/main.js` → feature modules and IndexedDB.

## Language and pronunciation
- Language selector contains exactly three modes: Vedic Sanskrit, General Sanskrit and Hindi.
- Language tags: `sa-IN` for Sanskrit modes; `hi-IN` for Hindi.
- Device voice list is filtered to the selected mode's language. For Sanskrit modes, a Hindi voice may be used only as an explicitly labelled fallback.
- `app/core/pronunciation-engine.js` selects the speech path and prepares text.
- `app/data/sanskrit-pronunciation-lexicon.js` contains fallback-only pronunciation spellings. The editor and saved source text are not modified.
- Initial fallback dictionary entry: `सर्वे` → `सर्-वे`, to prevent a Hindi speech engine from dropping the consonant /r/ in this word.
- Vedic accents are not generated automatically. Vedic svara recitation requires correctly marked source text and a voice/model trained to perform it.

## Browser voice limitations
The Web Speech API accepts a BCP 47 language tag and a voice selected from the voices exposed by the current browser/OS. A language tag alone cannot install a voice or guarantee correct Sanskrit articulation. The Hindi fallback is only a phonetic preview, not a validated Sanskrit/Vedic TTS engine.

## Local data and media
IndexedDB stores text and notes. Selected media is previewed through temporary object URLs and is not uploaded. A JSON backup can be exported/imported.

## PWA and privacy
GitHub Pages is static hosting. Service-worker caching covers the application shell only; it does not bundle a speech model. HTTPS is required for service workers. Avoid remote scripts with unknown provenance and do not store credentials in the repository.
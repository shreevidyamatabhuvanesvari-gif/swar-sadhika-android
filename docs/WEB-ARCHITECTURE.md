# Swar-Sadhika Web Architecture

## Runtime
`index.html` → `app.js` → `app/main.js` → feature modules and IndexedDB.

## Exactly three user-facing language options
- वैदिक संस्कृत — `sa-IN`
- सामान्य संस्कृत — `sa-IN`
- हिंदी — `hi-IN`

There is one language selector in the UI. Device voice selection is internal and automatic. Do not expose the browser's full voice list or a second voice/language dropdown.

## Automatic voice routing
- `app/core/language-modes.js` defines the three fixed modes.
- `app/core/pronunciation-engine.js` resolves the compatible voice family and prepares TTS-only text.
- `app/features/voice-preview.js` chooses the default voice in the compatible family, or the first compatible voice if none is marked default.
- For Sanskrit modes, a Hindi voice may be used only as an explicitly labelled fallback.
- `app/data/sanskrit-pronunciation-lexicon.js` stores fallback-only pronunciation spellings. Source text and saved Library text are never rewritten.
- Initial fallback entry: `सर्वे` → `सर्-वे`.

## Browser voice limitations
A BCP 47 language tag does not install a speech voice or guarantee correct Sanskrit pronunciation. Hindi fallback is only a phonetic preview, not a validated Sanskrit/Vedic TTS engine. Vedic svara recitation requires correctly marked source text and a voice/model trained for it.

## Local data and media
IndexedDB stores text and notes. Selected media is previewed through temporary object URLs and is not uploaded. A JSON backup can be exported/imported.

## PWA and privacy
GitHub Pages is static hosting. Service-worker caching covers the application shell only; it does not bundle a speech model. HTTPS is required for service workers.
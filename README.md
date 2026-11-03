# Swar-Sadhika — Female Chant Studio

**Live App:** https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/  
**Repository:** https://github.com/shreevidyamatabhuvanesvari-gif/swar-sadhika-android

Swar-Sadhika is a personal, browser-first Sanskrit/Hindi text and chant workspace designed for Android Chrome and GitHub Pages. The application is a PWA; it is not an Android APK.

## Four primary Indexes

1. **स्वर-साधिका कार्यकक्ष** — Dashboard, Text Studio, Library, Learning Notes, Engine Status and Settings.
2. **स्वर एवं गायन स्टूडियो** — current device Speech Synthesis Preview; Neural Female Voice, Chant and Audio Generation are planned for Part 2.
3. **संगीत अध्ययन एवं प्रशिक्षण** — local Gallery Audio/Video Preview and manual notes; automated Music Learning is planned for Part 3.
4. **अवतार एवं वीडियो स्टूडियो** — user-selected local 9:16 Photo Avatar; phoneme Lip-Sync, captions and video export are planned for Part 4.

Sub-Modules are nested under these four Indexes. There is no fifth primary Index.

## Language modes

The application provides exactly three language modes:

- वैदिक संस्कृत — `sa-IN`
- सामान्य संस्कृत — `sa-IN`
- हिंदी — `hi-IN`

The voice used by the current preview is selected from the device's available Speech Synthesis voices. The language preference is stored locally and shared by the Settings and Voice Preview selectors. A Sanskrit mode may use a clearly identified Hindi fallback if the device has no Sanskrit voice. This fallback is not validated Sanskrit pronunciation or Vedic recitation.

## Current foundation features

- Sanskrit/Hindi Devanagari editor with preliminary text/akshara/mark analysis.
- Save, reopen and edit text records in IndexedDB.
- Search and delete Library records.
- Separate local Learning Notes.
- JSON backup and restore for text, notes and settings; existing records are preserved and duplicate records are skipped.
- Local Audio/Video preview through temporary object URLs; source media is not uploaded or copied to the Library.
- User-selected Avatar photo stored locally in IndexedDB; it is excluded from the JSON backup and public repository.
- Runtime browser capability display, separate from development progress records.
- PWA manifest and app-scoped Service Worker App Shell cache.

## Capability boundaries

The following are **not** claimed as implemented or verified:

- A trained Neural Female Voice model or local neural inference.
- Musical Singing Voice Synthesis, Chant Prosody or validated Vedic svara recitation.
- Automated audio feature extraction or Music Learning/Model Training.
- Phoneme/Viseme synchronized lip movement.
- Body-language learning or expression synthesis.
- Timed captions or MP4 export.
- Full offline AI inference.

A browser Speech Synthesis API being available does not prove that a Neural Voice Engine is ready. Local media preview is not automated learning. A visual speaking indicator is not phoneme Lip-Sync.

## Local data and privacy

Text, notes, settings and the personal Avatar photo are stored in the browser's IndexedDB. Selected Gallery media is previewed in the current tab using a temporary object URL. The source media is not uploaded by this application. JSON backup does not include private Avatar photos or source media.

Clearing browser/site data may remove local records. Download backups periodically and store them securely.

## Development and verification

The repository uses Node.js 22 and Python 3.12 in GitHub Actions.

```bash
npm test
npm run validate:progress
```

The test suite validates the four-Index DOM contract, unique IDs, relative imports, Devanagari helpers, language modes, IndexedDB schema declarations and Service Worker cache behavior.

Automated CI and GitHub Pages deployment do not prove Android device acceptance. Use [docs/ANDROID-ACCEPTANCE.md](docs/ANDROID-ACCEPTANCE.md) to record actual Android/Chrome tests. Do not mark a capability PASS without its required evidence.

## Project documentation

- [File Map](docs/FILE-MAP.md)
- [Engine Interfaces](docs/ENGINE-INTERFACES.md)
- [Test Plan](docs/TEST-PLAN.md)
- [Android Acceptance](docs/ANDROID-ACCEPTANCE.md)
- [Web Architecture](docs/WEB-ARCHITECTURE.md)
- [Progress](docs/PROGRESS.md)

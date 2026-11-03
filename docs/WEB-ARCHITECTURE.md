# Swar-Sadhika — Web Architecture

## Application identity

- Repository: `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`
- Runtime: GitHub Pages, browser-first PWA, Android Chrome target.
- Entry chain: `index.html` → `app.js` → `app/main.js` → feature modules.
- The four primary Indexes are Workspace, Voice/Chant, Music Learning and Avatar/Video.

## Four-Index navigation

`app/features/navigation.js` owns Index and Sub-Module visibility. Each Sub-Module button declares an owner Index and target panel. The Navigation Controller validates that the requested panel belongs to the selected Index, updates active/ARIA state and writes a local hash route.

`app/main.js` is the composition root and initializes each feature once. `app.js` remains the single module entry point.

## Shared Core

- `app/core/storage.js`: IndexedDB, migration, CRUD, local Avatar storage and JSON backup/restore.
- `app/core/device-capabilities.js`: Browser API and storage capability detection; API presence is not proof of a full Engine.
- `app/core/status-board.js`: Development progress rendering.
- `app/core/language-modes.js`: exactly three fixed language modes.
- `app/core/pronunciation-engine.js`: current TTS input preparation and limited fallback behavior.
- `app/core/devanagari-parser.js`: preliminary Unicode and Devanagari structural analysis, not a full Sanskrit grammar or Vedic phonology validator.

## Language modes and device voice routing

- वैदिक संस्कृत — `sa-IN`
- सामान्य संस्कृत — `sa-IN`
- हिंदी — `hi-IN`

The voice selector is internal and automatic. A device voice is selected from the supported language family. A Hindi fallback for Sanskrit is explicitly labelled and does not establish correct Sanskrit/Vedic pronunciation. The Settings language preference and Voice Preview selector are synchronized and persisted locally.

## Local storage

IndexedDB database: `swar-sadhika-local`.

- Version 3 baseline stores: `texts`, `mediaNotes`, `learningNotes`, `avatarPhotos`.
- Version 4 adds `settings` while preserving existing stores and records.
- JSON backup version 2 includes text, media notes, learning notes and settings. Version 1 imports remain supported.
- Import is merge-oriented: existing records are retained and duplicates are skipped.
- Personal Avatar photo and original Gallery media are excluded from JSON backup.

The version 4 migration declaration is implemented, but actual migration with pre-existing user data must still be verified on a browser/device before claiming migration acceptance PASS.

## Media and Avatar

Local Gallery files are previewed through temporary object URLs and released when replaced or when the page is left. Media notes are stored separately; the original Gallery binary is not copied into the Library.

A user-selected Avatar photo is stored locally in IndexedDB and shown in a 9:16 frame. The speaking outline is only a visual state indicator, not phoneme/viseme Lip-Sync.

## PWA and offline

`manifest.webmanifest` uses relative GitHub Pages project paths. `sw.js` caches the static App Shell in the app-owned `swar-sadhika-android-v9` namespace and preserves unrelated app caches. The shell includes the Part 1 modules and current imports.

Offline App Shell availability does not imply offline Neural TTS, Music Learning, model inference or Video Export. Each future Engine must separately test and declare offline support.

## Capability boundaries

Part 1 does not implement a Neural Female Voice, Singing Voice Synthesis, automated music learning, phoneme Lip-Sync, body-language learning, timed captions or MP4 export. These remain in their owning Parts 2–4.

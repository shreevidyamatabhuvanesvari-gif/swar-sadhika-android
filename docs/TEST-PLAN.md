# Part 1 — Foundation and Four-Index Test Plan

## 1. Automated test execution

The repository uses Node.js 22 and Python 3.12.

```bash
npm test
npm run validate:progress
```

GitHub Actions runs JavaScript syntax checks, unit/integration tests, Service Worker behavior tests, JSON validation and the progress-record validator.

## 2. Four-Index DOM and Navigation

1. Exactly four primary Index buttons exist: workspace, voice, learning and avatar.
2. Exactly four matching top-level Index panels exist.
3. Each Sub-Module button has exactly one matching panel owned by the same Index.
4. Sub-Module targets are unique within their Index.
5. All HTML IDs are unique.
6. Selecting an Index hides the other Index panels.
7. Selecting a Sub-Module displays only its matching panel.
8. The active Index and Sub-Module are exposed using button state/ARIA attributes.
9. A valid hash route is restored after reload.
10. No fifth primary Index or legacy five-view navigation remains.

## 3. Text Studio and language modes

- Enter and paste Sanskrit/Hindi Devanagari text.
- Verify Unicode NFC normalization and line-break handling.
- Verify word, akshara, consonant, matra, conjunct, virama and punctuation counters.
- Save a text record and reopen it from Library.
- Edit a saved record without creating a duplicate.
- Confirm source text is preserved when the device speech fallback is used.
- Confirm the three language modes remain वैदिक संस्कृत, सामान्य संस्कृत and हिंदी.
- Confirm Vedic mode does not claim verified accent rendering.
- Confirm the browser/OS Speech Synthesis preview is labelled as a device preview, not Neural TTS or singing.

## 4. Library, Learning Notes and backup

- Search text and notes.
- Reopen/edit a text record.
- Delete a selected record only after confirmation.
- Create, list and delete personal Learning Notes.
- Export JSON Backup version 2.
- Import a supported version 1 or version 2 backup.
- Importing the same backup twice does not create duplicate records.
- Existing local records are preserved during merge import.
- Malformed backup is rejected before writes begin.
- Avatar photo and original Gallery media are excluded from JSON backup.

## 5. IndexedDB migration

The current database baseline was version 3 with stores `texts`, `mediaNotes`, `learningNotes` and `avatarPhotos`. Part 1 raises the schema to version 4 and adds `settings`.

Required device-level verification:

1. Open an existing version 3 database containing records in all four stores.
2. Load the new app and allow the version 4 upgrade.
3. Confirm all existing records and Avatar photo remain accessible.
4. Confirm the new settings store is created.
5. Confirm another open tab does not silently delete or reset the database.
6. Confirm quota and blocked-upgrade errors are surfaced clearly.

The automated test checks the schema declaration; it does not replace a real IndexedDB migration test with pre-existing user data.

## 6. Gallery Media Preview

- Select supported local audio and play/pause/stop.
- Select supported local video and preview where the browser codec supports it.
- Select a second file and confirm the previous object URL is released.
- Save notes without persisting/uploading the original media binary.
- Confirm unsupported files receive a clear message.

## 7. Personal Avatar and privacy

- Select a user-provided image and display it in the 9:16 frame.
- Reload and confirm the local image persists.
- Remove the image and confirm the local record is deleted.
- Confirm no personal photo is present in Git or App Shell cache.
- Treat the speaking outline as a visual state only, not phoneme Lip-Sync.

## 8. PWA, cache and offline shell

- Manifest JSON is valid and scope/start URL remain relative to the GitHub Pages project path.
- Service Worker registers under `/swar-sadhika-android/`.
- App Shell cache is `swar-sadhika-android-v9`.
- Required Part 1 modules are included in the shell.
- Activation removes only app-owned caches and the explicitly recognized legacy caches `swar-sadhika-web-v5/v6`.
- Unrelated same-origin app caches remain.
- Cross-origin, out-of-scope and non-GET requests are not intercepted.
- Successful app GETs are cached.
- `progress.json` refreshes online and uses its cached response offline.
- A cached shell is not evidence of offline model inference.

## 9. Android Chrome manual acceptance

Use [ANDROID-ACCEPTANCE.md](ANDROID-ACCEPTANCE.md). Record device model, Android/Chrome versions, local timezone-aware test time, commit SHA and evidence. GitHub CI does not run these handset tests.

## 10. PASS policy

- PASS requires the actual acceptance test and reviewable evidence.
- FAIL means the test ran and failed.
- BLOCKED means a required device/API/permission/model was unavailable.
- IN_PROGRESS means implementation or verification is underway.
- NOT_STARTED means work has not begun.
- UNVERIFIED means source exists but runtime evidence is absent.

A syntax check, static source assertion, green CI run or successful Pages deployment does not by itself prove all Part 1 features are accepted on Android.

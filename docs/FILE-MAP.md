# Swar-Sadhika — Repository File Map

**Project:** Swar-Sadhika — Female Chant Studio  
**Repository:** `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`  
**Branch baseline:** `main`  
**Design baseline commit:** `24e9d2ca9f651fd80b0c0c484f788becf58a105b`  
**Document status:** Architecture and ownership specification; it does not assert that planned modules are implemented.  
**Last reviewed:** 4 November 2026

---

## 1. Purpose and source-of-truth rules

This file defines the responsibility, ownership, dependencies, and intended evolution of files in the Swar-Sadhika repository.

The current `main` branch is the source of truth. The inventory in Section 3 records the repository at the design baseline commit above. Re-run the repository and tree audit before every implementation batch; do not assume this snapshot remains current.

Repository boundaries:

- Work only in `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`.
- Do not modify `swar-sadhika-female-chant-studio`, `anujadha`, or unrelated repositories.
- Do not copy code from an old ZIP or another repository without inspecting it and proving compatibility.
- Never delete or rename a file merely to make the tree look cleaner.
- Preserve working behavior and existing user data. Any migration must be additive, reversible where practical, and tested against existing records.
- Personal photos and private media must remain on the user's device. They must not be committed to this public repository.
- Do not mark a feature PASS based on its filename, UI, README, or deployment alone. Require relevant test evidence.

The target architecture has **exactly four primary user-facing Indexes**. Internal Sub-Modules do not create additional top-level Indexes.

## 2. Four-Index ownership model

| Primary Index | User-facing responsibility | Primary development part |
|---|---|---|
| Index 1 — स्वर-साधिका कार्यकक्ष | Dashboard, Sanskrit/Hindi Text Studio, Devanagari analysis, Language Modes, Library, Learning Notes, Backup/Restore, Engine Status, PWA settings | Part 1 |
| Index 2 — स्वर एवं गायन स्टूडियो | Female Neural Voice, Sanskrit/Hindi pronunciation, Chant Prosody, Singing Style, voice controls, audio generation/playback/export | Part 2 |
| Index 3 — संगीत अध्ययन एवं प्रशिक्षण | Gallery Audio/Video, YouTube guided learning, audio/pitch/rhythm analysis, singing-style and body-language learning, knowledge base/history | Part 3 |
| Index 4 — अवतार एवं वीडियो स्टूडियो | Personal Photo Avatar, 9:16 frame, animation, facial expression, phoneme/viseme lip-sync, body synchronization, captions, video preview/export | Part 4 |

The current UI has five navigation views (`studio`, `media`, `library`, `avatar`, `modules`). These are legacy view keys, not the final information architecture. Part 1 must map them into the four Indexes without losing existing capabilities:

- `studio`, `library`, and `modules` become Sub-Modules of Index 1.
- `media` becomes the current Media Preview Sub-Module of Index 3.
- `avatar` becomes the current Personal Photo Sub-Module of Index 4.
- Device Speech Synthesis Preview belongs under Index 2, but must remain explicitly labelled as device/browser TTS preview, not a trained Neural Female Voice or Singing Engine.

Index 2–4 may show accurately labelled unavailable/not-started Sub-Modules until their owning development part implements them. Do not display fabricated READY, LOADING, progress percentages, model names, or successful outputs.

## 3. Audited current repository inventory

The following files were present at the design baseline commit. This is an observed inventory, not the proposed final tree.

### 3.1 Root and public application files

| Current path | Current responsibility | Part ownership | Design disposition |
|---|---|---|---|
| `index.html` | HTML shell, current five-view navigation, controls, DOM IDs, inline Avatar/Playback styles, single module script reference | Part 1 foundation; shared UI host for Parts 2–4 | **MODIFY carefully** to implement four Indexes and explicit Sub-Module panels. Preserve one entry script and stable IDs/contracts until callers are migrated. |
| `app.js` | Thin entry point importing and invoking `bootSwarSadhika()` | Part 1 foundation | **KEEP** as the single entry point. Do not add duplicate script tags or move bootstrap logic into HTML. |
| `styles.css` | Shared visual system, responsive layout, component styles and current speaking indicator styles | Part 1 foundation; shared styling | **EXTEND/MODIFY** for the four-Index responsive UI. Audit stale selectors such as the mouth selector before changing them; do not treat a CSS selector as proof that the corresponding element exists. |
| `manifest.webmanifest` | PWA name, display mode, start URL, scope, theme and app icon | Part 1 | **REVIEW/KEEP**. Preserve the GitHub Pages subpath scope and valid icon references. |
| `sw.js` | App-scoped service worker, versioned shell cache, scoped request handling and offline progress fallback | Part 1 | **EXTEND carefully** when required shell files change. Keep cache names app-specific and preserve unrelated same-origin app caches. |
| `progress.json` | Structured per-capability development status and evidence record consumed by the status board | All four Parts | **EXTEND** only through validated schema changes. Keep development status separate from runtime availability. |
| `.gitignore` | Excludes local and generated files from commits | All Parts | **REVIEW** for private photos, local media, generated audio/video, model weights, temporary artifacts and test output. Never weaken privacy exclusions. |
| `README.md` | Public project description, current capabilities and known limitations | All Parts | **UPDATE** when verified behavior changes. Documentation must not overstate capabilities. |
| `README-DASHBOARD.md` | Dashboard-facing project/status documentation | Part 1 | **REVIEW/UPDATE** to keep it aligned with actual Dashboard behavior. |
| `DASHBOARD-PROGRESS.md` | Human-readable implementation history | All Parts | **UPDATE** with dated, evidence-based changes; do not use it instead of test evidence. |

### 3.2 Application bootstrap

| Current path | Current responsibility | Part ownership | Design disposition |
|---|---|---|---|
| `app/main.js` | Initializes navigation, install prompt, Text Studio, Voice Preview, Media Lab, Library rendering, Avatar Preview and Status Board; registers service worker and network listeners | Part 1 orchestrator; shared application composition root | **MODIFY** after the new Navigation and feature contracts are defined. Keep it as the single composition root and initialize each feature once. |

### 3.3 Core services and data

| Current path | Current responsibility | Part ownership | Design disposition |
|---|---|---|---|
| `app/core/storage.js` | IndexedDB database `swar-sadhika-local`, current schema version 3, text/media-note/learning-note/avatar-photo stores, normalization, CRUD, library export/import and Avatar Photo persistence | Part 1 foundation; shared by Parts 2–4 | **EXTEND carefully**. Preserve existing stores and records. Add a settings store only with a reviewed DB migration and migration tests. Make backup import validation/atomicity and duplicate handling explicit before implementation. |
| `app/core/status-board.js` | Reads `progress.json` and renders module development statuses | Part 1; shared status display | **EXTEND** to display the four-Index status structure. Do not confuse progress status with runtime status. |
| `app/core/language-modes.js` | Defines exactly three modes: Vedic Sanskrit, general Sanskrit and Hindi; resolves available device voices and fallback path | Part 1 text/voice foundation; Part 2 consumer | **KEEP/TEST**. Preserve the three modes and clear fallback limitations. |
| `app/core/devanagari-parser.js` | Normalizes and performs preliminary Devanagari text/akshara and selected mark counts | Part 1 | **TEST, then EXTEND only where required**. It is not a complete Sanskrit grammar, phonology, Vedic accent validator or scholarly proofreader. |
| `app/core/pronunciation-engine.js` | Normalizes speech input, applies limited lexicon fallback and describes native/fallback speech path | Part 2 support, currently used by Part 1 Voice Preview | **REVIEW/KEEP compatible**. Do not upgrade its capability label to a full Sanskrit or Vedic pronunciation engine without evidence. |
| `app/data/sanskrit-pronunciation-lexicon.js` | Small curated fallback spelling map used only for compatible Hindi speech preview | Part 2 support | **KEEP/EXTEND cautiously** with documented source/review and tests for each entry. Source/library text must remain unchanged. |

### 3.4 User-facing feature modules

| Current path | Current responsibility | Part ownership | Design disposition |
|---|---|---|---|
| `app/features/text-studio.js` | Editor input, normalization, text counts/analysis display, save/clear and Library-load event handling | Part 1 | **EXTEND** for Sanskrit/Hindi Text Studio Sub-Module integration while preserving existing behavior and event compatibility. |
| `app/features/voice-preview.js` | Browser Speech Synthesis preview, language voice selection/fallback, rate/pitch, pause/resume/stop, line reading and a sample pronunciation action | Part 1 interim UI; Part 2 owns actual Neural Voice/Chant | **KEEP/EXTEND** as explicitly labelled device TTS preview. Do not claim file generation, Neural Voice, validated Sanskrit/Vedic recitation or musical singing. |
| `app/features/media-lab.js` | Local audio/video object-URL preview, audio controls and manual media/learning notes | Part 3 current preview foundation; Part 1 owns its navigation/storage integration | **KEEP/EXTEND**. Revoke temporary object URLs. Distinguish transient preview from persistent media storage and actual automated analysis. |
| `app/features/library-view.js` | Renders saved text and notes; open/delete controls; JSON export/import UI | Part 1 | **EXTEND** for search/edit, safe restore, duplicate handling and the Index 1 Library Sub-Module. Keep imported data validation in the Storage layer. |
| `app/features/avatar-preview.js` | Selects/removes a personal photo, persists it in the IndexedDB Avatar store, displays it in a 9:16 frame and accepts a speaking-state indicator | Part 4 current photo foundation; Part 1 owns placement/navigation | **KEEP/EXTEND**. Maintain local-only photo storage. Speaking-state styling is not phoneme-synchronized lip-sync. |

### 3.5 Assets, tests, tools and technical documentation

| Current path | Current responsibility | Part ownership | Design disposition |
|---|---|---|---|
| `assets/icon.svg` | PWA/application icon | Part 1 | **KEEP** unless a verified manifest/icon issue requires a change. |
| `tests/service-worker.test.mjs` | Node test harness for service-worker install, activation, cache isolation, request scope, cache behavior and offline fallback | Part 1 | **KEEP at its current path**. Extend tests; do not move it merely for folder aesthetics. |
| `tools/validate_progress.py` | Read-only validator for progress schema, required module IDs, legal statuses and evidence fields | All four Parts | **KEEP/EXTEND** with any approved progress schema changes. |
| `docs/PROGRESS.md` | Human-readable current implementation status and known capability limits | All Parts | **UPDATE** using verified repository/runtime evidence. |
| `docs/TEST-PLAN.md` | Existing manual/automated testing plan and Android Chrome acceptance guidance | All Parts | **EXTEND** with Part 1's precise test matrix. |
| `docs/WEB-ARCHITECTURE.md` | Existing browser runtime, language-mode, speech fallback, storage and PWA architecture notes | All Parts | **EXTEND** to document four Indexes and the approved contracts. |

## 4. Part 1 target additions

The following are proposed additions. They do **not** exist at the audited baseline unless a later audit proves otherwise.

| Planned path | Responsibility | Required before |
|---|---|---|
| `app/features/navigation.js` | Four-Index and Sub-Module navigation controller | Four-Index UI integration |
| `app/features/dashboard.js` | Dashboard rendering from real runtime and development status sources | Dashboard integration |
| `app/features/learning-notes.js` | Separate local Learning Notes create/list/delete Sub-Module | Learning Notes integration |
| `app/features/app-settings.js` | User-facing PWA, update, storage and application settings | Settings Sub-Module |
| `app/features/learning-notes.js` | Separate local Learning Notes Sub-Module | Learning Notes Sub-Module |
| `app/core/device-capabilities.js` | Safe detection of browser APIs and device capabilities | Runtime capability dashboard |
| `docs/FILE-MAP.md` | This document: repository ownership and file map | Architecture baseline |
| `docs/ENGINE-INTERFACES.md` | Shared Engine, event, job, data and lifecycle contracts | Cross-part integration |
| `docs/ANDROID-ACCEPTANCE.md` | Handset-specific Part 1 acceptance checklist and evidence record template | Device acceptance |
| `package.json` | Declares native ES module semantics and repeatable npm test/validator scripts; no runtime dependency is added | Test execution |
| `tests/part1.test.mjs` | Combined unit/contract suite for four Indexes, DOM IDs, imports, Devanagari helpers, language modes and storage schema declaration | Part 1 automated validation |
| `tests/service-worker.test.mjs` | Existing Service Worker behavior suite, extended for App Shell v9 | PWA validation |
| `docs/ANDROID-ACCEPTANCE.md` | Handset-specific test procedure and evidence record template | Android acceptance |

The Part 1 automated checks are intentionally consolidated in `tests/part1.test.mjs` to keep the current small repository test harness simple. Keep `tests/service-worker.test.mjs` at its existing path. The schema test verifies the migration declaration; it does not replace a real upgrade test using pre-existing IndexedDB data.

## 5. Part 1 file-change order

Use this dependency order as a planning guide, not as permission to push partial work:

1. Finalize this file map and `docs/ENGINE-INTERFACES.md`.
2. Add and test `app/core/device-capabilities.js`.
3. Add and test `app/features/navigation.js`.
4. Add `app/features/dashboard.js`.
5. Add `app/features/app-settings.js`.
6. Review Storage migration and backup/restore semantics before changing `storage.js`.
7. Extend `status-board.js` to show four-part development state and actual runtime capability separately.
8. Integrate four-Index HTML and stable DOM contracts.
9. Update `app/main.js` to initialize each feature once.
10. Adapt Text Studio, Library, Voice Preview, Media Lab and Avatar Preview to their new Sub-Module locations without removing their working behavior.
11. Update responsive styling.
12. Update manifest only if its audited metadata needs a change.
13. Update service-worker shell and cache version only after the final required asset list is known.
14. Add unit, integration, migration and device acceptance tests.
15. Update progress/documentation only to match evidence.
16. Run the complete automated test and deployment cycle; perform real Android Chrome acceptance separately.

All files needed for a coherent Part 1 integration should be prepared and validated as one complete change set. Do not publish a half-integrated set and promise to add the rest later.

## 6. Shared file ownership and cross-part change control

| Shared file/service | Primary owner | Consumers | Change rule |
|---|---|---|---|
| `app/main.js` | Part 1 | All Parts | Change only after bootstrap impact review; exactly one initialization path. |
| `app/core/storage.js` | Part 1 | All Parts | Backward-compatible API/schema; migrations and data-preservation tests required. |
| `app/core/status-board.js` and `progress.json` | Part 1 governance | All Parts | Record evidence-based states; distinguish runtime from development state. |
| `app/core/language-modes.js` | Part 1 foundation | Part 2 | Preserve exactly three modes unless the Master Specification is formally revised. |
| `app/core/pronunciation-engine.js` | Part 2 capability; Part 1 interim consumer | Part 1 and Part 2 | Maintain explicit fallback limits and contract tests. |
| `app/features/media-lab.js` | Part 3 | Part 1 navigation/storage | Local preview and manual notes must not be misrepresented as automated learning. |
| `app/features/avatar-preview.js` | Part 4 | Part 1 navigation/storage | Personal photo remains local; speaking indicator is not lip-sync. |
| `sw.js` | Part 1 platform foundation | All Parts | Add required static resources and preserve app-scoped cache isolation. |
| `index.html`, `styles.css` | Part 1 UI foundation | All Parts | Cross-part UI changes require DOM contract and regression tests. |

A change to another Part's owned capability must list the impacted files, reason, compatibility implications and required tests before implementation.

## 7. File integrity and completion rules

For each change set record:

- Exact base branch and base commit SHA.
- Exact paths added/modified; no undeclared deletions.
- Why each file changes and which contract it implements.
- Static import and DOM ID validation results.
- Unit, integration, regression and service-worker test results.
- GitHub Actions run IDs and conclusions.
- Pages deployment run ID and conclusion, where applicable.
- Android/Chrome versions, local timestamp and reviewable evidence for device tests.

Use these states accurately:

- `PASS`: the relevant real test succeeded and evidence is recorded.
- `FAIL`: the relevant test ran and failed.
- `BLOCKED`: a necessary device, model, permission or dependency is unavailable.
- `IN_PROGRESS`: implementation or verification is underway.
- `NOT_STARTED`: work has not begun.
- `UNVERIFIED`: code/source suggests a capability but the required runtime test has not been performed.

A successful syntax check does not prove browser behavior. A successful GitHub Pages deployment does not prove Android compatibility. A visible button does not prove that its advertised action is implemented.

---

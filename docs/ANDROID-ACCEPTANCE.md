# Part 1 — Android Chrome Acceptance Checklist

**Repository:** `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`  
**Purpose:** Record actual target-device evidence. This checklist is not a claim that the tests have already passed.

## Test session record

- Date/time (local, with timezone):
- Device model:
- Android version:
- Chrome version:
- Repository commit SHA:
- Installed PWA or browser tab:
- Tester:

## A. Four-Index navigation

- [ ] Exactly four primary Index buttons are visible.
- [ ] Each Index opens its own panel.
- [ ] Each Index exposes only its owned Sub-Modules.
- [ ] Active Index and Sub-Module are visibly selected.
- [ ] Reload restores a valid Index/Sub-Module route.
- [ ] No fifth primary Index is displayed.
- Evidence / notes:

## B. Text Studio and Language Modes

- [ ] Sanskrit text can be entered and pasted.
- [ ] Hindi text can be entered and pasted.
- [ ] Unicode normalization preserves Devanagari content.
- [ ] Word/akshara/mark counts render without UI errors.
- [ ] Save creates a local Library record.
- [ ] Line reading and Speech Synthesis Preview work where the device supports them.
- [ ] Vedic mode does not claim verified Vedic accent rendering.
- Evidence / notes:

## C. Library and Backup

- [ ] Saved text appears after navigating away and returning.
- [ ] A saved text can be reopened and edited.
- [ ] Search filters text and note records.
- [ ] Delete requires confirmation and removes only the selected record.
- [ ] JSON Backup downloads.
- [ ] A valid version 1 or version 2 backup imports.
- [ ] Re-importing the same backup does not create duplicate records.
- [ ] Invalid JSON/backup is rejected without partial import.
- [ ] Avatar photo and source media are excluded from JSON backup.
- Evidence / notes:

## D. Personal Learning Notes and Media Preview

- [ ] A Learning Note can be saved and appears in the notes list.
- [ ] Audio can be selected and previewed.
- [ ] Audio Play/Pause/Stop controls reflect playback state.
- [ ] Video can be selected and previewed where codec support exists.
- [ ] Selecting another file releases the previous object URL.
- [ ] Media notes save without uploading the source media.
- Evidence / notes:

## E. Avatar privacy and persistence

- [ ] A user-selected photo appears in the 9:16 frame.
- [ ] Photo survives page reload.
- [ ] Remove Photo deletes the local Avatar record.
- [ ] Photo is not present in the public repository or App Shell cache.
- [ ] No unrelated photo is shown as the user's real photo.
- Evidence / notes:

## F. Settings, PWA and Offline Shell

- [ ] Language preference persists after reload.
- [ ] Reduced-motion preference persists.
- [ ] PWA manifest is accepted by Chrome.
- [ ] Install prompt or Chrome install menu is available when eligible.
- [ ] Service Worker registers within the repository subpath.
- [ ] New App Shell installs successfully.
- [ ] App opens offline after a successful online installation.
- [ ] Offline status is accurate.
- [ ] App cache cleanup preserves unrelated GitHub Pages app caches.
- [ ] Update check and activation behavior are correct.
- Evidence / notes:

## G. Final result

- [ ] PASS — all required device tests completed with evidence.
- [ ] FAIL — one or more tests ran and failed.
- [ ] BLOCKED — device/API/permission unavailable.
- [ ] UNVERIFIED — source exists but target-device test was not performed.

**Observed defects:**  
**Screenshots/log references:**  
**Retest commit SHA:**  

Do not mark this checklist PASS until every required item has been executed on the target Android Chrome device.

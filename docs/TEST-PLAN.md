# Browser Acceptance Test Plan

## First-load checks
1. Open the GitHub Pages URL in Android Chrome.
2. Confirm page, styles and all five navigation views load.
3. Open browser console and confirm there are no module import errors.
4. Confirm the Engine Status view reads `progress.json`.
5. Confirm the PWA service worker registers over HTTPS.

## Feature checks
- Text: edit, count and save a Sanskrit/Hindi passage; open Library and reload it.
- Voice preview: list available device voices; speak, pause, resume and stop. Record actual voice name/language and pronunciation limitations.
- Media: select a local audio/video file and confirm playback; verify no network upload occurs.
- Notes: save media and learning notes; reopen Library and delete a record.
- Avatar: verify only the illustrative mouth animation reacts while speech is active; do not call it phoneme lip-sync.
- Offline shell: after first successful load, enable airplane mode and verify cached shell assets. Dynamic model inference is not included.

## Before any PASS
Record exact device, Android/Chrome version, date/time with timezone, test steps, observed result and evidence (screenshot/log/audio sample). Source presence or dashboard rendering alone is not a feature PASS.

## Not yet implemented
Local neural female TTS, Sanskrit chant prosody, automatic media learning, synchronized captions, real avatar/lip-sync, body-language learning and MP4 export.
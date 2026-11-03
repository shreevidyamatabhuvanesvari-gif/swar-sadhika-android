# Swar-Sadhika Web Architecture

## Runtime flow
`index.html` → `app.js` → `app/main.js` → feature modules and IndexedDB.

## Modules
- Text Studio: editing, character/word count and saving user text.
- Voice Preview: Web Speech API only; output depends on voices installed by the browser/OS.
- Media Lab: local audio/video preview with temporary object URLs; no upload.
- Local Library: IndexedDB stores text and notes, not large media files.
- Avatar Preview: illustrative CSS mouth animation only.
- Status Board: reads `progress.json` and displays implementation status.

## Browser constraints
- GitHub Pages is static hosting. It cannot run server-side model inference.
- Local neural inference requires a compatible model, runtime (for example WebAssembly/WebGPU), model download/hosting strategy, memory budget and target-device validation.
- Browser speech synthesis is not guaranteed to provide a female voice, Sanskrit pronunciation, offline operation or consistent output across devices.
- MP4 export and true phoneme lip-sync require additional media-processing and timing components.

## Local data
IndexedDB is origin-scoped. Users should be given an export/backup feature before treating it as durable storage. Selected media is not uploaded; object URLs must be revoked when replaced or the view is disposed.

## Security
Use HTTPS GitHub Pages, avoid remote scripts with unknown provenance, do not upload user media, and never store credentials in the repository.
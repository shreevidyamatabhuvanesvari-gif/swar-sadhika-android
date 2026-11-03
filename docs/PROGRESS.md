# Swar-Sadhika Web App — Implementation Status

## Browser foundation added
The repository now contains a modular browser workspace with text editing, device speech preview, local media preview, IndexedDB notes/library, module status panel, PWA manifest and service-worker shell caching.

## Important capability boundaries
- Speech output currently uses the browser/OS Speech Synthesis API. It is not a trained female neural voice and cannot guarantee Sanskrit pronunciation.
- Media selection only previews a local file; it does not learn singing style automatically.
- Avatar is an illustrative CSS animation, not a photo avatar or phoneme-synchronized lip-sync.
- PWA cache covers the app shell only. It does not cache a TTS model or provide offline neural inference.
- MP4 export is not implemented.

## Next milestones
1. Verify the app in Android Chrome and resolve any runtime/browser issues.
2. Select and license-audit a local TTS model with Hindi/Sanskrit suitability.
3. Integrate a browser-compatible inference runtime and test on the target phone.
4. Implement chant prosody and phoneme/viseme timing.
5. Add real avatar animation, captions, export and backup/restore.

Do not mark any capability PASS without device-level evidence.
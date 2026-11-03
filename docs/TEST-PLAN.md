# Browser Language and Pronunciation Acceptance Tests

## User-facing language selector
1. Exactly one language selector is visible.
2. It contains exactly three entries: वैदिक संस्कृत, सामान्य संस्कृत, हिंदी.
3. No separate voice selector or list of browser-installed languages is rendered.
4. The browser voice is chosen automatically from the compatible language family.
5. If Sanskrit voice is unavailable, Hindi fallback is clearly identified in the status text.
6. Changing language stops queued speech and refreshes the automatic voice route.

## सर्वे pronunciation check
1. Select सामान्य संस्कृत.
2. Tap “सर्वे उच्चारण जाँचें”.
3. If Sanskrit voice exists, hear its native reading.
4. If only Hindi fallback exists, the TTS-only text is `सर्-वे`, while displayed source remains `सर्वे`.
5. Record handset, Android/Chrome version, automatically selected voice, spoken result and an audio recording for review.

## Vedic mode
- Paste source with authentic Vedic accent marks where available.
- Confirm the source retains those marks.
- Do not treat normal Sanskrit TTS or Hindi fallback as verified Vedic recitation.

## PASS requirements
Real target-device acoustic verification, timezone-aware timestamp, automatically selected voice/language, test steps and audible evidence. Source inspection alone does not prove pronunciation correctness.

## Service Worker cache-isolation tests

Automated checks run in GitHub Actions on every push and pull request to `main`:

1. Install pre-caches the application shell in `swar-sadhika-android-v7`.
2. Activate deletes only cache names with the `swar-sadhika-android-` prefix and the explicitly listed legacy cache names `swar-sadhika-web-v5/v6`.
3. Unrelated same-origin app caches remain present.
4. Cross-origin and same-origin requests outside this app's registration scope are not intercepted.
5. Non-GET requests are not intercepted.
6. Successful app GET responses are cached in the app-owned cache.
7. `progress.json` refreshes from the network and falls back to the app cache when offline.
8. Error and opaque responses are not cached.

## Android Chrome manual acceptance

These checks require the actual target handset and are not asserted by the GitHub runner:

1. Open the deployed app in Android Chrome while online; wait for the app-ready status.
2. Reload once and confirm the page is served normally after the new worker activates.
3. In Chrome DevTools where available, inspect Application → Service Workers and Cache Storage. Confirm the active worker scope is the `/swar-sadhika-android/` path and the active cache is `swar-sadhika-android-v7`.
4. If another GitHub Pages app has an existing Cache Storage cache on the same `github.io` origin, record its exact cache name before and after this app's activation. It must remain present unless it is one of this app's explicitly listed legacy cache names.
5. Reload the app, switch the handset to airplane mode, and verify the cached shell opens. Check the Library separately; its IndexedDB persistence is outside this Service Worker cache test.
6. Restore connectivity and reload. Confirm the app returns to online mode.

Do not mark offline operation or target-device acceptance PASS until these handset checks have been completed and recorded with device, Android/Chrome versions, timezone-aware timestamp and reviewable evidence.

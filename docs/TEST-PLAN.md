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
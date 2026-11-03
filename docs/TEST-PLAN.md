# Browser Language and Pronunciation Acceptance Tests

## Language selector
1. Exactly three options appear: वैदिक संस्कृत, सामान्य संस्कृत, हिंदी.
2. Hindi mode lists only voices whose language tag starts with `hi`.
3. Sanskrit modes prefer voices whose language tag starts with `sa`.
4. If no Sanskrit voice is installed, the UI explicitly labels the Hindi fallback and does not call it Vedic/Sanskrit voice.
5. Changing language stops queued speech and refreshes the compatible voice list.

## सर्वे pronunciation check
1. Select सामान्य संस्कृत.
2. Tap “सर्वे उच्चारण जाँचें”.
3. If Sanskrit voice exists, hear its native reading.
4. If only Hindi fallback exists, the TTS-only text is `सर्-वे`, while the displayed source remains `सर्वे`.
5. Record the actual handset, Android/Chrome version, selected voice name, spoken result and an audio recording for review.

## Vedic mode
- Paste a source with authentic Vedic accent marks when available.
- Confirm the text retains its marks.
- Do not treat normal Sanskrit TTS or Hindi fallback as verified Vedic recitation.

## PASS requirements
Real target-device acoustic verification, timezone-aware timestamp, selected voice/language, test steps and audible evidence. Static source inspection does not prove pronunciation correctness.
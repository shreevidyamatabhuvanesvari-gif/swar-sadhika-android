# Coordinated Singing + Avatar Engines — Part 2

## What this change adds

- A versioned, validated audio/alignment contract.
- A local singing-provider registry. Providers must return actual non-empty audio bytes and may return a timestamped phoneme/viseme alignment track.
- An avatar timeline engine that reads the generated audio time, selects the active viseme cue and forwards it to a registered avatar rig renderer.
- A coordinator that uses the generated HTML audio element's `currentTime` as the shared master clock.

## Honest capability boundary

This commit adds the integration runtime and provider/renderer interfaces. It does **not** bundle or claim a neural Sanskrit/female singing model, Vedic-accent inference model, phoneme aligner, MediaPipe runtime, photorealistic face rig, body-motion rig, or video encoder. The default singing-provider state is `NO_PROVIDER`; the avatar state is `TIMELINE_ONLY` until a renderer is registered. Device `SpeechSynthesis` remains the existing preview path and is not re-labelled as neural or musical singing.

A provider is reported as `PROVIDER_REGISTERED_UNVERIFIED` until its model, voice quality, language coverage, offline behaviour and output are independently validated. An audio Blob being non-empty proves only that bytes were returned; it does not prove valid decoding or perceptual quality.

## Browser integration API

After the app loads, a model adapter can register through:

```js
window.swarSadhikaEnginesPart2.registerSingingProvider("local-model", {
  modelId: "model-revision",
  capabilities: {
    neuralInference: true,
    musicalSinging: true,
    femaleVoice: true,
    sanskrit: true,
    vedicAccent: false,
    phonemeAlignment: true,
    offline: true
  },
  synthesize: async ({ text, options }) => ({
    audio: new Blob([/* model-produced audio bytes */], { type: "audio/wav" }),
    alignment: [
      { start: 0, end: 0.18, phoneme: "a", viseme: "open", confidence: 0.9 }
    ],
    metadata: { modelRevision: "immutable-revision" }
  })
});
```

Capability values above are provider declarations, not an audit result. Keep them false until independently tested. The Avatar renderer must implement `applyViseme(viseme, cue)` and map the viseme IDs to an actual calibrated 2D/3D face rig; the default DOM data attribute is diagnostic only.

## Required next production gates

1. Add a licensed and Android-Chrome-compatible local model adapter with immutable model revision, byte size and SHA-256 verification.
2. Demonstrate real inference from cached model weights, with valid audio decoding and playback.
3. Verify Sanskrit pronunciation, female voice quality and Vedic accents separately; do not treat pitch shifting as a female voice model.
4. Integrate a calibrated face landmark/rig renderer and measured phoneme timestamps; test lip-sync drift over long audio.
5. Test Android Chrome memory, storage, interrupted model downloads, airplane-mode repeat playback, background/foreground behaviour and export.
6. Do not merge to `main` until those gates and GitHub Actions checks pass.

## Test meaning

The Part 2 Node tests validate API contracts, empty-output rejection, alignment ordering, provider registration and timeline-to-viseme routing. They do not test an actual neural model, a real avatar rig, audio codec decoding, Android Chrome playback or offline inference.

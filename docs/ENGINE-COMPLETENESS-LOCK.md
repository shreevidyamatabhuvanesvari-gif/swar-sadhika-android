# SS-ENGINE-COMPLETENESS-LOCK-001

**State: LOCKED — mandatory for all Swar-Sadhika Android engineering work.**

## Non-negotiable rule

Never add, merge, publish, or describe an incomplete Engine as a completed or production Engine. A directory tree, placeholder, interface, mock provider, system TTS voice, pitch slider, estimated phoneme timing, static avatar image, video loop, or passing structural test is not a production implementation.

A complete release is the coordinated delivery of both Engines. If any mandatory capability in either Engine is missing or unverified, the combined release remains blocked.

## Singing Engine acceptance

1. Local Android Chrome inference using pinned, redistributable model weights; no hosted inference API or separate server.
2. Female Hindi/Sanskrit voice output with genuine model inference.
3. Actual musical Singing Voice Synthesis driven by lyrics/phonemes plus score/pitch, note duration, tempo and prosody. Pitch-shifted speech does not qualify.
4. Sanskrit phonology and pronunciation tests; Vedic Udatta/Anudatta/Svarita support must be separately validated.
5. Valid decoded PCM/WAV, replay, export, long-input handling and repeat offline inference.
6. Model revision, artifact size, SHA-256, code/model/dataset licenses and minimum hardware/storage requirements recorded.

## Avatar Engine acceptance

1. Local face-landmark inference on photo and video with pinned runtime/model artifacts.
2. Calibrated face/mouth renderer that actually animates the selected personal avatar.
3. Audio-derived measured phoneme timestamps mapped to visemes and rendered on the avatar; grapheme timing estimates are not a substitute.
4. Body pose inference plus a defined skeleton and tested motion retargeting.
5. Generated audio is the master clock; pause, resume, seek and stop are synchronized.
6. Video composition/export produces a real file with audible audio, verified in an external Android player.

## Integration and release acceptance

- Shared session contract and workers must be imported by the current app through its build pipeline.
- Preserve the four primary Indexes, all 45 submodules, local data and existing app entry point semantics.
- CI source, model integrity, unit, integration and build checks pass.
- Test on the actual target Android Chrome device: inference, memory, storage, thermal behaviour, interrupted downloads, background/foreground, long chant and airplane-mode repeat.
- Never issue a PASS from mocks or source-only tests.
- Main and GitHub Pages remain unchanged while this Draft PR is under development.

## Explicit model boundaries

- Svāra TTS is a female/male multilingual **speech** model. It may provide a useful local female speech/recitation capability. It is not musical Singing Voice Synthesis, does not provide Vedic accent generation and does not supply phoneme alignment.
- DiffSinger is a score-conditioned singing synthesis framework, but the presence of source code or a generic checkpoint does not prove a Sanskrit/Hindi female voicebank or Android Chrome readiness.
- MediaPipe Face Landmarker gives face landmarks/blendshapes; it does not itself supply a calibrated still-photo avatar rig or audio-to-phoneme alignment.
- MediaPipe Pose Landmarker gives pose landmarks; it does not itself retarget motion to the user's avatar skeleton.

## Current release state

**BLOCKED — candidate models are integrated or identified, but the complete Singing Engine, calibrated Avatar Engine and Android device evidence are not yet complete.**

This lock is not satisfied by creating every requested file name. Only implementations that perform their stated work and pass their acceptance tests may be included in a production release.

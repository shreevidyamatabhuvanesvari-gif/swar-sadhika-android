# Swar-Sadhika Part 2 — Local OmniVoice model notices

This integration vendors source code from VocoLoco's browser implementation:
https://github.com/Magkino/vocoloco_tts

## Source code

The vendored JavaScript engine source is distributed under Apache License 2.0.
See `LICENSE-APACHE-2.0-part2.txt` in this directory.

## Model weights — separate terms apply

The model weights are not covered by the source-code Apache license.

| Component | Approximate size | License / terms |
|---|---:|---|
| OmniVoice main speech model | 1.1 GB | CC BY-NC; non-commercial use only |
| Higgs Audio v2 voice encoder | 622 MB | Boson Higgs Audio 2 Community License, based on Meta Llama 3 Community License; its Acceptable Use Policy applies |
| Higgs Audio v2 audio decoder | 85 MB | Same Boson Higgs Audio 2 Community License |
| Whisper large-v3-turbo (optional transcription) | 936 MB | MIT |
| Qwen2 tokenizer | 11 MB | Apache 2.0 |

The current Swar-Sadhika controller downloads the OmniVoice main model and decoder for synthesis, and the voice encoder when preparing a cloned reference voice. It does not currently download Whisper; the reference transcript is entered by the user.

## Privacy and network behavior

- Model weights are downloaded from Hugging Face to the user's device after an explicit in-app approval.
- Voice reference audio is decoded and encoded locally in browser workers.
- The reference audio, reference transcript, and target mantra text are not sent to an inference API or remote server.
- The generated audio is produced locally with WebGPU.
- Do not commit private recordings, encoded voice profiles, or model weight binaries to this public repository.

## Intended use

This project integration is intended for the user's personal, non-commercial use. Before any redistribution, commercial use, or public service deployment, review the current upstream model and tokenizer licenses and all applicable acceptable-use terms directly.

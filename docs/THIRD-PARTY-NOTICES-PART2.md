# Third-party model and source notices

## Svāra TTS browser model

- ONNX model: https://huggingface.co/shreyask/svara-tts-v1-ONNX
- Immutable model revision: `3931df67fac6356991b4eba2b43e50dde67f2d1b`
- Declared model license: Apache-2.0.
- Base model attribution: Kenpath Svara-TTS v1; Orpheus base attribution to Canopy Labs.
- The application uses the model locally through Transformers.js and ONNX Runtime Web. No hosted inference endpoint is used.
- Svāra is speech synthesis, not musical singing or Vedic accent generation.

## SNAC codec

- Model: https://huggingface.co/onnx-community/snac_24khz-ONNX
- Immutable revision: `e0b0016bc39c9d144e51aba2f275f59b7a6874d6`
- Declared model license: MIT.
- Used only to decode Svāra speech audio tokens into 24 kHz mono PCM.

## Browser worker adaptation

The Svara worker integration is adapted from https://github.com/shreyaskarnik/svara-tts-webgpu, whose model card metadata declares Apache-2.0. Attribution is retained here. The worker code is not a separate inference service.

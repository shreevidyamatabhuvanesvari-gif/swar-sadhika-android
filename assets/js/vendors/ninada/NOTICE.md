# Third-party notices: Ninada neural Sanskrit voice

## Ninada browser engine
- Project: https://github.com/hemanth/ninada
- Vendored package: `ninada` 5.1.2, browser ESM bundle from `js/dist/index.mjs`
- Reviewed upstream source commit: `745b55633615cfacc636af81ac08450fd3ff35d3`
- Code and runtime engine license: MIT
- The full upstream MIT notice is included in `ninada-engine-5.1.2-part2.mjs`.

## ONNX Runtime Web
- Runtime: ONNX Runtime Web 1.31.1
- Vendored browser ESM file: `ort-wasm-1.31.1-part2.mjs`
- Upstream: https://github.com/hemanth/ninada/tree/main/docs/ort
- License: MIT; copyright notice retained in the vendored file.
- WASM binary is fetched from the reviewed Ninada upstream commit and cached locally by the worker.

## Sanskrit female mobile model
- Model repository: https://huggingface.co/gnumanth/ninada
- Model file: `onnx_mobile/sa_female.onnx`
- Model release: Ninada 5.1.2
- Declared model and training-corpus license: CC-BY-4.0.
- Sanskrit training-corpus attribution: AI4Bharat Rasa (CC-BY-4.0).
- The model is a pretrained synthetic voice. It is not a clone or representation of a real individual's voice.

## Runtime behavior
- First use requires an internet connection to obtain the ONNX Runtime WASM binary and the Sanskrit female mobile ONNX weights.
- The worker stores the WASM binary in Cache Storage; Ninada stores model bytes in its versioned browser model cache.
- After both assets have downloaded successfully and the browser retains its site data, inference is local. Clearing browser/site data or storage eviction can require downloading them again.
- This integration is neural text-to-speech (speech), not a text-to-singing model. It does not claim melody-conditioned singing or exact phoneme-synchronized mouth motion.

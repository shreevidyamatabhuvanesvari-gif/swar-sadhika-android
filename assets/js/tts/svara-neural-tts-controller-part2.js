/*
 * Swar-Sadhika — Svāra Neural TTS isolated test controller (Part 2)
 * This page is separate from the production TTS route.
 * Models are downloaded from Hugging Face; inference runs locally in a Web Worker.
 */
const MAX_TEXT_LENGTH = 500;
const MODEL_ESTIMATE_BYTES = 2_100_000_000;
const WORKER_URL = new URL("./svara-neural-tts-worker-part2.js", import.meta.url);

function byId(id) {
  return document.getElementById(id);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "अज्ञात";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return value.toFixed(index > 1 ? 2 : 0) + " " + units[index];
}

function setStatus(message, kind = "info") {
  const target = byId("svara-status");
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = kind;
}

function setBusy(busy) {
  byId("svara-load").disabled = busy || !state.webgpuReady || state.modelReady;
  byId("svara-generate").disabled = busy || !state.modelReady;
  byId("svara-text").disabled = busy;
  byId("svara-voice").disabled = busy;
  byId("svara-stop").disabled = !busy;
}

const state = {
  worker: null,
  workerReady: false,
  webgpuReady: false,
  modelReady: false,
  busy: false,
  destroyed: false,
  activeAudioUrl: null,
  previousAudioUrls: new Set(),
  loadStarted: false
};

async function inspectDevice() {
  const lines = [];
  lines.push("Secure Context: " + (window.isSecureContext ? "हाँ" : "नहीं"));
  lines.push("WebGPU API: " + (navigator.gpu ? "उपलब्ध" : "अनुपलब्ध"));
  lines.push("Browser: " + (navigator.userAgentData?.brands?.map(x => x.brand + " " + x.version).join(", ") || navigator.userAgent));
  if (navigator.deviceMemory) lines.push("अनुमानित RAM: " + navigator.deviceMemory + " GB");
  if (navigator.hardwareConcurrency) lines.push("Logical CPU: " + navigator.hardwareConcurrency);
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      lines.push("Browser storage quota: " + formatBytes(estimate.quota));
      lines.push("Browser storage used: " + formatBytes(estimate.usage));
      if (Number.isFinite(estimate.quota) && estimate.quota < MODEL_ESTIMATE_BYTES) {
        lines.push("चेतावनी: अनुमानित स्टोरेज मॉडल के लगभग 2.1 GB आकार से कम है।");
      }
    } catch (error) {
      lines.push("Storage estimate: " + error.message);
    }
  }
  byId("svara-device").textContent = lines.join("\n");

  if (!window.isSecureContext) {
    setStatus("यह परीक्षण HTTPS या localhost सुरक्षित संदर्भ में ही चल सकता है।", "error");
    return;
  }
  if (!navigator.gpu) {
    setStatus("इस ब्राउज़र में WebGPU उपलब्ध नहीं है। मॉडल डाउनलोड न करें।", "error");
    return;
  }
  setStatus("डिवाइस निरीक्षण पूरा। WebGPU Adapter की पुष्टि Worker में होगी। मॉडल अभी डाउनलोड नहीं हुआ है।");
}

function handleWorkerMessage(event) {
  if (state.destroyed) return;
  const data = event.data || {};
  switch (data.status) {
    case "feature-success":
      state.webgpuReady = true;
      setStatus("WebGPU Adapter उपलब्ध है। FP16: " + (data.fp16 ? "हाँ" : "नहीं") +
        "। Adapter maxBufferSize: " + (data.maxBufferSize || "अज्ञात") +
        "। मॉडल लोड करने से पहले स्टोरेज और RAM चेतावनी पढ़ें।");
      setBusy(false);
      break;
    case "module-success":
      setStatus("Runtime modules सफलतापूर्वक लोड हुए: " + data.transformers + " + " + data.onnxRuntime + "। अब WebGPU Adapter की पुष्टि होगी।");
      break;
    case "module-error":
      state.webgpuReady = false;
      state.busy = false;
      setBusy(false);
      setStatus("Runtime Module लोड विफल। चरण: " + data.stage +
        "\\nकारण: " + (data.message || "अज्ञात module import त्रुटि") +
        "\\nTransformers URL: " + (data.transformersUrl || "—") +
        "\\nONNX Runtime URL: " + (data.onnxRuntimeUrl || "—") +
        (data.stack ? "\\nविवरण: " + data.stack : ""), "error");
      break;
    case "feature-error":
      state.webgpuReady = false;
      setStatus("WebGPU प्रारंभ नहीं हुआ: " + data.data, "error");
      setBusy(false);
      break;
    case "loading":
      state.busy = true;
      setBusy(true);
      setStatus("Svāra q4f16 मॉडल और आवश्यक Tokenizer/Codec लोड हो रहे हैं। अनुमानित मॉडल डाउनलोड लगभग 1.95 GB है; पहली बार पर्याप्त समय और स्थिर Wi-Fi दें।");
      break;
    case "ready":
      state.busy = false;
      state.modelReady = true;
      setBusy(false);
      setStatus("Svāra Neural TTS मॉडल इस पेज के वर्तमान Worker में लोड हो गया है। अब छोटा संस्कृत नमूना बनाइए।", "success");
      break;
    case "generating":
      state.busy = true;
      setBusy(true);
      setStatus(data.stage === "synthesis" ? "चुनी हुई महिला Voice में स्थानीय Audio बनाया जा रहा है…" : "स्थानीय Neural Model तैयार हो रहा है…");
      break;
    case "complete":
      state.busy = false;
      setBusy(false);
      if (state.activeAudioUrl) state.previousAudioUrls.add(state.activeAudioUrl);
      state.activeAudioUrl = data.audio;
      byId("svara-audio").src = data.audio;
      byId("svara-audio-panel").hidden = false;
      byId("svara-result").textContent =
        "Voice: " + data.voice + " · Sample Rate: " + data.sampleRate +
        " Hz · अवधि: " + Number(data.durationSeconds || 0).toFixed(2) + " सेकंड";
      setStatus("Audio तैयार है। कृपया संस्कृत उच्चारण और महिला Voice की स्वाभाविकता सुनकर जाँचें।", "success");
      break;
    case "error":
      state.busy = false;
      setBusy(false);
      setStatus("Neural TTS त्रुटि: " + data.data, "error");
      break;
  }
}

function handleWorkerError(event) {
  state.busy = false;
  setBusy(false);
  setStatus("Worker/Module लोड त्रुटि: " + (event.message || "अज्ञात त्रुटि") +
    "। CDN import, WebGPU या browser memory समस्या हो सकती है।", "error");
}

function startWorker() {
  if (state.worker) return;
  try {
    state.worker = new Worker(WORKER_URL, { type: "module", name: "swar-sadhika-svara-neural-test-part2" });
    state.worker.addEventListener("message", handleWorkerMessage);
    state.worker.addEventListener("error", handleWorkerError);
    state.workerReady = true;
    setStatus("स्वतंत्र Svāra Worker शुरू हुआ है। WebGPU जाँच जारी है…");
  } catch (error) {
    setStatus("Worker शुरू नहीं हुआ: " + error.message, "error");
  }
}

function loadModel() {
  if (!state.worker || !state.webgpuReady || state.modelReady || state.busy) return;
  state.busy = true;
  state.loadStarted = true;
  setBusy(true);
  setStatus("मॉडल डाउनलोड/लोड शुरू हो रहा है। इस चरण में लगभग 1.95 GB डाउनलोड हो सकता है।");
  state.worker.postMessage({ type: "preload", dtype: "q4f16" });
}

function generateSpeech() {
  if (!state.worker || !state.modelReady || state.busy) return;
  const text = byId("svara-text").value.trim();
  if (!text) {
    setStatus("पहले संस्कृत परीक्षण-पाठ लिखें।", "error");
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    setStatus("परीक्षण-पाठ अधिकतम " + MAX_TEXT_LENGTH + " अक्षरों तक सीमित है।", "error");
    return;
  }
  const voice = byId("svara-voice").value;
  state.busy = true;
  setBusy(true);
  state.worker.postMessage({ type: "generate", text, speaker_id: voice, dtype: "q4f16" });
}

function stopAudio() {
  const audio = byId("svara-audio");
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  const panel = byId("svara-audio-panel");
  if (panel) panel.hidden = true;
  if (state.activeAudioUrl) {
    URL.revokeObjectURL(state.activeAudioUrl);
    state.activeAudioUrl = null;
  }
}

function destroy() {
  if (state.destroyed) return;
  state.destroyed = true;
  if (state.worker) {
    state.worker.removeEventListener("message", handleWorkerMessage);
    state.worker.removeEventListener("error", handleWorkerError);
    state.worker.terminate();
    state.worker = null;
  }
  stopAudio();
  state.previousAudioUrls.forEach(url => URL.revokeObjectURL(url));
  state.previousAudioUrls.clear();
}

function bind() {
  byId("svara-load").addEventListener("click", loadModel);
  byId("svara-generate").addEventListener("click", generateSpeech);
  byId("svara-stop").addEventListener("click", stopAudio);
  byId("svara-text").addEventListener("input", () => {
    byId("svara-count").textContent = byId("svara-text").value.length + "/" + MAX_TEXT_LENGTH;
  });
  window.addEventListener("pagehide", destroy, { once: true });
  setBusy(false);
  byId("svara-load").disabled = true;
  byId("svara-generate").disabled = true;
  byId("svara-stop").disabled = true;
  void inspectDevice();
  startWorker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind, { once: true });
} else {
  bind();
}

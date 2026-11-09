import { createTtsEngine } from "../tts/tts-engine.js";

const MAX_TEXT_LENGTH = 12000;
const CANVAS_WIDTH = 540;
const CANVAS_HEIGHT = 960;
const FEMALE_HINTS = ["female", "woman", "zira", "heera", "lekha", "priya", "sangeeta", "kavya", "neerja", "raveena", "aarti", "swara", "susan", "samantha", "siri female"];
const PALETTE = ["#ffcf70", "#ff8e9e", "#c7a4ff", "#82d5ff", "#8ee0bd", "#ffe48d", "#f3a6ff", "#a8b8ff"];

const byId = id => document.getElementById(id);
const state = {
  engine: null,
  engineReady: false,
  voices: [],
  selectedVoice: null,
  speaking: false,
  paused: false,
  generation: 0,
  currentLine: "",
  currentPrepared: null,
  revealedCount: 0,
  boundarySeen: false,
  lineStartedAt: 0,
  lineFallbackDuration: 0,
  fallbackTimer: null,
  unsubscribeBoundary: null,
  avatar: null,
  avatarUrl: null,
  videoUrl: null,
  recorder: null,
  recordStream: null,
  micStream: null,
  recordChunks: [],
  downloadUrl: null,
  recordingRequested: false,
  animationFrame: 0,
  destroyed: false
};

const canvas = byId("studio-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const stage = byId("studio-stage");
const video = byId("studio-video");
const avatarImage = byId("studio-avatar-image");
video.loop = true;
video.muted = true;
video.playsInline = true;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

function setStatus(message, kind = "info") {
  const target = byId("studio-status");
  if (!target) return;
  target.textContent = String(message);
  target.dataset.kind = kind;
}

function graphemes(text) {
  const value = String(text || "");
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter("hi", { granularity: "grapheme" }).segment(value), item => ({
      text: item.segment, index: item.index
    }));
  }
  const result = [];
  let offset = 0;
  for (const character of Array.from(value)) {
    result.push({ text: character, index: offset });
    offset += character.length;
  }
  return result;
}

function voiceGenderHint(voice) {
  const name = String(voice && voice.name || "").toLowerCase();
  return FEMALE_HINTS.some(hint => name.includes(hint)) ? "female" : "unknown";
}

function scoreVoice(voice) {
  const language = String(voice && voice.lang || "").toLowerCase();
  let score = voiceGenderHint(voice) === "female" ? 100 : 0;
  if (language === "hi-in") score += 35;
  else if (language.startsWith("hi")) score += 30;
  else if (language.startsWith("sa")) score += 28;
  if (voice && voice.localService === true) score += 10;
  if (voice && voice.default) score += 2;
  return score;
}

function renderVoiceOptions() {
  const select = byId("studio-voice");
  const previous = select.value;
  select.replaceChildren();
  const voices = state.voices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a));
  voices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const gender = voiceGenderHint(voice) === "female" ? " · संभावित महिला स्वर" : "";
    option.textContent = String(voice.name || "स्थानीय Voice") + " (" + String(voice.lang || "भाषा अज्ञात") + ")" + gender;
    select.appendChild(option);
  });
  if (!voices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "कोई स्थानीय हिन्दी/संस्कृत Voice उपलब्ध नहीं";
    select.appendChild(option);
    state.selectedVoice = null;
    select.disabled = true;
    return;
  }
  const previousIndex = Number(previous);
  const chosenIndex = Number.isInteger(previousIndex) && voices[previousIndex] ? previousIndex : 0;
  select.value = String(chosenIndex);
  state.voices = voices;
  state.selectedVoice = voices[chosenIndex];
  select.disabled = false;
  const genderNote = voiceGenderHint(state.selectedVoice) === "female"
    ? "संभावित महिला-स्वर चुना गया है।"
    : "इस डिवाइस की स्थानीय Voice में महिला-स्वर की पहचान नाम से प्रमाणित नहीं हुई; वास्तविक आवाज़ सुनकर जाँचें।";
  setStatus(voices.length + " स्थानीय हिन्दी/संस्कृत Voice उपलब्ध। " + genderNote,
    voiceGenderHint(state.selectedVoice) !== "female");
}

async function refreshVoices() {
  if (!state.engine || state.destroyed) return;
  try {
    let voices = [];
    for (const delay of [0, 160, 350, 650]) {
      if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
      if (state.destroyed) return;
      voices = await state.engine.getVoices({ backendId: "native" });
      if (Array.isArray(voices) && voices.some(voice => voice && voice.localService === true)) break;
    }
    state.voices = (Array.isArray(voices) ? voices : []).filter(voice =>
      voice && voice.localService === true &&
      /^(hi|sa)(-|$)/i.test(String(voice.lang || ""))
    );
    renderVoiceOptions();
  } catch (error) {
    setStatus("स्थानीय Voice सूची प्राप्त नहीं हुई: " + error.message, "error");
  }
}

async function initializeEngine() {
  state.engine = createTtsEngine({ target: window, defaultBackend: "native" });
  state.unsubscribeBoundary = state.engine.on("boundary", detail => {
    if (!state.speaking || state.paused || !state.currentPrepared || !detail) return;
    state.boundarySeen = true;
    const outputIndex = Math.max(0, Number(detail.charIndex) || 0) +
      Math.max(0, Number(detail.charLength) || 0);
    state.revealedCount = sourceGraphemeCountAtOutputIndex(state.currentPrepared, outputIndex);
    if (state.revealedCount > 0) drawStage();
  });
  state.engine.on("error", detail => {
    if (detail && detail.message) setStatus("TTS Engine: " + detail.message, "error");
  });
  const status = await state.engine.initialize({ backendId: "native" });
  if (!status || status.ready !== true) {
    throw new Error("Native TTS Engine इस ब्राउज़र में तैयार नहीं हुआ।");
  }
  state.engineReady = true;
  await refreshVoices();
  byId("studio-fullscreen-play").disabled = !state.voices.length;
  byId("studio-record-download").disabled = !state.voices.length;
  byId("studio-play-preview").disabled = !state.voices.length;
  byId("studio-stop").disabled = true;
  byId("studio-pause").disabled = true;
  byId("studio-resume").disabled = true;
}

function sourceGraphemeCountAtOutputIndex(prepared, outputIndex) {
  const source = String(prepared && prepared.originalText || state.currentLine);
  const segments = graphemes(source);
  const map = prepared && prepared.compilerOutput && prepared.compilerOutput.sourceMap;
  let sourceIndex = Math.min(source.length, outputIndex);
  if (Array.isArray(map) && map.length) {
    const segment = map.find(item =>
      outputIndex >= item.outputStartUtf16 && outputIndex <= item.outputEndUtf16
    );
    if (segment) {
      if (segment.kind === "copy") {
        sourceIndex = Math.min(segment.sourceEndUtf16,
          segment.sourceStartUtf16 + Math.max(0, outputIndex - segment.outputStartUtf16));
      } else {
        sourceIndex = segment.sourceEndUtf16;
      }
    } else if (outputIndex >= map[map.length - 1].outputEndUtf16) {
      sourceIndex = source.length;
    }
  }
  let count = 0;
  for (const item of segments) {
    if (item.index < sourceIndex) count += 1;
    else break;
  }
  return Math.max(0, Math.min(segments.length, count));
}

function coverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

function drawCover(source, sourceWidth, sourceHeight, x, y, width, height) {
  if (!sourceWidth || !sourceHeight) return;
  const rect = coverRect(sourceWidth, sourceHeight, width, height);
  ctx.drawImage(source, x + rect.x, y + rect.y, rect.width, rect.height);
}

function drawAvatarOverlay() {
  if (!avatarImage.complete || !avatarImage.naturalWidth || !byId("studio-avatar-overlay").checked) return;
  const x = 374, y = 78, width = 118, height = 170, radius = 20;
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
  ctx.clip();
  drawCover(avatarImage, avatarImage.naturalWidth, avatarImage.naturalHeight, x, y, width, height);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "#f6d28c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
  ctx.stroke();
  ctx.restore();
}

function wrapGraphemes(items, maxWidth, font) {
  ctx.font = font;
  const lines = [];
  let line = [];
  let width = 0;
  for (const item of items) {
    const itemWidth = ctx.measureText(item.text).width;
    if (line.length && width + itemWidth > maxWidth && !/^\s$/u.test(item.text)) {
      lines.push(line);
      line = [];
      width = 0;
    }
    line.push({ ...item, width: itemWidth });
    width += itemWidth;
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

function drawTextLine() {
  const line = state.currentLine;
  if (!line) return;
  const mode = byId("studio-text-mode").value;
  const all = graphemes(line);
  const visible = mode === "character" ? all.slice(0, state.revealedCount) : all;
  const fontSize = all.length > 58 ? 34 : all.length > 40 ? 38 : 44;
  const font = "700 " + fontSize + "px system-ui, 'Noto Sans Devanagari', sans-serif";
  const wrapped = wrapGraphemes(visible, 454, font);
  const lineHeight = Math.round(fontSize * 1.38);
  const contentHeight = wrapped.length * lineHeight;
  const bottomMode = mode === "bottom";
  const startY = bottomMode
    ? CANVAS_HEIGHT - 110 - contentHeight
    : Math.max(110, Math.round((CANVAS_HEIGHT - contentHeight) / 2));
  const panelX = 24;
  const panelY = Math.max(28, startY - lineHeight * 0.72);
  const panelH = Math.min(CANVAS_HEIGHT - panelY - 24, contentHeight + lineHeight * 1.25);

  ctx.save();
  ctx.fillStyle = "rgba(8, 7, 19, 0.64)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(panelX, panelY, 492, panelH, 24);
  else ctx.rect(panelX, panelY, 492, panelH);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.font = font;
  wrapped.forEach((glyphLine, row) => {
    const width = glyphLine.reduce((sum, glyph) => sum + glyph.width, 0);
    let x = (CANVAS_WIDTH - width) / 2;
    const y = startY + row * lineHeight;
    glyphLine.forEach((glyph, index) => {
      const colourIndex = (all.findIndex(item => item.index === glyph.index) + row + 1) % PALETTE.length;
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(5, 4, 14, 0.95)";
      ctx.strokeText(glyph.text, x, y);
      ctx.fillStyle = PALETTE[colourIndex];
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 8;
      ctx.fillText(glyph.text, x, y);
      x += glyph.width;
    });
  });
  ctx.restore();
  if (mode === "character" && state.revealedCount < all.length) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("वर्ण-दर-वर्ण वाचन", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 44);
    ctx.restore();
  }
}

function drawStage() {
  if (!ctx || state.destroyed) return;
  ctx.fillStyle = "#090713";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (video.src && video.readyState >= 2 && video.videoWidth) {
    drawCover(video, video.videoWidth, video.videoHeight, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawAvatarOverlay();
  } else if (avatarImage.src && avatarImage.complete && avatarImage.naturalWidth) {
    drawCover(avatarImage, avatarImage.naturalWidth, avatarImage.naturalHeight, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#18132b");
    gradient.addColorStop(1, "#35204a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "600 27px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("स्वर-साधिका", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 16);
    ctx.font = "400 18px system-ui, sans-serif";
    ctx.fillText("अवतार फोटो या वीडियो क्लिप जोड़ें", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 28);
  }
  drawTextLine();
}

function startCanvasLoop() {
  if (state.animationFrame || state.destroyed) return;
  const tick = () => {
    state.animationFrame = 0;
    if (state.destroyed) return;
    drawStage();
    if (state.speaking && !state.paused && video.src && !video.paused) {
      state.animationFrame = requestAnimationFrame(tick);
    }
  };
  state.animationFrame = requestAnimationFrame(tick);
}

function stopCanvasLoop() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  drawStage();
}

function handleAvatarChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("अवतार के लिए फोटो फ़ाइल चुनें।", "error");
    return;
  }
  if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
  state.avatarUrl = URL.createObjectURL(file);
  avatarImage.onload = () => drawStage();
  avatarImage.src = state.avatarUrl;
  byId("studio-avatar-name").textContent = file.name;
  byId("studio-avatar-overlay").disabled = false;
  byId("studio-avatar-overlay").checked = true;
  drawStage();
}

function handleVideoChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    setStatus("वीडियो क्लिप फ़ाइल चुनें।", "error");
    return;
  }
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  video.pause();
  video.src = state.videoUrl;
  video.loop = true;
  video.muted = true;
  video.load();
  video.onloadedmetadata = () => {
    byId("studio-video-name").textContent = file.name + " · " +
      (Number.isFinite(video.duration) ? video.duration.toFixed(1) + " सेकंड · Loop" : "Loop");
    drawStage();
  };
  video.onerror = () => setStatus("वीडियो फ़ाइल इस ब्राउज़र में नहीं खुल सकी। MP4 (H.264) या WebM आज़माएँ।", "error");
}

function mapBoundaryToVisible(detail) {
  if (!state.currentPrepared || !detail) return;
  const outputIndex = Math.max(0, Number(detail.charIndex) || 0) +
    Math.max(0, Number(detail.charLength) || 0);
  state.revealedCount = sourceGraphemeCountAtOutputIndex(state.currentPrepared, outputIndex);
  drawStage();
}

function startCharacterFallback(line) {
  clearInterval(state.fallbackTimer);
  state.boundarySeen = false;
  state.lineStartedAt = performance.now();
  const count = graphemes(line).length;
  const rate = Number(byId("studio-rate").value) || 1;
  state.lineFallbackDuration = Math.max(1800, count * 170 / rate);
  state.fallbackTimer = window.setInterval(() => {
    if (!state.speaking || state.paused) return;
    const elapsed = performance.now() - state.lineStartedAt;
    const progress = Math.min(1, elapsed / state.lineFallbackDuration);
    state.revealedCount = Math.max(state.revealedCount, Math.ceil(count * progress));
    if (byId("studio-text-mode").value === "character") drawStage();
  }, 90);
}

function clearCharacterFallback() {
  if (state.fallbackTimer !== null) window.clearInterval(state.fallbackTimer);
  state.fallbackTimer = null;
}

function setPlayerButtons() {
  const active = state.speaking;
  byId("studio-fullscreen-play").disabled = !state.engineReady || !state.voices.length || active;
  byId("studio-record-download").disabled = !state.engineReady || !state.voices.length || active;
  byId("studio-play-preview").disabled = !state.engineReady || !state.voices.length || active;
  byId("studio-stop").disabled = !active;
  byId("studio-pause").disabled = !active || state.paused;
  byId("studio-resume").disabled = !active || !state.paused;
}

function currentVoice() {
  const selected = Number(byId("studio-voice").value);
  return Number.isInteger(selected) && state.voices[selected] ? state.voices[selected] : state.selectedVoice;
}

function getLines() {
  return byId("studio-text").value.split(/\r?\n/u).filter(line => line.trim().length > 0);
}

async function beginPlayback(options = {}) {
  if (!state.engineReady) throw new Error("Native TTS Engine अभी तैयार नहीं है।");
  if (state.speaking) return;
  const lines = getLines();
  if (!lines.length) throw new Error("पहले टेक्स्ट बॉक्स में पाठ लिखें।");
  if (byId("studio-text").value.length > MAX_TEXT_LENGTH) {
    throw new Error("पाठ अधिकतम " + MAX_TEXT_LENGTH + " अक्षरों तक सीमित है।");
  }
  const voice = currentVoice();
  if (!voice || voice.localService !== true) throw new Error("कोई स्थानीय महिला-प्राथमिकता वाली Voice उपलब्ध नहीं है।");

  const generation = ++state.generation;
  state.speaking = true;
  state.paused = false;
  state.revealedCount = 0;
  setPlayerButtons();
  if (video.src) {
    video.loop = true;
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(error => setStatus("वीडियो चल नहीं सका: " + error.message, "error"));
      }
    } catch (error) {
      setStatus("वीडियो चल नहीं सका: " + error.message, "error");
    }
    startCanvasLoop();
  }
  setStatus("स्थानीय Voice से " + lines.length + " पंक्तियों का वाचन शुरू हो रहा है।");
  try {
    for (let index = 0; index < lines.length; index += 1) {
      if (generation !== state.generation || state.destroyed) break;
      while (state.paused && generation === state.generation) {
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
      if (generation !== state.generation || state.destroyed) break;
      const line = lines[index];
      state.currentLine = line;
      state.revealedCount = 0;
      state.boundarySeen = false;
      const lang = voice.lang || "hi-IN";
      state.currentPrepared = state.engine.prepareSpeech(line, {
        backendType: "native",
        voice
      });
      drawStage();
      setStatus("पंक्ति " + (index + 1) + " / " + lines.length + " · " + voice.name + " · " + lang);
      startCharacterFallback(line);
      const result = await state.engine.speak(line, {
        voice,
        lang,
        rate: Number(byId("studio-rate").value) || 1,
        pitch: 1,
        volume: 1,
        replace: false
      });
      clearCharacterFallback();
      if (generation !== state.generation || state.destroyed) break;
      if (result && result.status === "cancelled") break;
      state.revealedCount = graphemes(line).length;
      drawStage();
    }
  } catch (error) {
    if (generation === state.generation && !state.destroyed) {
      setStatus("TTS वाचन त्रुटि: " + (error && error.message ? error.message : "अज्ञात त्रुटि"), "error");
    }
  } finally {
    if (generation === state.generation) {
      state.speaking = false;
      state.paused = false;
      clearCharacterFallback();
      video.pause();
      stopCanvasLoop();
      setPlayerButtons();
      if (options.recording && state.recorder && state.recorder.state !== "inactive") {
        state.recorder.stop();
        setStatus("वाचन पूरा हुआ। आवाज़ सहित वीडियो तैयार किया जा रहा है…");
      } else if (!state.destroyed) {
        setStatus("वाचन पूरा हुआ।");
      }
    }
  }
}

async function startFullscreenPlayback() {
  if (state.speaking) return;
  try {
    if (typeof stage.requestFullscreen === "function") {
      const request = stage.requestFullscreen();
      if (request && typeof request.catch === "function") request.catch(() => {
        setStatus("Full Screen अनुमति/सुविधा उपलब्ध नहीं हुई; वाचन पेज में जारी रहेगा।", "warn");
      });
    } else {
      document.body.classList.add("studio-expanded");
    }
  } catch (error) {
    setStatus("Full Screen प्रारंभ नहीं हुआ: " + error.message, "warn");
  }
  void beginPlayback().catch(error => setStatus(error.message, "error"));
}

function getRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecordingAndPlayback() {
  if (state.speaking || state.recorder) return;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    setStatus("इस ब्राउज़र में माइक्रोफ़ोन रिकॉर्डिंग उपलब्ध नहीं है; आवाज़ सहित डाउनलोड नहीं बन सकेगा।", "error");
    return;
  }
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    setStatus("Canvas/MediaRecorder रिकॉर्डिंग इस ब्राउज़र में उपलब्ध नहीं है।", "error");
    return;
  }
  const mimeType = getRecorderMimeType();
  if (!mimeType) {
    setStatus("यह ब्राउज़र WebM Video+Audio रिकॉर्डिंग समर्थित नहीं करता।", "error");
    return;
  }
  try {
    setStatus("माइक्रोफ़ोन अनुमति माँगी जा रही है। आवाज़ रिकॉर्ड करने के लिए फोन का लाउडस्पीकर चालू रखें और Earphones हटाएँ।");
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
    if (!mic.getAudioTracks().length) {
      mic.getTracks().forEach(track => track.stop());
      throw new Error("माइक्रोफ़ोन से Audio Track उपलब्ध नहीं हुआ।");
    }
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...mic.getAudioTracks()
    ]);
    state.micStream = mic;
    state.recordStream = combined;
    state.recordChunks = [];
    state.recordingRequested = true;
    state.recorder = new MediaRecorder(combined, { mimeType });
    state.recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) state.recordChunks.push(event.data);
    };
    state.recorder.onerror = event => {
      setStatus("रिकॉर्डिंग त्रुटि: " + (event.error && event.error.message || "अज्ञात त्रुटि"), "error");
    };
    state.recorder.onstop = () => {
      const blob = new Blob(state.recordChunks, { type: mimeType });
      if (state.micStream) state.micStream.getTracks().forEach(track => track.stop());
      if (state.recordStream) state.recordStream.getTracks().forEach(track => track.stop());
      state.micStream = null;
      state.recordStream = null;
      state.recorder = null;
      state.recordingRequested = false;
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      if (blob.size > 0) {
        state.downloadUrl = URL.createObjectURL(blob);
        const link = byId("studio-download-link");
        link.href = state.downloadUrl;
        link.download = "swar-sadhika-voice-" + new Date().toISOString().replace(/[:.]/g, "-") + ".webm";
        link.hidden = false;
        link.textContent = "आवाज़ सहित वीडियो डाउनलोड करें (" + (blob.size / 1048576).toFixed(1) + " MB)";
        setStatus("वीडियो और माइक्रोफ़ोन से रिकॉर्ड की गई TTS आवाज़ तैयार है। डाउनलोड बटन दबाएँ।", "success");
      } else {
        setStatus("रिकॉर्डिंग खाली बनी। माइक्रोफ़ोन/स्पीकर की अनुमति और Volume जाँचें।", "error");
      }
    };
    state.recorder.start(500);
    void beginPlayback({ recording: true }).catch(error => {
      setStatus("वाचन/रिकॉर्डिंग शुरू नहीं हुई: " + error.message, "error");
      if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
    });
  } catch (error) {
    if (state.micStream) state.micStream.getTracks().forEach(track => track.stop());
    state.micStream = null;
    state.recordStream = null;
    state.recorder = null;
    state.recordingRequested = false;
    setStatus("आवाज़ सहित रिकॉर्डिंग शुरू नहीं हुई: " + (error && error.message ? error.message : "अनुमति नहीं मिली") +
      "। आप Full Screen + TTS से बिना डाउनलोड वाचन चला सकती हैं।", "error");
  }
}

async function stopPlayback() {
  state.generation += 1;
  state.speaking = false;
  state.paused = false;
  clearCharacterFallback();
  try { if (state.engine) await state.engine.cancel(); } catch (_) {}
  video.pause();
  stopCanvasLoop();
  setPlayerButtons();
  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
    setStatus("वाचन रोक दिया गया। अभी तक रिकॉर्ड हुआ भाग डाउनलोड के लिए तैयार होगा।");
  } else {
    setStatus("वाचन रोक दिया गया।");
  }
}

function pausePlayback() {
  if (!state.speaking || state.paused) return;
  state.paused = true;
  void state.engine.pause();
  video.pause();
  setPlayerButtons();
  setStatus("वाचन रुका हुआ है।");
}

function resumePlayback() {
  if (!state.speaking || !state.paused) return;
  state.paused = false;
  void state.engine.resume();
  if (video.src) {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
    startCanvasLoop();
  }
  setPlayerButtons();
  setStatus("वाचन फिर शुरू हुआ।");
}

function removeAvatar() {
  if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
  state.avatarUrl = null;
  avatarImage.removeAttribute("src");
  byId("studio-avatar-file").value = "";
  byId("studio-avatar-name").textContent = "कोई अवतार फोटो चयनित नहीं";
  byId("studio-avatar-overlay").checked = false;
  byId("studio-avatar-overlay").disabled = true;
  drawStage();
}

function removeVideo() {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = null;
  video.pause();
  video.removeAttribute("src");
  video.load();
  byId("studio-video-file").value = "";
  byId("studio-video-name").textContent = "कोई वीडियो क्लिप चयनित नहीं";
  drawStage();
}

function updateTextPreview() {
  const value = byId("studio-text").value;
  byId("studio-text-count").textContent = value.length + " / " + MAX_TEXT_LENGTH + " अक्षर";
  if (!state.speaking) {
    state.currentLine = getLines()[0] || "";
    state.revealedCount = graphemes(state.currentLine).length;
    drawStage();
  }
}

function goToMainIndex() {
  if (state.speaking) void stopPlayback();
  window.location.href = "./index.html";
}

function bind() {
  byId("studio-avatar-file").addEventListener("change", handleAvatarChange);
  byId("studio-video-file").addEventListener("change", handleVideoChange);
  byId("studio-remove-avatar").addEventListener("click", removeAvatar);
  byId("studio-remove-video").addEventListener("click", removeVideo);
  byId("studio-avatar-overlay").addEventListener("change", drawStage);
  byId("studio-text").addEventListener("input", updateTextPreview);
  byId("studio-text-mode").addEventListener("change", drawStage);
  byId("studio-fullscreen-play").addEventListener("click", startFullscreenPlayback);
  byId("studio-record-download").addEventListener("click", startRecordingAndPlayback);
  byId("studio-play-preview").addEventListener("click", () => {
    void beginPlayback().catch(error => setStatus(error.message, "error"));
  });
  byId("studio-stop").addEventListener("click", () => void stopPlayback());
  byId("studio-pause").addEventListener("click", pausePlayback);
  byId("studio-resume").addEventListener("click", resumePlayback);
  byId("studio-main-index").addEventListener("click", goToMainIndex);
  byId("studio-main-index-full").addEventListener("click", goToMainIndex);
  byId("studio-exit-fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else document.body.classList.remove("studio-expanded");
  });
  byId("studio-rate").addEventListener("input", () => {
    byId("studio-rate-value").textContent = Number(byId("studio-rate").value).toFixed(2) + "×";
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    byId("studio-main-index-full").hidden = !active;
    byId("studio-exit-fullscreen").hidden = !active;
    if (!active) byId("studio-main-index").hidden = false;
  });
  window.addEventListener("pagehide", () => {
    if (state.destroyed) return;
    state.destroyed = true;
    state.generation += 1;
    clearCharacterFallback();
    video.pause();
    if (state.engine) {
      state.engine.cancel().catch(() => {});
      state.engine.dispose().catch(() => {});
    }
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
    if (state.micStream) state.micStream.getTracks().forEach(track => track.stop());
    if (state.recordStream) state.recordStream.getTracks().forEach(track => track.stop());
    if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    stopCanvasLoop();
  }, { once: true });

  byId("studio-avatar-overlay").disabled = true;
  byId("studio-main-index-full").hidden = true;
  byId("studio-exit-fullscreen").hidden = true;
  byId("studio-fullscreen-play").disabled = true;
  byId("studio-record-download").disabled = true;
  byId("studio-play-preview").disabled = true;
  byId("studio-stop").disabled = true;
  byId("studio-pause").disabled = true;
  byId("studio-resume").disabled = true;
  updateTextPreview();
  drawStage();
  void initializeEngine().then(() => {
    if (state.destroyed) return;
    setPlayerButtons();
  }).catch(error => setStatus("TTS तैयार नहीं हुआ: " + error.message, "error"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind, { once: true });
} else {
  bind();
}

export function selfTest() {
  const sample = graphemes("क्षि");
  const checks = [
    { id: "9x16-canvas", passed: canvas.width / canvas.height === 9 / 16 },
    { id: "native-engine", passed: typeof createTtsEngine === "function" },
    { id: "grapheme-segmentation", passed: sample.length > 0 && sample.map(item => item.text).join("") === "क्षि" },
    { id: "text-limit", passed: MAX_TEXT_LENGTH === 12000 },
    { id: "looping-video", passed: video.loop === true }
  ];
  return {
    passed: checks.every(item => item.passed),
    total: checks.length,
    checks,
    capabilities: {
      mediaRecorder: typeof MediaRecorder !== "undefined",
      canvasCaptureStream: typeof canvas.captureStream === "function",
      microphone: Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function"),
      fullscreen: typeof stage.requestFullscreen === "function"
    }
  };
}

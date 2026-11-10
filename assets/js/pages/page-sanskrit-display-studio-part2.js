import { createTtsEngine } from "../tts/tts-engine.js";

/*
 * SWR-AI-BRAIN-LOCK-V1 extension — 2026-11-10:
 * Discover the real browser/Android SpeechSynthesis voice inventory.
 * Only explicit local Hindi/Sanskrit voices may be used for offline playback.
 * Remote, unknown-locality, and other-language voices remain visible as
 * unavailable information; female voice identity is never claimed as fact.
 */

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
  unsubscribeVoices: null,
  systemVoices: [],
  voiceRefreshToken: 0,
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
  let joinNext = false;
  const attachMark = /[\u0300-\u036f\u093a-\u094d\u0951-\u0957\u0962-\u0963\u200c\u200d]/u;
  for (const character of Array.from(value)) {
    if (result.length && (attachMark.test(character) || joinNext)) {
      result[result.length - 1].text += character;
    } else {
      result.push({ text: character, index: offset });
    }
    joinNext = character === "\u094d" || character === "\u200c" || character === "\u200d";
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

function supportsStudioLanguage(voice) {
  return Boolean(voice && /^(hi|sa)([-_]|$)/i.test(String(voice.lang || "").trim()));
}

function isSelectableLocalVoice(voice) {
  return supportsStudioLanguage(voice) && voice.localService === true;
}

function voiceLocalityLabel(voice) {
  if (voice && voice.localService === true) return "स्थानीय";
  if (voice && voice.localService === false) return "ऑनलाइन / स्थानीय नहीं";
  return "स्थानीयता अज्ञात";
}

function voiceLanguageLabel(voice) {
  const language = String(voice && voice.lang || "").trim();
  if (/^hi([-_]|$)/i.test(language)) return "हिन्दी";
  if (/^sa([-_]|$)/i.test(language)) return "संस्कृत";
  return language || "भाषा अज्ञात";
}

function voiceIdentity(voice) {
  return [
    String(voice && voice.voiceURI || ""),
    String(voice && voice.name || ""),
    String(voice && voice.lang || ""),
    String(voice && voice.localService)
  ].join("|");
}

function setVoiceUiStatus(message, kind = "info") {
  const target = byId("studio-voice-status");
  if (!target) return;
  target.textContent = String(message);
  target.dataset.kind = kind;
}

function installVoiceSelectorTools() {
  if (byId("studio-voice-tools")) return;
  const select = byId("studio-voice");
  const grid = select && select.closest(".grid");
  if (!grid) return;

  const tools = document.createElement("div");
  tools.id = "studio-voice-tools";
  tools.className = "stack";
  tools.style.marginTop = "8px";

  const actions = document.createElement("div");
  actions.className = "actions";

  const refresh = document.createElement("button");
  refresh.id = "studio-voice-refresh";
  refresh.className = "btn";
  refresh.type = "button";
  refresh.textContent = "↻ Android Voice फिर जाँचें";

  const test = document.createElement("button");
  test.id = "studio-voice-test";
  test.className = "btn accent";
  test.type = "button";
  test.textContent = "♫ चयनित Voice का नमूना सुनें";

  const status = document.createElement("div");
  status.id = "studio-voice-status";
  status.className = "tiny";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  actions.append(refresh, test);
  tools.append(actions, status);
  grid.insertAdjacentElement("afterend", tools);

  refresh.addEventListener("click", () => {
    void refreshVoices(true);
  });
  test.addEventListener("click", () => {
    void playSelectedVoiceSample();
  });
  select.addEventListener("change", () => {
    const index = Number(select.value);
    state.selectedVoice = Number.isInteger(index) ? (state.voices[index] || null) : null;
    if (state.selectedVoice) {
      const hint = voiceGenderHint(state.selectedVoice) === "female"
        ? "नाम से संभावित महिला स्वर; वास्तविक स्वर नमूना सुनकर जाँचें।"
        : "इस Voice का लिंग नाम से प्रमाणित नहीं है; नमूना सुनकर जाँचें।";
      setVoiceUiStatus(
        voiceLanguageLabel(state.selectedVoice) + " · " +
        voiceLocalityLabel(state.selectedVoice) + " · " + hint
      );
    }
  });
}

function renderVoiceOptions() {
  const select = byId("studio-voice");
  const previousIdentity = state.selectedVoice ? voiceIdentity(state.selectedVoice) : "";
  const discovered = Array.isArray(state.systemVoices) ? state.systemVoices.slice() : [];
  const usable = discovered.filter(isSelectableLocalVoice).sort((a, b) => scoreVoice(b) - scoreVoice(a));
  const unavailable = discovered.filter(voice => !isSelectableLocalVoice(voice));
  state.voices = usable;

  select.replaceChildren();
  if (usable.length) {
    const localGroup = document.createElement("optgroup");
    localGroup.label = "स्थानीय हिन्दी / संस्कृत — चयन योग्य";
    usable.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      const femaleHint = voiceGenderHint(voice) === "female"
        ? " · नाम से संभावित महिला"
        : " · स्वर-लिंग अप्रमाणित";
      option.textContent = String(voice.name || "स्थानीय Voice") + " (" +
        voiceLanguageLabel(voice) + " · " + String(voice.lang || "") + ")" + femaleHint;
      localGroup.appendChild(option);
    });
    select.appendChild(localGroup);
  }

  if (unavailable.length) {
    const unavailableGroup = document.createElement("optgroup");
    unavailableGroup.label = "अन्य / ऑनलाइन / स्थानीयता अप्रमाणित — केवल जानकारी";
    unavailable.forEach(voice => {
      const option = document.createElement("option");
      option.value = "unavailable:" + voiceIdentity(voice);
      option.disabled = true;
      const reason = !supportsStudioLanguage(voice)
        ? "इस पाठ के लिए भाषा अनुपयुक्त"
        : voiceLocalityLabel(voice) + " — ऑफलाइन चयन निष्क्रिय";
      option.textContent = String(voice.name || "Android Voice") + " (" +
        voiceLanguageLabel(voice) + " · " + String(voice.lang || "") + " · " + reason + ")";
      unavailableGroup.appendChild(option);
    });
    select.appendChild(unavailableGroup);
  }

  if (!usable.length) {
    const option = document.createElement("option");
    option.value = "";
    option.disabled = true;
    option.selected = true;
    option.textContent = discovered.length
      ? "कोई चयनयोग्य स्थानीय हिन्दी/संस्कृत Voice नहीं मिली"
      : "Android से हिन्दी/संस्कृत Voice सूची प्राप्त नहीं हुई";
    select.insertBefore(option, select.firstChild);
    state.selectedVoice = null;
  } else {
    const previousIndex = usable.findIndex(voice => voiceIdentity(voice) === previousIdentity);
    const chosenIndex = previousIndex >= 0 ? previousIndex : 0;
    select.value = String(chosenIndex);
    state.selectedVoice = usable[chosenIndex];
  }

  /* Keep the control openable so the user can inspect unavailable system entries. */
  select.disabled = false;

  const remoteCompatible = discovered.filter(voice =>
    supportsStudioLanguage(voice) && voice.localService !== true
  ).length;
  if (usable.length) {
    const selected = state.selectedVoice;
    const femaleNote = voiceGenderHint(selected) === "female"
      ? "नाम से संभावित महिला स्वर; इसकी पुष्टि नमूना सुनकर करें।"
      : "महिला/पुरुष स्वर का विश्वसनीय metadata उपलब्ध नहीं; नमूना सुनकर निर्णय करें।";
    setVoiceUiStatus(
      usable.length + " चयनयोग्य स्थानीय हिन्दी/संस्कृत Voice मिलीं। " +
      femaleNote + (remoteCompatible
        ? " अतिरिक्त " + remoteCompatible + " गैर-स्थानीय/अप्रमाणित Voice केवल जानकारी के लिए दिख रही हैं।"
        : "")
    );
  } else if (discovered.length) {
    setVoiceUiStatus(
      "Android ने " + discovered.length + " Voice लौटाईं, लेकिन उनमें कोई स्थानीय हिन्दी/संस्कृत Voice नहीं है। " +
      "ऑनलाइन या स्थानीयता-अज्ञात Voice को इस ऑफलाइन App में चलाना अवरुद्ध है।",
      "warn"
    );
  } else {
    setVoiceUiStatus(
      "Chrome की Android SpeechSynthesis सूची अभी खाली है। Android Text-to-speech output में हिन्दी Voice Data डाउनलोड/सक्रिय करें; फिर 'Voice फिर जाँचें' दबाएँ।",
      "warn"
    );
  }
}

async function refreshVoices(userInitiated = false) {
  if (state.destroyed) return;
  const token = ++state.voiceRefreshToken;
  const synthesis = window.speechSynthesis;
  if (!synthesis || typeof synthesis.getVoices !== "function") {
    state.systemVoices = [];
    renderVoiceOptions();
    setVoiceUiStatus("इस Chrome में SpeechSynthesis Voice सूची API उपलब्ध नहीं है।", "error");
    if (state.engineReady) setPlayerButtons();
    return;
  }

  const refreshButton = byId("studio-voice-refresh");
  if (refreshButton) refreshButton.textContent = "↻ Voice सूची जाँची जा रही है…";
  try {
    let discovered = [];
    for (const delay of [0, 250, 550, 950, 1500, 2200]) {
      if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
      if (state.destroyed || token !== state.voiceRefreshToken) return;
      const current = synthesis.getVoices();
      if (Array.isArray(current)) discovered = current.slice();
      /* Do not stop merely because an unrelated local voice (for example English) appeared. */
      if (discovered.some(isSelectableLocalVoice)) break;
    }
    if (state.destroyed || token !== state.voiceRefreshToken) return;

    const unique = new Map();
    discovered.forEach(voice => {
      if (voice && typeof voice === "object") unique.set(voiceIdentity(voice), voice);
    });
    state.systemVoices = Array.from(unique.values()).sort((a, b) => {
      const aSupported = supportsStudioLanguage(a) ? 1 : 0;
      const bSupported = supportsStudioLanguage(b) ? 1 : 0;
      if (aSupported !== bSupported) return bSupported - aSupported;
      return scoreVoice(b) - scoreVoice(a);
    });
    renderVoiceOptions();
    if (userInitiated && state.voices.length) {
      setStatus("Android की स्थानीय हिन्दी/संस्कृत Voice सूची अपडेट हो गई।", "success");
    } else if (userInitiated) {
      setStatus("Voice सूची जाँची गई; कोई चयनयोग्य स्थानीय हिन्दी/संस्कृत Voice नहीं मिली।", "warn");
    }
    if (state.engineReady) setPlayerButtons();
  } catch (error) {
    setVoiceUiStatus(
      "Android Voice सूची पढ़ते समय त्रुटि: " +
      (error && error.message ? error.message : "अज्ञात त्रुटि"),
      "error"
    );
  } finally {
    if (refreshButton && token === state.voiceRefreshToken) {
      refreshButton.textContent = "↻ Android Voice फिर जाँचें";
    }
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
  state.unsubscribeVoices = state.engine.on("voiceschanged", () => {
    if (!state.destroyed) void refreshVoices();
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
  setPlayerButtons();
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

function wrapShapedText(text, maxWidth, font) {
  ctx.font = font;
  const words = String(text || "").trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [];

  const rows = [];
  let row = "";

  function splitLongWord(word) {
    const chunks = [];
    let chunk = "";
    for (const item of graphemes(word)) {
      const candidate = chunk + item.text;
      if (chunk && ctx.measureText(candidate).width > maxWidth) {
        chunks.push(chunk);
        chunk = item.text;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  for (const word of words) {
    const pieces = splitLongWord(word);
    if (!pieces.length) continue;
    const firstCandidate = row ? row + " " + pieces[0] : pieces[0];
    if (row && ctx.measureText(firstCandidate).width > maxWidth) {
      rows.push(row);
      row = pieces[0];
    } else {
      row = firstCandidate;
    }
    for (let index = 1; index < pieces.length; index += 1) {
      if (row) rows.push(row);
      row = pieces[index];
    }
  }

  if (row) rows.push(row);
  return rows;
}

function drawTextLine() {
  const line = state.currentLine;
  if (!line) return;

  const mode = byId("studio-text-mode").value;
  const all = graphemes(line);
  const visible = mode === "character" ? all.slice(0, state.revealedCount) : all;
  const visibleText = visible.map(item => item.text).join("");
  if (!visibleText) {
    if (mode === "character" && state.speaking) {
      ctx.save();
      ctx.fillStyle = "#ffe48d";
      ctx.textAlign = "center";
      ctx.font = "600 30px system-ui, 'Noto Sans Devanagari', sans-serif";
      ctx.shadowColor = "#c7a4ff";
      ctx.shadowBlur = 20;
      ctx.fillText("✧", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.restore();
    }
    return;
  }

  const fontSize = all.length > 58 ? 34 : all.length > 40 ? 38 : 44;
  const font = "700 " + fontSize + "px system-ui, 'Noto Sans Devanagari', sans-serif";
  const wrapped = wrapShapedText(visibleText, 454, font);
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
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.font = font;
  wrapped.forEach((textRow, rowIndex) => {
    const width = ctx.measureText(textRow).width;
    const x = (CANVAS_WIDTH - width) / 2;
    const y = startY + rowIndex * lineHeight;
    const gradient = ctx.createLinearGradient(x, y, x + Math.max(1, width), y);
    PALETTE.forEach((colour, index) => {
      gradient.addColorStop(index / (PALETTE.length - 1), colour);
    });
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(5, 4, 14, 0.95)";
    ctx.shadowColor = mode === "character" && state.speaking ? "#c7a4ff" : "rgba(0,0,0,0.85)";
    ctx.shadowBlur = mode === "character" && state.speaking ? 15 : 8;
    ctx.strokeText(textRow, x, y);
    ctx.fillStyle = gradient;
    ctx.fillText(textRow, x, y);
  });
  ctx.restore();

  if (mode === "character" && state.speaking && visible.length > 0 && wrapped.length) {
    const lastRow = wrapped[wrapped.length - 1];
    const lastWidth = ctx.measureText(lastRow).width;
    const tailX = Math.min(CANVAS_WIDTH - 24, (CANVAS_WIDTH + lastWidth) / 2 + 5);
    const tailY = startY + (wrapped.length - 1) * lineHeight;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 135);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#fff5cb";
    ctx.shadowColor = "#ffe48d";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(tailX, tailY, 3.5 + pulse * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✦", Math.max(18, tailX - 7), tailY - 20);
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
    if (video.src && !video.paused && video.readyState >= 2) {
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
  video.playsInline = true;
  video.preload = "auto";
  video.load();

  video.onloadedmetadata = () => {
    byId("studio-video-name").textContent = file.name + " · " +
      (Number.isFinite(video.duration) ? video.duration.toFixed(1) + " सेकंड · Loop" : "Loop");
    drawStage();
  };

  const showVideoFrame = () => {
    if (!video.src || video.readyState < 2) return;
    drawStage();
    if (video.paused) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(() => {
          if (!state.destroyed) startCanvasLoop();
        }).catch(() => {
          drawStage();
          setStatus("वीडियो का पहला फ्रेम दिखाया गया है। चलाने के लिए पेज पर सुनें या Full Screen दबाएँ।", "warn");
        });
      } else {
        startCanvasLoop();
      }
    } else {
      startCanvasLoop();
    }
  };

  video.onloadeddata = showVideoFrame;
  video.oncanplay = showVideoFrame;
  video.onerror = () => setStatus("वीडियो फ़ाइल इस ब्राउज़र में खुल नहीं सकी। MP4 (H.264) या WebM वीडियो आज़माएँ।", "error");
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
  state.lineFallbackDuration = Math.max(1400, count * 105 / rate);
  state.fallbackTimer = window.setInterval(() => {
    if (!state.speaking || state.paused) return;
    const elapsed = performance.now() - state.lineStartedAt;
    const progress = Math.min(1, elapsed / state.lineFallbackDuration);
    state.revealedCount = Math.max(state.revealedCount, Math.ceil(count * progress));
    if (byId("studio-text-mode").value === "character") drawStage();
  }, 75);
}

function clearCharacterFallback() {
  if (state.fallbackTimer !== null) window.clearInterval(state.fallbackTimer);
  state.fallbackTimer = null;
}

function installPlayerStyles() {
  if (byId("studio-player-runtime-styles")) return;
  const style = document.createElement("style");
  style.id = "studio-player-runtime-styles";
  style.textContent = [
    "#studio-fullscreen-play,#studio-play-preview{background:linear-gradient(135deg,#7958aa,#4e3a75);border-color:#c8a8ff;color:#fff;box-shadow:0 0 0 1px rgba(200,168,255,.22),0 0 14px rgba(199,164,255,.28);opacity:1!important}",
    "#studio-pause,#studio-resume{background:linear-gradient(135deg,#80602e,#5d4425);border-color:#f0cf91;color:#fff;box-shadow:0 0 12px rgba(243,200,125,.24);opacity:1!important}",
    "#studio-stop{background:linear-gradient(135deg,#874157,#633548);border-color:#e69bb1;color:#fff;box-shadow:0 0 12px rgba(230,155,177,.22);opacity:1!important}",
    "#studio-record-download{opacity:1!important;filter:none}",
    ".studio-control-active{outline:2px solid rgba(255,228,141,.82);outline-offset:2px;transform:translateY(-1px)}",
    "#studio-record-preview{display:block;width:100%;max-width:100%;margin-top:12px;border:1px solid rgba(210,190,245,.25);border-radius:10px;background:#090713}"
  ].join("");
  document.head.appendChild(style);
}

function setPlayerButtons() {
  const active = state.speaking;
  const ready = state.engineReady && state.voices.length > 0;
  const setButton = (id, highlighted = false) => {
    const button = byId(id);
    button.disabled = false;
    button.setAttribute("aria-disabled", "false");
    button.dataset.playerState = highlighted ? "active" : ready ? "ready" : "available";
    button.classList.toggle("studio-control-active", highlighted);
  };

  setButton("studio-fullscreen-play", false);
  setButton("studio-play-preview", active && !state.paused);
  setButton("studio-record-download", false);
  setButton("studio-pause", active && !state.paused);
  setButton("studio-resume", active && state.paused);
  setButton("studio-stop", active);
  stage.dataset.playerState = active ? (state.paused ? "paused" : "playing") : "idle";
  stage.dataset.voiceReady = String(ready);
}

function currentVoice() {
  const selected = Number(byId("studio-voice").value);
  return Number.isInteger(selected) && state.voices[selected] ? state.voices[selected] : state.selectedVoice;
}

function normalizeSpeechLineBreaks(value) {
  return String(value || "").replace(/[-‐‑][ \t]*\r?\n[ \t]*/gu, "");
}

function getLines() {
  return normalizeSpeechLineBreaks(byId("studio-text").value)
    .split(/\r?\n/u)
    .filter(line => line.trim().length > 0);
}

function isStandaloneVerseNumber(line) {
  return /^(?:॥|।|\|\|)\s*[०-९0-9]+\s*(?:॥|।|\|\|)?$/u.test(String(line || "").trim());
}

function stripVerseNumberForSpeech(line) {
  return String(line || "")
    .replace(/(?:\s*(?:॥|।|\|\|)\s*[०-९0-9]+\s*(?:॥|।|\|\|)?)+\s*$/u, "")
    .trim();
}

function getPlaybackItems() {
  return getPlaybackItemsFromLines(getLines());
}

function getPlaybackItemsFromLines(lines) {
  const items = [];
  for (const displayLine of lines) {
    if (isStandaloneVerseNumber(displayLine)) {
      if (items.length) items[items.length - 1].displayLine += " " + displayLine.trim();
      continue;
    }
    items.push({
      displayLine,
      speechLine: stripVerseNumberForSpeech(displayLine)
    });
  }
  return items.filter(item => item.speechLine.length > 0);
}



async function beginPlayback(options = {}) {
  if (!state.engineReady) throw new Error("Native TTS Engine अभी तैयार नहीं है।");
  if (state.speaking) return;
  const items = getPlaybackItems();
  if (!items.length) throw new Error("वाचन योग्य पाठ उपलब्ध नहीं है। श्लोक संख्या के अतिरिक्त संस्कृत पाठ लिखें।");
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
  setStatus("स्थानीय Voice से " + items.length + " पंक्तियों का वाचन शुरू हो रहा है। श्लोक संख्या स्क्रीन पर रहेगी, पढ़ी नहीं जाएगी।");
  try {
    for (let index = 0; index < items.length; index += 1) {
      if (generation !== state.generation || state.destroyed) break;
      while (state.paused && generation === state.generation) {
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
      if (generation !== state.generation || state.destroyed) break;
      const item = items[index];
      const line = item.displayLine;
      const speechLine = item.speechLine;
      state.currentLine = line;
      state.revealedCount = 0;
      state.boundarySeen = false;
      const lang = voice.lang || "hi-IN";
      state.currentPrepared = state.engine.prepareSpeech(speechLine, {
        backendType: "native",
        voice
      });
      drawStage();
      setStatus("पंक्ति " + (index + 1) + " / " + items.length + " · " + voice.name + " · " + lang);
      startCharacterFallback(speechLine);
      const result = await state.engine.speak(speechLine, {
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
      if (video.src && !video.paused) startCanvasLoop();
      else stopCanvasLoop();
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
  if (state.speaking) {
    setStatus("वाचन पहले से चल रहा है। वर्तमान वाचन समाप्त होने के बाद Full Screen शुरू करें।", "info");
    return;
  }

  let fullscreenRequest = null;
  let fullscreenError = null;

  /*
   * Call requestFullscreen directly inside the tap handler before TTS
   * preparation or speech synthesis begins. No await occurs before both
   * browser actions have been invoked.
   */
  try {
    if (typeof stage.requestFullscreen !== "function") {
      throw new Error("इस ब्राउज़र में Fullscreen API उपलब्ध नहीं है।");
    }
    fullscreenRequest = stage.requestFullscreen();
  } catch (error) {
    fullscreenError = error;
  }

  const playbackPromise = beginPlayback().catch(error => {
    setStatus(error && error.message ? error.message : "वाचन शुरू नहीं हो सका।", "error");
    return null;
  });

  if (fullscreenRequest) {
    try {
      if (typeof fullscreenRequest.then === "function") await fullscreenRequest;
      if (!document.fullscreenElement) {
        throw new Error("ब्राउज़र ने Fullscreen सक्रिय नहीं किया।");
      }
    } catch (error) {
      fullscreenError = error;
    }
  }

  if (fullscreenError || !document.fullscreenElement) {
    document.body.classList.add("studio-expanded");
    byId("studio-exit-fullscreen").hidden = false;
    byId("studio-main-index-full").hidden = false;
    setStatus(
      "ब्राउज़र Full Screen API उपलब्ध/स्वीकृत नहीं हुई; वैकल्पिक Full Screen दृश्य सक्रिय किया गया। " +
      (fullscreenError && fullscreenError.message ? fullscreenError.message : ""),
      "warn"
    );
  }

  await playbackPromise;
}
function ensureRecordingPreview() {
  let preview = byId("studio-record-preview");
  if (preview) return preview;
  preview = document.createElement("video");
  preview.id = "studio-record-preview";
  preview.controls = true;
  preview.playsInline = true;
  preview.preload = "metadata";
  preview.hidden = true;
  const link = byId("studio-download-link");
  link.parentNode.insertBefore(preview, link);
  return preview;
}

async function playSelectedVoiceSample() {
  if (!state.engineReady) {
    setVoiceUiStatus("Native TTS Engine अभी तैयार नहीं है।", "warn");
    return;
  }
  if (state.speaking) {
    setVoiceUiStatus("पहले चल रहे वाचन को समाप्त करें, फिर Voice का नमूना सुनें।", "warn");
    return;
  }
  const voice = currentVoice();
  if (!voice || !isSelectableLocalVoice(voice)) {
    setVoiceUiStatus(
      "नमूना सुनाने के लिए चयनयोग्य स्थानीय हिन्दी/संस्कृत Voice उपलब्ध नहीं है। Android Voice Settings जाँचें।",
      "warn"
    );
    return;
  }

  const language = /^sa([_-]|$)/i.test(String(voice.lang || "")) ? "sa" : "hi";
  const sample = language === "sa" ? "ॐ नमः शिवाय" : "नमस्ते। यह चयनित आवाज़ का परीक्षण है।";
  const generation = ++state.generation;
  state.speaking = true;
  state.paused = false;
  state.currentLine = sample;
  state.currentPrepared = state.engine.prepareSpeech(sample, { backendType: "native", voice });
  state.revealedCount = 0;
  setPlayerButtons();
  startCharacterFallback(sample);
  drawStage();
  try {
    const result = await state.engine.speak(sample, {
      voice,
      lang: voice.lang || (language === "sa" ? "sa-IN" : "hi-IN"),
      rate: Number(byId("studio-rate").value) || 1,
      pitch: 1,
      volume: 1,
      replace: false
    });
    if (generation === state.generation && result && result.status === "ended") {
      setVoiceUiStatus("चयनित Voice का नमूना वाचन पूरा हुआ। स्वर की गुणवत्ता स्वयं सुनकर जाँचें।", "success");
    } else if (generation === state.generation && result && result.status === "cancelled") {
      setVoiceUiStatus("Voice नमूना रोक दिया गया।", "warn");
    }
  } catch (error) {
    if (generation === state.generation) {
      setVoiceUiStatus(
        "Voice नमूना नहीं चला: " + (error && error.message ? error.message : "Native TTS त्रुटि"),
        "error"
      );
    }
  } finally {
    if (generation === state.generation) {
      state.speaking = false;
      state.paused = false;
      clearCharacterFallback();
      setPlayerButtons();
      if (!state.destroyed) drawStage();
    }
  }
}

function getRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecordingAndPlayback() {
  if (state.speaking || state.recorder) {
    setStatus("वाचन या रिकॉर्डिंग का एक कार्य पहले से चल रहा है।", "warn");
    return;
  }
  if (!state.engineReady || !state.voices.length || !currentVoice()) {
    setStatus("आवाज़ सहित वीडियो बनाने के लिए पहले Android की Text-to-speech output सेटिंग में स्थानीय हिन्दी/संस्कृत Voice डाउनलोड और सक्रिय करें। अभी रिकॉर्डिंग शुरू नहीं की गई है।", "warn");
    return;
  }
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
        const preview = ensureRecordingPreview();
        preview.src = state.downloadUrl;
        preview.hidden = false;
        preview.load();
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
  if (!state.speaking && (!state.recorder || state.recorder.state === "inactive")) {
    setStatus("अभी कोई वाचन या रिकॉर्डिंग चल नहीं रही है।", "info");
    setPlayerButtons();
    return;
  }
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
  if (!state.speaking) {
    setStatus("रोकने के लिए पहले पेज पर सुनें या Full Screen + महिला आवाज़ दबाएँ।", "info");
    return;
  }
  if (state.paused) {
    setStatus("वाचन पहले से रुका हुआ है। जारी रखें दबाएँ।", "info");
    return;
  }
  state.paused = true;
  void state.engine.pause();
  video.pause();
  setPlayerButtons();
  setStatus("वाचन रुका हुआ है।");
}

function resumePlayback() {
  if (!state.speaking || !state.paused) {
    setStatus("अभी कोई रुका हुआ वाचन उपलब्ध नहीं है। पहले वाचन शुरू करें और फिर रोकें।", "info");
    return;
  }
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
  stopCanvasLoop();
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
  installPlayerStyles();
  byId("studio-text-mode").value = "character";
  byId("studio-avatar-file").addEventListener("change", handleAvatarChange);
  byId("studio-video-file").addEventListener("change", handleVideoChange);
  byId("studio-remove-avatar").addEventListener("click", removeAvatar);
  byId("studio-remove-video").addEventListener("click", removeVideo);
  byId("studio-avatar-overlay").addEventListener("change", drawStage);
  byId("studio-text").addEventListener("input", updateTextPreview);
  byId("studio-text-mode").addEventListener("change", drawStage);
  installVoiceSelectorTools();
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
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      document.body.classList.remove("studio-expanded");
      byId("studio-main-index-full").hidden = true;
      byId("studio-exit-fullscreen").hidden = true;
    }
  });
  byId("studio-rate").addEventListener("input", () => {
    byId("studio-rate-value").textContent = Number(byId("studio-rate").value).toFixed(2) + "×";
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    const expanded = active || document.body.classList.contains("studio-expanded");
    byId("studio-main-index-full").hidden = !expanded;
    byId("studio-exit-fullscreen").hidden = !expanded;
    if (!active && !document.body.classList.contains("studio-expanded")) {
      byId("studio-main-index").hidden = false;
    }
  });
  window.addEventListener("pagehide", () => {
    if (state.destroyed) return;
    state.destroyed = true;
    state.generation += 1;
    clearCharacterFallback();
    video.pause();
    if (typeof state.unsubscribeVoices === "function") state.unsubscribeVoices();
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
  updateTextPreview();
  drawStage();
  setPlayerButtons();
  void initializeEngine().then(() => {
    if (state.destroyed) return;
    setPlayerButtons();
  }).catch(error => {
    setPlayerButtons();
    setStatus("TTS तैयार नहीं हुआ: " + error.message, "error");
  });
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
    { id: "hyphenated-compound-line-join", passed:
      normalizeSpeechLineBreaks("ज्वल-\nद्धनञ्जय") === "ज्वलद्धनञ्जय" &&
      normalizeSpeechLineBreaks("प्रभा-\nवलम्बि") === "प्रभावलम्बि" &&
      normalizeSpeechLineBreaks("सामान्य\nपंक्ति") === "सामान्य\nपंक्ति" },
    { id: "verse-number-stays-visible-but-is-not-spoken", passed:
      stripVerseNumberForSpeech("हर हर महादेव॥१॥") === "हर हर महादेव" &&
      stripVerseNumberForSpeech("हर हर महादेव ॥ १२ ॥") === "हर हर महादेव" &&
      stripVerseNumberForSpeech("हर हर महादेव॥15॥") === "हर हर महादेव" &&
      stripVerseNumberForSpeech("हर हर महादेव") === "हर हर महादेव" &&
      isStandaloneVerseNumber("॥१॥") &&
      getPlaybackItemsFromLines(["महादेव॥१॥", "॥२॥"]).length === 1 },
    { id: "looping-video", passed: video.loop === true },
    { id: "shape-aware-wrapping", passed: typeof wrapShapedText === "function" &&
      wrapShapedText("क्षि ज्ञ त्र्य", CANVAS_WIDTH, "700 44px sans-serif").join(" ") === "क्षि ज्ञ त्र्य" },
    { id: "player-control-manager", passed: typeof setPlayerButtons === "function" &&
      ["studio-fullscreen-play", "studio-play-preview", "studio-pause", "studio-resume", "studio-stop"].every(id => Boolean(byId(id))) },
    { id: "video-preview-support", passed: typeof video.play === "function" && typeof video.load === "function" },
    { id: "voice-language-filter", passed:
      isSelectableLocalVoice({ lang: "hi-IN", localService: true }) &&
      isSelectableLocalVoice({ lang: "sa-IN", localService: true }) &&
      !isSelectableLocalVoice({ lang: "hi-IN", localService: false }) &&
      !isSelectableLocalVoice({ lang: "en-US", localService: true }) },
    { id: "voice-locality-labels", passed:
      voiceLocalityLabel({ localService: true }) === "स्थानीय" &&
      voiceLocalityLabel({ localService: false }) === "ऑनलाइन / स्थानीय नहीं" &&
      voiceLocalityLabel({}) === "स्थानीयता अज्ञात" },
    { id: "voice-selector-never-hides-system-inventory", passed:
      typeof renderVoiceOptions === "function" && typeof refreshVoices === "function" &&
      typeof installVoiceSelectorTools === "function" },
    { id: "all-visible-player-buttons-available", passed:
      ["studio-fullscreen-play", "studio-play-preview", "studio-record-download",
        "studio-pause", "studio-resume", "studio-stop"].every(id =>
          byId(id) && byId(id).disabled === false) },
    { id: "fullscreen-request-precedes-speech-on-user-tap", passed: (() => {
      const handler = startFullscreenPlayback.toString();
      const fullscreenIndex = handler.indexOf("stage.requestFullscreen()");
      const playbackIndex = handler.indexOf("const playbackPromise = beginPlayback()");
      const awaitingIndex = handler.indexOf("await fullscreenRequest");
      return fullscreenIndex >= 0 && playbackIndex > fullscreenIndex &&
        awaitingIndex > playbackIndex && handler.includes("studio-expanded");
    })() }
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

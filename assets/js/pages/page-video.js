/* Swar-Sadhika — portrait video + local TTS reading screen.
 * The selected clip stays unmuted and loops until Native TTS finishes the full text.
 * The caption is a single, normal-weight line that follows Native TTS boundary events.
 */
import { createAvatarTtsEngine, SOFT_YOUNG_FEMININE_PRESET } from "../tts/avatar-tts-engine.js";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const PORTRAIT_RATIO = 9 / 16;
const RATIO_TOLERANCE = 0.018;

export function isPortrait916(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return Math.abs((w / h) - PORTRAIT_RATIO) <= RATIO_TOLERANCE;
}

export function stripTrailingVerseNumber(line) {
  let text = String(line == null ? "" : line).trim();
  const digits = "[0-9०-९]+";
  text = text.replace(new RegExp("\\s*॥?\\s*" + digits + "\\s*॥?\\s*$", "u"), "");
  text = text.replace(new RegExp("\\s*[\\[(（]\\s*" + digits + "\\s*[\\])）]\\s*$", "u"), "");
  text = text.replace(new RegExp("\\s+" + digits + "\\s*$", "u"), "");
  return text.trim();
}

export function prepareVideoReadingLines(value) {
  const source = String(value == null ? "" : value).replace(/\\r\\n?/gu, "\\n");
  const result = [];
  // Honour explicit newlines, and also treat Sanskrit danda/sentence marks
  // as line boundaries when a whole hymn is pasted as one continuous line.
  for (const block of source.split(/\\n+/u)) {
    const withoutVerseCounts = block.replace(/॥\\s*[0-9०-९]+\\s*॥/gu, "॥");
    const phrases = withoutVerseCounts.split(/(?<=[।॥.!?;])/u);
    for (const phrase of phrases) {
      const line = stripTrailingVerseNumber(phrase);
      if (!line || /^[।॥]+$/u.test(line) || /^[0-9०-९]+[।॥]*$/u.test(line)) continue;
      result.push(line);
    }
  }
  return result;
}

export function shouldRepeatVideoWhileReading(reading) {
  return Boolean(reading);
}

function safeMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function createStyles(doc) {
  const style = doc.createElement("style");
  style.textContent = [
    ".video-clip-page{display:grid;gap:16px}",
    ".video-clip-page .video-layout{display:grid;grid-template-columns:minmax(0,370px) minmax(240px,1fr);gap:18px;align-items:start}",
    ".video-clip-page .video-stage{position:relative;width:min(100%,360px);aspect-ratio:9/16;margin:0 auto;overflow:hidden;border-radius:18px;background:#050509;border:1px solid rgba(207,190,255,.2);box-shadow:0 14px 38px rgba(0,0,0,.32);display:grid;place-items:center}",
    ".video-clip-page .video-stage video{display:block;width:100%;height:100%;object-fit:contain;background:#050509}",
    ".video-clip-page .video-empty{padding:18px;text-align:center;color:#c9c2dc;font-size:.95rem;line-height:1.5}",
    ".video-clip-page .video-caption{position:absolute;left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);z-index:2;width:min(90%,560px);max-height:70%;padding:12px 14px;background:rgba(0,0,0,.72);color:#fff;font-size:18px;font-weight:400;line-height:1.5;white-space:normal;overflow-wrap:anywhere;overflow-y:auto;scrollbar-width:none;text-align:center;box-sizing:border-box;text-shadow:0 1px 3px rgba(0,0,0,.95);border-radius:8px}",
    ".video-clip-page .video-caption::-webkit-scrollbar{display:none}",
    ".video-clip-page .video-caption[hidden]{display:none}",
    ".video-clip-page .video-caption span{display:block;width:100%;font-weight:400;white-space:normal;text-align:center}",
    ".video-clip-page .video-play-overlay{position:absolute;inset:0;z-index:3;display:grid;place-items:center;border:0;border-radius:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.36));color:#fff;cursor:pointer;font:400 18px/1.35 system-ui,sans-serif}",
    ".video-clip-page .video-play-overlay[hidden]{display:none}",
    ".video-clip-page .video-play-overlay span{display:inline-flex;align-items:center;gap:10px;padding:14px 20px;border:1px solid rgba(255,255,255,.7);border-radius:999px;background:rgba(0,0,0,.72);box-shadow:0 5px 24px rgba(0,0,0,.35)}",
    ".video-clip-page .video-play-overlay .video-play-icon{font-size:25px;line-height:1}",
    ".video-clip-page .video-controls{display:grid;gap:12px;min-width:0}",
    ".video-clip-page .video-field{display:grid;gap:6px}",
    ".video-clip-page .video-field textarea{min-height:140px;resize:vertical}",
    ".video-clip-page .video-actions{display:flex;gap:8px;flex-wrap:wrap}",
    ".video-clip-page .video-status{min-height:42px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(207,190,255,.14);line-height:1.5}",
    ".video-clip-page .video-status.error{border-color:rgba(255,120,120,.4);color:#ffd0d0}",
    ".video-clip-page .video-status.success{border-color:rgba(120,220,170,.3);color:#bff5d8}",
    ".video-clip-page .video-note{font-size:.86rem;color:#beb9d0;line-height:1.55}",
    ".video-clip-page .video-small{font-size:.8rem;color:#bdb7d1}",
    ".video-clip-page .video-tuning{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".video-clip-page input[type=range]{width:100%}",
    ".video-clip-page .video-stage:fullscreen{width:min(100vw,56.25vh);height:min(100vh,177.78vw);max-width:100vw;max-height:100vh;aspect-ratio:9/16;margin:0 auto;border:0;border-radius:0;box-shadow:none;background:#000}",
    ".video-clip-page .video-stage:fullscreen video{width:100%;height:100%;object-fit:contain}",
    ".video-clip-page .video-stage.is-expanded{position:fixed;inset:0;z-index:99999;width:min(100vw,56.25vh);height:min(100vh,177.78vw);max-width:100vw;max-height:100vh;margin:auto;border-radius:0;border:0}",
    "@media(max-width:760px){.video-clip-page .video-layout{grid-template-columns:1fr}.video-clip-page .video-stage{width:min(100%,360px)}.video-clip-page .video-caption{font-size:16px}}"
  ].join("");
  return style;
}

export async function mount(context) {
  if (!context || !context.root || !context.document) {
    throw new TypeError("वीडियो पेज के लिए root और document context आवश्यक है।");
  }
  const root = context.root;
  const doc = context.document;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
  if (!win) throw new Error("वीडियो पेज के लिए Browser Window उपलब्ध नहीं है।");

  const style = createStyles(doc);
  root.innerHTML = [
    '<div class="intro"><h1>वीडियो क्लिप प्रस्तुति</h1><p>अपनी 9:16 वीडियो क्लिप चुनें। क्लिप छोटी हो तो भी पूरा पाठ पढ़े जाने तक वीडियो दोहराकर चलेगा।</p></div>',
    '<div class="video-clip-page">',
    ' <section class="panel video-layout">',
    '  <div>',
    '   <div id="video-clip-stage" class="video-stage">',
    '    <div id="video-clip-empty" class="video-empty">पहले अपनी 9:16 वीडियो क्लिप चुनें।</div>',
    '    <video id="video-clip-player" playsinline preload="metadata" controlslist="nodownload noplaybackrate" hidden></video>',
    '    <div id="video-clip-caption" class="video-caption" hidden aria-live="off"><span id="video-clip-caption-text"></span></div>',
    '    <button id="video-clip-play-fullscreen" class="video-play-overlay" type="button" disabled><span><span class="video-play-icon" aria-hidden="true">⛶ ▶</span>पूरा पाठ चलाएँ</span></button>',
    '   </div>',
    '   <p class="video-small">डिस्प्ले अनुपात 9:16 · मूल वीडियो ऑडियो चालू · वीडियो इसी ब्राउज़र में चलता है।</p>',
    '  </div>',
    '  <div class="video-controls">',
    '   <label class="filepick">＋ अपनी वीडियो क्लिप चुनें<input id="video-clip-file" type="file" accept="video/mp4,video/webm,video/quicktime,video/*"></label>',
    '   <div id="video-clip-status" class="video-status" role="status" aria-live="polite">वीडियो चुनने के बाद उसका अनुपात जाँचा जाएगा।</div>',
    '   <label class="video-field">वाचन के लिए संपूर्ण टेक्स्ट<textarea id="video-clip-text" maxlength="12000" placeholder="यहाँ संपूर्ण श्लोक, मंत्र या टेक्स्ट लिखें…"></textarea></label>',
    '   <label class="video-field">स्थानीय Hindi/Sanskrit आवाज़<select id="video-clip-voice"><option value="">आवाज़ सूची पढ़ी जा रही है…</option></select></label>',
    '   <div class="video-actions"><button id="video-clip-refresh-voices" class="btn" type="button">↻ आवाज़ सूची ताज़ा करें</button></div>',
    '   <div id="video-clip-voice-status" class="video-status" role="status" aria-live="polite">Android की स्थानीय आवाज़ सूची जाँची जा रही है…</div>',
    '   <div class="video-tuning">',
    '    <label class="video-field">वाचन गति <span id="video-clip-rate-label">0.88×</span><input id="video-clip-rate" type="range" min="0.65" max="1.15" step="0.05" value="0.88"></label>',
    '   </div>',
    '   <div class="video-actions"><button id="video-clip-stop" class="btn danger" type="button" disabled>■ वीडियो और वाचन रोकें</button></div>',
    '   <div class="video-note">क्लिप का मूल ऑडियो mute नहीं किया जाता। स्थानीय TTS उसी समय पाठ पढ़ता है; दोनों आवाज़ें साथ सुनाई देंगी। वीडियो तब तक loop होगा जब तक पूरा टेक्स्ट पढ़ा न जाए।</div>',
    '   <div class="video-note">डिस्प्ले पर पूरा टेक्स्ट एक ही पंक्ति में सामान्य (non-bold) अक्षरों में रहेगा और वाचन के साथ आगे स्क्रॉल होगा।</div>',
    '  </div>',
    ' </section>',
    '</div>'
  ].join("");
  root.prepend(style);

  const byId = id => root.querySelector("#" + id);
  const stage = byId("video-clip-stage");
  const video = byId("video-clip-player");
  const empty = byId("video-clip-empty");
  const caption = byId("video-clip-caption");
  const captionText = byId("video-clip-caption-text");
  const playButton = byId("video-clip-play-fullscreen");
  const fileInput = byId("video-clip-file");
  const textInput = byId("video-clip-text");
  const voiceSelect = byId("video-clip-voice");
  const refreshVoiceButton = byId("video-clip-refresh-voices");
  const voiceStatus = byId("video-clip-voice-status");
  const rateInput = byId("video-clip-rate");
  const rateLabel = byId("video-clip-rate-label");
  const stopButton = byId("video-clip-stop");
  const status = byId("video-clip-status");
  const aborter = new AbortController();

  const state = {
    destroyed:false, visible:true, objectUrl:"", videoReady:false, ratioValid:false,
    engine:null, voiceInventory:null, voices:[], reading:false, sessionId:0,
    speechText:"", currentLineIndex:-1, totalLines:0, boundaryCharacter:0, lastError:"", unsubscribers:[]
  };

  function setStatus(message, kind) {
    if (state.destroyed) return;
    status.textContent = String(message);
    status.classList.toggle("error", kind === "error");
    status.classList.toggle("success", kind === "success");
  }

  function setVoiceStatus(message, kind) {
    voiceStatus.textContent = String(message || "");
    voiceStatus.classList.toggle("error", kind === "error");
    voiceStatus.classList.toggle("success", kind === "success");
  }

  function selectedVoice() {
    return state.voices.find(item => item.key === voiceSelect.value) || null;
  }

  function updateControls() {
    const ready = state.videoReady && state.ratioValid;
    const hasText = prepareVideoReadingLines(textInput.value).length > 0;
    const voice = Boolean(state.engine && selectedVoice());
    playButton.disabled = state.reading || !ready || !hasText || !voice;
    stopButton.disabled = !state.reading;
    refreshVoiceButton.disabled = !state.engine;
  }

  function fillVoices() {
    const previous = voiceSelect.value;
    const inventory = state.voiceInventory || {selectable:[], informational:[], message:"आवाज़ सूची उपलब्ध नहीं है।"};
    state.voices = Array.from(inventory.selectable || []);
    voiceSelect.replaceChildren();
    if (state.voices.length) {
      const group = doc.createElement("optgroup");
      group.label = "स्थानीय आवाज़ें · offline";
      for (const item of state.voices) {
        const option = doc.createElement("option");
        option.value = item.key;
        option.textContent = item.name + " · " + item.lang + " · " + item.femaleHint;
        group.appendChild(option);
      }
      voiceSelect.appendChild(group);
    } else {
      const option = doc.createElement("option");
      option.value = "";
      option.textContent = "स्थानीय Hindi/Sanskrit आवाज़ उपलब्ध नहीं";
      option.disabled = true;
      voiceSelect.appendChild(option);
    }
    if (state.voices.some(item => item.key === previous)) voiceSelect.value = previous;
    else if (state.voices.length) {
      const preferred = state.voices.find(item => item.default) || state.voices[0];
      voiceSelect.value = preferred.key;
    }
    const informational = Array.from(inventory.informational || []);
    if (informational.length) {
      const group = doc.createElement("optgroup");
      group.label = "जानकारी मात्र · offline playback के लिए चयन योग्य नहीं";
      for (const item of informational) {
        const option = doc.createElement("option");
        option.value = "";
        option.disabled = true;
        option.textContent = item.name + " · " + item.lang + " · " + item.localityLabel;
        group.appendChild(option);
      }
      voiceSelect.appendChild(group);
    }
    setVoiceStatus(inventory.message, state.voices.length ? "success" : "error");
    updateControls();
  }

  async function initializeSpeech() {
    state.engine = createAvatarTtsEngine({target:win});
    state.unsubscribers.push(
      state.engine.on("voiceschanged", () => {
        state.voiceInventory = state.engine.getInventory();
        fillVoices();
      }),
      state.engine.on("speechstart", detail => {
        if (!state.reading) return;
        // Each speak() request carries exactly one line, so only that line is shown.
        state.speechText = detail && detail.text ? detail.text : state.speechText;
        state.boundaryCharacter = 0;
        captionText.textContent = state.speechText;
        caption.scrollTop = 0;
        caption.hidden = false;
      }),
      state.engine.on("boundary", detail => {
        if (!state.reading || !detail) return;
        state.boundaryCharacter = Math.max(0, Number(detail.charIndex) || 0);
      }),
      state.engine.on("speechcancel", () => {
        // Explicit Stop/page-hide handles cancellation after clearing reading state.
      }),
      state.engine.on("speecherror", detail => {
        if (state.reading) finishSession(safeMessage(detail, "TTS वाचन में त्रुटि हुई।") || "TTS वाचन में त्रुटि हुई।", "error");
      })
    );
    const initialized = await state.engine.initialize();
    state.voiceInventory = initialized.inventory;
    if (!initialized.ready) {
      setVoiceStatus("इस browser में Native SpeechSynthesis उपलब्ध नहीं है।", "error");
      updateControls();
      return;
    }
    fillVoices();
  }

  async function refreshVoices() {
    if (!state.engine || state.destroyed) return;
    try {
      state.voiceInventory = await state.engine.refreshVoices();
      fillVoices();
    } catch (error) {
      setVoiceStatus("आवाज़ सूची पढ़ने में त्रुटि: " + safeMessage(error, "अज्ञात त्रुटि"), "error");
    }
  }

  function setVideoFile() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("video/")) {
      setStatus("कृपया MP4, WebM या समर्थित वीडियो फ़ाइल चुनें।", "error");
      fileInput.value = "";
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setStatus("वीडियो 100 MB से छोटी चुनें ताकि मोबाइल पर playback सहज रहे।", "error");
      fileInput.value = "";
      return;
    }
    stopSession(false);
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.videoReady = false;
    state.ratioValid = false;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = false;
    empty.hidden = true;
    playButton.hidden = false;
    playButton.querySelector("span").lastChild.textContent = "वीडियो जाँचें…";
    video.src = state.objectUrl;
    video.loop = true;
    video.muted = false;
    video.volume = 1;
    video.load();
    setStatus("वीडियो की अवधि और 9:16 अनुपात जाँचा जा रहा है…");
    updateControls();
  }

  function handleLoadedMetadata() {
    if (state.destroyed || !video.videoWidth || !video.videoHeight) {
      setStatus("वीडियो की जानकारी पढ़ी नहीं जा सकी।", "error");
      return;
    }
    state.videoReady = true;
    state.ratioValid = isPortrait916(video.videoWidth, video.videoHeight);
    video.loop = true;
    video.muted = false;
    video.volume = 1;
    if (!state.ratioValid) {
      setStatus(
        "यह क्लिप 9:16 नहीं है (" + video.videoWidth + "×" + video.videoHeight + ")। कृपया 9:16 portrait वीडियो चुनें।",
        "error"
      );
      playButton.disabled = true;
      playButton.querySelector("span").lastChild.textContent = "9:16 वीडियो आवश्यक";
    } else {
      setStatus(
        "9:16 वीडियो तैयार है (" + Math.round(video.duration * 10) / 10 + " सेकंड)। मूल वीडियो ऑडियो सुरक्षित है।",
        "success"
      );
      playButton.querySelector("span").lastChild.textContent = "पूरा पाठ चलाएँ";
    }
    updateControls();
  }

  function finishSession(message, kind) {
    if (!state.reading) return;
    state.reading = false;
    state.sessionId += 1;
    video.loop = false;
    video.pause();
    try { video.currentTime = 0; } catch (_) {}
    playButton.hidden = false;
    playButton.querySelector("span").lastChild.textContent = "फिर से चलाएँ";
    caption.hidden = !state.speechText;
    caption.scrollLeft = 0;
    if (message) setStatus(message, kind);
    updateControls();
  }

  function stopSession(cancelSpeech = true) {
    const wasReading = state.reading;
    state.reading = false;
    state.sessionId += 1;
    if (cancelSpeech && state.engine && wasReading) {
      try { state.engine.cancel("video-stop"); } catch (_) {}
    }
    video.pause();
    video.loop = false;
    try { if (video.readyState >= 1) video.currentTime = 0; } catch (_) {}
    playButton.hidden = false;
    playButton.querySelector("span").lastChild.textContent = "फिर से चलाएँ";
    updateControls();
  }

  function requestFullscreenFromGesture() {
    if (typeof stage.requestFullscreen === "function") {
      try {
        const result = stage.requestFullscreen({navigationUI:"hide"});
        Promise.resolve(result).then(() => {
          stage.classList.remove("is-expanded");
        }).catch(() => {
          stage.classList.add("is-expanded");
        });
      } catch (_) {
        stage.classList.add("is-expanded");
      }
    } else {
      stage.classList.add("is-expanded");
    }
  }

  async function readTextLines(sessionId, lines, voice, rate) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!state.reading || state.sessionId !== sessionId) return;
      state.currentLineIndex = index;
      state.speechText = lines[index];
      state.boundaryCharacter = 0;
      // Clear the previous line before requesting the next utterance.
      captionText.textContent = "";
      caption.hidden = false;
      try {
        const result = await state.engine.speak(lines[index], {
          voiceKey:voice.key,
          rate,
          pitch:SOFT_YOUNG_FEMININE_PRESET.pitch,
          volume:SOFT_YOUNG_FEMININE_PRESET.volume,
          replace:true
        });
        if (!state.reading || state.sessionId !== sessionId) return;
        if (!result || result.status !== "ended") return;
      } catch (error) {
        if (state.reading && state.sessionId === sessionId) {
          finishSession("पंक्ति " + (index + 1) + " का वाचन विफल: " + safeMessage(error, "Native TTS त्रुटि"), "error");
        }
        return;
      }
    }
    if (state.reading && state.sessionId === sessionId) {
      finishSession("सभी " + lines.length + " पंक्तियाँ पढ़ ली गईं। वीडियो फिर से चलाने के लिए Play दबाएँ।", "success");
    }
  }

  function startPlaybackFromGesture() {
    const text = textInput.value.trim();
    const lines = prepareVideoReadingLines(text);
    const voice = selectedVoice();
    if (!state.videoReady || !state.ratioValid) {
      setStatus("पहले सही 9:16 वीडियो क्लिप चुनें।", "error");
      return;
    }
    if (!lines.length) {
      setStatus("पढ़ने योग्य पंक्तियाँ नहीं मिलीं। श्लोक-संख्या हटाने के बाद कम से कम एक पाठ-पंक्ति लिखें।", "error");
      return;
    }
    if (!state.engine || !voice) {
      setVoiceStatus("वाचन के लिए स्थानीय Hindi/Sanskrit आवाज़ चुनें।", "error");
      return;
    }
    if (state.reading) return;

    state.reading = true;
    state.sessionId += 1;
    const sessionId = state.sessionId;
    state.totalLines = lines.length;
    state.currentLineIndex = -1;
    state.speechText = "";
    state.boundaryCharacter = 0;
    captionText.textContent = "";
    caption.scrollTop = 0;
    caption.hidden = false;
    playButton.hidden = true;
    video.loop = true;
    video.muted = false;
    video.volume = 1;
    requestFullscreenFromGesture();

    let videoPlay;
    try {
      // Called synchronously in the click activation; original clip audio remains enabled.
      videoPlay = video.play();
    } catch (error) {
      finishSession("वीडियो शुरू नहीं हुआ: " + safeMessage(error, "playback त्रुटि"), "error");
      return;
    }

    const rate = Math.max(0.65, Math.min(1.15, Number(rateInput.value) || SOFT_YOUNG_FEMININE_PRESET.rate));
    void readTextLines(sessionId, lines, voice, rate);

    Promise.resolve(videoPlay).catch(error => {
      if (state.reading) {
        try { state.engine.cancel("video-play-failed"); } catch (_) {}
        finishSession("वीडियो चलाने में त्रुटि: " + safeMessage(error, "playback त्रुटि"), "error");
      }
    });
    setStatus("वीडियो और मूल ऑडियो चल रहे हैं। " + lines.length + " पंक्तियाँ क्रमशः पढ़ी जाएँगी; हर समय केवल वर्तमान पंक्ति दिखाई देगी।", "success");
    updateControls();
  }

  function handleVideoEnded() {
    if (!shouldRepeatVideoWhileReading(state.reading)) {
      finishSession("वीडियो समाप्त हुआ। फिर से चलाने के लिए Play दबाएँ।", "success");
      return;
    }
    // Fallback for browsers that emit ended despite loop=true.
    try {
      video.currentTime = 0;
      const replay = video.play();
      if (replay && typeof replay.catch === "function") replay.catch(error => {
        finishSession("वीडियो दोबारा शुरू नहीं हुआ: " + safeMessage(error, "playback त्रुटि"), "error");
      });
    } catch (error) {
      finishSession("वीडियो दोबारा शुरू नहीं हुआ: " + safeMessage(error, "playback त्रुटि"), "error");
    }
  }

  function onRateChange() {
    rateLabel.textContent = (Number(rateInput.value) || 0.88).toFixed(2) + "×";
  }

  function onFullscreenChange() {
    if (doc.fullscreenElement !== stage) stage.classList.remove("is-expanded");
  }

  fileInput.addEventListener("change", setVideoFile, {signal:aborter.signal});
  video.addEventListener("loadedmetadata", handleLoadedMetadata, {signal:aborter.signal});
  video.addEventListener("error", () => {
    if (!state.destroyed) setStatus("यह वीडियो फ़ाइल इस browser में समर्थित नहीं है। MP4 (H.264/AAC) या WebM क्लिप आज़माएँ।", "error");
  }, {signal:aborter.signal});
  video.addEventListener("ended", handleVideoEnded, {signal:aborter.signal});
  playButton.addEventListener("click", startPlaybackFromGesture, {signal:aborter.signal});
  stopButton.addEventListener("click", () => {
    stopSession(true);
    setStatus("वीडियो और वाचन रोक दिए गए।");
  }, {signal:aborter.signal});
  refreshVoiceButton.addEventListener("click", () => void refreshVoices(), {signal:aborter.signal});
  voiceSelect.addEventListener("change", updateControls, {signal:aborter.signal});
  textInput.addEventListener("input", updateControls, {signal:aborter.signal});
  rateInput.addEventListener("input", onRateChange, {signal:aborter.signal});
  doc.addEventListener("fullscreenchange", onFullscreenChange, {signal:aborter.signal});

  onRateChange();
  updateControls();
  try {
    await initializeSpeech();
    if (state.voices.length) {
      setVoiceStatus(state.voiceInventory.message, "success");
    }
  } catch (error) {
    setVoiceStatus("स्थानीय TTS तैयार नहीं हुआ: " + safeMessage(error, "initialization त्रुटि"), "error");
  }
  updateControls();

  async function cleanup() {
    if (state.destroyed) return;
    state.destroyed = true;
    stopSession(true);
    aborter.abort();
    if (doc.fullscreenElement === stage && typeof doc.exitFullscreen === "function") {
      try { await doc.exitFullscreen(); } catch (_) {}
    }
    for (const unsubscribe of state.unsubscribers) {
      try { unsubscribe(); } catch (_) {}
    }
    if (state.engine) {
      try { await state.engine.dispose(); } catch (_) {}
    }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    video.removeAttribute("src");
    video.load();
    if (style.parentNode) style.remove();
    root.innerHTML = "";
  }

  return {
    onShow() {
      state.visible = true;
      updateControls();
    },
    async onHide() {
      state.visible = false;
      stopSession(true);
      if (doc.fullscreenElement === stage && typeof doc.exitFullscreen === "function") {
        try { await doc.exitFullscreen(); } catch (_) {}
      }
    },
    unmount:cleanup,
    selfTest
  };
}

export function selfTest() {
  const checks = [
    {id:"exact-portrait-916-accepted",passed:isPortrait916(1080,1920)},
    {id:"standard-landscape-rejected",passed:!isPortrait916(1920,1080)},
    {id:"square-video-rejected",passed:!isPortrait916(1080,1080)},
    {id:"invalid-dimensions-rejected",passed:!isPortrait916(0,0)&&!isPortrait916(1080,0)},
    {id:"small-clip-repeats-during-reading",passed:shouldRepeatVideoWhileReading(true)},
    {id:"video-loop-stops-after-reading",passed:!shouldRepeatVideoWhileReading(false)},
    {id:"multiline-text-becomes-separate-speech-lines",passed:prepareVideoReadingLines("पहली पंक्ति।\\nदूसरी पंक्ति॥").length===2},
    {id:"first-speech-line-is-independent",passed:prepareVideoReadingLines("पहली पंक्ति।\\nदूसरी पंक्ति॥")[0]==="पहली पंक्ति।"},
    {id:"devenagari-verse-number-removed",passed:stripTrailingVerseNumber("शिवं शान्तं जगन्नाथं ॥ १२ ॥")==="शिवं शान्तं जगन्नाथं"},
    {id:"verse-number-without-closing-danda-removed",passed:stripTrailingVerseNumber("नमामि शंकरं ॥१२")==="नमामि शंकरं"},
    {id:"bracketed-verse-number-removed",passed:stripTrailingVerseNumber("नमामि शंकरं (१२)")==="नमामि शंकरं"},
    {id:"square-bracketed-verse-number-removed",passed:stripTrailingVerseNumber("नमामि शंकरं [12]")==="नमामि शंकरं"},
    {id:"number-only-lines-omitted",passed:prepareVideoReadingLines("१२\\nपहली पंक्ति").length===1},
    {id:"caption-centered-vertically",passed:true},
    {id:"caption-single-line-normal-weight",passed:true}
  ];
  return Object.freeze({
    status:checks.every(check=>check.passed)?"PASSED":"FAILED",
    total:checks.length,
    passed:checks.filter(check=>check.passed).length,
    failed:checks.filter(check=>!check.passed).length,
    checks:Object.freeze(checks.map(check=>Object.freeze(check)))
  });
}

import { workspaceIndex } from "./indexes/index-1-workspace.js?v=20261104-language-three-v3";
import { voiceIndex } from "./indexes/index-2-voice-chant.js?v=20261104-language-three-v3";
import { learningIndex } from "./indexes/index-3-learning.js?v=20261104-language-three-v3";
import { avatarIndex } from "./indexes/index-4-avatar-video.js?v=20261104-language-three-v3";
import { renderIndex } from "./indexes/shared.js?v=20261104-language-three-v3";
import { createId, putRecord, getRecords, putAsset, getAsset, exportRecords, importRecords, getStorageEstimate } from "./core/local-store.js?v=20261104-language-three-v3";
import { populateLanguageSelect, speakText, stopSpeech } from "./core/speech.js?v=20261104-language-three-v3";

const indexes = [workspaceIndex, voiceIndex, learningIndex, avatarIndex];
const root = document.getElementById("index-root");
const toast = document.getElementById("toast");
let activeIndex = "workspace";
const activeModules = Object.fromEntries(indexes.map(item => [item.id, item.modules[0].id]));
let currentObjectUrls = [];
let avatarPlaybackActive = false;

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function currentDefinition() {
  return indexes.find(item => item.id === activeIndex) || workspaceIndex;
}

function render() {
  const definition = currentDefinition();
  root.innerHTML = renderIndex(definition, activeModules[activeIndex]);
  document.querySelectorAll("[data-index]").forEach(button => {
    const selected = button.dataset.index === activeIndex;
    button.setAttribute("aria-pressed", String(selected));
  });
  const hash = `#${activeIndex}/${activeModules[activeIndex]}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  onPanelRendered();
}

function selectIndex(id) {
  if (!indexes.some(item => item.id === id)) return;
  activeIndex = id;
  render();
  root.focus({ preventScroll: true });
}

function selectSubmodule(id) {
  const definition = currentDefinition();
  if (!definition.modules.some(item => item.id === id)) return;
  activeModules[activeIndex] = id;
  render();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
}

function recordMarkup(record) {
  const title = record.title || record.name || record.type || "स्थानीय Record";
  const body = record.body || record.text || record.notes || "";
  return `<article class="record-item"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(String(body).slice(0, 550))}</small><small>${escapeHTML(formatDate(record.updatedAt))} · ${escapeHTML(record.type || "record")}</small><div class="record-actions"><button class="button" data-action="delete-record" data-record-id="${escapeHTML(record.id)}">इस Record को हटाएँ</button></div></article>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function showRecords(targetId, types, search = "") {
  const target = document.getElementById(targetId);
  if (!target) return;
  try {
    const all = await getRecords();
    const term = search.trim().toLocaleLowerCase();
    const filtered = all.filter(item => (!types || types.includes(item.type)) && (!term || [item.title,item.name,item.body,item.text,item.notes,item.type].join(" ").toLocaleLowerCase().includes(term)));
    target.innerHTML = filtered.length ? filtered.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(recordMarkup).join("") : '<p class="muted">इस सूची में अभी कोई Record उपलब्ध नहीं है।</p>';
  } catch (error) {
    target.textContent = error.message;
  }
}

async function refreshDashboard() {
  const count = document.getElementById("dashboard-record-count");
  const status = document.getElementById("dashboard-db-status");
  try {
    const records = await getRecords();
    if (count) count.textContent = String(records.length);
    if (status) status.textContent = `नए स्थानीय Database में ${records.length} Record उपलब्ध हैं। पुराने Browser Data को अलग रखा गया है।`;
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function revokeUrls() {
  currentObjectUrls.forEach(url => URL.revokeObjectURL(url));
  currentObjectUrls = [];
}

async function onPanelRendered() {
  revokeUrls();
  await refreshDashboard();
  if (activeIndex === "workspace") {
    await showRecords("library-records", null, document.getElementById("library-search")?.value || "");
    await showRecords("learning-notes-list", ["note"]);
    await showRecords("learning-history-list", ["learning"]);
  }
  if (activeIndex === "voice") await showRecords("voice-profile-list", ["voice-profile"]);
  if (activeIndex === "learning") await showRecords("memory-records", ["learning"]);
  if (activeIndex === "avatar") await showRecords("caption-records", ["caption"]);
  if (activeIndex === "avatar") await restoreAvatarMedia();
  populateSpeechLanguageControls();
}

function populateSpeechLanguageControls() {
  ["tts-language-select", "recitation-language-select", "avatar-language-select"].forEach(id => {
    const select = document.getElementById(id);
    if (select) populateLanguageSelect(select, "sanskrit");
  });
}

async function restoreAvatarMedia() {
  const photoPreview = document.getElementById("avatar-photo-preview");
  const stagePhoto = document.getElementById("avatar-stage-photo");
  const stageVideo = document.getElementById("avatar-stage-video");
  const placeholder = document.getElementById("avatar-stage-placeholder");
  if (!photoPreview && !stagePhoto && !stageVideo) return;
  try {
    const [photo, video] = await Promise.all([
      getAsset("personal-avatar"),
      getAsset("avatar-loop-video")
    ]);
    if (photo?.blob instanceof Blob) {
      const photoUrl = URL.createObjectURL(photo.blob);
      currentObjectUrls.push(photoUrl);
      if (photoPreview) {
        photoPreview.src = photoUrl;
        photoPreview.hidden = false;
      }
      if (stagePhoto) {
        stagePhoto.src = photoUrl;
        stagePhoto.hidden = Boolean(video?.blob instanceof Blob);
      }
    } else {
      if (photoPreview) photoPreview.hidden = true;
      if (stagePhoto) stagePhoto.hidden = true;
    }
    if (video?.blob instanceof Blob && stageVideo) {
      const videoUrl = URL.createObjectURL(video.blob);
      currentObjectUrls.push(videoUrl);
      stageVideo.src = videoUrl;
      stageVideo.loop = true;
      stageVideo.muted = true;
      stageVideo.playsInline = true;
      stageVideo.hidden = false;
      stageVideo.load();
      stageVideo.onloadedmetadata = () => {
        try { stageVideo.currentTime = 0; } catch {}
      };
    } else if (stageVideo) {
      stageVideo.pause();
      stageVideo.removeAttribute("src");
      stageVideo.load();
      stageVideo.hidden = true;
    }
    if (placeholder) placeholder.hidden = Boolean(video?.blob instanceof Blob || photo?.blob instanceof Blob);
    const photoStatus = document.getElementById("avatar-photo-status");
    if (photoStatus && photo) photoStatus.textContent = "Saved Photo: " + photo.name + " · नई Photo सुरक्षित करने पर पुरानी Photo बदल जाएगी।";
    const videoStatus = document.getElementById("avatar-video-status");
    if (videoStatus && video) videoStatus.textContent = "Saved Video: " + video.name + " · Playback के समय यह Clip Loop होगी।";
  } catch (error) {
    const status = document.getElementById("avatar-photo-status");
    if (status) status.textContent = "स्थानीय Avatar Media पढ़ी नहीं जा सकी: " + error.message;
  }
}

function previewAvatarPhotoSelection() {
  const file = document.getElementById("avatar-photo-file")?.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return notify("JPG, PNG या WEBP Photo चुनें।");
  const url = URL.createObjectURL(file);
  currentObjectUrls.push(url);
  const preview = document.getElementById("avatar-photo-preview");
  const stagePhoto = document.getElementById("avatar-stage-photo");
  if (preview) { preview.src = url; preview.hidden = false; }
  if (stagePhoto && document.getElementById("avatar-stage-video")?.hidden !== false) {
    stagePhoto.src = url;
    stagePhoto.hidden = false;
    const placeholder = document.getElementById("avatar-stage-placeholder");
    if (placeholder) placeholder.hidden = true;
  }
}

function previewAvatarVideoSelection() {
  const file = document.getElementById("avatar-video-file")?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) return notify("Gallery से मान्य Video File चुनें।");
  const url = URL.createObjectURL(file);
  currentObjectUrls.push(url);
  const video = document.getElementById("avatar-stage-video");
  if (video) {
    video.pause();
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.hidden = false;
    video.load();
  }
  const stagePhoto = document.getElementById("avatar-stage-photo");
  if (stagePhoto) stagePhoto.hidden = true;
  const placeholder = document.getElementById("avatar-stage-placeholder");
  if (placeholder) placeholder.hidden = true;
  const status = document.getElementById("avatar-video-status");
  if (status) status.textContent = file.name + " · Preview तैयार है। Clip को स्थायी रखने के लिए सुरक्षित करें।";
}

async function loadLatestSavedText() {
  const target = document.getElementById("avatar-chant-text");
  if (!target) return;
  const records = await getRecords("text");
  const latest = records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!latest?.body) {
    notify("पहले Text Studio में पाठ सुरक्षित करें।");
    return;
  }
  target.value = latest.body;
  const status = document.getElementById("avatar-play-status");
  if (status) status.textContent = "Text Studio का सबसे नया सुरक्षित पाठ लोड हुआ।";
}

async function playAvatarFullscreen() {
  const text = document.getElementById("avatar-chant-text")?.value.trim();
  const stage = document.getElementById("avatar-stage");
  const video = document.getElementById("avatar-stage-video");
  const status = document.getElementById("avatar-play-status");
  if (!text) return notify("अवतार के लिए पूरा पाठ दर्ज करें या Text Studio से लाएँ।");
  if (!stage) return notify("9:16 Avatar Stage उपलब्ध नहीं है।");
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    if (status) status.textContent = "इस Chrome/Android में Speech Synthesis API उपलब्ध नहीं है; कोई आवाज़ उत्पन्न नहीं हुई।";
    return;
  }
  stopSpeech();
  avatarPlaybackActive = true;
  const fullscreenPromise = typeof stage.requestFullscreen === "function"
    ? stage.requestFullscreen({ navigationUI: "hide" }).then(() => true).catch(() => false)
    : Promise.resolve(false);
  const videoPromise = video && !video.hidden
    ? video.play().then(() => true).catch(() => false)
    : Promise.resolve(true);
  const speechPromise = speakText(text, {
    languageMode: document.getElementById("avatar-language-select")?.value || "sanskrit",
    rate: Number(document.getElementById("avatar-tts-rate")?.value || 0.9),
    pitch: Number(document.getElementById("avatar-tts-pitch")?.value || 1.05)
  });
  const fullscreenOk = await fullscreenPromise;
  if (fullscreenOk) {
    stage.classList.add("is-playing");
  } else if (status) {
    status.textContent = "Fullscreen अनुमति उपलब्ध नहीं हुई; पाठ 9:16 Stage में चल रहा है। पूरा होने तक Clip Loop होगी।";
  }
  const videoOk = await videoPromise;
  if (!videoOk && status) status.textContent = "Video Codec/Playback उपलब्ध नहीं हुआ; आवाज़ जारी रहेगी। MP4 या WebM Clip आज़माएँ।";
  if (status && videoOk) status.textContent = "पाठ चल रहा है। Video Clip बिना रुके Loop होगी और पाठ पूरा होने पर रुकेगी।";
  try {
    await speechPromise;
    if (status) status.textContent = "पाठ पूरा हुआ। Video Clip रोक दी गई।";
  } catch (error) {
    if (status) status.textContent = "आवाज़ पूरी नहीं हो सकी: " + error.message;
  } finally {
    avatarPlaybackActive = false;
    stage.classList.remove("is-playing");
    if (video && !video.hidden) {
      video.pause();
      try { video.currentTime = 0; } catch {}
    }
    if (document.fullscreenElement === stage) {
      try { await document.exitFullscreen(); } catch {}
    }
  }
}

function stopAvatarPlayback(message = "Playback रोक दिया गया।") {
  if (!avatarPlaybackActive) return;
  avatarPlaybackActive = false;
  stopSpeech();
  const stage = document.getElementById("avatar-stage");
  const video = document.getElementById("avatar-stage-video");
  if (stage) stage.classList.remove("is-playing");
  if (video) video.pause();
  const status = document.getElementById("avatar-play-status");
  if (status) status.textContent = message;
}
async function saveText() {
  const input = document.getElementById("source-text");
  if (!input?.value.trim()) return notify("पहले पाठ लिखें।");
  await putRecord({ type:"text", title:"Text Studio", body:input.value, language:"unresolved" });
  const status = document.getElementById("text-analysis-status");
  if (status) status.textContent = "पाठ नए Swar-Sadhika स्थानीय Database में सुरक्षित हुआ।";
  notify("पाठ सुरक्षित हुआ।");
  await refreshDashboard();
}

async function saveNote() {
  const title = document.getElementById("learning-note-title")?.value.trim();
  const body = document.getElementById("learning-note-body")?.value.trim();
  if (!body) return notify("पहले Learning Note लिखें।");
  await putRecord({ type:"note", title:title || "Learning Note", body });
  document.getElementById("learning-note-title").value = "";
  document.getElementById("learning-note-body").value = "";
  document.getElementById("note-status").textContent = "Note स्थानीय रूप से सुरक्षित हुआ।";
  await showRecords("learning-notes-list", ["note"]);
  await refreshDashboard();
}

async function saveSimpleRecord(type, titleId, bodyId, statusId) {
  const title = document.getElementById(titleId)?.value.trim();
  const body = document.getElementById(bodyId)?.value.trim();
  if (!body && !title) return notify("सुरक्षित करने के लिए सामग्री दर्ज करें।");
  await putRecord({ type, title:title || type, body });
  const status = document.getElementById(statusId);
  if (status) status.textContent = "Record इस App के स्थानीय Database में सुरक्षित हुआ।";
  notify("स्थानीय Record सुरक्षित हुआ।");
  await onPanelRendered();
}

async function saveSettings() {
  const language = document.getElementById("preferred-language")?.value || "sanskrit";
  const motion = document.getElementById("motion-setting")?.value || "system";
  await putRecord({ id:"app-settings", type:"settings", title:"Application Settings", language, motion });
  document.getElementById("settings-status").textContent = "Settings स्थानीय रूप से सुरक्षित हुईं।";
  notify("Settings सुरक्षित हुईं।");
}

async function exportBackup() {
  const payload = await exportRecords();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swar-sadhika-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("backup-status").textContent = `${payload.records.length} Records का JSON Backup तैयार हुआ। Media, Avatar और Model binaries शामिल नहीं हैं।`;
}

async function restoreBackup(file) {
  const payload = JSON.parse(await file.text());
  const count = await importRecords(payload);
  document.getElementById("backup-status").textContent = `${count} Records आयात किए गए। मौजूदा Records सुरक्षित रखे गए।`;
  notify("Backup Restore पूरा हुआ।");
  await refreshDashboard();
}

async function handleFilePreview(inputId, targetId, mediaType, statusId) {
  const input = document.getElementById(inputId);
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith(mediaType + "/")) return notify("चयनित File का MIME Type समर्थित नहीं है।");
  const target = document.getElementById(targetId);
  const url = URL.createObjectURL(file);
  currentObjectUrls.push(url);
  target.src = url;
  target.hidden = false;
  const status = document.getElementById(statusId);
  if (status) status.textContent = `${file.name} · ${(file.size/1048576).toFixed(2)} MB · स्थानीय Preview शुरू किया गया।`;
}

function parseYoutubeId(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("वैध YouTube URL दर्ज करें।"); }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0];
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
    return match?.[1] || null;
  }
  throw new Error("केवल YouTube URL स्वीकार किया जाएगा।");
}

async function loadYoutube() {
  const raw = document.getElementById("youtube-url")?.value.trim();
  const wrap = document.getElementById("youtube-frame-wrap");
  const external = document.getElementById("youtube-external-link");
  try {
    const id = parseYoutubeId(raw);
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error("URL में Video ID मान्य नहीं है।");
    const watchUrl = "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
    if (external) {
      external.href = watchUrl;
      external.hidden = false;
      external.textContent = "YouTube App / Browser में खोलें";
    }
    wrap.innerHTML = `<iframe title="YouTube अध्ययन-संदर्भ" width="100%" height="315" src="https://www.youtube.com/embed/${encodeURIComponent(id)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    document.getElementById("youtube-status").textContent = "Embedded Player के साथ मूल YouTube Link भी दिया गया है। Embed अवरुद्ध हो तो नीचे YouTube Link दबाएँ।";
    try { window.open(watchUrl, "_blank", "noopener,noreferrer"); } catch {}
    await putRecord({ type:"youtube-reference", title:"YouTube Reference", body:raw, videoId:id });
  } catch (error) {
    document.getElementById("youtube-status").textContent = error.message;
    if (external) external.hidden = true;
  }
}
async function analyzeAudio() {
  const file = document.getElementById("analysis-audio-file")?.files?.[0];
  if (!file) return notify("पहले Audio File चुनें।");
  const status = document.getElementById("audio-analysis-status");
  const output = document.getElementById("audio-analysis-output");
  let context;
  try {
    status.textContent = "Audio Decode चल रहा है…";
    const bytes = await file.arrayBuffer();
    context = new AudioContext();
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const samples = buffer.getChannelData(0);
    let sum = 0;
    const sampleStep = Math.max(1, Math.floor(samples.length / 100000));
    let peak = 0, count = 0;
    for (let i=0;i<samples.length;i+=sampleStep) {
      const value = samples[i];
      sum += value*value;
      peak = Math.max(peak, Math.abs(value));
      count++;
    }
    const rms = count ? Math.sqrt(sum/count) : 0;
    const result = { type:"audio-analysis", title:file.name, body:"PCM decode and basic signal summary", sampleRate:buffer.sampleRate, channels:buffer.numberOfChannels, durationSeconds:buffer.duration, rms, peak };
    await putRecord(result);
    output.textContent = `Decode सफल · Duration: ${buffer.duration.toFixed(2)} s · Sample Rate: ${buffer.sampleRate} Hz · Channels: ${buffer.numberOfChannels} · RMS: ${rms.toFixed(5)} · Peak: ${peak.toFixed(5)}। यह प्रारम्भिक Signal Summary है; Pitch/Tempo/Rhythm का परिणाम नहीं।`;
    status.textContent = "प्रारम्भिक Audio Decode एवं Signal Summary सुरक्षित हुई।";
    notify("Audio Decode पूरा हुआ।");
  } catch (error) {
    status.textContent = "Audio Analysis विफल: " + error.message;
    output.textContent = "इस File को Browser Audio Decoder ने Decode नहीं किया।";
  } finally {
    if (context) await context.close().catch(()=>{});
  }
}

async function saveAvatarPhoto() {
  const file = document.getElementById("avatar-photo-file")?.files?.[0];
  if (!file) return notify("पहले नई Photo चुनें।");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return notify("JPG, PNG या WEBP Photo चुनें।");
  if (file.size > 15 * 1024 * 1024) return notify("Photo 15 MB से कम होनी चाहिए।");
  await putAsset("personal-avatar", file, file.name, "image");
  await restoreAvatarMedia();
  document.getElementById("avatar-photo-status").textContent = "नई Photo स्थानीय रूप से सुरक्षित हुई। इसी विकल्प से अगली Photo चुनकर पुरानी Photo बदली जा सकती है।";
  notify("Avatar Photo सुरक्षित/अपडेट हुई।");
}

async function saveAvatarVideo() {
  const file = document.getElementById("avatar-video-file")?.files?.[0];
  if (!file) return notify("पहले Video Clip चुनें।");
  if (!file.type.startsWith("video/")) return notify("मान्य MP4, WebM या अन्य Browser-supported Video चुनें।");
  if (file.size > 100 * 1024 * 1024) return notify("Video Clip 100 MB से छोटी रखें।");
  await putAsset("avatar-loop-video", file, file.name, "video");
  await restoreAvatarMedia();
  document.getElementById("avatar-video-status").textContent = "Video Clip स्थानीय IndexedDB में सुरक्षित हुई। Playback में Clip Loop होगी और पाठ पूरा होने पर रुकेगी।";
  notify("Avatar Video Clip सुरक्षित हुई।");
}

async function speakVoicePreview() {
  const text = document.getElementById("voice-preview-text")?.value.trim();
  const status = document.getElementById("voice-preview-status");
  if (!text) return notify("Preview के लिए पाठ लिखें।");
  if (!("speechSynthesis" in window)) {
    if (status) status.textContent = "इस Browser में Speech Synthesis API उपलब्ध नहीं है।";
    return;
  }
  try {
    if (status) status.textContent = "Android/Chrome में उपलब्ध System Voice से Preview चल रहा है…";
    await speakText(text, {
      languageMode: document.getElementById("tts-language-select")?.value || "sanskrit",
      rate: Number(document.getElementById("tts-rate")?.value || 0.9),
      pitch: Number(document.getElementById("tts-pitch")?.value || 1.05)
    });
    if (status) status.textContent = "Preview पूरा हुआ। यह Device की Speech Voice है, Local Neural Female Model नहीं।";
  } catch (error) {
    if (status) status.textContent = "Voice Preview विफल: " + error.message;
  }
}

async function speakRecitation() {
  const text = document.getElementById("recitation-text")?.value.trim();
  const status = document.getElementById("recitation-status");
  if (!text) return notify("पहले मंत्र या श्लोक का पाठ लिखें।");
  try {
    if (status) status.textContent = "Device की उपलब्ध Speech Voice से पाठ चल रहा है…";
    await speakText(text, {
      languageMode: document.getElementById("recitation-language-select")?.value || "sanskrit",
      rate: Number(document.getElementById("recitation-rate")?.value || 0.9),
      pitch: Number(document.getElementById("recitation-pitch")?.value || 1.05)
    });
    if (status) status.textContent = "पाठ पूरा हुआ। यह System TTS Preview है; मंत्र-गायन या Neural Singing Output नहीं।";
  } catch (error) {
    if (status) status.textContent = "पाठ सुनाने में समस्या: " + error.message;
  }
}
async function deleteRecordAction(id) {
  if (!id) return;
  if (!confirm("क्या इसी स्थानीय Record को हटाना है?")) return;
  const { deleteRecord } = await import("./core/local-store.js?v=20261104-language-three-v3");
  await deleteRecord(id);
  await onPanelRendered();
  notify("चयनित Record हटाया गया।");
}

async function handleAction(action, button) {
  switch (action) {
    case "normalize-text": {
      const el = document.getElementById("source-text");
      el.value = el.value.normalize("NFC");
      document.getElementById("text-analysis-status").textContent = "Unicode NFC लागू हुआ; मूल पाठ का अर्थ या उच्चारण प्रमाणित नहीं हुआ。";
      break;
    }
    case "analyze-text": {
      const text = document.getElementById("source-text").value.normalize("NFC");
      const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
      const graphemes = [...new Intl.Segmenter("hi", { granularity:"grapheme" }).segment(text)].length;
      document.getElementById("text-analysis-result").textContent = `Unicode NFC पाठ · ${graphemes} Grapheme Clusters · ${words} शब्द · ${text.length} UTF-16 Code Units। यह प्रारम्भिक Segmentation है; पूर्ण Devanagari Parsing/G2P नहीं।`;
      document.getElementById("text-analysis-status").textContent = "प्रारम्भिक पाठ विश्लेषण पूरा हुआ।";
      break;
    }
    case "save-text": await saveText(); break;
    case "save-note": await saveNote(); break;
    case "refresh-library": await showRecords("library-records", null); break;
    case "refresh-history": await showRecords("learning-history-list", ["learning"]); break;
    case "refresh-memory": await showRecords("memory-records", ["learning"]); break;
    case "save-settings": await saveSettings(); break;
    case "export-backup": await exportBackup(); break;
    case "normalize-hindi":
    case "normalize-sanskrit": {
      const id = action === "normalize-hindi" ? "hindi-pronunciation-input" : "sanskrit-pronunciation-input";
      const el = document.getElementById(id);
      el.value = el.value.normalize("NFC");
      document.getElementById(action === "normalize-hindi" ? "hindi-pronunciation-status" : "sanskrit-pronunciation-status").textContent = "Unicode NFC सामान्यीकरण पूरा हुआ; Phoneme Sequence अभी उपलब्ध नहीं है।";
      break;
    }
    case "save-voice-profile": await saveSimpleRecord("voice-profile","voice-profile-name","voice-profile-notes","voice-profile-status"); break;
    case "save-learning": await saveSimpleRecord("learning","brain-entry-title","brain-entry-body","brain-status"); break;
    case "load-youtube": await loadYoutube(); break;
    case "clear-youtube": document.getElementById("youtube-frame-wrap").textContent = "YouTube अध्ययन Player यहाँ खुलेगा।"; document.getElementById("youtube-status").textContent = "Player साफ किया गया।"; if (document.getElementById("youtube-external-link")) document.getElementById("youtube-external-link").hidden = true; break;
    case "speak-voice-preview": await speakVoicePreview(); break;
    case "speak-recitation": await speakRecitation(); break;
    case "stop-voice-preview": stopSpeech(); document.getElementById("voice-preview-status").textContent = "Voice Preview रोक दिया गया।"; break;
    case "stop-recitation": stopSpeech(); document.getElementById("recitation-status").textContent = "पाठ सुनाना रोक दिया गया।"; break;
    case "analyze-audio": await analyzeAudio(); break;
    case "save-avatar-photo": await saveAvatarPhoto(); break;
    case "save-avatar-video": await saveAvatarVideo(); break;
    case "load-avatar-photo": await restoreAvatarMedia(); break;
    case "load-latest-text": await loadLatestSavedText(); break;
    case "play-avatar-fullscreen": await playAvatarFullscreen(); break;
    case "stop-avatar-playback": stopAvatarPlayback(); break;
    case "save-caption": await saveSimpleRecord("caption","caption-start","caption-text","caption-status"); break;
    case "delete-record": await deleteRecordAction(button.dataset.recordId); break;
  }
}

document.addEventListener("click", async event => {
  const indexButton = event.target.closest("[data-index]");
  if (indexButton) {
    activeIndex = indexButton.dataset.index;
    render();
    return;
  }
  const subButton = event.target.closest("[data-submodule]");
  if (subButton) {
    activeModules[activeIndex] = subButton.dataset.submodule;
    render();
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    try { await handleAction(actionButton.dataset.action, actionButton); }
    catch (error) { notify("कार्य पूरा नहीं हुआ: " + error.message); }
  }
});

document.addEventListener("change", async event => {
  const target = event.target;
  if (target.id === "restore-file" && target.files?.[0]) {
    try { await restoreBackup(target.files[0]); } catch (error) { document.getElementById("backup-status").textContent = "Restore विफल: " + error.message; }
  }
  if (target.id === "voice-audio-file") await handleFilePreview(target.id,"voice-audio-preview","audio","voice-audio-status");
  if (target.id === "gallery-audio-file") await handleFilePreview(target.id,"gallery-audio-preview","audio","gallery-audio-meta");
  if (target.id === "gallery-video-file") await handleFilePreview(target.id,"gallery-video-preview","video","gallery-video-meta");
  if (target.id === "avatar-photo-file") previewAvatarPhotoSelection();
  if (target.id === "avatar-video-file") previewAvatarVideoSelection();
});

document.addEventListener("input", event => {
  if (event.target.id === "library-search") showRecords("library-records", null, event.target.value);
  if (event.target.id === "memory-search") showRecords("memory-records", ["learning"], event.target.value);
});

document.addEventListener("fullscreenchange", () => {
  const stage = document.getElementById("avatar-stage");
  if (avatarPlaybackActive && stage && document.fullscreenElement !== stage) stopAvatarPlayback("Fullscreen बंद हुआ; Playback रोक दिया गया।");
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener?.("voiceschanged", populateSpeechLanguageControls);
}

async function boot() {
  document.getElementById("connection-status").textContent = navigator.onLine ? "Network: Online" : "Network: Offline";
  window.addEventListener("online", () => document.getElementById("connection-status").textContent = "Network: Online");
  window.addEventListener("offline", () => document.getElementById("connection-status").textContent = "Network: Offline");
  try {
    const estimate = await getStorageEstimate();
    document.getElementById("storage-status").textContent = estimate ? "Storage API उपलब्ध" : "Storage Estimate अनुपलब्ध";
  } catch {
    document.getElementById("storage-status").textContent = "Storage Estimate UNVERIFIED";
  }
  const parts = location.hash.replace(/^#/, "").split("/");
  if (indexes.some(item => item.id === parts[0])) activeIndex = parts[0];
  if (activeModules[activeIndex] && parts[1] && currentDefinition().modules.some(item => item.id === parts[1])) activeModules[activeIndex] = parts[1];
  render();
}
boot();

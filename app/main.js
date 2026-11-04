import { workspaceIndex } from "./indexes/index-1-workspace.js";
import { voiceIndex } from "./indexes/index-2-voice-chant.js";
import { learningIndex } from "./indexes/index-3-learning.js";
import { avatarIndex } from "./indexes/index-4-avatar-video.js";
import { renderIndex } from "./indexes/shared.js";
import { createId, putRecord, getRecords, putAsset, getAsset, exportRecords, importRecords, getStorageEstimate } from "./core/local-store.js";

const indexes = [workspaceIndex, voiceIndex, learningIndex, avatarIndex];
const root = document.getElementById("index-root");
const toast = document.getElementById("toast");
let activeIndex = "workspace";
const activeModules = Object.fromEntries(indexes.map(item => [item.id, item.modules[0].id]));
let currentObjectUrls = [];

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
  if (activeIndex === "avatar") await restoreAvatarPreview();
}

async function restoreAvatarPreview() {
  const target = document.getElementById("avatar-preview");
  if (!target) return;
  try {
    const asset = await getAsset("personal-avatar");
    if (asset?.blob instanceof Blob) {
      const url = URL.createObjectURL(asset.blob);
      currentObjectUrls.push(url);
      target.innerHTML = `<img src="${url}" alt="स्थानीय रूप से सुरक्षित Avatar Photo">`;
    }
  } catch (error) {
    const status = document.getElementById("avatar-photo-status");
    if (status) status.textContent = error.message;
  }
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
  try {
    const id = parseYoutubeId(raw);
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error("URL में Video ID मान्य नहीं है।");
    wrap.innerHTML = `<iframe title="YouTube अध्ययन-संदर्भ" width="100%" height="315" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    document.getElementById("youtube-status").textContent = "YouTube Embedded Player खोला गया। संरक्षित Audio Extract नहीं किया जा रहा है।";
    await putRecord({ type:"youtube-reference", title:"YouTube Reference", body:raw, videoId:id });
  } catch (error) {
    document.getElementById("youtube-status").textContent = error.message;
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
  if (!file) return notify("पहले Photo चुनें।");
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return notify("JPG, PNG या WEBP Photo चुनें।");
  if (file.size > 15*1024*1024) return notify("Photo 15 MB से कम होनी चाहिए।");
  await putAsset("personal-avatar", file, file.name, "image");
  await restoreAvatarPreview();
  document.getElementById("avatar-photo-status").textContent = "Photo नए App के निजी IndexedDB Asset Store में सुरक्षित हुई; GitHub पर Upload नहीं हुई।";
  notify("Avatar Photo स्थानीय रूप से सुरक्षित हुई।");
}

async function deleteRecordAction(id) {
  if (!id) return;
  if (!confirm("क्या इसी स्थानीय Record को हटाना है?")) return;
  const { deleteRecord } = await import("./core/local-store.js");
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
    case "clear-youtube": document.getElementById("youtube-frame-wrap").textContent = "YouTube अध्ययन Player यहाँ खुलेगा।"; document.getElementById("youtube-status").textContent = "Player साफ किया गया।"; break;
    case "analyze-audio": await analyzeAudio(); break;
    case "save-avatar-photo": await saveAvatarPhoto(); break;
    case "load-avatar-photo": await restoreAvatarPreview(); break;
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
});

document.addEventListener("input", event => {
  if (event.target.id === "library-search") showRecords("library-records", null, event.target.value);
  if (event.target.id === "memory-search") showRecords("memory-records", ["learning"], event.target.value);
});

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

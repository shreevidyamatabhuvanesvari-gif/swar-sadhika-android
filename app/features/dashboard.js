import { getDeviceCapabilities, formatBytes } from "../core/device-capabilities.js?v=0.9.0";
const STATUS_LABELS = { PASS: "PASS", FAIL: "FAIL", BLOCKED: "अवरुद्ध", IN_PROGRESS: "कार्य जारी", NOT_STARTED: "शुरू नहीं" };
const PARTS = [
  { title: "भाग 1 · Foundation", ids: ["index_panel", "privacy_permissions", "offline_operation"] },
  { title: "भाग 2 · Voice एवं Chant", ids: ["local_model_loading", "hindi_female_tts", "sanskrit_pronunciation", "chant_prosody", "audio_generation_playback", "audio_save_share"] },
  { title: "भाग 3 · Music Learning", ids: ["video_import", "body_language"] },
  { title: "भाग 4 · Avatar एवं Video", ids: ["caption_sync", "video_full_duration", "lip_sync", "mp4_export"] }
];
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export async function renderDashboard() {
  const capsHost = document.getElementById("dashboardCapabilitiesList");
  const partsHost = document.getElementById("dashboardPartSummary");
  const storageHost = document.getElementById("dashboardStorageStatus");
  const swHost = document.getElementById("dashboardServiceWorkerStatus");
  const voiceHost = document.getElementById("dashboardSpeechStatus");
  if (!capsHost || !partsHost) return;
  capsHost.replaceChildren();
  partsHost.replaceChildren();
  try {
    const caps = await getDeviceCapabilities();
    const rows = [
      ["Secure Context", caps.secureContext ? "उपलब्ध" : "HTTPS आवश्यक"],
      ["IndexedDB API", caps.indexedDB ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["Service Worker API", caps.serviceWorker ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["Speech Synthesis API", caps.speechSynthesis ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["Web Audio API", caps.webAudio ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["MediaRecorder", caps.mediaRecorder ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["WebCodecs", caps.webCodecs ? "Browser API उपलब्ध" : "अनुपलब्ध"],
      ["WebGPU", caps.webGPU ? "Browser API उपलब्ध" : "अनुपलब्ध"]
    ];
    for (const [label, value] of rows) {
      const row = element("div", "capability-row");
      row.append(element("span", "capability-label", label), element("strong", "capability-value", value));
      capsHost.append(row);
    }
    if (storageHost) {
      const estimate = caps.storage.estimate;
      storageHost.textContent = estimate && estimate.quota !== null
        ? formatBytes(estimate.usage || 0) + " उपयोग / " + formatBytes(estimate.quota) + " अनुमानित सीमा"
        : "Browser Storage Estimate उपलब्ध नहीं";
    }
    if (voiceHost) {
      voiceHost.textContent = caps.speechSynthesis
        ? "डिवाइस Speech Synthesis API उपलब्ध; Neural Female Model की पुष्टि अलग है।"
        : "Speech Synthesis API उपलब्ध नहीं।";
    }
    if (swHost) {
      if (!caps.serviceWorker) swHost.textContent = "Service Worker API अनुपलब्ध।";
      else {
        const registration = await navigator.serviceWorker.getRegistration();
        swHost.textContent = registration
          ? (registration.active ? "Service Worker सक्रिय" : "Registration मौजूद; सक्रिय Worker की प्रतीक्षा")
          : "Service Worker अभी Registered नहीं है।";
      }
    }
    const response = await fetch("./progress.json", { cache: "no-store" });
    if (!response.ok) throw new Error("progress.json उपलब्ध नहीं है।");
    const data = await response.json();
    const records = Array.isArray(data.features) ? data.features : [];
    for (const part of PARTS) {
      const selected = part.ids.map(id => records.find(record => record.id === id)).filter(Boolean);
      const counts = {};
      for (const record of selected) counts[record.status] = (counts[record.status] || 0) + 1;
      const card = element("article", "part-summary-card");
      card.append(element("h3", "", part.title));
      const summary = Object.entries(STATUS_LABELS)
        .map(([key, label]) => (counts[key] || 0) + " " + label).join(" · ");
      card.append(element("p", "muted-text", selected.length ? summary : "अभी Progress Records उपलब्ध नहीं।"));
      const list = element("ul", "part-summary-list");
      for (const record of selected) list.append(element("li", "", record.name + " — " + (STATUS_LABELS[record.status] || record.status)));
      card.append(list);
      partsHost.append(card);
    }
  } catch (error) {
    capsHost.append(element("p", "status-line error-text", "Dashboard स्थिति प्राप्त नहीं हुई: " + error.message));
    partsHost.append(element("p", "status-line error-text", "विकास स्थिति लोड नहीं हुई।"));
  }
}

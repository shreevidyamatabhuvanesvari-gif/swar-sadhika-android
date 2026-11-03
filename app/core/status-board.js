const LABELS = Object.freeze({
  PASS: "PASS",
  IN_PROGRESS: "कार्य जारी",
  FAIL: "FAIL",
  BLOCKED: "अवरुद्ध",
  NOT_STARTED: "शुरू नहीं"
});
const PARTS = Object.freeze({
  index_panel: "भाग 1",
  privacy_permissions: "भाग 1",
  local_model_loading: "भाग 2",
  hindi_female_tts: "भाग 2",
  sanskrit_pronunciation: "भाग 2",
  chant_prosody: "भाग 2",
  audio_generation_playback: "भाग 2",
  audio_save_share: "भाग 2",
  video_import: "भाग 3",
  body_language: "भाग 3",
  caption_sync: "भाग 4",
  video_full_duration: "भाग 4",
  lip_sync: "भाग 4",
  mp4_export: "भाग 4"
});

export async function renderStatusBoard() {
  const host = document.getElementById("moduleSummary");
  const status = document.getElementById("moduleStatusMessage");
  if (!host) return;
  host.replaceChildren();
  try {
    const response = await fetch("./progress.json", { cache: "no-store" });
    if (!response.ok) throw new Error("progress.json लोड नहीं हुआ।");
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error("मॉड्यूल सूची अमान्य है।");
    for (const item of data.features) {
      const card = document.createElement("article");
      card.className = "module-status-card status-" + String(item.status || "unknown").toLowerCase();
      const part = document.createElement("span");
      part.className = "module-part-label";
      part.textContent = PARTS[item.id] || "विकास भाग";
      const title = document.createElement("strong");
      title.textContent = item.name || item.id || "अज्ञात मॉड्यूल";
      const state = document.createElement("span");
      state.className = "module-state";
      state.textContent = LABELS[item.status] || "अज्ञात स्थिति";
      const summary = document.createElement("span");
      summary.className = "module-description";
      summary.textContent = item.summary || "";
      card.append(part, title, state, summary);
      host.append(card);
    }
    if (status) status.textContent = "ये Development Status हैं; Runtime Availability अलग से Dashboard पर जाँची जाती है।";
  } catch (error) {
    host.textContent = "मॉड्यूल स्थिति लोड नहीं हुई: " + error.message;
    if (status) status.textContent = "स्थिति स्रोत उपलब्ध नहीं है।";
  }
}

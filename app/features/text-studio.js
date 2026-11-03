import { putRecord, normalizeStoredText } from "../core/storage.js";
import { analyzeDevanagariText, normalizeDevanagariText } from "../core/devanagari-parser.js?v=0.9.0";

export function initTextStudio({ toast = () => {} } = {}) {
  const input = document.getElementById("sourceText");
  const count = document.getElementById("textCount");
  const save = document.getElementById("saveTextButton");
  const clear = document.getElementById("clearTextButton");
  const status = document.getElementById("saveStatus");
  const clean = document.getElementById("normalizeTextButton");
  const analysis = document.getElementById("textAnalysis");
  if (!input) return;
  let activeRecordId = null;

  function update() {
    const value = normalizeDevanagariText(input.value);
    const result = analyzeDevanagariText(value);
    if (count) count.textContent = result.aksharaCount + " अक्षर-खंड · " + result.wordCount + " शब्द";
    if (analysis) {
      const metrics = [
        result.lineCount + " पंक्तियाँ",
        result.wordCount + " शब्द",
        result.aksharaCount + " अक्षर-खंड",
        result.consonantCount + " व्यंजन",
        result.matraCount + " मात्राएँ",
        result.conjunctCount + " संयुक्ताक्षर",
        result.viramaCount + " हलन्त",
        result.punctuationCount + " विराम-चिह्न"
      ];
      if (result.vedicAccentCount) metrics.push(result.vedicAccentCount + " वैदिक स्वर-चिह्न");
      analysis.textContent = metrics.join(" · ") +
        (result.issues.length ? " — जाँच: " + result.issues.join(" ") : " — प्रारंभिक पाठ-संरचना विश्लेषण।");
    }
  }

  function loadRecord(record) {
    input.value = normalizeStoredText(record.content || "");
    activeRecordId = Number.isFinite(Number(record.id)) ? Number(record.id) : null;
    update();
    if (status) status.textContent = activeRecordId
      ? "Library रिकॉर्ड संपादन के लिए खुला है।"
      : "पाठ संपादक में खोला गया।";
  }

  input.addEventListener("input", update);
  input.addEventListener("paste", () => setTimeout(update, 0));
  update();

  clean?.addEventListener("click", () => {
    input.value = normalizeDevanagariText(input.value);
    update();
    if (status) status.textContent = "Unicode, line-break और अतिरिक्त खाली स्थान सामान्य किए गए।";
    toast("पाठ सामान्य किया गया।");
  });

  save?.addEventListener("click", async () => {
    const value = normalizeDevanagariText(input.value).trim();
    if (!value) {
      if (status) status.textContent = "पहले संस्कृत या हिंदी पाठ लिखें।";
      return;
    }
    try {
      const record = { content: value };
      if (activeRecordId !== null) record.id = activeRecordId;
      const id = await putRecord("texts", record);
      activeRecordId = id;
      if (status) status.textContent = "पाठ स्थानीय Library में सुरक्षित है।";
      toast("पाठ सुरक्षित हुआ।");
    } catch (error) {
      if (status) status.textContent = "सुरक्षित नहीं हो सका: " + error.message;
      toast(error.message);
    }
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    activeRecordId = null;
    update();
    if (status) status.textContent = "नया पाठ लिखने के लिए संपादक तैयार है।";
    input.focus();
  });

  window.addEventListener("swar-sadhika:load-text", event => {
    loadRecord({ content: typeof event.detail === "string" ? event.detail : "" });
  });
  window.addEventListener("swar-sadhika:load-text-record", event => {
    if (event.detail && typeof event.detail === "object") loadRecord(event.detail);
  });
  return {
    getText: () => normalizeDevanagariText(input.value),
    update,
    getActiveRecordId: () => activeRecordId
  };
}

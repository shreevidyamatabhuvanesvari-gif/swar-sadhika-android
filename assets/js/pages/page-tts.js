/* Swar-Sadhika — Compiler-backed Native TTS page.
 * Original Sanskrit is retained for display; only Engine-validated compiled
 * speech text may be submitted to the local Native Speech Synthesis backend.
 */
import { createTtsEngine } from "../tts/tts-engine.js";

export async function mount(context) {
  if (!context || !context.root || !context.document) {
    throw new TypeError("TTS module को root और document context आवश्यक है।");
  }

  const root = context.root;
  const doc = context.document;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
  if (!win) throw new Error("TTS के लिए Browser Window उपलब्ध नहीं है।");
  const byId = id => doc.getElementById(id);

  const ui = {
    input: root.querySelector("#text-input"),
    voice: root.querySelector("#voice-select"),
    rate: root.querySelector("#speech-rate"),
    rateValue: root.querySelector("#rate-value"),
    speak: root.querySelector("#speak-btn"),
    pause: root.querySelector("#pause-btn"),
    resume: root.querySelector("#resume-btn"),
    stop: root.querySelector("#stop-btn"),
    status: root.querySelector("#tts-status"),
    overlay: byId("line-overlay"),
    line: byId("rainbow-line")
  };

  const missing = Object.entries(ui)
    .filter(([key, value]) => !value && !["overlay", "line"].includes(key))
    .map(([key]) => key);
  if (missing.length) {
    throw new Error("TTS interface में आवश्यक तत्व अनुपस्थित हैं: " + missing.join(", "));
  }

  const calibrationPanel = doc.createElement("section");
  calibrationPanel.className = "note tts-voice-calibration";
  calibrationPanel.setAttribute("aria-label", "Native Voice Rate और Pitch Calibration");
  calibrationPanel.setAttribute("data-role", "voice-parameter-calibration");
  const calibrationHeading = doc.createElement("h3");
  calibrationHeading.textContent = "Native Voice — Rate / Pitch Calibration";
  const calibrationIntro = doc.createElement("p");
  calibrationIntro.className = "note";
  calibrationIntro.textContent = "1.00 / 1.00 चुनी हुई Native Voice के platform-default मान हैं। छोटे बदलाव करके नमूना सुनें; Android TTS Provider कुछ मानों को सीमित या अनदेखा कर सकता है। Rate और Pitch आवाज़ की पहचान या संस्कृत उच्चारण को स्वयं ठीक नहीं करते।";
  const pitchField = doc.createElement("label");
  pitchField.className = "field";
  pitchField.textContent = "आवाज़ की Pitch ";
  const pitchValue = doc.createElement("span");
  pitchValue.textContent = "1.00";
  pitchField.appendChild(pitchValue);
  const pitchInput = doc.createElement("input");
  pitchInput.type = "range";
  pitchInput.min = "0.70";
  pitchInput.max = "1.30";
  pitchInput.step = "0.05";
  pitchInput.value = "1.00";
  pitchInput.setAttribute("aria-label", "Native Voice Pitch");
  pitchInput.setAttribute("aria-valuetext", "1.00 — platform default");
  pitchField.appendChild(pitchInput);
  const calibrationSummary = doc.createElement("p");
  calibrationSummary.className = "tts-preview-meta";
  calibrationSummary.setAttribute("role", "status");
  calibrationSummary.setAttribute("aria-live", "polite");
  const calibrationActions = doc.createElement("div");
  calibrationActions.className = "tts-actions";
  const calibrationSampleButton = doc.createElement("button");
  calibrationSampleButton.type = "button";
  calibrationSampleButton.className = "btn";
  calibrationSampleButton.textContent = "▶ पहली पंक्ति का नमूना सुनें";
  const calibrationResetButton = doc.createElement("button");
  calibrationResetButton.type = "button";
  calibrationResetButton.className = "btn";
  calibrationResetButton.textContent = "मानक 1.00 / 1.00 पर रीसेट";
  calibrationActions.append(calibrationSampleButton, calibrationResetButton);
  const calibrationNote = doc.createElement("p");
  calibrationNote.className = "note";
  calibrationNote.textContent = "नमूना परीक्षण में पाठ वही रहेगा जो आपने लिखा है। परीक्षण के दौरान मुख्य वाचन बंद रहेगा; “समाप्त करें” से नमूना रोका जा सकता है।";
  calibrationPanel.append(calibrationHeading, calibrationIntro, pitchField, calibrationSummary, calibrationActions, calibrationNote);
  const rateField = ui.rate.parentNode;
  const controlsRow = rateField && rateField.parentNode;
  if (controlsRow && controlsRow.parentNode) {
    controlsRow.parentNode.insertBefore(calibrationPanel, controlsRow.nextSibling);
  } else {
    root.appendChild(calibrationPanel);
  }
  ui.rate.min = "0.65";
  ui.rate.max = "1.25";
  ui.rate.step = "0.05";
  ui.rate.value = "1.00";
  ui.rate.setAttribute("aria-label", "Native Voice बोलने की गति");
  const knowledgeStatus = doc.createElement("div");
  knowledgeStatus.className = "status warn";
  knowledgeStatus.setAttribute("role", "status");
  knowledgeStatus.setAttribute("aria-live", "polite");
  knowledgeStatus.setAttribute("data-state", "warning");
  knowledgeStatus.textContent = "स्थानीय Knowledge की प्रारंभिक जाँच की जा रही है…";
  const knowledgeStatusParent = ui.status.parentNode || root;
  knowledgeStatusParent.insertBefore(knowledgeStatus, ui.status.nextSibling);

  const pronunciationPreview = doc.createElement("section");
  pronunciationPreview.className = "note tts-pronunciation-preview";
  pronunciationPreview.setAttribute("aria-label", "उच्चारण Compiler Preview");
  pronunciationPreview.setAttribute("data-role", "pronunciation-preview");
  const previewHeading = doc.createElement("h3");
  previewHeading.textContent = "उच्चारण Compiler Preview";
  const previewIntro = doc.createElement("p");
  previewIntro.className = "note";
  previewIntro.textContent = "मूल संस्कृत पंक्ति स्क्रीन पर यथावत रहेगी। वाचन-पाठ केवल सभी Compiler Validation शर्तें सफल होने पर बदलेगा; अन्यथा Native TTS को मूल पंक्ति दी जाएगी।";
  const previewSummary = doc.createElement("div");
  previewSummary.className = "status";
  previewSummary.setAttribute("role", "status");
  previewSummary.setAttribute("aria-live", "polite");
  previewSummary.textContent = "पाठ दर्ज करने पर प्रत्येक पंक्ति का उच्चारण Preview दिखेगा।";
  const previewList = doc.createElement("div");
  previewList.className = "tts-pronunciation-preview-list";
  pronunciationPreview.append(previewHeading, previewIntro, previewSummary, previewList);
  if (ui.input.parentNode) ui.input.parentNode.insertBefore(pronunciationPreview, ui.input.nextSibling);
  else root.appendChild(pronunciationPreview);
  const pronunciationContextPanel = doc.createElement("section");
  pronunciationContextPanel.className = "note tts-pronunciation-context";
  pronunciationContextPanel.setAttribute("aria-label", "वैदिक शाखा और पाठ-संदर्भ");
  const contextHeading = doc.createElement("h3");
  contextHeading.textContent = "वैदिक शाखा एवं पाठ-संदर्भ";
  const contextIntro = doc.createElement("p");
  contextIntro.className = "note";
  contextIntro.textContent = "शाखा या पाठ का चयन केवल तभी करें जब दिए गए संस्कृत पाठ का संदर्भ निश्चित हो। अनिर्दिष्ट चयन पर शाखा/पाठ-विशिष्ट नियम लागू नहीं होंगे और मूल पाठ सुरक्षित रहेगा।";
  const contextFields = doc.createElement("div");
  contextFields.className = "tts-context-fields";
  function createContextSelect(id, labelText, choices) {
    const field = doc.createElement("div");
    field.className = "tts-context-field";
    const label = doc.createElement("label");
    label.setAttribute("for", id);
    label.textContent = labelText;
    const select = doc.createElement("select");
    select.id = id;
    select.className = ui.voice.className || "";
    select.setAttribute("aria-label", labelText);
    for (const choice of choices) {
      const option = doc.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      select.appendChild(option);
    }
    field.append(label, select);
    contextFields.appendChild(field);
    return select;
  }
  const contextShakha = createContextSelect("tts-pronunciation-shakha", "वैदिक शाखा", [
    { value: "", label: "अनिर्दिष्ट — शाखा-विशिष्ट नियम निष्क्रिय" },
    { value: "shaakala", label: "ऋग्वेद — शाकल शाखा" }
  ]);
  const contextPatha = createContextSelect("tts-pronunciation-patha", "पाठ-प्रकार", [
    { value: "", label: "अनिर्दिष्ट — मूल पाठ सुरक्षित" },
    { value: "samhita", label: "संहिता-पाठ" },
    { value: "pada", label: "पदपाठ" },
    { value: "krama", label: "क्रमपाठ" },
    { value: "other", label: "अन्य" }
  ]);
  pronunciationContextPanel.append(contextHeading, contextIntro, contextFields);
  if (pronunciationPreview.parentNode) pronunciationPreview.parentNode.insertBefore(pronunciationContextPanel, pronunciationPreview);
  else root.appendChild(pronunciationContextPanel);

  const voiceProfileDiagnosticsPanel = doc.createElement("section");
  voiceProfileDiagnosticsPanel.className = "note tts-voice-profile-diagnostics";
  voiceProfileDiagnosticsPanel.setAttribute("aria-label", "Native TTS Voice Profile Diagnostics");
  voiceProfileDiagnosticsPanel.setAttribute("data-role", "voice-profile-diagnostics");
  const voiceProfileDiagnosticsHeading = doc.createElement("h3");
  voiceProfileDiagnosticsHeading.textContent = "Native Voice Profile Diagnostics";
  const voiceProfileDiagnosticsSummary = doc.createElement("div");
  voiceProfileDiagnosticsSummary.className = "status";
  voiceProfileDiagnosticsSummary.setAttribute("role", "status");
  voiceProfileDiagnosticsSummary.setAttribute("aria-live", "polite");
  voiceProfileDiagnosticsSummary.textContent = "स्थानीय Voice सूची प्राप्त होने पर वास्तविक Voice Profile यहाँ दिखाई देगा।";
  const voiceProfileDiagnosticsDetails = doc.createElement("div");
  voiceProfileDiagnosticsDetails.className = "tts-voice-profile-details";
  voiceProfileDiagnosticsPanel.append(
    voiceProfileDiagnosticsHeading,
    voiceProfileDiagnosticsSummary,
    voiceProfileDiagnosticsDetails
  );
  if (pronunciationPreview.parentNode) {
    pronunciationPreview.parentNode.insertBefore(voiceProfileDiagnosticsPanel, pronunciationPreview.nextSibling);
  } else {
    root.appendChild(voiceProfileDiagnosticsPanel);
  }

  const g2pPreviewPanel = doc.createElement("section");
  g2pPreviewPanel.className = "note tts-g2p-preview";
  g2pPreviewPanel.setAttribute("aria-label", "संस्कृत G2P ध्वनि-विश्लेषण");
  g2pPreviewPanel.setAttribute("data-role", "sanskrit-g2p-preview");
  const g2pPreviewHeading = doc.createElement("h3");
  g2pPreviewHeading.textContent = "Sanskrit G2P — ध्वनि-विश्लेषण";
  const g2pPreviewIntro = doc.createElement("p");
  g2pPreviewIntro.className = "note";
  g2pPreviewIntro.textContent = "यह मूल संस्कृत अक्षरों से तैयार व्यापक ध्वन्यात्मक विश्लेषण है। प्रदर्शित लिप्यंतरण IPA, प्रमाणित बोलने योग्य पाठ या गायन ऑडियो नहीं है। G2P परिणाम अपने-आप Native TTS के पाठ को नहीं बदलता।";
  const g2pPreviewSummary = doc.createElement("div");
  g2pPreviewSummary.className = "status";
  g2pPreviewSummary.setAttribute("role", "status");
  g2pPreviewSummary.setAttribute("aria-live", "polite");
  g2pPreviewSummary.textContent = "संस्कृत पाठ दर्ज करने पर G2P विश्लेषण यहाँ दिखाई देगा।";
  const g2pPreviewList = doc.createElement("div");
  g2pPreviewList.className = "tts-g2p-preview-list";
  g2pPreviewPanel.append(g2pPreviewHeading, g2pPreviewIntro, g2pPreviewSummary, g2pPreviewList);
  if (pronunciationPreview.parentNode) {
    pronunciationPreview.parentNode.insertBefore(g2pPreviewPanel, voiceProfileDiagnosticsPanel);
  } else {
    root.appendChild(g2pPreviewPanel);
  }

  const engine = createTtsEngine({ target: win, defaultBackend: "native" });
  const state = {
    voices: [],
    voiceEntries: [],
    generation: 0,
    lines: [],
    index: 0,
    active: false,
    speechInFlight: false,
    calibrationTesting: false,
    engineReady: false,
    userPaused: false,
    navigationPaused: false,
    waitingForNext: false,
    timer: null,
    destroyed: false,
    voiceRefreshSequence: 0,
    unsubscribeVoices: null,
    unsubscribePronunciationWarning: null,
    unsubscribeKnowledgeChange: null,
    unsubscribeKnowledgeError: null,
    unsubscribeKnowledgeWarning: null,
    knowledgeRefreshSequence: 0,
    pronunciationReady: false,
    pronunciationInfo: null,
    previewEntries: [],
    currentSpeech: null,
    readingContext: null,
    unsubscribeSpeechPreparation: null
  };

  const FEMALE_HINTS = [
    "female", "woman", "zira", "heera", "lekha", "priya",
    "sangeeta", "kavya", "neerja", "raveena", "aarti", "swara",
    "susan", "samantha", "siri female"
  ];
  const MALE_HINTS = ["male", "man", "david", "mark", "george"];

  function setStatus(message, warning = false) {
    if (!ui.status) return;
    ui.status.textContent = String(message);
    ui.status.classList.toggle("warn", Boolean(warning));
  }

  function setKnowledgeStatus(message, warning = false) {
    if (!knowledgeStatus || state.destroyed) return;
    knowledgeStatus.textContent = String(message);
    knowledgeStatus.classList.toggle("warn", Boolean(warning));
    knowledgeStatus.setAttribute("data-state", warning ? "warning" : "success");
  }

  function renderKnowledgeStatus(diagnostics) {
    if (!diagnostics || diagnostics.loaded !== true) {
      setKnowledgeStatus("Repository Manifest में पंजीकृत JSON Knowledge दस्तावेज़ अभी सक्रिय Cache में उपलब्ध नहीं हैं। TTS उन्हें सुरक्षित रूप से Sync करने का प्रयास कर रहा है।", true);
      return;
    }
    const documentCount = Number(diagnostics.loadedDocuments) || 0;
    const guidanceCount = Number(diagnostics.loadedGuidanceEntries) || Number(diagnostics.loadedEntries) || 0;
    const candidateCount = Number(diagnostics.loadedPronunciationCandidates) || 0;
    const readyCount = Number(diagnostics.activePronunciationEntries) || 0;
    const uniqueTermCount = Number(diagnostics.uniqueTerms) || 0;
    const uniquePhraseCount = Number(diagnostics.uniquePhrases) || 0;
    const documentStates = Array.isArray(diagnostics.documentStates) ? diagnostics.documentStates : [];
    const failedDocuments = documentStates.filter(item => item && item.status === "error").length;
    const validationFallbacks = documentStates.filter(item => item && item.validationFallback).length;
    const inactiveReasons = (diagnostics.indexDiagnostics || {}).pronunciationInactiveReasons || {};
    const missingSpeechText = Number(inactiveReasons["native-speech-text-missing"]) || 0;
    const partial = diagnostics.status === "PARTIAL" || diagnostics.status === "FAILED" ||
      failedDocuments > 0 || validationFallbacks > 0;
    const lexiconText = diagnostics.hasPronunciationLexicon ? "Pronunciation Lexicon " + candidateCount + " Candidates" : "Pronunciation Lexicon अनुपलब्ध";
    const message = "स्थानीय Knowledge Index सक्रिय: " + documentCount + " JSON दस्तावेज़ · " +
      guidanceCount + " Guidance Entries · " + uniqueTermCount + " विशिष्ट शब्द · " +
      uniquePhraseCount + " बहु-शब्द पद · " + lexiconText + " · " + readyCount + " Compiler-ready Rules। " +
      (partial ? failedDocuments + " दस्तावेज़ Sync में विफल और " + validationFallbacks + " दस्तावेज़ Generic Fallback से Index हुए।" :
        "Manifest में पंजीकृत सभी सक्रिय JSON दस्तावेज़ पढ़े गए।") +
      (missingSpeechText ? " " + missingSpeechText + " Lexicon Candidates में nativeSpeechText अनुपलब्ध है; उन पर मूल पाठ सुरक्षित रहेगा।" : "");
    setKnowledgeStatus(message, partial || readyCount === 0 || missingSpeechText > 0);
  }

  async function refreshKnowledgeFromCache(reason) {
    if (state.destroyed) return null;
    const request = ++state.knowledgeRefreshSequence;
    const prefix = reason ? String(reason) + " — " : "";
    setKnowledgeStatus(prefix + "Repository Manifest Refresh और सभी सक्रिय JSON Knowledge दस्तावेज़ों की SHA-256-सत्यापित स्थानीय Sync हो रही है…", false);
    try {
      const diagnostics = await engine.loadKnowledge({
        refreshManifest: true,
        downloadIfMissing: true
      });
      if (state.destroyed || request !== state.knowledgeRefreshSequence) return null;
      renderKnowledgeStatus(diagnostics);
      return diagnostics;
    } catch (error) {
      if (state.destroyed || request !== state.knowledgeRefreshSequence) return null;
      let previous = null;
      try { previous = engine.getKnowledgeDiagnostics(); } catch (_) {}
      const previousMessage = previous && previous.loaded === true
        ? " पिछला सफल Knowledge Index सुरक्षित रखा गया है।"
        : " Nano Server पेज में आवश्यक JSON दस्तावेज़ डाउनलोड करके TTS पेज फिर खोलें।";
      const code = error && error.code ? " · " + error.code : "";
      const message = error && error.message ? error.message : "अज्ञात त्रुटि";
      setKnowledgeStatus(
        prefix + "नई Knowledge सक्रिय नहीं हुई: " + message + code + "." + previousMessage,
        true
      );
      return null;
    }
  }

  function setLine(message) {
    if (ui.line) ui.line.textContent = message || "";
    if (ui.overlay) ui.overlay.classList.toggle("hidden", !message);
  }

  function summarizeAnalysis(analysis) {
    if (!analysis) return "पाठ विश्लेषण उपलब्ध नहीं है।";
    const difficult = analysis.knownDifficultWords ? analysis.knownDifficultWords.length : 0;
    const conjuncts = analysis.conjuncts ? analysis.conjuncts.length : 0;
    const matras = analysis.matras ? analysis.matras.total : 0;
    const accents = analysis.accentMarks ? analysis.accentMarks.length : 0;
    const unknown = analysis.unclassifiedMarks ? analysis.unclassifiedMarks.length : 0;
    return "कठिन शब्द " + difficult + " · संयुक्ताक्षर " + conjuncts +
      " · मात्राएँ " + matras + " · वैदिक/विशेष चिह्न " + accents + " · अज्ञात चिह्न " + unknown;
  }

  function pronunciationReadyText() {
    const info = state.pronunciationInfo;
    if (!info || !info.selfTest) return "वैदिक उच्चारण ज्ञानकोश की स्थिति उपलब्ध नहीं है।";
    return "वैदिक पाठ विश्लेषक " + info.selfTest.passed + "/" + info.selfTest.total + " परीक्षण सफल।";
  }

  function analyzeCurrentText() {
    if (state.destroyed) return;
    if (!state.engineReady || state.active) {
      renderSpeechPreview();
      return;
    }
    const text = ui.input.value;
    if (!text.trim()) { renderSpeechPreview(); return; }
    try {
      const analysis = engine.analyzeText(text);
      const message = "पाठ विश्लेषण: " + summarizeAnalysis(analysis) + "। " + pronunciationReadyText();
      const warning = Boolean(analysis.needsBranchContext || (analysis.unclassifiedMarks && analysis.unclassifiedMarks.length));
      setStatus(warning
        ? message + " वैदिक स्वराघात/अज्ञात चिह्नों का Native Voice पर प्रमाणित वाचन उपलब्ध नहीं है; मूल पाठ सुरक्षित रहेगा।"
        : message, warning);
    } catch (error) {
      setStatus("पाठ विश्लेषण उपलब्ध नहीं; Native TTS सुरक्षित मूल-पाठ Fallback उपयोग करेगा। " +
        (error && error.message ? error.message : ""), true);
    }
    renderSpeechPreview();
  }

  function onTextInput() { analyzeCurrentText(); }

  function isDevanagari(value) {
    return Array.from(String(value)).some(character => {
      const code = character.codePointAt(0);
      return (code >= 0x0900 && code <= 0x097f) || (code >= 0xa8e0 && code <= 0xa8ff) ||
        (code >= 0x11b00 && code <= 0x11b0a) || (code >= 0x1cd0 && code <= 0x1cfa);
    });
  }

  function stripTerminalVerseNumber(sourceLine) {
    const line = String(sourceLine);
    const patterns = [
      {
        regex: /(\s*(?:॥|।।|।))\s*[०-९0-9]{1,4}\s*(?:॥|।।|।)\s*$/u,
        preserve: match => match[1]
      },
      {
        regex: /(\s*(?:॥|।।|।))\s*[०-९0-9]{1,4}\s*$/u,
        preserve: match => match[1]
      },
      {
        regex: /\s*[\[(]\s*[०-९0-9]{1,4}\s*[\])}]\s*$/u,
        preserve: () => ""
      },
      {
        regex: /(\s+)[०-९0-9]{1,4}(\s*(?:॥|।।|।|[.)]))?\s*$/u,
        preserve: match => match[2] ? match[2].trimStart() : ""
      }
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      const prefix = line.slice(0, match.index).trimEnd();
      return {
        text: prefix + pattern.preserve(match),
        removed: true,
        number: (match[0].match(/[०-९0-9]{1,4}/u) || [""])[0]
      };
    }
    return { text: line, removed: false, number: "" };
  }

  function voiceGenderHint(voice) {
    const name = String(voice && voice.name || "").toLowerCase();
    if (FEMALE_HINTS.some(hint => name.includes(hint))) return "female";
    if (MALE_HINTS.some(hint => name.includes(hint))) return "male";
    return "unknown";
  }

  function scoreVoice(voice, textValue) {
    const language = String(voice && voice.lang || "").toLowerCase();
    const gender = voiceGenderHint(voice);
    let score = 0;
    if (gender === "female") score += 120;
    if (gender === "male") score -= 80;
    if (isDevanagari(textValue)) {
      if (language === "hi-in") score += 70;
      else if (language.startsWith("hi")) score += 58;
      else if (language.startsWith("sa")) score += 54;
      else if (language.startsWith("en-in")) score += 8;
    } else if (language.startsWith("en-in")) {
      score += 35;
    }
    if (voice && voice.localService === true) score += 12;
    if (voice && voice.default) score += 3;
    return score;
  }

  function createVoiceEntries(voices) {
    const usedKeys = new Map();
    return voices.map((voice, index) => {
      const base = String(voice.voiceURI || (String(voice.name || "voice") + "|" + String(voice.lang || "")));
      const duplicateCount = usedKeys.get(base) || 0;
      usedKeys.set(base, duplicateCount + 1);
      return { voice, index, key: duplicateCount ? base + "#" + duplicateCount : base };
    }).sort((a, b) => scoreVoice(b.voice, ui.input.value) - scoreVoice(a.voice, ui.input.value));
  }

  function chooseVoice(textValue) {
    if (!state.voiceEntries.length) return null;
    const selectedKey = ui.voice.value;
    if (selectedKey && selectedKey !== "auto") {
      const selected = state.voiceEntries.find(entry => entry.key === selectedKey);
      return selected ? selected.voice : null;
    }
    const sorted = state.voiceEntries.slice().sort((a, b) =>
      scoreVoice(b.voice, textValue) - scoreVoice(a.voice, textValue)
    );
    return sorted.length ? sorted[0].voice : null;
  }

  function normalizeBcp47Locale(rawLocale) {
    const raw = typeof rawLocale === "string" ? rawLocale.trim() : "";
    if (!raw) return "";
    const candidate = raw.replace(/_/g, "-");
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(candidate)) return "";
    try {
      const localeApi = win.Intl && typeof win.Intl.getCanonicalLocales === "function"
        ? win.Intl : (typeof Intl !== "undefined" ? Intl : null);
      if (localeApi && typeof localeApi.getCanonicalLocales === "function") {
        const canonical = localeApi.getCanonicalLocales(candidate);
        return canonical.length ? canonical[0] : "";
      }
    } catch (_) {
      return "";
    }
    return candidate.split("-").map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase();
      if (/^[a-z]{4}$/i.test(part)) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      return part.toLowerCase();
    }).join("-");
  }

  function detectNativeRuntime() {
    const nav = win.navigator || {};
    let userAgent = "";
    let vendor = "";
    let clientPlatform = "";
    let brands = [];
    try { userAgent = String(nav.userAgent || ""); } catch (_) {}
    try { vendor = String(nav.vendor || ""); } catch (_) {}
    try {
      const userAgentData = nav.userAgentData;
      clientPlatform = String(userAgentData && userAgentData.platform || "");
      brands = userAgentData && Array.isArray(userAgentData.brands)
        ? userAgentData.brands.map(item => String(item && item.brand || "")) : [];
    } catch (_) {
      clientPlatform = "";
      brands = [];
    }

    const androidFromClientHints = /android/i.test(clientPlatform);
    const androidFromUserAgent = /android/i.test(userAgent);
    const isAndroid = androidFromClientHints || androidFromUserAgent;
    const hasGoogleChromeBrand = brands.some(brand => /google chrome/i.test(brand));
    const hasBrandData = brands.length > 0;
    const alternateBrowser = /(?:EdgA|EdgiOS|OPR|SamsungBrowser|UCBrowser|YaBrowser|Vivaldi|Brave|Firefox|FxiOS|DuckDuckGo|MiuiBrowser|HuaweiBrowser|HeyTapBrowser)\//i.test(userAgent);
    const chromeToken = /Chrome\/[0-9.]+/i.test(userAgent);
    const chromeFromUserAgent = chromeToken && !alternateBrowser && !/\bwv\b/i.test(userAgent);
    const isChrome = hasGoogleChromeBrand || (!hasBrandData && chromeFromUserAgent);
    const hasChromiumBrand = brands.some(brand => /^chromium$/i.test(brand));
    const browser = hasGoogleChromeBrand || isChrome ? "Chrome" :
      hasChromiumBrand ? "Chromium (Chrome ब्राउज़र की पुष्टि नहीं)" :
      alternateBrowser ? "अन्य Chromium/Browser (Chrome नहीं)" : "अज्ञात";

    const platform = isAndroid
      ? (isChrome ? "Android Chrome" : "Android (Chrome की पुष्टि नहीं)")
      : "Android platform की पुष्टि नहीं";
    const evidence = [];
    if (androidFromClientHints) evidence.push("Android: userAgentData.platform");
    else if (androidFromUserAgent) evidence.push("Android: navigator.userAgent");
    if (hasGoogleChromeBrand) evidence.push("Chrome: userAgentData.brands");
    else if (isChrome) evidence.push("Chrome: navigator.userAgent");
    else if (hasChromiumBrand) evidence.push("Chromium brand उपलब्ध; Chrome ब्राउज़र अपुष्ट");
    if (vendor) evidence.push("navigator.vendor उपलब्ध");
    if (!evidence.length) evidence.push("पर्याप्त Browser पहचान संकेत उपलब्ध नहीं");
    return Object.freeze({
      platform,
      browser,
      evidence: Object.freeze(evidence),
      androidConfirmed: isAndroid,
      chromeConfirmed: isChrome
    });
  }

  function nativeVoiceProfile(voice) {
    const runtime = detectNativeRuntime();
    const rawLocale = String(voice && voice.lang || "").trim();
    const normalizedLocale = normalizeBcp47Locale(rawLocale);
    return {
      engine: "Web Speech API SpeechSynthesis",
      platform: runtime.platform === "Android Chrome" ? runtime.platform : "",
      voiceName: String(voice && voice.name || "").trim(),
      voiceURI: String(voice && voice.voiceURI || "").trim(),
      rawLocale,
      locale: normalizedLocale,
      normalizedLocale,
      runtimeBrowser: runtime.browser,
      platformEvidence: runtime.evidence.join(" · ")
    };
  }


  function isValidBcp47Locale(value) {
    return typeof value === "string" &&
      /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim());
  }

  function inspectNativeVoiceProfile(voice) {
    if (!voice || typeof voice !== "object") {
      return Object.freeze({
        available: false,
        metadataComplete: false,
        missing: Object.freeze(["Native Voice चयन"]),
        profile: null,
        localService: null
      });
    }

    const profile = nativeVoiceProfile(voice);
    const missing = [];
    if (!profile.voiceName) missing.push("voiceName");
    if (!profile.voiceURI) missing.push("voiceURI");
    if (!profile.rawLocale) missing.push("Raw locale");
    if (!profile.normalizedLocale) missing.push("मान्य BCP-47 locale");
    if (profile.platform !== "Android Chrome") missing.push("सत्यापित Android Chrome platform");
    if (voice.localService !== true) missing.push("localService=true");

    return Object.freeze({
      available: true,
      metadataComplete: missing.length === 0,
      localeNeedsNormalization: Boolean(profile.rawLocale && profile.normalizedLocale &&
        profile.rawLocale !== profile.normalizedLocale),
      missing: Object.freeze(missing),
      profile: Object.freeze({ ...profile }),
      localService: voice.localService === true ? "true" :
        voice.localService === false ? "false" : "अनिर्दिष्ट"
    });
  }

  function renderNativeVoiceProfileDiagnostics(voice) {
    const diagnostics = inspectNativeVoiceProfile(voice);
    voiceProfileDiagnosticsDetails.replaceChildren();

    if (!diagnostics.available) {
      voiceProfileDiagnosticsSummary.className = "status warn";
      voiceProfileDiagnosticsSummary.textContent =
        "अभी कोई स्थानीय Native Voice चयनित नहीं है। Android Chrome की Voice सूची प्राप्त होने पर जाँच होगी।";
      return;
    }

    const profile = diagnostics.profile;
    const fields = [
      ["Voice Name", profile.voiceName || "ब्राउज़र ने उपलब्ध नहीं कराया"],
      ["voiceURI", profile.voiceURI || "ब्राउज़र ने खाली छोड़ा"],
      ["Raw locale (SpeechSynthesisVoice.lang)", profile.rawLocale || "ब्राउज़र ने उपलब्ध नहीं कराया"],
      ["Normalized BCP-47 locale", profile.normalizedLocale || "मान्य रूप में सामान्यीकृत नहीं हो सका"],
      ["localService", diagnostics.localService],
      ["Engine", profile.engine],
      ["Browser", profile.runtimeBrowser],
      ["Platform", profile.platform || "Android Chrome की पुष्टि नहीं हुई"],
      ["पहचान के प्रमाण", profile.platformEvidence]
    ];

    fields.forEach(([label, value]) => {
      const row = doc.createElement("p");
      row.className = "tts-voice-profile-row subtle";
      row.textContent = label + ": " + value;
      voiceProfileDiagnosticsDetails.appendChild(row);
    });

    if (diagnostics.metadataComplete && diagnostics.localeNeedsNormalization) {
      voiceProfileDiagnosticsSummary.className = "status warn";
      voiceProfileDiagnosticsSummary.textContent =
        "Voice Metadata उपलब्ध है। Android ने Raw locale " + profile.rawLocale +
        " दिया है; इसका मानकीकृत BCP-47 रूप " + profile.normalizedLocale +
        " है। चुनी हुई Native Voice वस्तु अपरिवर्तित रखी गई है। वर्तमान Compiler अभी raw voice.lang को सीधे जाँचता है; अगली अलग फाइल के सुधार तक Compiler Fallback संभव है।";
    } else if (diagnostics.metadataComplete) {
      voiceProfileDiagnosticsSummary.className = "status";
      voiceProfileDiagnosticsSummary.textContent =
        "Android Chrome की पहचान और स्थानीय Native Voice Metadata उपलब्ध हैं। किसी Lexicon नियम के लिए उसका अपना वाचन-पाठ, संदर्भ और अनुमति भी वैध होना आवश्यक है।";
    } else {
      voiceProfileDiagnosticsSummary.className = "status warn";
      voiceProfileDiagnosticsSummary.textContent =
        "Voice Metadata/Browser पहचान अधूरी है। अनुपलब्ध या अपुष्ट मान: " + diagnostics.missing.join(", ") +
        "। Native TTS आवाज़ फिर भी बोल सकती है; Voice-विशिष्ट Lexicon परिवर्तन लागू न होने पर मूल संस्कृत पाठ सुरक्षित रहेगा।";
    }
  }

  function getPronunciationContext() {
    const context = {};
    if (contextShakha.value) context.shakha = contextShakha.value;
    if (contextPatha.value) context.patha = contextPatha.value;
    return Object.freeze(context);
  }
  function describePronunciationContext(context = getPronunciationContext()) {
    const shakhaLabel = context.shakha === "shaakala" ? "ऋग्वेद शाकल" : "शाखा अनिर्दिष्ट";
    const labels = { samhita: "संहिता", pada: "पद", krama: "क्रम", other: "अन्य" };
    return shakhaLabel + " · " + (context.patha ? labels[context.patha] || "पाठ अनिर्दिष्ट" : "पाठ अनिर्दिष्ट");
  }
  function compilerOptionsForVoice(voice) {
    const context = getPronunciationContext();
    return { backendType: "native", voice, voiceProfile: nativeVoiceProfile(voice),
      shakha: context.shakha || null, patha: context.patha || null, context };
  }

  function previewEntryForLine(originalLine, index, voice) {
    const numbered = stripTerminalVerseNumber(originalLine);
    const speechSourceText = numbered.text.trim();
    let prepared = null, failure = null, g2pAnalysis = null, g2pFailure = null;
    if (speechSourceText && state.engineReady) {
      if (voice) {
        try { prepared = engine.prepareSpeech(speechSourceText, compilerOptionsForVoice(voice)); }
        catch (error) { failure = error && error.message ? error.message : String(error); }
      }
      if (prepared && prepared.g2pAnalysis) {
        g2pAnalysis = prepared.g2pAnalysis;
      } else if (typeof engine.analyzeG2P === "function") {
        try {
          const context = getPronunciationContext();
          g2pAnalysis = engine.analyzeG2P(speechSourceText, { shakha: context.shakha || undefined });
        } catch (error) {
          g2pFailure = error && error.message ? error.message : String(error);
        }
      } else {
        g2pFailure = "TTS Engine में G2P विश्लेषण API उपलब्ध नहीं है।";
      }
    }
    const validated = Boolean(prepared && prepared.compilerValidation &&
      prepared.compilerValidation.valid === true && prepared.originalText === speechSourceText &&
      typeof prepared.speechText === "string");
    const speechText = validated ? prepared.speechText : speechSourceText;
    const rules = validated && Array.isArray(prepared.appliedRules) ? prepared.appliedRules : [];
    const warnings = validated && Array.isArray(prepared.fallbackRules) ? prepared.fallbackRules : [];
    const confidence = validated && prepared.pronunciationConfidence ? prepared.pronunciationConfidence : "fallback";
    const applied = validated && prepared.knowledgeAppliedToSpeech === true && rules.length > 0 && speechText !== speechSourceText;
    const status = applied ? "Validated Lexicon Rule लागू" :
      confidence === "ambiguous" ? "Ambiguous — मूल पाठ सुरक्षित" :
      confidence === "verified" ? "Validated — मूल पाठ यथावत" : "Fallback — मूल पाठ सुरक्षित";
    return {
      index, originalLine, speechSourceText, speechText, validated, confidence, applied, status,
      rules, warnings, prepared, voiceURI: voice && voice.voiceURI || null,
      numberRemoved: numbered.removed, failure, g2pAnalysis, g2pFailure,
      g2pDiagnostics: prepared && prepared.g2pDiagnostics || null
    };
  }

  function renderPreviewEntry(entry) {
    const row = doc.createElement("article");
    row.className = "tts-preview-line";
    row.setAttribute("data-line-index", String(entry.index));
    row.setAttribute("data-confidence", entry.confidence);
    const title = doc.createElement("div");
    title.className = "tts-preview-line-title";
    title.textContent = "पंक्ति " + (entry.index + 1) + " — " + entry.status;
    const original = doc.createElement("p");
    original.className = "tts-preview-original";
    original.textContent = "मूल संस्कृत: " + entry.originalLine;
    const compiled = doc.createElement("p");
    compiled.className = "tts-preview-compiled";
    compiled.textContent = "वाचन पाठ: " + entry.speechText;
    row.append(title, original, compiled);
    const meta = doc.createElement("p");
    meta.className = "tts-preview-meta";
    meta.textContent = "Confidence: " + entry.confidence +
      (entry.numberRemoved ? " · अंतिम श्लोक-संख्या वाचन से छोड़ी गई" : "") +
      (entry.voiceURI ? " · Voice: " + entry.voiceURI : " · Voice चयन लंबित");
    row.appendChild(meta);
    if (entry.applied && entry.rules.length) {
      const applied = doc.createElement("p");
      applied.className = "tts-preview-applied";
      applied.textContent = "Applied Lexicon: " + entry.rules.map(rule =>
        String(rule.term || rule.originalForm || "") + " → " + String(rule.nativeSpeechText || "")
      ).join(" · ");
      row.appendChild(applied);
    } else if (entry.prepared && Array.isArray(entry.prepared.matchedLexiconEntries) &&
        entry.prepared.matchedLexiconEntries.length) {
      const matches = doc.createElement("p");
      matches.className = "tts-preview-matches";
      matches.textContent = "मिलान हुए Lexicon: " + entry.prepared.matchedLexiconEntries.map(item => item.term).join(" · ") +
        " (Speech Text में परिवर्तन अधिकृत नहीं हुआ)";
      row.appendChild(matches);
    }
    const contextRequired = entry.prepared && entry.prepared.knowledgeGuidance &&
      Array.isArray(entry.prepared.knowledgeGuidance.contextRequired)
      ? entry.prepared.knowledgeGuidance.contextRequired : [];
    if (contextRequired.length) {
      const contextWarning = doc.createElement("p");
      contextWarning.className = "status warn";
      contextWarning.textContent = "संदर्भ आवश्यक: " + contextRequired.map(item =>
        String(item.term || "") + " — " + String(item.shakha || "विशिष्ट शाखा")
      ).join(" · ") + "। चयनित शाखा से मिलान होने तक कोई शाखा-विशिष्ट नियम लागू नहीं होगा।";
      row.appendChild(contextWarning);
    }
    if (entry.failure) {
      const failure = doc.createElement("p");
      failure.className = "status warn";
      failure.textContent = "Compiler Preview Fallback: " + entry.failure;
      row.appendChild(failure);
    }
    for (const warning of entry.warnings) {
      const warningNode = doc.createElement("p");
      warningNode.className = "status warn";
      warningNode.textContent = (warning.code ? warning.code + ": " : "") +
        (warning.message || "उच्चारण नियम लागू नहीं हुआ।");
      row.appendChild(warningNode);
    }
    return row;
  }

  function renderG2PPreviewEntry(entry) {
    const row = doc.createElement("article");
    row.className = "tts-g2p-line";
    row.setAttribute("data-line-index", String(entry.index));
    const heading = doc.createElement("div");
    heading.className = "tts-preview-line-title";
    heading.textContent = "पंक्ति " + (entry.index + 1) + " — G2P विश्लेषण";
    row.appendChild(heading);

    const analysis = entry.g2pAnalysis;
    if (!analysis) {
      const unavailable = doc.createElement("p");
      unavailable.className = "status warn";
      unavailable.textContent = entry.g2pFailure
        ? "G2P उपलब्ध नहीं: " + entry.g2pFailure
        : "G2P विश्लेषण अभी उपलब्ध नहीं है; Engine initialization की प्रतीक्षा है।";
      row.appendChild(unavailable);
      return row;
    }

    const sourceMatches = analysis.originalText === entry.speechSourceText &&
      analysis.originalTextPreserved === true;
    const statusLabels = {
      complete: "सीमित orthographic mapping पूरी",
      "context-sensitive": "संदर्भ-संवेदनशील ध्वनि — वास्तविक रूप संदर्भ पर निर्भर",
      "needs-context": "अतिरिक्त पाठ/शाखा संदर्भ आवश्यक",
      partial: "आंशिक विश्लेषण — कुछ अक्षर/चिह्न समर्थित नहीं"
    };
    const status = doc.createElement("p");
    status.className = "tts-preview-meta";
    status.textContent = "स्थिति: " + (statusLabels[analysis.status] || "अज्ञात") +
      " (" + String(analysis.status || "unknown") + ")" +
      " · ध्वनि-टोकन: " + (Number(analysis.phonemeCount) || 0) +
      " · स्वर-केंद्र: " + (Array.isArray(analysis.vowelNuclei) ? analysis.vowelNuclei.length : 0);
    row.appendChild(status);

    const source = doc.createElement("p");
    source.className = "tts-preview-original";
    source.textContent = "G2P का मूल इनपुट: " + String(analysis.originalText || "");
    row.appendChild(source);

    const transliteration = doc.createElement("p");
    transliteration.className = "tts-preview-compiled";
    transliteration.textContent = "व्यापक ध्वन्यात्मक लिप्यंतरण (IAST-जैसा; IPA नहीं): " +
      (sourceMatches && typeof analysis.phonemicTransliteration === "string"
        ? analysis.phonemicTransliteration
        : "पूर्ण परिणाम उपलब्ध नहीं — संदर्भ/असमर्थित चिह्न की जाँच आवश्यक।");
    row.appendChild(transliteration);

    const sequence = Array.isArray(analysis.phonemeSequence) ? analysis.phonemeSequence : [];
    if (sequence.length) {
      const sequenceNode = doc.createElement("p");
      sequenceNode.className = "tts-preview-meta";
      sequenceNode.textContent = "ध्वनि-टोकन क्रम: " + sequence.map(token => {
        if (token && typeof token.symbol === "string" && token.symbol) return token.symbol;
        if (token && token.type === "vowel-nasalization") return "[स्वर-नासिक्य]";
        if (token && token.type === "elision-marker") return "ऽ";
        return "[" + String(token && token.type || "अचिह्नित") + "]";
      }).join(" · ");
      row.appendChild(sequenceNode);
    }

    const rules = Array.isArray(analysis.rulesApplied) ? analysis.rulesApplied : [];
    if (rules.length) {
      const ruleNode = doc.createElement("p");
      ruleNode.className = "tts-preview-meta";
      ruleNode.textContent = "लागू orthographic नियम: " + rules.join(" · ");
      row.appendChild(ruleNode);
    }

    const speech = doc.createElement("p");
    speech.className = "tts-preview-compiled";
    speech.textContent = "Native TTS के लिए तैयार वाचन-पाठ: " +
      (sourceMatches ? String(entry.speechText || entry.speechSourceText) : String(entry.speechSourceText));
    row.appendChild(speech);

    const separation = doc.createElement("p");
    separation.className = sourceMatches ? "note" : "status warn";
    separation.textContent = sourceMatches
      ? "स्रोत-पाठ सुरक्षित है। G2P का transliteration केवल विश्लेषण metadata है; Native TTS को ऊपर अलग वाचन-पाठ दिया जाता है। केवल अलग से Compiler द्वारा अधिकृत परिवर्तन ही वाचन-पाठ बदल सकता है।"
      : "G2P स्रोत-मिलान विफल हुआ। इस विश्लेषण पर भरोसा नहीं किया गया और Native TTS के लिए मूल पाठ सुरक्षित रखा गया।";
    row.appendChild(separation);

    const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
    warnings.slice(0, 8).forEach(warning => {
      const warningNode = doc.createElement("p");
      warningNode.className = "status warn";
      warningNode.textContent = (warning && warning.code ? warning.code + ": " : "") +
        String(warning && warning.message || "G2P संदर्भ/उच्चारण चेतावनी।");
      row.appendChild(warningNode);
    });
    if (warnings.length > 8) {
      const more = doc.createElement("p");
      more.className = "tts-preview-meta";
      more.textContent = "अतिरिक्त चेतावनियाँ: " + (warnings.length - 8);
      row.appendChild(more);
    }
    if (entry.g2pFailure) {
      const failure = doc.createElement("p");
      failure.className = "status warn";
      failure.textContent = "G2P त्रुटि: " + entry.g2pFailure + "। मूल पाठ सुरक्षित है।";
      row.appendChild(failure);
    }
    return row;
  }

  function renderG2PPreview() {
    if (state.destroyed) return;
    g2pPreviewList.replaceChildren();
    if (!state.previewEntries.length) {
      g2pPreviewSummary.className = "status";
      g2pPreviewSummary.textContent = "पाठ दर्ज करने पर G2P ध्वनि-विश्लेषण दिखाई देगा।";
      const empty = doc.createElement("p");
      empty.className = "note";
      empty.textContent = "अभी कोई संस्कृत पंक्ति उपलब्ध नहीं है।";
      g2pPreviewList.appendChild(empty);
      return;
    }

    const counts = { complete: 0, contextSensitive: 0, needsContext: 0, partial: 0, unavailable: 0 };
    state.previewEntries.forEach(entry => {
      const analysis = entry.g2pAnalysis;
      if (!analysis) { counts.unavailable += 1; return; }
      if (analysis.status === "complete") counts.complete += 1;
      else if (analysis.status === "context-sensitive") counts.contextSensitive += 1;
      else if (analysis.status === "needs-context") counts.needsContext += 1;
      else counts.partial += 1;
    });
    g2pPreviewSummary.className = "status" +
      (counts.needsContext || counts.partial || counts.unavailable ? " warn" : "");
    g2pPreviewSummary.textContent = state.previewEntries.length + " पंक्तियाँ · " +
      counts.complete + " mapping पूर्ण · " + counts.contextSensitive + " संदर्भ-संवेदनशील · " +
      counts.needsContext + " संदर्भ आवश्यक · " + counts.partial + " आंशिक · " +
      counts.unavailable + " अनुपलब्ध। यह ध्वनि-विश्लेषण है, ऑडियो/गायन नहीं।";
    state.previewEntries.forEach(entry => g2pPreviewList.appendChild(renderG2PPreviewEntry(entry)));
  }

  function renderSpeechPreview() {
    if (state.destroyed) return;
    const lines = ui.input.value.split(/\r?\n/u).filter(line => line.trim());
    const voice = chooseVoice(ui.input.value);
    renderNativeVoiceProfileDiagnostics(voice);
    state.previewEntries = lines.map((line, index) => previewEntryForLine(line.trim(), index, voice));
    previewList.replaceChildren();
    if (!state.previewEntries.length) {
      previewSummary.textContent = "पाठ दर्ज करने पर प्रत्येक पंक्ति का उच्चारण Preview दिखेगा।";
      const empty = doc.createElement("p");
      empty.className = "note";
      empty.textContent = "अभी कोई संस्कृत पंक्ति उपलब्ध नहीं है।";
      previewList.appendChild(empty);
      return;
    }
    const appliedCount = state.previewEntries.filter(entry => entry.applied).length;
    const ambiguousCount = state.previewEntries.filter(entry => entry.confidence === "ambiguous").length;
    const fallbackCount = state.previewEntries.filter(entry => entry.confidence === "fallback").length;
    const verifiedCount = state.previewEntries.filter(entry => entry.confidence === "verified").length;
    previewSummary.textContent = state.previewEntries.length + " पंक्तियाँ · " +
      appliedCount + " पर वास्तविक Lexicon परिवर्तन · " + verifiedCount + " Validated · " +
      ambiguousCount + " Ambiguous · " + fallbackCount + " मूल-पाठ Fallback। " +
      describePronunciationContext() + " · " +
      (voice ? "चयनित Voice: " + voice.name : "स्थानीय Voice चयन उपलब्ध नहीं।");
    state.previewEntries.forEach(entry => previewList.appendChild(renderPreviewEntry(entry)));
    renderG2PPreview();
  }

  function getSelectedRate() {
    const value = Number(ui.rate.value);
    return Number.isFinite(value) ? Math.min(1.25, Math.max(0.65, value)) : 1.00;
  }

  function getSelectedPitch() {
    const value = Number(pitchInput.value);
    return Number.isFinite(value) ? Math.min(1.30, Math.max(0.70, value)) : 1.00;
  }

  function renderCalibrationSummary() {
    const voice = chooseVoice(ui.input.value);
    const voiceLabel = voice
      ? String(voice.name || "स्थानीय Native Voice") + " (" + String(voice.lang || "locale अज्ञात") + ")"
      : "अभी कोई स्थानीय Voice चयनित नहीं";
    calibrationSummary.textContent = "Voice: " + voiceLabel +
      " · Rate: " + getSelectedRate().toFixed(2) +
      "× · Pitch: " + getSelectedPitch().toFixed(2) +
      " · ये मान अगले वाचन पर लागू होंगे।";
  }

  function setCalibrationControlsDisabled(disabled) {
    ui.rate.disabled = Boolean(disabled);
    pitchInput.disabled = Boolean(disabled);
    calibrationResetButton.disabled = Boolean(disabled);
    calibrationSampleButton.disabled = Boolean(disabled) || !state.engineReady ||
      !state.voiceEntries.length || state.destroyed;
  }

  function onPitchInput() {
    const value = getSelectedPitch();
    pitchValue.textContent = value.toFixed(2);
    pitchInput.setAttribute("aria-valuetext",
      value.toFixed(2) + (value === 1 ? " — platform default" : ""));
    renderCalibrationSummary();
  }

  function resetCalibration() {
    if (state.active || state.calibrationTesting || state.destroyed) return;
    ui.rate.value = "1.00";
    pitchInput.value = "1.00";
    onRateInput();
    onPitchInput();
    setStatus("Native Voice Calibration मान platform default 1.00 / 1.00 पर रीसेट किए गए।");
  }

  async function testVoiceCalibration() {
    if (state.destroyed || state.active || state.calibrationTesting || !state.engineReady) return;
    const inputLine = ui.input.value.split(/\r?\n/u).map(line => line.trim()).find(Boolean) || "ॐ नमः शिवाय।";
    const sourceText = stripTerminalVerseNumber(inputLine).text.trim() || "ॐ नमः शिवाय।";
    const voice = chooseVoice(sourceText);
    if (!voice || voice.localService !== true) {
      setStatus("नमूना सुनाने के लिए कोई स्थानीय Voice उपलब्ध नहीं है।", true);
      return;
    }

    state.calibrationTesting = true;
    updateButtons();
    setStatus("चुनी हुई स्थानीय Voice पर पहला पाठ-नमूना चल रहा है: " + voice.name +
      " · Rate " + getSelectedRate().toFixed(2) +
      "× · Pitch " + getSelectedPitch().toFixed(2) + "।");
    try {
      const context = getPronunciationContext();
      const result = await engine.speak(sourceText, {
        voice,
        voiceProfile: nativeVoiceProfile(voice),
        pronunciation: {
          ...context,
          context,
          shakha: context.shakha || null,
          patha: context.patha || null
        },
        lang: voice.lang || (isDevanagari(sourceText) ? "hi-IN" : "en-IN"),
        rate: getSelectedRate(),
        pitch: getSelectedPitch(),
        volume: 1,
        replace: false
      });
      if (!state.destroyed && state.calibrationTesting) {
        setStatus(result && result.status === "cancelled"
          ? "आवाज़ का नमूना रोक दिया गया।"
          : "आवाज़ का नमूना पूरा हुआ। Rate/Pitch बदलकर फिर सुनें और अपनी पसंद का मान चुनें।");
      }
    } catch (error) {
      if (!state.destroyed) {
        setStatus("आवाज़ का नमूना चल नहीं सका: " +
          (error && error.message ? error.message : "अज्ञात TTS त्रुटि"), true);
      }
    } finally {
      state.calibrationTesting = false;
      if (!state.destroyed) updateButtons();
    }
  }

  function updateButtons() {
    const canSpeak = state.engineReady && state.voiceEntries.length > 0 && !state.destroyed;
    ui.speak.disabled = state.active || state.calibrationTesting || !canSpeak;
    ui.pause.disabled = !state.active || state.calibrationTesting || state.userPaused || state.navigationPaused;
    ui.resume.disabled = !state.active || state.calibrationTesting || (!state.userPaused && !state.navigationPaused);
    ui.stop.disabled = !state.active && !state.calibrationTesting;
    contextShakha.disabled = state.active || state.calibrationTesting || state.destroyed;
    contextPatha.disabled = state.active || state.calibrationTesting || state.destroyed;
    setCalibrationControlsDisabled(state.active || state.calibrationTesting || state.destroyed);
  }

  function clearNextTimer() {
    if (state.timer !== null) {
      win.clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function finish(message, warning = false) {
    clearNextTimer();
    state.active = false;
    state.speechInFlight = false;
    state.userPaused = false;
    state.navigationPaused = false;
    state.waitingForNext = false;
    state.currentSpeech = null;
    state.readingContext = null;
    state.lines = [];
    state.index = 0;
    setLine("");
    setStatus(message, warning);
    updateButtons();
  }

  function scheduleNext(generation) {
    clearNextTimer();
    state.timer = win.setTimeout(() => {
      state.timer = null;
      if (generation !== state.generation || !state.active || state.destroyed) return;
      if (state.navigationPaused || state.userPaused) {
        state.waitingForNext = true;
        return;
      }
      void speakNext(generation);
    }, 100);
  }

  async function speakNext(generation) {
    if (generation !== state.generation || !state.active || state.destroyed) return;
    if (state.navigationPaused || state.userPaused) { state.waitingForNext = true; return; }
    if (state.index >= state.lines.length) {
      finish("सभी " + state.lines.length + " पंक्तियों का पाठ पूरा हो गया।");
      return;
    }
    if (!state.engineReady) { finish("TTS Engine अभी तैयार नहीं है।", true); return; }
    const line = state.lines[state.index];
    const numbered = stripTerminalVerseNumber(line);
    const speechSourceText = numbered.text.trim();
    const voice = chooseVoice(line);
    if (!speechSourceText) {
      state.index += 1;
      scheduleNext(generation);
      return;
    }
    if (!voice || voice.localService !== true) {
      finish("इस पंक्ति के लिए कोई उपलब्ध स्थानीय Hindi/Sanskrit Voice चयनित नहीं है। Android TTS settings जाँचें।", true);
      return;
    }

    let lineAnalysis = null;
    try { lineAnalysis = engine.analyzeText(speechSourceText); }
    catch (error) { setStatus("पाठ विश्लेषण उपलब्ध नहीं; Engine का सुरक्षित मूल-पाठ Fallback जारी रहेगा। " + (error && error.message ? error.message : ""), true); }
    const rate = getSelectedRate();
    const pitch = getSelectedPitch();
    const pronunciationContext = state.readingContext || getPronunciationContext();
    setLine(line);
    setStatus("पंक्ति " + (state.index + 1) + " / " + state.lines.length + " पढ़ने की तैयारी: " + voice.name +
      " (स्थानीय Native Voice)" + (numbered.removed ? " · अंतिम श्लोक-संख्या वाचन से छोड़ी गई।" : "") +
      (lineAnalysis ? " · " + summarizeAnalysis(lineAnalysis) : ""),
      Boolean(lineAnalysis && (lineAnalysis.needsBranchContext || (lineAnalysis.unclassifiedMarks && lineAnalysis.unclassifiedMarks.length))));
    state.currentSpeech = { generation, index: state.index, sourceText: speechSourceText, voice,
      analysis: lineAnalysis, context: pronunciationContext };
    state.speechInFlight = true;
    updateButtons();
    try {
      const result = await engine.speak(speechSourceText, {
        voice, voiceProfile: nativeVoiceProfile(voice),
        pronunciation: { ...pronunciationContext, context: pronunciationContext,
          shakha: pronunciationContext.shakha || null, patha: pronunciationContext.patha || null },
        lang: voice.lang || (isDevanagari(line) ? "hi-IN" : "en-IN"),
        rate, pitch, volume: 1, replace: false
      });
      if (generation !== state.generation || !state.active || state.destroyed) return;
      state.speechInFlight = false;
      state.currentSpeech = null;
      if (result && result.status === "cancelled") { finish("वाचन रद्द हो गया।", true); return; }
      state.index += 1;
      if (state.navigationPaused || state.userPaused) {
        state.waitingForNext = true;
        updateButtons();
      } else scheduleNext(generation);
    } catch (error) {
      if (generation !== state.generation || state.destroyed) return;
      state.speechInFlight = false;
      state.currentSpeech = null;
      finish("पंक्ति " + (state.index + 1) + " पढ़ते समय TTS त्रुटि: " +
        (error && error.message ? error.message : "अज्ञात TTS त्रुटि"), true);
    }
  }

  async function startReading() {
    if (state.calibrationTesting) {
      setStatus("पहले आवाज़ का नमूना पूरा होने दें या “समाप्त करें” दबाकर उसे रोकें।", true);
      return;
    }
    if (!state.engineReady) {
      setStatus("Native TTS Engine उपलब्ध नहीं है। Browser और Android TTS सुविधा जाँचें।", true);
      return;
    }
    if (!state.voiceEntries.length) {
      setStatus("कोई उपलब्ध स्थानीय Hindi/Sanskrit Voice नहीं मिली। Android की Text-to-Speech settings में स्थानीय Voice install/enable करें।", true);
      return;
    }
    const lines = ui.input.value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      setStatus("पहले पाठ लिखें। प्रत्येक नई पंक्ति क्रम से पढ़ी जाएगी।", true);
      ui.input.focus();
      return;
    }
    try { engine.analyzeText(lines.join("\n")); }
    catch (error) {
      setStatus("Analyzer उपलब्ध नहीं; Native TTS के लिए मूल पाठ सुरक्षित Fallback रहेगा। " +
        (error && error.message ? error.message : ""), true);
    }

    state.generation += 1;
    const generation = state.generation;
    clearNextTimer();
    state.active = false;
    state.speechInFlight = false;
    state.currentSpeech = null;
    updateButtons();
    try {
      await engine.cancel();
    } catch (error) {
      finish("पिछला वाचन सुरक्षित रूप से रोक नहीं सका: " +
        (error && error.message ? error.message : "TTS त्रुटि"), true);
      return;
    }
    if (generation !== state.generation || state.destroyed) return;

    state.lines = lines;
    state.index = 0;
    state.readingContext = getPronunciationContext();
    state.active = true;
    state.userPaused = false;
    state.navigationPaused = false;
    state.waitingForNext = false;
    updateButtons();
    void speakNext(generation);
  }

  async function pauseReading() {
    if (!state.active || state.userPaused || state.navigationPaused) return;
    state.userPaused = true;
    if (state.timer !== null) {
      clearNextTimer();
      state.waitingForNext = true;
    }
    if (state.speechInFlight) {
      const paused = await engine.pause();
      if (!paused && state.active && state.speechInFlight) {
        state.userPaused = false;
        setStatus("इस समय Native TTS को Pause नहीं कर सका।", true);
        updateButtons();
        return;
      }
    }
    setStatus("पाठ रोक दिया गया है। जारी रखने के लिए “फिर शुरू करें” दबाएँ।");
    updateButtons();
  }

  async function resumeReading() {
    if (!state.active || (!state.userPaused && !state.navigationPaused)) return;
    const wasSpeechInFlight = state.speechInFlight;
    state.userPaused = false;
    state.navigationPaused = false;
    if (state.waitingForNext) {
      state.waitingForNext = false;
      setStatus("पाठ फिर से जारी है।");
      updateButtons();
      await speakNext(state.generation);
      return;
    }
    if (wasSpeechInFlight) {
      const resumed = await engine.resume();
      if (!resumed && state.active && state.speechInFlight) {
        state.userPaused = true;
        setStatus("Native TTS वाचन को फिर शुरू नहीं कर सका।", true);
        updateButtons();
        return;
      }
    }
    setStatus("पाठ फिर से जारी है।");
    updateButtons();
  }

  async function stopReading() {
    if (state.calibrationTesting && !state.active) {
      state.calibrationTesting = false;
      try {
        await engine.cancel();
        setStatus("आवाज़ का नमूना समाप्त कर दिया गया।");
      } catch (error) {
        setStatus("नमूना रोकते समय त्रुटि: " +
          (error && error.message ? error.message : "अज्ञात TTS त्रुटि"), true);
      } finally {
        if (!state.destroyed) updateButtons();
      }
      return;
    }
    state.generation += 1;
    clearNextTimer();
    finish("पाठ समाप्त कर दिया गया।");
    try {
      await engine.cancel();
    } catch (error) {
      setStatus("वाचन समाप्त हुआ, लेकिन Backend ने Cancel त्रुटि दी: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  function onRateInput() {
    const value = getSelectedRate();
    ui.rateValue.textContent = value.toFixed(2) + "×";
    ui.rate.setAttribute("aria-valuetext", value.toFixed(2) + "×");
    renderCalibrationSummary();
  }

  function onPronunciationContextChange() {
    if (state.destroyed || state.active) return;
    renderSpeechPreview();
    setStatus("Pronunciation Preview नए संदर्भ के अनुसार पुनः तैयार किया गया: " +
      describePronunciationContext() + "।");
  }
  function onVoiceChange() {
    const voice = chooseVoice(ui.input.value);
    renderSpeechPreview();
    if (!voice) {
      setStatus("कोई उपयुक्त स्थानीय Voice उपलब्ध नहीं है। Preview मूल पाठ Fallback दिखाएगा।", true);
      return;
    }
    const gender = voiceGenderHint(voice);
    const note = gender === "female"
      ? "संभावित स्त्री-स्वर चुना गया; नाम-आधारित पहचान की पुष्टि वास्तविक श्रवण से करनी होगी: "
      : "स्थानीय Voice चुनी गई: ";
    setStatus(note + voice.name + " (" + voice.lang + ")। Voice बदलने पर Pronunciation Preview पुनः तैयार किया गया है।");
    renderCalibrationSummary();
  }

  async function refreshVoices() {
    const request = ++state.voiceRefreshSequence;
    const previousKey = ui.voice.value;
    try {
      let voices = [];
      const retryDelays = [0, 140, 320, 620];
      for (const delay of retryDelays) {
        if (delay) await new Promise(resolve => win.setTimeout(resolve, delay));
        if (state.destroyed || request !== state.voiceRefreshSequence) return;
        voices = await engine.getVoices({ backendId: "native" });
        if (Array.isArray(voices) && voices.some(voice => voice && voice.localService === true)) break;
      }
      if (state.destroyed || request !== state.voiceRefreshSequence) return;
      state.voices = (Array.isArray(voices) ? voices : []).filter(voice => voice && voice.localService === true);
      state.voiceEntries = createVoiceEntries(state.voices);
      ui.voice.replaceChildren();

      const autoOption = doc.createElement("option");
      autoOption.value = "auto";
      autoOption.textContent = "स्वचालित — स्थानीय उपयुक्त Voice और संभावित स्त्री-स्वर को प्राथमिकता";
      ui.voice.appendChild(autoOption);

      state.voiceEntries.forEach(entry => {
        const voice = entry.voice;
        const gender = voiceGenderHint(voice);
        const genderText = gender === "female" ? " · संभावित स्त्री-स्वर" :
          gender === "male" ? " · पुरुष-स्वर नाम" : "";
        const option = doc.createElement("option");
        option.value = entry.key;
        option.textContent = String(voice.name || "स्थानीय Voice") + " (" +
          String(voice.lang || "भाषा अज्ञात") + ")" + genderText + " · डिवाइस";
        ui.voice.appendChild(option);
      });

      const previousStillExists = previousKey && previousKey !== "auto" &&
        state.voiceEntries.some(entry => entry.key === previousKey);
      ui.voice.value = previousStillExists ? previousKey : "auto";
      updateButtons();
      renderSpeechPreview();
      renderCalibrationSummary();

      if (!state.engineReady) return;
      if (!state.voiceEntries.length) {
        setStatus("Speech Synthesis उपलब्ध है, लेकिन कोई स्थानीय Hindi/Sanskrit Voice सूचीबद्ध नहीं हुई। Android TTS settings में Voice install/enable करें।", true);
        return;
      }
      const selected = chooseVoice(ui.input.value);
      const knowledgeNote = " " + pronunciationReadyText();
      if (selected && voiceGenderHint(selected) === "female") {
        setStatus("संभावित स्त्री-स्वर वाली स्थानीय Voice उपलब्ध है: " + selected.name +
          "। वास्तविक मधुरता और उच्चारण का श्रवण परीक्षण आवश्यक है।" + knowledgeNote);
      } else {
        setStatus(state.voiceEntries.length + " स्थानीय Speech Voices उपलब्ध हैं। नाम से स्पष्ट स्त्री-स्वर की पहचान नहीं हुई; स्वचालित चयन भाषा और उपलब्धता पर आधारित है।" + knowledgeNote, true);
      }
    } catch (error) {
      if (state.destroyed || request !== state.voiceRefreshSequence) return;
      state.voices = [];
      state.voiceEntries = [];
      updateButtons();
      renderSpeechPreview();
      renderCalibrationSummary();
      setStatus("स्थानीय Voice सूची प्राप्त नहीं हुई: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  async function onHide() {
    if (state.destroyed) return;
    if (state.calibrationTesting) {
      state.calibrationTesting = false;
      try { await engine.cancel(); } catch (_) {}
      updateButtons();
      setStatus("दूसरे पेज पर जाने के कारण आवाज़ का नमूना रोक दिया गया।");
      return;
    }
    if (!state.active || state.userPaused || state.navigationPaused) return;
    state.navigationPaused = true;
    if (state.timer !== null) { clearNextTimer(); state.waitingForNext = true; }
    if (state.speechInFlight) {
      const paused = await engine.pause();
      if (!paused && state.speechInFlight) {
        setStatus("दूसरे पेज पर जाने पर Native TTS Pause नहीं हो सका। वापस आने पर वाचन की स्थिति जाँचें।", true);
        updateButtons();
        return;
      }
    }
    setStatus("दूसरे पेज पर जाने के कारण TTS अस्थायी रूप से रुका है। वापस आने पर जारी किया जा सकता है।");
    updateButtons();
  }

  async function onShow() {
    if (state.destroyed) return;
    await refreshKnowledgeFromCache("TTS पेज पर वापसी");
    if (state.destroyed) return;
    renderSpeechPreview();
    if (!state.active || !state.navigationPaused) return;
    state.navigationPaused = false;
    if (state.waitingForNext) {
      state.waitingForNext = false;
      setStatus("TTS पेज फिर खुला है; पाठ जारी है।");
      updateButtons();
      await speakNext(state.generation);
      return;
    }
    if (state.speechInFlight) {
      const resumed = await engine.resume();
      if (!resumed && state.speechInFlight) {
        state.navigationPaused = true;
        setStatus("TTS पेज खुला है, लेकिन Native TTS फिर शुरू नहीं हुआ। “फिर शुरू करें” दबाएँ।", true);
        updateButtons();
        return;
      }
    }
    setStatus("TTS पेज फिर खुला है; पाठ जारी है।");
    updateButtons();
  }

  async function unmount() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.generation += 1;
    state.voiceRefreshSequence += 1;
    state.knowledgeRefreshSequence += 1;
    clearNextTimer();
    state.active = false;
    state.speechInFlight = false;
    ui.speak.removeEventListener("click", startReading);
    ui.pause.removeEventListener("click", pauseReading);
    ui.resume.removeEventListener("click", resumeReading);
    ui.stop.removeEventListener("click", stopReading);
    ui.rate.removeEventListener("input", onRateInput);
    pitchInput.removeEventListener("input", onPitchInput);
    calibrationResetButton.removeEventListener("click", resetCalibration);
    calibrationSampleButton.removeEventListener("click", testVoiceCalibration);
    ui.voice.removeEventListener("change", onVoiceChange);
    ui.input.removeEventListener("input", onTextInput);
    contextShakha.removeEventListener("change", onPronunciationContextChange);
    contextPatha.removeEventListener("change", onPronunciationContextChange);

    if (typeof state.unsubscribeVoices === "function") state.unsubscribeVoices();
    if (typeof state.unsubscribePronunciationWarning === "function") state.unsubscribePronunciationWarning();
    if (typeof state.unsubscribeSpeechPreparation === "function") state.unsubscribeSpeechPreparation();
    if (typeof state.unsubscribeKnowledgeChange === "function") state.unsubscribeKnowledgeChange();
    if (typeof state.unsubscribeKnowledgeError === "function") state.unsubscribeKnowledgeError();
    if (typeof state.unsubscribeKnowledgeWarning === "function") state.unsubscribeKnowledgeWarning();
    state.unsubscribeVoices = null;
    state.unsubscribePronunciationWarning = null;
    state.unsubscribeSpeechPreparation = null;
    state.unsubscribeKnowledgeChange = null;
    state.unsubscribeKnowledgeError = null;
    state.unsubscribeKnowledgeWarning = null;
    if (knowledgeStatus.parentNode) knowledgeStatus.parentNode.removeChild(knowledgeStatus);
    if (pronunciationPreview.parentNode) pronunciationPreview.parentNode.removeChild(pronunciationPreview);
    if (pronunciationContextPanel.parentNode) pronunciationContextPanel.parentNode.removeChild(pronunciationContextPanel);
    if (g2pPreviewPanel.parentNode) g2pPreviewPanel.parentNode.removeChild(g2pPreviewPanel);
    if (calibrationPanel.parentNode) calibrationPanel.parentNode.removeChild(calibrationPanel);
    if (voiceProfileDiagnosticsPanel.parentNode) voiceProfileDiagnosticsPanel.parentNode.removeChild(voiceProfileDiagnosticsPanel);
    setLine("");
    updateButtons();
    try { await engine.dispose(); }
    catch (error) {
      if (win.console && typeof win.console.error === "function") {
        win.console.error("[Swar-Sadhika TTS] Engine cleanup failed", error);
      }
    }
  }

  ui.speak.addEventListener("click", startReading);
  ui.pause.addEventListener("click", pauseReading);
  ui.resume.addEventListener("click", resumeReading);
  ui.stop.addEventListener("click", stopReading);
  ui.rate.addEventListener("input", onRateInput);
  pitchInput.addEventListener("input", onPitchInput);
  calibrationResetButton.addEventListener("click", resetCalibration);
  calibrationSampleButton.addEventListener("click", testVoiceCalibration);
  ui.voice.addEventListener("change", onVoiceChange);
  ui.input.addEventListener("input", onTextInput);
  contextShakha.addEventListener("change", onPronunciationContextChange);
  contextPatha.addEventListener("change", onPronunciationContextChange);
  onRateInput();
  onPitchInput();
  renderCalibrationSummary();
  updateButtons();

  state.unsubscribeVoices = engine.on("voiceschanged", () => {
    void refreshVoices();
  });
  state.unsubscribePronunciationWarning = engine.on("pronunciationwarning", detail => {
    if (state.destroyed || !state.active) return;
    const reasons = Array.isArray(detail && detail.reasons) ? detail.reasons.join(" ") : "";
    setStatus(
      "उच्चारण चेतावनी: " +
        (detail && detail.message ? detail.message : "विशेष चिह्नों की ध्वनि की पुष्टि आवश्यक है।") +
        (reasons ? " " + reasons : ""),
      true
    );
  });
  state.unsubscribeSpeechPreparation = engine.on("speechpreparationdiagnostics", detail => {
    const current = state.currentSpeech;
    if (!current || state.destroyed || !state.active || current.generation !== state.generation ||
        current.index !== state.index || !detail || detail.originalText !== current.sourceText) return;
    const valid = Boolean(detail.validation && detail.validation.valid === true &&
      typeof detail.speechText === "string" && detail.speechText.trim());
    const speechText = valid ? detail.speechText : current.sourceText;
    const rules = Array.isArray(detail.appliedRules) ? detail.appliedRules : [];
    const warnings = Array.isArray(detail.fallbackRules) ? detail.fallbackRules : [];
    const diagnostics = detail.diagnostics || {};
    const confidence = valid && diagnostics.compilerConfidence ? diagnostics.compilerConfidence : "fallback";
    const applied = valid && detail.knowledgeAppliedToSpeech === true && rules.length > 0 && speechText !== current.sourceText;
    const entry = state.previewEntries.find(item => item && item.index === current.index && item.speechSourceText === current.sourceText);
    if (entry) {
      entry.validated = valid; entry.speechText = speechText; entry.confidence = confidence;
      entry.applied = applied; entry.rules = rules; entry.warnings = warnings;
      entry.status = applied ? "Validated Lexicon Rule लागू" :
        confidence === "ambiguous" ? "Ambiguous — मूल पाठ सुरक्षित" :
        confidence === "verified" ? "Validated — मूल पाठ यथावत" : "Fallback — मूल पाठ सुरक्षित";
      if (detail.g2pAnalysis && detail.g2pAnalysis.originalText === current.sourceText &&
          detail.g2pAnalysis.originalTextPreserved === true) {
        entry.g2pAnalysis = detail.g2pAnalysis;
        entry.g2pDiagnostics = detail.g2pDiagnostics || entry.g2pDiagnostics;
      }
      const row = previewList.querySelector('[data-line-index="' + current.index + '"]');
      if (row) row.replaceWith(renderPreviewEntry(entry));
      renderG2PPreview();
    }
    const compilerNotice = applied ? " · " + rules.length + " सत्यापित Lexicon नियम लागू।" : " · " + confidence + " — मूल पाठ सुरक्षित।";
    const specialNotice = current.analysis && (current.analysis.needsBranchContext ||
      (current.analysis.accentMarks && current.analysis.accentMarks.length) ||
      current.analysis.hasVedicExtensions || current.analysis.hasSamavedaExtended)
      ? " · वैदिक/विशेष चिह्न पहचाने गए; Native Voice पर शुद्ध स्वराघात प्रमाणित नहीं है।" : "";
    setStatus("पंक्ति " + (current.index + 1) + " / " + state.lines.length + " पढ़ी जा रही है: " +
      (current.voice && current.voice.name || "स्थानीय Native Voice") + compilerNotice + specialNotice +
      (current.analysis ? " · " + summarizeAnalysis(current.analysis) : ""),
      confidence === "ambiguous" || warnings.length > 0);
  });
  state.unsubscribeKnowledgeChange = engine.on("knowledgechange", detail => {
    if (!state.destroyed) {
      renderKnowledgeStatus(detail);
      renderSpeechPreview();
    }
  });
  state.unsubscribeKnowledgeError = engine.on("knowledgeerror", detail => {
    if (state.destroyed) return;
    const code = detail && detail.code ? " · " + detail.code : "";
    const message = detail && detail.message ? detail.message : "Knowledge Load विफल हुआ।";
    setKnowledgeStatus("Knowledge Load त्रुटि: " + message + code, true);
  });
  state.unsubscribeKnowledgeWarning = engine.on("knowledgewarning", detail => {
    if (state.destroyed) return;
    const message = detail && detail.message ? detail.message : "स्थानीय Knowledge Cache उपलब्ध नहीं है।";
    setKnowledgeStatus("Knowledge चेतावनी: " + message, true);
  });

  try {
    const initialized = await engine.initialize({ backendId: "native" });
    if (state.destroyed) {
      await engine.dispose();
      return Object.freeze({ onShow, onHide, unmount });
    }
    state.engineReady = Boolean(initialized && initialized.ready);
    try {
      state.pronunciationInfo = engine.getPronunciationKnowledgeBaseInfo();
      state.pronunciationReady = Boolean(
        state.pronunciationInfo && state.pronunciationInfo.available &&
        state.pronunciationInfo.selfTest && state.pronunciationInfo.selfTest.status === "PASSED" &&
        state.pronunciationInfo.selfTest.failed === 0 &&
        (!state.pronunciationInfo.compilerSelfTest || state.pronunciationInfo.compilerSelfTest.status === "PASSED") &&
        (!state.pronunciationInfo.g2pSelfTest || state.pronunciationInfo.g2pSelfTest.status === "PASSED")
      );
    } catch (error) {
      state.pronunciationInfo = null;
      state.pronunciationReady = false;
      setStatus("Pronunciation Analyzer/Compiler diagnostics उपलब्ध नहीं; सामान्य Native TTS मूल-पाठ Fallback जारी रखेगा। " +
        (error && error.message ? error.message : ""), true);
    }
    await refreshKnowledgeFromCache("प्रारंभिक Knowledge जाँच");
    if (state.destroyed) {
      await engine.dispose();
      return Object.freeze({ onShow, onHide, unmount });
    }
    if (!state.engineReady) {
      setStatus("इस ब्राउज़र में Native Speech Synthesis उपलब्ध नहीं है। Android Chrome और installed local TTS voice की जाँच करें।", true);
      updateButtons();
    } else {
      await refreshVoices();
      if (ui.input.value.trim()) analyzeCurrentText();
      else renderSpeechPreview();
      if (!state.pronunciationReady) {
        setStatus("Analyzer/Compiler Self-Test सफल नहीं है। सुरक्षित रूप से मूल-पाठ Native TTS उपलब्ध रहेगा; Lexicon परिवर्तन लागू नहीं होंगे।", true);
      }
    }
  } catch (error) {
    if (!state.destroyed) {
      state.engineReady = false;
      setStatus("TTS Engine initialize नहीं हो सका: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
      updateButtons();
      await refreshKnowledgeFromCache("TTS Initialize विफल होने के बाद Knowledge जाँच");
    }
  }

  return Object.freeze({ onShow, onHide, unmount });
}
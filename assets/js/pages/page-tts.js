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

  const engine = createTtsEngine({ target: win, defaultBackend: "native" });
  const state = {
    voices: [],
    voiceEntries: [],
    generation: 0,
    lines: [],
    index: 0,
    active: false,
    speechInFlight: false,
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
    const documentStates = Array.isArray(diagnostics.documentStates) ? diagnostics.documentStates : [];
    const failedDocuments = documentStates.filter(item => item && item.status === "error").length;
    const partial = diagnostics.status === "PARTIAL" || diagnostics.status === "FAILED" || failedDocuments > 0;
    const lexiconText = diagnostics.hasPronunciationLexicon ? "Pronunciation Lexicon " + candidateCount + " Candidates" : "Pronunciation Lexicon अनुपलब्ध";
    const message = "स्थानीय Knowledge Index सक्रिय: " + documentCount + " JSON दस्तावेज़ · " +
      guidanceCount + " Guidance Entries · " + uniqueTermCount + " विशिष्ट शब्द · " +
      lexiconText + " · " + readyCount + " Compiler-ready Rules। " +
      (partial ? failedDocuments + " दस्तावेज़ों की Sync जाँच लंबित/विफल; उपलब्ध Index सुरक्षित है।" : "Manifest में पंजीकृत सभी सक्रिय JSON दस्तावेज़ पढ़े गए।") +
      " वाचन में केवल स्वतंत्र रूप से सत्यापित Voice-specific Rules लागू होंगे।";
    setKnowledgeStatus(message, partial || readyCount === 0);
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

  function nativeVoiceProfile(voice) {
    const userAgent = String(win.navigator && win.navigator.userAgent || "");
    const platform = /Android/i.test(userAgent) && /(?:Chrome|CriOS)\//i.test(userAgent)
      ? "Android Chrome" : "";
    return {
      engine: "Web Speech API SpeechSynthesis",
      platform,
      voiceName: String(voice && voice.name || ""),
      voiceURI: String(voice && voice.voiceURI || ""),
      locale: String(voice && voice.lang || "")
    };
  }

  function compilerOptionsForVoice(voice) {
    return { backendType: "native", voice, voiceProfile: nativeVoiceProfile(voice), context: Object.freeze({}) };
  }

  function previewEntryForLine(originalLine, index, voice) {
    const numbered = stripTerminalVerseNumber(originalLine);
    const speechSourceText = numbered.text.trim();
    let prepared = null, failure = null;
    if (speechSourceText && state.engineReady && voice) {
      try { prepared = engine.prepareSpeech(speechSourceText, compilerOptionsForVoice(voice)); }
      catch (error) { failure = error && error.message ? error.message : String(error); }
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
      numberRemoved: numbered.removed, failure
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

  function renderSpeechPreview() {
    if (state.destroyed) return;
    const lines = ui.input.value.split(/\r?\n/u).filter(line => line.trim());
    const voice = chooseVoice(ui.input.value);
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
      (voice ? "चयनित Voice: " + voice.name : "स्थानीय Voice चयन उपलब्ध नहीं।");
    state.previewEntries.forEach(entry => previewList.appendChild(renderPreviewEntry(entry)));
  }

  function updateButtons() {
    const canSpeak = state.engineReady && state.voiceEntries.length > 0 && !state.destroyed;
    ui.speak.disabled = state.active || !canSpeak;
    ui.pause.disabled = !state.active || state.userPaused || state.navigationPaused;
    ui.resume.disabled = !state.active || (!state.userPaused && !state.navigationPaused);
    ui.stop.disabled = !state.active;
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
    const rateValue = Number(ui.rate.value);
    const rate = Number.isFinite(rateValue) ? Math.min(1.15, Math.max(0.65, rateValue)) : 0.88;
    const pitch = voiceGenderHint(voice) === "female" ? 1.02 : 1.07;
    setLine(line);
    setStatus("पंक्ति " + (state.index + 1) + " / " + state.lines.length + " पढ़ने की तैयारी: " + voice.name +
      " (स्थानीय Native Voice)" + (numbered.removed ? " · अंतिम श्लोक-संख्या वाचन से छोड़ी गई।" : "") +
      (lineAnalysis ? " · " + summarizeAnalysis(lineAnalysis) : ""),
      Boolean(lineAnalysis && (lineAnalysis.needsBranchContext || (lineAnalysis.unclassifiedMarks && lineAnalysis.unclassifiedMarks.length))));
    state.currentSpeech = { generation, index: state.index, sourceText: speechSourceText, voice, analysis: lineAnalysis };
    state.speechInFlight = true;
    updateButtons();
    try {
      const result = await engine.speak(speechSourceText, {
        voice, voiceProfile: nativeVoiceProfile(voice),
        pronunciation: { context: Object.freeze({}) },
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
    const value = Number(ui.rate.value);
    ui.rateValue.textContent = (Number.isFinite(value) ? value : 0.88).toFixed(2) + "×";
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
      setStatus("स्थानीय Voice सूची प्राप्त नहीं हुई: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  async function onHide() {
    if (!state.active || state.userPaused || state.navigationPaused || state.destroyed) return;
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
    ui.voice.removeEventListener("change", onVoiceChange);
    ui.input.removeEventListener("input", onTextInput);

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
  ui.voice.addEventListener("change", onVoiceChange);
  ui.input.addEventListener("input", onTextInput);
  onRateInput();
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
      const row = previewList.querySelector('[data-line-index="' + current.index + '"]');
      if (row) row.replaceWith(renderPreviewEntry(entry));
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
        (!state.pronunciationInfo.compilerSelfTest || state.pronunciationInfo.compilerSelfTest.status === "PASSED")
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
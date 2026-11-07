/* Swar-Sadhika — TTS page module.
 * UI and line sequencing live here; pronunciation analysis and speech backends
 * are owned by tts-engine.js and its local Vedic pronunciation knowledge base.
 * Current speech backend: local Native Speech Synthesis only.
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
    line: byId("rainbow-line"),
    layaToggle: null,
    layaStatus: null
  };

  const missing = Object.entries(ui)
    .filter(([key, value]) => !value && !["overlay", "line", "layaToggle", "layaStatus"].includes(key))
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
    unsubscribePronunciationAnalysis: null,
    unsubscribePronunciationWarning: null,
    unsubscribeKnowledgeChange: null,
    unsubscribeKnowledgeError: null,
    unsubscribeKnowledgeWarning: null,
    knowledgeRefreshSequence: 0,
    pronunciationReady: false,
    pronunciationInfo: null,
    lastAnalysis: null,
    lastPronunciationReport: null,
    layaReady: false,
    layaEngine: null,
    layaPlan: null,
    layaModeActive: false
  };

  // Optional Music Player integration. The independent module is loaded only
  // after the user opens it; a missing module must never affect ordinary TTS.
  let musicPlayerSection = null;
  let musicPlayerButton = null;
  let musicPlayerStatus = null;
  let musicPlayerRoot = null;
  let musicPlayerInstance = null;
  let musicPlayerLoadPromise = null;
  let pageVisible = true;
  let layaLoadPromise = null;
  let layaSection = null;
  const musicPlayerSubscribers = new Set();
  const MUSIC_PLAYER_HOST_CONTRACT_VERSION = 2;

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
      setKnowledgeStatus(
        "स्थानीय Knowledge Cache में अभी सक्रिय दस्तावेज़ उपलब्ध नहीं हैं। Nano Server पेज में JSON दस्तावेज़ डाउनलोड करें।",
        true
      );
      return;
    }
    const documentCount = Number(diagnostics.loadedDocuments) || 0;
    const entryCount = Number(diagnostics.loadedEntries) || 0;
    const uniqueTermCount = Number(diagnostics.uniqueTerms) || 0;
    setKnowledgeStatus(
      "स्थानीय Knowledge Index सक्रिय: " + documentCount + " JSON दस्तावेज़ · " +
        entryCount + " Entries · " + uniqueTermCount + " विशिष्ट शब्द। TTS Guidance में केवल reviewed निर्देश स्वीकार होंगे।",
      false
    );
  }

  async function refreshKnowledgeFromCache(reason) {
    if (state.destroyed) return null;
    const request = ++state.knowledgeRefreshSequence;
    const prefix = reason ? String(reason) + " — " : "";
    setKnowledgeStatus(prefix + "Manifest Refresh और स्थानीय Knowledge Cache की जाँच हो रही है…", false);
    try {
      const diagnostics = await engine.loadKnowledge({
        refreshManifest: true,
        downloadIfMissing: false
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

  function setMusicPlayerStatus(message, warning = false) {
    if (!musicPlayerStatus || state.destroyed) return;
    musicPlayerStatus.textContent = String(message);
    musicPlayerStatus.classList.toggle("warn", Boolean(warning));
    musicPlayerStatus.setAttribute("data-state", warning ? "warning" : "info");
  }

  function getMusicPlayerText() {
    return String(ui.input.value || "");
  }

  function getMusicPlayerVoiceMetadata() {
    const voice = chooseVoice(getMusicPlayerText());
    if (!voice) return null;
    return Object.freeze({
      name: String(voice.name || ""),
      voiceURI: String(voice.voiceURI || ""),
      lang: String(voice.lang || ""),
      localService: voice.localService === true,
      default: voice.default === true,
      genderHint: voiceGenderHint(voice)
    });
  }

  function getMusicPlayerSpeechSettings() {
    const value = Number(ui.rate.value);
    const rate = Number.isFinite(value) ? Math.min(1.15, Math.max(0.65, value)) : 0.88;
    const voice = getMusicPlayerVoiceMetadata();
    return Object.freeze({
      rate,
      lang: voice && voice.lang ? voice.lang : (isDevanagari(getMusicPlayerText()) ? "hi-IN" : "en-IN"),
      voiceName: voice ? voice.name : "",
      voiceGenderHint: voice ? voice.genderHint : "unknown"
    });
  }

  function notifyMusicPlayerHostChange(reason) {
    if (state.destroyed || musicPlayerSubscribers.size === 0) return;
    const detail = Object.freeze({
      reason: String(reason || "host-update"),
      text: getMusicPlayerText(),
      selectedVoice: getMusicPlayerVoiceMetadata(),
      speechSettings: getMusicPlayerSpeechSettings(),
      pronunciationReady: state.pronunciationReady
    });
    for (const listener of Array.from(musicPlayerSubscribers)) {
      try {
        listener(detail);
      } catch (error) {
        if (win.console && typeof win.console.warn === "function") {
          win.console.warn("[Swar-Sadhika] Music Player host subscriber failed", error);
        }
      }
    }
  }

  function createMusicPlayerHostContext(mountRoot) {
    return Object.freeze({
      root: mountRoot,
      document: doc,
      window: win,
      hostContractVersion: MUSIC_PLAYER_HOST_CONTRACT_VERSION,
      // Native TTS voice metadata is descriptive only; it is not PCM audio.
      getText: getMusicPlayerText,
      getSelectedVoice: getMusicPlayerVoiceMetadata,
      getSpeechSettings: getMusicPlayerSpeechSettings,
      // Local pronunciation services provide analysis, not audio samples.
      analyzeText(text) {
        if (!state.engineReady || !state.pronunciationReady) {
          throw new Error("स्थानीय Sanskrit pronunciation engine अभी तैयार नहीं है।");
        }
        return engine.analyzeText(text == null ? getMusicPlayerText() : String(text));
      },
      prepareSpeech(text) {
        if (!state.engineReady || !state.pronunciationReady) {
          throw new Error("स्थानीय Sanskrit pronunciation engine अभी तैयार नहीं है।");
        }
        return engine.prepareSpeech(text == null ? getMusicPlayerText() : String(text));
      },
      getPronunciationKnowledgeBaseInfo() {
        return state.pronunciationInfo || engine.getPronunciationKnowledgeBaseInfo();
      },
      isPronunciationReady() {
        return Boolean(state.engineReady && state.pronunciationReady);
      },
      subscribe(listener) {
        if (typeof listener !== "function") {
          throw new TypeError("Music Player host subscriber एक function होना चाहिए।");
        }
        if (state.destroyed) return () => {};
        musicPlayerSubscribers.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          musicPlayerSubscribers.delete(listener);
        };
      },
      setStatus(message, warning = false) {
        setMusicPlayerStatus(message, warning);
      }
    });
  }

  function normalizeMusicPlayerInstance(mounted) {
    let instance;
    if (typeof mounted === "function") {
      instance = { unmount: mounted };
    } else if (mounted && typeof mounted === "object") {
      instance = mounted;
    } else {
      throw new TypeError("Music Player mount(context) को lifecycle object या cleanup function लौटाना चाहिए।");
    }
    const hooks = ["onShow", "onHide", "unmount"];
    for (const name of hooks) {
      if (instance[name] != null && typeof instance[name] !== "function") {
        throw new TypeError("Music Player lifecycle hook " + name + " function होना चाहिए।");
      }
    }
    if (!hooks.some(name => typeof instance[name] === "function")) {
      throw new TypeError("Music Player ने कोई lifecycle hook या cleanup function उपलब्ध नहीं कराया।");
    }
    return instance;
  }

  function installMusicPlayerHook() {
    if (musicPlayerSection || state.destroyed) return;
    musicPlayerSection = doc.createElement("section");
    musicPlayerSection.className = "music-player-bridge";
    musicPlayerSection.setAttribute("aria-label", "गायन म्यूजिक प्लेयर");
    const intro = doc.createElement("p");
    intro.className = "note";
    intro.textContent = "यह स्वतंत्र Local Singing Player है। पाठ और संस्कृत उच्चारण विश्लेषण मुख्य TTS पेज से मिलेंगे; गायन निर्माण और PCM Playback की readiness Player अलग से बताएगा।";
    const actions = doc.createElement("div");
    actions.className = "tts-actions";
    musicPlayerButton = doc.createElement("button");
    musicPlayerButton.type = "button";
    musicPlayerButton.className = "btn primary";
    musicPlayerButton.textContent = "♫ गायन Player खोलें";
    musicPlayerButton.addEventListener("click", loadMusicPlayer);
    actions.appendChild(musicPlayerButton);
    musicPlayerStatus = doc.createElement("div");
    musicPlayerStatus.className = "status";
    musicPlayerStatus.setAttribute("role", "status");
    musicPlayerStatus.setAttribute("aria-live", "polite");
    musicPlayerStatus.setAttribute("data-state", "info");
    musicPlayerStatus.textContent = "Music Player आवश्यकता पड़ने पर लोड होगा।";
    musicPlayerRoot = doc.createElement("div");
    musicPlayerRoot.className = "music-player-mount";
    musicPlayerRoot.hidden = true;
    musicPlayerSection.append(intro, actions, musicPlayerStatus, musicPlayerRoot);
    root.appendChild(musicPlayerSection);
  }

  async function loadMusicPlayer() {
    if (state.destroyed || !musicPlayerRoot) return null;
    if (musicPlayerInstance) {
      musicPlayerRoot.hidden = false;
      if (pageVisible && typeof musicPlayerInstance.onShow === "function") {
        try { await musicPlayerInstance.onShow(); }
        catch (error) {
          setMusicPlayerStatus("Music Player फिर सक्रिय नहीं हो सका: " +
            (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
        }
      }
      return musicPlayerInstance;
    }
    if (musicPlayerLoadPromise) return musicPlayerLoadPromise;
    const mountRoot = musicPlayerRoot;
    musicPlayerButton.disabled = true;
    musicPlayerButton.textContent = "गायन Player लोड हो रहा है…";
    setMusicPlayerStatus("स्वतंत्र Music Player मॉड्यूल लोड किया जा रहा है…");
    const task = (async () => {
      const moduleUrl = new URL("speech-to-singing/index.js", doc.baseURI);
      if (moduleUrl.origin !== win.location.origin) {
        throw new TypeError("Music Player मॉड्यूल केवल इसी GitHub Pages origin से लोड होना चाहिए।");
      }
      const musicModule = await import(moduleUrl.href);
      if (state.destroyed || !mountRoot) return null;
      if (!musicModule || typeof musicModule.mount !== "function") {
        throw new TypeError("Music Player में mount(context) export उपलब्ध नहीं है।");
      }
      const mounted = await musicModule.mount(createMusicPlayerHostContext(mountRoot));
      let instance;
      try { instance = normalizeMusicPlayerInstance(mounted); }
      catch (error) {
        const cleanup = typeof mounted === "function" ? mounted :
          (mounted && typeof mounted.unmount === "function" ? mounted.unmount.bind(mounted) : null);
        if (cleanup) { try { await cleanup(); } catch (_) {} }
        throw error;
      }
      if (state.destroyed) {
        if (typeof instance.unmount === "function") await instance.unmount();
        return null;
      }
      musicPlayerInstance = instance;
      mountRoot.hidden = false;
      musicPlayerButton.disabled = false;
      musicPlayerButton.textContent = "♫ गायन Player खोलें";
      notifyMusicPlayerHostChange("player-mounted");
      setMusicPlayerStatus("Music Player UI मुख्य TTS पेज से जुड़ गया है। Singing Synthesis और PCM Producer की readiness अलग से सत्यापित होगी।");
      if (!pageVisible && typeof instance.onHide === "function") {
        try { await instance.onHide(); }
        catch (error) {
          setMusicPlayerStatus("पेज छिपा है, लेकिन Player onHide में समस्या आई: " +
            (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
        }
      }
      return instance;
    })();
    musicPlayerLoadPromise = task;
    try { return await task; }
    catch (error) {
      musicPlayerLoadPromise = null;
      if (!state.destroyed) {
        musicPlayerButton.disabled = false;
        musicPlayerButton.textContent = "♫ गायन Player पुनः खोलें";
        setMusicPlayerStatus("Music Player लोड नहीं हो सका। मुख्य TTS स्वतंत्र है।" +
          (error && error.message ? " विवरण: " + error.message : ""), true);
      }
      return null;
    }
  }

  function setLayaStatus(message, warning = false) {
    if (!ui.layaStatus || state.destroyed) return;
    ui.layaStatus.textContent = String(message);
    ui.layaStatus.classList.toggle("warn", Boolean(warning));
    ui.layaStatus.setAttribute("data-state", warning ? "warning" : "info");
  }

  function installNativeTtsLayaControl() {
    if (layaSection || state.destroyed) return;
    const section = doc.createElement("section");
    section.className = "note";
    section.setAttribute("aria-label", "Native TTS Laya Mode");
    const label = doc.createElement("label");
    label.className = "field";
    const toggle = doc.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = false;
    toggle.disabled = true;
    toggle.addEventListener("change", onLayaModeChange);
    const caption = doc.createElement("span");
    caption.textContent = "♫ Native TTS Laya Mode — पाठ को लयात्मक ढंग से पढ़ें";
    label.append(toggle, caption);
    const status = doc.createElement("div");
    status.className = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "स्थानीय Laya Engine लोड किया जा रहा है…";
    section.append(label, status);
    root.insertBefore(section, ui.speak.parentElement);
    layaSection = section;
    ui.layaToggle = toggle;
    ui.layaStatus = status;
  }

  function onLayaModeChange() {
    if (!ui.layaToggle) return;
    if (state.active) {
      ui.layaToggle.checked = state.layaModeActive;
      return;
    }
    updateButtons();
    setLayaStatus(ui.layaToggle.checked
      ? "Laya Mode चयनित है। Play दबाने पर वर्तमान Native Voice के साथ लयात्मक वाचन शुरू होगा।"
      : "सामान्य Native TTS चयनित है।");
  }

  async function preloadNativeTtsLayaEngine() {
    if (state.destroyed || state.layaReady) return state.layaEngine;
    if (layaLoadPromise) return layaLoadPromise;
    const task = (async () => {
      const moduleUrl = new URL("speech-to-singing/native-tts-laya-engine.js", doc.baseURI);
      if (moduleUrl.origin !== win.location.origin) {
        throw new TypeError("Native TTS Laya मॉड्यूल केवल इसी GitHub Pages origin से लोड होना चाहिए।");
      }
      const module = await import(moduleUrl.href);
      if (state.destroyed) return null;
      if (!module || typeof module.createNativeTtsLayaEngine !== "function") {
        throw new TypeError("Native TTS Laya Engine का createNativeTtsLayaEngine() export उपलब्ध नहीं है।");
      }
      const instance = module.createNativeTtsLayaEngine();
      const initialized = await instance.initialize();
      if (state.destroyed) return null;
      if (!initialized || initialized.ready !== true || !initialized.selfTest || initialized.selfTest.status !== "PASSED") {
        throw new Error("Native TTS Laya Engine Self-Test सफल नहीं हुआ।");
      }
      state.layaEngine = instance;
      state.layaReady = true;
      if (ui.layaToggle) ui.layaToggle.disabled = false;
      setLayaStatus("Native TTS Laya Mode तैयार है। कोई Singing Model या बाहरी AI सेवा आवश्यक नहीं है।");
      updateButtons();
      return instance;
    })();
    layaLoadPromise = task;
    try {
      return await task;
    } catch (error) {
      if (!state.destroyed) {
        state.layaReady = false;
        state.layaEngine = null;
        if (ui.layaToggle) {
          ui.layaToggle.checked = false;
          ui.layaToggle.disabled = true;
        }
        setLayaStatus("Laya Mode उपलब्ध नहीं हुआ; सामान्य Native TTS स्वतंत्र रूप से चलता रहेगा। " +
          (error && error.message ? error.message : "अज्ञात मॉड्यूल त्रुटि"), true);
        updateButtons();
      }
      return null;
    } finally {
      if (layaLoadPromise === task) layaLoadPromise = null;
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
    if (state.destroyed || !state.engineReady || !state.pronunciationReady || state.active) return;
    const text = ui.input.value;
    if (!text.trim()) {
      state.lastAnalysis = null;
      return;
    }
    try {
      const analysis = engine.analyzeText(text);
      state.lastAnalysis = analysis;
      const message = "पाठ विश्लेषण: " + summarizeAnalysis(analysis) + "। " + pronunciationReadyText();
      const warning = Boolean(analysis.needsBranchContext || (analysis.unclassifiedMarks && analysis.unclassifiedMarks.length));
      setStatus(
        warning
          ? message + " वैदिक स्वराघात/अज्ञात चिह्नों का Native Voice पर शुद्ध वाचन प्रमाणित नहीं है।"
          : message,
        warning
      );
    } catch (error) {
      setStatus("पाठ विश्लेषण त्रुटि: " + (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  function onTextInput() {
    analyzeCurrentText();
    notifyMusicPlayerHostChange("text-changed");
  }

  function isDevanagari(value) {
    return Array.from(String(value)).some(character => {
      const code = character.codePointAt(0);
      return code >= 0x0900 && code <= 0x097f;
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

  function hasVedicMarks(value) {
    return /[\u0951\u0952\u1cda-\u1cde\u1cdf-\u1ce0]/u.test(value);
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

  function updateButtons() {
    const canSpeak = state.engineReady && state.pronunciationReady && state.voiceEntries.length > 0 && !state.destroyed;
    const layaUnavailable = Boolean(ui.layaToggle && ui.layaToggle.checked && !state.layaReady);
    ui.speak.disabled = state.active || !canSpeak || layaUnavailable;
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
    state.lines = [];
    state.index = 0;
    state.layaPlan = null;
    state.layaModeActive = false;
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
    if (state.navigationPaused || state.userPaused) {
      state.waitingForNext = true;
      return;
    }
    if (state.index >= state.lines.length) {
      const total = state.lines.length;
      finish("सभी " + total + " पंक्तियों का पाठ पूरा हो गया।");
      return;
    }
    if (!state.engineReady) {
      finish("TTS Engine अभी तैयार नहीं है।", true);
      return;
    }

    const line = state.lines[state.index];
    const layaPhrase = state.layaModeActive && state.layaPlan ? state.layaPlan.phrases[state.index] : null;
    const prepared = stripTerminalVerseNumber(line);
    const speechText = (layaPhrase ? layaPhrase.text : prepared.text).trim();
    const voice = chooseVoice(line);
    let lineAnalysis;
    let speechPreparation;
    try {
      lineAnalysis = engine.analyzeText(line);
      speechPreparation = engine.prepareSpeech(speechText);
      if (!speechPreparation || speechPreparation.speechText !== speechText || speechPreparation.modified !== false) {
        throw new Error("उच्चारण तैयारी ने मूल पंक्ति बदलने का प्रयास किया।");
      }
      state.lastAnalysis = lineAnalysis;
    } catch (error) {
      finish("संस्कृत पाठ विश्लेषण/तैयारी विफल: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
      return;
    }

    if (!speechText) {
      state.index += 1;
      scheduleNext(generation);
      return;
    }
    if (!voice) {
      finish("इस पाठ के लिए कोई उपलब्ध स्थानीय Voice चयनित नहीं है। Android की Text-to-Speech settings जाँचें।", true);
      return;
    }

    const language = voice.lang || (isDevanagari(line) ? "hi-IN" : "en-IN");
    const rate = layaPhrase
      ? Math.min(1.15, Math.max(0.65, Number(layaPhrase.rate) || 0.88))
      : Math.min(1.15, Math.max(0.65, Number(ui.rate.value) || 0.88));
    const pitch = layaPhrase
      ? Math.min(1.14, Math.max(0.90, Number(layaPhrase.pitch) || 1.02))
      : (voiceGenderHint(voice) === "female" ? 1.02 : 1.07);
    const numberNotice = prepared.removed ? " · अंत की श्लोक-संख्या वाचन से छोड़ी गई।" : "";
    const specialNotice = speechPreparation.requiresAccentAwareBackend || speechPreparation.requiresBranchContext
      ? " · वैदिक/विशेष चिह्न पहचाने गए; Native Voice पर शुद्ध स्वराघात प्रमाणित नहीं है।"
      : "";
    const analysisNotice = " · " + summarizeAnalysis(lineAnalysis);

    setLine(line);
    setStatus((state.layaModeActive ? "लयात्मक वाक्यांश " : "पंक्ति ") +
      (state.index + 1) + " / " + state.lines.length + " पढ़ी जा रही है: " +
      voice.name + " (स्थानीय Native Voice)" + numberNotice + specialNotice + analysisNotice);
    state.speechInFlight = true;
    updateButtons();

    try {
      const result = await engine.speak(speechText, {
        voice,
        lang: language,
        rate,
        pitch,
        volume: 1,
        replace: false
      });
      if (generation !== state.generation || !state.active || state.destroyed) return;
      state.speechInFlight = false;
      if (result && result.status === "cancelled") {
        finish("वाचन रद्द हो गया।", true);
        return;
      }
      state.index += 1;
      if (state.navigationPaused || state.userPaused) {
        state.waitingForNext = true;
        updateButtons();
      } else {
        scheduleNext(generation);
      }
    } catch (error) {
      if (generation !== state.generation || state.destroyed) return;
      state.speechInFlight = false;
      const message = error && error.message ? error.message : "अज्ञात TTS त्रुटि";
      finish("पंक्ति " + (state.index + 1) + " पढ़ते समय TTS त्रुटि: " + message, true);
    }
  }

  async function startLayaReading() {
    if (!state.layaReady || !state.layaEngine) {
      setLayaStatus("Laya Engine अभी तैयार नहीं है। सामान्य TTS का उपयोग करें या मॉड्यूल लोड होने की प्रतीक्षा करें।", true);
      return;
    }
    if (!state.engineReady || !state.pronunciationReady || !state.voiceEntries.length) {
      setLayaStatus("Laya Mode के लिए Native TTS, स्थानीय उच्चारण विश्लेषक और Voice का तैयार होना आवश्यक है।", true);
      return;
    }
    const sourceLines = ui.input.value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    if (!sourceLines.length) {
      setLayaStatus("पहले संस्कृत पाठ लिखें।", true);
      ui.input.focus();
      return;
    }
    const speechText = sourceLines.map(line => stripTerminalVerseNumber(line).text.trim()).filter(Boolean).join("\n");
    if (!speechText) {
      setLayaStatus("वाचन योग्य पाठ उपलब्ध नहीं है।", true);
      return;
    }
    const voice = chooseVoice(speechText);
    if (!voice) {
      setLayaStatus("इस पाठ के लिए कोई स्थानीय Native Voice उपलब्ध नहीं है।", true);
      return;
    }
    try {
      state.lastAnalysis = engine.analyzeText(speechText);
    } catch (error) {
      setLayaStatus("पाठ विश्लेषण विफल: " + (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
      return;
    }

    state.generation += 1;
    const generation = state.generation;
    clearNextTimer();
    state.active = false;
    state.speechInFlight = false;
    state.layaPlan = null;
    state.layaModeActive = false;
    updateButtons();
    try {
      await engine.cancel();
    } catch (error) {
      finish("पिछला वाचन सुरक्षित रूप से रोक नहीं सका: " +
        (error && error.message ? error.message : "TTS त्रुटि"), true);
      return;
    }
    if (generation !== state.generation || state.destroyed) return;

    setLayaStatus("पाठ का स्वर-क्रम और वाक्यांश तैयार किए जा रहे हैं…");
    let plan;
    try {
      const baseRate = Math.min(1.15, Math.max(0.65, Number(ui.rate.value) || 0.88));
      const basePitch = voiceGenderHint(voice) === "female" ? 1.02 : 1.07;
      plan = await state.layaEngine.createPlan(speechText, { rate: baseRate, pitch: basePitch });
      if (!plan || plan.status !== "ready" || !Array.isArray(plan.phrases) || !plan.phrases.length) {
        throw new Error("Laya Plan ने कोई वैध वाक्यांश नहीं बनाया।");
      }
    } catch (error) {
      if (generation === state.generation && !state.destroyed) {
        setLayaStatus("Laya Plan तैयार नहीं हुआ; सामान्य TTS सुरक्षित है। " +
          (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
      }
      return;
    }
    if (generation !== state.generation || state.destroyed) return;

    state.layaPlan = plan;
    state.layaModeActive = true;
    state.lines = plan.phrases.map(phrase => phrase.text);
    state.index = 0;
    state.active = true;
    state.userPaused = false;
    state.navigationPaused = !pageVisible;
    state.waitingForNext = !pageVisible;
    updateButtons();
    setLayaStatus("Laya Mode सक्रिय है: " + plan.summary.phraseCount +
      " वाक्यांश तैयार। यह मौजूदा Native Voice का अनुमानित लयात्मक वाचन है, वास्तविक गायन मॉडल नहीं।");
    if (pageVisible) void speakNext(generation);
  }

  async function startReading() {
    if (ui.layaToggle && ui.layaToggle.checked) {
      await startLayaReading();
      return;
    }
    if (!state.engineReady) {
      setStatus("Native TTS Engine उपलब्ध नहीं है। Browser और Android TTS सुविधा जाँचें।", true);
      return;
    }
    if (!state.pronunciationReady) {
      setStatus("वैदिक उच्चारण ज्ञानकोश की Self-Test स्थिति सफल नहीं है; सुरक्षित वाचन रोक दिया गया है।", true);
      return;
    }
    if (!state.voiceEntries.length) {
      setStatus("कोई सत्यापित स्थानीय Voice उपलब्ध नहीं है। Android की Text-to-Speech settings में स्थानीय Hindi voice install/enable करें।", true);
      return;
    }
    const lines = ui.input.value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      setStatus("पहले पाठ लिखें। प्रत्येक नई पंक्ति क्रम से पढ़ी जाएगी।", true);
      ui.input.focus();
      return;
    }
    try {
      state.lastAnalysis = engine.analyzeText(lines.join("\n"));
    } catch (error) {
      setStatus("पाठ विश्लेषण विफल: " + (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
      return;
    }

    state.generation += 1;
    const generation = state.generation;
    clearNextTimer();
    state.active = false;
    state.speechInFlight = false;
    updateButtons();
    try {
      await engine.cancel();
    } catch (error) {
      finish("पिछला वाचन सुरक्षित रूप से रोक नहीं सका: " +
        (error && error.message ? error.message : "TTS त्रुटि"), true);
      return;
    }
    if (generation !== state.generation || state.destroyed) return;

    state.layaPlan = null;
    state.layaModeActive = false;
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
    notifyMusicPlayerHostChange("speech-rate-changed");
  }

  function onVoiceChange() {
    const voice = chooseVoice(ui.input.value);
    if (!voice) {
      setStatus("कोई उपयुक्त स्थानीय Voice उपलब्ध नहीं है।", true);
      notifyMusicPlayerHostChange("voice-changed");
      return;
    }
    const gender = voiceGenderHint(voice);
    const note = gender === "female"
      ? "संभावित स्त्री-स्वर चुना गया; नाम-आधारित पहचान की पुष्टि वास्तविक श्रवण से करनी होगी: "
      : "स्थानीय Voice चुनी गई: ";
    setStatus(note + voice.name + " (" + voice.lang + ")। Pitch परिवर्तन वास्तविक महिला Voice की गारंटी नहीं है।");
    notifyMusicPlayerHostChange("voice-changed");
  }

  async function refreshVoices() {
    const request = ++state.voiceRefreshSequence;
    const previousKey = ui.voice.value;
    try {
      const voices = await engine.getVoices({ backendId: "native" });
      if (state.destroyed || request !== state.voiceRefreshSequence) return;
      state.voices = voices.filter(voice => voice && voice.localService === true);
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
      notifyMusicPlayerHostChange("voices-updated");

      if (!state.engineReady) return;
      if (!state.voiceEntries.length) {
        setStatus("Speech Synthesis उपलब्ध है, लेकिन कोई सत्यापित localService=true Voice नहीं मिली। Android TTS settings में स्थानीय Hindi voice install/enable करें।", true);
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
      notifyMusicPlayerHostChange("voices-unavailable");
      setStatus("स्थानीय Voice सूची प्राप्त नहीं हुई: " +
        (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  async function onHide() {
    pageVisible = false;
    if (musicPlayerInstance && typeof musicPlayerInstance.onHide === "function") {
      try {
        await musicPlayerInstance.onHide();
      } catch (error) {
        setMusicPlayerStatus(
          "Music Player को रोकने में समस्या हुई: " +
            (error && error.message ? error.message : "अज्ञात त्रुटि"),
          true
        );
      }
    }
    if (!state.active || state.userPaused || state.navigationPaused || state.destroyed) return;
    state.navigationPaused = true;
    if (state.timer !== null) {
      clearNextTimer();
      state.waitingForNext = true;
    }
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
    pageVisible = true;
    if (musicPlayerInstance && typeof musicPlayerInstance.onShow === "function") {
      try {
        await musicPlayerInstance.onShow();
      } catch (error) {
        setMusicPlayerStatus(
          "Music Player फिर सक्रिय नहीं हो सका: " +
            (error && error.message ? error.message : "अज्ञात त्रुटि"),
          true
        );
      }
    }
    if (state.destroyed) return;
    await refreshKnowledgeFromCache("TTS पेज पर वापसी");
    if (!state.active || !state.navigationPaused || state.destroyed) return;
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
    if (ui.layaToggle) ui.layaToggle.removeEventListener("change", onLayaModeChange);
    state.layaPlan = null;
    state.layaEngine = null;
    state.layaReady = false;

    if (musicPlayerButton) {
      musicPlayerButton.disabled = true;
      musicPlayerButton.removeEventListener("click", loadMusicPlayer);
    }
    const pendingMusicLoad = musicPlayerLoadPromise;
    if (pendingMusicLoad) {
      try { await pendingMusicLoad; }
      catch (_) { /* loadMusicPlayer reports its own failure; continue teardown. */ }
    }
    if (musicPlayerInstance && typeof musicPlayerInstance.unmount === "function") {
      try {
        await musicPlayerInstance.unmount();
      } catch (error) {
        if (win.console && typeof win.console.error === "function") {
          win.console.error("[Swar-Sadhika] Music Player cleanup failed", error);
        }
      }
    }
    musicPlayerSubscribers.clear();
    musicPlayerInstance = null;
    musicPlayerLoadPromise = null;
    musicPlayerRoot = null;
    musicPlayerSection = null;

    if (typeof state.unsubscribeVoices === "function") state.unsubscribeVoices();
    if (typeof state.unsubscribePronunciationAnalysis === "function") state.unsubscribePronunciationAnalysis();
    if (typeof state.unsubscribePronunciationWarning === "function") state.unsubscribePronunciationWarning();
    if (typeof state.unsubscribeKnowledgeChange === "function") state.unsubscribeKnowledgeChange();
    if (typeof state.unsubscribeKnowledgeError === "function") state.unsubscribeKnowledgeError();
    if (typeof state.unsubscribeKnowledgeWarning === "function") state.unsubscribeKnowledgeWarning();
    state.unsubscribeVoices = null;
    state.unsubscribePronunciationAnalysis = null;
    state.unsubscribePronunciationWarning = null;
    state.unsubscribeKnowledgeChange = null;
    state.unsubscribeKnowledgeError = null;
    state.unsubscribeKnowledgeWarning = null;
    if (knowledgeStatus.parentNode) knowledgeStatus.parentNode.removeChild(knowledgeStatus);
    setLine("");
    updateButtons();
    try {
      await engine.dispose();
    } catch (error) {
      if (win.console && typeof win.console.error === "function") {
        win.console.error("[Swar-Sadhika] TTS Engine cleanup failed", error);
      }
    }
  }

  installMusicPlayerHook();
  installNativeTtsLayaControl();
  void preloadNativeTtsLayaEngine();

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
  state.unsubscribePronunciationAnalysis = engine.on("pronunciationanalysis", detail => {
    if (state.destroyed) return;
    state.lastPronunciationReport = detail;
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
  state.unsubscribeKnowledgeChange = engine.on("knowledgechange", detail => {
    if (!state.destroyed) renderKnowledgeStatus(detail);
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
    if (!state.engineReady) {
      setStatus("इस ब्राउज़र में Native Speech Synthesis उपलब्ध नहीं है। Android Chrome और installed local TTS voice की जाँच करें।", true);
      updateButtons();
      await refreshKnowledgeFromCache("प्रारंभिक Knowledge जाँच");
    } else {
      state.pronunciationInfo = engine.getPronunciationKnowledgeBaseInfo();
      state.pronunciationReady = Boolean(
        state.pronunciationInfo &&
        state.pronunciationInfo.available &&
        state.pronunciationInfo.selfTest &&
        state.pronunciationInfo.selfTest.status === "PASSED" &&
        state.pronunciationInfo.selfTest.failed === 0
      );
      if (!state.pronunciationReady) {
        setStatus("वैदिक उच्चारण ज्ञानकोश की Self-Test विफल है। सुरक्षा के लिए वाचन उपलब्ध नहीं किया गया।", true);
        updateButtons();
      } else {
        await refreshVoices();
        if (ui.input.value.trim()) analyzeCurrentText();
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
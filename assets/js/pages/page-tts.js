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
    line: byId("rainbow-line")
  };

  const missing = Object.entries(ui)
    .filter(([key, value]) => !value && !["overlay", "line"].includes(key))
    .map(([key]) => key);
  if (missing.length) {
    throw new Error("TTS interface में आवश्यक तत्व अनुपस्थित हैं: " + missing.join(", "));
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
    pronunciationReady: false,
    pronunciationInfo: null,
    lastAnalysis: null,
    lastPronunciationReport: null
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

  function setMusicPlayerStatus(message, warning = false) {
    if (!musicPlayerStatus) return;
    musicPlayerStatus.textContent = String(message);
    musicPlayerStatus.classList.toggle("warn", Boolean(warning));
  }

  function installMusicPlayerHook() {
    if (musicPlayerSection || state.destroyed) return;

    musicPlayerSection = doc.createElement("section");
    musicPlayerSection.className = "music-player-bridge";
    musicPlayerSection.setAttribute("aria-label", "गायन म्यूजिक प्लेयर");

    const intro = doc.createElement("p");
    intro.className = "note";
    intro.textContent = "गायन Player स्वतंत्र मॉड्यूल से खुलेगा। सामान्य TTS इससे स्वतंत्र रहेगा।";

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
    musicPlayerStatus.textContent = "गायन मॉड्यूल आवश्यकता पड़ने पर लोड होगा।";

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
      return musicPlayerInstance;
    }

    if (musicPlayerLoadPromise) return musicPlayerLoadPromise;

    musicPlayerButton.disabled = true;
    musicPlayerButton.textContent = "गायन Player लोड हो रहा है…";
    setMusicPlayerStatus("स्वतंत्र Music Player मॉड्यूल लोड किया जा रहा है…");

    const task = (async () => {
      const moduleUrl = new URL("./speech-to-singing/index.js", doc.baseURI);
      const musicModule = await import(moduleUrl.href);
      if (!musicModule || typeof musicModule.mount !== "function") {
        throw new TypeError("Music Player में mount(context) export उपलब्ध नहीं है।");
      }

      const mounted = await musicModule.mount(Object.freeze({
        root: musicPlayerRoot,
        document: doc,
        window: win,
        getText: () => String(ui.input.value || ""),
        getSelectedVoice: () => {
          const voice = chooseVoice(ui.input.value);
          return voice ? Object.freeze({
            name: String(voice.name || ""),
            voiceURI: String(voice.voiceURI || ""),
            lang: String(voice.lang || ""),
            localService: voice.localService === true
          }) : null;
        },
        getSpeechSettings: () => Object.freeze({
          rate: Math.min(1.15, Math.max(0.65, Number(ui.rate.value) || 0.88))
        }),
        setStatus: setMusicPlayerStatus
      }));

      const instance = typeof mounted === "function"
        ? { unmount: mounted }
        : (mounted && typeof mounted === "object" ? mounted : {});

      if (state.destroyed) {
        if (typeof instance.unmount === "function") await instance.unmount();
        return null;
      }

      musicPlayerInstance = instance;
      musicPlayerRoot.hidden = false;
      musicPlayerButton.disabled = false;
      musicPlayerButton.textContent = "♫ गायन Player तैयार";
      setMusicPlayerStatus("Music Player मुख्य TTS पेज से जुड़ गया है।");

      if (!pageVisible && typeof instance.onHide === "function") {
        await instance.onHide();
      }
      return instance;
    })();

    musicPlayerLoadPromise = task;
    try {
      return await task;
    } catch (error) {
      musicPlayerLoadPromise = null;
      if (!state.destroyed) {
        musicPlayerButton.disabled = false;
        musicPlayerButton.textContent = "♫ गायन Player पुनः खोलें";
        setMusicPlayerStatus(
          "Music Player अभी लोड नहीं हुआ। स्वतंत्र मॉड्यूल की फाइल उपलब्ध होने पर इसे फिर खोलें। सामान्य TTS सुरक्षित है।" +
            (error && error.message ? " विवरण: " + error.message : ""),
          true
        );
      }
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
    const prepared = stripTerminalVerseNumber(line);
    const speechText = prepared.text.trim();
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
    const rate = Math.min(1.15, Math.max(0.65, Number(ui.rate.value) || 0.88));
    const pitch = voiceGenderHint(voice) === "female" ? 1.02 : 1.07;
    const numberNotice = prepared.removed ? " · अंत की श्लोक-संख्या वाचन से छोड़ी गई।" : "";
    const specialNotice = speechPreparation.requiresAccentAwareBackend || speechPreparation.requiresBranchContext
      ? " · वैदिक/विशेष चिह्न पहचाने गए; Native Voice पर शुद्ध स्वराघात प्रमाणित नहीं है।"
      : "";
    const analysisNotice = " · " + summarizeAnalysis(lineAnalysis);

    setLine(line);
    setStatus("पंक्ति " + (state.index + 1) + " / " + state.lines.length + " पढ़ी जा रही है: " +
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

  async function startReading() {
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
    ui.rateValue.textContent = Number(ui.rate.value).toFixed(2) + "×";
  }

  function onVoiceChange() {
    const voice = chooseVoice(ui.input.value);
    if (!voice) {
      setStatus("कोई उपयुक्त स्थानीय Voice उपलब्ध नहीं है।", true);
      return;
    }
    const gender = voiceGenderHint(voice);
    const note = gender === "female"
      ? "संभावित स्त्री-स्वर चुना गया; नाम-आधारित पहचान की पुष्टि वास्तविक श्रवण से करनी होगी: "
      : "स्थानीय Voice चुनी गई: ";
    setStatus(note + voice.name + " (" + voice.lang + ")। Pitch परिवर्तन वास्तविक महिला Voice की गारंटी नहीं है।");
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

    if (musicPlayerButton) {
      musicPlayerButton.disabled = true;
      musicPlayerButton.removeEventListener("click", loadMusicPlayer);
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
    musicPlayerInstance = null;
    musicPlayerRoot = null;
    musicPlayerSection = null;

    if (typeof state.unsubscribeVoices === "function") state.unsubscribeVoices();
    if (typeof state.unsubscribePronunciationAnalysis === "function") state.unsubscribePronunciationAnalysis();
    if (typeof state.unsubscribePronunciationWarning === "function") state.unsubscribePronunciationWarning();
    state.unsubscribeVoices = null;
    state.unsubscribePronunciationAnalysis = null;
    state.unsubscribePronunciationWarning = null;
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
    }
  }

  return Object.freeze({ onShow, onHide, unmount });
}
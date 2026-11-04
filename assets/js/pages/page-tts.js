/* Swar-Sadhika — TTS page module.
 * Uses only the device/browser SpeechSynthesis voices.
 * A future local synthesis engine can be integrated through this page module
 * without changing index.html or the main app entry point.
 */
export async function mount(context) {
  if (!context || !context.root || !context.document) {
    throw new TypeError("TTS module को root और document context आवश्यक है।");
  }

  const root = context.root;
  const doc = context.document;
  const win = doc.defaultView || window;
  const synthesis = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
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

  const state = {
    voices: [],
    generation: 0,
    lines: [],
    index: 0,
    active: false,
    userPaused: false,
    navigationPaused: false,
    waitingForNext: false,
    timer: null,
    destroyed: false,
    voiceListener: null
  };

  const FEMALE_HINTS = [
    "female", "woman", "zira", "heera", "lekha", "priya",
    "sangeeta", "kavya", "neerja", "raveena", "aarti", "swara",
    "susan", "samantha", "siri female"
  ];
  const MALE_HINTS = ["male", "man", "david", "mark", "george"];

  function setStatus(message, warning) {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.classList.toggle("warn", Boolean(warning));
  }

  function setLine(message) {
    if (ui.line) ui.line.textContent = message || "";
    if (ui.overlay) ui.overlay.classList.toggle("hidden", !message);
  }

  function isDevanagari(value) {
    return Array.from(value).some(character => {
      const code = character.codePointAt(0);
      return code >= 0x0900 && code <= 0x097f;
    });
  }

  function hasVedicMarks(value) {
    return /[\u0951\u0952\u1cda-\u1cde\u1cdf-\u1ce0]/u.test(value);
  }

  function voiceGenderHint(voice) {
    const name = String(voice.name || "").toLowerCase();
    if (FEMALE_HINTS.some(hint => name.includes(hint))) return "female";
    if (MALE_HINTS.some(hint => name.includes(hint))) return "male";
    return "unknown";
  }

  function scoreVoice(voice, textValue) {
    const language = String(voice.lang || "").toLowerCase();
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

    if (voice.localService) score += 12;
    if (voice.default) score += 3;
    return score;
  }

  function refreshVoices() {
    if (!synthesis || typeof synthesis.getVoices !== "function") {
      setStatus("इस ब्राउज़र में Speech Synthesis उपलब्ध नहीं है। Android Chrome और system TTS सुविधा की जाँच करें।", true);
      return;
    }

    const previous = ui.voice.value;
    state.voices = synthesis.getVoices().slice();

    const auto = {
      value: "auto",
      label: "स्वचालित — संभावित स्त्री-स्वर को प्राथमिकता"
    };

    ui.voice.replaceChildren();
    const autoOption = doc.createElement("option");
    autoOption.value = auto.value;
    autoOption.textContent = auto.label;
    ui.voice.appendChild(autoOption);

    state.voices
      .map((voice, index) => ({ voice, index }))
      .sort((a, b) => scoreVoice(b.voice, ui.input.value) - scoreVoice(a.voice, ui.input.value))
      .forEach(({ voice, index }) => {
        const option = doc.createElement("option");
        const gender = voiceGenderHint(voice);
        const genderText = gender === "female"
          ? " · संभावित स्त्री-स्वर"
          : gender === "male" ? " · पुरुष-स्वर नाम" : "";
        const serviceText = voice.localService ? " · डिवाइस" : "";
        option.value = String(index);
        option.textContent = voice.name + " (" + voice.lang + ")" + genderText + serviceText;
        ui.voice.appendChild(option);
      });

    const previousStillExists = previous !== "auto" &&
      state.voices.some((voice, index) => String(index) === previous);
    ui.voice.value = previousStillExists ? previous : "auto";

    if (!state.voices.length) {
      setStatus("डिवाइस से कोई Speech voice उपलब्ध नहीं हुई। Android की Text-to-Speech settings में Hindi या अन्य उपयुक्त voice install करें।", true);
      return;
    }

    const selected = chooseVoice(ui.input.value);
    if (selected && voiceGenderHint(selected) === "female") {
      setStatus("संभावित स्त्री-स्वर उपलब्ध है: " + selected.name + "। आवाज़ की वास्तविक मधुरता और उच्चारण डिवाइस पर निर्भर करेंगे।");
    } else {
      setStatus("डिवाइस की " + state.voices.length + " आवाज़ें उपलब्ध हैं। स्पष्ट स्त्री-स्वर की पहचान नाम से नहीं हो सकी; स्वचालित चयन भाषा और उपलब्धता के आधार पर होगा।", true);
    }
  }

  function chooseVoice(textValue) {
    if (!state.voices.length) return null;
    const selected = ui.voice.value;
    if (selected && selected !== "auto") {
      return state.voices[Number(selected)] || null;
    }
    return state.voices
      .slice()
      .sort((a, b) => scoreVoice(b, textValue) - scoreVoice(a, textValue))[0] || null;
  }

  function speechSupported() {
    return Boolean(synthesis && typeof synthesis.speak === "function" && typeof Utterance === "function");
  }

  function updateButtons() {
    ui.speak.disabled = state.active;
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

  function finish(message, warning) {
    clearNextTimer();
    state.active = false;
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
      if (generation !== state.generation || !state.active) return;
      if (state.navigationPaused) {
        state.waitingForNext = true;
        return;
      }
      speakNext(generation);
    }, 100);
  }

  function speakNext(generation) {
    if (generation !== state.generation || !state.active || state.destroyed) return;

    if (state.index >= state.lines.length) {
      finish("सभी " + state.lines.length + " पंक्तियों का पाठ पूरा हो गया।");
      return;
    }

    if (!speechSupported()) {
      finish("इस डिवाइस पर Speech Synthesis उपलब्ध नहीं है।", true);
      return;
    }

    const line = state.lines[state.index];
    const utterance = new Utterance(line);
    const voice = chooseVoice(line);
    const language = voice && voice.lang ? voice.lang : (isDevanagari(line) ? "hi-IN" : "en-IN");

    if (voice) utterance.voice = voice;
    utterance.lang = language;
    utterance.rate = Math.min(1.15, Math.max(0.65, Number(ui.rate.value) || 0.88));
    utterance.volume = 1;

    // A slight pitch lift is only a tonal preference, not a female-voice synthesizer.
    utterance.pitch = voice && voiceGenderHint(voice) === "female" ? 1.02 : 1.07;

    setLine(line);
    const specialNotice = hasVedicMarks(line)
      ? " · वैदिक स्वर-चिह्न भेजे जा रहे हैं; उनका सही वैदिक गायन voice engine पर निर्भर है।"
      : "";
    setStatus("पंक्ति " + (state.index + 1) + " / " + state.lines.length + " पढ़ी जा रही है: " +
      (voice ? voice.name : "डिवाइस की default voice") + specialNotice);

    utterance.onend = () => {
      if (generation !== state.generation || !state.active) return;
      state.index += 1;
      scheduleNext(generation);
    };

    utterance.onerror = event => {
      if (generation !== state.generation || !state.active) return;
      const error = event && event.error ? event.error : "अज्ञात TTS त्रुटि";
      if (error === "interrupted" || error === "canceled") return;
      finish("पंक्ति " + (state.index + 1) + " पढ़ते समय TTS त्रुटि: " + error, true);
    };

    try {
      synthesis.speak(utterance);
    } catch (error) {
      finish("TTS शुरू नहीं हो सका: " + (error && error.message ? error.message : "अज्ञात त्रुटि"), true);
    }
  }

  function startReading() {
    if (!speechSupported()) {
      setStatus("Speech Synthesis API उपलब्ध नहीं है। Android में system Text-to-Speech voice install/enable करें।", true);
      return;
    }

    const lines = ui.input.value
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setStatus("पहले पाठ लिखें। प्रत्येक नई पंक्ति क्रम से पढ़ी जाएगी।", true);
      ui.input.focus();
      return;
    }

    state.generation += 1;
    const generation = state.generation;
    clearNextTimer();
    synthesis.cancel();

    state.lines = lines;
    state.index = 0;
    state.active = true;
    state.userPaused = false;
    state.navigationPaused = false;
    state.waitingForNext = false;
    updateButtons();
    speakNext(generation);
  }

  function pauseReading() {
    if (!state.active || state.userPaused || state.navigationPaused || !speechSupported()) return;
    state.userPaused = true;
    synthesis.pause();
    setStatus("पाठ रोक दिया गया है। जारी रखने के लिए “फिर शुरू करें” दबाएँ।");
    updateButtons();
  }

  function resumeReading() {
    if (!state.active || (!state.userPaused && !state.navigationPaused) || !speechSupported()) return;
    state.userPaused = false;
    state.navigationPaused = false;
    synthesis.resume();
    setStatus("पाठ फिर से जारी है।");
    updateButtons();
    if (state.waitingForNext) {
      state.waitingForNext = false;
      speakNext(state.generation);
    }
  }

  function stopReading() {
    state.generation += 1;
    if (synthesis && typeof synthesis.cancel === "function") synthesis.cancel();
    finish("पाठ समाप्त कर दिया गया।");
  }

  function onRateInput() {
    ui.rateValue.textContent = Number(ui.rate.value).toFixed(2) + "×";
  }

  function onVoiceChange() {
    const voice = chooseVoice(ui.input.value);
    if (!voice) {
      setStatus("कोई उपयुक्त voice उपलब्ध नहीं है।", true);
      return;
    }
    const gender = voiceGenderHint(voice);
    const note = gender === "female"
      ? "संभावित स्त्री-स्वर चुना गया: "
      : "चुनी हुई आवाज़: ";
    setStatus(note + voice.name + " (" + voice.lang + ")।");
  }

  function onVoicesChanged() {
    const currentValue = ui.voice.value;
    refreshVoices();
    if (currentValue && currentValue !== "auto" &&
        state.voices.some((voice, index) => String(index) === currentValue)) {
      ui.voice.value = currentValue;
    }
  }

  function onHide() {
    if (!state.active || state.userPaused || state.navigationPaused) return;
    state.navigationPaused = true;
    if (state.timer !== null) {
      clearNextTimer();
      state.waitingForNext = true;
    }
    if (speechSupported()) synthesis.pause();
    setStatus("दूसरे पेज पर जाने के कारण TTS अस्थायी रूप से रुका है। वापस आने पर जारी किया जा सकता है।");
    updateButtons();
  }

  function onShow() {
    if (!state.active || !state.navigationPaused) return;
    state.navigationPaused = false;
    if (speechSupported()) synthesis.resume();
    if (state.waitingForNext) {
      state.waitingForNext = false;
      speakNext(state.generation);
    }
    setStatus("TTS पेज फिर खुला है; पाठ जारी है।");
    updateButtons();
  }

  function unmount() {
    state.destroyed = true;
    state.generation += 1;
    clearNextTimer();
    if (synthesis && typeof synthesis.cancel === "function") synthesis.cancel();

    ui.speak.removeEventListener("click", startReading);
    ui.pause.removeEventListener("click", pauseReading);
    ui.resume.removeEventListener("click", resumeReading);
    ui.stop.removeEventListener("click", stopReading);
    ui.rate.removeEventListener("input", onRateInput);
    ui.voice.removeEventListener("change", onVoiceChange);

    if (synthesis && state.voiceListener && typeof synthesis.removeEventListener === "function") {
      synthesis.removeEventListener("voiceschanged", state.voiceListener);
    }

    state.voiceListener = null;
    state.active = false;
    state.lines = [];
    setLine("");
    updateButtons();
  }

  ui.speak.addEventListener("click", startReading);
  ui.pause.addEventListener("click", pauseReading);
  ui.resume.addEventListener("click", resumeReading);
  ui.stop.addEventListener("click", stopReading);
  ui.rate.addEventListener("input", onRateInput);
  ui.voice.addEventListener("change", onVoiceChange);

  onRateInput();
  updateButtons();

  if (speechSupported()) {
    refreshVoices();
    state.voiceListener = onVoicesChanged;
    if (typeof synthesis.addEventListener === "function") {
      synthesis.addEventListener("voiceschanged", state.voiceListener);
    } else {
      synthesis.onvoiceschanged = state.voiceListener;
    }
  } else {
    setStatus("इस ब्राउज़र/डिवाइस में native Speech Synthesis उपलब्ध नहीं है। समर्थित Android Chrome और installed TTS voice आवश्यक है।", true);
    ui.speak.disabled = true;
    ui.pause.disabled = true;
    ui.resume.disabled = true;
    ui.stop.disabled = true;
  }

  return Object.freeze({
    onShow,
    onHide,
    unmount
  });
}

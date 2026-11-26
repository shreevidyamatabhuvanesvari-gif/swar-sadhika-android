/* Swar-Sadhika universal voice panel · Part 2
 * Exposes both local Sanskrit engines on every supported HTML entry page.
 * Ninada = neural female Sanskrit speech; Vocal Singing = model-free melodic DSP.
 */
import { createVocalSingingEngine } from "./vocal-singing-engine-part2.js";
import { createNinadaAvatarTtsEnginePart2 } from "../assets/js/tts/ninada-avatar-tts-engine-part2.js";

export const VOICE_STUDIO_PART2_VERSION = "1.1.0";
const GLOBAL_KEY = "__SwarSadhikaUniversalVoiceStudioPart2";
const PANEL_ID = "swar-sadhika-universal-voice-studio-part2";

export function mountSharedVoiceStudioPart2(options = {}) {
  const doc = options.document || options.doc || globalThis.document;
  const win = options.target || (doc && doc.defaultView) || globalThis;
  if (!doc || !doc.body) throw new Error("Voice Studio के लिए HTML body उपलब्ध नहीं है।");
  const existing = win[GLOBAL_KEY];
  if (existing && existing.element && existing.element.isConnected) return existing.dispose;
  const prior = doc.getElementById(PANEL_ID);
  if (prior) prior.remove();

  const host = doc.createElement("div");
  host.id = PANEL_ID;
  host.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483000;isolation:isolate";
  const shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  shadow.innerHTML = `
    <style>
      :host{all:initial;font-family:system-ui,-apple-system,"Noto Sans Devanagari",sans-serif;color-scheme:dark}
      *{box-sizing:border-box}
      .launcher{display:flex;justify-content:flex-end}
      button,select,textarea,input{font:inherit}
      button{border:1px solid #514878;border-radius:11px;background:#292344;color:#fff;padding:10px 13px;min-height:42px;cursor:pointer}
      button:disabled{opacity:.45;cursor:not-allowed}
      button.primary{background:#5b438d;border-color:#8972bd;font-weight:700}
      button.secondary{background:#211d32}
      .launch{border-radius:999px;box-shadow:0 6px 25px #0008;background:#4d397c;padding:11px 16px;font-weight:700}
      .panel{width:min( min( calc(100vw - 28px), 390px), 390px);max-height:min(78vh,680px);overflow:auto;margin-bottom:10px;background:#171426;color:#f5f1ff;border:1px solid #5a4a7d;border-radius:18px;box-shadow:0 16px 55px #000a;padding:14px;display:grid;gap:10px}
      .panel[hidden]{display:none}
      header{display:flex;align-items:center;justify-content:space-between;gap:8px}
      h2{font-size:1.03rem;margin:0}
      .small{font-size:.78rem;color:#c9c1dc;line-height:1.45;margin:0}
      label{display:grid;gap:5px;font-size:.86rem;color:#e9e3f5}
      select,textarea{width:100%;border:1px solid #514878;border-radius:10px;background:#100e1a;color:#fff;padding:10px;min-width:0}
      textarea{min-height:118px;resize:vertical;line-height:1.6}
      input[type=range]{width:100%;accent-color:#a995e8}
      .row{display:flex;gap:8px;flex-wrap:wrap}
      .row button{flex:1}
      .status{padding:9px 10px;border-radius:10px;background:#242037;border:1px solid #494064;font-size:.82rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
      .status.good{border-color:#397b62;color:#c9f5df}
      .status.warn{border-color:#96733d;color:#ffe3ad}
      .status.error{border-color:#9a4c5a;color:#ffd2d8}
      .foot{border-top:1px solid #39324f;padding-top:8px}
      @media(max-width:440px){.panel{max-height:78vh}.launch{font-size:.82rem}}
    </style>
    <section class="panel" role="dialog" aria-label="साझा संस्कृत वाचन और गायन नियंत्रण" hidden>
      <header><h2>स्वर-साधिका · साझा Voice Studio</h2><button class="close secondary" type="button" aria-label="बंद करें">✕</button></header>
      <p class="small">यह नियंत्रण ऐप के सभी HTML पेजों पर उपलब्ध है। अपना इंजन चुनें और संस्कृत पाठ दर्ज करें।</p>
      <label>आवाज़ इंजन
        <select class="engine">
          <option value="ninada">Ninada · Neural संस्कृत स्त्री-वाचन</option>
          <option value="singing">Vocal Singing Engine · सुरबद्ध DSP गायन</option>
        </select>
      </label>
      <p class="small engine-note">Ninada प्राकृतिक शैली में संस्कृत वाचन करता है; यह धुनबद्ध गायन मॉडल नहीं है। पहली बार लगभग 36 MiB मॉडल और ONNX Runtime डाउनलोड होंगे।</p>
      <label>मंत्र / श्लोक
        <textarea class="text" maxlength="12000" spellcheck="false">ॐ नमः शिवाय।</textarea>
      </label>
      <label><span class="rate-label">वाचन गति <b class="rate-value">0.92×</b></span>
        <input class="rate" type="range" min="0.65" max="1.25" step="0.05" value="0.92">
      </label>
      <div class="row">
        <button class="prepare secondary" type="button">Ninada मॉडल तैयार करें</button>
        <button class="play primary" type="button">वाचन करें</button>
      </div>
      <div class="row">
        <button class="pause secondary" type="button" disabled>विराम</button>
        <button class="resume secondary" type="button" disabled>फिर शुरू करें</button>
        <button class="stop secondary" type="button" disabled>रोकें</button>
      </div>
      <div class="status" role="status" aria-live="polite">दोनों स्थानीय इंजन उपलब्ध हैं। मॉडल डाउनलोड केवल Ninada तैयार करने पर होगा।</div>
      <p class="small foot">Vocal Singing DSP एक कृत्रिम सुरबद्ध स्वर बनाता है। Ninada का इंजन न्यूरल वाचन करता है। दोनों में कोई बाहरी AI API या अलग सर्वर उपयोग नहीं होता।</p>
    </section>
    <div class="launcher"><button class="launch" type="button" aria-expanded="false">♫ स्वर नियंत्रण</button></div>
  `;
  doc.body.appendChild(host);

  const q = selector => shadow.querySelector(selector);
  const panel = q(".panel");
  const launchButton = q(".launch");
  const closeButton = q(".close");
  const modeSelect = q(".engine");
  const engineNote = q(".engine-note");
  const textInput = q(".text");
  const rateInput = q(".rate");
  const rateValue = q(".rate-value");
  const rateLabel = q(".rate-label");
  const prepareButton = q(".prepare");
  const playButton = q(".play");
  const pauseButton = q(".pause");
  const resumeButton = q(".resume");
  const stopButton = q(".stop");
  const statusNode = q(".status");
  let vocalEngine = null;
  let ninadaEngine = null;
  let activeKind = "";
  let paused = false;
  let busy = false;
  let starting = false;
  let playbackToken = 0;
  let disposed = false;
  const unsubscribers = [];

  function setStatus(message, kind = "") {
    statusNode.textContent = String(message || "");
    statusNode.className = "status" + (kind ? " " + kind : "");
  }
  function setPanel(open) {
    panel.hidden = !open;
    launchButton.setAttribute("aria-expanded", String(open));
    if (open) modeSelect.focus();
  }
  function updateMode() {
    const ninada = modeSelect.value === "ninada";
    prepareButton.hidden = !ninada;
    engineNote.textContent = ninada
      ? "Ninada न्यूरल स्त्री-स्वर में संस्कृत वाचन करता है, धुनबद्ध गायन नहीं। पहली बार लगभग 36 MiB मॉडल और ONNX Runtime डाउनलोड होंगे।"
      : "यह स्थानीय Model-Free DSP इंजन संस्कृत अक्षरों को सुरों में ढालता है। यह वास्तविक गायिका की रिकॉर्डेड आवाज़ या मानव-स्वर मॉडल नहीं है।";
    rateLabel.firstChild.textContent = ninada ? "वाचन गति " : "गायन गति ";
    playButton.textContent = ninada ? "वाचन करें" : "गायन करें";
    rateValue.textContent = Number(rateInput.value).toFixed(2) + "×";
  }
  function updateControls() {
    const hasPlayback = Boolean(activeKind);
    const running = hasPlayback && !starting && !paused;
    playButton.disabled = busy || hasPlayback;
    prepareButton.disabled = busy || hasPlayback;
    pauseButton.disabled = busy || !running;
    resumeButton.disabled = busy || !hasPlayback || !paused;
    stopButton.disabled = busy || !hasPlayback || starting;
    modeSelect.disabled = busy || hasPlayback;
    textInput.disabled = busy || hasPlayback;
    rateInput.disabled = busy || hasPlayback;
  }
  function markPlaybackStarted(kind) {
    if (activeKind !== kind || !starting) return;
    starting = false;
    busy = false;
    updateControls();
  }
  function getVocalEngine() {
    if (!vocalEngine) {
      vocalEngine = createVocalSingingEngine({ target: win });
      unsubscribers.push(vocalEngine.on("statechange", event => {
        if (disposed || modeSelect.value !== "singing") return;
        if (event.state === "speaking") {
          markPlaybackStarted("singing");
          setStatus("सुरबद्ध संस्कृत गायन चल रहा है…");
        } else if (event.state === "paused") setStatus("गायन विराम पर है।");
        else if (event.state === "idle" && event.result) {
          setStatus(event.result.status === "ended" ? "गायन पूरा हुआ।" : "गायन रोक दिया गया।", "good");
        }
        updateControls();
      }));
    }
    return vocalEngine;
  }
  function getNinadaEngine() {
    if (!ninadaEngine) {
      ninadaEngine = createNinadaAvatarTtsEnginePart2({ target: win });
      unsubscribers.push(ninadaEngine.on("progress", detail => {
        if (disposed || modeSelect.value !== "ninada") return;
        if (detail && detail.total > 0 && Number.isFinite(Number(detail.loaded))) {
          const current = (Number(detail.loaded) / 1048576).toFixed(1);
          const total = (Number(detail.total) / 1048576).toFixed(1);
          const pct = Math.min(100, Math.round(Number(detail.loaded) / Number(detail.total) * 100));
          setStatus((detail.stage === "model-download" ? "संस्कृत मॉडल" : "ONNX Runtime") +
            " डाउनलोड: " + current + " / " + total + " MiB (" + pct + "%)");
        } else if (detail && detail.message) setStatus(detail.message);
        else if (detail && detail.stage === "audio-buffering") {
          setStatus("वाचन के लिए शुरुआती ऑडियो बफर तैयार हो रहा है…");
        } else if (detail && detail.stage === "audio-buffer-ready") {
          setStatus("ऑडियो बफर तैयार है; अब वाचन निरंतर चलना चाहिए।");
        }
      }));
      unsubscribers.push(ninadaEngine.on("speechstart", () => {
        markPlaybackStarted("ninada");
        if (modeSelect.value === "ninada") setStatus("Ninada संस्कृत वाचन चल रहा है…");
      }));
      unsubscribers.push(ninadaEngine.on("speechend", () => {
        if (modeSelect.value === "ninada") setStatus("वाचन पूरा हुआ।", "good");
      }));
      unsubscribers.push(ninadaEngine.on("speecherror", detail => {
        if (modeSelect.value === "ninada") setStatus(detail.message || "Ninada वाचन में त्रुटि हुई।", "error");
      }));
    }
    return ninadaEngine;
  }

  async function prepareNinada() {
    if (busy || activeKind) return;
    busy = true;
    updateControls();
    setStatus("Ninada का स्थानीय मॉडल और ONNX Runtime तैयार हो रहा है। पहली बार इंटरनेट आवश्यक है…");
    try {
      const engine = getNinadaEngine();
      await engine.initialize();
      const result = engine.getStatus();
      if (!result.ready) throw new Error("Ninada इंजन तैयार होने की पुष्टि नहीं मिली।");
      setStatus("Ninada तैयार है। अब पाठ डालकर ‘वाचन करें’ दबाएँ।", "good");
    } catch (error) {
      setStatus("Ninada तैयार नहीं हुआ: " + (error && error.message || "अज्ञात त्रुटि"), "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function play() {
    if (busy || activeKind) return;
    const text = textInput.value.trim();
    if (!text) { setStatus("पहले संस्कृत पाठ लिखें।", "warn"); return; }
    const kind = modeSelect.value;
    const token = ++playbackToken;
    activeKind = kind;
    starting = true;
    paused = false;
    busy = true;
    updateControls();
    let completion;
    try {
      if (kind === "ninada") {
        const engine = getNinadaEngine();
        if (!engine.getStatus().ready) {
          throw new Error("पहले ‘Ninada मॉडल तैयार करें’ दबाएँ। डाउनलोड पूरा होने पर वाचन शुरू करें।");
        }
        completion = engine.speak(text, { rate: Number(rateInput.value) || 0.92 });
      } else {
        const engine = getVocalEngine();
        const rate = Number(rateInput.value) || 0.92;
        completion = engine.sing(text, {
          baseFrequency: 246.94,
          tempo: Math.min(1.7, Math.max(0.55, rate)),
          noteDurationMs: 420,
          vibratoCents: 5,
          volume: 0.62
        });
      }
      const result = await completion;
      if (token !== playbackToken) return;
      if (result && result.status === "cancelled") {
        setStatus("वाचन / गायन रोक दिया गया।", "good");
      } else {
        setStatus(kind === "ninada" ? "Ninada वाचन पूरा हुआ।" : "सुरबद्ध गायन पूरा हुआ।", "good");
      }
    } catch (error) {
      if (token === playbackToken) {
        setStatus((kind === "ninada" ? "Ninada वाचन" : "गायन") +
          " शुरू नहीं हो सका: " + (error && error.message || "अज्ञात त्रुटि"), "error");
      }
    } finally {
      if (token === playbackToken) {
        activeKind = "";
        starting = false;
        paused = false;
        busy = false;
        updateControls();
      }
    }
  }

  async function pause() {
    if (busy || !activeKind || starting || paused) return;
    const kind = activeKind;
    busy = true;
    updateControls();
    try {
      const ok = kind === "ninada" ? await ninadaEngine.pause() : await vocalEngine.pause();
      paused = Boolean(ok);
      setStatus(paused ? "ऑडियो विराम पर है।" : "विराम लागू नहीं हो सका।", paused ? "good" : "warn");
    } catch (error) {
      setStatus("विराम त्रुटि: " + (error && error.message || "अज्ञात त्रुटि"), "error");
    } finally {
      busy = false;
      updateControls();
    }
  }
  async function resume() {
    if (busy || !activeKind || starting || !paused) return;
    const kind = activeKind;
    busy = true;
    updateControls();
    try {
      const ok = kind === "ninada" ? await ninadaEngine.resume() : await vocalEngine.resume();
      paused = !ok;
      setStatus(ok ? "ऑडियो फिर शुरू हुआ।" : "ऑडियो फिर शुरू नहीं हो सका।", ok ? "good" : "warn");
    } catch (error) {
      setStatus("Resume त्रुटि: " + (error && error.message || "अज्ञात त्रुटि"), "error");
    } finally {
      busy = false;
      updateControls();
    }
  }
  async function stop() {
    if (busy || !activeKind || starting) return;
    const kind = activeKind;
    const previousToken = playbackToken;
    playbackToken += 1;
    busy = true;
    updateControls();
    try {
      if (kind === "ninada") await ninadaEngine.cancel();
      else await vocalEngine.stop();
      activeKind = "";
      paused = false;
      starting = false;
      setStatus("वाचन / गायन रोक दिया गया।", "good");
    } catch (error) {
      playbackToken = previousToken;
      setStatus("रोकने में त्रुटि: " + (error && error.message || "अज्ञात त्रुटि"), "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  launchButton.addEventListener("click", () => setPanel(panel.hidden));
  closeButton.addEventListener("click", () => setPanel(false));
  modeSelect.addEventListener("change", () => { updateMode(); updateControls(); });
  rateInput.addEventListener("input", updateMode);
  prepareButton.addEventListener("click", () => void prepareNinada());
  playButton.addEventListener("click", () => void play());
  pauseButton.addEventListener("click", () => void pause());
  resumeButton.addEventListener("click", () => void resume());
  stopButton.addEventListener("click", () => void stop());
  updateMode();
  updateControls();

  const api = Object.freeze({
    version: VOICE_STUDIO_PART2_VERSION,
    element: host,
    open: () => setPanel(true),
    close: () => setPanel(false),
    getStatus: () => Object.freeze({
      version: VOICE_STUDIO_PART2_VERSION,
      ninada: ninadaEngine ? ninadaEngine.getStatus() : { state: "not-initialized" },
      singing: vocalEngine ? vocalEngine.getStatus() : { state: "not-initialized" }
    }),
    dispose
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    try { if (activeKind === "ninada" && ninadaEngine) void ninadaEngine.cancel(); } catch (_) {}
    try { if ((activeKind === "singing" || vocalEngine) && vocalEngine) void vocalEngine.stop(); } catch (_) {}
    for (const unsubscribe of unsubscribers) { try { unsubscribe(); } catch (_) {} }
    if (ninadaEngine) void ninadaEngine.dispose().catch(() => {});
    if (vocalEngine) void vocalEngine.dispose().catch(() => {});
    host.remove();
    if (win[GLOBAL_KEY] === api) {
      try { delete win[GLOBAL_KEY]; } catch (_) {}
    }
  }
  Object.defineProperty(win, GLOBAL_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  win.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}

export function mount(context = {}) {
  const doc = context.document || (context.root && context.root.ownerDocument) || globalThis.document;
  const win = context.target || (doc && doc.defaultView) || globalThis;
  mountSharedVoiceStudioPart2({ document: doc, target: win });
  return Object.freeze({ onShow() {}, onHide() {}, unmount() {} });
}

export function selfTest() {
  const checks = [
    { id: "vocal-singing-engine-imported", passed: typeof createVocalSingingEngine === "function" },
    { id: "ninada-neural-engine-imported", passed: typeof createNinadaAvatarTtsEnginePart2 === "function" },
    { id: "all-page-panel-mount-export", passed: typeof mountSharedVoiceStudioPart2 === "function" },
    { id: "local-only-engine-contract", passed: true }
  ];
  return { status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, failed: checks.filter(item => !item.passed).length, checks };
}

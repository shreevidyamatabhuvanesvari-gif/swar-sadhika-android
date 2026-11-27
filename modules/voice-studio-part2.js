/* Swar-Sadhika universal voice panel · Part 2
 * Model-free Sanskrit vocal singing only.
 * Local Web Audio DSP; no neural voice model, remote API, or model download.
 * Human-like naturalness remains a measured development goal, not a guaranteed claim.
 */
import { createVocalSingingEngine } from "./vocal-singing-engine-part2.js";

export const VOICE_STUDIO_PART2_VERSION = "1.2.0";
const ENGINE_ID = "model-free-vocal-singing";
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
      button,textarea,input{font:inherit}
      button{border:1px solid #514878;border-radius:11px;background:#292344;color:#fff;padding:10px 13px;min-height:42px;cursor:pointer}
      button:disabled{opacity:.45;cursor:not-allowed}
      button.primary{background:#5b438d;border-color:#8972bd;font-weight:700}
      button.secondary{background:#211d32}
      .launch{border-radius:999px;box-shadow:0 6px 25px #0008;background:#4d397c;padding:11px 16px;font-weight:700}
      .panel{width:min(calc(100vw - 28px),390px);max-height:min(78vh,680px);overflow:auto;margin-bottom:10px;background:#171426;color:#f5f1ff;border:1px solid #5a4a7d;border-radius:18px;box-shadow:0 16px 55px #000a;padding:14px;display:grid;gap:10px}
      .panel[hidden]{display:none}
      header{display:flex;align-items:center;justify-content:space-between;gap:8px}
      h2{font-size:1.03rem;margin:0}
      .small{font-size:.78rem;color:#c9c1dc;line-height:1.45;margin:0}
      label{display:grid;gap:5px;font-size:.86rem;color:#e9e3f5}
      textarea{width:100%;border:1px solid #514878;border-radius:10px;background:#100e1a;color:#fff;padding:10px;min-width:0;min-height:118px;resize:vertical;line-height:1.6}
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
    <section class="panel" role="dialog" aria-label="मॉडल-मुक्त संस्कृत स्वर और गायन नियंत्रण" hidden>
      <header><h2>स्वर-साधिका · Voice Studio</h2><button class="close secondary" type="button" aria-label="बंद करें">✕</button></header>
      <p class="small">एकल स्थानीय स्वर इंजन · बिना Neural Voice Model · बिना बाहरी AI सेवा।</p>
      <p class="small engine-note">यह संस्करण संस्कृत पाठ को Model-Free Web Audio DSP से सुरबद्ध करता है। अभी यह कृत्रिम स्त्री-सदृश स्वर का प्रारंभिक आधार है; वास्तविक मानव-स्वर जैसी स्वाभाविकता अगली Engine-विकास अवस्था का लक्ष्य है।</p>
      <label>मंत्र / श्लोक
        <textarea class="text" maxlength="12000" spellcheck="false">ॐ नमः शिवाय।</textarea>
      </label>
      <label><span class="rate-label">गायन गति <b class="rate-value">0.90×</b></span>
        <input class="rate" type="range" min="0.65" max="1.25" step="0.01" value="0.90">
      </label>
      <div class="row">
        <button class="play primary" type="button">गायन करें</button>
      </div>
      <div class="row">
        <button class="pause secondary" type="button" disabled>विराम</button>
        <button class="resume secondary" type="button" disabled>फिर शुरू करें</button>
        <button class="stop secondary" type="button" disabled>रोकें</button>
      </div>
      <div class="status" role="status" aria-live="polite">मॉडल-मुक्त Vocal Singing Engine तैयार है। आवाज़ स्थानीय Web Audio DSP से बनेगी; कोई Voice Model डाउनलोड नहीं होगा।</div>
      <p class="small foot">वर्तमान इंजन सुरबद्ध कृत्रिम स्वर बनाता है, रिकॉर्ड की गई मानव आवाज नहीं। अगला Engine सुधार Glottal Source, Vocal Tract और संस्कृत उच्चारण की प्राकृतिकता पर केंद्रित होगा।</p>
    </section>
    <div class="launcher"><button class="launch" type="button" aria-expanded="false">♫ स्वर नियंत्रण</button></div>
  `;
  doc.body.appendChild(host);

  const q = selector => shadow.querySelector(selector);
  const panel = q(".panel");
  const launchButton = q(".launch");
  const closeButton = q(".close");
  const textInput = q(".text");
  const rateInput = q(".rate");
  const rateValue = q(".rate-value");
  const playButton = q(".play");
  const pauseButton = q(".pause");
  const resumeButton = q(".resume");
  const stopButton = q(".stop");
  const statusNode = q(".status");

  let vocalEngine = null;
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
    if (open) textInput.focus();
    else launchButton.focus();
  }

  function updateRate() {
    rateValue.textContent = Number(rateInput.value).toFixed(2) + "×";
  }

  function updateControls() {
    const hasPlayback = activeKind === "singing";
    playButton.disabled = busy || hasPlayback;
    pauseButton.disabled = busy || !hasPlayback || starting || paused;
    resumeButton.disabled = busy || !hasPlayback || starting || !paused;
    stopButton.disabled = busy || !hasPlayback || starting;
    textInput.disabled = busy || hasPlayback;
    rateInput.disabled = busy || hasPlayback;
  }

  function markPlaybackStarted() {
    if (activeKind !== "singing" || !starting) return;
    starting = false;
    busy = false;
    updateControls();
  }

  function getVocalEngine() {
    if (!vocalEngine) {
      vocalEngine = createVocalSingingEngine({ target: win });
      unsubscribers.push(vocalEngine.on("statechange", event => {
        if (disposed) return;
        if (event.state === "speaking") {
          markPlaybackStarted();
          setStatus("सुरबद्ध संस्कृत गायन चल रहा है…");
        } else if (event.state === "paused") {
          setStatus("गायन विराम पर है।");
        } else if (event.state === "idle" && event.result) {
          setStatus(
            event.result.status === "ended" ? "गायन पूरा हुआ।" : "गायन रोक दिया गया।",
            "good"
          );
        }
        updateControls();
      }));
    }
    return vocalEngine;
  }

  async function play() {
    if (disposed || busy || activeKind) return;
    const text = textInput.value.trim();
    if (!text) {
      setStatus("पहले संस्कृत पाठ लिखें।", "warn");
      return;
    }

    const token = ++playbackToken;
    activeKind = "singing";
    starting = true;
    paused = false;
    busy = true;
    updateControls();

    try {
      const engine = getVocalEngine();
      const rate = Number(rateInput.value) || 0.90;
      const result = await engine.sing(text, {
        baseFrequency: 246.94,
        tempo: Math.min(1.7, Math.max(0.55, rate)),
        noteDurationMs: 420,
        vibratoCents: 5,
        volume: 0.62
      });

      if (token !== playbackToken) return;
      if (result && result.status === "cancelled") {
        setStatus("गायन रोक दिया गया।", "good");
      } else {
        setStatus("सुरबद्ध गायन पूरा हुआ।", "good");
      }
    } catch (error) {
      if (token === playbackToken) {
        setStatus(
          "गायन शुरू नहीं हो सका: " + (error && error.message || "अज्ञात त्रुटि"),
          "error"
        );
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
    if (busy || activeKind !== "singing" || starting || paused || !vocalEngine) return;
    busy = true;
    updateControls();
    try {
      const ok = await vocalEngine.pause();
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
    if (busy || activeKind !== "singing" || starting || !paused || !vocalEngine) return;
    busy = true;
    updateControls();
    try {
      const ok = await vocalEngine.resume();
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
    if (busy || activeKind !== "singing" || starting || !vocalEngine) return;
    const previousToken = playbackToken;
    playbackToken += 1;
    busy = true;
    updateControls();
    try {
      await vocalEngine.stop();
      activeKind = "";
      paused = false;
      starting = false;
      setStatus("गायन रोक दिया गया।", "good");
    } catch (error) {
      playbackToken = previousToken;
      setStatus("रोकने में त्रुटि: " + (error && error.message || "अज्ञात त्रुटि"), "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && !panel.hidden) setPanel(false);
  }

  launchButton.addEventListener("click", () => setPanel(panel.hidden));
  closeButton.addEventListener("click", () => setPanel(false));
  rateInput.addEventListener("input", updateRate);
  playButton.addEventListener("click", () => void play());
  pauseButton.addEventListener("click", () => void pause());
  resumeButton.addEventListener("click", () => void resume());
  stopButton.addEventListener("click", () => void stop());
  shadow.addEventListener("keydown", handleKeydown);
  updateRate();
  updateControls();

  const api = Object.freeze({
    version: VOICE_STUDIO_PART2_VERSION,
    engine: ENGINE_ID,
    element: host,
    open: () => setPanel(true),
    close: () => setPanel(false),
    getStatus: () => Object.freeze({
      version: VOICE_STUDIO_PART2_VERSION,
      engine: ENGINE_ID,
      ninada: Object.freeze({
        state: "deferred-by-project-lock",
        ready: false,
        modelLoaded: false,
        externalNetworkRequests: 0
      }),
      singing: vocalEngine
        ? vocalEngine.getStatus()
        : Object.freeze({
          state: "not-initialized",
          modelLoaded: false,
          externalNetworkRequests: 0
        }),
      modelLoaded: false,
      externalNetworkRequests: 0
    }),
    dispose
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    playbackToken += 1;
    try {
      if (vocalEngine && activeKind === "singing") void vocalEngine.stop();
    } catch (_) {}
    for (const unsubscribe of unsubscribers) {
      try { unsubscribe(); } catch (_) {}
    }
    if (vocalEngine) void vocalEngine.dispose().catch(() => {});
    host.remove();
    if (win[GLOBAL_KEY] === api) {
      try { delete win[GLOBAL_KEY]; } catch (_) {}
    }
  }

  Object.defineProperty(win, GLOBAL_KEY, {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false
  });
  win.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}

export function mount(context = {}) {
  const doc = context.document || (context.root && context.root.ownerDocument) || globalThis.document;
  const win = context.target || (doc && doc.defaultView) || globalThis;
  mountSharedVoiceStudioPart2({ document: doc, target: win });
  return Object.freeze({ onShow() {}, onHide() {}, unmount() {} });
}

export async function selfTest() {
  const probe = createVocalSingingEngine({ target: {} });
  const runtime = probe.getStatus();
  const checks = [
    { id: "model-free-vocal-engine-imported", passed: typeof createVocalSingingEngine === "function" },
    {
      id: "model-free-runtime-contract",
      passed: runtime.modelLoaded === false && runtime.externalNetworkRequests === 0 &&
        runtime.outputMode === "model-free-adaptive-glottal-formant-dsp"
    },
    {
      id: "voice-only-singing-contract",
      passed: runtime.voiceOnly === true && runtime.accompaniment === false
    },
    { id: "single-engine-studio-contract", passed: ENGINE_ID === "model-free-vocal-singing" },
    { id: "shared-panel-mount-export", passed: typeof mountSharedVoiceStudioPart2 === "function" }
  ];
  await probe.dispose();
  return {
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks
  };
}

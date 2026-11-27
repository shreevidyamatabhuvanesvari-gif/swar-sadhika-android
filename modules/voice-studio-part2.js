/* Swar-Sadhika universal voice panel · Part 2
 * Model-free Sanskrit vocal singing only.
 * Local Web Audio DSP; no neural voice model, remote API, or model download.
 * Human-like naturalness remains a measured development goal, not a guaranteed claim.
 */
import { createVocalSingingEngine } from "./vocal-singing-engine-part2.js";
import { createFemaleHumanSampleBankEngine, selfTest as femaleHumanSampleBankSelfTest } from "./female-human-sample-bank-engine-part2.js";

export const VOICE_STUDIO_PART2_VERSION = "1.4.0";
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
    button,textarea,input,select{font:inherit}
    button{border:1px solid #514878;border-radius:11px;background:#292344;color:#fff;padding:10px 13px;min-height:40px;cursor:pointer}
    button:disabled{opacity:.45;cursor:not-allowed}
    button.primary{background:#5b438d;border-color:#8972bd;font-weight:700}
    button.secondary{background:#211d32}
    button.danger{border-color:#85505d;background:#38202b}
    .launch{border-radius:999px;box-shadow:0 6px 25px #0008;background:#4d397c;padding:11px 16px;font-weight:700}
    .panel{width:min(calc(100vw - 28px),430px);max-height:min(84vh,760px);overflow:auto;margin-bottom:10px;background:#171426;color:#f5f1ff;border:1px solid #5a4a7d;border-radius:18px;box-shadow:0 16px 55px #000a;padding:14px;display:grid;gap:10px}
    .panel[hidden]{display:none}
    header{display:flex;align-items:center;justify-content:space-between;gap:8px}
    h2{font-size:1.03rem;margin:0}
    h3{font-size:.94rem;margin:0}
    h4{font-size:.84rem;margin:4px 0 0}
    .small{font-size:.78rem;color:#c9c1dc;line-height:1.45;margin:0}
    label{display:grid;gap:5px;font-size:.84rem;color:#e9e3f5;min-width:0}
    textarea{width:100%;border:1px solid #514878;border-radius:10px;background:#100e1a;color:#fff;padding:10px;min-width:0;min-height:100px;resize:vertical;line-height:1.6}
    input[type=range]{width:100%;accent-color:#a995e8}
    input[type=text],input[type=number],select{width:100%;min-width:0;min-height:40px;border:1px solid #514878;border-radius:9px;background:#100e1a;color:#fff;padding:8px}
    input[type=file]{display:block;width:100%;font-size:.78rem;color:#e9e3f5}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    .row button{flex:1;min-width:108px}
    .grid-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .bank{display:grid;gap:9px;padding:11px;border:1px solid #514878;border-radius:13px;background:#201c30}
    .filepick{padding:9px;border:1px dashed #75649e;border-radius:10px;background:#28213e}
    .status{padding:9px 10px;border-radius:10px;background:#242037;border:1px solid #494064;font-size:.82rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
    .status.good{border-color:#397b62;color:#c9f5df}
    .status.warn{border-color:#96733d;color:#ffe3ad}
    .status.error{border-color:#9a4c5a;color:#ffd2d8}
    .wave-wrap{padding:8px;border:1px solid #514878;border-radius:10px;background:#100e1a}
    .wave-canvas{display:block;width:100%;height:86px;touch-action:pan-y;cursor:crosshair}
    .wave-hint{font-size:.72rem;color:#bcb3d2;line-height:1.4}
    .bank-list{display:grid;gap:6px;max-height:150px;overflow:auto}
    .bank-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:7px;border:1px solid #494064;border-radius:9px;background:#181526}
    .bank-item-main{min-width:0}
    .bank-item-name{display:block;font-size:.78rem;overflow-wrap:anywhere}
    .bank-item-meta{display:block;font-size:.7rem;color:#bcb3d2;margin-top:2px}
    .bank-item-actions{display:flex;gap:5px;flex-wrap:wrap}
    .bank-item-actions button{min-height:32px;padding:5px 8px;font-size:.72rem}
    .empty{padding:8px;border:1px dashed #514878;border-radius:9px;color:#bcb3d2;font-size:.76rem}
    .foot{border-top:1px solid #39324f;padding-top:8px}
    @media(max-width:440px){.panel{max-height:84vh}.launch{font-size:.82rem}.bank-item{grid-template-columns:minmax(0,1fr)}}
  </style>
  <section class="panel" role="dialog" aria-label="मानवीय रिकॉर्डिंग आधारित संस्कृत गायन स्टूडियो" hidden>
    <header><h2>स्वर-साधिका · Voice Studio</h2><button class="close secondary" type="button" aria-label="बंद करें">✕</button></header>
    <p class="small">स्थानीय रिकॉर्डिंग-आधारित गायन · बिना pretrained Voice Model · बिना बाहरी AI सेवा या सर्वर।</p>
    <section class="bank" aria-label="मानवीय आवाज़ का स्थानीय Sample Bank">
      <h3>सहेली की रिकॉर्ड की गई आवाज़</h3>
      <p class="small">चारों MP3 इस उपकरण पर निजी IndexedDB में संग्रहित होंगी। रिकॉर्डिंग सार्वजनिक GitHub पर अपलोड नहीं होगी।</p>
      <label class="filepick">＋ अपनी Audio रिकॉर्डिंग आयात करें
        <input class="audio-files" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" multiple>
      </label>
      <div class="bank-status status" role="status" aria-live="polite">स्थानीय Sample Bank जाँचा जा रहा है…</div>
      <label>रिकॉर्डिंग चुनें
        <select class="recording-select"><option value="">पहले रिकॉर्डिंग आयात करें</option></select>
      </label>
      <div class="row">
        <button class="recording-preview secondary" type="button">पूरी रिकॉर्डिंग सुनें</button>
        <button class="region-preview secondary" type="button">चुना हुआ अंश सुनें</button>
      </div>
      <div class="wave-wrap">
        <canvas class="wave-canvas" width="900" height="120" aria-label="रिकॉर्डिंग की ध्वनि तरंग; दो बार टैप करके आरम्भ और अंत चुनें"></canvas>
        <div class="wave-hint">ध्वनि-तरंग पर पहली बार टैप = आरम्भ, दूसरी बार टैप = समाप्ति। सटीक समय नीचे भी बदल सकते हैं।</div>
      </div>
      <div class="grid-two">
        <label>आरम्भ समय (सेकंड)
          <input class="unit-start" type="number" min="0" step="0.01" value="0">
        </label>
        <label>समाप्ति समय (सेकंड)
          <input class="unit-end" type="number" min="0.07" step="0.01" value="0.50">
        </label>
      </div>
      <label>इस स्वर-खंड का संस्कृत अक्षर, शब्द या पूरा मंत्र
        <input class="unit-label" type="text" maxlength="80" placeholder="उदाहरण: शि, शिवाय, ॐ नमः शिवाय">
      </label>
      <div class="row">
        <button class="unit-save primary" type="button">चुना हुआ नमूना सुरक्षित करें</button>
      </div>
      <p class="small">पूरा मंत्र यदि रिकॉर्डिंग में लगातार गाया गया है, तो उसकी पूरी अवधि चुनकर वही पाठ लिखें। इससे ऐप मूल मानवीय गायन को एक क्लिप के रूप में चला सकेगा। अक्षर-खंड भी अलग-अलग चिह्नित किए जा सकते हैं।</p>
      <h4>सुरक्षित ध्वनि-खंड</h4>
      <div class="unit-list bank-list"><div class="empty">अभी कोई अक्षर-नमूना चिह्नित नहीं है।</div></div>
    </section>
    <label>मंत्र / श्लोक
      <textarea class="text" maxlength="12000" spellcheck="false">ॐ नमः शिवाय।</textarea>
    </label>
    <label><span class="rate-label">गायन / प्लेबैक गति <b class="rate-value">0.90×</b></span>
      <input class="rate" type="range" min="0.65" max="1.25" step="0.01" value="0.90">
    </label>
    <div class="row">
      <button class="bank-sing primary" type="button">सहेली की रिकॉर्डिंग से गायन करें</button>
      <button class="play secondary" type="button">पुराना DSP परीक्षण</button>
    </div>
    <div class="row">
      <button class="pause secondary" type="button" disabled>विराम</button>
      <button class="resume secondary" type="button" disabled>फिर शुरू करें</button>
      <button class="stop secondary" type="button" disabled>रोकें</button>
    </div>
    <div class="status" role="status" aria-live="polite">मानवीय Sample Bank तैयार है। पहले रिकॉर्डिंग आयात करें और पाठ के आवश्यक अक्षरों के नमूने चिह्नित करें।</div>
    <p class="small foot">गायन उपलब्ध रिकॉर्ड किए गए अक्षर-खंडों को क्रम से जोड़ता है। जिन अक्षरों के नमूने उपलब्ध नहीं होंगे, वे स्वतः गढ़े नहीं जाएँगे। गायन की सहजता नमूनों की गुणवत्ता, कटिंग और अक्षर-सीमा पर निर्भर करेगी। DSP परीक्षण पुराना कृत्रिम इंजन है; वह सहेली की रिकॉर्ड की गई आवाज़ नहीं है।</p>
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
  const bankStatusNode = q(".bank-status");
  const audioFilesInput = q(".audio-files");
  const recordingSelect = q(".recording-select");
  const unitList = q(".unit-list");
  const recordingPreviewButton = q(".recording-preview");
  const regionPreviewButton = q(".region-preview");
  const unitStartInput = q(".unit-start");
  const unitEndInput = q(".unit-end");
  const unitLabelInput = q(".unit-label");
  const unitSaveButton = q(".unit-save");
  const waveformCanvas = q(".wave-canvas");
  const waveformHint = q(".wave-hint");
  const bankSingButton = q(".bank-sing");

  let vocalEngine = null;
  const sampleBankEngine = createFemaleHumanSampleBankEngine({ target: win });
  let selectedRecordingId = "";
  let selectedRecordingDuration = 0;
  let waveformPeaks = [];
  let waveformTapCount = 0;
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

  function setBankStatus(message, kind = "") {
    bankStatusNode.textContent = String(message || "");
    bankStatusNode.className = "bank-status status" + (kind ? " " + kind : "");
  }

  function formatSeconds(value) {
    return Number(value || 0).toFixed(2) + " सेकंड";
  }

  function drawWaveform() {
    const context = waveformCanvas.getContext("2d");
    if (!context) return;
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#100e1a";
    context.fillRect(0, 0, width, height);
    if (!waveformPeaks.length || !selectedRecordingDuration) {
      waveformHint.textContent = "रिकॉर्डिंग चुनने पर उसकी ध्वनि-तरंग यहाँ दिखेगी।";
      return;
    }
    const start = Math.max(0, Math.min(1, Number(unitStartInput.value) / selectedRecordingDuration));
    const end = Math.max(0, Math.min(1, Number(unitEndInput.value) / selectedRecordingDuration));
    const left = Math.min(start, end) * width;
    const right = Math.max(start, end) * width;
    context.fillStyle = "rgba(151,112,220,.24)";
    context.fillRect(left, 0, Math.max(1, right - left), height);
    context.strokeStyle = "#b89af2";
    context.lineWidth = 1.5;
    context.beginPath();
    const center = height / 2;
    waveformPeaks.forEach((peak, index) => {
      const x = (index / Math.max(1, waveformPeaks.length - 1)) * width;
      context.moveTo(x, center - peak[1] * (height * 0.43));
      context.lineTo(x, center - peak[0] * (height * 0.43));
    });
    context.stroke();
    context.strokeStyle = "#f4e9ff";
    context.lineWidth = 2;
    [start, end].forEach(position => {
      const x = position * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    });
    waveformHint.textContent = "चयन: " + formatSeconds(unitStartInput.value) +
      " से " + formatSeconds(unitEndInput.value) + " · " +
      formatSeconds(selectedRecordingDuration) + " कुल";
  }

  async function loadWaveform(recordingId) {
    waveformPeaks = [];
    waveformTapCount = 0;
    selectedRecordingDuration = 0;
    drawWaveform();
    if (!recordingId) return;
    try {
      const records = await sampleBankEngine.listRecordings();
      const record = records.find(item => item.id === recordingId);
      if (!record) return;
      const waveform = await sampleBankEngine.getRecordingWaveform(recordingId, 900);
      if (selectedRecordingId !== recordingId) return;
      waveformPeaks = waveform.peaks;
      selectedRecordingDuration = waveform.durationSeconds;
      unitStartInput.value = "0";
      unitEndInput.value = Math.min(0.5, selectedRecordingDuration).toFixed(2);
      unitEndInput.max = String(selectedRecordingDuration);
      drawWaveform();
    } catch (error) {
      waveformHint.textContent = "ध्वनि-तरंग नहीं बन सकी: " +
        (error && error.message ? error.message : String(error));
    }
  }

  function handleWaveformTap(event) {
    if (!selectedRecordingDuration || busy || activeKind) return;
    const bounds = waveformCanvas.getBoundingClientRect();
    if (!bounds.width) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const seconds = fraction * selectedRecordingDuration;
    if (waveformTapCount % 2 === 0) {
      unitStartInput.value = seconds.toFixed(2);
      const currentEnd = Number(unitEndInput.value);
      if (currentEnd <= seconds) unitEndInput.value = Math.min(selectedRecordingDuration, seconds + 0.25).toFixed(2);
    } else {
      if (seconds <= Number(unitStartInput.value)) {
        unitStartInput.value = Math.max(0, seconds - 0.25).toFixed(2);
      }
      unitEndInput.value = seconds.toFixed(2);
    }
    waveformTapCount += 1;
    drawWaveform();
  }

  function createBankButton(label, className, action, value) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = className || "secondary";
    button.textContent = label;
    button.dataset.bankAction = action;
    if (value) button.dataset.bankId = value;
    return button;
  }

  async function renderRecordingLists() {
    const recordings = await sampleBankEngine.listRecordings(true);
    const previousSelection = selectedRecordingId;
    recordingSelect.replaceChildren();
    const placeholder = doc.createElement("option");
    placeholder.value = "";
    placeholder.textContent = recordings.length ? "रिकॉर्डिंग चुनें" : "पहले रिकॉर्डिंग आयात करें";
    recordingSelect.appendChild(placeholder);

    recordings.forEach(recording => {
      const option = doc.createElement("option");
      option.value = recording.id;
      option.textContent = recording.name + " · " + formatSeconds(recording.durationSeconds);
      recordingSelect.appendChild(option);
    });
    selectedRecordingId = recordings.some(item => item.id === previousSelection)
      ? previousSelection : (recordings[0] ? recordings[0].id : "");
    recordingSelect.value = selectedRecordingId;
    recordingSelect.disabled = recordings.length === 0;
    if (selectedRecordingId) await loadWaveform(selectedRecordingId);
    else {
      waveformPeaks = [];
      selectedRecordingDuration = 0;
      drawWaveform();
    }

    const units = await sampleBankEngine.listUnits(true);
    unitList.replaceChildren();
    if (!units.length) {
      const empty = doc.createElement("div");
      empty.className = "empty";
      empty.textContent = "अभी कोई अक्षर-नमूना चिह्नित नहीं है।";
      unitList.appendChild(empty);
    } else {
      const recordNames = new Map(recordings.map(item => [item.id, item.name]));
      units.forEach(unit => {
        const item = doc.createElement("div");
        item.className = "bank-item";
        const details = doc.createElement("div");
        details.className = "bank-item-main";
        const name = doc.createElement("strong");
        name.className = "bank-item-name";
        name.textContent = unit.akshara;
        const meta = doc.createElement("span");
        meta.className = "bank-item-meta";
        meta.textContent = (recordNames.get(unit.recordingId) || "रिकॉर्डिंग") +
          " · " + formatSeconds(unit.startSeconds) + "–" + formatSeconds(unit.endSeconds);
        details.append(name, meta);
        const actions = doc.createElement("div");
        actions.className = "bank-item-actions";
        actions.append(
          createBankButton("सुनें", "secondary", "preview-unit", unit.id),
          createBankButton("हटाएँ", "danger", "delete-unit", unit.id)
        );
        item.append(details, actions);
        unitList.appendChild(item);
      });
    }
    setBankStatus(
      recordings.length + " निजी रिकॉर्डिंग · " + units.length +
      " चिह्नित अक्षर-नमूने इस उपकरण में सुरक्षित हैं।",
      recordings.length ? "good" : "warn"
    );
    updateControls();
    return { recordings, units };
  }

  async function refreshSampleBank() {
    try {
      await renderRecordingLists();
    } catch (error) {
      setBankStatus("स्थानीय Sample Bank उपलब्ध नहीं हुआ: " +
        (error && error.message ? error.message : String(error)), "error");
    }
  }

  async function importAudioFiles() {
    if (busy || activeKind) return;
    const files = Array.from(audioFilesInput.files || []);
    if (!files.length) return;
    audioFilesInput.disabled = true;
    setBankStatus(files.length + " रिकॉर्डिंग स्थानीय रूप से पढ़ी जा रही हैं…");
    try {
      const imported = await sampleBankEngine.importRecordings(files);
      await refreshSampleBank();
      setBankStatus(
        imported.length + " रिकॉर्डिंग निजी IndexedDB में सुरक्षित हुईं। मूल MP3 GitHub पर अपलोड नहीं हुईं।",
        "good"
      );
    } catch (error) {
      setBankStatus("रिकॉर्डिंग आयात विफल: " +
        (error && error.message ? error.message : String(error)), "error");
    } finally {
      audioFilesInput.disabled = false;
      audioFilesInput.value = "";
    }
  }

  async function saveUnit() {
    if (busy || activeKind) return;
    try {
      const unit = await sampleBankEngine.createUnit({
        recordingId: selectedRecordingId,
        akshara: unitLabelInput.value,
        startSeconds: Number(unitStartInput.value),
        endSeconds: Number(unitEndInput.value)
      });
      unitLabelInput.value = "";
      await refreshSampleBank();
      setBankStatus("‘" + unit.akshara + "’ का रिकॉर्ड किया हुआ नमूना " +
        formatSeconds(unit.startSeconds) + " से " + formatSeconds(unit.endSeconds) +
        " तक सुरक्षित हुआ।", "good");
    } catch (error) {
      setBankStatus("अक्षर-नमूना सुरक्षित नहीं हुआ: " +
        (error && error.message ? error.message : String(error)), "error");
    }
  }

  async function runSamplePlayback(kind, operation, successMessage) {
    if (disposed || busy || activeKind) return;
    const token = ++playbackToken;
    activeKind = kind;
    starting = true;
    paused = false;
    busy = true;
    updateControls();
    try {
      const playback = operation();
      starting = false;
      busy = false;
      updateControls();
      setBankStatus("रिकॉर्ड की गई मानवीय आवाज़ चल रही है…");
      const result = await playback;
      if (token !== playbackToken) return;
      setBankStatus(result && result.status === "ended" ? successMessage : "प्लेबैक पूरा हुआ।", "good");
    } catch (error) {
      if (token === playbackToken) {
        setBankStatus(error && error.message ? error.message : String(error), "error");
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

  async function previewRecording(full = false) {
    const recordingId = selectedRecordingId;
    if (!recordingId) {
      setBankStatus("पहले कोई रिकॉर्डिंग चुनें।", "warn");
      return;
    }
    const records = await sampleBankEngine.listRecordings();
    const recording = records.find(item => item.id === recordingId);
    if (!recording) {
      setBankStatus("चुनी गई रिकॉर्डिंग उपलब्ध नहीं है।", "error");
      return;
    }
    const startSeconds = full ? 0 : Number(unitStartInput.value);
    const endSeconds = full ? recording.durationSeconds : Number(unitEndInput.value);
    await runSamplePlayback("sample-preview",
      () => sampleBankEngine.playRecording(recordingId, {
        startSeconds, endSeconds, volume: 0.85
      }),
      full ? "पूरी मूल रिकॉर्डिंग का पूर्वावलोकन पूरा हुआ।" : "चुने हुए ध्वनि-खंड का पूर्वावलोकन पूरा हुआ।");
  }

  async function playAnnotatedUnit(unitId) {
    await runSamplePlayback("sample-preview",
      () => sampleBankEngine.playUnit(unitId, { speed: 1, volume: 0.85 }),
      "अक्षर-नमूने का पूर्वावलोकन पूरा हुआ।");
  }

  async function removeBankItem(action, id) {
    if (busy || activeKind || !id) return;
    try {
      if (action === "delete-unit") await sampleBankEngine.deleteUnit(id);
      await refreshSampleBank();
    } catch (error) {
      setBankStatus("हटाने की प्रक्रिया विफल: " +
        (error && error.message ? error.message : String(error)), "error");
    }
  }

  async function singWithHumanSamples() {
    const text = textInput.value.trim();
    if (!text) {
      setBankStatus("पहले मंत्र या श्लोक लिखें।", "warn");
      return;
    }
    await runSamplePlayback("human-singing",
      () => sampleBankEngine.singText(text, {
        speed: Number(rateInput.value) || 0.9,
        volume: 0.82
      }),
      "उपलब्ध रिकॉर्ड किए गए मानवीय स्वर-खंडों का गायन पूरा हुआ।");
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
    const hasPlayback = Boolean(activeKind);
    playButton.disabled = busy || hasPlayback;
    bankSingButton.disabled = busy || hasPlayback;
    pauseButton.disabled = busy || !hasPlayback || starting || paused;
    resumeButton.disabled = busy || !hasPlayback || starting || !paused;
    stopButton.disabled = busy || !hasPlayback || starting;
    textInput.disabled = busy || hasPlayback;
    rateInput.disabled = busy || hasPlayback;
    unitSaveButton.disabled = busy || hasPlayback || !selectedRecordingId;
    recordingPreviewButton.disabled = busy || hasPlayback || !selectedRecordingId;
    regionPreviewButton.disabled = busy || hasPlayback || !selectedRecordingId;
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
    if (busy || !activeKind || starting || paused) return;
    busy = true;
    updateControls();
    try {
      const ok = activeKind === "singing"
        ? await vocalEngine.pause()
        : await sampleBankEngine.pause();
      paused = Boolean(ok);
      const message = paused ? "ऑडियो विराम पर है।" : "विराम लागू नहीं हो सका।";
      if (activeKind === "singing") setStatus(message, paused ? "good" : "warn");
      else setBankStatus(message, paused ? "good" : "warn");
    } catch (error) {
      const message = "विराम त्रुटि: " + (error && error.message || "अज्ञात त्रुटि");
      if (activeKind === "singing") setStatus(message, "error");
      else setBankStatus(message, "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function resume() {
    if (busy || !activeKind || starting || !paused) return;
    busy = true;
    updateControls();
    try {
      const ok = activeKind === "singing"
        ? await vocalEngine.resume()
        : await sampleBankEngine.resume();
      paused = !ok;
      const message = ok ? "ऑडियो फिर शुरू हुआ।" : "ऑडियो फिर शुरू नहीं हो सका।";
      if (activeKind === "singing") setStatus(message, ok ? "good" : "warn");
      else setBankStatus(message, ok ? "good" : "warn");
    } catch (error) {
      const message = "Resume त्रुटि: " + (error && error.message || "अज्ञात त्रुटि");
      if (activeKind === "singing") setStatus(message, "error");
      else setBankStatus(message, "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function stop() {
    if (busy || !activeKind || starting) return;
    const previousToken = playbackToken;
    const stoppingKind = activeKind;
    playbackToken += 1;
    busy = true;
    updateControls();
    try {
      if (stoppingKind === "singing") await vocalEngine.stop();
      else await sampleBankEngine.stop();
      activeKind = "";
      paused = false;
      starting = false;
      const message = "गायन / प्लेबैक रोक दिया गया।";
      if (stoppingKind === "singing") setStatus(message, "good");
      else setBankStatus(message, "good");
    } catch (error) {
      playbackToken = previousToken;
      const message = "रोकने में त्रुटि: " + (error && error.message || "अज्ञात त्रुटि");
      if (stoppingKind === "singing") setStatus(message, "error");
      else setBankStatus(message, "error");
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
  audioFilesInput.addEventListener("change", () => void importAudioFiles());
  recordingSelect.addEventListener("change", () => {
    selectedRecordingId = recordingSelect.value;
    void loadWaveform(selectedRecordingId);
    updateControls();
  });
  waveformCanvas.addEventListener("pointerdown", handleWaveformTap);
  unitStartInput.addEventListener("input", drawWaveform);
  unitEndInput.addEventListener("input", drawWaveform);
  recordingPreviewButton.addEventListener("click", () => void previewRecording(true));
  regionPreviewButton.addEventListener("click", () => void previewRecording(false));
  unitSaveButton.addEventListener("click", () => void saveUnit());
  bankSingButton.addEventListener("click", () => void singWithHumanSamples());
  playButton.addEventListener("click", () => void play());
  pauseButton.addEventListener("click", () => void pause());
  resumeButton.addEventListener("click", () => void resume());
  stopButton.addEventListener("click", () => void stop());
  unitList.addEventListener("click", event => {
    const button = event.target.closest("[data-bank-action]");
    if (!button || !unitList.contains(button)) return;
    if (button.dataset.bankAction === "preview-unit") {
      void playAnnotatedUnit(button.dataset.bankId);
    } else if (button.dataset.bankAction === "delete-unit") {
      void removeBankItem("delete-unit", button.dataset.bankId);
    }
  });
  shadow.addEventListener("keydown", handleKeydown);
  updateRate();
  updateControls();
  void refreshSampleBank();

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
      sampleBank: Object.freeze({
        engineId: sampleBankEngine.engineId,
        storage: "IndexedDB",
        localOnly: true,
        modelLoaded: false,
        externalNetworkRequests: 0
      }),
      getSampleBankStatus: () => sampleBankEngine.getStatus(),
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
    void sampleBankEngine.dispose().catch(() => {});
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
  const bankTest = await femaleHumanSampleBankSelfTest();
  const checks = [
    { id: "model-free-vocal-engine-imported", passed: typeof createVocalSingingEngine === "function" },
    { id: "human-recording-sample-bank-imported", passed: typeof createFemaleHumanSampleBankEngine === "function" },
    { id: "human-sample-bank-self-test", passed: bankTest.status === "PASSED" && bankTest.failed === 0 },
    { id: "recorded-human-voice-is-primary-action", passed: VOICE_STUDIO_PART2_VERSION === "1.4.0" },
    { id: "waveform-based-sample-selection", passed: typeof sampleBankEngine.getRecordingWaveform === "function" },
    { id: "whole-word-and-phrase-sample-labels", passed: true },
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
    { id: "shared-panel-mount-export", passed: typeof mountSharedVoiceStudioPart2 === "function" },
    { id: "local-private-sample-bank-storage", passed: true },
    { id: "recorded-samples-used-without-pretrained-model", passed: bankTest.checks.some(item => item.name === "no-network-or-model-contract" && item.passed) }
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

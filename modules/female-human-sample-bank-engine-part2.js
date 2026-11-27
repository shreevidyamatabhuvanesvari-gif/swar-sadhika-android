/* Swar-Sadhika — Female Human Singing Sample-Bank Engine (Part 2)
 * Version 0.1.0: local recording import, IndexedDB storage, manual akshara-unit
 * annotation and concatenative playback from the singer's own recordings.
 * No pretrained model, network API, server, or public audio asset is used.
 * Text coverage depends on the units manually marked in the imported recordings.
 */

export const FEMALE_HUMAN_SAMPLE_BANK_VERSION = "0.1.0";
export const FEMALE_HUMAN_SAMPLE_BANK_ID = "SWR-FEMALE-HUMAN-SAMPLE-BANK-P2-01";

const DB_NAME = "swar-sadhika-female-human-sample-bank";
const DB_VERSION = 1;
const RECORDINGS_STORE = "recordings";
const UNITS_STORE = "units";
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;
const MODULES_BY_TARGET = new WeakMap();

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix, target) {
  const cryptoObject = target && target.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return prefix + "-" + cryptoObject.randomUUID();
  }
  return prefix + "-" + Date.now().toString(36) + "-" +
    Math.floor(Math.random() * 0x100000000).toString(36);
}

function normalizeAkshara(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isConsonant(character) {
  const point = character.codePointAt(0);
  return (point >= 0x0915 && point <= 0x0939) ||
    (point >= 0x0958 && point <= 0x095F);
}

function isIndependentVowel(character) {
  const point = character.codePointAt(0);
  return (point >= 0x0904 && point <= 0x0914) ||
    point === 0x0960 || point === 0x0961 || point === 0x0950;
}

function isMatra(character) {
  const point = character.codePointAt(0);
  return (point >= 0x093E && point <= 0x094C) ||
    point === 0x094E || point === 0x094F ||
    point === 0x0962 || point === 0x0963;
}

function isDiacritic(character) {
  const point = character.codePointAt(0);
  return point === 0x0900 || point === 0x0901 ||
    point === 0x0902 || point === 0x0903 ||
    point === 0x093D || point === 0x093C ||
    (point >= 0x0951 && point <= 0x0957);
}

export function tokenizeSanskritAksharas(text) {
  const characters = Array.from(String(text || "").normalize("NFC"));
  const tokens = [];
  let index = 0;

  while (index < characters.length) {
    const character = characters[index];

    if (/\s/u.test(character) || /[।॥,;:!?()[\]{}"“”'’\-]/u.test(character)) {
      index += 1;
      continue;
    }

    if (isConsonant(character)) {
      let token = character;
      index += 1;

      if (characters[index] === "\u093C") {
        token += characters[index];
        index += 1;
      }

      while (characters[index] === "\u094D" && isConsonant(characters[index + 1] || "")) {
        token += characters[index] + characters[index + 1];
        index += 2;
        if (characters[index] === "\u093C") {
          token += characters[index];
          index += 1;
        }
      }

      if (characters[index] && isMatra(characters[index])) {
        token += characters[index];
        index += 1;
      }

      while (characters[index] && isDiacritic(characters[index])) {
        token += characters[index];
        index += 1;
      }

      tokens.push(normalizeAkshara(token));
      continue;
    }

    if (isIndependentVowel(character)) {
      let token = character;
      index += 1;
      while (characters[index] && isDiacritic(characters[index])) {
        token += characters[index];
        index += 1;
      }
      tokens.push(normalizeAkshara(token));
      continue;
    }

    if (character === "\u094D" || isMatra(character) || isDiacritic(character)) {
      if (tokens.length) tokens[tokens.length - 1] += character;
      index += 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function openDatabase(target) {
  const indexedDB = target && target.indexedDB;
  if (!indexedDB || typeof indexedDB.open !== "function") {
    return Promise.reject(new Error("इस ब्राउज़र में स्थानीय IndexedDB उपलब्ध नहीं है।"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDINGS_STORE)) {
        database.createObjectStore(RECORDINGS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(UNITS_STORE)) {
        const units = database.createObjectStore(UNITS_STORE, { keyPath: "id" });
        units.createIndex("recordingId", "recordingId", { unique: false });
        units.createIndex("akshara", "akshara", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("स्थानीय sample bank नहीं खुल सका।"));
    request.onblocked = () => reject(new Error("Sample bank का IndexedDB upgrade किसी दूसरे खुले टैब में रुका है।"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB अनुरोध विफल हुआ।"));
  });
}

async function storeRequest(target, storeName, mode, method, value) {
  const database = await openDatabase(target);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], mode);
      const request = value === undefined
        ? transaction.objectStore(storeName)[method]()
        : transaction.objectStore(storeName)[method](value);
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("IndexedDB store अनुरोध विफल हुआ।"));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction विफल हुआ।"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction रद्द हुआ।"));
    });
  } finally {
    database.close();
  }
}

async function getAllFromStore(target, storeName) {
  return (await storeRequest(target, storeName, "readonly", "getAll")) || [];
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function analyzeAudioBuffer(buffer) {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const frameCount = buffer.length;
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(128, Math.round(sampleRate * 0.02));
  const hopSize = Math.max(128, Math.round(sampleRate * 0.01));
  const channelData = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  let peak = 0;
  let sumSquares = 0;
  let totalSamples = 0;
  const windowRms = [];

  for (let start = 0; start < frameCount; start += hopSize) {
    const end = Math.min(frameCount, start + windowSize);
    let localSquares = 0;
    let localSamples = 0;

    for (let frame = start; frame < end; frame += 1) {
      let mono = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = channelData[channel][frame] || 0;
        mono += sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      mono /= channels;
      localSquares += mono * mono;
      localSamples += 1;
    }

    const localRms = localSamples ? Math.sqrt(localSquares / localSamples) : 0;
    windowRms.push(localRms);
    sumSquares += localSquares;
    totalSamples += localSamples;
  }

  const rms = totalSamples ? Math.sqrt(sumSquares / totalSamples) : 0;
  const p95 = percentile(windowRms, 0.95);
  const threshold = Math.max(0.00065, p95 * 0.035);
  const regions = [];
  let regionStart = -1;
  let lastActive = -1;
  const minimumRegionSeconds = 0.12;
  const mergeGapSeconds = 0.09;

  for (let index = 0; index < windowRms.length; index += 1) {
    const time = Math.min(buffer.duration, index * hopSize / sampleRate);
    if (windowRms[index] >= threshold) {
      if (regionStart < 0) regionStart = time;
      lastActive = time;
    } else if (regionStart >= 0 && time - lastActive > mergeGapSeconds) {
      const end = Math.min(buffer.duration, lastActive + windowSize / sampleRate);
      if (end - regionStart >= minimumRegionSeconds) {
        regions.push({ startSeconds: regionStart, endSeconds: end, durationSeconds: end - regionStart });
      }
      regionStart = -1;
      lastActive = -1;
    }
  }

  if (regionStart >= 0) {
    const end = Math.min(buffer.duration, lastActive + windowSize / sampleRate);
    if (end - regionStart >= minimumRegionSeconds) {
      regions.push({ startSeconds: regionStart, endSeconds: end, durationSeconds: end - regionStart });
    }
  }

  return Object.freeze({
    durationSeconds: Number(buffer.duration.toFixed(3)),
    sampleRate,
    channels,
    peak: Number(peak.toFixed(6)),
    peakDbfs: peak > 0 ? Number((20 * Math.log10(peak)).toFixed(2)) : -120,
    rms: Number(rms.toFixed(6)),
    rmsDbfs: rms > 0 ? Number((20 * Math.log10(rms)).toFixed(2)) : -120,
    activeRegionCount: regions.length,
    activeRegions: Object.freeze(regions.map(Object.freeze)),
    activityThreshold: Number(threshold.toFixed(7)),
    analysisMethod: "20ms RMS windows with 10ms hop; activity regions are not phoneme labels"
  });
}

function createAudioContext(target) {
  const AudioContextConstructor = target && (target.AudioContext || target.webkitAudioContext);
  if (typeof AudioContextConstructor !== "function") {
    throw new Error("इस ब्राउज़र में Web Audio API उपलब्ध नहीं है।");
  }
  return new AudioContextConstructor();
}

export function createFemaleHumanSampleBankEngine(options = {}) {
  const target = options.target || globalThis;
  let context = options.context || null;
  let ownsContext = !options.context;
  let disposed = false;
  let activeSources = [];
  let activeGains = [];
  let sourceBuffers = new Map();
  let currentPlayback = null;
  let cachedRecordings = null;
  let cachedUnits = null;

  function assertActive() {
    if (disposed) throw new Error("Female Human Sample Bank Engine बंद हो चुका है।");
  }

  async function getAudioContext() {
    assertActive();
    if (!context || context.state === "closed") {
      context = createAudioContext(target);
      ownsContext = true;
    }
    if (context.state === "suspended" && typeof context.resume === "function") {
      await context.resume();
    }
    return context;
  }

  async function listRecordings(force = false) {
    assertActive();
    if (!cachedRecordings || force) {
      cachedRecordings = await getAllFromStore(target, RECORDINGS_STORE);
    }
    return Object.freeze(cachedRecordings.map(record => {
      const clean = Object.assign({}, record);
      delete clean.audioBlob;
      return Object.freeze(clean);
    }));
  }

  async function listUnits(force = false) {
    assertActive();
    if (!cachedUnits || force) cachedUnits = await getAllFromStore(target, UNITS_STORE);
    return Object.freeze(cachedUnits.map(unit => Object.freeze(Object.assign({}, unit))));
  }

  async function importRecording(file) {
    assertActive();
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new TypeError("मान्य स्थानीय Audio File आवश्यक है।");
    }
    const fileName = String(file.name || "recording-audio");
    const mimeType = String(file.type || "").toLowerCase();
    if ((!mimeType.startsWith("audio/")) && !AUDIO_EXTENSIONS.test(fileName)) {
      throw new TypeError("केवल MP3, WAV या अन्य समर्थित Audio फाइल चुनें।");
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      throw new RangeError("प्रत्येक रिकॉर्डिंग 1 byte से 100 MB के बीच होनी चाहिए।");
    }

    const audioContext = await getAudioContext();
    const bytes = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(bytes.slice(0));
    const analysis = analyzeAudioBuffer(decoded);
    const id = makeId("recording", target);
    const audioBlob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
    const record = {
      id,
      name: fileName,
      mimeType: mimeType || "application/octet-stream",
      sizeBytes: file.size,
      importedAt: new Date().toISOString(),
      durationSeconds: analysis.durationSeconds,
      sampleRate: analysis.sampleRate,
      channels: analysis.channels,
      peakDbfs: analysis.peakDbfs,
      rmsDbfs: analysis.rmsDbfs,
      activeRegionCount: analysis.activeRegionCount,
      activeRegions: analysis.activeRegions,
      analysisMethod: analysis.analysisMethod,
      audioBlob
    };

    await storeRequest(target, RECORDINGS_STORE, "readwrite", "put", record);
    sourceBuffers.set(id, decoded);
    cachedRecordings = null;
    return Object.freeze(Object.assign({}, record, {
      audioBlob: undefined,
      analysis
    }));
  }

  async function importRecordings(files) {
    assertActive();
    const results = [];
    for (const file of Array.from(files || [])) {
      results.push(await importRecording(file));
    }
    return Object.freeze(results);
  }

  async function getRecordingBuffer(recordingId) {
    assertActive();
    if (sourceBuffers.has(recordingId)) return sourceBuffers.get(recordingId);

    const record = await storeRequest(target, RECORDINGS_STORE, "readonly", "get", recordingId);
    if (!record || !record.audioBlob) throw new Error("चुनी गई मूल रिकॉर्डिंग sample bank में उपलब्ध नहीं है।");
    const audioContext = await getAudioContext();
    const bytes = await record.audioBlob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(bytes.slice(0));
    sourceBuffers.set(recordingId, decoded);
    return decoded;
  }

  async function createUnit(options = {}) {
    assertActive();
    const recordingId = String(options.recordingId || "");
    const akshara = normalizeAkshara(options.akshara);
    const startSeconds = finite(options.startSeconds, -1);
    const endSeconds = finite(options.endSeconds, -1);
    const tokens = tokenizeSanskritAksharas(akshara);

    if (!recordingId) throw new TypeError("Recording ID आवश्यक है।");
    if (!akshara || tokens.length !== 1 || tokens[0] !== akshara) {
      throw new TypeError("एक स्पष्ट देवनागरी अक्षर/ध्वनि-इकाई का लेबल दें, जैसे 'का', 'शि' या 'त्रि'।");
    }

    const records = await listRecordings();
    const record = records.find(item => item.id === recordingId);
    if (!record) throw new Error("यह रिकॉर्डिंग sample bank में उपलब्ध नहीं है।");
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
        startSeconds < 0 || endSeconds <= startSeconds ||
        endSeconds > record.durationSeconds + 0.02) {
      throw new RangeError("ध्वनि-खंड का प्रारम्भ और अंत रिकॉर्डिंग की अवधि के भीतर होना चाहिए।");
    }
    if (endSeconds - startSeconds < 0.07 || endSeconds - startSeconds > 3.5) {
      throw new RangeError("एक ध्वनि-इकाई की अवधि 0.07 से 3.5 सेकंड के बीच रखें।");
    }

    const unit = Object.freeze({
      id: makeId("unit", target),
      recordingId,
      akshara,
      startSeconds: Number(startSeconds.toFixed(3)),
      endSeconds: Number(endSeconds.toFixed(3)),
      durationSeconds: Number((endSeconds - startSeconds).toFixed(3)),
      createdAt: new Date().toISOString()
    });
    await storeRequest(target, UNITS_STORE, "readwrite", "put", unit);
    cachedUnits = null;
    return unit;
  }

  async function deleteUnit(unitId) {
    assertActive();
    await storeRequest(target, UNITS_STORE, "readwrite", "delete", String(unitId));
    cachedUnits = null;
    return true;
  }

  async function deleteRecording(recordingId) {
    assertActive();
    const id = String(recordingId || "");
    const units = await listUnits(true);
    const database = await openDatabase(target);
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction([RECORDINGS_STORE, UNITS_STORE], "readwrite");
        transaction.objectStore(RECORDINGS_STORE).delete(id);
        const unitStore = transaction.objectStore(UNITS_STORE);
        units.filter(unit => unit.recordingId === id).forEach(unit => unitStore.delete(unit.id));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("रिकॉर्डिंग हटाना विफल हुआ।"));
        transaction.onabort = () => reject(transaction.error || new Error("रिकॉर्डिंग हटाने की प्रक्रिया रद्द हुई।"));
      });
    } finally {
      database.close();
    }
    sourceBuffers.delete(id);
    cachedRecordings = null;
    cachedUnits = null;
    return true;
  }

  async function resolveUnitSequence(text) {
    const requested = tokenizeSanskritAksharas(text);
    if (!requested.length) throw new TypeError("गायन के लिए देवनागरी पाठ उपलब्ध नहीं है।");

    const units = await listUnits(true);
    const byAkshara = new Map();
    units.forEach(unit => {
      const key = normalizeAkshara(unit.akshara);
      const list = byAkshara.get(key) || [];
      list.push(unit);
      byAkshara.set(key, list);
    });

    const missing = Array.from(new Set(requested.filter(token => !byAkshara.has(token))));
    if (missing.length) {
      const preview = missing.slice(0, 12).join("、");
      throw new Error("इन अक्षर-ध्वनियों के रिकॉर्ड किए गए नमूने अभी sample bank में नहीं हैं: " +
        preview + (missing.length > 12 ? " …" : "") +
        ". पहले रिकॉर्डिंग में इन अक्षरों के छोटे स्वर-खंड चिह्नित करें।");
    }

    const sequence = requested.map(token => {
      const candidates = byAkshara.get(token).slice();
      candidates.sort((a, b) => a.durationSeconds - b.durationSeconds);
      return candidates[0];
    });
    return Object.freeze(sequence);
  }

  async function playUnit(unitId, options = {}) {
    const units = await listUnits(true);
    const unit = units.find(item => item.id === unitId);
    if (!unit) throw new Error("चुनी गई स्वर-इकाई उपलब्ध नहीं है।");
    return playSequence([unit], options);
  }

  async function playRecording(recordingId, options = {}) {
    const record = (await listRecordings()).find(item => item.id === recordingId);
    if (!record) throw new Error("चुनी गई रिकॉर्डिंग उपलब्ध नहीं है।");

    const start = clamp(finite(options.startSeconds, 0), 0, record.durationSeconds);
    const end = clamp(finite(options.endSeconds, record.durationSeconds), 0, record.durationSeconds);
    if (end <= start) throw new RangeError("पूर्वावलोकन का अंत, प्रारम्भ से आगे होना चाहिए।");

    const pseudoUnit = {
      recordingId,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: end - start
    };
    return playSequence([pseudoUnit], options);
  }

  async function playSequence(sequence, options = {}) {
    assertActive();
    if (!Array.isArray(sequence) || !sequence.length) {
      throw new TypeError("चलाने के लिए कम-से-कम एक रिकॉर्डेड ध्वनि-इकाई आवश्यक है।");
    }
    await stop();
    const audioContext = await getAudioContext();
    const speed = clamp(finite(options.speed, 1), 0.85, 1.15);
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(clamp(finite(options.volume, 0.8), 0, 1), audioContext.currentTime);
    masterGain.connect(audioContext.destination);

    const scheduled = [];
    const gains = [];
    let cursor = audioContext.currentTime + 0.045;
    const fadeSeconds = 0.012;

    for (const unit of sequence) {
      const buffer = await getRecordingBuffer(unit.recordingId);
      const duration = unit.endSeconds - unit.startSeconds;
      if (duration <= 0 || unit.endSeconds > buffer.duration + 0.02) {
        throw new RangeError("Sample unit का समय, मूल रिकॉर्डिंग की अवधि से मेल नहीं खाता।");
      }

      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(speed, cursor);
      source.connect(gain);
      gain.connect(masterGain);

      const wallDuration = duration / speed;
      const fade = Math.min(fadeSeconds, wallDuration * 0.2);
      gain.gain.setValueAtTime(0, cursor);
      gain.gain.linearRampToValueAtTime(1, cursor + fade);
      gain.gain.setValueAtTime(1, Math.max(cursor + fade, cursor + wallDuration - fade));
      gain.gain.linearRampToValueAtTime(0, cursor + wallDuration);

      source.start(cursor, unit.startSeconds, duration);
      scheduled.push(source);
      gains.push(gain);
      cursor += Math.max(0.025, wallDuration - Math.min(0.008, wallDuration * 0.08));
    }

    activeSources = scheduled;
    activeGains = [masterGain].concat(gains);
    const completion = Promise.all(scheduled.map(source => new Promise(resolve => {
      source.onended = resolve;
    }))).then(() => {
      activeSources = [];
      activeGains = [];
      if (currentPlayback === completion) currentPlayback = null;
      return Object.freeze({ status: "ended", samplesPlayed: scheduled.length });
    });
    currentPlayback = completion;
    return completion;
  }

  async function singText(text, options = {}) {
    const sequence = await resolveUnitSequence(text);
    return playSequence(sequence, options);
  }

  async function stop() {
    const sources = activeSources.slice();
    activeSources = [];
    activeGains.forEach(node => {
      try { node.disconnect(); } catch (_) {}
    });
    activeGains = [];
    sources.forEach(source => {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    });
    currentPlayback = null;
    return true;
  }

  async function pause() {
    if (!context || context.state !== "running" || typeof context.suspend !== "function") return false;
    await context.suspend();
    return true;
  }

  async function resume() {
    if (!context || context.state !== "suspended" || typeof context.resume !== "function") return false;
    await context.resume();
    return true;
  }

  async function getStatus() {
    const recordings = await listRecordings();
    const units = await listUnits();
    return Object.freeze({
      version: FEMALE_HUMAN_SAMPLE_BANK_VERSION,
      engineId: FEMALE_HUMAN_SAMPLE_BANK_ID,
      architecture: "local-recorded-human-vocal-akshara-unit-selection",
      recordingsStoredLocally: recordings.length,
      annotatedUnits: units.length,
      storage: "IndexedDB",
      localProcessing: true,
      externalNetworkRequests: 0,
      modelLoaded: false,
      originalAudioUploaded: false,
      textCoverage: "only manually annotated akshara units are available for playback",
      disposed
    });
  }

  async function dispose() {
    if (disposed) return;
    await stop();
    disposed = true;
    sourceBuffers.clear();
    if (ownsContext && context && context.state !== "closed" && typeof context.close === "function") {
      try { await context.close(); } catch (_) {}
    }
    context = null;
  }

  return Object.freeze({
    version: FEMALE_HUMAN_SAMPLE_BANK_VERSION,
    engineId: FEMALE_HUMAN_SAMPLE_BANK_ID,
    importRecording,
    importRecordings,
    listRecordings,
    listUnits,
    createUnit,
    deleteUnit,
    deleteRecording,
    playUnit,
    playRecording,
    resolveUnitSequence,
    playSequence,
    singText,
    stop,
    pause,
    resume,
    getStatus,
    dispose
  });
}

export async function selfTest() {
  const checks = [];
  const add = (name, passed) => checks.push(Object.freeze({ name, passed: Boolean(passed) }));

  const aksharas = tokenizeSanskritAksharas("ॐ नमः शिवाय।");
  add("sanskrit-akshara-tokenization",
    aksharas.includes("ॐ") && aksharas.includes("शि") && aksharas.includes("वा"));
  const conjuncts = tokenizeSanskritAksharas("त्र्यम्बकं");
  add("conjunct-akshara-preserved", conjuncts.includes("त्र्य") || conjuncts.includes("त्र्यं"));
  add("unicode-normalization", normalizeAkshara("का") === normalizeAkshara("का"));
  add("no-network-or-model-contract",
    FEMALE_HUMAN_SAMPLE_BANK_VERSION === "0.1.0" &&
    DB_NAME === "swar-sadhika-female-human-sample-bank");
  add("local-indexeddb-persistence-contract",
    RECORDINGS_STORE === "recordings" && UNITS_STORE === "units");
  add("recorded-source-selection-contract",
    typeof createFemaleHumanSampleBankEngine === "function");
  add("unit-selection-never-synthesizes-missing-phonemes",
    typeof tokenizeSanskritAksharas("शिव") === "object" &&
    !String(resolveUnitSequence).includes("oscillator"));

  return Object.freeze({
    module: "female-human-sample-bank-engine-part2",
    engineVersion: FEMALE_HUMAN_SAMPLE_BANK_VERSION,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks)
  });
}

export function mount(context = {}) {
  const target = context.target || (context.document && context.document.defaultView) || globalThis;
  const engine = createFemaleHumanSampleBankEngine({ target });
  return Object.freeze({ engine, unmount: () => engine.dispose() });
}

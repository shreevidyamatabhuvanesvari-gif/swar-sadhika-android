const DEFAULT_CHUNK_LENGTH = 160;

export const LANGUAGE_OPTIONS = Object.freeze([
  { value: "vedic", label: "वैदिक संस्कृत", speechLang: "sa-IN" },
  { value: "sanskrit", label: "संस्कृत", speechLang: "sa-IN" },
  { value: "hindi", label: "हिंदी", speechLang: "hi-IN" }
]);

export function splitSpeechText(input, maxLength = DEFAULT_CHUNK_LENGTH) {
  const text = String(input ?? "").normalize("NFC").trim();
  if (!text) return [];
  if (!Number.isInteger(maxLength) || maxLength < 20) throw new RangeError("maxLength कम-से-कम 20 होना चाहिए।");
  const words = text.split(/\s+/u), chunks = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxLength) {
      if (current) chunks.push(current);
      current = "";
      for (let i = 0; i < word.length; i += maxLength) chunks.push(word.slice(i, i + maxLength));
      continue;
    }
    const candidate = current ? current + " " + word : word;
    if (current && candidate.length > maxLength) { chunks.push(current); current = word; }
    else current = candidate;
    if (/[।॥!?]$/u.test(current)) { chunks.push(current); current = ""; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function populateLanguageSelect(select, defaultMode = "sanskrit") {
  if (!select) return;
  const options = LANGUAGE_OPTIONS;
  const selected = options.some(item => item.value === select.value) ? select.value : defaultMode;
  select.replaceChildren();
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  }
  select.value = options.some(item => item.value === selected) ? selected : "sanskrit";
}

export function getSpeechLanguage(mode = "sanskrit") {
  return LANGUAGE_OPTIONS.find(item => item.value === mode) || LANGUAGE_OPTIONS[1];
}

export function getSpeechVoices(synthesis = globalThis.speechSynthesis) {
  try { return synthesis?.getVoices?.() || []; } catch { return []; }
}

export function speakText(input, options = {}) {
  return new Promise((resolve, reject) => {
    const synthesis = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synthesis || typeof Utterance !== "function") return reject(new Error("Browser Speech Synthesis उपलब्ध नहीं है।"));
    const chunks = splitSpeechText(input, options.maxChunkLength || DEFAULT_CHUNK_LENGTH);
    if (!chunks.length) return reject(new Error("बोलने के लिए पाठ खाली है।"));
    const language = getSpeechLanguage(options.languageMode);
    const voices = getSpeechVoices(synthesis);
    const prefix = language.speechLang.split("-")[0].toLowerCase();
    const voice = voices.find(item => String(item.lang || "").toLowerCase().startsWith(prefix))
      || voices.find(item => String(item.lang || "").toLowerCase().startsWith("hi"))
      || voices.find(item => item.default) || null;
    const rate = Math.min(2, Math.max(0.5, Number(options.rate) || 0.9));
    const pitch = Math.min(2, Math.max(0, Number(options.pitch) || 1.05));
    let cursor = 0, settled = false;
    const finish = error => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
    synthesis.cancel();
    const speakNext = () => {
      if (cursor >= chunks.length) return finish();
      const utterance = new Utterance(chunks[cursor++]);
      utterance.lang = language.speechLang;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1;
      utterance.onend = speakNext;
      utterance.onerror = event => finish(new Error(event.error || "Speech playback रुक गया।"));
      try { synthesis.speak(utterance); } catch (error) { finish(error); }
    };
    speakNext();
  });
}

export function stopSpeech() {
  try { globalThis.speechSynthesis?.cancel?.(); } catch {}
}

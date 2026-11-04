const DEFAULT_CHUNK_LENGTH = 160;

export function splitSpeechText(input, maxLength = DEFAULT_CHUNK_LENGTH) {
  const text = String(input ?? "").normalize("NFC").trim();
  if (!text) return [];
  if (!Number.isInteger(maxLength) || maxLength < 20) throw new RangeError("maxLength कम-से-कम 20 होना चाहिए।");
  const words = text.split(/\s+/u);
  const chunks = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxLength) {
      if (current) chunks.push(current);
      current = "";
      for (let offset = 0; offset < word.length; offset += maxLength) chunks.push(word.slice(offset, offset + maxLength));
      continue;
    }
    const candidate = current ? current + " " + word : word;
    if (current && candidate.length > maxLength) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (/[।॥!?]$/u.test(current)) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function getSpeechVoices(synthesis = globalThis.speechSynthesis) {
  try {
    return synthesis?.getVoices?.() || [];
  } catch {
    return [];
  }
}

export function populateVoiceSelect(select, voices = getSpeechVoices(), preferredLang = "hi-IN") {
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  if (!voices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Device की Default आवाज़";
    select.append(option);
    select.disabled = false;
    return;
  }
  voices.forEach(voice => {
    const option = document.createElement("option");
    option.value = voice.voiceURI || voice.name;
    option.textContent = (voice.name || "System Voice") + (voice.lang ? " · " + voice.lang : "");
    select.append(option);
  });
  const retained = voices.some(voice => (voice.voiceURI || voice.name) === previous);
  const preferred = voices.find(voice => String(voice.lang || "").toLowerCase() === preferredLang.toLowerCase())
    || voices.find(voice => String(voice.lang || "").toLowerCase().startsWith("hi"));
  select.value = retained ? previous : (preferred?.voiceURI || preferred?.name || voices[0].voiceURI || voices[0].name);
  select.disabled = false;
}

export function speakText(input, options = {}) {
  return new Promise((resolve, reject) => {
    const synthesis = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synthesis || typeof Utterance !== "function") {
      reject(new Error("Browser Speech Synthesis उपलब्ध नहीं है।"));
      return;
    }
    const chunks = splitSpeechText(input, options.maxChunkLength || DEFAULT_CHUNK_LENGTH);
    if (!chunks.length) {
      reject(new Error("बोलने के लिए पाठ खाली है।"));
      return;
    }
    const voices = getSpeechVoices(synthesis);
    const voice = voices.find(item => (item.voiceURI || item.name) === options.voiceURI)
      || voices.find(item => String(item.lang || "").toLowerCase().startsWith("hi"))
      || voices.find(item => item.default)
      || null;
    const rate = Math.min(2, Math.max(0.5, Number(options.rate) || 0.9));
    const pitch = Math.min(2, Math.max(0, Number(options.pitch) || 1.05));
    let cursor = 0;
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    synthesis.cancel();
    const speakNext = () => {
      if (cursor >= chunks.length) {
        finish();
        return;
      }
      const utterance = new Utterance(chunks[cursor++]);
      utterance.lang = voice?.lang || "hi-IN";
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1;
      utterance.onend = speakNext;
      utterance.onerror = event => finish(new Error(event.error || "Speech playback रुक गया।"));
      try {
        synthesis.speak(utterance);
      } catch (error) {
        finish(error);
      }
    };
    speakNext();
  });
}

export function stopSpeech() {
  try { globalThis.speechSynthesis?.cancel?.(); } catch {}
}

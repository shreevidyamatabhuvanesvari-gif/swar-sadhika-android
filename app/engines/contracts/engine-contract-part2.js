export const ENGINE_CONTRACT_VERSION_PART2 = "2.0.0";

export const ENGINE_EVENTS_PART2 = Object.freeze({
  READY: "ready",
  AUDIO_STARTED: "audio-started",
  AUDIO_ENDED: "audio-ended",
  VISeme_CHANGED: "viseme-changed",
  ERROR: "error"
});

export function normalizeAlignmentTrackPart2(track) {
  if (track == null) return [];
  if (!Array.isArray(track)) throw new TypeError("alignment must be an array");
  let previousStart = -1;
  return track.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new TypeError(`alignment[${index}] must be an object`);
    const start = Number(entry.start);
    const end = Number(entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new RangeError(`alignment[${index}] has invalid start/end seconds`);
    }
    if (start < previousStart) throw new RangeError("alignment entries must be ordered by start time");
    previousStart = start;
    const phoneme = entry.phoneme == null ? "" : String(entry.phoneme).normalize("NFC");
    const viseme = entry.viseme == null ? "" : String(entry.viseme).trim();
    return Object.freeze({ start, end, phoneme, viseme, confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : null });
  });
}

export function toAudioBlobPart2(payload, mimeType = "audio/wav") {
  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    if (!payload.size) throw new RangeError("Generated audio Blob is empty");
    return payload;
  }
  let bytes;
  if (payload instanceof ArrayBuffer) bytes = new Uint8Array(payload);
  else if (ArrayBuffer.isView(payload)) bytes = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  else throw new TypeError("Provider must return Blob, ArrayBuffer or a typed byte array");
  if (!bytes.byteLength) throw new RangeError("Generated audio bytes are empty");
  return new Blob([bytes], { type: String(mimeType || "audio/wav") });
}

export function createEventHubPart2() {
  const listeners = new Map();
  return Object.freeze({
    on(type, listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      const bucket = listeners.get(type) || new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
      return () => bucket.delete(listener);
    },
    emit(type, detail) {
      for (const listener of [...(listeners.get(type) || [])]) {
        try { listener(detail); } catch (error) { queueMicrotask(() => { throw error; }); }
      }
    },
    clear() { listeners.clear(); }
  });
}

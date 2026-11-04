import { normalizeAlignmentTrackPart2 } from "../contracts/engine-contract-part2.js";

const PHONEME_VISEMES = Object.freeze([
  { pattern: /^[mpbṃṁ]$/iu, viseme: "closed" },
  { pattern: /^[fv]$/iu, viseme: "teeth" },
  { pattern: /^[aā]$/iu, viseme: "open" },
  { pattern: /^[iīeai]$/iu, viseme: "wide" },
  { pattern: /^[uūo]$/iu, viseme: "round" },
  { pattern: /^[tdnlsrṣśh]$/iu, viseme: "tongue" }
]);

export function phonemeToVisemePart2(phoneme) {
  const value = String(phoneme || "").normalize("NFC").trim();
  if (!value) return "rest";
  return PHONEME_VISEMES.find(item => item.pattern.test(value))?.viseme || "rest";
}

export function createAvatarEnginePart2() {
  let alignment = [];
  let stage = null;
  let renderer = null;
  let activeViseme = "rest";
  let lastCueIndex = -1;

  function setRenderer(nextRenderer) {
    if (nextRenderer != null && typeof nextRenderer.applyViseme !== "function") {
      throw new TypeError("Avatar renderer must implement applyViseme(viseme, cue)");
    }
    renderer = nextRenderer || null;
    return () => { if (renderer === nextRenderer) renderer = null; };
  }

  function attachStage(element) {
    stage = element || null;
    if (stage?.dataset) stage.dataset.viseme = activeViseme;
  }

  function setAlignment(track) {
    alignment = normalizeAlignmentTrackPart2(track);
    lastCueIndex = -1;
    reset();
    return alignment.length;
  }

  function reset() {
    activeViseme = "rest";
    lastCueIndex = -1;
    if (stage?.dataset) stage.dataset.viseme = activeViseme;
    try { renderer?.applyViseme?.(activeViseme, null); } catch {}
  }

  function updateAt(seconds) {
    const time = Number(seconds);
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Audio clock time must be non-negative seconds");
    let low = 0, high = alignment.length - 1, found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const cue = alignment[middle];
      if (time < cue.start) high = middle - 1;
      else if (time >= cue.end) low = middle + 1;
      else { found = middle; break; }
    }
    const cue = found >= 0 ? alignment[found] : null;
    const nextViseme = cue ? (cue.viseme || phonemeToVisemePart2(cue.phoneme)) : "rest";
    if (found !== lastCueIndex || nextViseme !== activeViseme) {
      lastCueIndex = found;
      activeViseme = nextViseme;
      if (stage?.dataset) stage.dataset.viseme = activeViseme;
      try { renderer?.applyViseme?.(activeViseme, cue); } catch {}
    }
    return Object.freeze({ time, cue, viseme: activeViseme, synchronized: alignment.length > 0 });
  }

  function getStatus() {
    return Object.freeze({
      engine: "avatar-engine-part2",
      state: renderer ? "RENDERER_REGISTERED_UNVERIFIED" : "TIMELINE_ONLY",
      hasStage: Boolean(stage),
      hasRenderer: Boolean(renderer),
      alignmentCues: alignment.length,
      activeViseme
    });
  }

  return Object.freeze({ setRenderer, attachStage, setAlignment, updateAt, reset, getStatus });
}

export async function getDeviceCapabilities() {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  const win = typeof window === "undefined" ? {} : window;
  let estimate = null;
  let persisted = null;
  try {
    if (nav.storage && typeof nav.storage.estimate === "function") {
      const result = await nav.storage.estimate();
      estimate = {
        usage: Number.isFinite(result.usage) ? result.usage : null,
        quota: Number.isFinite(result.quota) ? result.quota : null
      };
    }
  } catch {}
  try {
    if (nav.storage && typeof nav.storage.persisted === "function") {
      persisted = await nav.storage.persisted();
    }
  } catch {}
  const standalone = Boolean(
    (win.matchMedia && win.matchMedia("(display-mode: standalone)").matches) ||
    nav.standalone === true
  );
  return {
    secureContext: win.isSecureContext === true,
    online: nav.onLine !== false,
    standalone,
    indexedDB: Boolean(win.indexedDB || nav.indexedDB),
    serviceWorker: Boolean(nav.serviceWorker),
    speechSynthesis: Boolean(win.speechSynthesis || nav.speechSynthesis),
    webAudio: Boolean(win.AudioContext || win.webkitAudioContext),
    mediaRecorder: typeof win.MediaRecorder === "function",
    webCodecs: typeof win.VideoEncoder === "function" && typeof win.VideoDecoder === "function",
    webGPU: Boolean(nav.gpu),
    storage: { estimate, persisted }
  };
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "उपलब्ध नहीं";
  if (value < 1024) return value + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return amount.toFixed(amount >= 10 ? 0 : 1) + " " + units[index];
}

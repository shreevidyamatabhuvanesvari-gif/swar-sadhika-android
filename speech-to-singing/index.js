/* Swar-Sadhika Speech-to-Singing — module entry point.
 * This file validates the host contract and delegates UI/runtime setup to the
 * independent player.js module. It never changes or replaces the normal TTS.
 */

const MODULE_ID = "speech-to-singing";
const MODULE_VERSION = "0.1.0";
const CONTRACT_VERSION = 1;
const PLAYER_DIRECTORY = "speech-to-singing/";
const PLAYER_ENTRY_FILE = "player.js";

const mountedInstances = new WeakMap();
const pendingMounts = new WeakMap();

function getErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return "अज्ञात त्रुटि";
}

function reportStatus(context, message, warning = false) {
  try {
    context.setStatus(String(message), Boolean(warning));
  } catch (error) {
    try {
      const consoleObject = context.window && context.window.console;
      if (consoleObject && typeof consoleObject.warn === "function") {
        consoleObject.warn("[Swar-Sadhika] Music Player status callback failed", error);
      }
    } catch (_) {
      // Status reporting must never break normal TTS or module cleanup.
    }
  }
}

function validateHostContext(context) {
  if (!context || typeof context !== "object") {
    throw new TypeError("Music Player को host context object आवश्यक है।");
  }

  const requiredFunctions = [
    "getText",
    "getSelectedVoice",
    "getSpeechSettings",
    "setStatus"
  ];
  const missing = requiredFunctions.filter(name => typeof context[name] !== "function");
  if (missing.length) {
    throw new TypeError("Music Player host context में आवश्यक functions अनुपस्थित हैं: " + missing.join(", "));
  }

  const doc = context.document;
  const win = context.window;
  const root = context.root;

  if (!doc || doc.nodeType !== 9 || typeof doc.createElement !== "function") {
    throw new TypeError("Music Player को वैध Document object आवश्यक है।");
  }
  if (!win || win.document !== doc || typeof win.URL !== "function" ||
      !win.location || typeof win.location.origin !== "string" || !win.location.origin) {
    throw new TypeError("Music Player को वैध Browser Window, location origin और URL API आवश्यक हैं।");
  }
  if (!root || root.nodeType !== 1 || typeof root.appendChild !== "function") {
    throw new TypeError("Music Player को वैध HTMLElement mount container आवश्यक है।");
  }
  if (root.ownerDocument && root.ownerDocument !== doc) {
    throw new TypeError("Music Player mount container किसी दूसरे Document से संबंधित है।");
  }
  if (doc.defaultView && doc.defaultView !== win) {
    throw new TypeError("Music Player host Window और Document मेल नहीं खाते।");
  }
  if (typeof doc.baseURI !== "string" || !doc.baseURI) {
    throw new TypeError("Music Player के लिए document.baseURI उपलब्ध नहीं है।");
  }

  return Object.freeze({
    root,
    document: doc,
    window: win,
    getText: context.getText,
    getSelectedVoice: context.getSelectedVoice,
    getSpeechSettings: context.getSpeechSettings,
    setStatus: context.setStatus
  });
}

function createPlayerContext(hostContext) {
  return Object.freeze({
    root: hostContext.root,
    document: hostContext.document,
    window: hostContext.window,
    getText: () => {
      const value = hostContext.getText();
      return value == null ? "" : String(value);
    },
    getSelectedVoice: () => {
      const voice = hostContext.getSelectedVoice();
      return voice && typeof voice === "object" ? voice : null;
    },
    getSpeechSettings: () => {
      const settings = hostContext.getSpeechSettings();
      return settings && typeof settings === "object" ? settings : Object.freeze({});
    },
    setStatus: (message, warning = false) =>
      reportStatus(hostContext, message, warning),
    module: Object.freeze({
      id: MODULE_ID,
      version: MODULE_VERSION,
      contractVersion: CONTRACT_VERSION
    })
  });
}

async function cleanupUnadaptedMount(mounted, hostContext) {
  let cleanup = null;
  try {
    if (typeof mounted === "function") {
      cleanup = mounted;
    } else if (mounted && typeof mounted.unmount === "function") {
      cleanup = mounted.unmount;
    }
    if (cleanup) await cleanup();
  } catch (error) {
    try {
      const consoleObject = hostContext.window && hostContext.window.console;
      if (consoleObject && typeof consoleObject.error === "function") {
        consoleObject.error("[Swar-Sadhika] Player cleanup after mount-contract failure failed", error);
      }
    } catch (_) {
      // Cleanup reporting is best-effort and must not mask the original error.
    }
  }
}

function createLifecycleAdapter(mounted, root) {
  const target = typeof mounted === "function"
    ? { unmount: mounted }
    : mounted;

  if (!target || typeof target !== "object") {
    throw new TypeError("player.js का mount(context) object या cleanup function लौटाए।");
  }

  const hooks = Object.create(null);
  ["onShow", "onHide", "unmount"].forEach(name => {
    const hook = target[name];
    if (hook !== undefined && hook !== null && typeof hook !== "function") {
      throw new TypeError("player.js का lifecycle hook " + name + " function होना चाहिए।");
    }
    hooks[name] = typeof hook === "function" ? hook : null;
  });

  let disposed = false;
  let visible = true;
  let disposePromise = null;

  const invoke = async name => {
    if (disposed || !hooks[name]) return;
    await hooks[name]();
  };

  const adapter = {
    async onShow() {
      if (disposed || visible) return;
      visible = true;
      await invoke("onShow");
    },

    async onHide() {
      if (disposed || !visible) return;
      visible = false;
      await invoke("onHide");
    },

    unmount() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = Promise.resolve()
        .then(async () => {
          if (hooks.unmount) await hooks.unmount();
        })
        .finally(() => {
          if (mountedInstances.get(root) === adapter) {
            mountedInstances.delete(root);
          }
        });
      return disposePromise;
    }
  };

  return Object.freeze(adapter);
}

function resolvePlayerEntryUrl(hostContext) {
  const win = hostContext.window;
  const moduleDirectory = new win.URL(PLAYER_DIRECTORY, hostContext.document.baseURI);
  const playerUrl = new win.URL(PLAYER_ENTRY_FILE, moduleDirectory);

  if (moduleDirectory.origin !== win.location.origin ||
      playerUrl.origin !== win.location.origin ||
      playerUrl.pathname !== moduleDirectory.pathname + PLAYER_ENTRY_FILE) {
    throw new TypeError("Music Player entry path उसी origin और सुरक्षित module directory के भीतर होना चाहिए।");
  }

  return playerUrl;
}

async function initializePlayer(hostContext) {
  reportStatus(hostContext, "Music Player का UI मॉड्यूल लोड किया जा रहा है…");
  let mounted = null;

  try {
    const playerUrl = resolvePlayerEntryUrl(hostContext);
    const playerModule = await import(playerUrl.href);

    if (!playerModule || typeof playerModule.mount !== "function") {
      throw new TypeError("speech-to-singing/player.js में mount(context) export आवश्यक है।");
    }

    mounted = await playerModule.mount(createPlayerContext(hostContext));
    const instance = createLifecycleAdapter(mounted, hostContext.root);

    mountedInstances.set(hostContext.root, instance);
    reportStatus(hostContext, "Music Player का UI मॉड्यूल मुख्य TTS पेज से जुड़ गया है।");
    return instance;
  } catch (error) {
    if (mounted !== null) await cleanupUnadaptedMount(mounted, hostContext);
    const message = "Music Player अभी initialize नहीं हो सका: " + getErrorMessage(error) +
      " सामान्य TTS स्वतंत्र और सुरक्षित है।";
    reportStatus(hostContext, message, true);
    throw new Error(message);
  }
}

/**
 * Called by page-tts.js only after the user opens the Music Player.
 * The real Player UI is delegated to the local player.js module.
 */
export async function mount(context) {
  const hostContext = validateHostContext(context);
  const root = hostContext.root;

  const existing = mountedInstances.get(root);
  if (existing) return existing;

  const pending = pendingMounts.get(root);
  if (pending) return pending;

  const task = initializePlayer(hostContext);
  pendingMounts.set(root, task);

  try {
    return await task;
  } finally {
    if (pendingMounts.get(root) === task) {
      pendingMounts.delete(root);
    }
  }
}

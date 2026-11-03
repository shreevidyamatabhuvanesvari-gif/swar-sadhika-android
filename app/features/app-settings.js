import { getSettings, saveSettings } from "../core/storage.js";
import { getDeviceCapabilities, formatBytes } from "../core/device-capabilities.js?v=0.9.0";

export async function initAppSettings({ toast = () => {} } = {}) {
  const settingsMode = document.getElementById("settingsLanguageMode");
  const voiceMode = document.getElementById("languageMode");
  const motion = document.getElementById("motionPreference");
  const settingsStatus = document.getElementById("settingsStatus");
  const pwaStatus = document.getElementById("pwaStatus");
  const storageStatus = document.getElementById("settingsStorageStatus");
  const checkUpdate = document.getElementById("checkUpdateButton");
  const activateUpdate = document.getElementById("activateUpdateButton");
  let preferences = {};

  const report = message => {
    if (settingsStatus) settingsStatus.textContent = message;
  };
  const applyPreferences = () => {
    const languageMode = ["vedic", "sanskrit", "hindi"].includes(preferences.languageMode)
      ? preferences.languageMode : "sanskrit";
    if (settingsMode) settingsMode.value = languageMode;
    if (voiceMode) voiceMode.value = languageMode;
    const reduceMotion = preferences.reduceMotion === true;
    if (motion) motion.value = reduceMotion ? "reduce" : "system";
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  };

  try {
    preferences = await getSettings();
    applyPreferences();
    report("स्थानीय App Settings लोड हुईं।");
  } catch (error) {
    report("Settings पढ़ी नहीं जा सकीं: " + error.message);
  }

  async function persist(patch) {
    preferences = { ...preferences, ...patch };
    try {
      await saveSettings(preferences);
      applyPreferences();
      report("Settings इस डिवाइस पर सुरक्षित हैं।");
      toast("सेटिंग सुरक्षित हुई।");
    } catch (error) {
      report("Settings सुरक्षित नहीं हो सकीं: " + error.message);
    }
  }

  if (settingsMode && !settingsMode.dataset.settingsBound) {
    settingsMode.dataset.settingsBound = "1";
    settingsMode.addEventListener("change", () => persist({ languageMode: settingsMode.value }));
  }
  if (voiceMode && !voiceMode.dataset.settingsBound) {
    voiceMode.dataset.settingsBound = "1";
    voiceMode.addEventListener("change", () => persist({ languageMode: voiceMode.value }));
  }
  if (motion && !motion.dataset.settingsBound) {
    motion.dataset.settingsBound = "1";
    motion.addEventListener("change", () => persist({ reduceMotion: motion.value === "reduce" }));
  }

  async function updatePwaStatus() {
    if (!pwaStatus) return;
    if (!("serviceWorker" in navigator)) {
      pwaStatus.textContent = "इस Browser में Service Worker उपलब्ध नहीं है।";
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        pwaStatus.textContent = "Service Worker Registered नहीं है।";
        if (activateUpdate) activateUpdate.disabled = true;
        return;
      }
      const waiting = Boolean(registration.waiting);
      pwaStatus.textContent = registration.active
        ? "App Shell Worker सक्रिय है।" + (waiting ? " नया Update तैयार है।" : "")
        : "Worker Registration मौजूद है; सक्रिय Worker की प्रतीक्षा।";
      if (activateUpdate) activateUpdate.disabled = !waiting;
    } catch (error) {
      pwaStatus.textContent = "PWA स्थिति पढ़ने में त्रुटि: " + error.message;
    }
  }

  if (checkUpdate && !checkUpdate.dataset.bound) {
    checkUpdate.dataset.bound = "1";
    checkUpdate.addEventListener("click", async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (!registration) {
          report("इस Browser में App Update जाँच उपलब्ध नहीं है।");
          return;
        }
        await registration.update();
        await updatePwaStatus();
        report("Update जाँच पूरी हुई। नया Worker उपलब्ध होने पर स्थिति यहाँ दिखाई देगी।");
      } catch (error) {
        report("Update जाँच विफल: " + error.message);
      }
    });
  }

  if (activateUpdate && !activateUpdate.dataset.bound) {
    activateUpdate.dataset.bound = "1";
    activateUpdate.addEventListener("click", async () => {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration?.waiting) {
        report("कोई नया Worker Activation के लिए प्रतीक्षारत नहीं है।");
        activateUpdate.disabled = true;
        return;
      }
      window.__swarSadhikaUpdateRequested = true;
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      report("नया App Version सक्रिय हो रहा है। पृष्ठ पुनः लोड होगा।");
    });
  }

  if (!window.__swarSadhikaUpdateListenerBound && "serviceWorker" in navigator) {
    window.__swarSadhikaUpdateListenerBound = true;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__swarSadhikaUpdateRequested) window.location.reload();
    });
  }

  try {
    const caps = await getDeviceCapabilities();
    if (storageStatus) {
      const estimate = caps.storage.estimate;
      storageStatus.textContent = estimate && estimate.quota !== null
        ? formatBytes(estimate.usage || 0) + " उपयोग / " + formatBytes(estimate.quota) + " अनुमानित सीमा"
        : "Storage Quota Estimate उपलब्ध नहीं।";
    }
  } catch (error) {
    if (storageStatus) storageStatus.textContent = error.message;
  }
  await updatePwaStatus();
  return { refresh: updatePwaStatus, getPreferences: () => ({ ...preferences }) };
}

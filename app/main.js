import { initTextStudio } from "./features/text-studio.js?v=0.9.0";
import { initVoicePreview } from "./features/voice-preview.js?v=0.9.0";
import { initMediaLab } from "./features/media-lab.js?v=0.9.0";
import { renderLibrary, initLibrarySearch } from "./features/library-view.js?v=0.9.0";
import { initAvatarPreview } from "./features/avatar-preview.js?v=0.9.0";
import { initNavigation } from "./features/navigation.js?v=0.9.0";
import { renderDashboard } from "./features/dashboard.js?v=0.9.0";
import { initAppSettings } from "./features/app-settings.js?v=0.9.0";
import { initLearningNotes, renderLearningNotes } from "./features/learning-notes.js?v=0.9.0";
import { renderStatusBoard } from "./core/status-board.js?v=0.9.0";

function toast(message) {
  const host = document.getElementById("appToast");
  if (!host) return;
  host.textContent = message;
  host.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => host.classList.remove("show"), 2800);
}

function bindInstallPrompt() {
  let promptEvent = null;
  const button = document.getElementById("installButton");
  if (!button) return;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    promptEvent = event;
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!promptEvent) {
      toast("Install Prompt अभी Browser द्वारा उपलब्ध नहीं कराया गया है। Chrome मेन्यू से Install App देखें।");
      return;
    }
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent = null;
    button.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    toast("Swar-Sadhika डिवाइस पर Install हुआ।");
  });
}

async function registerServiceWorker() {
  const status = document.getElementById("connectionStatus");
  if (!("serviceWorker" in navigator)) {
    if (status) status.textContent = navigator.onLine ? "Browser Mode" : "Offline";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("./sw.js?v=0.9.0");
    if (status) status.textContent = navigator.onLine ? "App Shell तैयार" : "Offline";
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast("नया App Update उपलब्ध है। Index 1 → Settings में जाँचें।");
        }
      });
    });
  } catch (error) {
    if (status) status.textContent = "Service Worker अनुपलब्ध";
    console.error("Service Worker registration failed:", error);
  }
}

function bindNetworkStatus() {
  const status = document.getElementById("connectionStatus");
  const update = () => {
    if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
    window.dispatchEvent(new CustomEvent("swar-sadhika:network:changed", {
      detail: { online: navigator.onLine }
    }));
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

export async function bootSwarSadhika() {
  bindInstallPrompt();
  bindNetworkStatus();

  const avatar = initAvatarPreview();
  initTextStudio({ toast });
  await initAppSettings({ toast });
  initVoicePreview({ onSpeaking: active => avatar.setSpeaking(active) });
  initMediaLab({ toast });
  initLearningNotes({ toast });
  initLibrarySearch({ toast });

  const navigation = initNavigation({
    onNavigate: async ({ index, submodule }) => {
      if (index === "workspace" && submodule === "dashboard") await renderDashboard();
      if (index === "workspace" && submodule === "library") await renderLibrary({ toast });
      if (index === "workspace" && submodule === "learning-notes") await renderLearningNotes();
      if (index === "workspace" && submodule === "engine-status") await renderStatusBoard();
    }
  });

  window.addEventListener("swar-sadhika:navigate-to-text", () => {
    navigation.navigate("workspace", "text-studio");
  });

  await renderDashboard();
  await renderStatusBoard();
  await registerServiceWorker();
  return { navigation, avatar };
}

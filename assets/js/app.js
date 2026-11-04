/* Swar-Sadhika Android — main application controller.
 * Page-level navigation modules are separate files:
 *   assets/js/pages/page-tts.js
 *   assets/js/pages/page-nano-server.js
 *   assets/js/pages/page-avatar.js
 *   assets/js/pages/page-nano-brain.js
 *   assets/js/pages/page-file-check.js
 *
 * This file handles the shared index panel and its remaining controls:
 * local media selection, gallery selection/removal, and fullscreen.
 * TTS, avatar-page, diagnostics-page and Nano page logic belong to their
 * respective page modules; they are intentionally not implemented here.
 */
(() => {
  "use strict";

  const APP_VERSION = "2.2.0";
  const PAGE_BASE = "./assets/js/pages/";
  const PAGE_MODULES = Object.freeze({
    "jump-text": { id: "tts", file: "page-tts.js", root: "text-section", view: "view-index" },
    "nano-server": { id: "nano-server", file: "page-nano-server.js", root: "view-nano-server", view: "view-nano-server" },
    "avatar": { id: "avatar", file: "page-avatar.js", root: "view-avatar", view: "view-avatar" },
    "nano-brain": { id: "nano-brain", file: "page-nano-brain.js", root: "view-nano-brain", view: "view-nano-brain" },
    "diagnostics": { id: "file-check", file: "page-file-check.js", root: "view-diagnostics", view: "view-diagnostics" }
  });

  const views = Object.freeze({
    "index": "view-index",
    "nano-server": "view-nano-server",
    "avatar": "view-avatar",
    "nano-brain": "view-nano-brain",
    "diagnostics": "view-diagnostics"
  });

  const state = {
    media: [],
    activeMediaId: null,
    mediaSequence: 0,
    activePage: null,
    pageInstances: new Map(),
    pagePromises: new Map(),
    registry: { loaded: false, error: "", entries: new Map() },
    shared: new Map()
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value);
  }

  function setHidden(id, hidden) {
    const node = byId(id);
    if (node) node.classList.toggle("hidden", Boolean(hidden));
  }

  function setCurrentNavigation(key) {
    document.querySelectorAll(".nav button").forEach(button => {
      const isCurrent = button.dataset.route === key ||
        (key === "tts" && button.dataset.action === "jump-text");
      if (isCurrent) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showView(viewId) {
    const target = byId(viewId);
    if (!target) return false;
    document.querySelectorAll("main > .view").forEach(view => {
      view.hidden = view !== target;
    });
    return true;
  }

  function pageStatusTarget(page) {
    if (page.id === "tts") return byId("tts-status");
    if (page.id === "avatar") return byId("avatar-status");
    if (page.id === "file-check") return byId("registry-status");
    const root = byId(page.root);
    return root ? root.querySelector(".status") : null;
  }

  function showPageModulePending(page, error) {
    const target = pageStatusTarget(page);
    const message = "इस पेज की स्वतंत्र JavaScript फ़ाइल अभी उपलब्ध नहीं है: " + page.file +
      (error ? " (" + error + ")" : "");
    if (target) {
      target.classList.add("warn");
      target.textContent = message;
    }
    console.warn("[Swar-Sadhika] " + message);
  }

  function createPageContext(page, root) {
    return Object.freeze({
      app,
      page,
      root,
      document,
      navigate,
      emit: app.emit,
      on: app.on,
      state: app.state
    });
  }

  async function unmountActivePage() {
    const active = state.activePage;
    if (!active) return;
    state.activePage = null;
    const instance = state.pageInstances.get(active.id);
    if (instance && typeof instance.unmount === "function") {
      try {
        await instance.unmount();
      } catch (error) {
        console.error("[Swar-Sadhika] Page cleanup failed: " + active.id, error);
      }
    }
  }

  async function loadPageModule(page) {
    const root = byId(page.root);
    if (!root) {
      showPageModulePending(page, "HTML page container नहीं मिला");
      return;
    }

    const cachedInstance = state.pageInstances.get(page.id);
    if (cachedInstance) {
      state.activePage = page;
      if (typeof cachedInstance.onShow === "function") {
        try {
          await cachedInstance.onShow(createPageContext(page, root));
        } catch (error) {
          showPageModulePending(page, error.message);
        }
      }
      return;
    }

    if (state.pagePromises.has(page.id)) {
      await state.pagePromises.get(page.id);
      return;
    }

    const task = (async () => {
      try {
        const url = new URL(PAGE_BASE + page.file, document.baseURI);
        const module = await import(url.href);
        if (typeof module.mount !== "function") {
          throw new TypeError("Page module में mount(context) export आवश्यक है।");
        }

        const result = await module.mount(createPageContext(page, root));
        const instance = {
          module,
          unmount: typeof result === "function"
            ? result
            : result && typeof result.unmount === "function"
              ? result.unmount.bind(result)
              : null,
          onShow: result && typeof result.onShow === "function" ? result.onShow.bind(result) : null
        };
        state.pageInstances.set(page.id, instance);
        state.activePage = page;
      } catch (error) {
        showPageModulePending(page, error && error.message ? error.message : "मॉड्यूल लोड विफल");
      } finally {
        state.pagePromises.delete(page.id);
      }
    })();

    state.pagePromises.set(page.id, task);
    await task;
  }

  async function navigate(key) {
    const page = PAGE_MODULES[key];
    const viewId = key === "jump-text" ? "view-index" : views[key];

    if (!viewId || !showView(viewId)) {
      console.warn("[Swar-Sadhika] Unknown page route: " + key);
      return;
    }

    await unmountActivePage();

    if (page) {
      setCurrentNavigation(page.id);
      await loadPageModule(page);
      if (page.id === "tts") {
        const textSection = byId("text-section");
        if (textSection) textSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      setCurrentNavigation(key);
    }
  }

  function createMediaCard(item) {
    const gallery = byId("gallery");
    if (!gallery) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn gallery-item";
    button.dataset.mediaId = item.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "पूर्वावलोकन चुनें: " + item.file.name);
    button.title = item.file.name;

    if (item.kind === "image") {
      const thumbnail = document.createElement("img");
      thumbnail.src = item.url;
      thumbnail.alt = "";
      thumbnail.width = 42;
      thumbnail.height = 56;
      thumbnail.loading = "lazy";
      button.appendChild(thumbnail);
    } else {
      const marker = document.createElement("span");
      marker.textContent = "▶ VIDEO";
      button.appendChild(marker);
    }

    const label = document.createElement("span");
    label.textContent = item.file.name.length > 18
      ? item.file.name.slice(0, 15) + "…"
      : item.file.name;
    button.appendChild(label);
    gallery.appendChild(button);
  }

  function releaseMediaUrl(item) {
    if (item && item.url) {
      URL.revokeObjectURL(item.url);
      item.url = "";
    }
  }

  function selectMedia(id) {
    const item = state.media.find(entry => entry.id === id);
    if (!item) return;

    state.activeMediaId = item.id;
    const image = byId("stage-image");
    const video = byId("stage-video");

    if (item.kind === "video") {
      if (image) image.removeAttribute("src");
      setHidden("stage-image", true);
      if (video) {
        video.pause();
        video.src = item.url;
        video.load();
      }
      setHidden("stage-video", false);
    } else {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      setHidden("stage-video", true);
      if (image) image.src = item.url;
      setHidden("stage-image", false);
    }

    setHidden("stage-empty", true);
    if (byId("remove-media")) byId("remove-media").disabled = false;
    setText("media-status", item.file.name + (item.kind === "video" ? " · वीडियो चयनित" : " · फोटो चयनित"));

    document.querySelectorAll(".gallery-item").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.mediaId === id ? "true" : "false");
    });
  }

  function addMedia(files) {
    const added = [];

    Array.from(files || []).forEach(file => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) return;

      try {
        const item = {
          id: "media-" + (++state.mediaSequence),
          file,
          url: URL.createObjectURL(file),
          kind: isVideo ? "video" : "image"
        };
        state.media.push(item);
        added.push(item);
        createMediaCard(item);
      } catch (error) {
        console.error("[Swar-Sadhika] Local media preview failed", error);
      }
    });

    if (added.length) {
      selectMedia(added[0].id);
      setText("media-status", added.length + " मीडिया फाइलें स्थानीय गैलरी में जोड़ी गईं।");
    } else {
      setText("media-status", "कोई मान्य फोटो या वीडियो फाइल नहीं मिली।");
    }

    const input = byId("media-input");
    if (input) input.value = "";
  }

  function removeSelectedMedia() {
    const index = state.media.findIndex(item => item.id === state.activeMediaId);
    if (index < 0) return;

    const removed = state.media.splice(index, 1)[0];
    releaseMediaUrl(removed);

    const card = document.querySelector('.gallery-item[data-media-id="' + removed.id + '"]');
    if (card) card.remove();

    state.activeMediaId = null;
    if (state.media.length) {
      selectMedia(state.media[Math.min(index, state.media.length - 1)].id);
    } else {
      clearMediaStage();
    }
  }

  function clearMediaStage() {
    const image = byId("stage-image");
    const video = byId("stage-video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (image) image.removeAttribute("src");
    setHidden("stage-image", true);
    setHidden("stage-video", true);
    setHidden("stage-empty", false);
    if (byId("remove-media")) byId("remove-media").disabled = true;
    setText("media-status", "अभी कोई मीडिया चयनित नहीं है।");
  }

  async function requestMediaFullscreen() {
    const stage = byId("media-stage");
    if (!stage) return;

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else if (typeof stage.requestFullscreen === "function") {
        await stage.requestFullscreen();
      } else if (typeof stage.webkitRequestFullscreen === "function") {
        stage.webkitRequestFullscreen();
      } else {
        const video = byId("stage-video");
        if (video && !video.classList.contains("hidden") && typeof video.webkitEnterFullscreen === "function") {
          video.webkitEnterFullscreen();
        } else {
          setText("media-status", "इस ब्राउज़र में Fullscreen API उपलब्ध नहीं है।");
        }
      }
    } catch (error) {
      setText("media-status", "Fullscreen शुरू नहीं हो सका: " +
        (error && error.message ? error.message : "ब्राउज़र अनुमति उपलब्ध नहीं है।"));
    }
  }

  function bindIndexControls() {
    const mediaInput = byId("media-input");
    if (mediaInput) {
      mediaInput.addEventListener("change", event => addMedia(event.target.files));
    }

    const gallery = byId("gallery");
    if (gallery) {
      gallery.addEventListener("click", event => {
        const card = event.target.closest("[data-media-id]");
        if (card && gallery.contains(card)) selectMedia(card.dataset.mediaId);
      });
    }

    const removeButton = byId("remove-media");
    if (removeButton) removeButton.addEventListener("click", removeSelectedMedia);

    const fullscreenButton = byId("fullscreen-btn");
    if (fullscreenButton) fullscreenButton.addEventListener("click", requestMediaFullscreen);
  }

  function safeRegistryPath(path) {
    return typeof path === "string" &&
      /^modules\/[a-z0-9_./-]+\.js$/i.test(path) &&
      !path.split("/").includes("..");
  }

  async function loadRegistry() {
    const status = byId("registry-status");
    try {
      const response = await fetch(new URL("./modules/registry.json", document.baseURI), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? "modules/registry.json अभी Repository में उपलब्ध नहीं है।"
          : "Registry HTTP " + response.status + " त्रुटि।");
      }

      const data = await response.json();
      const entries = Array.isArray(data) ? data : data && data.modules;
      if (!Array.isArray(entries)) throw new TypeError("Registry JSON में modules array नहीं मिली।");

      entries.forEach(entry => {
        const id = entry && String(entry.id || "").trim();
        const title = entry && String(entry.title || entry.name || "").trim();
        const file = entry && (entry.file || entry.path);
        if (!id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id) || !title || !safeRegistryPath(file)) return;
        if (entry.enabled === false || String(entry.status || "").toLowerCase() === "placeholder") return;
        state.registry.entries.set(id, { id, title, file, description: String(entry.description || "") });
      });

      state.registry.loaded = true;
      if (status) {
        status.className = "status";
        status.textContent = state.registry.entries.size + " अतिरिक्त पेज मॉड्यूल Registry में मिले।";
      }
    } catch (error) {
      state.registry.error = error && error.message ? error.message : "Registry उपलब्ध नहीं है।";
      if (status) {
        status.className = "status warn";
        status.textContent = state.registry.error +
          " मुख्य इंडेक्स के मीडिया नियंत्रण इससे स्वतंत्र हैं।";
      }
    }
  }

  async function loadRegisteredModule(id, root, extraContext) {
    if (!state.registry.loaded) await loadRegistry();
    const entry = state.registry.entries.get(id);
    if (!entry) throw new Error("यह मॉड्यूल सक्रिय Registry में उपलब्ध नहीं है: " + id);

    const module = await import(new URL(entry.file, document.baseURI).href);
    if (typeof module.mount !== "function") {
      throw new TypeError("Registry मॉड्यूल में mount(context) export आवश्यक है।");
    }

    return module.mount(Object.assign({
      app,
      root: root || document,
      module: entry
    }, extraContext || {}));
  }

  function emit(eventName, detail) {
    if (typeof eventName !== "string" || !/^[a-z0-9:_-]+$/i.test(eventName)) {
      throw new TypeError("अमान्य application event नाम।");
    }
    document.dispatchEvent(new CustomEvent("swar-sadhika:" + eventName, { detail }));
  }

  function on(eventName, callback) {
    if (typeof callback !== "function") throw new TypeError("Callback function आवश्यक है।");
    const type = "swar-sadhika:" + eventName;
    const listener = event => callback(event.detail, event);
    document.addEventListener(type, listener);
    return () => document.removeEventListener(type, listener);
  }

  const app = Object.freeze({
    version: APP_VERSION,
    root: document,
    navigate,
    emit,
    on,
    loadRegistry,
    loadRegisteredModule,
    getRegistry: () => Array.from(state.registry.entries.values()),
    state: Object.freeze({
      get: key => state.shared.get(key),
      set: (key, value) => state.shared.set(key, value),
      has: key => state.shared.has(key),
      delete: key => state.shared.delete(key)
    })
  });

  function bindNavigation() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    nav.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || !nav.contains(button)) return;

      if (button.dataset.action === "jump-text") {
        navigate("jump-text");
      } else if (button.dataset.route) {
        navigate(button.dataset.route);
      }
    });
  }

  async function start() {
    bindNavigation();
    bindIndexControls();
    loadRegistry();
    await navigate("index");

    window.addEventListener("pagehide", () => {
      state.media.forEach(releaseMediaUrl);
      state.pageInstances.forEach(instance => {
        if (typeof instance.unmount === "function") {
          try {
            const result = instance.unmount();
            if (result && typeof result.catch === "function") result.catch(error => console.error(error));
          } catch (error) {
            console.error("[Swar-Sadhika] Page cleanup failed", error);
          }
        }
      });
      state.shared.clear();
    }, { once: true });

    window.dispatchEvent(new CustomEvent("swar-sadhika:ready", {
      detail: { version: APP_VERSION, app }
    }));
  }

  if (!window.SwarSadhikaApp) {
    Object.defineProperty(window, "SwarSadhikaApp", {
      value: app,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
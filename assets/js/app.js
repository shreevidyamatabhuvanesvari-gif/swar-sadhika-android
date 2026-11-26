/* Swar-Sadhika Android — main application controller.
 * Existing page modules use the lazy Page Loader; Diagnostics is a built-in route.
 * Additional modules are discovered only through modules/registry.json.
 */
(() => {
  "use strict";

  const APP_VERSION = "2.2.2";
  const PAGE_BASE = "./assets/js/pages/";
  const BUILTIN_ROUTES = new Set(["index", "diagnostics"]);
  const PAGE_MODULES = Object.freeze({
    "jump-text": { id: "tts", file: "page-tts.js", root: "text-section", view: "view-index" },
    "nano-server": { id: "nano-server", file: "page-nano-server.js", root: "view-nano-server", view: "view-nano-server" },
    "avatar": { id: "avatar", file: "page-avatar.js", root: "view-avatar", view: "view-avatar" },
    "video": { id: "video", file: "page-video.js", root: "view-video", view: "view-video" },
    "nano-brain": { id: "nano-brain", file: "page-nano-brain-part2.js", root: "view-nano-brain", view: "view-nano-brain" }
  });

  const views = Object.freeze({
    "index": "view-index",
    "nano-server": "view-nano-server",
    "avatar": "view-avatar",
    "video": "view-video",
    "nano-brain": "view-nano-brain",
    "diagnostics": "view-diagnostics"
  });

  const state = {
    media: [],
    activeMediaId: null,
    mediaSequence: 0,
    activePage: null,
    navigationSequence: 0,
    pageInstances: new Map(),
    pagePromises: new Map(),
    registry: {
      loaded: false,
      loading: null,
      error: "",
      entries: new Map(),
      declared: [],
      invalid: []
    },
    diagnosticsPromise: null,
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

  function runPageHook(instance, hookName, context, pageId) {
    const hook = instance && instance[hookName];
    if (typeof hook !== "function") return Promise.resolve();

    const previous = instance.lifecycle || Promise.resolve();
    const task = previous.then(() => hook(context));
    instance.lifecycle = task.catch(error => {
      console.error("[Swar-Sadhika] Page " + hookName + " failed: " + pageId, error);
    });
    return task;
  }

  async function hideActivePage(nextPageId) {
    const active = state.activePage;
    if (!active || active.id === nextPageId) return;

    state.activePage = null;
    const instance = state.pageInstances.get(active.id);
    if (!instance) return;

    try {
      await runPageHook(
        instance,
        "onHide",
        createPageContext(active, byId(active.root)),
        active.id
      );
    } catch (error) {
      console.error("[Swar-Sadhika] Page hide failed: " + active.id, error);
    }
  }

  function normalizePageInstance(module, result) {
    const returnedObject = result && typeof result === "object" ? result : null;
    const pickHook = name => {
      if (returnedObject && typeof returnedObject[name] === "function") {
        return returnedObject[name].bind(returnedObject);
      }
      if (typeof module[name] === "function") return module[name].bind(module);
      return null;
    };

    return {
      module,
      unmount: typeof result === "function" ? result : pickHook("unmount"),
      onShow: pickHook("onShow"),
      onHide: pickHook("onHide"),
      lifecycle: Promise.resolve(),
      activated: false
    };
  }

  async function loadPageModule(page, navigationSequence) {
    const root = byId(page.root);
    if (!root) {
      if (navigationSequence === state.navigationSequence) {
        showPageModulePending(page, "HTML page container नहीं मिला");
      }
      return;
    }

    let instance = state.pageInstances.get(page.id);
    if (!instance) {
      let pending = state.pagePromises.get(page.id);

      if (!pending) {
        const task = (async () => {
          const url = new URL(PAGE_BASE + page.file, document.baseURI);
          const module = await import(url.href);
          if (typeof module.mount !== "function") {
            throw new TypeError("Page module में mount(context) export आवश्यक है।");
          }

          const result = await module.mount(createPageContext(page, root));
          const mountedInstance = normalizePageInstance(module, result);
          state.pageInstances.set(page.id, mountedInstance);
          return mountedInstance;
        })();

        state.pagePromises.set(page.id, task);
        task.then(
          () => {
            if (state.pagePromises.get(page.id) === task) state.pagePromises.delete(page.id);
          },
          () => {
            if (state.pagePromises.get(page.id) === task) state.pagePromises.delete(page.id);
          }
        );
        pending = task;
      }

      try {
        instance = await pending;
      } catch (error) {
        if (navigationSequence === state.navigationSequence) {
          showPageModulePending(
            page,
            error && error.message ? error.message : "मॉड्यूल लोड विफल"
          );
        }
        return;
      }
    }

    if (navigationSequence !== state.navigationSequence || !instance) return;

    state.activePage = page;
    if (instance.activated) {
      try {
        await runPageHook(
          instance,
          "onShow",
          createPageContext(page, root),
          page.id
        );
      } catch (error) {
        showPageModulePending(page, error && error.message ? error.message : "पेज सक्रिय नहीं हो सका");
      }
    } else {
      instance.activated = true;
    }
  }

  async function navigate(key) {
    const page = PAGE_MODULES[key];
    // The index view owns the TTS controls. Treat its TTS module as the active
    // page too, so leaving Index pauses it and returning to Index invokes onShow.
    const pageToActivate = page || (key === "index" ? PAGE_MODULES["jump-text"] : null);
    const viewId = key === "jump-text" ? "view-index" : views[key];

    if (!BUILTIN_ROUTES.has(key) && key !== "jump-text" && !page) {
      console.warn("[Swar-Sadhika] Route is disabled because its page module is not present: " + key);
      return false;
    }
    if (!viewId || !byId(viewId)) {
      console.warn("[Swar-Sadhika] Unknown page route: " + key);
      return false;
    }

    const navigationSequence = ++state.navigationSequence;
    await hideActivePage(pageToActivate ? pageToActivate.id : null);
    if (navigationSequence !== state.navigationSequence) return;
    if (!showView(viewId)) return;

    if (pageToActivate) {
      setCurrentNavigation(key === "jump-text" ? "tts" : key);
      if (pageToActivate.id === "tts" &&
          !state.pageInstances.has(pageToActivate.id) &&
          !state.pagePromises.has(pageToActivate.id)) {
        const ttsSpeakButton = byId("speak-btn");
        if (ttsSpeakButton) ttsSpeakButton.disabled = true;
        setText("tts-status", "स्थानीय TTS Engine और डिवाइस की आवाज़ों की जाँच की जा रही है…");
      }
      await loadPageModule(pageToActivate, navigationSequence);
      if (navigationSequence === state.navigationSequence && key === "jump-text") {
        const textSection = byId("text-section");
        if (textSection) {
          textSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    } else {
      setCurrentNavigation(key);
      if (key === "diagnostics") await runDiagnostics();
    }
    return true;
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

  async function loadRegistry(options) {
    const force = Boolean(options && options.force === true);
    if (state.registry.loading) return state.registry.loading;
    if (state.registry.loaded && !force) return state.registry;

    const task = (async () => {
      const status = byId("registry-status");
      state.registry.loaded = false;
      state.registry.error = "";
      state.registry.entries.clear();
      state.registry.declared = [];
      state.registry.invalid = [];

      try {
        const response = await fetch(
          new URL("./modules/registry.json", document.baseURI),
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(response.status === 404
            ? "modules/registry.json GitHub Pages पर नहीं मिला (HTTP 404)।"
            : "Registry HTTP " + response.status + " त्रुटि।");
        }

        const data = await response.json();
        const entries = Array.isArray(data) ? data : data && data.modules;
        if (!Array.isArray(entries)) {
          throw new TypeError("Registry JSON में modules array नहीं मिली।");
        }
        if (!Array.isArray(data) && data.schemaVersion !== undefined &&
            Number(data.schemaVersion) !== 1) {
          throw new TypeError("असमर्थित Registry schemaVersion: " + data.schemaVersion);
        }
        if (!Array.isArray(data) && data.appId &&
            data.appId !== "swar-sadhika-android") {
          throw new TypeError("Registry appId इस ऐप से मेल नहीं खाता।");
        }

        entries.forEach((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            state.registry.invalid.push("Entry " + (index + 1) + ": object अपेक्षित है।");
            return;
          }

          const id = String(entry.id || "").trim();
          const title = String(entry.title || entry.name || "").trim();
          const file = entry.file || entry.path;
          const statusValue = String(entry.status || "").trim().toLowerCase();
          if (!id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
            state.registry.invalid.push("Entry " + (index + 1) + ": अमान्य या रिक्त id।");
            return;
          }
          if (!title) {
            state.registry.invalid.push(id + ": title/name आवश्यक है।");
            return;
          }
          if (!safeRegistryPath(file)) {
            state.registry.invalid.push(id + ": file को सुरक्षित modules/*.js पथ होना चाहिए।");
            return;
          }
          if (state.registry.entries.has(id) ||
              state.registry.declared.some(item => item.id === id)) {
            state.registry.invalid.push(id + ": duplicate module id।");
            return;
          }

          const enabled = entry.enabled !== false &&
            statusValue !== "placeholder" && statusValue !== "disabled";
          const record = {
            id,
            title,
            file,
            description: String(entry.description || ""),
            enabled,
            status: statusValue || (enabled ? "active" : "disabled")
          };
          state.registry.declared.push(record);
          if (enabled) state.registry.entries.set(id, record);
        });

        state.registry.loaded = true;
        if (status) {
          status.className = state.registry.invalid.length ? "status warn" : "status";
          status.textContent =
            "Registry सफलतापूर्वक पढ़ी गई: " + state.registry.entries.size +
            " सक्रिय मॉड्यूल, " +
            (state.registry.declared.length - state.registry.entries.size) +
            " निष्क्रिय/placeholder, " + state.registry.invalid.length + " अमान्य प्रविष्टियाँ।";
        }
      } catch (error) {
        state.registry.error = error && error.message
          ? error.message
          : "Registry उपलब्ध नहीं है।";
        state.registry.entries.clear();
        if (status) {
          status.className = "status warn";
          status.textContent = state.registry.error +
            " मुख्य इंडेक्स और TTS नियंत्रण Registry से स्वतंत्र हैं।";
        }
      }
      return state.registry;
    })();

    state.registry.loading = task;
    try {
      return await task;
    } finally {
      if (state.registry.loading === task) state.registry.loading = null;
    }
  }

  async function loadRegisteredModule(id, root, extraContext) {
    if (!state.registry.loaded) await loadRegistry();
    if (!state.registry.loaded) {
      throw new Error(state.registry.error || "Module Registry लोड नहीं हो सकी।");
    }
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

  function appendAuditLine(container, passed, title, detail) {
    const line = document.createElement("div");
    line.className = passed ? "status" : "status warn";
    line.textContent = (passed ? "✓ " : "✕ ") + title +
      (detail ? " — " + detail : "");
    container.appendChild(line);
  }

  function isSelfTestSuccessful(result) {
    if (result === true) return true;
    if (!result || typeof result !== "object") return false;
    if (result.status === "PASSED" || result.status === "PASS") {
      return Number(result.failed || 0) === 0;
    }
    return result.ok === true;
  }

  async function runDiagnostics() {
    if (state.diagnosticsPromise) return state.diagnosticsPromise;

    const task = (async () => {
      const auditList = byId("audit-list");
      const moduleAudit = byId("module-audit");
      if (!auditList || !moduleAudit) return null;

      auditList.replaceChildren();
      moduleAudit.replaceChildren();
      let checks = 0;
      let failures = 0;

      const record = (container, passed, title, detail) => {
        checks += 1;
        if (!passed) failures += 1;
        appendAuditLine(container, passed, title, detail);
      };

      const requiredIds = [
        "view-index", "media-input", "gallery", "media-stage",
        "text-input", "speak-btn", "pause-btn", "resume-btn", "stop-btn",
        "view-diagnostics", "run-audit", "registry-status", "module-audit"
      ];
      const missingIds = requiredIds.filter(id => !byId(id));
      record(
        auditList,
        missingIds.length === 0,
        "मुख्य HTML नियंत्रण",
        missingIds.length ? "लापता ID: " + missingIds.join(", ") : requiredIds.length + " आवश्यक तत्व उपलब्ध"
      );
      record(
        auditList,
        typeof window.SwarSadhikaApp === "object",
        "मुख्य App Controller",
        "SwarSadhikaApp API"
      );

      for (const [route, page] of Object.entries(PAGE_MODULES)) {
        try {
          const moduleUrl = new URL(PAGE_BASE + page.file, document.baseURI);
          const pageModule = await import(moduleUrl.href);
          const mountReady = typeof pageModule.mount === "function";
          const containerReady = Boolean(byId(page.root));
          const passed = mountReady && containerReady;
          record(
            auditList,
            passed,
            "पेज मॉड्यूल: " + route,
            !containerReady
              ? "HTML container अनुपस्थित: " + page.root
              : !mountReady
                ? "mount(context) export अनुपस्थित"
                : page.file + " · mount(context) उपलब्ध"
          );
        } catch (error) {
          record(
            auditList,
            false,
            "पेज मॉड्यूल: " + route,
            error && error.message ? error.message : String(error)
          );
        }
      }

      await loadRegistry({ force: true });
      record(
        auditList,
        state.registry.loaded,
        "Module Registry",
        state.registry.loaded
          ? state.registry.entries.size + " सक्रिय मॉड्यूल पढ़े गए"
          : state.registry.error || "Registry load विफल"
      );

      if (state.registry.loaded) {
        for (const entry of state.registry.entries.values()) {
          try {
            const registeredModule = await import(
              new URL(entry.file, document.baseURI).href
            );
            const hasMount = typeof registeredModule.mount === "function";
            if (!hasMount) {
              record(moduleAudit, false, entry.title, "mount(context) export अनुपस्थित");
              continue;
            }

            if (typeof registeredModule.selfTest === "function") {
              const testResult = await registeredModule.selfTest();
              const selfTestPassed = isSelfTestSuccessful(testResult);
              record(
                moduleAudit,
                selfTestPassed,
                entry.title,
                selfTestPassed
                  ? "mount(context) और selfTest() सफल"
                  : "selfTest() असफल या असमर्थित परिणाम"
              );
            } else {
              record(
                moduleAudit,
                true,
                entry.title,
                "mount(context) उपलब्ध; वैकल्पिक selfTest() उपलब्ध नहीं"
              );
            }
          } catch (error) {
            record(
              moduleAudit,
              false,
              entry.title,
              error && error.message ? error.message : String(error)
            );
          }
        }

        state.registry.declared
          .filter(entry => !entry.enabled)
          .forEach(entry => appendAuditLine(
            moduleAudit,
            true,
            entry.title + " (placeholder/disabled)",
            entry.file + " · निष्क्रिय, इसलिए import/mount नहीं किया गया"
          ));

        state.registry.invalid.forEach(message => {
          record(moduleAudit, false, "Registry प्रविष्टि", message);
        });

        if (!state.registry.declared.length && !state.registry.invalid.length) {
          appendAuditLine(
            moduleAudit,
            true,
            "Registry खाली है",
            "यह वैध प्रारंभिक स्थिति है; अभी कोई अतिरिक्त module घोषित नहीं है"
          );
        }
      } else {
        appendAuditLine(
          moduleAudit,
          false,
          "Registry modules",
          state.registry.error || "Registry पढ़ी नहीं जा सकी"
        );
      }

      const summary = document.createElement("div");
      summary.className = failures ? "status warn" : "status";
      summary.textContent = failures
        ? "जाँच पूर्ण: " + (checks - failures) + "/" + checks +
          " सफल; " + failures + " समस्या मिली।"
        : "जाँच पूर्ण: सभी " + checks + " जाँचें सफल रहीं।";
      auditList.prepend(summary);
      return { status: failures ? "FAILED" : "PASSED", total: checks, failed: failures };
    })();

    state.diagnosticsPromise = task;
    try {
      return await task;
    } finally {
      if (state.diagnosticsPromise === task) state.diagnosticsPromise = null;
    }
  }

  function bindDiagnosticsControls() {
    const auditButton = byId("run-audit");
    if (auditButton) auditButton.addEventListener("click", runDiagnostics);
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

    nav.querySelectorAll("button[data-route]").forEach(button => {
      const route = button.dataset.route;
      if (route !== "index" && !BUILTIN_ROUTES.has(route) && !PAGE_MODULES[route]) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.title = "यह पेज सक्रिय नहीं है क्योंकि इसका वास्तविक JavaScript मॉड्यूल Repository में उपलब्ध नहीं है।";
      }
    });

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
    bindDiagnosticsControls();
    loadRegistry();
    // navigate("index") also mounts/activates the TTS module because its
    // controls live inside the Index view. This keeps startup and return-to-Index
    // behavior on the same Page Loader and lifecycle path.
    await navigate("index");

    // Shared Sanskrit Voice Studio: mount once at the document level so it
    // remains available while the SPA changes between its internal pages.
    try {
      await loadRegisteredModule("voice-studio-part2", document, {
        document,
        target: window
      });
    } catch (error) {
      console.error("[Swar-Sadhika] Universal Voice Studio mount failed", error);
      const status = byId("registry-status");
      if (status) {
        status.className = "status warn";
        status.textContent = "साझा Voice Studio उपलब्ध नहीं हुआ: " +
          (error && error.message ? error.message : "अज्ञात त्रुटि");
      }
    }

    window.addEventListener("pagehide", () => {
      state.media.forEach(releaseMediaUrl);
      state.pageInstances.forEach(instance => {
        const cleanup = Promise.resolve(instance.lifecycle)
          .catch(() => undefined)
          .then(() => {
            if (typeof instance.unmount === "function") return instance.unmount();
            return undefined;
          });
        cleanup.catch(error => console.error("[Swar-Sadhika] Page cleanup failed", error));
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

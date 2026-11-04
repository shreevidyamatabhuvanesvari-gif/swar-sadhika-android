/* Swar-Sadhika Android — main bootstrap.
   Button behavior belongs in one module per button:
   assets/js/buttons/button-<id>.js
   assets/js/buttons/action-<action>.js
   assets/js/buttons/route-<route>.js
   Each button module exports onClick({ event, button, app }).
   Form controls use assets/js/controls/control-<id>.js and export onChange/onInput.
   This file contains only startup, module discovery, and module dispatch. */
(() => {
  "use strict";

  const APP_VERSION = "2.1.0";
  const BUTTON_MODULE_BASE = "./assets/js/buttons/";
  const CONTROL_MODULE_BASE = "./assets/js/controls/";
  const PAGE_REGISTRY_URL = "./modules/registry.json";
  const bindings = new WeakMap();
  const bindingRecords = new Set();
  const moduleCache = new Map();
  const sharedState = new Map();

  const pageRegistry = { loaded: false, error: "", entries: new Map() };

  function isSafeModuleKey(value) {
    return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value);
  }

  function moduleKeyFromButton(button) {
    const custom = button.dataset.buttonModule;
    if (custom) return isSafeModuleKey(custom) ? custom : null;
    if (button.dataset.action) {
      const action = button.dataset.action;
      return isSafeModuleKey(action) ? "action-" + action : null;
    }
    if (button.dataset.route) {
      const route = button.dataset.route;
      return isSafeModuleKey(route) ? "route-" + route : null;
    }
    if (button.dataset.mediaId || button.classList.contains("gallery-item")) return "gallery-item";
    if (button.id) return isSafeModuleKey(button.id) ? "button-" + button.id : null;
    return null;
  }

  function moduleKeyFromControl(control) {
    const custom = control.dataset.controlModule;
    if (custom) return isSafeModuleKey(custom) ? custom : null;
    if (control.id) return isSafeModuleKey(control.id) ? "control-" + control.id : null;
    return null;
  }

  function reportModuleError(element, message) {
    element.dataset.moduleState = "unavailable";
    element.setAttribute("aria-description", "इस नियंत्रण की अलग JavaScript मॉड्यूल फ़ाइल अभी उपलब्ध नहीं है।");
    console.warn("[Swar-Sadhika] " + message);
  }

  function reportHandlerError(message, error) {
    console.error("[Swar-Sadhika] " + message, error);
    app.emit("handler:error", { message, error });
  }

  function invoke(handler, context, label) {
    try {
      const result = handler(context);
      if (result && typeof result.then === "function") {
        result.catch(error => reportHandlerError(label + " module failed", error));
      }
    } catch (error) {
      reportHandlerError(label + " module failed", error);
    }
  }

  function moduleUrl(base, key) {
    if (!isSafeModuleKey(key)) throw new TypeError("अमान्य मॉड्यूल नाम।");
    return new URL(base + key + ".js", document.baseURI).href;
  }

  function importOnce(url) {
    if (!moduleCache.has(url)) {
      moduleCache.set(url, import(url).catch(error => {
        moduleCache.delete(url);
        throw error;
      }));
    }
    return moduleCache.get(url);
  }

  function createContext(element, event, kind) {
    return Object.freeze({
      app,
      root: document,
      element,
      button: kind === "button" ? element : null,
      control: kind === "control" ? element : null,
      event: event || null,
      kind
    });
  }

  async function bindButton(button) {
    if (bindings.has(button)) return;
    const key = moduleKeyFromButton(button);
    if (!key) return;

    const record = { element: button, kind: "button", key, module: null, error: null, promise: null };
    bindings.set(button, record);
    bindingRecords.add(record);

    button.addEventListener("click", event => {
      if (!record.module || typeof record.module.onClick !== "function") {
        event.preventDefault();
        if (record.error) reportModuleError(button, "Button module \"" + key + "\" लोड नहीं हुआ।");
        return;
      }
      invoke(record.module.onClick, createContext(button, event, "button"), key);
    });

    record.promise = importOnce(moduleUrl(BUTTON_MODULE_BASE, key))
      .then(async module => {
        if (typeof module.onClick !== "function" && typeof module.default !== "function") {
          throw new TypeError("Button module में onClick(context) या default function export होना चाहिए।");
        }
        record.module = {
          onClick: module.onClick || module.default,
          onMount: module.onMount,
          onUnmount: module.onUnmount
        };
        button.dataset.moduleState = "ready";
        if (typeof record.module.onMount === "function") {
          await record.module.onMount(createContext(button, null, "button"));
        }
      })
      .catch(error => {
        record.error = error;
        reportModuleError(button, "Button module अनुपलब्ध: " + key + ".js");
      });
  }

  async function bindControl(control) {
    if (bindings.has(control)) return;
    const key = moduleKeyFromControl(control);
    if (!key) return;

    const record = { element: control, kind: "control", key, module: null, error: null, promise: null };
    bindings.set(control, record);
    bindingRecords.add(record);

    record.promise = importOnce(moduleUrl(CONTROL_MODULE_BASE, key))
      .then(async module => {
        if (typeof module.onChange !== "function" && typeof module.onInput !== "function") {
          throw new TypeError("Control module में onChange(context) या onInput(context) export होना चाहिए।");
        }
        record.module = {
          onChange: module.onChange,
          onInput: module.onInput,
          onMount: module.onMount,
          onUnmount: module.onUnmount
        };
        control.dataset.moduleState = "ready";
        if (typeof record.module.onChange === "function") {
          control.addEventListener("change", event => {
            invoke(record.module.onChange, createContext(control, event, "control"), key);
          });
        }
        if (typeof record.module.onInput === "function") {
          control.addEventListener("input", event => {
            invoke(record.module.onInput, createContext(control, event, "control"), key);
          });
        }
        if (typeof record.module.onMount === "function") {
          await record.module.onMount(createContext(control, null, "control"));
        }
      })
      .catch(error => {
        record.error = error;
        reportModuleError(control, "Control module अनुपलब्ध: " + key + ".js");
      });
  }

  function scanNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches("button")) bindButton(node);
    if (node.matches("input, select, textarea")) bindControl(node);
    node.querySelectorAll("button").forEach(bindButton);
    node.querySelectorAll("input, select, textarea").forEach(bindControl);
  }

  function emit(eventName, detail) {
    if (typeof eventName !== "string" || !/^[a-z0-9:_-]+$/i.test(eventName)) {
      throw new TypeError("अमान्य application event नाम।");
    }
    document.dispatchEvent(new CustomEvent("swar-sadhika:" + eventName, { detail }));
  }

  function on(eventName, callback) {
    if (typeof callback !== "function") throw new TypeError("Event listener function आवश्यक है।");
    const eventType = "swar-sadhika:" + eventName;
    const listener = event => callback(event.detail, event);
    document.addEventListener(eventType, listener);
    return () => document.removeEventListener(eventType, listener);
  }

  async function loadPageRegistry() {
    const status = document.getElementById("registry-status");
    try {
      const response = await fetch(new URL(PAGE_REGISTRY_URL, document.baseURI), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? "modules/registry.json अभी Repository में उपलब्ध नहीं है।"
          : "Registry पढ़ने में HTTP " + response.status + " त्रुटि आई।");
      }
      const data = await response.json();
      const records = Array.isArray(data) ? data : data && data.modules;
      if (!Array.isArray(records)) throw new TypeError("Registry JSON में modules array नहीं मिली।");

      records.forEach(record => {
        const id = record && String(record.id || "").trim();
        const title = record && String(record.title || record.name || "").trim();
        const file = record && (record.file || record.path);
        const safePath = typeof file === "string" &&
          /^modules\/[a-z0-9_./-]+\.js$/i.test(file) && !file.split("/").includes("..");

        if (!id || !isSafeModuleKey(id) || !title || !safePath) {
          pageRegistry.entries.set("invalid-" + pageRegistry.entries.size, {
            invalid: true,
            title: "अमान्य Registry रिकॉर्ड"
          });
          return;
        }
        if (record.enabled === false || String(record.status || "").toLowerCase() === "placeholder") return;
        pageRegistry.entries.set(id, { id, title, file, description: String(record.description || "") });
      });

      pageRegistry.loaded = true;
      if (status) {
        status.className = "status";
        status.textContent = pageRegistry.entries.size + " Registry रिकॉर्ड पढ़े गए। पेज मॉड्यूल अलग-अलग import होंगे।";
      }
    } catch (error) {
      pageRegistry.error = error && error.message ? error.message : "Registry उपलब्ध नहीं है।";
      if (status) {
        status.className = "status warn";
        status.textContent = pageRegistry.error + " स्वतंत्र button modules इससे अलग हैं।";
      }
    }
  }

  async function loadPageModule(id, mountRoot, extraContext) {
    if (!pageRegistry.loaded) await loadPageRegistry();
    const entry = pageRegistry.entries.get(id);
    if (!entry || entry.invalid) throw new Error("माँगा गया page module Registry में उपलब्ध नहीं है: " + id);

    const module = await import(new URL(entry.file, document.baseURI).href);
    if (typeof module.mount !== "function") throw new TypeError("Page module में mount(context) export आवश्यक है।");

    return module.mount(Object.assign({
      app,
      root: mountRoot || document,
      module: entry
    }, extraContext || {}));
  }

  const app = Object.freeze({
    version: APP_VERSION,
    root: document,
    emit,
    on,
    loadPageRegistry,
    loadPageModule,
    getPageRegistry: () => Array.from(pageRegistry.entries.values()),
    state: Object.freeze({
      get: key => sharedState.get(key),
      set: (key, value) => sharedState.set(key, value),
      has: key => sharedState.has(key),
      delete: key => sharedState.delete(key)
    })
  });

  function start() {
    document.querySelectorAll("button").forEach(bindButton);
    document.querySelectorAll("input, select, textarea").forEach(bindControl);
    loadPageRegistry();

    if (typeof MutationObserver === "function" && document.documentElement) {
      const observer = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(scanNode));
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      app.on("app:stop-observing", () => observer.disconnect());
    }

    window.addEventListener("pagehide", () => {
      bindingRecords.forEach(record => {
        const cleanup = record.module && record.module.onUnmount;
        if (typeof cleanup === "function") {
          invoke(cleanup, createContext(record.element, null, record.kind), record.key);
        }
      });
      bindingRecords.clear();
      sharedState.clear();
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
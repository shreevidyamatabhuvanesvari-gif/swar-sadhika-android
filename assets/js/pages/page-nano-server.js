/* Swar-Sadhika — Nano Server page module.
 * Mounted by the existing app.js page router; index.html and app.js need no edits.
 * Connects the browser-local Nano Server Engine to the visible main-app page.
 * The engine fetches only same-origin app resources and never executes manifest modules.
 */
import {
  createNanoServerEngine,
  NANO_SERVER_ENGINE_VERSION
} from "../nano-server/nano-server-engine-part2.js";

export function mount(context) {
  if (!context || !context.root || !context.document) {
    throw new TypeError("Nano Server पेज को root और document context आवश्यक है।");
  }

  const root = context.root;
  const doc = context.document;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
  if (!win) throw new Error("Nano Server के लिए Browser Window उपलब्ध नहीं है।");

  const manifestUrl = new URL("../../knowledge/manifest.json", import.meta.url);
  const engine = createNanoServerEngine({ host: win });
  const listeners = [];
  const state = {
    destroyed: false,
    booted: false,
    manifest: null,
    entries: [],
    cached: [],
    visible: true,
    busy: new Set(),
    unsubscribers: []
  };

  root.innerHTML = `
    <div class="intro">
      <h1 id="server-title">नैनो सर्वर</h1>
      <p>मुख्य ऐप से जुड़ा ब्राउज़र-स्थानीय नेटवर्क, Knowledge Manifest और सुरक्षित Cache प्रबंधन।</p>
    </div>
    <section class="panel" aria-labelledby="nano-runtime-title">
      <div class="row between">
        <h2 id="nano-runtime-title">इंजन और नेटवर्क स्थिति</h2>
        <div class="row">
          <button id="nano-check-network" class="btn" type="button">नेटवर्क जाँचें</button>
          <button id="nano-refresh-manifest" class="btn primary" type="button">Manifest ताज़ा करें</button>
        </div>
      </div>
      <div class="grid">
        <div class="tile"><strong>इंजन</strong><span id="nano-engine-value" class="subtle">लोड हो रहा है…</span></div>
        <div class="tile"><strong>ब्राउज़र नेटवर्क संकेत</strong><span id="nano-network-value" class="subtle">जाँच लंबित</span></div>
        <div class="tile"><strong>ऐप Origin पहुँच</strong><span id="nano-origin-value" class="subtle">जाँच लंबित</span></div>
        <div class="tile"><strong>स्थानीय संग्रहण</strong><span id="nano-storage-value" class="subtle">प्रारंभ हो रहा है…</span></div>
        <div class="tile"><strong>Manifest प्रविष्टियाँ</strong><span id="nano-manifest-value" class="subtle">लोड होना शेष</span></div>
      </div>
      <div id="nano-status" class="status warn" role="status" aria-live="polite">Nano Server Engine प्रारंभ हो रहा है…</div>
      <p class="note">नेटवर्क संकेत Android/Chrome के वर्तमान कनेक्शन पर आधारित है। वास्तविक ऐप-Origin पहुँच अलग Fetch जाँच से प्रमाणित होती है। यह पृष्ठ मोबाइल डेटा या Wi-Fi को स्वयं चालू/बंद नहीं करता और किसी बाहरी AI API का उपयोग नहीं करता।</p>
    </section>

    <section class="panel" aria-labelledby="nano-manifest-title">
      <div class="row between"><h2 id="nano-manifest-title">मुख्य ऐप का Knowledge Manifest</h2></div>
      <p class="subtle">Manifest URL: <code id="nano-manifest-url"></code></p>
      <p id="nano-manifest-meta" class="subtle">Manifest अभी पढ़ा नहीं गया है।</p>
      <div id="nano-entry-list" class="audit-list"><div class="status">प्रविष्टियाँ लोड हो रही हैं…</div></div>
      <p class="note">JavaScript knowledge-module प्रविष्टियाँ केवल metadata के रूप में दिखाई जाती हैं। वे इस प्रबंधक द्वारा डाउनलोड या execute नहीं की जातीं; उनका मौजूदा static import ही सक्रिय रहता है। केवल सत्यापित text/JSON/Markdown knowledge-document को डाउनलोड किया जा सकता है।</p>
    </section>

    <section class="panel" aria-labelledby="nano-cache-title">
      <div class="row between">
        <h2 id="nano-cache-title">स्थानीय Knowledge Cache</h2>
        <button id="nano-refresh-cache" class="btn" type="button">Cache सूची ताज़ा करें</button>
      </div>
      <div id="nano-cache-list" class="audit-list"><div class="status">स्थानीय Cache पढ़ी जा रही है…</div></div>
      <p class="note">स्थायी Cache के लिए IndexedDB उपलब्ध होना आवश्यक है। IndexedDB अनुपलब्ध होने पर Engine memory fallback का उपयोग कर सकता है; memory Cache पेज/ब्राउज़र बंद होने पर स्थायी नहीं रहती।</p>
    </section>

    <section class="panel" aria-labelledby="nano-reader-title">
      <h2 id="nano-reader-title">Knowledge दस्तावेज़ पूर्वावलोकन</h2>
      <p class="subtle">Manifest से चुनी गई दस्तावेज़ प्रविष्टि पढ़ने के बाद उसका पाठ यहाँ दिखेगा।</p>
      <pre id="nano-document-output" class="status" hidden></pre>
    </section>

    <section class="panel" aria-labelledby="nano-diagnostics-title">
      <div class="row between">
        <h2 id="nano-diagnostics-title">इंजन Diagnostics</h2>
        <button id="nano-refresh-diagnostics" class="btn" type="button">Diagnostics ताज़ा करें</button>
      </div>
      <pre id="nano-diagnostics-output" class="status">प्रारंभिक जाँच लंबित…</pre>
    </section>
  `;

  const ui = {
    engine: root.querySelector("#nano-engine-value"),
    network: root.querySelector("#nano-network-value"),
    origin: root.querySelector("#nano-origin-value"),
    storage: root.querySelector("#nano-storage-value"),
    manifestCount: root.querySelector("#nano-manifest-value"),
    status: root.querySelector("#nano-status"),
    manifestUrl: root.querySelector("#nano-manifest-url"),
    manifestMeta: root.querySelector("#nano-manifest-meta"),
    entryList: root.querySelector("#nano-entry-list"),
    cacheList: root.querySelector("#nano-cache-list"),
    documentOutput: root.querySelector("#nano-document-output"),
    diagnostics: root.querySelector("#nano-diagnostics-output"),
    checkNetwork: root.querySelector("#nano-check-network"),
    refreshManifest: root.querySelector("#nano-refresh-manifest"),
    refreshCache: root.querySelector("#nano-refresh-cache"),
    refreshDiagnostics: root.querySelector("#nano-refresh-diagnostics")
  };

  const required = Object.entries(ui).filter(([, value]) => !value).map(([key]) => key);
  if (required.length) {
    throw new Error("Nano Server पेज में आवश्यक UI तत्व अनुपस्थित हैं: " + required.join(", "));
  }

  ui.engine.textContent = "Nano Server Engine v" + NANO_SERVER_ENGINE_VERSION;
  ui.manifestUrl.textContent = manifestUrl.href;

  function listen(target, type, callback) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }

  function setStatus(message, warning = false) {
    if (state.destroyed || !ui.status) return;
    ui.status.textContent = String(message);
    ui.status.classList.toggle("warn", Boolean(warning));
  }

  function setOutput(target, value, limit = 50000) {
    if (!target) return;
    let text;
    if (typeof value === "string") text = value;
    else {
      try { text = JSON.stringify(value, null, 2); }
      catch (_) { text = String(value); }
    }
    if (text.length > limit) {
      text = text.slice(0, limit) + "\n\n[पूर्वावलोकन सीमा: शेष सामग्री प्रदर्शित नहीं की गई।]";
    }
    target.textContent = text;
    target.hidden = false;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function renderNetwork() {
    if (state.destroyed) return;
    const network = engine.getNetworkStatus();
    ui.network.textContent = network.onlineHint ? "ऑनलाइन संकेत उपलब्ध" : "ऑफलाइन संकेत";
    const details = [];
    if (network.connectionType) details.push("प्रकार: " + network.connectionType);
    if (network.effectiveType) details.push("गति वर्ग: " + network.effectiveType);
    if (network.downlinkMbps !== null) details.push("डाउनलिंक: " + network.downlinkMbps + " Mbps");
    if (network.rttMs !== null) details.push("RTT: " + network.rttMs + " ms");
    ui.network.title = details.join(" · ") || network.note;
  }

  function renderDiagnostics(data) {
    if (!data || state.destroyed) return;
    ui.storage.textContent = data.storage.backend === "indexeddb"
      ? "IndexedDB · स्थायी ब्राउज़र Cache"
      : "Memory fallback · अस्थायी Cache";
    ui.manifestCount.textContent = data.manifest.loaded
      ? data.manifest.entries + " प्रविष्टियाँ · Catalog " + (data.manifest.catalogVersion || "—")
      : "Manifest अभी उपलब्ध नहीं";
    const origin = data.lastNetworkCheck;
    ui.origin.textContent = origin
      ? (origin.reachable ? "ऐप Origin पहुँच योग्य" : "ऐप Origin पहुँच विफल")
      : "अभी वास्तविक Fetch जाँच नहीं हुई";
    setOutput(ui.diagnostics, data);
  }

  function createEntryCard(entry) {
    const card = doc.createElement("div");
    card.className = "tile";

    const heading = doc.createElement("strong");
    heading.textContent = entry.title + " · " + entry.id;
    card.appendChild(heading);

    const detail = doc.createElement("span");
    detail.className = "subtle";
    detail.textContent = entry.entryType === "knowledge-module"
      ? "JavaScript module · Static import metadata · " + (entry.enabled ? "सक्रिय" : "निष्क्रिय")
      : "Knowledge document · " + String(entry.format || "text").toUpperCase() + " · " + (entry.enabled ? "सक्रिय" : "निष्क्रिय");
    card.appendChild(detail);

    const path = doc.createElement("span");
    path.className = "subtle";
    path.textContent = "सापेक्ष पथ: " + entry.path;
    card.appendChild(path);

    if (entry.entryType === "knowledge-module") {
      const note = doc.createElement("span");
      note.className = "pending";
      note.textContent = "यह फ़ाइल पहले से अपने consumer के static import से जुड़ी है; Nano Server इसे execute/download नहीं करेगा।";
      card.appendChild(note);
    } else if (entry.entryType === "knowledge-document") {
      const actions = doc.createElement("div");
      actions.className = "row";
      const readButton = doc.createElement("button");
      readButton.type = "button";
      readButton.className = "btn primary";
      readButton.dataset.action = "read-document";
      readButton.dataset.entryId = entry.id;
      readButton.textContent = "डाउनलोड करके पढ़ें";
      readButton.disabled = !entry.enabled;
      actions.appendChild(readButton);

      const cacheButton = doc.createElement("button");
      cacheButton.type = "button";
      cacheButton.className = "btn";
      cacheButton.dataset.action = "read-cache";
      cacheButton.dataset.entryId = entry.id;
      cacheButton.textContent = "केवल Cache से पढ़ें";
      cacheButton.disabled = !entry.enabled;
      actions.appendChild(cacheButton);
      card.appendChild(actions);
    }

    return card;
  }

  function renderEntries(entries) {
    state.entries = Array.isArray(entries) ? entries.slice() : [];
    ui.entryList.replaceChildren();
    if (!state.entries.length) {
      const empty = doc.createElement("div");
      empty.className = "status warn";
      empty.textContent = "Manifest में अभी कोई सक्रिय Knowledge entry उपलब्ध नहीं है। Manifest को ताज़ा करके पुनः जाँचें।";
      ui.entryList.appendChild(empty);
      return;
    }
    state.entries.forEach(entry => ui.entryList.appendChild(createEntryCard(entry)));
  }

  function renderCache(records) {
    state.cached = Array.isArray(records) ? records.slice() : [];
    ui.cacheList.replaceChildren();
    if (!state.cached.length) {
      const empty = doc.createElement("div");
      empty.className = "status warn";
      empty.textContent = "स्थानीय Cache में अभी कोई downloaded Knowledge document नहीं है।";
      ui.cacheList.appendChild(empty);
      return;
    }

    state.cached.forEach(record => {
      const card = doc.createElement("div");
      card.className = "tile";
      const heading = doc.createElement("strong");
      heading.textContent = record.title + " · " + record.id;
      card.appendChild(heading);
      const detail = doc.createElement("span");
      detail.className = "subtle";
      detail.textContent = String(record.format || "text").toUpperCase() + " · " + formatBytes(record.byteLength) + " · SHA-256 सत्यापित Cache";
      card.appendChild(detail);
      const actions = doc.createElement("div");
      actions.className = "row";
      const read = doc.createElement("button");
      read.type = "button";
      read.className = "btn";
      read.dataset.action = "read-cache";
      read.dataset.entryId = record.id;
      read.textContent = "Cache से पढ़ें";
      actions.appendChild(read);
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "btn danger";
      remove.dataset.action = "remove-cache";
      remove.dataset.entryId = record.id;
      remove.textContent = "स्थानीय Cache हटाएँ";
      actions.appendChild(remove);
      card.appendChild(actions);
      ui.cacheList.appendChild(card);
    });
  }

  async function refreshDiagnostics() {
    if (state.destroyed) return;
    const data = await engine.getDiagnostics();
    renderNetwork();
    renderDiagnostics(data);
  }

  async function refreshCache() {
    if (state.destroyed) return;
    const records = await engine.getCachedEntries();
    if (state.destroyed) return;
    renderCache(records);
    await refreshDiagnostics();
  }

  async function refreshManifest() {
    if (state.destroyed) return;
    ui.refreshManifest.disabled = true;
    try {
      const manifest = await engine.refreshManifest({ allowCached: false });
      if (state.destroyed) return;
      state.manifest = manifest;
      renderEntries(engine.listEntries());
      ui.manifestMeta.textContent = "Catalog " + manifest.catalogVersion + " · " + manifest.entries.length + " कुल प्रविष्टियाँ · स्रोत: ऐप का same-origin Manifest";
      setStatus("मुख्य ऐप का Knowledge Manifest सफलतापूर्वक प्राप्त और schema/path नियमों के अनुसार validate हुआ।", false);
    } catch (error) {
      const cachedManifest = engine.getManifest();
      if (cachedManifest) {
        state.manifest = cachedManifest;
        renderEntries(engine.listEntries());
        ui.manifestMeta.textContent = "स्थानीय cached Manifest · Catalog " + cachedManifest.catalogVersion + " · नया नेटवर्क refresh विफल रहा।";
        setStatus("नया Manifest प्राप्त नहीं हुआ; पहले से सत्यापित स्थानीय Manifest दिखाया जा रहा है। कारण: " + (error.message || "अज्ञात त्रुटि"), true);
      } else {
        state.manifest = null;
        renderEntries([]);
        ui.manifestMeta.textContent = "Manifest प्राप्त नहीं हुआ और स्थानीय cached copy भी उपलब्ध नहीं है।";
        setStatus("Manifest लोड विफल: " + (error.message || "अज्ञात त्रुटि"), true);
      }
    } finally {
      if (!state.destroyed) {
        ui.refreshManifest.disabled = false;
        await refreshDiagnostics().catch(error => setStatus("Diagnostics त्रुटि: " + error.message, true));
      }
    }
  }

  async function probeNetwork() {
    if (state.destroyed) return;
    ui.checkNetwork.disabled = true;
    setStatus("ऐप के अपने Manifest URL पर वास्तविक same-origin Fetch जाँच चल रही है…");
    try {
      const result = await engine.probeAppNetwork({ force: true });
      if (state.destroyed) return;
      setStatus(result.reachable
        ? "ऐप Origin पहुँच योग्य है। HTTP स्थिति: " + result.status + "। जाँच: " + result.checkedAt
        : "ऐप Origin तक Fetch पहुँच सफल नहीं हुई। कारण: " + (result.reason || "HTTP त्रुटि") + "।", !result.reachable);
    } catch (error) {
      if (!state.destroyed) setStatus("नेटवर्क जाँच विफल: " + (error.message || "अज्ञात त्रुटि"), true);
    } finally {
      if (!state.destroyed) {
        ui.checkNetwork.disabled = false;
        await refreshDiagnostics().catch(() => undefined);
      }
    }
  }

  async function readDocument(id, fromCacheOnly) {
    if (state.destroyed) return;
    setStatus(fromCacheOnly ? "स्थानीय Cache से दस्तावेज़ पढ़ा जा रहा है…" : "दस्तावेज़ डाउनलोड/सत्यापित/पढ़ा जा रहा है…");
    try {
      const documentData = await engine.readDocument(id, {
        downloadIfMissing: !fromCacheOnly
      });
      if (state.destroyed) return;
      setOutput(ui.documentOutput, documentData);
      setStatus("Knowledge document पढ़ लिया गया। Engine ने SHA-256 अखंडता जाँची।", false);
    } catch (error) {
      if (!state.destroyed) setStatus("दस्तावेज़ पढ़ना विफल: " + (error.message || "अज्ञात त्रुटि") + (error.code ? " · " + error.code : ""), true);
    }
    await refreshCache().catch(error => setStatus("Cache सूची अपडेट विफल: " + error.message, true));
  }

  async function removeCached(id) {
    if (state.destroyed) return;
    try {
      const removed = await engine.removeCachedEntry(id);
      if (state.destroyed) return;
      setStatus(removed ? "स्थानीय Cache प्रविष्टि हटा दी गई: " + id : "यह प्रविष्टि Cache में पहले से मौजूद नहीं है: " + id, false);
      await refreshCache();
    } catch (error) {
      if (!state.destroyed) setStatus("Cache हटाना विफल: " + error.message, true);
    }
  }

  listen(ui.checkNetwork, "click", probeNetwork);
  listen(ui.refreshManifest, "click", refreshManifest);
  listen(ui.refreshCache, "click", () => refreshCache().catch(error => setStatus("Cache जाँच विफल: " + error.message, true)));
  listen(ui.refreshDiagnostics, "click", () => refreshDiagnostics().catch(error => setStatus("Diagnostics जाँच विफल: " + error.message, true)));

  const handleEntryAction = event => {
    const button = event.target && event.target.closest
      ? event.target.closest("button[data-action][data-entry-id]")
      : null;
    if (!button || !ui.entryList.contains(button)) return;
    const id = button.dataset.entryId;
    if (button.dataset.action === "read-document") readDocument(id, false);
    else if (button.dataset.action === "read-cache") readDocument(id, true);
  };
  const handleCacheAction = event => {
    const button = event.target && event.target.closest
      ? event.target.closest("button[data-action][data-entry-id]")
      : null;
    if (!button || !ui.cacheList.contains(button)) return;
    const id = button.dataset.entryId;
    if (button.dataset.action === "read-cache") readDocument(id, true);
    else if (button.dataset.action === "remove-cache") removeCached(id);
  };
  listen(ui.entryList, "click", handleEntryAction);
  listen(ui.cacheList, "click", handleCacheAction);

  try {
    state.unsubscribers.push(engine.on("networkchange", () => {
      renderNetwork();
      refreshDiagnostics().catch(() => undefined);
    }));
    state.unsubscribers.push(engine.on("downloadprogress", event => {
      const detail = event && event.detail;
      if (!detail) return;
      const percent = detail.total ? Math.min(100, Math.round((detail.loaded / detail.total) * 100)) + "%" : formatBytes(detail.loaded);
      setStatus("Knowledge दस्तावेज़ डाउनलोड हो रहा है: " + detail.id + " · " + percent);
    }));
    state.unsubscribers.push(engine.on("storagewarning", event => {
      const detail = event && event.detail;
      setStatus("IndexedDB उपलब्ध नहीं; अस्थायी Memory Cache सक्रिय है। " + (detail && detail.message ? detail.message : ""), true);
    }));
  } catch (error) {
    setStatus("Engine event listener पंजीकृत नहीं हो सका: " + error.message, true);
  }

  async function bootstrap() {
    if (state.booted || state.destroyed) return;
    state.booted = true;
    try {
      const diagnostics = await engine.initialize();
      if (state.destroyed) return;
      renderNetwork();
      renderDiagnostics(diagnostics);
      await refreshManifest();
      if (state.destroyed) return;
      await refreshCache();
    } catch (error) {
      if (!state.destroyed) {
        setStatus("Nano Server Engine प्रारंभ नहीं हो सका: " + (error.message || "अज्ञात त्रुटि"), true);
        renderNetwork();
        await refreshDiagnostics().catch(() => undefined);
      }
    }
  }

  bootstrap();

  return {
    onShow() {
      state.visible = true;
      renderNetwork();
      if (state.booted) {
        refreshDiagnostics().catch(error => setStatus("Diagnostics त्रुटि: " + error.message, true));
      }
    },
    onHide() {
      state.visible = false;
    },
    async unmount() {
      if (state.destroyed) return;
      state.destroyed = true;
      listeners.splice(0).forEach(remove => {
        try { remove(); } catch (_) {}
      });
      state.unsubscribers.splice(0).forEach(unsubscribe => {
        try { unsubscribe(); } catch (_) {}
      });
      await engine.dispose();
    }
  };
}

export function selfTest() {
  const checks = [
    { id: "mount-export", passed: typeof mount === "function" },
    { id: "engine-version-export", passed: NANO_SERVER_ENGINE_VERSION === "1.0.2" },
    { id: "manifest-path-is-app-owned", passed: new URL("../../knowledge/manifest.json", import.meta.url).pathname.endsWith("/assets/knowledge/manifest.json") }
  ];
  return Object.freeze({
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(Object.freeze))
  });
}
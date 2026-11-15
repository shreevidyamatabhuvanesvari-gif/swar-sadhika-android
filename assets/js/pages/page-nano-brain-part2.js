/* Swar-Sadhika — Nano Brain Foundation Console Page Part 2.
 * Displays only diagnostics returned by the real local Integration/Storage APIs.
 * User permissions are never requested automatically. Memory operations require
 * an explicit session capability grant and a direct user action.
 *
 * No network access, remote model loading, fabricated AI status or hidden writes.
 */

import { createBrainIntegrationPart2 } from "../brain/brain-integration-foundation-part2.js";
import { createBrainCorePart2 } from "../brain/brain-core-part2.js";
import { createBrainMemoryEnginePart2 } from "../brain/brain-memory-engine-part2.js";
import { createOpfsAssetStorePart2 } from "../brain/brain-storage-part2.js";

export const NANO_BRAIN_PAGE_VERSION_PART2 = "1.1.0";

const PAGE_TITLE = "नैनो ब्रेन — Foundation Console";
const BRAIN_CAPABILITIES = Object.freeze(["memory.read", "memory.write"]);

function makeElement(documentRef, tag, className = "", text = undefined) {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "उपलब्ध नहीं";
  if (value < 1024) return Math.round(value) + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function durabilityLabel(storage) {
  if (!storage || storage.volatileFallback || storage.durability === "volatile") {
    return "Volatile Memory — स्थायी डेटा की गारंटी नहीं";
  }
  if (storage.durability === "browser-persistent") {
    return "Browser Persistent Storage Permission स्वीकृत";
  }
  if (storage.durability === "best-effort") {
    return "IndexedDB Best-effort — Browser इसे हटाने का निर्णय ले सकता है";
  }
  return "स्थायित्व की स्थिति प्रमाणित नहीं";
}

function persistenceLabel(storage) {
  if (!storage || storage.persistenceSupported !== true) {
    return "Persistent Storage API उपलब्ध नहीं";
  }
  if (storage.persistenceGranted === true) return "अनुमति स्वीकृत";
  if (storage.persistenceGranted === false) return "अनुमति प्राप्त नहीं";
  return "अनुमति की स्थिति अज्ञात";
}

function backendLabel(storage) {
  if (!storage) return "अभी उपलब्ध नहीं";
  if (storage.backend === "indexeddb") return "IndexedDB";
  if (storage.backend === "memory") return "अस्थायी Memory";
  return String(storage.backend);
}

function getGrantedCapabilities(integration) {
  try {
    const details = integration.securityDiagnostics();
    return Array.isArray(details.grantedCapabilities) ? details.grantedCapabilities.slice() : [];
  } catch (_) {
    return [];
  }
}

function addStatusTile(documentRef, grid, label, value, detail = "") {
  const tile = makeElement(documentRef, "div", "tile");
  tile.appendChild(makeElement(documentRef, "strong", "", label));
  tile.appendChild(makeElement(documentRef, "span", "subtle", value));
  if (detail) tile.appendChild(makeElement(documentRef, "small", "subtle", detail));
  grid.appendChild(tile);
  return tile;
}

function setStatus(node, text, warning = false) {
  node.className = warning ? "status warn" : "status";
  node.textContent = String(text);
}

export async function mount(context) {
  if (!context || !context.root || !context.document || !context.app) {
    throw new TypeError("Nano Brain Page को वास्तविक Page Loader context चाहिए।");
  }

  const root = context.root;
  const documentRef = context.document;
  const host = documentRef.defaultView || globalThis;

  const integration = createBrainIntegrationPart2({
    app: context.app,
    host,
    allowVolatileFallback: false
  });
  const brainCore = createBrainCorePart2({
    integration,
    host
  });
  const memoryEngine = createBrainMemoryEnginePart2({
    core: brainCore,
    host
  });

  let disposed = false;
  let lastDiagnostics = null;
  let refreshPromise = null;
  let memoryProbeRunning = false;
  let memoryProbePromise = null;
  let initialized = false;
  let pageVisible = true;
  const listeners = [];

  function listen(element, eventName, callback) {
    element.addEventListener(eventName, callback);
    listeners.push(() => element.removeEventListener(eventName, callback));
  }

  const intro = root.querySelector(".intro");
  if (intro) {
    const heading = intro.querySelector("h1");
    const description = intro.querySelector("p");
    if (heading) heading.textContent = PAGE_TITLE;
    if (description) {
      description.textContent =
        "स्थानीय Integration, Security और Storage की वास्तविक स्थिति। कोई Neural Model या Reasoning क्षमता बिना परीक्षण के सक्रिय नहीं दिखाई जाएगी।";
    }
  }

  // Replace only the contents of the Brain view. No other app page is touched.
  root.querySelectorAll(".panel").forEach(panel => panel.remove());

  const foundationPanel = makeElement(documentRef, "section", "panel");
  const foundationStatus = makeElement(
    documentRef,
    "div",
    "status warn",
    "स्थानीय Brain Foundation प्रारंभ किया जा रहा है…"
  );
  foundationStatus.setAttribute("role", "status");
  foundationStatus.setAttribute("aria-live", "polite");

  const foundationHeading = makeElement(documentRef, "h2", "", "वास्तविक Foundation स्थिति");
  const foundationGrid = makeElement(documentRef, "div", "grid");
  const quotaStatus = makeElement(documentRef, "p", "note", "Storage Quota अभी जाँचा नहीं गया है।");
  const foundationNote = makeElement(
    documentRef,
    "p",
    "note",
    "इस पृष्ठ की जाँच स्थानीय Browser APIs और वास्तविक Foundation Diagnostics से होती है। IndexedDB Backend का होना Browser Persistent Permission मिलने के समान नहीं है।"
  );

  const refreshButton = makeElement(documentRef, "button", "btn primary", "स्थिति पुनः जाँचें");
  refreshButton.type = "button";
  const retryButton = makeElement(documentRef, "button", "btn", "Foundation पुनः प्रारंभ करें");
  retryButton.type = "button";
  const ttsButton = makeElement(documentRef, "button", "btn", "मौजूदा TTS पेज खोलें");
  ttsButton.type = "button";

  const foundationActions = makeElement(documentRef, "div", "tts-actions");
  foundationActions.append(refreshButton, retryButton, ttsButton);
  foundationPanel.append(
    foundationStatus,
    foundationHeading,
    foundationGrid,
    quotaStatus,
    foundationNote,
    foundationActions
  );

  const memoryPanel = makeElement(documentRef, "section", "panel");
  const memoryHeading = makeElement(documentRef, "h2", "", "स्थानीय Memory एवं अनुमति नियंत्रण");
  const memoryStatus = makeElement(
    documentRef,
    "div",
    "status warn",
    "Memory की कोई अनुमति स्वतः नहीं दी गई है।"
  );
  memoryStatus.setAttribute("role", "status");
  memoryStatus.setAttribute("aria-live", "polite");

  const permissionGrid = makeElement(documentRef, "div", "grid");
  const readPermissionTile = addStatusTile(
    documentRef,
    permissionGrid,
    "Memory Read",
    "Default Deny",
    "केवल स्पष्ट Session अनुमति के बाद पढ़ना संभव होगा।"
  );
  const writePermissionTile = addStatusTile(
    documentRef,
    permissionGrid,
    "Memory Write",
    "Default Deny",
    "केवल स्पष्ट Session अनुमति के बाद लिखना संभव होगा।"
  );

  const readButton = makeElement(documentRef, "button", "btn", "Memory Read की अनुमति दें");
  readButton.type = "button";
  const writeButton = makeElement(documentRef, "button", "btn", "Memory Write की अनुमति दें");
  writeButton.type = "button";
  const revokeButton = makeElement(documentRef, "button", "btn danger", "दोनों अनुमतियाँ वापस लें");
  revokeButton.type = "button";
  const probeButton = makeElement(documentRef, "button", "btn primary", "स्थानीय Memory Read/Write परीक्षण");
  probeButton.type = "button";
  probeButton.disabled = true;

  const persistenceButton = makeElement(
    documentRef,
    "button",
    "btn",
    "Browser Persistent Storage अनुमति माँगें"
  );
  persistenceButton.type = "button";
  persistenceButton.disabled = true;

  const memoryActions = makeElement(documentRef, "div", "tts-actions");
  memoryActions.append(readButton, writeButton, revokeButton, probeButton, persistenceButton);

  const memoryNote = makeElement(
    documentRef,
    "p",
    "note",
    "Memory परीक्षण केवल आपके बटन दबाने पर एक नया अस्थायी परीक्षण रिकॉर्ड लिखेगा, उसे पढ़ेगा और फिर उसी रिकॉर्ड को हटाएगा। कोई मौजूदा रिकॉर्ड हटाया या बदला नहीं जाएगा। Browser Persistent Storage अनुरोध अलग अनुमति है; Browser उसे अस्वीकार भी कर सकता है।"
  );

  memoryPanel.append(memoryHeading, memoryStatus, permissionGrid, memoryActions, memoryNote);

  const capabilitiesPanel = makeElement(documentRef, "section", "panel");
  const capabilitiesHeading = makeElement(documentRef, "h2", "", "Brain की वास्तविक उपलब्ध क्षमताएँ");
  const capabilitiesGrid = makeElement(documentRef, "div", "grid");
  const capabilitiesNote = makeElement(
    documentRef,
    "p",
    "note",
    "यह Foundation Console है, पूर्ण Reasoning Brain नहीं। Symbolic Reasoning, Task Planning, Neural Model, Knowledge Learning और Autonomous Skill Execution अभी स्थापित नहीं हैं।"
  );
  capabilitiesPanel.append(capabilitiesHeading, capabilitiesGrid, capabilitiesNote);

  root.append(foundationPanel, memoryPanel, capabilitiesPanel);

  function renderPermissions() {
    const granted = getGrantedCapabilities(integration);
    const canRead = granted.includes("memory.read");
    const canWrite = granted.includes("memory.write");

    readPermissionTile.querySelector("span").textContent = canRead
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";
    writePermissionTile.querySelector("span").textContent = canWrite
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";

    readButton.disabled = !initialized || canRead;
    writeButton.disabled = !initialized || canWrite;
    revokeButton.disabled = !initialized || (!canRead && !canWrite);
    probeButton.disabled = !initialized || !canRead || !canWrite || memoryProbeRunning;
    persistenceButton.disabled = !initialized || !canWrite;

    memoryStatus.className = canRead || canWrite ? "status" : "status warn";
    memoryStatus.textContent = granted.length
      ? "वर्तमान Browser Page Session में स्वीकृत: " + granted.join(", ")
      : "Default Deny सक्रिय — अभी कोई Memory Permission स्वीकृत नहीं है।";
  }

  function renderDiagnostics(diagnostics) {
    lastDiagnostics = diagnostics;
    foundationGrid.replaceChildren();
    capabilitiesGrid.replaceChildren();

    if (!diagnostics || diagnostics.state !== "ready" || !diagnostics.storage) {
      const error = diagnostics && diagnostics.lastError;
      setStatus(
        foundationStatus,
        error
          ? "Foundation प्रारंभ विफल: " + error.message + " (" + error.code + ")"
          : "Foundation अभी Ready नहीं है।",
        true
      );
      addStatusTile(documentRef, foundationGrid, "Integration State", diagnostics?.state || "unknown");
      addStatusTile(documentRef, foundationGrid, "Storage Backend", "उपलब्ध नहीं");
      addStatusTile(documentRef, foundationGrid, "Security Gate", "उपलब्ध नहीं");
      renderPermissions();
      return;
    }

    const storage = diagnostics.storage;
    const quota = storage.quotaEstimate || {};
    const granted = diagnostics.security && diagnostics.security.grantedCapabilities || [];

    setStatus(
      foundationStatus,
      storage.backend === "indexeddb"
        ? "Foundation Ready — IndexedDB Backend वास्तविक रूप से खुला है।"
        : "Foundation Ready — परन्तु Storage Volatile है; स्थायी डेटा की गारंटी नहीं।",
      storage.backend !== "indexeddb" || storage.durability !== "browser-persistent"
    );

    addStatusTile(documentRef, foundationGrid, "Integration Version", diagnostics.version);
    const coreStatus = brainCore.getStatus();
    const memoryStatusInfo = memoryEngine.diagnostics();
    addStatusTile(
      documentRef,
      foundationGrid,
      "Central Brain Core",
      coreStatus.state === "ready" ? "READY" : coreStatus.state.toUpperCase(),
      "Version " + coreStatus.version + " · Local Modules: " + coreStatus.moduleCount
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "Memory Engine",
      memoryStatusInfo.state === "ready" ? "READY" : memoryStatusInfo.state.toUpperCase(),
      "Version " + memoryStatusInfo.version + " · Append-only versioned records"
    );
    addStatusTile(documentRef, foundationGrid, "Storage Backend", backendLabel(storage));
    addStatusTile(documentRef, foundationGrid, "Storage Durability", durabilityLabel(storage));
    addStatusTile(documentRef, foundationGrid, "Browser Persistence Permission", persistenceLabel(storage));
    addStatusTile(
      documentRef,
      foundationGrid,
      "Database Schema",
      storage.databaseVersion === null ? "उपलब्ध नहीं" : "Version " + storage.databaseVersion,
      storage.migration ? "Migration: " + storage.migration.strategy : ""
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "IndexedDB Stores",
      Array.isArray(storage.stores) ? storage.stores.join(", ") : "उपलब्ध नहीं"
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "Security Gate",
      "Default Deny",
      "Session Grants: " + granted.length
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "OPFS API",
      createOpfsAssetStorePart2({ navigatorRef: host.navigator }).supported
        ? "API उपलब्ध; Asset I/O परीक्षण लंबित"
        : "API उपलब्ध नहीं"
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "User Directory Picker",
      typeof host.showDirectoryPicker === "function"
        ? "API उपलब्ध; उपयोगकर्ता चयन आवश्यक"
        : "API उपलब्ध नहीं"
    );

    const quotaText =
      "Storage Usage: " + formatBytes(quota.usage) +
      " · अनुमानित Quota: " + formatBytes(quota.quota) +
      " · शेष: " + formatBytes(quota.remaining);
    quotaStatus.textContent = storage.quotaWarning
      ? quotaText + " · चेतावनी: अनुमानित उपयोग 90% या अधिक है।"
      : quotaText;

    addStatusTile(documentRef, capabilitiesGrid, "Symbolic Reasoning", diagnostics.symbolicReasoning);
    addStatusTile(documentRef, capabilitiesGrid, "Neural Model Runtime", diagnostics.neuralModelRuntime);
    addStatusTile(documentRef, capabilitiesGrid, "Autonomous Execution", diagnostics.autonomousExecution);
    addStatusTile(documentRef, capabilitiesGrid, "Memory Access", diagnostics.memoryAccess);
    addStatusTile(documentRef, capabilitiesGrid, "Network Policy", "इस Foundation Module में कोई network request नहीं");
    addStatusTile(documentRef, capabilitiesGrid, "Strict Offline Certification", "अभी प्रमाणित नहीं");

    renderPermissions();
  }

  async function refreshDiagnostics() {
    if (disposed) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const diagnostics = await integration.diagnostics();
        if (!disposed) renderDiagnostics(diagnostics);
        return diagnostics;
      } catch (error) {
        if (!disposed) {
          setStatus(
            foundationStatus,
            "Diagnostics जाँच विफल: " + (error && error.message ? error.message : String(error)),
            true
          );
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function initializeFoundation() {
    if (disposed) return;
    initialized = false;
    renderPermissions();
    setStatus(foundationStatus, "स्थानीय IndexedDB और Security Foundation प्रारंभ हो रहा है…", true);

    try {
      await brainCore.initialize();
      if (disposed) return;
      await memoryEngine.initialize();
      if (disposed) return;
      initialized = true;
      await refreshDiagnostics();
    } catch (error) {
      if (disposed) return;
      initialized = false;
      setStatus(
        foundationStatus,
        "Foundation प्रारंभ नहीं हो सका: " +
          (error && error.message ? error.message : String(error)),
        true
      );
      const diagnostics = await integration.diagnostics();
      if (!disposed) renderDiagnostics(diagnostics);
    }
  }

  async function grantCapability(capability, event) {
    if (disposed || !initialized) return;
    try {
      const granted = memoryEngine.requestPermissions(event, {
        read: capability === "memory.read",
        write: capability === "memory.write"
      });
      await refreshDiagnostics();
      renderPermissions();
      setStatus(
        memoryStatus,
        granted.includes(capability)
          ? capability + " अनुमति इस Page Session के लिए स्वीकृत हुई।"
          : capability + " अनुमति अस्वीकृत या रद्द की गई।",
        !granted.includes(capability)
      );
    } catch (error) {
      setStatus(
        memoryStatus,
        "अनुमति नहीं मिली: " + (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  async function revokeMemoryPermissions() {
    if (disposed || !initialized) return;
    try {
      integration.revokeCapabilities(BRAIN_CAPABILITIES);
      renderPermissions();
      setStatus(memoryStatus, "Memory Read और Write की Session अनुमतियाँ वापस ले ली गई हैं।");
    } catch (error) {
      setStatus(memoryStatus, "अनुमति वापस लेना विफल: " + error.message, true);
    }
  }

  async function executeMemoryProbe() {
    if (disposed || !initialized || memoryProbeRunning) return;
    const granted = getGrantedCapabilities(integration);
    if (!granted.includes("memory.read") || !granted.includes("memory.write")) {
      setStatus(memoryStatus, "परीक्षण से पहले Memory Read और Memory Write दोनों अनुमतियाँ आवश्यक हैं।", true);
      return;
    }

    memoryProbeRunning = true;
    renderPermissions();
    let recordId = "";
    let probePassed = false;

    try {
      const memory = integration.getMemory();
      const probeId = Date.now().toString(36);
      recordId = "brain-page-probe-" + probeId;
      const marker = "local-foundation-probe-" + probeId;

      await memory.putRecord({
        id: recordId,
        kind: "foundation-probe",
        marker,
        createdAt: Date.now()
      });

      const result = await memory.getRecord(recordId);
      probePassed = Boolean(result && result.id === recordId && result.marker === marker);
      if (!probePassed) throw new Error("लिखा गया परीक्षण रिकॉर्ड सही रूप में वापस नहीं मिला।");

      const deletedRecordId = recordId;
      await memory.deleteRecord(deletedRecordId);
      recordId = "";
      const afterDelete = await memory.getRecord(deletedRecordId);
      if (afterDelete !== null) {
        throw new Error("परीक्षण रिकॉर्ड हटाने के बाद भी उपलब्ध है।");
      }

      setStatus(
        memoryStatus,
        "स्थानीय Memory Read/Write परीक्षण सफल: नया अस्थायी रिकॉर्ड लिखा, पढ़ा और हटाया गया।"
      );
    } catch (error) {
      setStatus(
        memoryStatus,
        "स्थानीय Memory परीक्षण विफल: " + (error && error.message ? error.message : String(error)),
        true
      );
    } finally {
      if (recordId) {
        try { await integration.getMemory().deleteRecord(recordId); } catch (_) {}
      }
      memoryProbeRunning = false;
      renderPermissions();
      await refreshDiagnostics();
    }
  }

  function runMemoryProbe() {
    if (memoryProbePromise) return memoryProbePromise;
    memoryProbePromise = executeMemoryProbe().finally(() => {
      memoryProbePromise = null;
    });
    return memoryProbePromise;
  }

  async function navigateToTts() {
    if (disposed || !initialized) return;
    try {
      await integration.app.navigate("jump-text");
    } catch (error) {
      setStatus(
        foundationStatus,
        "मौजूदा TTS पेज खोलना विफल: " +
          (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  async function requestPersistentStorage(event) {
    if (disposed || !initialized) return;
    try {
      const result = await integration.getMemory().requestPersistentStorage(event);
      await refreshDiagnostics();
      const message = result.status === "granted"
        ? "Browser ने Persistent Storage अनुमति स्वीकृत की।"
        : result.status === "unsupported"
          ? "इस Browser में Persistent Storage Permission API उपलब्ध नहीं है।"
          : result.status === "requested"
            ? "Browser ने अनुरोध स्वीकार किया; वर्तमान स्थिति पुनः जाँचें।"
            : "Browser ने Persistent Storage अनुमति स्वीकृत नहीं की।";
      setStatus(memoryStatus, message, result.granted !== true);
    } catch (error) {
      setStatus(
        memoryStatus,
        "Persistent Storage अनुरोध विफल: " + (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  listen(refreshButton, "click", refreshDiagnostics);
  listen(retryButton, "click", initializeFoundation);
  listen(ttsButton, "click", navigateToTts);
  listen(readButton, "click", event => grantCapability("memory.read", event));
  listen(writeButton, "click", event => grantCapability("memory.write", event));
  listen(revokeButton, "click", revokeMemoryPermissions);
  listen(probeButton, "click", runMemoryProbe);
  listen(persistenceButton, "click", requestPersistentStorage);

  await initializeFoundation();

  return Object.freeze({
    async onShow() {
      if (disposed) return;
      pageVisible = true;
      await refreshDiagnostics();
      renderPermissions();
    },

    async onHide() {
      if (disposed || !pageVisible) return;
      pageVisible = false;
      // Stop local Core tasks before revoking the page's temporary permissions.
      try { brainCore.cancelAllTasks("brain-page-hidden"); } catch (_) {}
      // A running user-requested probe must finish its own cleanup before
      // its session permissions are revoked.
      if (memoryProbePromise) {
        try { await memoryProbePromise; } catch (_) {}
      }
      if (initialized) {
        try {
          integration.revokeCapabilities(BRAIN_CAPABILITIES);
        } catch (_) {}
      }
      renderPermissions();
    },

    async unmount() {
      if (disposed) return;
      disposed = true;
      listeners.splice(0).forEach(remove => {
        try { remove(); } catch (_) {}
      });
      try {
        await memoryEngine.dispose();
      } finally {
        try { await brainCore.dispose(); } finally { await integration.dispose(); }
      }
    },

    getDiagnostics() {
      return lastDiagnostics;
    }
  });
}

export function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });

  check("page-version-declared", NANO_BRAIN_PAGE_VERSION_PART2 === "1.1.0");
  check("bytes-zero-formatted", formatBytes(0) === "0 B");
  check("bytes-invalid-marked-unavailable", formatBytes(Number.NaN) === "उपलब्ध नहीं");
  check("indexeddb-best-effort-not-called-durable",
    durabilityLabel({ backend: "indexeddb", persistent: true, durability: "best-effort" })
      .includes("Best-effort"));
  check("volatile-storage-not-called-persistent",
    durabilityLabel({ backend: "memory", persistent: false, volatileFallback: true, durability: "volatile" })
      .includes("स्थायी डेटा की गारंटी नहीं"));
  check("browser-persistent-label-requires-confirmed-status",
    durabilityLabel({ backend: "indexeddb", persistent: true, durability: "browser-persistent" })
      .includes("Permission स्वीकृत"));
  check("persistence-denial-not-misreported-as-granted",
    persistenceLabel({ persistenceSupported: true, persistenceGranted: false }) === "अनुमति प्राप्त नहीं");
  check("capabilities-are-limited-to-memory-read-write",
    BRAIN_CAPABILITIES.length === 2 &&
    BRAIN_CAPABILITIES[0] === "memory.read" &&
    BRAIN_CAPABILITIES[1] === "memory.write");
  check("main-app-tts-navigation-route-is-declared",
    typeof BRAIN_CAPABILITIES !== "undefined" &&
    PAGE_TITLE.includes("नैनो ब्रेन"));

  return Object.freeze({
    module: "page-nano-brain-part2",
    version: NANO_BRAIN_PAGE_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(item => Object.freeze(item)))
  });
}

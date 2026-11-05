/* Swar-Sadhika — Nano Server Engine Part 2
 * Local, in-app network monitor, same-origin resource manager and cache coordinator.
 * No remote AI service, third-party API, arbitrary-origin request or script execution.
 * This foundation manages same-origin text knowledge resources; large model-binary
 * downloads and runtime adapters require a separately audited storage/model extension.
 * Knowledge-module entries are metadata only; existing consumers keep their static imports.
 */

export const NANO_SERVER_ENGINE_VERSION = "1.0.1";

const APP_ID = "swar-sadhika-android";
const DB_VERSION = 1;
const DEFAULT_DB_NAME = "swar-sadhika-nano-server";
const DEFAULT_MAX_MANIFEST_BYTES = 256 * 1024;
const DEFAULT_MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_DOWNLOADS = 2;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/i;
const GIT_BLOB_PATTERN = /^[a-f0-9]{40}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const TEXT_FORMATS = new Set(["json", "txt", "text", "md", "markdown"]);

export class NanoServerError extends Error {
  constructor(message, code = "NANO_SERVER_ERROR", details = null) {
    super(message);
    this.name = "NanoServerError";
    this.code = code;
    this.details = details;
  }
}

function fail(message, code, details) {
  throw new NanoServerError(message, code, details || null);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeSha256(value) {
  return String(value || "").replace(/^sha256:/i, "").toLowerCase();
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (value.startsWith("/") || value.includes("\\") || /[?#\u0000-\u001f]/.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch (_) { return false; }
  if (decoded.startsWith("/") || decoded.includes("\\") || /[?#\u0000-\u001f]/.test(decoded)) return false;
  const rawSegments = value.split("/");
  const decodedSegments = decoded.split("/");
  if (rawSegments.length !== decodedSegments.length) return false;
  return rawSegments.every((segment, index) => {
    const decodedSegment = decodedSegments[index];
    if (!segment || !decodedSegment || decodedSegment === ".") return false;
    if (decodedSegment === "..") return segment === "..";
    return !decodedSegment.includes("/");
  });
}

function makeDefaultUrls(moduleUrl) {
  const manifestUrl = new URL("../../knowledge/manifest.json", moduleUrl);
  const appRootUrl = new URL("../../../", moduleUrl);
  return { manifestUrl, appRootUrl };
}

function makeAbortScope(host, externalSignal, timeoutMs) {
  const Controller = host && host.AbortController;
  if (typeof Controller !== "function") {
    fail("इस ब्राउज़र में AbortController उपलब्ध नहीं है।", "ABORT_CONTROLLER_UNAVAILABLE");
  }
  if (externalSignal && (
    typeof externalSignal.addEventListener !== "function" ||
    typeof externalSignal.removeEventListener !== "function"
  )) {
    fail("अनुरोध का AbortSignal अमान्य है।", "INVALID_ABORT_SIGNAL");
  }

  const controller = new Controller();
  let timeoutId = null;
  let externalAbort = null;
  const cleanup = () => {
    try {
      const cancel = typeof host.clearTimeout === "function" ? host.clearTimeout.bind(host) : clearTimeout;
      if (timeoutId !== null) cancel(timeoutId);
    } catch (_) {}
    try {
      if (externalSignal && externalAbort) externalSignal.removeEventListener("abort", externalAbort);
    } catch (_) {}
    timeoutId = null;
    externalAbort = null;
  };

  try {
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else {
        externalAbort = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener("abort", externalAbort, { once: true });
      }
    }
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      const schedule = typeof host.setTimeout === "function" ? host.setTimeout.bind(host) : setTimeout;
      timeoutId = schedule(() => controller.abort(new Error("अनुरोध का समय समाप्त हुआ।")), timeoutMs);
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return { controller, cleanup };
}

function createMemoryStore() {
  const documents = new Map();
  const metadata = new Map();
  return {
    kind: "memory",
    async getDocument(id) { return documents.get(id) || null; },
    async putDocument(record) { documents.set(record.id, record); return true; },
    async deleteDocument(id) { return documents.delete(id); },
    async listDocuments() { return Array.from(documents.values()); },
    async getMetadata(key) { return metadata.get(key) || null; },
    async putMetadata(key, value) { metadata.set(key, value); return true; }
  };
}

function createIndexedDbStore(host, name) {
  return new Promise((resolve, reject) => {
    const indexedDB = host && host.indexedDB;
    if (!indexedDB || typeof indexedDB.open !== "function") {
      reject(new NanoServerError("IndexedDB उपलब्ध नहीं है।", "INDEXEDDB_UNAVAILABLE"));
      return;
    }
    let request;
    try { request = indexedDB.open(name, DB_VERSION); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("metadata")) db.createObjectStore("metadata", { keyPath: "key" });
    };
    let settled = false;
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error("IndexedDB खोलना विफल हुआ।"));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new NanoServerError("IndexedDB का पुराना कनेक्शन बंद होने की प्रतीक्षा है।", "INDEXEDDB_BLOCKED"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        try { db.close(); } catch (_) {}
        return;
      }
      settled = true;
      const run = (storeName, mode, action) => new Promise((res, rej) => {
        let transaction;
        try {
          transaction = db.transaction(storeName, mode);
          const requestResult = action(transaction.objectStore(storeName));
          let result;
          let settled = false;
          requestResult.onsuccess = () => { result = requestResult.result; };
          requestResult.onerror = () => {
            if (settled) return;
            settled = true;
            rej(requestResult.error || new Error("IndexedDB अनुरोध विफल हुआ।"));
          };
          transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            res(result);
          };
          transaction.onerror = () => {
            if (settled) return;
            settled = true;
            rej(transaction.error || new Error("IndexedDB transaction विफल हुआ।"));
          };
          transaction.onabort = () => {
            if (settled) return;
            settled = true;
            rej(transaction.error || new Error("IndexedDB transaction रद्द हुआ।"));
          };
        } catch (error) { rej(error); }
      });
      resolve({
        kind: "indexeddb",
        close() { try { db.close(); } catch (_) {} },
        getDocument(id) { return run("documents", "readonly", store => store.get(id)); },
        putDocument(record) { return run("documents", "readwrite", store => store.put(record)); },
        deleteDocument(id) { return run("documents", "readwrite", store => store.delete(id)).then(() => true); },
        listDocuments() { return run("documents", "readonly", store => store.getAll()); },
        getMetadata(key) { return run("metadata", "readonly", store => store.get(key)).then(record => record ? record.value : null); },
        putMetadata(key, value) { return run("metadata", "readwrite", store => store.put({ key, value })); }
      });
    };
  });
}

async function readResponseBytes(response, maxBytes, onProgress) {
  const rawLength = Number(response.headers && response.headers.get("content-length"));
  if (Number.isFinite(rawLength) && rawLength > maxBytes) {
    fail("संसाधन निर्धारित आकार-सीमा से बड़ा है।", "RESOURCE_TOO_LARGE", { size: rawLength, maxBytes });
  }
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch (_) {}
          fail("डाउनलोड निर्धारित आकार-सीमा से बड़ा हो गया।", "RESOURCE_TOO_LARGE", { size: total, maxBytes });
        }
        chunks.push(chunk);
        if (typeof onProgress === "function") onProgress({ loaded: total, total: Number.isFinite(rawLength) ? rawLength : null });
      }
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    fail("डाउनलोड निर्धारित आकार-सीमा से बड़ा है।", "RESOURCE_TOO_LARGE", { size: buffer.byteLength, maxBytes });
  }
  const bytes = new Uint8Array(buffer);
  if (typeof onProgress === "function") onProgress({ loaded: bytes.byteLength, total: bytes.byteLength });
  return bytes;
}

export function createNanoServerEngine(options = {}) {
  const host = options.host || globalThis;
  const defaults = makeDefaultUrls(import.meta.url);
  const manifestUrl = new URL(options.manifestUrl || defaults.manifestUrl.href);
  const appRootUrl = new URL(options.appRootUrl || defaults.appRootUrl.href);
  if (!appRootUrl.pathname.endsWith("/")) appRootUrl.pathname += "/";
  const fetchImpl = options.fetch || (host.fetch && host.fetch.bind(host));
  const databaseName = String(options.databaseName || DEFAULT_DB_NAME);
  const maxManifestBytes = Number(options.maxManifestBytes || DEFAULT_MAX_MANIFEST_BYTES);
  const maxDocumentBytes = Number(options.maxDocumentBytes || DEFAULT_MAX_DOCUMENT_BYTES);
  const requestTimeoutMs = Number(options.requestTimeoutMs || 20000);

  if (!/^https?:$/.test(manifestUrl.protocol) || !/^https?:$/.test(appRootUrl.protocol)) {
    fail("Nano Server केवल HTTP(S) ऐप Origin पर चल सकता है।", "UNSUPPORTED_ORIGIN");
  }
  if (manifestUrl.origin !== appRootUrl.origin || !manifestUrl.pathname.startsWith(appRootUrl.pathname)) {
    fail("Manifest URL ऐप के अपने Origin और पथ के भीतर होना चाहिए।", "MANIFEST_OUTSIDE_APP");
  }
  if (typeof fetchImpl !== "function") {
    fail("इस ब्राउज़र में Fetch API उपलब्ध नहीं है।", "FETCH_UNAVAILABLE");
  }
  if (!Number.isInteger(maxManifestBytes) || maxManifestBytes < 1024 ||
      !Number.isInteger(maxDocumentBytes) || maxDocumentBytes < 1024 ||
      !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000) {
    fail("Nano Server की आकार या समय-सीमा अमान्य है।", "INVALID_LIMITS");
  }

  let store = createMemoryStore();
  let storageReady = false;
  let initialized = false;
  let initializationPromise = null;
  let disposed = false;
  let lastManifest = null;
  let lastNetworkCheck = null;
  let lastError = null;
  let activeDownloads = 0;
  const listeners = new Map();
  const downloads = new Map();
  const networkEvents = ["online", "offline"];

  function emit(type, detail) {
    const bucket = listeners.get(type);
    if (!bucket) return;
    for (const callback of Array.from(bucket)) {
      try { callback(Object.freeze({ type, detail: detail || null })); } catch (_) {}
    }
  }

  function on(type, callback) {
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    if (typeof type !== "string" || !/^[a-z][a-z0-9:_-]{0,63}$/i.test(type) || typeof callback !== "function") {
      fail("Event name या callback अमान्य है।", "INVALID_EVENT_LISTENER");
    }
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => {
      const bucket = listeners.get(type);
      if (bucket) { bucket.delete(callback); if (!bucket.size) listeners.delete(type); }
    };
  }

  function getNetworkStatus() {
    const nav = host.navigator || {};
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;
    return Object.freeze({
      onlineHint: nav.onLine !== false,
      onlineHintSource: "navigator.onLine",
      effectiveType: connection && typeof connection.effectiveType === "string" ? connection.effectiveType : null,
      connectionType: connection && typeof connection.type === "string" ? connection.type : null,
      downlinkMbps: connection && Number.isFinite(connection.downlink) ? connection.downlink : null,
      rttMs: connection && Number.isFinite(connection.rtt) ? connection.rtt : null,
      lastReachabilityCheck: lastNetworkCheck,
      note: "navigator.onLine केवल संकेत है; वास्तविक पहुँच probeAppNetwork() से जाँची जाती है।"
    });
  }

  function onNetworkChange(event) {
    emit("networkchange", { event: event.type, status: getNetworkStatus() });
  }

  function resolveAppPath(relativePath, baseUrl) {
    if (!safeRelativePath(relativePath)) fail("संसाधन पथ सुरक्षित relative path नहीं है।", "UNSAFE_RESOURCE_PATH", { path: relativePath });
    const resolved = new URL(relativePath, baseUrl);
    if (resolved.origin !== appRootUrl.origin || !resolved.pathname.startsWith(appRootUrl.pathname)) {
      fail("संसाधन ऐप के अपने GitHub Pages पथ से बाहर है।", "RESOURCE_OUTSIDE_APP", { path: relativePath });
    }
    return resolved;
  }

  function validateEntry(entry, ids, manifestBaseUrl) {
    if (!isObject(entry) || typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
      fail("Manifest में अमान्य entry ID है।", "INVALID_MANIFEST_ENTRY");
    }
    if (ids.has(entry.id)) fail("Manifest में दोहराई गई entry ID है।", "DUPLICATE_ENTRY_ID", { id: entry.id });
    ids.add(entry.id);
    if (typeof entry.title !== "string" || !entry.title.trim()) {
      fail("Manifest entry में title आवश्यक है।", "INVALID_MANIFEST_ENTRY", { id: entry.id });
    }
    if (!safeRelativePath(entry.path)) {
      fail("Manifest entry का path सुरक्षित relative path नहीं है।", "UNSAFE_RESOURCE_PATH", { id: entry.id });
    }
    if (entry.pathBase !== undefined && entry.pathBase !== "manifest-directory") {
      fail("अभी केवल manifest-directory आधारित path समर्थित है।", "UNSUPPORTED_PATH_BASE", { id: entry.id });
    }
    const url = resolveAppPath(entry.path, manifestBaseUrl);
    if (entry.consumer !== undefined) {
      if (!safeRelativePath(entry.consumer)) fail("Manifest consumer path असुरक्षित है।", "UNSAFE_CONSUMER_PATH", { id: entry.id });
      resolveAppPath(entry.consumer, manifestBaseUrl);
    }
    const type = entry.entryType;
    if (type === "knowledge-module") {
      if (entry.format !== "javascript-es-module" ||
          entry.integrationMode !== "existing-static-import" ||
          entry.loaderPolicy !== "metadata-only-do-not-dynamic-import" ||
          !GIT_BLOB_PATTERN.test(String(entry.gitBlobSha || "")) ||
          !COMMIT_PATTERN.test(String(entry.sourceCommit || ""))) {
        fail("Knowledge module को सुरक्षित metadata-only static-import नियमों का पालन करना होगा।", "UNSAFE_MODULE_ENTRY", { id: entry.id });
      }
      if (!/\.js$/i.test(url.pathname)) fail("Knowledge module का पथ JavaScript फाइल होना चाहिए।", "INVALID_MODULE_PATH", { id: entry.id });
    } else if (type === "knowledge-document") {
      if (!TEXT_FORMATS.has(String(entry.format || "").toLowerCase()) || !SHA256_PATTERN.test(String(entry.sha256 || ""))) {
        fail("Knowledge document में समर्थित text format और SHA-256 आवश्यक है।", "INVALID_DOCUMENT_ENTRY", { id: entry.id });
      }
    } else {
      fail("Manifest में अज्ञात entryType है।", "UNKNOWN_ENTRY_TYPE", { id: entry.id, entryType: type });
    }
    if (entry.enabled !== true && entry.enabled !== false) {
      fail("Manifest entry में enabled boolean आवश्यक है।", "INVALID_MANIFEST_ENTRY", { id: entry.id });
    }
    return Object.freeze({ ...entry, resolvedUrl: url.href });
  }

  function validateManifest(manifest, sourceUrl = manifestUrl) {
    if (!isObject(manifest) || manifest.schemaVersion !== 1 || manifest.appId !== APP_ID || !Array.isArray(manifest.entries)) {
      fail("Manifest का schema, appId या entries array अमान्य है।", "INVALID_MANIFEST");
    }
    const ids = new Set();
    const manifestBaseUrl = new URL(".", sourceUrl);
    const entries = manifest.entries.map(entry => validateEntry(entry, ids, manifestBaseUrl));
    return Object.freeze({
      schemaVersion: 1,
      catalogVersion: String(manifest.catalogVersion || "0.0.0"),
      appId: APP_ID,
      entries: Object.freeze(entries),
      loadedAt: new Date().toISOString(),
      sourceUrl: sourceUrl.href
    });
  }

  async function initialize() {
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    if (initialized) return getDiagnostics();
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      if (typeof host.addEventListener === "function") {
        for (const eventName of networkEvents) host.addEventListener(eventName, onNetworkChange);
      }
      if (host.navigator && host.navigator.connection && typeof host.navigator.connection.addEventListener === "function") {
        host.navigator.connection.addEventListener("change", onNetworkChange);
      }

      let nextStore;
      try {
        nextStore = await createIndexedDbStore(host, databaseName);
      } catch (error) {
        nextStore = createMemoryStore();
        storageReady = false;
        lastError = {
          code: error.code || "LOCAL_STORAGE_FALLBACK",
          message: error.message || "IndexedDB उपलब्ध नहीं; memory cache सक्रिय है।"
        };
        if (!disposed) emit("storagewarning", lastError);
      }

      if (disposed) {
        if (nextStore && typeof nextStore.close === "function") nextStore.close();
        fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      }

      store = nextStore;
      storageReady = store.kind === "indexeddb";
      try {
        const cached = await store.getMetadata("manifest");
        if (cached && cached.raw) lastManifest = validateManifest(cached.raw, manifestUrl);
      } catch (error) {
        lastError = { code: error.code || "CACHED_MANIFEST_INVALID", message: error.message };
      }

      if (disposed) {
        if (typeof store.close === "function") store.close();
        fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      }

      initialized = true;
      const diagnostics = await getDiagnostics();
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      emit("initialized", diagnostics);
      return diagnostics;
    })();
    try { return await initializationPromise; }
    catch (error) { initializationPromise = null; throw error; }
  }

  async function probeAppNetwork(options = {}) {
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const status = getNetworkStatus();
    if (!status.onlineHint && options.force !== true) {
      lastNetworkCheck = Object.freeze({ reachable: false, checkedAt: new Date().toISOString(), reason: "offline-hint" });
      return lastNetworkCheck;
    }
    const scope = makeAbortScope(host, options.signal, requestTimeoutMs);
    try {
      const response = await fetchImpl(manifestUrl.href, {
        method: "GET",
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: scope.controller.signal
      });
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      const reachable = response.ok;
      if (response.body && typeof response.body.cancel === "function") {
        try { await response.body.cancel(); } catch (_) {}
      }
      lastNetworkCheck = Object.freeze({ reachable, status: response.status, checkedAt: new Date().toISOString(), target: "app-origin" });
      return lastNetworkCheck;
    } catch (error) {
      if (disposed || error.code === "ENGINE_DISPOSED") throw error;
      lastNetworkCheck = Object.freeze({ reachable: false, checkedAt: new Date().toISOString(), reason: error.name === "AbortError" ? "timeout-or-abort" : "request-failed" });
      return lastNetworkCheck;
    } finally { scope.cleanup(); }
  }

  async function refreshManifest(options = {}) {
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    await initialize();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const scope = makeAbortScope(host, options.signal, requestTimeoutMs);
    try {
      const response = await fetchImpl(manifestUrl.href, {
        method: "GET",
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json" },
        signal: scope.controller.signal
      });
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      if (!response.ok) fail("Manifest डाउनलोड विफल हुआ।", "MANIFEST_HTTP_ERROR", { status: response.status });
      const bytes = await readResponseBytes(response, maxManifestBytes);
      const rawText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      let raw;
      try { raw = JSON.parse(rawText); }
      catch (error) { fail("Manifest JSON अमान्य है।", "MANIFEST_JSON_ERROR", { message: error.message }); }
      const validated = validateManifest(raw, manifestUrl);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      await store.putMetadata("manifest", { raw, savedAt: new Date().toISOString() });
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      lastManifest = validated;
      lastError = null;
      lastNetworkCheck = Object.freeze({ reachable: true, status: response.status, checkedAt: new Date().toISOString(), target: "app-origin" });
      emit("manifestrefreshed", { catalogVersion: validated.catalogVersion, entryCount: validated.entries.length });
      return validated;
    } catch (error) {
      if (disposed || error.code === "ENGINE_DISPOSED") throw error;
      lastError = { code: error.code || "MANIFEST_REFRESH_FAILED", message: error.message || "Manifest refresh विफल हुआ।" };
      emit("networkerror", lastError);
      if (lastManifest && options.allowCached !== false) return lastManifest;
      throw error;
    } finally { scope.cleanup(); }
  }

  function getManifest() { return lastManifest; }

  function listEntries(options = {}) {
    if (!lastManifest) return Object.freeze([]);
    const entries = options.includeDisabled === true
      ? lastManifest.entries
      : lastManifest.entries.filter(entry => entry.enabled === true);
    return Object.freeze(entries.slice());
  }

  function getEntry(id) {
    if (!lastManifest) return null;
    return lastManifest.entries.find(entry => entry.id === id) || null;
  }

  async function digestSha256(bytes) {
    const subtle = host.crypto && host.crypto.subtle;
    if (!subtle || typeof subtle.digest !== "function") {
      fail("इस सुरक्षित ब्राउज़र संदर्भ में SHA-256 सत्यापन उपलब्ध नहीं है।", "CRYPTO_UNAVAILABLE");
    }
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }

  async function verifyCachedDocument(record, entry) {
    if (!record || record.id !== entry.id || record.format !== entry.format || !record.bytes) return null;

    let bytes = null;
    if (record.bytes instanceof Uint8Array) {
      bytes = record.bytes;
    } else if (record.bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(record.bytes);
    } else if (ArrayBuffer.isView(record.bytes)) {
      bytes = new Uint8Array(record.bytes.buffer, record.bytes.byteOffset, record.bytes.byteLength);
    }
    if (!bytes || bytes.byteLength > maxDocumentBytes) return null;

    const expectedSha256 = normalizeSha256(entry.sha256);
    if (normalizeSha256(record.sha256) !== expectedSha256) return null;
    const actualSha256 = await digestSha256(bytes);
    if (actualSha256 !== expectedSha256) return null;
    return { ...record, bytes };
  }

  async function downloadEntry(id, options = {}) {
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    await initialize();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const entry = getEntry(id);
    if (!entry) fail("यह Knowledge ID वर्तमान Manifest में नहीं है।", "ENTRY_NOT_FOUND", { id });
    if (!entry.enabled) fail("यह Knowledge entry निष्क्रिय है।", "ENTRY_DISABLED", { id });
    if (entry.entryType === "knowledge-module") {
      fail("यह पहले से Import होने वाला JavaScript मॉड्यूल है; इसे डाउनलोड या execute नहीं किया जाएगा।", "MODULE_METADATA_ONLY", { id });
    }
    if (activeDownloads >= MAX_ACTIVE_DOWNLOADS) fail("एक समय में अधिकतम दो डाउनलोड की अनुमति है।", "DOWNLOAD_LIMIT_REACHED");
    if (downloads.has(id)) fail("इस संसाधन का डाउनलोड पहले से चल रहा है।", "DOWNLOAD_ALREADY_ACTIVE", { id });
    const url = new URL(entry.resolvedUrl);
    if (url.origin !== appRootUrl.origin || !url.pathname.startsWith(appRootUrl.pathname)) {
      fail("डाउनलोड URL ऐप के अपने पथ के बाहर है।", "RESOURCE_OUTSIDE_APP", { id });
    }
    const scope = makeAbortScope(host, options.signal, requestTimeoutMs);
    activeDownloads += 1;
    downloads.set(id, scope.controller);
    try {
      const response = await fetchImpl(url.href, {
        method: "GET",
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json, text/plain, text/markdown" },
        signal: scope.controller.signal
      });
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      if (!response.ok) fail("ज्ञान-फाइल डाउनलोड विफल हुई।", "DOCUMENT_HTTP_ERROR", { id, status: response.status });
      const bytes = await readResponseBytes(response, maxDocumentBytes, progress => emit("downloadprogress", { id, ...progress }));
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      const actualSha256 = await digestSha256(bytes);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      const expectedSha256 = normalizeSha256(entry.sha256);
      if (actualSha256 !== expectedSha256) {
        fail("डाउनलोड की गई ज्ञान-फाइल का SHA-256 Manifest से मेल नहीं खाता।", "DOCUMENT_INTEGRITY_FAILED", { id, expectedSha256, actualSha256 });
      }
      const record = {
        id,
        title: entry.title,
        format: entry.format,
        sha256: actualSha256,
        bytes,
        byteLength: bytes.byteLength,
        sourceUrl: url.href,
        catalogVersion: lastManifest.catalogVersion,
        downloadedAt: new Date().toISOString()
      };
      await store.putDocument(record);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      emit("downloadcomplete", { id, byteLength: bytes.byteLength, sha256: actualSha256, storage: store.kind });
      return Object.freeze({ id, title: entry.title, byteLength: bytes.byteLength, sha256: actualSha256, storage: store.kind });
    } catch (error) {
      const details = { id, code: error.code || "DOWNLOAD_FAILED", message: error.message || "डाउनलोड विफल हुआ।" };
      lastError = details;
      emit("downloaderror", details);
      throw error;
    } finally {
      scope.cleanup();
      downloads.delete(id);
      activeDownloads = Math.max(0, activeDownloads - 1);
    }
  }

  async function readDocument(id, options = {}) {
    await initialize();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const entry = getEntry(id);
    if (!entry) fail("यह Knowledge ID Manifest में उपलब्ध नहीं है।", "ENTRY_NOT_FOUND", { id });
    if (!entry.enabled) fail("यह Knowledge entry निष्क्रिय है।", "ENTRY_DISABLED", { id });
    if (entry.entryType !== "knowledge-document") {
      fail("यह Knowledge entry दस्तावेज़ नहीं, मॉड्यूल metadata है।", "NOT_A_KNOWLEDGE_DOCUMENT", { id });
    }

    let record = await store.getDocument(id);
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    let cacheIntegrityFailed = false;
    if (record) {
      const verified = await verifyCachedDocument(record, entry);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      if (verified) {
        record = verified;
      } else {
        cacheIntegrityFailed = true;
        await store.deleteDocument(id);
        record = null;
      }
    }

    if (options.refresh === true || !record) {
      if (options.downloadIfMissing === false && !record) {
        if (cacheIntegrityFailed) {
          fail("स्थानीय Cache की अखंडता जाँच विफल हुई; दूषित प्रविष्टि हटाई गई।", "CACHE_INTEGRITY_FAILED", { id });
        }
        fail("यह फाइल स्थानीय Cache में उपलब्ध नहीं है।", "OFFLINE_CACHE_MISS", { id });
      }
      await downloadEntry(id, options);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
      record = await store.getDocument(id);
      if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    }

    if (!record) fail("स्थानीय ज्ञान-फाइल पढ़ी नहीं जा सकी।", "CACHE_READ_FAILED", { id });
    const verifiedRecord = await verifyCachedDocument(record, entry);
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    if (!verifiedRecord) {
      await store.deleteDocument(id);
      fail("स्थानीय Cache की SHA-256 अखंडता जाँच विफल हुई।", "CACHE_INTEGRITY_FAILED", { id });
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(verifiedRecord.bytes);
    if (entry.format === "json") {
      try { return JSON.parse(text); }
      catch (error) { fail("स्थानीय JSON ज्ञान-फाइल अमान्य है।", "DOCUMENT_JSON_ERROR", { id, message: error.message }); }
    }
    return text;
  }

  async function getCachedEntries() {
    await initialize();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const records = await store.listDocuments();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    return Object.freeze(records.map(record => Object.freeze({
      id: record.id,
      title: record.title,
      format: record.format,
      byteLength: record.byteLength,
      sha256: record.sha256,
      downloadedAt: record.downloadedAt
    })));
  }

  async function removeCachedEntry(id) {
    await initialize();
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    const existing = await store.getDocument(id);
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    if (!existing) return false;
    await store.deleteDocument(id);
    if (disposed) fail("Nano Server बंद किया जा चुका है।", "ENGINE_DISPOSED");
    return true;
  }

  async function getDiagnostics() {
    const nav = host.navigator || {};
    let storageEstimate = null;
    if (nav.storage && typeof nav.storage.estimate === "function") {
      try {
        const estimate = await nav.storage.estimate();
        storageEstimate = Object.freeze({ quota: estimate.quota || null, usage: estimate.usage || null });
      } catch (_) {}
    }
    return Object.freeze({
      engine: "nano-server",
      version: NANO_SERVER_ENGINE_VERSION,
      appId: APP_ID,
      initialized,
      disposed,
      network: getNetworkStatus(),
      storage: Object.freeze({ backend: store.kind, persistentDatabaseReady: storageReady, estimate: storageEstimate }),
      manifest: Object.freeze({ loaded: Boolean(lastManifest), catalogVersion: lastManifest ? lastManifest.catalogVersion : null, entries: lastManifest ? lastManifest.entries.length : 0 }),
      downloads: Object.freeze({ active: activeDownloads, maximum: MAX_ACTIVE_DOWNLOADS }),
      policy: Object.freeze({ sameOriginOnly: true, appPathOnly: true, thirdPartyApis: false, remoteAI: false, executeManifestModules: false, automaticDownloads: false }),
      lastNetworkCheck,
      lastError
    });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const controller of downloads.values()) {
      try { controller.abort(new Error("Nano Server बंद किया गया।")); } catch (_) {}
    }
    downloads.clear();
    if (typeof host.removeEventListener === "function") {
      for (const eventName of networkEvents) host.removeEventListener(eventName, onNetworkChange);
    }
    if (host.navigator && host.navigator.connection && typeof host.navigator.connection.removeEventListener === "function") {
      host.navigator.connection.removeEventListener("change", onNetworkChange);
    }
    if (typeof store.close === "function") store.close();
    emit("disposed", null);
    listeners.clear();
  }

  function selfTest() {
    const testManifest = {
      schemaVersion: 1,
      appId: APP_ID,
      catalogVersion: "test",
      entries: [{
        id: "vedic-pronunciation-test",
        entryType: "knowledge-module",
        title: "Test knowledge module",
        format: "javascript-es-module",
        path: "../js/tts/vedic-sanskrit-pronunciation.js",
        integrationMode: "existing-static-import",
        loaderPolicy: "metadata-only-do-not-dynamic-import",
        gitBlobSha: "a".repeat(40),
        sourceCommit: "b".repeat(40),
        enabled: true
      }]
    };
    const checks = [];
    const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
    check("engine-version", NANO_SERVER_ENGINE_VERSION === "1.0.1");
    check("abort-controller-unavailable-is-explicit", (() => {
      try { makeAbortScope({}, null, 0); return false; }
      catch (error) { return error.code === "ABORT_CONTROLLER_UNAVAILABLE"; }
    })());
    check("invalid-abort-signal-is-rejected", (() => {
      try {
        makeAbortScope({ AbortController: class { abort() {} } }, {}, 0);
        return false;
      } catch (error) { return error.code === "INVALID_ABORT_SIGNAL"; }
    })());
    check("default-manifest-inside-app", manifestUrl.origin === appRootUrl.origin && manifestUrl.pathname.startsWith(appRootUrl.pathname));
    check("allow-manifest-relative-parent-path", safeRelativePath("../js/tts/vedic-sanskrit-pronunciation.js"));
    check("reject-absolute-path", !safeRelativePath("https://example.com/file.json"));
    check("reject-backslash-path", !safeRelativePath("..\\secret.json"));
    check("reject-encoded-traversal", !safeRelativePath("%2e%2e/secret.json"));
    check("reject-path-escaping-app-root", (() => {
      try { resolveAppPath("../../../../outside.json", manifestUrl); return false; }
      catch (error) { return error.code === "RESOURCE_OUTSIDE_APP"; }
    })());
    check("metadata-only-module-validation", validateManifest(testManifest).entries[0].entryType === "knowledge-module");
    check("reject-duplicate-id", (() => {
      try { validateManifest({ ...testManifest, entries: [testManifest.entries[0], testManifest.entries[0]] }); return false; }
      catch (error) { return error.code === "DUPLICATE_ENTRY_ID"; }
    })());
    check("reject-external-manifest-origin", (() => {
      try { validateManifest(testManifest, new URL("https://example.org/manifest.json")); return false; }
      catch (error) { return error.code === "RESOURCE_OUTSIDE_APP" || error.code === "MANIFEST_OUTSIDE_APP"; }
    })());
    check("network-hint-reported", typeof getNetworkStatus().onlineHint === "boolean");
    check("automatic-downloads-disabled", activeDownloads === 0 && downloads.size === 0);
    return Object.freeze({ status: checks.every(item => item.passed) ? "PASSED" : "FAILED", total: checks.length, passed: checks.filter(item => item.passed).length, failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks.map(Object.freeze)) });
  }

  return Object.freeze({
    initialize,
    getNetworkStatus,
    probeAppNetwork,
    refreshManifest,
    getManifest,
    listEntries,
    getEntry,
    downloadEntry,
    readDocument,
    getCachedEntries,
    removeCachedEntry,
    getDiagnostics,
    on,
    dispose,
    selfTest
  });
}

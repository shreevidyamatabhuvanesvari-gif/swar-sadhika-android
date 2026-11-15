/* Swar-Sadhika Nano Brain — Local Storage Foundation Part 2.
 * IndexedDB is the persistent structured store; Memory is an explicit volatile
 * fallback. OPFS and user-selected directory access are optional capabilities.
 * No network requests are made by this module.
 */

import { assertSafeBrainIdPart2, cloneSafeJsonPart2 } from "./brain-security-part2.js";

export const BRAIN_STORAGE_VERSION_PART2 = "1.0.0";
const DEFAULT_DB_NAME = "swar-sadhika-brain-part2";
const DB_VERSION = 1;
const STORES = Object.freeze({ records: "records", metadata: "metadata", events: "events" });
const FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const DEFAULT_MAX_ASSET_BYTES = 512 * 1024 * 1024;

export class BrainStorageErrorPart2 extends Error {
  constructor(message, code = "BRAIN_STORAGE_ERROR", cause = null) {
    super(message);
    this.name = "BrainStorageErrorPart2";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, cause) {
  throw new BrainStorageErrorPart2(message, code, cause || null);
}

function transact(db, storeName, mode, operation) {
  if (!Object.values(STORES).includes(storeName)) fail("अज्ञात Storage store: " + storeName, "UNKNOWN_STORE");
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    try {
      transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      operation(store, value => { result = value; });
    } catch (error) {
      reject(new BrainStorageErrorPart2("IndexedDB transaction शुरू नहीं हुआ।", "TRANSACTION_START_FAILED", error));
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(new BrainStorageErrorPart2("IndexedDB transaction विफल हुआ।", "TRANSACTION_FAILED", transaction.error));
    transaction.onabort = () => reject(new BrainStorageErrorPart2("IndexedDB transaction रद्द हुआ।", "TRANSACTION_ABORTED", transaction.error));
  });
}

function createMemoryBackend() {
  const maps = { records: new Map(), metadata: new Map(), events: new Map() };
  function mapFor(store) {
    const map = maps[store];
    if (!map) fail("अज्ञात Storage store: " + store, "UNKNOWN_STORE");
    return map;
  }
  return Object.freeze({
    kind: "memory",
    persistent: false,
    async get(store, id) { const value = mapFor(store).get(id); return value === undefined ? null : cloneSafeJsonPart2(value); },
    async put(store, value) {
      const safe = cloneSafeJsonPart2(value);
      const key = store === "metadata" ? safe.key : safe.id;
      assertSafeBrainIdPart2(key, "Storage key");
      mapFor(store).set(key, safe);
      return true;
    },
    async delete(store, id) { assertSafeBrainIdPart2(id, "Storage key"); return mapFor(store).delete(id); },
    async list(store) { return [...mapFor(store).values()].map(item => cloneSafeJsonPart2(item)); },
    async close() { Object.values(maps).forEach(map => map.clear()); }
  });
}

async function openIndexedDb(host, name) {
  const indexedDB = host && host.indexedDB;
  if (!indexedDB || typeof indexedDB.open !== "function") {
    fail("इस ब्राउज़र में IndexedDB उपलब्ध नहीं है।", "INDEXEDDB_UNAVAILABLE");
  }
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDB.open(name, DB_VERSION); }
    catch (error) { reject(new BrainStorageErrorPart2("IndexedDB खुल नहीं सका।", "INDEXEDDB_OPEN_FAILED", error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === "metadata" ? "key" : "id" });
      }
    };
    request.onerror = () => reject(new BrainStorageErrorPart2("IndexedDB खुलना विफल हुआ।", "INDEXEDDB_OPEN_FAILED", request.error));
    request.onblocked = () => reject(new BrainStorageErrorPart2("IndexedDB upgrade किसी खुले पुराने connection के कारण रुका है।", "INDEXEDDB_BLOCKED"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function createIndexedDbBackend(db) {
  return Object.freeze({
    kind: "indexeddb",
    persistent: true,
    async get(store, id) {
      assertSafeBrainIdPart2(id, "Storage key");
      return transact(db, store, "readonly", (objectStore, set) => {
        const request = objectStore.get(id);
        request.onsuccess = () => set(request.result === undefined ? null : cloneSafeJsonPart2(request.result));
      });
    },
    async put(store, value) {
      const safe = cloneSafeJsonPart2(value);
      const key = store === "metadata" ? safe.key : safe.id;
      assertSafeBrainIdPart2(key, "Storage key");
      return transact(db, store, "readwrite", (objectStore, set) => {
        const request = objectStore.put(safe);
        request.onsuccess = () => set(true);
      });
    },
    async delete(store, id) {
      assertSafeBrainIdPart2(id, "Storage key");
      return transact(db, store, "readwrite", (objectStore, set) => {
        const request = objectStore.delete(id);
        request.onsuccess = () => set(true);
      });
    },
    async list(store) {
      return transact(db, store, "readonly", (objectStore, set) => {
        const request = objectStore.getAll();
        request.onsuccess = () => set((request.result || []).map(item => cloneSafeJsonPart2(item)));
      });
    },
    async close() { db.close(); }
  });
}

export async function createBrainStoragePart2(options = {}) {
  const host = options.host || globalThis;
  const dbName = options.dbName || DEFAULT_DB_NAME;
  if (typeof dbName !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(dbName)) fail("Database name अमान्य है।", "INVALID_DB_NAME");
  let backend;
  let initializationError = null;
  try {
    const db = await openIndexedDb(host, dbName);
    backend = createIndexedDbBackend(db);
  } catch (error) {
    initializationError = error;
    if (options.allowVolatileFallback === false) throw error;
    backend = createMemoryBackend();
  }
  let disposed = false;
  function assertActive() { if (disposed) fail("Brain Storage बंद हो चुका है।", "STORAGE_DISPOSED"); }
  async function getRecord(id) { assertActive(); return backend.get("records", id); }
  async function putRecord(record) {
    assertActive();
    const safe = cloneSafeJsonPart2(record);
    if (!safe || typeof safe !== "object") fail("Record object आवश्यक है।", "INVALID_RECORD");
    if (!safe.id) fail("Record में id आवश्यक है।", "RECORD_ID_REQUIRED");
    safe.updatedAt = Number.isFinite(safe.updatedAt) ? safe.updatedAt : Date.now();
    return backend.put("records", safe);
  }
  async function deleteRecord(id) { assertActive(); return backend.delete("records", id); }
  async function listRecords() { assertActive(); return backend.list("records"); }
  async function getMetadata(key) { assertActive(); const item = await backend.get("metadata", key); return item ? item.value : null; }
  async function putMetadata(key, value) { assertActive(); return backend.put("metadata", { key, value: cloneSafeJsonPart2(value), updatedAt: Date.now() }); }
  async function appendEvent(event) {
    assertActive();
    const safe = cloneSafeJsonPart2(event);
    const id = safe && safe.id ? safe.id : "event-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    return backend.put("events", { ...safe, id, createdAt: Number.isFinite(safe.createdAt) ? safe.createdAt : Date.now() });
  }
  async function listEvents() { assertActive(); return backend.list("events"); }
  async function diagnostics() {
    assertActive();
    let estimate = null;
    const storage = host && host.navigator && host.navigator.storage;
    if (storage && typeof storage.estimate === "function") {
      try {
        const value = await storage.estimate();
        estimate = { usage: Number.isFinite(value.usage) ? value.usage : null,
          quota: Number.isFinite(value.quota) ? value.quota : null };
      } catch (_) { estimate = null; }
    }
    return Object.freeze({ version: BRAIN_STORAGE_VERSION_PART2, backend: backend.kind,
      persistent: backend.persistent, volatileFallback: !backend.persistent,
      initializationError: initializationError ? { code: initializationError.code || "STORAGE_INIT_FAILED", message: initializationError.message } : null,
      quotaEstimate: estimate, stores: Object.freeze(Object.values(STORES)) });
  }
  return Object.freeze({
    version: BRAIN_STORAGE_VERSION_PART2,
    ready: true,
    getRecord, putRecord, deleteRecord, listRecords,
    getMetadata, putMetadata, appendEvent, listEvents, diagnostics,
    async dispose() { if (disposed) return; disposed = true; await backend.close(); }
  });
}

export function createOpfsAssetStorePart2(options = {}) {
  const navigatorRef = options.navigatorRef || globalThis.navigator;
  const maxFileBytes = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : DEFAULT_MAX_ASSET_BYTES;
  let rootPromise = null;
  function validateFileName(name) {
    if (typeof name !== "string" || !FILE_PATTERN.test(name) || name.includes("..")) {
      fail("OPFS file name अमान्य है।", "INVALID_ASSET_NAME");
    }
    return name;
  }
  async function root() {
    if (!navigatorRef || !navigatorRef.storage || typeof navigatorRef.storage.getDirectory !== "function") {
      fail("इस ब्राउज़र में Origin Private File System उपलब्ध नहीं है।", "OPFS_UNAVAILABLE");
    }
    if (!rootPromise) rootPromise = navigatorRef.storage.getDirectory().then(dir => dir.getDirectoryHandle("swar-sadhika-brain-part2", { create: true }));
    return rootPromise;
  }
  return Object.freeze({
    supported: Boolean(navigatorRef && navigatorRef.storage && typeof navigatorRef.storage.getDirectory === "function"),
    async write(name, blob) {
      validateFileName(name);
      if (!(blob instanceof Blob)) fail("OPFS asset के लिए Blob आवश्यक है।", "INVALID_ASSET_BLOB");
      if (blob.size > maxFileBytes) fail("Asset अनुमत आकार सीमा से बड़ा है।", "ASSET_TOO_LARGE");
      const directory = await root();
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      try { await writable.write(blob); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch (_) {} throw new BrainStorageErrorPart2("OPFS asset लिखना विफल हुआ।", "OPFS_WRITE_FAILED", error); }
      return Object.freeze({ name, size: blob.size, type: blob.type || "application/octet-stream" });
    },
    read(name) { validateFileName(name); return root().then(directory => directory.getFileHandle(name)).then(handle => handle.getFile()); },
    async remove(name) { validateFileName(name); const directory = await root(); await directory.removeEntry(name); return true; },
    async list() {
      const directory = await root();
      const items = [];
      for await (const [name, handle] of directory.entries()) {
        if (handle.kind === "file") {
          const file = await handle.getFile();
          items.push({ name, size: file.size, type: file.type || "application/octet-stream" });
        }
      }
      return items;
    }
  });
}

export function requestUserDirectoryPart2(options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  const EventConstructor = options.EventConstructor || globalThis.Event;
  const event = options.event;
  if (typeof EventConstructor !== "function" || !(event instanceof EventConstructor) ||
      event.isTrusted !== true || !["click", "pointerup", "keydown"].includes(event.type)) {
    fail("Directory चयन के लिए वास्तविक, प्रत्यक्ष उपयोगकर्ता gesture आवश्यक है।", "USER_GESTURE_REQUIRED");
  }
  if (!windowRef || typeof windowRef.showDirectoryPicker !== "function") {
    fail("इस Android/ब्राउज़र संयोजन में Directory Picker उपलब्ध नहीं है।", "DIRECTORY_PICKER_UNAVAILABLE");
  }
  return windowRef.showDirectoryPicker({ mode: "readwrite" }).then(handle =>
    Object.freeze({ handle, kind: "user-selected-directory", persistentHandleStorage: false,
      note: "इस चयनित handle को इस Foundation द्वारा स्वतः स्थायी रूप से सहेजा नहीं गया है।" })
  ).catch(error => {
    if (error && error.name === "AbortError") throw new BrainStorageErrorPart2("उपयोगकर्ता ने Directory चयन रद्द किया।", "DIRECTORY_PICKER_CANCELLED");
    throw new BrainStorageErrorPart2("Directory चयन विफल हुआ।", "DIRECTORY_PICKER_FAILED", error);
  });
}

export async function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  try {
    check("opfs-feature-detection-safe", createOpfsAssetStorePart2({ navigatorRef: {} }).supported === false);
    let gestureBlocked = false;
    try { requestUserDirectoryPart2({ event: { type: "click", isTrusted: true }, EventConstructor: function Event() {}, windowRef: {} }); }
    catch (error) { gestureBlocked = error.code === "USER_GESTURE_REQUIRED"; }
    check("forged-directory-picker-gesture-rejected", gestureBlocked);
    let unsafeFileNameBlocked = false;
    const store = createOpfsAssetStorePart2({ navigatorRef: {} });
    try { store.read("../secrets"); } catch (error) { unsafeFileNameBlocked = error.code === "INVALID_ASSET_NAME"; }
    check("opfs-path-traversal-rejected", unsafeFileNameBlocked);
    const backend = await createBrainStoragePart2({ host: {}, dbName: "swar-brain-test", allowVolatileFallback: true });
    const info = await backend.diagnostics();
    check("memory-fallback-explicitly-marked-volatile", info.backend === "memory" && info.persistent === false && info.volatileFallback === true);
    await backend.putRecord({ id: "test-record", kind: "test", value: 7 });
    const record = await backend.getRecord("test-record");
    check("memory-record-roundtrip", record && record.value === 7);
    await backend.putMetadata("test-meta", { source: "self-test" });
    const metadata = await backend.getMetadata("test-meta");
    check("metadata-roundtrip", metadata && metadata.source === "self-test");
    await backend.appendEvent({ type: "test-event", detail: { ok: true } });
    check("event-log-roundtrip", (await backend.listEvents()).length === 1);
    await backend.deleteRecord("test-record");
    check("record-delete", await backend.getRecord("test-record") === null);
    await backend.dispose();
  } catch (_) { check("storage-self-test-unexpected-error", false); }
  return Object.freeze({ module: "brain-storage-part2", status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks) });
}

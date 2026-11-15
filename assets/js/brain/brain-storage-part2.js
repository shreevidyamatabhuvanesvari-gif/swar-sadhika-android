/* Swar-Sadhika Nano Brain — Local Storage Foundation Part 2.
 * Local-only structured storage with non-destructive v1 -> v2 migration,
 * explicit best-effort vs persistent-storage diagnostics, quota errors,
 * checksummed export/import, bounded reads, and optional OPFS access.
 * This module performs no network requests and never claims that volatile
 * memory or best-effort IndexedDB is guaranteed durable storage.
 */

import {
  assertSafeBrainIdPart2,
  cloneSafeJsonPart2,
  sha256HexPart2,
  verifySha256Part2
} from "./brain-security-part2.js";

export const BRAIN_STORAGE_VERSION_PART2 = "1.1.0";

const DEFAULT_DB_NAME = "swar-sadhika-brain-part2";
const DB_VERSION = 2;
const STORES = Object.freeze({
  records: "records",
  metadata: "metadata",
  events: "events"
});
const BACKUP_FORMAT = "swar-sadhika.brain-backup";
const BACKUP_FORMAT_VERSION = 1;
const MAX_LIST_LIMIT = 500;
const MAX_BACKUP_ITEMS_PER_STORE = 1000;
const MAX_BACKUP_CHARS = 900000;
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

function normalizeStorageError(error, fallbackCode = "STORAGE_OPERATION_FAILED") {
  if (error instanceof BrainStorageErrorPart2) return error;
  if (error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)) {
    return new BrainStorageErrorPart2(
      "स्थानीय Storage की उपलब्ध सीमा पूरी हो गई है। पुराने डेटा को स्वतः हटाया नहीं गया।",
      "STORAGE_QUOTA_EXCEEDED",
      error
    );
  }
  if (error && error.name === "ConstraintError") {
    return new BrainStorageErrorPart2("इस Storage key का रिकॉर्ड पहले से मौजूद है।", "STORAGE_KEY_CONFLICT", error);
  }
  return new BrainStorageErrorPart2(
    error && error.message ? error.message : "स्थानीय Storage कार्य विफल हुआ।",
    fallbackCode,
    error || null
  );
}

function normalizeStoreName(storeName) {
  if (!Object.values(STORES).includes(storeName)) {
    fail("अज्ञात Storage store: " + storeName, "UNKNOWN_STORE");
  }
  return storeName;
}

function normalizeLimit(limit, defaultValue = 100) {
  const value = limit === undefined ? defaultValue : limit;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
    fail("List limit 1 से " + MAX_LIST_LIMIT + " के बीच पूर्णांक होना चाहिए।", "INVALID_LIST_LIMIT");
  }
  return value;
}

function normalizeRecord(record, storeName) {
  const safe = cloneSafeJsonPart2(record);
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) {
    fail("Storage record साधारण JSON object होना चाहिए।", "INVALID_RECORD");
  }
  const key = storeName === "metadata" ? safe.key : safe.id;
  assertSafeBrainIdPart2(key, "Storage key");
  return safe;
}

function createMemoryBackend() {
  const maps = {
    records: new Map(),
    metadata: new Map(),
    events: new Map()
  };

  function mapFor(storeName) {
    const name = normalizeStoreName(storeName);
    return maps[name];
  }

  return Object.freeze({
    kind: "memory",
    persistent: false,
    async get(storeName, id) {
      assertSafeBrainIdPart2(id, "Storage key");
      const value = mapFor(storeName).get(id);
      return value === undefined ? null : cloneSafeJsonPart2(value);
    },
    async put(storeName, value) {
      const safe = normalizeRecord(value, storeName);
      const key = storeName === "metadata" ? safe.key : safe.id;
      mapFor(storeName).set(key, safe);
      return true;
    },
    async add(storeName, value) {
      const safe = normalizeRecord(value, storeName);
      const key = storeName === "metadata" ? safe.key : safe.id;
      const map = mapFor(storeName);
      if (map.has(key)) fail("इस Storage key का रिकॉर्ड पहले से मौजूद है।", "STORAGE_KEY_CONFLICT");
      map.set(key, safe);
      return true;
    },
    async delete(storeName, id) {
      assertSafeBrainIdPart2(id, "Storage key");
      return mapFor(storeName).delete(id);
    },
    async list(storeName, limit = 100) {
      const count = normalizeLimit(limit);
      return [...mapFor(storeName).values()]
        .slice(0, count)
        .map(item => cloneSafeJsonPart2(item));
    },
    async importBundle(bundle) {
      const prepared = {};
      for (const storeName of Object.values(STORES)) {
        prepared[storeName] = bundle[storeName].map(item => normalizeRecord(item, storeName));
      }
      for (const storeName of Object.values(STORES)) {
        const map = mapFor(storeName);
        for (const item of prepared[storeName]) {
          const key = storeName === "metadata" ? item.key : item.id;
          if (map.has(key)) fail("Backup में मौजूदा key से टकराव है: " + key, "BACKUP_KEY_CONFLICT");
        }
      }
      for (const storeName of Object.values(STORES)) {
        const map = mapFor(storeName);
        for (const item of prepared[storeName]) {
          const key = storeName === "metadata" ? item.key : item.id;
          map.set(key, item);
        }
      }
      return Object.freeze({
        records: prepared.records.length,
        metadata: prepared.metadata.length,
        events: prepared.events.length
      });
    },
    async close() {
      Object.values(maps).forEach(map => map.clear());
    }
  });
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

async function openIndexedDb(host, name) {
  const indexedDB = host && host.indexedDB;
  if (!indexedDB || typeof indexedDB.open !== "function") {
    fail("इस ब्राउज़र में IndexedDB उपलब्ध नहीं है।", "INDEXEDDB_UNAVAILABLE");
  }

  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let blocked = false;

    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      reject(normalizeStorageError(error, "INDEXEDDB_OPEN_FAILED"));
    };

    try {
      request = indexedDB.open(name, DB_VERSION);
    } catch (error) {
      rejectOnce(error);
      return;
    }

    request.onupgradeneeded = event => {
      try {
        const db = request.result;
        const transaction = request.transaction;

        for (const storeName of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, {
              keyPath: storeName === "metadata" ? "key" : "id"
            });
          }
        }

        // Non-destructive migration: retain all v1 records and add only
        // missing indexes and a schema marker. No object store is cleared.
        ensureIndex(transaction.objectStore(STORES.records), "byUpdatedAt", "updatedAt");
        ensureIndex(transaction.objectStore(STORES.events), "byCreatedAt", "createdAt");

        transaction.objectStore(STORES.metadata).put({
          key: "schemaVersion",
          value: DB_VERSION,
          updatedAt: Date.now(),
          migration: {
            from: Number.isInteger(event.oldVersion) ? event.oldVersion : 0,
            to: DB_VERSION,
            strategy: "non-destructive-additive"
          }
        });
      } catch (error) {
        try { request.transaction.abort(); } catch (_) {}
        rejectOnce(new BrainStorageErrorPart2(
          "IndexedDB schema migration विफल हुई; पुराने डेटा को हटाया नहीं गया।",
          "INDEXEDDB_UPGRADE_FAILED",
          error
        ));
      }
    };

    request.onerror = () => rejectOnce(request.error || new Error("IndexedDB open failed"));

    request.onblocked = () => {
      blocked = true;
      rejectOnce(new BrainStorageErrorPart2(
        "पुराना खुला Database Connection बंद होने तक IndexedDB migration रुकी हुई है।",
        "INDEXEDDB_BLOCKED"
      ));
    };

    request.onsuccess = () => {
      const db = request.result;
      if (settled || blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      db.onclose = () => {};
      settled = true;
      resolve(db);
    };
  });
}

function transact(db, storeNames, mode, operation) {
  const names = (Array.isArray(storeNames) ? storeNames : [storeNames]).map(normalizeStoreName);
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let operationError = null;

    try {
      transaction = db.transaction(names, mode);
      const stores = Object.fromEntries(names.map(name => [name, transaction.objectStore(name)]));
      operation(stores, transaction, value => { result = value; });
    } catch (error) {
      reject(normalizeStorageError(error, "TRANSACTION_START_FAILED"));
      return;
    }

    transaction.oncomplete = () => {
      if (operationError) reject(normalizeStorageError(operationError));
      else resolve(result);
    };
    transaction.onerror = () => reject(normalizeStorageError(
      operationError || transaction.error,
      "TRANSACTION_FAILED"
    ));
    transaction.onabort = () => reject(normalizeStorageError(
      operationError || transaction.error,
      "TRANSACTION_ABORTED"
    ));

    // Request failures abort the complete transaction. This keeps multi-store
    // backup import atomic instead of leaving a partially restored database.
    transaction.addEventListener("error", event => {
      if (event.target && event.target.error) operationError = event.target.error;
    }, true);
  });
}

function createIndexedDbBackend(db) {
  return Object.freeze({
    kind: "indexeddb",
    persistent: true,
    async get(storeName, id) {
      normalizeStoreName(storeName);
      assertSafeBrainIdPart2(id, "Storage key");
      return transact(db, storeName, "readonly", (stores, transaction, set) => {
        const request = stores[storeName].get(id);
        request.onsuccess = () => set(
          request.result === undefined ? null : cloneSafeJsonPart2(request.result)
        );
      });
    },
    async put(storeName, value) {
      normalizeStoreName(storeName);
      const safe = normalizeRecord(value, storeName);
      return transact(db, storeName, "readwrite", (stores, transaction, set) => {
        const request = stores[storeName].put(safe);
        request.onsuccess = () => set(true);
      });
    },
    async add(storeName, value) {
      normalizeStoreName(storeName);
      const safe = normalizeRecord(value, storeName);
      return transact(db, storeName, "readwrite", (stores, transaction, set) => {
        const request = stores[storeName].add(safe);
        request.onsuccess = () => set(true);
      });
    },
    async delete(storeName, id) {
      normalizeStoreName(storeName);
      assertSafeBrainIdPart2(id, "Storage key");
      return transact(db, storeName, "readwrite", (stores, transaction, set) => {
        const request = stores[storeName].delete(id);
        request.onsuccess = () => set(true);
      });
    },
    async list(storeName, limit = 100) {
      normalizeStoreName(storeName);
      const count = normalizeLimit(limit);
      return transact(db, storeName, "readonly", (stores, transaction, set) => {
        const request = stores[storeName].getAll(undefined, count);
        request.onsuccess = () => set((request.result || []).map(item => cloneSafeJsonPart2(item)));
      });
    },
    async importBundle(bundle) {
      const prepared = {};
      for (const storeName of Object.values(STORES)) {
        prepared[storeName] = bundle[storeName].map(item => normalizeRecord(item, storeName));
      }
      return transact(db, Object.values(STORES), "readwrite", (stores, transaction, set) => {
        for (const storeName of Object.values(STORES)) {
          for (const item of prepared[storeName]) {
            const request = stores[storeName].add(item);
            request.onerror = event => {
              // Prevent the default request error from being hidden; abort all
              // three stores so backup restoration remains all-or-nothing.
              try { transaction.abort(); } catch (_) {}
            };
          }
        }
        transaction.oncomplete = () => set(Object.freeze({
          records: prepared.records.length,
          metadata: prepared.metadata.length,
          events: prepared.events.length
        }));
      });
    },
    async close() {
      db.close();
    }
  });
}

function requireTrustedGesture(host, event) {
  const EventConstructor = host && host.Event ? host.Event : globalThis.Event;
  if (typeof EventConstructor !== "function" ||
      !(event instanceof EventConstructor) ||
      event.isTrusted !== true ||
      !["click", "pointerup", "keydown"].includes(event.type)) {
    fail("इस अनुमति के लिए वास्तविक उपयोगकर्ता gesture आवश्यक है।", "USER_GESTURE_REQUIRED");
  }
}

function deleteDatabase(indexedDB, name) {
  if (!indexedDB || typeof indexedDB.deleteDatabase !== "function") return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(normalizeStorageError(request.error, "INDEXEDDB_DELETE_FAILED"));
    request.onblocked = () => reject(new BrainStorageErrorPart2(
      "Self-test Database हटाना पुराने खुले Connection के कारण रुका है।",
      "INDEXEDDB_DELETE_BLOCKED"
    ));
  });
}

export async function createBrainStoragePart2(options = {}) {
  const host = options.host || globalThis;
  const dbName = options.dbName || DEFAULT_DB_NAME;
  if (typeof dbName !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(dbName)) {
    fail("Database name अमान्य है।", "INVALID_DB_NAME");
  }

  let backend;
  let initializationError = null;
  try {
    const db = await openIndexedDb(host, dbName);
    backend = createIndexedDbBackend(db);
  } catch (error) {
    initializationError = normalizeStorageError(error, "STORAGE_INIT_FAILED");
    if (options.allowVolatileFallback === false) throw initializationError;
    backend = createMemoryBackend();
  }

  let disposed = false;
  let disposePromise = null;

  function assertActive() {
    if (disposed) fail("Brain Storage बंद हो चुका है।", "STORAGE_DISPOSED");
  }

  async function getRecord(id) {
    assertActive();
    return backend.get(STORES.records, id);
  }

  async function putRecord(record) {
    assertActive();
    const safe = normalizeRecord(record, STORES.records);
    safe.updatedAt = Number.isFinite(safe.updatedAt) ? safe.updatedAt : Date.now();
    return backend.put(STORES.records, safe);
  }

  async function deleteRecord(id) {
    assertActive();
    return backend.delete(STORES.records, id);
  }

  async function listRecords(options = {}) {
    assertActive();
    return backend.list(STORES.records, normalizeLimit(options.limit, 100));
  }

  async function getMetadata(key) {
    assertActive();
    assertSafeBrainIdPart2(key, "Metadata key");
    const item = await backend.get(STORES.metadata, key);
    return item ? item.value : null;
  }

  async function putMetadata(key, value) {
    assertActive();
    assertSafeBrainIdPart2(key, "Metadata key");
    return backend.put(STORES.metadata, {
      key,
      value: cloneSafeJsonPart2(value),
      updatedAt: Date.now()
    });
  }

  async function appendEvent(event) {
    assertActive();
    const safe = cloneSafeJsonPart2(event);
    if (!safe || typeof safe !== "object" || Array.isArray(safe)) {
      fail("Event साधारण JSON object होना चाहिए।", "INVALID_EVENT");
    }
    const id = safe.id || (
      "event-" + Date.now().toString(36) + "-" +
      (host.crypto && typeof host.crypto.randomUUID === "function"
        ? host.crypto.randomUUID()
        : Math.random().toString(36).slice(2, 12))
    );
    assertSafeBrainIdPart2(id, "Event ID");
    safe.id = id;
    safe.createdAt = Number.isFinite(safe.createdAt) ? safe.createdAt : Date.now();
    return backend.add(STORES.events, safe);
  }

  async function listEvents(options = {}) {
    assertActive();
    return backend.list(STORES.events, normalizeLimit(options.limit, 100));
  }

  async function getStorageStatus() {
    const storage = host && host.navigator && host.navigator.storage;
    const status = {
      estimateSupported: Boolean(storage && typeof storage.estimate === "function"),
      persistenceSupported: Boolean(storage && typeof storage.persist === "function" &&
        typeof storage.persisted === "function"),
      persistenceGranted: null,
      usage: null,
      quota: null,
      remaining: null,
      quotaPercent: null
    };

    if (storage && typeof storage.persisted === "function") {
      try {
        status.persistenceGranted = await storage.persisted();
      } catch (_) {
        status.persistenceGranted = null;
      }
    }

    if (storage && typeof storage.estimate === "function") {
      try {
        const estimate = await storage.estimate();
        status.usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
        status.quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
        if (status.usage !== null && status.quota !== null) {
          status.remaining = Math.max(0, status.quota - status.usage);
          status.quotaPercent = status.quota > 0
            ? Math.min(100, (status.usage / status.quota) * 100)
            : null;
        }
      } catch (_) {
        // Diagnostics must remain available even when the browser refuses an estimate.
      }
    }
    return status;
  }

  async function requestPersistentStorage(event) {
    assertActive();
    requireTrustedGesture(host, event);
    const storage = host && host.navigator && host.navigator.storage;
    if (!storage || typeof storage.persist !== "function" ||
        typeof storage.persisted !== "function") {
      return Object.freeze({ supported: false, granted: false, status: "unsupported" });
    }
    let granted = false;
    try {
      granted = await storage.persist();
    } catch (error) {
      throw normalizeStorageError(error, "PERSISTENCE_REQUEST_FAILED");
    }
    let confirmed = null;
    try {
      confirmed = await storage.persisted();
    } catch (_) {
      confirmed = null;
    }
    return Object.freeze({
      supported: true,
      granted: granted === true || confirmed === true,
      status: confirmed === true ? "granted" : (granted === true ? "requested" : "denied")
    });
  }

  async function diagnostics() {
    assertActive();
    const storageStatus = await getStorageStatus();
    const isIndexedDb = backend.kind === "indexeddb";
    return Object.freeze({
      version: BRAIN_STORAGE_VERSION_PART2,
      databaseVersion: isIndexedDb ? DB_VERSION : null,
      backend: backend.kind,
      persistent: backend.persistent,
      volatileFallback: !backend.persistent,
      durability: !isIndexedDb
        ? "volatile"
        : (storageStatus.persistenceGranted === true ? "browser-persistent" : "best-effort"),
      persistenceSupported: storageStatus.persistenceSupported,
      persistenceGranted: storageStatus.persistenceGranted,
      quotaEstimate: Object.freeze({
        usage: storageStatus.usage,
        quota: storageStatus.quota,
        remaining: storageStatus.remaining,
        usagePercent: storageStatus.quotaPercent
      }),
      quotaWarning: storageStatus.quotaPercent !== null && storageStatus.quotaPercent >= 90,
      initializationError: initializationError
        ? { code: initializationError.code, message: initializationError.message }
        : null,
      migration: Object.freeze({
        databaseVersion: isIndexedDb ? DB_VERSION : null,
        strategy: "non-destructive-additive",
        legacyV1RecordsPreserved: true
      }),
      stores: Object.freeze(Object.values(STORES))
    });
  }

  async function exportBackup() {
    assertActive();
    const records = await backend.list(STORES.records, MAX_LIST_LIMIT);
    const metadata = await backend.list(STORES.metadata, MAX_LIST_LIMIT);
    const events = await backend.list(STORES.events, MAX_LIST_LIMIT);
    if ([records, metadata, events].some(list => list.length >= MAX_LIST_LIMIT)) {
      fail("Backup के लिए डेटा निर्धारित सीमा से अधिक है; सीमित Export को पूर्ण Backup नहीं माना जाएगा।", "BACKUP_ITEM_LIMIT");
    }

    const payload = cloneSafeJsonPart2({
      schema: "swar-sadhika.brain-storage",
      schemaVersion: DB_VERSION,
      createdAt: Date.now(),
      stores: { records, metadata, events }
    });
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_BACKUP_CHARS) {
      fail("Backup का आकार सुरक्षित Export सीमा से बड़ा है।", "BACKUP_SIZE_LIMIT");
    }
    const cryptoRef = host.crypto || globalThis.crypto;
    const sha256 = await sha256HexPart2(serialized, cryptoRef);
    return Object.freeze({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      sha256,
      payload
    });
  }

  async function importBackup(backup) {
    assertActive();
    const safeBackup = cloneSafeJsonPart2(backup);
    if (!safeBackup || safeBackup.format !== BACKUP_FORMAT ||
        safeBackup.formatVersion !== BACKUP_FORMAT_VERSION ||
        typeof safeBackup.sha256 !== "string" ||
        !safeBackup.payload || typeof safeBackup.payload !== "object") {
      fail("Backup का format या version अमान्य है।", "INVALID_BACKUP_FORMAT");
    }

    const payload = cloneSafeJsonPart2(safeBackup.payload);
    if (payload.schema !== "swar-sadhika.brain-storage" ||
        payload.schemaVersion !== DB_VERSION ||
        !payload.stores || typeof payload.stores !== "object") {
      fail("Backup का schema version समर्थित नहीं है।", "INVALID_BACKUP_SCHEMA");
    }

    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_BACKUP_CHARS) {
      fail("Backup का आकार सुरक्षित Import सीमा से बड़ा है।", "BACKUP_SIZE_LIMIT");
    }
    const cryptoRef = host.crypto || globalThis.crypto;
    if (!await verifySha256Part2(serialized, safeBackup.sha256, cryptoRef)) {
      fail("Backup SHA-256 जाँच में विफल हुआ; कोई डेटा Import नहीं किया गया।", "BACKUP_INTEGRITY_FAILED");
    }

    const bundle = {};
    for (const storeName of Object.values(STORES)) {
      const items = payload.stores[storeName];
      if (!Array.isArray(items) || items.length > MAX_BACKUP_ITEMS_PER_STORE) {
        fail("Backup store अमान्य या निर्धारित सीमा से बड़ा है: " + storeName, "INVALID_BACKUP_STORE");
      }
      bundle[storeName] = items.map(item => normalizeRecord(item, storeName));
    }

    // Import is additive and atomic. Existing keys cause rejection; no record
    // is overwritten or deleted by an imported backup.
    return backend.importBundle(bundle);
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      await backend.close();
    })();
    return disposePromise;
  }

  return Object.freeze({
    version: BRAIN_STORAGE_VERSION_PART2,
    ready: true,
    getRecord,
    putRecord,
    deleteRecord,
    listRecords,
    getMetadata,
    putMetadata,
    appendEvent,
    listEvents,
    diagnostics,
    requestPersistentStorage,
    exportBackup,
    importBackup,
    restoreBackup: importBackup,
    dispose
  });
}

export function createOpfsAssetStorePart2(options = {}) {
  const navigatorRef = options.navigatorRef || globalThis.navigator;
  const maxFileBytes = Number.isFinite(options.maxFileBytes)
    ? options.maxFileBytes
    : DEFAULT_MAX_ASSET_BYTES;
  let rootPromise = null;

  function validateFileName(name) {
    if (typeof name !== "string" || !FILE_PATTERN.test(name) || name.includes("..")) {
      fail("OPFS file name अमान्य है।", "INVALID_ASSET_NAME");
    }
    return name;
  }

  async function root() {
    if (!navigatorRef || !navigatorRef.storage ||
        typeof navigatorRef.storage.getDirectory !== "function") {
      fail("इस ब्राउज़र में Origin Private File System उपलब्ध नहीं है।", "OPFS_UNAVAILABLE");
    }
    if (!rootPromise) {
      rootPromise = navigatorRef.storage.getDirectory()
        .then(directory => directory.getDirectoryHandle("swar-sadhika-brain-part2", { create: true }))
        .catch(error => {
          rootPromise = null;
          throw normalizeStorageError(error, "OPFS_UNAVAILABLE");
        });
    }
    return rootPromise;
  }

  return Object.freeze({
    supported: Boolean(navigatorRef && navigatorRef.storage &&
      typeof navigatorRef.storage.getDirectory === "function"),
    async write(name, blob) {
      validateFileName(name);
      if (!(blob instanceof Blob)) fail("OPFS asset के लिए Blob आवश्यक है।", "INVALID_ASSET_BLOB");
      if (blob.size > maxFileBytes) fail("Asset अनुमत आकार सीमा से बड़ा है।", "ASSET_TOO_LARGE");
      const directory = await root();
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        try { await writable.abort(); } catch (_) {}
        throw normalizeStorageError(error, "OPFS_WRITE_FAILED");
      }
      return Object.freeze({ name, size: blob.size, type: blob.type || "application/octet-stream" });
    },
    async read(name) {
      validateFileName(name);
      const directory = await root();
      const handle = await directory.getFileHandle(name);
      return handle.getFile();
    },
    async remove(name) {
      validateFileName(name);
      const directory = await root();
      await directory.removeEntry(name);
      return true;
    },
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
  const host = options.host || windowRef || globalThis;
  const event = options.event;
  requireTrustedGesture(host, event);
  if (!windowRef || typeof windowRef.showDirectoryPicker !== "function") {
    fail("इस Android/ब्राउज़र संयोजन में Directory Picker उपलब्ध नहीं है।", "DIRECTORY_PICKER_UNAVAILABLE");
  }
  return windowRef.showDirectoryPicker({ mode: "readwrite" }).then(handle =>
    Object.freeze({
      handle,
      kind: "user-selected-directory",
      persistentHandleStorage: false,
      note: "चयनित Directory Handle को इस मॉड्यूल द्वारा स्थायी रूप से सहेजा नहीं जाता।"
    })
  ).catch(error => {
    if (error && error.name === "AbortError") {
      throw new BrainStorageErrorPart2("उपयोगकर्ता ने Directory चयन रद्द किया।", "DIRECTORY_PICKER_CANCELLED");
    }
    throw normalizeStorageError(error, "DIRECTORY_PICKER_FAILED");
  });
}

export async function selfTest() {
  const checks = [];
  const skipped = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });

  try {
    check("opfs-feature-detection-safe",
      createOpfsAssetStorePart2({ navigatorRef: {} }).supported === false);

    let gestureBlocked = false;
    try {
      requestUserDirectoryPart2({
        event: { type: "click", isTrusted: true },
        EventConstructor: function Event() {},
        windowRef: {}
      });
    } catch (error) {
      gestureBlocked = error.code === "USER_GESTURE_REQUIRED";
    }
    check("forged-directory-picker-gesture-rejected", gestureBlocked);

    let unsafeFileNameBlocked = false;
    const opfs = createOpfsAssetStorePart2({ navigatorRef: {} });
    try { await opfs.read("../secrets"); }
    catch (error) { unsafeFileNameBlocked = error.code === "INVALID_ASSET_NAME"; }
    check("opfs-path-traversal-rejected", unsafeFileNameBlocked);

    const memory = await createBrainStoragePart2({
      host: {},
      dbName: "swar-brain-storage-selftest",
      allowVolatileFallback: true
    });
    const status = await memory.diagnostics();
    check("memory-fallback-explicitly-marked-volatile",
      status.backend === "memory" && status.persistent === false &&
      status.volatileFallback === true && status.durability === "volatile");

    await memory.putRecord({ id: "storage-test-record", kind: "test", value: 7 });
    const record = await memory.getRecord("storage-test-record");
    check("memory-record-roundtrip", Boolean(record && record.value === 7));

    await memory.putMetadata("storage-test-meta", { source: "self-test" });
    const metadata = await memory.getMetadata("storage-test-meta");
    check("metadata-roundtrip", Boolean(metadata && metadata.source === "self-test"));

    await memory.appendEvent({ id: "storage-test-event", type: "test-event", detail: { ok: true } });
    check("event-roundtrip", (await memory.listEvents()).some(item => item.id === "storage-test-event"));

    let duplicateEventRejected = false;
    try { await memory.appendEvent({ id: "storage-test-event", type: "overwrite-attempt" }); }
    catch (error) { duplicateEventRejected = error.code === "STORAGE_KEY_CONFLICT"; }
    const eventStillOriginal = (await memory.listEvents()).find(item => item.id === "storage-test-event");
    check("duplicate-event-cannot-overwrite-history",
      duplicateEventRejected && eventStillOriginal && eventStillOriginal.type === "test-event");

    let invalidLimitRejected = false;
    try { await memory.listRecords({ limit: MAX_LIST_LIMIT + 1 }); }
    catch (error) { invalidLimitRejected = error.code === "INVALID_LIST_LIMIT"; }
    check("unbounded-list-request-rejected", invalidLimitRejected);

    const backup = await memory.exportBackup();
    const restored = await createBrainStoragePart2({
      host: {},
      dbName: "swar-brain-storage-restore-selftest",
      allowVolatileFallback: true
    });
    const imported = await restored.importBackup(backup);
    const restoredRecord = await restored.getRecord("storage-test-record");
    check("checksummed-backup-import-roundtrip",
      imported.records === 1 && restoredRecord && restoredRecord.value === 7);

    let tamperRejected = false;
    const tampered = {
      ...backup,
      payload: {
        ...backup.payload,
        createdAt: backup.payload.createdAt + 1
      }
    };
    try { await restored.importBackup(tampered); }
    catch (error) { tamperRejected = error.code === "BACKUP_INTEGRITY_FAILED"; }
    check("tampered-backup-rejected", tamperRejected);

    let conflictRejected = false;
    try { await restored.importBackup(backup); }
    catch (error) { conflictRejected = error.code === "BACKUP_KEY_CONFLICT"; }
    check("backup-conflict-does-not-overwrite-existing-records", conflictRejected);

    await memory.dispose();
    await restored.dispose();

    if (globalThis.indexedDB && typeof globalThis.indexedDB.open === "function") {
      const dbName = "swar-brain-idb-selftest-" + Date.now().toString(36);
      const native = await createBrainStoragePart2({
        host: globalThis,
        dbName,
        allowVolatileFallback: false
      });
      const nativeStatus = await native.diagnostics();
      check("native-indexeddb-selected", nativeStatus.backend === "indexeddb" && nativeStatus.persistent === true);
      await native.putRecord({ id: "native-roundtrip", value: "browser-storage" });
      const nativeRecord = await native.getRecord("native-roundtrip");
      check("native-indexeddb-write-read", Boolean(nativeRecord && nativeRecord.value === "browser-storage"));
      await native.dispose();

      const reopened = await createBrainStoragePart2({
        host: globalThis,
        dbName,
        allowVolatileFallback: false
      });
      const reopenedRecord = await reopened.getRecord("native-roundtrip");
      check("native-indexeddb-reopen-persistence",
        Boolean(reopenedRecord && reopenedRecord.value === "browser-storage"));
      await reopened.dispose();
      await deleteDatabase(globalThis.indexedDB, dbName);
    } else {
      skipped.push("native-indexeddb-browser-tests-require-a-browser-with-indexeddb");
    }
  } catch (error) {
    checks.push({
      id: "storage-self-test-unexpected-error",
      passed: false,
      message: error && error.message ? error.message : String(error)
    });
  }

  return Object.freeze({
    module: "brain-storage-part2",
    version: BRAIN_STORAGE_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    skipped: Object.freeze(skipped),
    checks: Object.freeze(checks.map(item => Object.freeze({ ...item })))
  });
}

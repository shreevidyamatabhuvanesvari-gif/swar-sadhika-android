const DB_NAME = "swar-sadhika-android-v4";
const DB_VERSION = 1;
let openPromise;

function openDatabase() {
  if (openPromise) return openPromise;
  openPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("इस Browser में IndexedDB उपलब्ध नहीं है।"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("स्थानीय Database नहीं खुल सका।"));
    request.onblocked = () => reject(new Error("Database Upgrade रुका हुआ है; खुले हुए App Tabs बंद करके पुनः प्रयास करें।"));
  }).catch(error => {
    openPromise = undefined;
    throw error;
  });
  return openPromise;
}

export function createId(prefix = "record") {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${token}`;
}

export async function putRecord(record) {
  const db = await openDatabase();
  const value = { ...record, id: record.id || createId(record.type || "record"), updatedAt: new Date().toISOString() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Record सुरक्षित नहीं हुआ।"));
    tx.onabort = () => reject(tx.error || new Error("Record transaction रद्द हुआ।"));
  });
  return value;
}

export async function getRecords(type) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const request = type ? tx.objectStore("records").index("type").getAll(type) : tx.objectStore("records").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Records पढ़े नहीं जा सके।"));
  });
}

export async function deleteRecord(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Record हटाया नहीं जा सका।"));
  });
}

export async function putAsset(id, blob, name, kind) {
  const db = await openDatabase();
  const value = { id, blob, name: String(name || "local-asset"), kind, updatedAt: new Date().toISOString() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Asset सुरक्षित नहीं हुआ।"));
  });
  return value;
}

export async function getAsset(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("assets", "readonly").objectStore("assets").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Asset पढ़ा नहीं जा सका।"));
  });
}

export async function exportRecords() {
  const records = await getRecords();
  return { schemaVersion: 1, application: "swar-sadhika-android", exportedAt: new Date().toISOString(), records };
}

export async function importRecords(payload) {
  if (!payload || payload.schemaVersion !== 1 || payload.application !== "swar-sadhika-android" || !Array.isArray(payload.records)) {
    throw new Error("यह समर्थित Swar-Sadhika JSON Backup नहीं है।");
  }
  for (const item of payload.records) {
    if (!item || typeof item !== "object" || typeof item.type !== "string" || typeof item.id !== "string") {
      throw new Error("Backup में अमान्य Record मिला; कोई Record आयात नहीं किया गया।");
    }
  }
  for (const item of payload.records) await putRecord(item);
  return payload.records.length;
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

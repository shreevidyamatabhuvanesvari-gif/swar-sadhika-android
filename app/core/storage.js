const DB_NAME = "swar-sadhika-local";
const DB_VERSION = 4;
const STORES = Object.freeze(["texts", "mediaNotes", "learningNotes"]);
const SETTINGS_STORE = "settings";
const AVATAR_STORE = "avatarPhotos";
const ALL_STORES = [...STORES, SETTINGS_STORE, AVATAR_STORE];
let dbPromise;

export function normalizeStoredText(value = "") {
  return String(value).replace(/\r\n?/g, "\n").normalize("NFC");
}

function assertRecordStore(store) {
  if (!STORES.includes(store)) {
    throw new Error("अमान्य Library Store: " + String(store));
  }
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      dbPromise = null;
      reject(new Error("इस ब्राउज़र में IndexedDB उपलब्ध नहीं है।"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id", autoIncrement: true });
        }
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("स्थानीय Library नहीं खुल सकी।"));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("दूसरे खुले टैब के कारण Library अपडेट रुका है। सभी पुराने App टैब बंद करके पुनः प्रयास करें।"));
    };
  });
  return dbPromise;
}

function requestToPromise(request, fallbackMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(fallbackMessage));
  });
}

export async function putRecord(store, value) {
  assertRecordStore(store);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("सहेजने के लिए मान्य रिकॉर्ड आवश्यक है।");
  }
  const db = await openDB();
  const clean = { ...value, updatedAt: new Date().toISOString() };
  if (store === "texts") {
    clean.content = normalizeStoredText(clean.content || "");
    clean.title = clean.content.trim().split(/\s+/u).slice(0, 7).join(" ") || "बिना शीर्षक";
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).put(clean);
    let key;
    request.onsuccess = () => { key = request.result; };
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error || new Error("रिकॉर्ड सुरक्षित नहीं हो सका।"));
    tx.onabort = () => reject(tx.error || new Error("रिकॉर्ड सहेजना रद्द हुआ।"));
  });
}

export async function getRecords(store) {
  assertRecordStore(store);
  const db = await openDB();
  const records = await requestToPromise(
    db.transaction(store, "readonly").objectStore(store).getAll(),
    "Library रिकॉर्ड पढ़े नहीं जा सके।"
  );
  const normalized = (records || []).map(record => {
    if (store !== "texts") return record;
    const content = normalizeStoredText(record.content || "");
    return {
      ...record,
      content,
      title: content.trim().split(/\s+/u).slice(0, 7).join(" ") || "बिना शीर्षक"
    };
  });
  return normalized.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function deleteRecord(store, id) {
  assertRecordStore(store);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(Number(id));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("Library रिकॉर्ड हटाया नहीं जा सका।"));
    tx.onabort = () => reject(tx.error || new Error("रिकॉर्ड हटाना रद्द हुआ।"));
  });
}

export async function getSettings() {
  const db = await openDB();
  const record = await requestToPromise(
    db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get("preferences"),
    "App Settings पढ़ी नहीं जा सकीं।"
  );
  return record && record.value && typeof record.value === "object" ? record.value : {};
}

export async function saveSettings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Settings का मान्य Object आवश्यक है।");
  }
  const db = await openDB();
  const clean = {
    key: "preferences",
    value: { ...value },
    updatedAt: new Date().toISOString()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put(clean);
    tx.oncomplete = () => resolve(clean.value);
    tx.onerror = () => reject(tx.error || new Error("Settings सुरक्षित नहीं हो सकीं।"));
    tx.onabort = () => reject(tx.error || new Error("Settings सहेजना रद्द हुआ।"));
  });
}

export async function exportLibrary() {
  const stores = {};
  for (const store of STORES) stores[store] = await getRecords(store);
  return {
    format: "swar-sadhika-library",
    version: 2,
    exportedAt: new Date().toISOString(),
    stores,
    settings: await getSettings()
  };
}

function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.format !== "swar-sadhika-library" || ![1, 2].includes(data.version) ||
      !data.stores || typeof data.stores !== "object" || Array.isArray(data.stores)) {
    throw new Error("यह समर्थित Swar-Sadhika Library Backup फ़ाइल नहीं है।");
  }
  const prepared = {};
  for (const store of STORES) {
    const records = data.stores[store] === undefined ? [] : data.stores[store];
    if (!Array.isArray(records)) throw new Error("Backup में " + store + " सूची अमान्य है।");
    prepared[store] = records.map((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(store + " में रिकॉर्ड " + (index + 1) + " अमान्य है।");
      }
      const clean = { ...record };
      delete clean.id;
      delete clean.updatedAt;
      if (store === "texts") {
        if (typeof clean.content !== "string" || !clean.content.trim()) {
          throw new Error("Backup में खाली या अमान्य Text रिकॉर्ड मिला।");
        }
        clean.content = normalizeStoredText(clean.content);
        clean.title = clean.content.trim().split(/\s+/u).slice(0, 7).join(" ");
      } else {
        if (typeof clean.notes !== "string" || !clean.notes.trim()) {
          throw new Error("Backup में खाली या अमान्य Notes रिकॉर्ड मिला।");
        }
        clean.title = typeof clean.title === "string" ? clean.title.slice(0, 160) : "अध्ययन नोट";
        if (store === "mediaNotes" && clean.mimeType !== undefined &&
            typeof clean.mimeType !== "string") {
          throw new Error("Backup में Media MIME Type अमान्य है।");
        }
      }
      return clean;
    });
  }
  let settings = {};
  if (data.version >= 2 && data.settings !== undefined) {
    if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
      throw new Error("Backup की Settings अमान्य हैं।");
    }
    settings = { ...data.settings };
  }
  return { stores: prepared, settings };
}

function recordSignature(store, record) {
  if (store === "texts") return normalizeStoredText(record.content || "");
  return [
    String(record.title || ""),
    String(record.notes || ""),
    String(record.mimeType || "")
  ].join("\u0000");
}

export async function importLibrary(data) {
  const prepared = validateImport(data);
  const db = await openDB();
  const storeNames = [...STORES, SETTINGS_STORE];
  const stats = { imported: 0, duplicates: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    const snapshots = {};
    let settingsRecord = null;
    let pending = storeNames.length;
    let writeStarted = false;

    const fail = error => {
      try { tx.abort(); } catch {}
      reject(error);
    };

    const beginWrite = () => {
      if (pending !== 0 || writeStarted) return;
      writeStarted = true;
      try {
        for (const store of STORES) {
          const target = tx.objectStore(store);
          const known = new Set((snapshots[store] || []).map(record => recordSignature(store, record)));
          for (const record of prepared.stores[store]) {
            const signature = recordSignature(store, record);
            if (known.has(signature)) {
              stats.duplicates += 1;
              continue;
            }
            target.add({ ...record, updatedAt: new Date().toISOString() });
            known.add(signature);
            stats.imported += 1;
          }
        }
        if (Object.keys(prepared.settings).length) {
          const current = settingsRecord && settingsRecord.value &&
            typeof settingsRecord.value === "object" ? settingsRecord.value : {};
          tx.objectStore(SETTINGS_STORE).put({
            key: "preferences",
            value: { ...current, ...prepared.settings },
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        fail(error);
      }
    };

    for (const store of STORES) {
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => {
        snapshots[store] = request.result || [];
        pending -= 1;
        beginWrite();
      };
      request.onerror = () => fail(request.error || new Error("Backup Import की जाँच विफल हुई।"));
    }
    const settingsRequest = tx.objectStore(SETTINGS_STORE).get("preferences");
    settingsRequest.onsuccess = () => {
      settingsRecord = settingsRequest.result || null;
      pending -= 1;
      beginWrite();
    };
    settingsRequest.onerror = () => fail(settingsRequest.error || new Error("Backup Settings पढ़ी नहीं जा सकीं।"));

    tx.oncomplete = () => resolve(stats);
    tx.onerror = () => reject(tx.error || new Error("Backup Import विफल हुआ।"));
    tx.onabort = () => reject(tx.error || new Error("Backup Import रद्द हुआ; कोई अधूरा Import स्वीकार नहीं किया गया।"));
  });
}

export async function saveAvatarPhoto(blob, name = "avatar-photo") {
  if (typeof Blob === "undefined" || !(blob instanceof Blob) ||
      !String(blob.type || "").startsWith("image/")) {
    throw new Error("कृपया मान्य Image फ़ाइल चुनें।");
  }
  if (blob.size > 12 * 1024 * 1024) {
    throw new Error("फोटो का आकार 12 MB से कम रखें।");
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).put({
      id: "primary",
      blob,
      name: String(name || "avatar-photo").slice(0, 160),
      type: blob.type,
      updatedAt: new Date().toISOString()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("फोटो सुरक्षित नहीं हो सकी।"));
    tx.onabort = () => reject(tx.error || new Error("फोटो सहेजना रद्द हुआ।"));
  });
}

export async function getAvatarPhoto() {
  const db = await openDB();
  return requestToPromise(
    db.transaction(AVATAR_STORE, "readonly").objectStore(AVATAR_STORE).get("primary"),
    "Avatar Photo पढ़ी नहीं जा सकी।"
  );
}

export async function deleteAvatarPhoto() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).delete("primary");
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("फोटो हटाई नहीं जा सकी।"));
    tx.onabort = () => reject(tx.error || new Error("फोटो हटाना रद्द हुआ।"));
  });
}

export const STORAGE_INFO = Object.freeze({
  databaseName: DB_NAME,
  databaseVersion: DB_VERSION,
  stores: ALL_STORES
});

const DB_NAME='swar-sadhika-local';
const DB_VERSION=2;
const STORES=['texts','mediaNotes','learningNotes'];

let dbPromise;

export function normalizeStoredText(value=''){
  return String(value)
    .replace(/\\r\\n/g,'\n')
    .replace(/\\n/g,'\n')
    .replace(/\\t/g,'\t')
    .replace(/\r\n?/g,'\n')
    .normalize('NFC');
}

function migrateLegacyTextStore(store){
  const request=store.openCursor();
  request.onsuccess=()=>{
    const cursor=request.result;
    if(!cursor)return;
    const record=cursor.value;
    if(record&&typeof record==='object'){
      const clean=normalizeStoredText(record.content||'');
      if(clean!==(record.content||'')){
        record.content=clean;
        record.title=clean.trim().split(/\s+/u).slice(0,7).join(' ');
        cursor.update(record);
      }else if(typeof record.title==='string'){
        const title=normalizeStoredText(record.title).replace(/\s+/gu,' ').trim();
        if(title!==record.title){record.title=title;cursor.update(record);}
      }
    }
    cursor.continue();
  };
}

function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB'in window)){
      reject(new Error('इस ब्राउज़र में IndexedDB उपलब्ध नहीं है।'));
      return;
    }
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=event=>{
      const db=request.result;
      const tx=request.transaction;
      for(const store of STORES){
        if(!db.objectStoreNames.contains(store)){
          db.createObjectStore(store,{keyPath:'id',autoIncrement:true});
        }
      }
      if(event.oldVersion<2&&db.objectStoreNames.contains('texts')){
        migrateLegacyTextStore(tx.objectStore('texts'));
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('स्थानीय Library नहीं खुल सकी।'));
    request.onblocked=()=>reject(new Error('दूसरे खुले टैब के कारण Library अपडेट रुका है। बाकी Swar-Sadhika टैब बंद करके फिर खोलें।'));
  });
  return dbPromise;
}

export async function putRecord(store,value){
  const db=await openDB();
  const clean={...value,updatedAt:new Date().toISOString()};
  if(store==='texts'){
    clean.content=normalizeStoredText(clean.content||'');
    clean.title=clean.content.trim().split(/\s+/u).slice(0,7).join(' ');
  }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');
    const req=tx.objectStore(store).put(clean);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    tx.onerror=()=>reject(tx.error);
  });
}

export async function getRecords(store){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess=()=>{
      const records=req.result||[];
      if(store==='texts'){
        for(const record of records){
          record.content=normalizeStoredText(record.content||'');
          record.title=record.content.trim().split(/\s+/u).slice(0,7).join(' ');
        }
      }
      resolve(records.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));
    };
    req.onerror=()=>reject(req.error);
  });
}

export async function deleteRecord(store,id){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,'readwrite').objectStore(store).delete(Number(id));
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error);
  });
}

export async function exportLibrary(){
  const result={format:'swar-sadhika-library',version:1,exportedAt:new Date().toISOString(),stores:{}};
  for(const store of STORES)result.stores[store]=await getRecords(store);
  return result;
}

export async function importLibrary(data){
  if(!data||data.format!=='swar-sadhika-library'||!data.stores||typeof data.stores!=='object'){
    throw new Error('यह Swar-Sadhika Library Backup फ़ाइल नहीं है।');
  }
  for(const store of STORES){
    const records=data.stores[store];
    if(!Array.isArray(records))continue;
    for(const record of records){
      if(!record||typeof record!=='object')continue;
      const copy={...record};
      delete copy.id;
      if(store==='texts'){
        copy.content=normalizeStoredText(copy.content||'');
        copy.title=copy.content.trim().split(/\s+/u).slice(0,7).join(' ');
      }
      await putRecord(store,copy);
    }
  }
  return true;
}

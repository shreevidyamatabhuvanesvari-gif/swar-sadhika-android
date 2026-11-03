import{getRecords,deleteRecord,exportLibrary,importLibrary}from'../core/storage.js';
const MAP=[['texts','savedTextsList','content'],['mediaNotes','savedMediaList','notes'],['learningNotes','savedLearningList','notes']];
export async function renderLibrary({toast}){
 for(const[store,id,field]of MAP){
  const host=document.getElementById(id);if(!host)continue;host.replaceChildren();
  try{
   const records=await getRecords(store);
   if(!records.length){const p=document.createElement('p');p.className='muted-text';p.textContent='अभी कोई सामग्री सुरक्षित नहीं है।';host.append(p);continue}
   for(const record of records){
    const row=document.createElement('div');row.className='saved-item';
    const body=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('small');
    title.textContent=record.title||'बिना शीर्षक';desc.textContent=(record[field]||'').slice(0,220);body.append(title,desc);
    const remove=document.createElement('button');remove.type='button';remove.textContent='हटाएँ';
    remove.addEventListener('click',async()=>{await deleteRecord(store,record.id);toast('Library रिकॉर्ड हटाया गया।');renderLibrary({toast})});
    row.append(body,remove);host.append(row);
   }
  }catch(error){const p=document.createElement('p');p.className='muted-text';p.textContent=error.message;host.append(p)}
 }
 const exportButton=document.getElementById('exportLibraryButton'),importInput=document.getElementById('importLibraryInput'),backupStatus=document.getElementById('backupStatus');
 if(exportButton&&!exportButton.dataset.bound){exportButton.dataset.bound='1';exportButton.addEventListener('click',async()=>{try{const data=await exportLibrary();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='swar-sadhika-library-backup.json';a.click();URL.revokeObjectURL(url);if(backupStatus)backupStatus.textContent='Backup फ़ाइल डाउनलोड की गई।';}catch(error){if(backupStatus)backupStatus.textContent=error.message}})}
 if(importInput&&!importInput.dataset.bound){importInput.dataset.bound='1';importInput.addEventListener('change',async()=>{const file=importInput.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());await importLibrary(data);if(backupStatus)backupStatus.textContent='Backup आयात हो गया।';toast('Library Backup आयात हुआ।');await renderLibrary({toast})}catch(error){if(backupStatus)backupStatus.textContent='Backup आयात विफल: '+error.message}finally{importInput.value=''}})}
}
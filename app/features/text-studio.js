import{putRecord}from'../core/storage.js';
export function initTextStudio({toast}){
 const input=document.getElementById('sourceText'),count=document.getElementById('textCount'),save=document.getElementById('saveTextButton'),clear=document.getElementById('clearTextButton'),status=document.getElementById('saveStatus');
 if(!input)return;
 const update=()=>{const value=input.value.trim();count.textContent=input.value.length+' अक्षर · '+(value?value.split(/\s+/u).length:0)+' शब्द'};
 input.addEventListener('input',update);update();
 save.addEventListener('click',async()=>{const value=input.value.trim();if(!value){toast('पहले पाठ लिखें।');return}try{await putRecord('texts',{title:value.split(/\s+/u).slice(0,7).join(' '),content:value});status.textContent='पाठ स्थानीय Library में सुरक्षित है।';toast('पाठ सुरक्षित हुआ।')}catch(error){toast(error.message)}});
 clear.addEventListener('click',()=>{input.value='';update();status.textContent='पाठ साफ किया गया।'});
 return{getText:()=>input.value};
}
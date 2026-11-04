(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={media:[],active:null,seq:0,avatar:null,voices:[],speech:{token:0,lines:[],index:0,active:false,paused:false},registry:{loaded:false,error:"",active:[],placeholders:[],invalid:[]},loaded:new Map(),moduleToken:0};
const routes={index:"view-index","nano-server":"view-nano-server",avatar:"view-avatar","nano-brain":"view-nano-brain",diagnostics:"view-diagnostics"};
const say=(id,value)=>{const node=$(id);if(node)node.textContent=String(value);};
const hide=(id,value)=>{const node=$(id);if(node)node.classList.toggle("hidden",Boolean(value));};
function markNav(route){document.querySelectorAll(".nav [data-route]").forEach(button=>{if(button.dataset.route===route)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});}
function navigate(route){
 if(route.startsWith("module:")){markNav(route);loadModule(route.slice(7));return;}
 const target=routes[route];if(!target)return;
 document.querySelectorAll("main > .view").forEach(view=>{view.hidden=view.id!==target;});
 markNav(route);if(route==="diagnostics")runDiagnostics();
}
function jumpToText(){navigate("index");window.setTimeout(()=>{const node=$("text-section");if(node){node.scrollIntoView({behavior:"smooth",block:"start"});if($("text-input"))$("text-input").focus({preventScroll:true});}},80);}
function revoke(item){if(item&&item.url){URL.revokeObjectURL(item.url);item.url="";}}
function clearStage(){
 const img=$("stage-image"),video=$("stage-video");
 if(video){video.pause();video.removeAttribute("src");video.load();}
 if(img)img.removeAttribute("src");
 hide("stage-image",true);hide("stage-video",true);hide("stage-empty",false);
 if($("remove-media"))$("remove-media").disabled=true;
 say("media-status","अभी कोई मीडिया चयनित नहीं है।");
}
function selectMedia(id){
 const item=state.media.find(entry=>entry.id===id);if(!item)return;state.active=id;
 const img=$("stage-image"),video=$("stage-video");
 if(item.kind==="video"){
  if(img)img.removeAttribute("src");hide("stage-image",true);
  if(video){video.pause();video.src=item.url;video.load();}hide("stage-video",false);
 }else{
  if(video){video.pause();video.removeAttribute("src");video.load();}hide("stage-video",true);
  if(img)img.src=item.url;hide("stage-image",false);
 }
 hide("stage-empty",true);if($("remove-media"))$("remove-media").disabled=false;
 say("media-status",item.file.name+(item.kind==="video"?" · वीडियो चयनित":" · फोटो चयनित"));
 document.querySelectorAll(".gallery-item").forEach(button=>button.setAttribute("aria-pressed",button.dataset.mediaId===id?"true":"false"));
}
function addGalleryItem(item){
 const gallery=$("gallery");if(!gallery)return;
 const button=document.createElement("button");button.type="button";button.className="btn gallery-item";button.dataset.mediaId=item.id;
 button.setAttribute("aria-pressed","false");button.setAttribute("aria-label","पूर्वावलोकन चुनें: "+item.file.name);button.title=item.file.name;
 if(item.kind==="image"){const image=document.createElement("img");image.src=item.url;image.alt="";image.width=42;image.height=56;image.loading="lazy";button.appendChild(image);}
 else{const mark=document.createElement("span");mark.textContent="▶ VIDEO";button.appendChild(mark);}
 const name=document.createElement("span");name.textContent=item.file.name.length>18?item.file.name.slice(0,15)+"…":item.file.name;button.appendChild(name);gallery.appendChild(button);
}
function addMedia(files){
 const added=[];Array.from(files||[]).forEach(file=>{
  const image=file.type.startsWith("image/"),video=file.type.startsWith("video/");if(!image&&!video)return;
  try{const item={id:"media-"+(++state.seq),file,url:URL.createObjectURL(file),kind:video?"video":"image"};state.media.push(item);added.push(item);addGalleryItem(item);}
  catch(error){console.error("Local media preview failed",error);}
 });
 if(added.length)selectMedia(added[0].id);else say("media-status","कोई मान्य फोटो या वीडियो फाइल नहीं मिली।");
 if($("media-input"))$("media-input").value="";
}
function removeMedia(){
 const index=state.media.findIndex(item=>item.id===state.active);if(index<0)return;
 const [item]=state.media.splice(index,1);revoke(item);
 const card=document.querySelector('.gallery-item[data-media-id="'+item.id+'"]');if(card)card.remove();
 state.active=null;if(state.media.length)selectMedia(state.media[Math.min(index,state.media.length-1)].id);else clearStage();
}
async function fullscreen(){
 const stage=$("media-stage");if(!stage)return;
 try{
  if(document.fullscreenElement===stage)await document.exitFullscreen();
  else if(stage.requestFullscreen)await stage.requestFullscreen();
  else if(stage.webkitRequestFullscreen)stage.webkitRequestFullscreen();
  else if($("stage-video")&&!$("stage-video").classList.contains("hidden")&&$("stage-video").webkitEnterFullscreen)$("stage-video").webkitEnterFullscreen();
  else say("media-status","इस ब्राउज़र में Fullscreen सुविधा उपलब्ध नहीं है।");
 }catch(error){say("media-status","Fullscreen शुरू नहीं हो सका: "+(error.message||"ब्राउज़र अनुमति उपलब्ध नहीं है।"));}
}
function speechAvailable(){return Boolean(window.speechSynthesis&&window.SpeechSynthesisUtterance);}
function voiceScore(voice){
 const lang=String(voice.lang||"").toLowerCase(),name=String(voice.name||"").toLowerCase();let score=0;
 if(lang==="hi-in")score+=100;else if(lang.startsWith("hi"))score+=85;else if(lang.startsWith("sa"))score+=65;else if(lang.startsWith("en-in"))score+=18;
 if(["female","woman","zira","heera","lekha","priya","sangeeta","kavya","neerja","raveena","aarti","swara"].some(word=>name.includes(word)))score+=24;
 if(["male","david","mark","george"].some(word=>name.includes(word)))score-=8;if(voice.default)score+=2;return score;
}
function loadVoices(){
 if(!speechAvailable()){say("tts-status","इस ब्राउज़र में Speech Synthesis उपलब्ध नहीं है। Android Chrome और installed TTS voices की जाँच करें।");return;}
 const select=$("voice-select");if(!select)return;const previous=select.value;
 state.voices=window.speechSynthesis.getVoices().slice().sort((a,b)=>voiceScore(b)-voiceScore(a));select.replaceChildren();
 if(!state.voices.length){const option=document.createElement("option");option.value="";option.textContent="ब्राउज़र से आवाज़ें लोड हो रही हैं…";select.appendChild(option);return;}
 state.voices.forEach((voice,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=voice.name+" ("+voice.lang+")";select.appendChild(option);});
 const old=state.voices.findIndex(voice=>voice.voiceURI===previous),hindi=state.voices.findIndex(voice=>String(voice.lang||"").toLowerCase().startsWith("hi"));
 select.value=String(old>=0?old:hindi>=0?hindi:0);
 say("tts-status",hindi>=0?"आवाज़ें उपलब्ध हैं। हिंदी आवाज़ चुनी गई है; वास्तविक स्वर Android की installed voice पर निर्भर करेगा।":"आवाज़ें उपलब्ध हैं। हिंदी voice न मिलने पर पहली उपलब्ध आवाज़ चुनी गई है।");
}
function selectedVoice(){const select=$("voice-select");return select&&select.value!==""?state.voices[Number(select.value)]||null:null;}
function updateSpeechButtons(){
 const s=state.speech;if($("speak-btn"))$("speak-btn").disabled=s.active;
 if($("pause-btn"))$("pause-btn").disabled=!s.active||s.paused;
 if($("resume-btn"))$("resume-btn").disabled=!s.active||!s.paused;
 if($("stop-btn"))$("stop-btn").disabled=!s.active;
}
function showLine(line){if($("rainbow-line"))$("rainbow-line").textContent=line;hide("line-overlay",false);}
function finishSpeech(message){
 state.speech.active=false;state.speech.paused=false;state.speech.lines=[];state.speech.index=0;
 hide("line-overlay",true);say("tts-status",message||"पाठ पूरा हो गया।");updateSpeechButtons();
}
function speakLine(token){
 const s=state.speech;if(token!==s.token||!s.active)return;
 if(s.index>=s.lines.length){finishSpeech("सभी पंक्तियों का पाठ पूरा हो गया।");return;}
 const line=s.lines[s.index],utterance=new SpeechSynthesisUtterance(line),voice=selectedVoice();
 if(voice){utterance.voice=voice;utterance.lang=voice.lang||"hi-IN";}
 else{const devanagari=Array.from(line).some(ch=>{const n=ch.codePointAt(0);return n>=0x0900&&n<=0x097f;});utterance.lang=devanagari?"hi-IN":"en-IN";}
 const rate=$("speech-rate")?Number($("speech-rate").value):0.88;utterance.rate=Number.isFinite(rate)?rate:0.88;utterance.pitch=1;
 showLine(line);say("tts-status","पंक्ति "+(s.index+1)+" / "+s.lines.length+" पढ़ी जा रही है।");
 utterance.onend=()=>{if(token!==s.token||!s.active)return;s.index++;window.setTimeout(()=>speakLine(token),90);};
 utterance.onerror=event=>{if(token!==s.token||!s.active)return;if(event&&(event.error==="interrupted"||event.error==="canceled"))return;finishSpeech("TTS में त्रुटि आई: "+(event&&event.error?event.error:"आवाज़ इस पंक्ति को पढ़ नहीं सकी।"));};
 try{window.speechSynthesis.speak(utterance);}catch(error){finishSpeech("TTS शुरू नहीं हो सका: "+(error.message||"अज्ञात त्रुटि।"));}
}
function startSpeech(){
 if(!speechAvailable()){say("tts-status","Speech Synthesis उपलब्ध नहीं है। समर्थित Android Chrome और system TTS voice आवश्यक है।");return;}
 const input=$("text-input"),lines=input?input.value.split(String.fromCharCode(10)).map(line=>line.trim()).filter(Boolean):[];
 if(!lines.length){say("tts-status","पहले पाठ लिखें। प्रत्येक अलग पंक्ति क्रम से पढ़ी जाएगी।");if(input)input.focus();return;}
 window.speechSynthesis.cancel();state.speech.token++;state.speech.lines=lines;state.speech.index=0;state.speech.active=true;state.speech.paused=false;updateSpeechButtons();speakLine(state.speech.token);
}
function pauseSpeech(){const s=state.speech;if(!s.active||s.paused||!speechAvailable())return;window.speechSynthesis.pause();s.paused=true;say("tts-status","पाठ रोक दिया गया है। फिर शुरू करें बटन से जारी रखें।");updateSpeechButtons();}
function resumeSpeech(){const s=state.speech;if(!s.active||!s.paused||!speechAvailable())return;window.speechSynthesis.resume();s.paused=false;say("tts-status","पाठ फिर से जारी है।");updateSpeechButtons();}
function stopSpeech(){state.speech.token++;if(speechAvailable())window.speechSynthesis.cancel();finishSpeech("पाठ समाप्त कर दिया गया।");}
function setAvatar(file){
 if(!file||!file.type.startsWith("image/")){say("avatar-status","कृपया मान्य फोटो फाइल चुनें।");return;}
 let url;try{url=URL.createObjectURL(file);}catch(error){say("avatar-status","फोटो का स्थानीय पूर्वावलोकन तैयार नहीं हो सका।");return;}
 if(state.avatar)URL.revokeObjectURL(state.avatar);state.avatar=url;
 if($("avatar-preview"))$("avatar-preview").src=url;hide("avatar-preview",false);
 if($("apply-avatar"))$("apply-avatar").disabled=false;if($("clear-avatar"))$("clear-avatar").disabled=false;
 say("avatar-status",file.name+" चयनित है। अब इसे मीडिया इंडेक्स पर लगा सकती हैं।");
}
function applyAvatar(){if(!state.avatar)return;if($("avatar-overlay"))$("avatar-overlay").src=state.avatar;hide("avatar-overlay",false);say("avatar-status","अवतार मीडिया इंडेक्स के 9:16 पूर्वावलोकन पर लगाया गया है।");navigate("index");}
function clearAvatar(){
 if(state.avatar)URL.revokeObjectURL(state.avatar);state.avatar=null;
 if($("avatar-preview"))$("avatar-preview").removeAttribute("src");if($("avatar-overlay"))$("avatar-overlay").removeAttribute("src");
 hide("avatar-preview",true);hide("avatar-overlay",true);
 if($("apply-avatar"))$("apply-avatar").disabled=true;if($("clear-avatar"))$("clear-avatar").disabled=true;
 say("avatar-status","अभी कोई अवतार फोटो चयनित नहीं है।");
}
function safeModulePath(path){
 return typeof path==="string"&&path.startsWith("modules/")&&!path.includes("..")&&path.endsWith(".js")&&path.split("/").every(part=>/^[A-Za-z0-9_.-]+$/.test(part));
}
function getRecords(data){if(Array.isArray(data))return data;if(data&&Array.isArray(data.modules))return data.modules;throw new Error("Registry JSON में modules array नहीं मिली।");}
function addModuleButton(entry){
 const nav=document.querySelector(".nav");if(!nav||nav.querySelector('[data-module-id="'+entry.id+'"]'))return;
 const button=document.createElement("button");button.type="button";button.dataset.route="module:"+entry.id;button.dataset.moduleId=entry.id;button.textContent=entry.title;nav.appendChild(button);
}
async function loadRegistry(){
 const status=$("registry-status");
 try{
  const response=await fetch(new URL("modules/registry.json",document.baseURI),{cache:"no-store"});
  if(!response.ok)throw new Error(response.status===404?"modules/registry.json अभी Repository में उपलब्ध नहीं है।":"Registry पढ़ने में HTTP "+response.status+" त्रुटि आई।");
  const records=getRecords(await response.json());
  records.forEach(record=>{
   const id=record&&String(record.id||"").trim(),title=record&&String(record.title||record.name||record.label||"").trim(),file=record&&(record.file||record.path||record.src);
   if(!id||!/^[a-z0-9][a-z0-9_-]*$/i.test(id)||!title||!safeModulePath(file)){state.registry.invalid.push(record);return;}
   if(record.enabled===false||String(record.status||"").toLowerCase()==="placeholder"){state.registry.placeholders.push(record);return;}
   state.registry.active.push({id,title,file,description:String(record.description||"")});addModuleButton({id,title});
  });
  state.registry.loaded=true;
  if(status){status.className="status";status.textContent=state.registry.active.length+" सक्रिय Registry मॉड्यूल मिले; "+state.registry.placeholders.length+" लंबित/placeholder और "+state.registry.invalid.length+" अमान्य रिकॉर्ड।";}
 }catch(error){
  state.registry.error=error&&error.message?error.message:"Registry उपलब्ध नहीं है।";
  if(status){status.className="status warn";status.textContent=state.registry.error+" मुख्य मीडिया, अवतार और TTS सुविधाएँ Registry के बिना भी चल सकती हैं।";}
 }
}
async function loadModule(id){
 const entry=state.registry.active.find(item=>item.id===id);
 if(!entry){navigate("diagnostics");say("registry-status","यह मॉड्यूल सक्रिय Registry में उपलब्ध नहीं है: "+id);return;}
 const token=++state.moduleToken,view=$("view-module"),mount=$("module-mount");if(!view||!mount)return;
 document.querySelectorAll("main > .view").forEach(node=>{node.hidden=node!==view;});
 say("module-title",entry.title);say("module-description",entry.description||"Registry से लोड किया गया मॉड्यूल।");mount.replaceChildren();
 const previous=state.loaded.get(id);
 if(previous&&typeof previous.unmount==="function"){try{await previous.unmount();}catch(error){console.error("Module cleanup failed",error);}}
 if(token!==state.moduleToken)return;
 try{
  const api=await import(new URL(entry.file,document.baseURI).href);if(token!==state.moduleToken)return;
  if(typeof api.mount!=="function")throw new Error("इस मॉड्यूल में mount(context) export उपलब्ध नहीं है।");
  const result=await api.mount({root:mount,navigate,setStatus:message=>{const node=document.createElement("p");node.className="status";node.textContent=String(message);mount.appendChild(node);}});
  const unmount=typeof result==="function"?result:result&&typeof result.unmount==="function"?result.unmount.bind(result):null;
  state.loaded.set(id,{api,unmount});
 }catch(error){const node=document.createElement("div");node.className="status warn";node.textContent="मॉड्यूल लोड त्रुटि: "+(error&&error.message?error.message:"मॉड्यूल लोड नहीं हो सका।");mount.appendChild(node);}
}
function auditRow(container,label,detail,warning){
 if(!container)return;const row=document.createElement("div");row.className="status"+(warning?" warn":"");row.textContent=label+" — "+detail;container.appendChild(row);
}
async function runDiagnostics(){
 const list=$("audit-list"),modules=$("module-audit");if(!list)return;list.replaceChildren();if(modules)modules.replaceChildren();
 const required=["media-input","gallery","media-stage","stage-image","stage-video","fullscreen-btn","text-input","voice-select","speech-rate","speak-btn","pause-btn","resume-btn","stop-btn","avatar-input","avatar-preview","apply-avatar","clear-avatar","run-audit"];
 const missing=required.filter(id=>!$(id));auditRow(list,"HTML तत्व",missing.length?"अनुपस्थित ID: "+missing.join(", "):required.length+" आवश्यक ID उपलब्ध।",missing.length>0);
 const linked=Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link=>link.href.includes("assets/css/app.css"));auditRow(list,"CSS संदर्भ",linked?"assets/css/app.css लिंक मौजूद है।":"CSS लिंक नहीं मिला।",!linked);
 const mediaApi=Boolean(window.URL&&URL.createObjectURL&&URL.revokeObjectURL);auditRow(list,"स्थानीय मीडिया",mediaApi?"Object URL API उपलब्ध है।":"Object URL API उपलब्ध नहीं है।",!mediaApi);
 const tts=speechAvailable();auditRow(list,"Speech Synthesis",tts?state.voices.length+" voices उपलब्ध; वास्तविक आवाज़ Android TTS पर निर्भर है।":"इस ब्राउज़र में उपलब्ध नहीं है।",!tts);
 const stage=$("media-stage"),full=Boolean(stage&&(stage.requestFullscreen||stage.webkitRequestFullscreen));auditRow(list,"Fullscreen API",full?"मीडिया स्टेज Fullscreen का अनुरोध कर सकता है।":"Stage fullscreen method उपलब्ध नहीं है।",!full);
 auditRow(list,"मीडिया सूची",state.media.length+" स्थानीय फाइलें; कोई GitHub upload नहीं।",false);
 auditRow(list,"Registry",state.registry.loaded?state.registry.active.length+" सक्रिय, "+state.registry.placeholders.length+" placeholder, "+state.registry.invalid.length+" अमान्य रिकॉर्ड।":state.registry.error||"Registry जाँच लंबित; मुख्य सुविधाओं के लिए यह अनिवार्य नहीं।",!state.registry.loaded||state.registry.invalid.length>0);
 if(!modules)return;
 if(!state.registry.loaded)auditRow(modules,"मॉड्यूल रजिस्ट्री","अभी उपलब्ध नहीं; modules/registry.json जोड़ने पर यहाँ जाँच होगी।",true);
 for(const entry of state.registry.active){
  const loaded=state.loaded.get(entry.id);
  auditRow(modules,entry.title,entry.file+(loaded?" · import और mount सफल":" · Registry में दर्ज; अभी लोड नहीं किया गया।"),false);
  if(loaded&&typeof loaded.api.selfTest==="function"){
   try{const result=await loaded.api.selfTest();auditRow(modules,entry.title+" selfTest",result===false?"परीक्षण ने false लौटाया।":"selfTest पूरा हुआ।",result===false);}
   catch(error){auditRow(modules,entry.title+" selfTest",error&&error.message?error.message:"परीक्षण विफल।",true);}
  }
 }
 state.registry.placeholders.forEach(entry=>auditRow(modules,String(entry.title||entry.name||entry.id||"अज्ञात मॉड्यूल"),"DUMMY / लंबित — सक्रिय रूप में लोड नहीं किया गया।",true));
 state.registry.invalid.forEach(()=>auditRow(modules,"अमान्य Registry रिकॉर्ड","ID, शीर्षक या सुरक्षित modules/*.js पथ की जाँच विफल।",true));
}
function bind(){
 const nav=document.querySelector(".nav");
 if(nav)nav.addEventListener("click",event=>{const button=event.target.closest("button");if(!button||!nav.contains(button))return;if(button.dataset.action==="jump-text")jumpToText();else if(button.dataset.route)navigate(button.dataset.route);});
 if($("media-input"))$("media-input").addEventListener("change",event=>addMedia(event.target.files));
 if($("gallery"))$("gallery").addEventListener("click",event=>{const button=event.target.closest("[data-media-id]");if(button)selectMedia(button.dataset.mediaId);});
 if($("remove-media"))$("remove-media").addEventListener("click",removeMedia);
 if($("fullscreen-btn"))$("fullscreen-btn").addEventListener("click",fullscreen);
 if($("speak-btn"))$("speak-btn").addEventListener("click",startSpeech);
 if($("pause-btn"))$("pause-btn").addEventListener("click",pauseSpeech);
 if($("resume-btn"))$("resume-btn").addEventListener("click",resumeSpeech);
 if($("stop-btn"))$("stop-btn").addEventListener("click",stopSpeech);
 if($("speech-rate"))$("speech-rate").addEventListener("input",event=>say("rate-value",Number(event.target.value).toFixed(2)+"×"));
 if($("avatar-input"))$("avatar-input").addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];if(file)setAvatar(file);event.target.value="";});
 if($("apply-avatar"))$("apply-avatar").addEventListener("click",applyAvatar);
 if($("clear-avatar"))$("clear-avatar").addEventListener("click",clearAvatar);
 if($("run-audit"))$("run-audit").addEventListener("click",runDiagnostics);
}
function init(){
 bind();updateSpeechButtons();
 if(speechAvailable()){loadVoices();if(window.speechSynthesis.addEventListener)window.speechSynthesis.addEventListener("voiceschanged",loadVoices);else window.speechSynthesis.onvoiceschanged=loadVoices;window.setTimeout(loadVoices,600);}else loadVoices();
 loadRegistry();navigate("index");
 window.addEventListener("pagehide",()=>{stopSpeech();state.media.forEach(revoke);if(state.avatar)URL.revokeObjectURL(state.avatar);},{once:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
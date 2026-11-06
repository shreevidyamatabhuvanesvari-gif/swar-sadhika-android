/* Swar-Sadhika Speech-to-Singing — PCM streaming player.
 * UI and Web Audio transport only. Audio synthesis / Speech-to-Singing
 * conversion are supplied by a later local stream-processing module.
 * This file never replaces or modifies the normal TTS backend.
 */
const PLAYER_VERSION="0.1.0";
const DEFAULT_SAMPLE_RATE=48000,DEFAULT_CHANNELS=1,DEFAULT_INITIAL_BUFFER_MS=80;
const MAX_CHUNK_SECONDS=5,MAX_QUEUED_SECONDS=12,MIN_SAMPLE_RATE=8000,MAX_SAMPLE_RATE=96000;
const playerInstances=new WeakMap(),playerControllers=new WeakMap();
function errorMessage(e){return e&&typeof e.message==="string"&&e.message.trim()?e.message.trim():"अज्ञात त्रुटि";}
function setElementText(el,v){if(el)el.textContent=String(v==null?"":v);}
function safeCall(fn,args,fallback){try{return fn.apply(undefined,args);}catch(_){return fallback;}}
function validateContext(context){
 if(!context||typeof context!=="object")throw new TypeError("Music Player को host context object आवश्यक है।");
 const required=["getText","getSelectedVoice","getSpeechSettings","setStatus"],missing=required.filter(k=>typeof context[k]!=="function");
 if(missing.length)throw new TypeError("Music Player context में आवश्यक function अनुपस्थित हैं: "+missing.join(", "));
 const d=context.document,w=context.window,r=context.root;
 if(!d||d.nodeType!==9||typeof d.createElement!=="function")throw new TypeError("Music Player को वैध Document आवश्यक है।");
 if(!w||w.document!==d||!w.location||typeof w.location.origin!=="string"||!w.location.origin)throw new TypeError("Music Player को वैध Browser Window आवश्यक है।");
 if(!r||r.nodeType!==1||typeof r.appendChild!=="function")throw new TypeError("Music Player को वैध HTMLElement mount container आवश्यक है।");
 if(r.ownerDocument&&r.ownerDocument!==d)throw new TypeError("Music Player mount container host Document से संबंधित नहीं है।");
 if(d.defaultView&&d.defaultView!==w)throw new TypeError("Music Player host Window और Document मेल नहीं खाते।");
 if(!context.module||context.module.id!=="speech-to-singing"||context.module.contractVersion!==1)throw new TypeError("Music Player module identity या contract version मेल नहीं खाता।");
 return {root:r,doc:d,win:w};
}
function createNode(d,tag,cls,text){const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
export function getPlayerController(root){return root&&(typeof root==="object"||typeof root==="function")?playerControllers.get(root)||null:null;}

export async function mount(context){
 const {root,doc,win}=validateContext(context),existing=playerInstances.get(root);
 if(existing)return existing;
 const state={destroyed:false,visible:true,streamOpen:false,streamEnded:false,paused:false,pausedByNavigation:false,completed:false,
  chunksScheduled:0,sampleRate:DEFAULT_SAMPLE_RATE,channelCount:DEFAULT_CHANNELS,initialBufferMs:DEFAULT_INITIAL_BUFFER_MS,
  scheduledUntil:0,pendingSources:new Set(),audioContext:null,gainNode:null,volume:0.8,statusText:"ऑडियो इंजन अभी तैयार नहीं है।",warning:false};
 const ui={};let lifecycle=null,controller=null;
 function status(message,warning=false){
  state.statusText=String(message);state.warning=Boolean(warning);
  if(ui.status){setElementText(ui.status,state.statusText);ui.status.classList.toggle("warn",state.warning);}
  safeCall(context.setStatus,[state.statusText,state.warning],undefined);
 }
 function updateControls(){
  if(state.destroyed)return;const active=state.streamOpen&&!state.completed;
  if(ui.play){ui.play.disabled=active&&!state.paused;ui.play.textContent=active?(state.paused?"▶ Resume Stream":"▶ Stream सक्रिय"):"▶ ऑडियो Stream शुरू करें";}
  if(ui.pause)ui.pause.disabled=!active||state.paused;
  if(ui.resume)ui.resume.disabled=!active||!state.paused;
  if(ui.stop)ui.stop.disabled=!active&&!state.audioContext;
  if(ui.volume)ui.volume.value=String(state.volume);
 }
 function updateSource(){
  if(state.destroyed)return;
  const text=safeCall(context.getText,[],""),voice=safeCall(context.getSelectedVoice,[],null),settings=safeCall(context.getSpeechSettings,[],{});
  setElementText(ui.textPreview,String(text==null?"":text).trim()||"TTS पेज पर अभी कोई पाठ उपलब्ध नहीं है।");
  setElementText(ui.voiceInfo,(voice&&voice.name?String(voice.name):"स्थानीय Voice चयन उपलब्ध नहीं")+" · "+(voice&&voice.lang?String(voice.lang):"भाषा अज्ञात")+" · गति "+(settings&&Number.isFinite(Number(settings.rate))?Number(settings.rate).toFixed(2):"डिफ़ॉल्ट"));
 }
 function setButton(b,label,cls,handler){b.type="button";b.className=cls;b.textContent=label;b.addEventListener("click",handler);return b;}
 async function ensureAudioContext(){
  if(state.destroyed)throw new Error("Music Player बंद किया जा चुका है।");
  const C=win.AudioContext||win.webkitAudioContext;
  if(typeof C!=="function")throw new Error("इस ब्राउज़र में Web Audio API उपलब्ध नहीं है। Android Chrome अपडेट करें।");
  if(!state.audioContext||state.audioContext.state==="closed"){
   state.audioContext=new C();if(typeof state.audioContext.createGain!=="function")throw new Error("AudioContext GainNode उपलब्ध नहीं है।");
   state.gainNode=state.audioContext.createGain();state.gainNode.gain.value=state.volume;state.gainNode.connect(state.audioContext.destination);
  }
  if(state.audioContext.state!=="running")await state.audioContext.resume();
  if(state.audioContext.state!=="running")throw new Error("ब्राउज़र ने AudioContext सक्रिय नहीं किया। Play बटन दोबारा दबाएँ।");
  return state.audioContext;
 }
 function streamOptions(o={}){
  const sampleRate=o.sampleRate==null?DEFAULT_SAMPLE_RATE:Number(o.sampleRate),channelCount=o.channelCount==null?DEFAULT_CHANNELS:Number(o.channelCount),initialBufferMs=o.initialBufferMs==null?DEFAULT_INITIAL_BUFFER_MS:Number(o.initialBufferMs);
  if(!Number.isFinite(sampleRate)||sampleRate<MIN_SAMPLE_RATE||sampleRate>MAX_SAMPLE_RATE)throw new RangeError("PCM sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
  if(!Number.isInteger(channelCount)||channelCount<1||channelCount>2)throw new RangeError("PCM channelCount केवल 1 या 2 हो सकता है।");
  if(!Number.isFinite(initialBufferMs)||initialBufferMs<0||initialBufferMs>500)throw new RangeError("initialBufferMs 0 से 500 के बीच होना चाहिए।");
  return {sampleRate,channelCount,initialBufferMs};
 }
 function stopInternal(update=true){
  state.pendingSources.forEach(s=>{s.onended=null;try{s.stop(0);}catch(_){}try{s.disconnect();}catch(_){}});
  state.pendingSources.clear();state.streamOpen=false;state.streamEnded=false;state.paused=false;state.pausedByNavigation=false;state.completed=false;state.chunksScheduled=0;
  state.scheduledUntil=state.audioContext?state.audioContext.currentTime:0;
  if(update&&!state.destroyed){status("Playback रोक दिया गया है।");updateControls();}
 }
 async function startStream(options={}){
  if(state.destroyed)throw new Error("Music Player बंद है।");
  const o=streamOptions(options);
  if(!state.audioContext||state.audioContext.state!=="running")throw new Error("पहले Player पर Play दबाकर Audio Engine सक्रिय करें।");
  stopInternal(false);state.sampleRate=o.sampleRate;state.channelCount=o.channelCount;state.initialBufferMs=o.initialBufferMs;
  state.streamOpen=true;state.streamEnded=false;state.paused=false;state.pausedByNavigation=false;state.completed=false;state.chunksScheduled=0;
  state.scheduledUntil=state.audioContext.currentTime+o.initialBufferMs/1000;updateControls();status("Audio Stream तैयार है। पहले PCM chunk की प्रतीक्षा है।");return getState();
 }
 function normalizePcm(samples,format){
  if(samples instanceof Float32Array){if(format&&format!=="float32")throw new TypeError("Float32Array के लिए format float32 होना चाहिए।");return {data:samples,format:"float32"};}
  if(samples instanceof Int16Array){if(format&&format!=="int16")throw new TypeError("Int16Array के लिए format int16 होना चाहिए।");return {data:samples,format:"int16"};}
  if(samples instanceof ArrayBuffer){
   if(format==="float32"){if(samples.byteLength%4)throw new RangeError("Float32 PCM byteLength चार से विभाज्य होना चाहिए।");return {data:new Float32Array(samples),format:"float32"};}
   if(format==="int16"||!format){if(samples.byteLength%2)throw new RangeError("Int16 PCM byteLength दो से विभाज्य होना चाहिए।");return {data:new Int16Array(samples),format:"int16"};}
  }
  throw new TypeError("PCM chunk केवल Float32Array, Int16Array या ArrayBuffer होना चाहिए।");
 }
 function enqueuePcmChunk(samples,options={}){
  if(state.destroyed)throw new Error("Music Player बंद है।");
  if(!state.streamOpen||state.streamEnded)throw new Error("पहले startStream() चलाकर PCM stream खोलें।");
  if(!state.audioContext||state.audioContext.state==="closed")throw new Error("AudioContext उपलब्ध नहीं है। पहले Play दबाएँ।");
  const pcm=normalizePcm(samples,options.format),channels=options.channelCount==null?state.channelCount:Number(options.channelCount),rate=options.sampleRate==null?state.sampleRate:Number(options.sampleRate);
  if(!Number.isInteger(channels)||channels<1||channels>2||channels!==state.channelCount)throw new RangeError("PCM chunk channelCount वर्तमान stream से मेल खाना चाहिए (1 या 2)।");
  if(!Number.isFinite(rate)||rate<MIN_SAMPLE_RATE||rate>MAX_SAMPLE_RATE)throw new RangeError("PCM chunk sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
  if(!pcm.data.length||pcm.data.length%channels)throw new RangeError("PCM chunk में कम-से-कम एक पूर्ण audio frame होना चाहिए।");
  const frames=pcm.data.length/channels,duration=frames/rate;
  if(!Number.isFinite(duration)||duration<=0||duration>MAX_CHUNK_SECONDS)throw new RangeError("प्रत्येक PCM chunk की अवधि शून्य से अधिक और अधिकतम पाँच सेकंड होनी चाहिए।");
  const now=state.audioContext.currentTime,queued=Math.max(0,state.scheduledUntil-now);
  if(queued+duration>MAX_QUEUED_SECONDS)throw new RangeError("Audio queue की सीमा पूरी है। पहले कुछ PCM chunks चलने दें।");
  const buffer=state.audioContext.createBuffer(channels,frames,rate);
  for(let ch=0;ch<channels;ch+=1){const out=buffer.getChannelData(ch);for(let i=0;i<frames;i+=1){
   const sample=pcm.data[i*channels+ch];let value=pcm.format==="int16"?(sample<0?sample/32768:sample):sample;
   if(!Number.isFinite(value))value=0;out[i]=Math.max(-1,Math.min(1,value));
  }}
  const node=state.audioContext.createBufferSource();node.buffer=buffer;node.connect(state.gainNode);
  const startAt=Math.max(state.audioContext.currentTime+0.015,state.scheduledUntil);
  node.onended=()=>{state.pendingSources.delete(node);try{node.disconnect();}catch(_){}
   if(!state.destroyed&&state.streamEnded&&state.pendingSources.size===0){state.streamOpen=false;state.completed=true;state.paused=false;status("Audio Stream पूरा हो गया।");updateControls();}
  };
  try{node.start(startAt);}catch(e){node.onended=null;try{node.disconnect();}catch(_){}throw e;}
  state.scheduledUntil=startAt+duration;state.pendingSources.add(node);state.chunksScheduled+=1;updateControls();
  if(state.chunksScheduled===1)status("पहला PCM chunk प्लेबैक के लिए निर्धारित हो गया है। आगे के chunks चलते समय जोड़े जा सकते हैं।");
  return Object.freeze({frames,durationSeconds:duration,scheduledAt:startAt,queuedSeconds:Math.max(0,state.scheduledUntil-state.audioContext.currentTime)});
 }
 function finishStream(){
  if(!state.streamOpen)return false;state.streamEnded=true;
  if(!state.pendingSources.size){state.streamOpen=false;state.completed=true;status("Audio Stream समाप्त हुआ; चलाने के लिए कोई शेष chunk नहीं है।",state.chunksScheduled===0);}
  else status("आखिरी PCM chunk प्राप्त हुआ। शेष audio पूरा होने पर Player रुकेगा।");
  updateControls();return true;
 }
 async function pause(){
  if(!state.streamOpen||state.paused||!state.audioContext||state.audioContext.state==="closed")return false;
  try{await state.audioContext.suspend();state.paused=true;state.pausedByNavigation=false;status("Audio Playback Pause है।");updateControls();return true;}
  catch(e){status("Audio Pause विफल: "+errorMessage(e),true);return false;}
 }
 async function resume(){
  if(!state.streamOpen||!state.paused||!state.audioContext||state.audioContext.state==="closed")return false;
  try{await state.audioContext.resume();if(state.audioContext.state!=="running")throw new Error("AudioContext running स्थिति में नहीं आया।");
   state.paused=false;state.pausedByNavigation=false;status("Audio Playback फिर शुरू हो गया है।");updateControls();return true;}
  catch(e){status("Audio Resume विफल: "+errorMessage(e),true);return false;}
 }
 async function prepareAndPlay(){
  try{await ensureAudioContext();updateSource();
   if(state.streamOpen&&state.paused){await resume();return;}
   if(state.streamOpen){status("Audio Stream पहले से सक्रिय है; PCM chunks की प्रतीक्षा/प्लेबैक जारी है।");return;}
   await startStream();status("Audio Engine तैयार है। Stream Processor से पहला PCM chunk आने की प्रतीक्षा है।",true);
  }catch(e){status("Audio Engine शुरू नहीं हुआ: "+errorMessage(e),true);}
 }
 async function onHide(){
  state.visible=false;
  if(state.streamOpen&&!state.paused&&state.audioContext&&state.audioContext.state==="running"){
   try{await state.audioContext.suspend();state.paused=true;state.pausedByNavigation=true;status("दूसरे पेज पर जाने से Audio Pause हुआ। वापस आकर Resume दबाएँ।");}
   catch(e){status("पेज बदलने पर Audio Pause विफल: "+errorMessage(e),true);}
  }updateControls();
 }
 function onShow(){state.visible=true;updateSource();if(state.pausedByNavigation)status("Player फिर खुला है। Audio जारी करने के लिए Resume दबाएँ।");updateControls();}
 function getState(){return Object.freeze({
  version:PLAYER_VERSION,streamOpen:state.streamOpen,streamEnded:state.streamEnded,paused:state.paused,pausedByNavigation:state.pausedByNavigation,
  completed:state.completed,chunksScheduled:state.chunksScheduled,pendingChunks:state.pendingSources.size,
  sampleRate:state.sampleRate,channelCount:state.channelCount,volume:state.volume,
  audioContextState:state.audioContext?state.audioContext.state:"uninitialized",
  queuedSeconds:state.audioContext?Math.max(0,state.scheduledUntil-state.audioContext.currentTime):0
 });}
 function onPlay(){void prepareAndPlay();}async function onPause(){await pause();}async function onResume(){await resume();}function onStop(){stopInternal(true);}
 function onVolumeInput(){const v=Number(ui.volume.value);if(!Number.isFinite(v))return;state.volume=Math.max(0,Math.min(1,v));
  if(state.gainNode&&state.gainNode.gain){if(typeof state.gainNode.gain.setTargetAtTime==="function"&&state.audioContext)state.gainNode.gain.setTargetAtTime(state.volume,state.audioContext.currentTime,0.015);else state.gainNode.gain.value=state.volume;}
 }
 async function unmount(){
  if(state.destroyed)return;state.destroyed=true;stopInternal(false);
  ui.play.removeEventListener("click",onPlay);ui.pause.removeEventListener("click",onPause);
  ui.resume.removeEventListener("click",onResume);ui.stop.removeEventListener("click",onStop);ui.volume.removeEventListener("input",onVolumeInput);
  const ac=state.audioContext;state.audioContext=null;state.gainNode=null;
  if(ac&&ac.state!=="closed"){try{await ac.close();}catch(_){}}
  if(playerControllers.get(root)===controller)playerControllers.delete(root);
  if(playerInstances.get(root)===lifecycle)playerInstances.delete(root);
  if(typeof root.replaceChildren==="function")root.replaceChildren();
 }
 const panel=createNode(doc,"section","panel music-player-panel");panel.setAttribute("aria-label","Speech-to-Singing Music Player");
 const heading=createNode(doc,"h2","","♫ गायन Music Player");
 const intro=createNode(doc,"p","subtle","यह स्वतंत्र PCM Audio Player है। गायन बनाने वाला स्थानीय Audio Stream Processor अलग मॉड्यूल के रूप में जुड़ेगा।");
 const label=createNode(doc,"strong","","TTS पाठ");ui.textPreview=createNode(doc,"pre","note music-player-text","");
 ui.voiceInfo=createNode(doc,"p","subtle","");const actions=createNode(doc,"div","tts-actions");
 ui.play=setButton(createNode(doc,"button"),"▶ ऑडियो Stream शुरू करें","btn primary",onPlay);
 ui.pause=setButton(createNode(doc,"button"),"Ⅱ Pause","btn",onPause);ui.resume=setButton(createNode(doc,"button"),"▶ Resume","btn",onResume);
 ui.stop=setButton(createNode(doc,"button"),"■ Stop","btn danger",onStop);actions.append(ui.play,ui.pause,ui.resume,ui.stop);
 const volLabel=createNode(doc,"label","field"),volTitle=createNode(doc,"span","","ऑडियो वॉल्यूम");
 ui.volume=createNode(doc,"input");ui.volume.type="range";ui.volume.min="0";ui.volume.max="1";ui.volume.step="0.05";ui.volume.value=String(state.volume);
 ui.volume.setAttribute("aria-label","Music Player volume");ui.volume.addEventListener("input",onVolumeInput);volLabel.append(volTitle,ui.volume);
 ui.status=createNode(doc,"div","status",state.statusText);ui.status.setAttribute("role","status");ui.status.setAttribute("aria-live","polite");
 const note=createNode(doc,"p","note","महत्वपूर्ण: Android Chrome का सामान्य SpeechSynthesis API PCM audio chunks उपलब्ध नहीं कराता। वास्तविक गायन के लिए स्थानीय TTS/Native Audio Bridge या PCM देने वाला मॉडल और अगला Stream Processor आवश्यक है।");
 panel.append(heading,intro,label,ui.textPreview,ui.voiceInfo,actions,volLabel,ui.status,note);root.appendChild(panel);updateSource();updateControls();
 controller=Object.freeze({
  startStream,enqueuePcmChunk,finishStream,pause,resume,stop:onStop,prepareAudio:ensureAudioContext,
  setVolume:value=>{const v=Number(value);if(!Number.isFinite(v))throw new TypeError("Volume संख्या होनी चाहिए।");state.volume=Math.max(0,Math.min(1,v));ui.volume.value=String(state.volume);if(state.gainNode&&state.gainNode.gain)state.gainNode.gain.value=state.volume;return state.volume;},
  getState
 });
 lifecycle=Object.freeze({onShow,onHide,unmount});playerControllers.set(root,controller);playerInstances.set(root,lifecycle);
 status("Music Player UI तैयार है। Audio Stream Processor जुड़ने पर PCM chunks चलाए जा सकेंगे।",true);
 return lifecycle;
}

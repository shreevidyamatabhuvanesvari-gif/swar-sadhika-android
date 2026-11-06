/* Swar-Sadhika Speech-to-Singing — Web Audio PCM Player (0.2.0).
 * Audio transport only; local synthesis and PCM production are separate modules.
 */
const PLAYER_VERSION="0.2.0",HOST_CONTRACT_VERSION=2,PLAYER_CONTRACT_VERSION=1;
const DEFAULT_SAMPLE_RATE=48000,DEFAULT_CHANNELS=1,DEFAULT_INITIAL_BUFFER_MS=80;
const MAX_CHUNK_SECONDS=5,MAX_QUEUED_SECONDS=12,MIN_SAMPLE_RATE=8000,MAX_SAMPLE_RATE=96000,SCHEDULING_LEAD_SECONDS=0.015;
const playerInstances=new WeakMap(),playerControllers=new WeakMap();
function errorMessage(e){return e&&typeof e.message==="string"&&e.message.trim()?e.message.trim():"अज्ञात त्रुटि";}
function safeCall(fn,args,fallback){try{return fn.apply(undefined,args);}catch(_){return fallback;}}
function setText(el,value){if(el)el.textContent=String(value==null?"":value);}
function validateContext(c){
 if(!c||typeof c!=="object")throw new TypeError("Music Player को host context object आवश्यक है।");
 const required=["getText","getSelectedVoice","getSpeechSettings","setStatus","startPcmStream","pushPcmChunk","endPcmStream","stopPcmStream","getPcmStreamState"];
 const missing=required.filter(k=>typeof c[k]!=="function");
 if(missing.length)throw new TypeError("Music Player Host Contract v2 में आवश्यक functions अनुपस्थित हैं: "+missing.join(", "));
 if(c.hostContractVersion!==HOST_CONTRACT_VERSION)throw new TypeError("Music Player Host Contract v2 आवश्यक है।");
 const d=c.document,w=c.window,r=c.root,m=c.module;
 if(!d||d.nodeType!==9||typeof d.createElement!=="function")throw new TypeError("वैध Document आवश्यक है।");
 if(!w||w.document!==d||!w.location||typeof w.location.origin!=="string"||!w.location.origin||(typeof w.AudioContext!=="function"&&typeof w.webkitAudioContext!=="function"))throw new TypeError("Browser Window और Web Audio API आवश्यक हैं।");
 if(!r||r.nodeType!==1||typeof r.appendChild!=="function")throw new TypeError("वैध HTMLElement mount container आवश्यक है।");
 if(r.ownerDocument&&r.ownerDocument!==d)throw new TypeError("Mount container host Document से संबंधित नहीं है।");
 if(d.defaultView&&d.defaultView!==w)throw new TypeError("Host Window और Document मेल नहीं खाते।");
 if(!m||m.id!=="speech-to-singing"||m.contractVersion!==PLAYER_CONTRACT_VERSION||m.hostContractVersion!==HOST_CONTRACT_VERSION)throw new TypeError("Player/Host versioned contract मेल नहीं खाता।");
 return {root:r,doc:d,win:w};
}
function makeNode(d,t,cls,text){const e=d.createElement(t);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
function normalizePcm(samples,format){
 const tag=Object.prototype.toString.call(samples);let data,kind;
 if(tag==="[object Float32Array]"){if(format!=null&&format!=="float32")throw new TypeError("Float32Array के लिए format float32 होना चाहिए।");data=Float32Array.from(samples);kind="float32";}
 else if(tag==="[object Int16Array]"){if(format!=null&&format!=="int16")throw new TypeError("Int16Array के लिए format int16 होना चाहिए।");data=Int16Array.from(samples);kind="int16";}
 else if(tag==="[object ArrayBuffer]"){
  if(format==="float32"){if(samples.byteLength%4)throw new RangeError("Float32 PCM byteLength चार से विभाजित होना चाहिए।");data=new Float32Array(samples.slice(0));kind="float32";}
  else if(format==="int16"||format==null){if(samples.byteLength%2)throw new RangeError("Int16 PCM byteLength दो से विभाजित होना चाहिए।");data=new Int16Array(samples.slice(0));kind="int16";}
  else throw new TypeError("ArrayBuffer के लिए format float32 या int16 होना चाहिए।");
 }else throw new TypeError("PCM chunk केवल Float32Array, Int16Array या ArrayBuffer होना चाहिए।");
 if(kind==="float32")for(let i=0;i<data.length;i++)if(!Number.isFinite(data[i]))throw new RangeError("Float32 PCM में NaN या Infinity स्वीकार नहीं है।");
 return {data,format:kind};
}
export function getPlayerController(root){return root&&(typeof root==="object"||typeof root==="function")?playerControllers.get(root)||null:null;}
export async function mount(context){
 const {root,doc,win}=validateContext(context),existing=playerInstances.get(root);if(existing)return existing;
 const state={destroyed:false,visible:true,streamOpen:false,streamEnded:false,paused:false,pausedByNavigation:false,completed:false,
  starting:false,startPromise:null,chunksScheduled:0,sampleRate:DEFAULT_SAMPLE_RATE,channelCount:DEFAULT_CHANNELS,initialBufferMs:DEFAULT_INITIAL_BUFFER_MS,
  scheduledUntil:0,pendingSources:new Set(),audioContext:null,gainNode:null,audioStateListener:null,hostUnsubscribe:null,volume:0.8,statusText:"ऑडियो इंजन अभी तैयार नहीं है।",warning:false};
 const ui={};let lifecycle=null,controller=null;
 function status(message,warning=false){state.statusText=String(message);state.warning=Boolean(warning);if(ui.status){setText(ui.status,state.statusText);ui.status.classList.toggle("warn",state.warning);}safeCall(context.setStatus,[state.statusText,state.warning],undefined);}
 function processorState(){const s=safeCall(context.getPcmStreamState,[],null);return s&&typeof s==="object"?s:null;}
 function updateControls(){
  if(state.destroyed)return;const ps=processorState(),phase=ps&&ps.phase?ps.phase:"idle";
  const active=state.streamOpen||["starting","streaming","ending"].includes(phase)||state.starting,resumable=state.streamOpen&&state.paused;
  if(ui.play){ui.play.disabled=state.starting||(active&&!resumable);ui.play.textContent=resumable?"▶ Resume":"▶ PCM Stream तैयार करें";}
  if(ui.pause)ui.pause.disabled=!state.streamOpen||state.paused||state.completed;
  if(ui.resume)ui.resume.disabled=!resumable;
  if(ui.stop)ui.stop.disabled=(!active&&!state.audioContext)||state.starting;
  if(ui.volume)ui.volume.value=String(state.volume);
  if(ui.phase)ui.phase.textContent=phase==="idle"?"तैयार नहीं":phase==="starting"?"शुरू हो रहा है":phase==="streaming"?"PCM Stream सक्रिय":phase==="ending"?"समाप्त हो रहा है":phase==="completed"?"पूरा हुआ":phase==="failed"?"त्रुटि":phase==="stopped"?"रुका हुआ":phase;
 }
 function updateSource(){
  if(state.destroyed)return;const text=safeCall(context.getText,[],""),voice=safeCall(context.getSelectedVoice,[],null),settings=safeCall(context.getSpeechSettings,[],{});
  setText(ui.textPreview,String(text==null?"":text).trim()||"TTS पेज पर अभी कोई पाठ उपलब्ध नहीं है।");
  setText(ui.voiceInfo,(voice&&voice.name?String(voice.name):"स्थानीय Voice metadata उपलब्ध नहीं")+" · "+(voice&&voice.lang?String(voice.lang):"भाषा अज्ञात")+" · गति "+(settings&&Number.isFinite(Number(settings.rate))?Number(settings.rate).toFixed(2):"डिफ़ॉल्ट"));
 }
 function updateVolume(){if(!state.gainNode||!state.audioContext||state.audioContext.state==="closed")return;const g=state.gainNode.gain;if(typeof g.setTargetAtTime==="function")g.setTargetAtTime(state.volume,state.audioContext.currentTime,0.015);else g.value=state.volume;}
 function onAudioStateChange(){if(state.destroyed)return;if(state.audioContext&&state.audioContext.state==="closed"&&state.streamOpen)status("AudioContext बंद हो गया। PCM Stream पुनः शुरू करना आवश्यक है।",true);updateControls();}
 async function ensureAudioContext(){
  if(state.destroyed)throw new Error("Music Player बंद किया जा चुका है।");const C=win.AudioContext||win.webkitAudioContext;if(typeof C!=="function")throw new Error("इस Browser में Web Audio API उपलब्ध नहीं है।");
  if(state.audioContext&&state.audioContext.state==="closed"){if(state.audioStateListener&&typeof state.audioContext.removeEventListener==="function")state.audioContext.removeEventListener("statechange",state.audioStateListener);state.audioContext=null;state.gainNode=null;state.audioStateListener=null;}
  if(!state.audioContext){let ac=null;try{
   ac=new C();if(!ac||typeof ac.createGain!=="function"||typeof ac.createBuffer!=="function"||typeof ac.createBufferSource!=="function")throw new Error("AudioContext के आवश्यक Web Audio Nodes उपलब्ध नहीं हैं।");
   const gain=ac.createGain();if(!gain||!gain.gain||typeof gain.connect!=="function")throw new Error("Audio GainNode तैयार नहीं हुआ।");
   gain.gain.value=state.volume;gain.connect(ac.destination);state.audioContext=ac;state.gainNode=gain;state.audioStateListener=onAudioStateChange;
   if(typeof ac.addEventListener==="function")ac.addEventListener("statechange",state.audioStateListener);else ac.onstatechange=state.audioStateListener;
  }catch(e){if(ac&&ac.state!=="closed"&&typeof ac.close==="function"){try{await ac.close();}catch(_){}}state.audioContext=null;state.gainNode=null;state.audioStateListener=null;throw e;}}
  if(state.audioContext.state!=="running")await state.audioContext.resume();if(state.destroyed)throw new Error("AudioContext Resume के दौरान Player बंद किया गया।");
  if(!state.audioContext||state.audioContext.state!=="running")throw new Error("Browser ने AudioContext को running स्थिति में सक्रिय नहीं किया। Play दोबारा दबाएँ।");return state.audioContext;
 }
 function streamOptions(o={}){
  if(!o||typeof o!=="object"||Array.isArray(o))throw new TypeError("Stream options object होना चाहिए।");
  const rate=o.sampleRate==null?DEFAULT_SAMPLE_RATE:Number(o.sampleRate),channels=o.channelCount==null?DEFAULT_CHANNELS:Number(o.channelCount),buffer=o.initialBufferMs==null?DEFAULT_INITIAL_BUFFER_MS:Number(o.initialBufferMs);
  if(!Number.isFinite(rate)||rate<MIN_SAMPLE_RATE||rate>MAX_SAMPLE_RATE)throw new RangeError("PCM sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
  if(!Number.isInteger(channels)||channels<1||channels>2)throw new RangeError("PCM channelCount केवल 1 या 2 हो सकता है।");
  if(!Number.isFinite(buffer)||buffer<0||buffer>500)throw new RangeError("initialBufferMs 0 से 500 मिलीसेकंड के बीच होना चाहिए।");return {sampleRate:rate,channelCount:channels,initialBufferMs:buffer};
 }
 function stopInternal(update=true){
  for(const s of state.pendingSources){s.onended=null;try{s.stop(0);}catch(_){}try{s.disconnect();}catch(_){}}
  state.pendingSources.clear();state.streamOpen=false;state.streamEnded=false;state.paused=false;state.pausedByNavigation=false;state.completed=false;state.chunksScheduled=0;
  state.scheduledUntil=state.audioContext&&Number.isFinite(state.audioContext.currentTime)?state.audioContext.currentTime:0;
  if(update&&!state.destroyed){status("Playback रोक दिया गया है।");updateControls();}return true;
 }
 async function startStream(options={}){
  if(state.destroyed)throw new Error("Music Player बंद है।");const o=streamOptions(options);
  if(!state.audioContext||state.audioContext.state!=="running")throw new Error("Processor Start से पहले AudioContext सक्रिय होना चाहिए।");
  stopInternal(false);state.sampleRate=o.sampleRate;state.channelCount=o.channelCount;state.initialBufferMs=o.initialBufferMs;
  state.streamOpen=true;state.streamEnded=false;state.paused=false;state.pausedByNavigation=false;state.completed=false;state.chunksScheduled=0;state.scheduledUntil=state.audioContext.currentTime+o.initialBufferMs/1000;
  updateControls();status("PCM Stream खुल गया है। Producer से पहला Audio Chunk आने की प्रतीक्षा है।");return getState();
 }
 function enqueuePcmChunk(samples,options={}){
  if(state.destroyed)throw new Error("Music Player बंद है।");if(!state.streamOpen||state.streamEnded)throw new Error("Stream Processor से पहले सक्रिय PCM Stream खोलें।");
  if(!state.audioContext||state.audioContext.state==="closed")throw new Error("AudioContext उपलब्ध नहीं है या बंद है।");
  if(state.audioContext.state!=="running"||state.paused)throw new Error("Audio Playback Pause है; Resume के बाद PCM chunk भेजें।");
  if(!options||typeof options!=="object"||Array.isArray(options))throw new TypeError("PCM chunk options object होना चाहिए।");
  const pcm=normalizePcm(samples,options.format),channels=options.channelCount==null?state.channelCount:Number(options.channelCount),rate=options.sampleRate==null?state.sampleRate:Number(options.sampleRate);
  if(!Number.isInteger(channels)||channels!==state.channelCount)throw new RangeError("PCM chunk channelCount सक्रिय Stream से मेल खाना चाहिए।");
  if(!Number.isFinite(rate)||rate!==state.sampleRate)throw new RangeError("PCM chunk sampleRate सक्रिय Stream से मेल खाना चाहिए।");
  if(!pcm.data.length||pcm.data.length%channels!==0)throw new RangeError("PCM chunk में कम-से-कम एक पूर्ण audio frame होना चाहिए।");
  const frames=pcm.data.length/channels,duration=frames/rate;if(!Number.isFinite(duration)||duration<=0||duration>MAX_CHUNK_SECONDS)throw new RangeError("PCM chunk की अवधि शून्य से अधिक और अधिकतम पाँच सेकंड होनी चाहिए।");
  const now=state.audioContext.currentTime,queued=Math.max(0,state.scheduledUntil-now);if(queued+duration>MAX_QUEUED_SECONDS)throw new RangeError("Audio queue की 12 सेकंड सीमा पूरी है। Producer को प्रतीक्षा करनी चाहिए।");
  const buffer=state.audioContext.createBuffer(channels,frames,rate);if(!buffer||typeof buffer.getChannelData!=="function")throw new Error("AudioBuffer तैयार नहीं हुआ।");
  for(let ch=0;ch<channels;ch++){const output=buffer.getChannelData(ch);for(let f=0;f<frames;f++){const sample=pcm.data[f*channels+ch];output[f]=pcm.format==="int16"?(sample<0?sample/32768:sample/32767):Math.max(-1,Math.min(1,sample));}}
  const source=state.audioContext.createBufferSource();if(!source||typeof source.connect!=="function"||typeof source.start!=="function")throw new Error("AudioBufferSourceNode तैयार नहीं हुआ।");
  source.buffer=buffer;source.connect(state.gainNode);const startAt=Math.max(now+SCHEDULING_LEAD_SECONDS,state.scheduledUntil);
  source.onended=()=>{state.pendingSources.delete(source);try{source.disconnect();}catch(_){}if(state.destroyed)return;
   if(state.streamEnded&&state.pendingSources.size===0){state.streamOpen=false;state.completed=true;state.paused=false;if(state.audioContext&&state.audioContext.state!=="closed")state.scheduledUntil=state.audioContext.currentTime;status("सभी निर्धारित PCM Audio chunks का Playback पूरा हुआ।");}updateControls();};
  try{source.start(startAt);}catch(e){source.onended=null;try{source.disconnect();}catch(_){}throw e;}
  state.pendingSources.add(source);state.scheduledUntil=startAt+duration;state.chunksScheduled++;updateControls();if(state.chunksScheduled===1)status("पहला PCM chunk Playback के लिए निर्धारित हुआ है।");
  return Object.freeze({frames,durationSeconds:duration,scheduledAt:startAt,queuedSeconds:Math.max(0,state.scheduledUntil-state.audioContext.currentTime)});
 }
 function finishStream(){if(!state.streamOpen||state.streamEnded)return false;state.streamEnded=true;
  if(state.pendingSources.size===0){state.streamOpen=false;state.completed=true;state.paused=false;status("PCM Stream समाप्त हुआ; कोई शेष Audio chunk नहीं है।",state.chunksScheduled===0);}
  else status("अंतिम PCM chunk प्राप्त हुआ। शेष Audio पूरा होने पर Playback समाप्त होगा।");updateControls();return true;}
 async function pause(){if(!state.streamOpen||state.paused||!state.audioContext||state.audioContext.state==="closed")return false;
  try{await state.audioContext.suspend();if(state.destroyed)return false;if(state.audioContext.state!=="suspended")throw new Error("AudioContext suspended स्थिति में नहीं आया।");state.paused=true;state.pausedByNavigation=false;status("Audio Playback Pause है।");updateControls();return true;}
  catch(e){status("Audio Pause विफल: "+errorMessage(e),true);return false;}}
 async function resume(){if(!state.streamOpen||!state.paused||!state.audioContext||state.audioContext.state==="closed")return false;
  try{await state.audioContext.resume();if(state.destroyed)return false;if(state.audioContext.state!=="running")throw new Error("AudioContext running स्थिति में नहीं आया।");state.paused=false;state.pausedByNavigation=false;status("Audio Playback फिर शुरू हो गया है।");updateControls();return true;}
  catch(e){status("Audio Resume विफल: "+errorMessage(e),true);return false;}}
 async function startPcmStream(){if(state.destroyed)throw new Error("Music Player बंद है।");if(state.startPromise)return state.startPromise;if(state.streamOpen&&state.paused)return resume();
  const request=context.startPcmStream({sampleRate:DEFAULT_SAMPLE_RATE,channelCount:DEFAULT_CHANNELS,initialBufferMs:DEFAULT_INITIAL_BUFFER_MS});state.starting=true;updateControls();
  state.startPromise=Promise.resolve(request).then(v=>{if(!state.destroyed)status("Audio Engine और PCM Stream तैयार हैं। वास्तविक गायन के लिए PCM Producer से Audio chunks आवश्यक हैं।");return v;})
   .catch(e=>{if(!state.destroyed)status("PCM Stream शुरू नहीं हो सका: "+errorMessage(e),true);throw e;})
   .finally(()=>{state.starting=false;state.startPromise=null;updateControls();});return state.startPromise;}
 async function stopPcmStream(reason="उपयोगकर्ता ने Playback रोक दिया।"){if(state.destroyed)return false;try{const stopped=context.stopPcmStream(reason);if(!stopped&&state.streamOpen)stopInternal(true);else if(stopped)status(String(reason));updateControls();return Boolean(stopped);}
  catch(e){status("PCM Stream Stop विफल: "+errorMessage(e),true);return false;}}
 async function onHide(){state.visible=false;if(state.streamOpen&&!state.paused&&state.audioContext){try{if(state.audioContext.state==="running")await state.audioContext.suspend();if(state.destroyed)return;
   if(state.audioContext.state==="suspended"){state.paused=true;state.pausedByNavigation=true;status("दूसरे पेज पर जाने से Audio Pause हुआ। वापस आकर Resume दबाएँ।");}else status("दूसरे पेज पर Audio Pause नहीं हुआ।",true);}
   catch(e){status("पेज बदलने पर Audio Pause विफल: "+errorMessage(e),true);}}updateControls();}
 function onShow(){state.visible=true;updateSource();if(state.pausedByNavigation)status("Player फिर खुला है। Audio जारी करने के लिए Resume दबाएँ।");updateControls();}
 function getState(){const ac=state.audioContext;return Object.freeze({version:PLAYER_VERSION,streamOpen:state.streamOpen,streamEnded:state.streamEnded,paused:state.paused,pausedByNavigation:state.pausedByNavigation,
  completed:state.completed,chunksScheduled:state.chunksScheduled,pendingChunks:state.pendingSources.size,sampleRate:state.sampleRate,channelCount:state.channelCount,volume:state.volume,
  audioContextState:ac?ac.state:"uninitialized",queuedSeconds:ac&&ac.state!=="closed"?Math.max(0,state.scheduledUntil-ac.currentTime):0});}
 function onPlay(){void startPcmStream().catch(()=>{});}async function onPause(){await pause();}async function onResume(){await resume();}function onStop(){void stopPcmStream();}
 function onVolumeInput(){const v=Number(ui.volume.value);if(!Number.isFinite(v))return;state.volume=Math.max(0,Math.min(1,v));updateVolume();updateControls();}
 async function unmount(){if(state.destroyed)return;state.destroyed=true;
  for(const [el,type,fn] of [[ui.play,"click",onPlay],[ui.pause,"click",onPause],[ui.resume,"click",onResume],[ui.stop,"click",onStop],[ui.volume,"input",onVolumeInput]])if(el)el.removeEventListener(type,fn);
  if(typeof state.hostUnsubscribe==="function"){try{state.hostUnsubscribe();}catch(_){}state.hostUnsubscribe=null;}stopInternal(false);
  const ac=state.audioContext;state.audioContext=null;state.gainNode=null;if(ac){if(state.audioStateListener){if(typeof ac.removeEventListener==="function")ac.removeEventListener("statechange",state.audioStateListener);else if(ac.onstatechange===state.audioStateListener)ac.onstatechange=null;}
   if(ac.state!=="closed"&&typeof ac.close==="function"){try{await ac.close();}catch(_){}}}
  if(playerControllers.get(root)===controller)playerControllers.delete(root);if(playerInstances.get(root)===lifecycle)playerInstances.delete(root);if(typeof root.replaceChildren==="function")root.replaceChildren();}
 const panel=makeNode(doc,"section","panel music-player-panel");panel.setAttribute("aria-label","Speech-to-Singing Music Player");
 const heading=makeNode(doc,"h2","","♫ गायन Music Player"),intro=makeNode(doc,"p","subtle","यह स्वतंत्र Local PCM Player है। यह Audio Playback करता है; गायन बनाने वाला PCM Producer अलग मॉड्यूल से जुड़ेगा。");
 const label=makeNode(doc,"strong","","TTS पाठ");ui.textPreview=makeNode(doc,"pre","note music-player-text","");ui.voiceInfo=makeNode(doc,"p","subtle","");ui.phase=makeNode(doc,"p","subtle","PCM Stream: तैयार नहीं");
 const actions=makeNode(doc,"div","tts-actions");ui.play=makeNode(doc,"button","btn primary","▶ PCM Stream तैयार करें");ui.play.type="button";ui.play.addEventListener("click",onPlay);
 ui.pause=makeNode(doc,"button","btn","Ⅱ Pause");ui.pause.type="button";ui.pause.addEventListener("click",onPause);ui.resume=makeNode(doc,"button","btn","▶ Resume");ui.resume.type="button";ui.resume.addEventListener("click",onResume);
 ui.stop=makeNode(doc,"button","btn danger","■ Stop");ui.stop.type="button";ui.stop.addEventListener("click",onStop);actions.append(ui.play,ui.pause,ui.resume,ui.stop);
 const vl=makeNode(doc,"label","field"),vt=makeNode(doc,"span","","ऑडियो वॉल्यूम");ui.volume=makeNode(doc,"input");ui.volume.type="range";ui.volume.min="0";ui.volume.max="1";ui.volume.step="0.05";ui.volume.value=String(state.volume);ui.volume.setAttribute("aria-label","Music Player volume");ui.volume.addEventListener("input",onVolumeInput);vl.append(vt,ui.volume);
 ui.status=makeNode(doc,"div","status",state.statusText);ui.status.setAttribute("role","status");ui.status.setAttribute("aria-live","polite");
 const note=makeNode(doc,"p","note","सामान्य Browser SpeechSynthesis से PCM samples उपलब्ध नहीं होते। Player PCM chunks चलाने के लिए तैयार है; स्थानीय Singing Synthesis और PCM Producer अलग से आवश्यक हैं。");
 panel.append(heading,intro,label,ui.textPreview,ui.voiceInfo,ui.phase,actions,vl,ui.status,note);root.appendChild(panel);updateSource();updateControls();
 controller=Object.freeze({prepareAudio:ensureAudioContext,startStream,enqueuePcmChunk,finishStream,pause,resume,stop:()=>stopInternal(true),
  setVolume(value){const v=Number(value);if(!Number.isFinite(v))throw new TypeError("Volume एक सीमित संख्या होना चाहिए।");state.volume=Math.max(0,Math.min(1,v));if(ui.volume)ui.volume.value=String(state.volume);updateVolume();return state.volume;},getState});
 lifecycle=Object.freeze({onShow,onHide,unmount});playerControllers.set(root,controller);playerInstances.set(root,lifecycle);
 if(typeof context.subscribe==="function"){try{const un=context.subscribe(()=>{if(!state.destroyed){updateSource();updateControls();}});if(typeof un==="function")state.hostUnsubscribe=un;}catch(e){status("TTS Host अपडेट सुनने में समस्या: "+errorMessage(e),true);}}
 status("Music Player UI तैयार है। Play से PCM Stream Processor शुरू होगा; गायन Producer से Audio chunks मिलेंगे।");return lifecycle;
}

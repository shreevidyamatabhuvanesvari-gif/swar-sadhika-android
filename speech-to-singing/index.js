/* Swar-Sadhika Speech-to-Singing — integration orchestrator (0.2.0).
 * Connects the isolated Player to the bounded PCM Stream Processor.
 * This module transports PCM; it does not synthesize speech or singing.
 */
const MODULE_ID="speech-to-singing",MODULE_VERSION="0.2.0";
const HOST_CONTRACT_VERSION=2,PLAYER_CONTRACT_VERSION=1;
const MODULE_DIRECTORY="speech-to-singing/",PLAYER_ENTRY_FILE="player.js",PROCESSOR_ENTRY_FILE="stream-processor.js";
const mountedInstances=new WeakMap(),pendingMounts=new WeakMap();

function getErrorMessage(error){return error&&typeof error.message==="string"&&error.message.trim()?error.message.trim():"अज्ञात त्रुटि";}
function makeError(message,name="Error"){const error=new Error(String(message));error.name=name;return error;}
function reportStatus(context,message,warning=false){
 try{context.setStatus(String(message),Boolean(warning));}
 catch(error){try{const log=context.window&&context.window.console;if(log&&typeof log.warn==="function")log.warn("[Swar-Sadhika] Music Player status callback failed",error);}catch(_){}}
}
function validateHostContext(context){
 if(!context||typeof context!=="object")throw new TypeError("Music Player को Host Context object आवश्यक है।");
 const required=["getText","getSelectedVoice","getSpeechSettings","analyzeText","prepareSpeech","getPronunciationKnowledgeBaseInfo","isPronunciationReady","subscribe","setStatus"];
 const missing=required.filter(name=>typeof context[name]!=="function");
 if(missing.length)throw new TypeError("Host Contract v2 में आवश्यक functions अनुपस्थित हैं: "+missing.join(", "));
 if(context.hostContractVersion!==HOST_CONTRACT_VERSION)throw new TypeError("Music Player Host Contract v2 आवश्यक है।");
 const doc=context.document,win=context.window,root=context.root;
 if(!doc||doc.nodeType!==9||typeof doc.createElement!=="function")throw new TypeError("वैध Document आवश्यक है।");
 if(!win||win.document!==doc||typeof win.URL!=="function"||!win.location||typeof win.location.origin!=="string"||!win.location.origin)throw new TypeError("वैध Browser Window, URL API और origin आवश्यक हैं।");
 if(typeof win.setTimeout!=="function"||typeof win.clearTimeout!=="function")throw new TypeError("Window timer APIs उपलब्ध नहीं हैं।");
 if(!root||root.nodeType!==1||typeof root.appendChild!=="function")throw new TypeError("वैध HTMLElement mount container आवश्यक है।");
 if(root.ownerDocument&&root.ownerDocument!==doc)throw new TypeError("Mount container host Document से संबंधित नहीं है।");
 if(doc.defaultView&&doc.defaultView!==win)throw new TypeError("Host Window और Document मेल नहीं खाते।");
 if(typeof doc.baseURI!=="string"||!doc.baseURI)throw new TypeError("document.baseURI उपलब्ध नहीं है।");
 return Object.freeze({root,document:doc,window:win,hostContractVersion:HOST_CONTRACT_VERSION,
  getText:context.getText,getSelectedVoice:context.getSelectedVoice,getSpeechSettings:context.getSpeechSettings,
  analyzeText:context.analyzeText,prepareSpeech:context.prepareSpeech,
  getPronunciationKnowledgeBaseInfo:context.getPronunciationKnowledgeBaseInfo,
  isPronunciationReady:context.isPronunciationReady,subscribe:context.subscribe,setStatus:context.setStatus});
}
function resolveModuleUrl(host,fileName){
 if(fileName!==PLAYER_ENTRY_FILE&&fileName!==PROCESSOR_ENTRY_FILE)throw new TypeError("अमान्य Music Player module filename।");
 const directory=new host.window.URL(MODULE_DIRECTORY,host.document.baseURI);
 const url=new host.window.URL(fileName,directory);
 if(directory.origin!==host.window.location.origin||url.origin!==host.window.location.origin||
    url.pathname!==directory.pathname+fileName||url.search||url.hash)throw new TypeError("Music Player modules केवल उसी origin के speech-to-singing folder से लोड होंगे।");
 return url;
}
function validateController(controller){
 if(!controller||typeof controller!=="object")throw new TypeError("Player Controller उपलब्ध नहीं है।");
 const required=["prepareAudio","startStream","enqueuePcmChunk","finishStream","pause","resume","stop","getState"];
 const missing=required.filter(name=>typeof controller[name]!=="function");
 if(missing.length)throw new TypeError("Player Controller API अनुपस्थित है: "+missing.join(", "));
}
function createPlayerContext(host,runtime){
 const getProcessor=()=>{if(!runtime.processor||runtime.disposed)throw makeError("PCM Stream Processor अभी तैयार नहीं है।","ProcessorNotReadyError");return runtime.processor;};
 return Object.freeze({
  root:host.root,document:host.document,window:host.window,hostContractVersion:HOST_CONTRACT_VERSION,
  getText:()=>{const value=host.getText();return value==null?"":String(value);},
  getSelectedVoice:()=>{const value=host.getSelectedVoice();return value&&typeof value==="object"?value:null;},
  getSpeechSettings:()=>{const value=host.getSpeechSettings();return value&&typeof value==="object"?value:Object.freeze({});},
  analyzeText:text=>host.analyzeText(text==null?host.getText():String(text)),
  prepareSpeech:text=>host.prepareSpeech(text==null?host.getText():String(text)),
  getPronunciationKnowledgeBaseInfo:()=>host.getPronunciationKnowledgeBaseInfo(),
  isPronunciationReady:()=>Boolean(host.isPronunciationReady()),
  subscribe:listener=>host.subscribe(listener),
  setStatus:(message,warning=false)=>reportStatus(host,message,warning),
  getPlayerController:()=>runtime.controller,getStreamProcessor:()=>runtime.processor,
  startPcmStream:options=>getProcessor().start(options),
  pushPcmChunk:(samples,options)=>getProcessor().pushChunk(samples,options),
  endPcmStream:()=>getProcessor().end(),
  stopPcmStream:reason=>getProcessor().stop(reason),
  getPcmStreamState:()=>getProcessor().getState(),
  module:Object.freeze({id:MODULE_ID,version:MODULE_VERSION,contractVersion:PLAYER_CONTRACT_VERSION,hostContractVersion:HOST_CONTRACT_VERSION})
 });
}
async function cleanupPlayer(mounted,host){
 const cleanup=typeof mounted==="function"?mounted:(mounted&&typeof mounted.unmount==="function"?mounted.unmount.bind(mounted):null);
 if(!cleanup)return;
 try{await cleanup();}catch(error){try{const log=host.window&&host.window.console;if(log&&typeof log.error==="function")log.error("[Swar-Sadhika] Player cleanup failed",error);}catch(_){}}
}
function createLifecycleAdapter(mounted,root,runtime){
 const target=typeof mounted==="function"?{unmount:mounted}:mounted;
 if(!target||typeof target!=="object")throw new TypeError("player.js का mount(context) lifecycle object या cleanup function लौटाए।");
 const hooks=Object.create(null);
 ["onShow","onHide","unmount"].forEach(name=>{const hook=target[name];if(hook!=null&&typeof hook!=="function")throw new TypeError("Player lifecycle hook "+name+" function होना चाहिए।");hooks[name]=typeof hook==="function"?hook:null;});
 let disposed=false,visible=true,disposePromise=null;
 const invoke=async name=>{if(!disposed&&hooks[name])await hooks[name]();};
 const adapter={
  async onShow(){if(disposed||visible)return;visible=true;await invoke("onShow");},
  async onHide(){if(disposed||!visible)return;visible=false;await invoke("onHide");},
  getPlayerController(){return disposed?null:runtime.controller;},
  getStreamProcessor(){return disposed?null:runtime.processor;},
  startPcmStream(options){return disposed||!runtime.processor?Promise.reject(makeError("PCM Processor तैयार नहीं है।","ProcessorNotReadyError")):runtime.processor.start(options);},
  pushPcmChunk(samples,options){return disposed||!runtime.processor?Promise.reject(makeError("PCM Processor तैयार नहीं है।","ProcessorNotReadyError")):runtime.processor.pushChunk(samples,options);},
  endPcmStream(){return disposed||!runtime.processor?Promise.reject(makeError("PCM Processor तैयार नहीं है।","ProcessorNotReadyError")):runtime.processor.end();},
  stopPcmStream(reason){return disposed||!runtime.processor?false:runtime.processor.stop(reason);},
  getPcmStreamState(){return runtime.processor?runtime.processor.getState():null;},
  unmount(){
   if(disposePromise)return disposePromise;
   disposed=true;runtime.disposed=true;
   disposePromise=Promise.resolve().then(async()=>{
    if(runtime.processor){try{runtime.processor.dispose();}catch(error){reportStatus(runtime.host,"PCM Processor cleanup त्रुटि: "+getErrorMessage(error),true);}runtime.processor=null;}
    if(hooks.unmount)await hooks.unmount();
   }).finally(()=>{if(mountedInstances.get(root)===adapter)mountedInstances.delete(root);});
   return disposePromise;
  }
 };
 return Object.freeze(adapter);
}
async function initializePlayer(host){
 reportStatus(host,"Music Player और PCM transport modules लोड किए जा रहे हैं…");
 const runtime={host,controller:null,processor:null,disposed:false};let mounted=null;
 try{
  const playerUrl=resolveModuleUrl(host,PLAYER_ENTRY_FILE),processorUrl=resolveModuleUrl(host,PROCESSOR_ENTRY_FILE);
  const [playerModule,processorModule]=await Promise.all([import(playerUrl.href),import(processorUrl.href)]);
  if(!playerModule||typeof playerModule.mount!=="function"||typeof playerModule.getPlayerController!=="function")throw new TypeError("player.js में mount(context) और getPlayerController(root) exports आवश्यक हैं।");
  if(!processorModule||typeof processorModule.createStreamProcessor!=="function")throw new TypeError("stream-processor.js में createStreamProcessor(options) export आवश्यक है।");
  reportStatus(host,"Music Player UI माउंट किया जा रहा है…");
  mounted=await playerModule.mount(createPlayerContext(host,runtime));
  if(runtime.disposed){await cleanupPlayer(mounted,host);throw makeError("Initialization के दौरान Music Player बंद किया गया।","AbortError");}
  runtime.controller=playerModule.getPlayerController(host.root);validateController(runtime.controller);
  runtime.processor=processorModule.createStreamProcessor({player:runtime.controller,
   onStatus:(message,warning=false)=>reportStatus(host,message,warning),
   setTimeout:host.window.setTimeout.bind(host.window),clearTimeout:host.window.clearTimeout.bind(host.window)});
  if(!runtime.processor||!["start","pushChunk","end","stop","dispose","getState"].every(name=>typeof runtime.processor[name]==="function"))throw new TypeError("Stream Processor का PCM transport API अधूरा है।");
  const instance=createLifecycleAdapter(mounted,host.root,runtime);
  mountedInstances.set(host.root,instance);
  reportStatus(host,"Music Player UI और PCM transport जुड़ गए हैं। वास्तविक गायन के लिए PCM Producer अभी जोड़ना आवश्यक है।");
  return instance;
 }catch(error){
  runtime.disposed=true;if(runtime.processor){try{runtime.processor.dispose();}catch(_){}runtime.processor=null;}
  await cleanupPlayer(mounted,host);
  const message="Music Player अभी initialize नहीं हो सका: "+getErrorMessage(error)+" सामान्य TTS स्वतंत्र और सुरक्षित है।";
  reportStatus(host,message,true);throw makeError(message,"MusicPlayerInitializationError");
 }
}
export async function mount(context){
 const host=validateHostContext(context),root=host.root;
 const existing=mountedInstances.get(root);if(existing)return existing;
 const pending=pendingMounts.get(root);if(pending)return pending;
 const task=initializePlayer(host);pendingMounts.set(root,task);
 try{return await task;}finally{if(pendingMounts.get(root)===task)pendingMounts.delete(root);}
}

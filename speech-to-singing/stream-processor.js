/* Swar-Sadhika Speech-to-Singing — bounded PCM stream processor (0.2.0).
 * This module transports local PCM audio only; it does not synthesize speech or singing.
 */
const PROCESSOR_VERSION="0.2.0";
const DEFAULT_SAMPLE_RATE=48000,DEFAULT_CHANNEL_COUNT=1,DEFAULT_MAX_PENDING_SECONDS=8;
const DEFAULT_MAX_SCHEDULED_SECONDS=10.5,DEFAULT_POLL_INTERVAL_MS=35;
const MIN_SAMPLE_RATE=8000,MAX_SAMPLE_RATE=96000,MAX_CHANNEL_COUNT=2,MAX_CHUNK_SECONDS=5;
const PLAYER_QUEUE_LIMIT_SECONDS=12,MAX_PENDING_CHUNKS=512;
const objectTag=value=>Object.prototype.toString.call(value);
function makeError(message,name="Error",code=name){const error=new Error(String(message));error.name=name;error.code=code;return error;}
function isObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function toNumber(value,fallback,label){const number=value==null?fallback:Number(value);if(!Number.isFinite(number))throw new TypeError(label+" एक सीमित संख्या होनी चाहिए।");return number;}
function validatePlayer(player){
 if(!isObject(player))throw new TypeError("Stream Processor को Player controller object आवश्यक है।");
 const required=["prepareAudio","startStream","enqueuePcmChunk","finishStream","stop","getState"];
 const missing=required.filter(name=>typeof player[name]!=="function");
 if(missing.length)throw new TypeError("Player controller में आवश्यक functions अनुपस्थित हैं: "+missing.join(", "));
}
function normalizeOptions(options={}){
 if(!isObject(options))throw new TypeError("Stream Processor options एक object होना चाहिए।");
 const sampleRate=toNumber(options.sampleRate,DEFAULT_SAMPLE_RATE,"sampleRate");
 const channelCount=toNumber(options.channelCount,DEFAULT_CHANNEL_COUNT,"channelCount");
 const maxPendingSeconds=toNumber(options.maxPendingSeconds,DEFAULT_MAX_PENDING_SECONDS,"maxPendingSeconds");
 const maxScheduledSeconds=toNumber(options.maxScheduledSeconds,DEFAULT_MAX_SCHEDULED_SECONDS,"maxScheduledSeconds");
 const pollIntervalMs=toNumber(options.pollIntervalMs,DEFAULT_POLL_INTERVAL_MS,"pollIntervalMs");
 if(sampleRate<MIN_SAMPLE_RATE||sampleRate>MAX_SAMPLE_RATE)throw new RangeError("sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
 if(!Number.isInteger(channelCount)||channelCount<1||channelCount>MAX_CHANNEL_COUNT)throw new RangeError("channelCount केवल 1 या 2 हो सकता है।");
 if(maxPendingSeconds<=0||maxPendingSeconds>10)throw new RangeError("maxPendingSeconds शून्य से अधिक और अधिकतम 10 होना चाहिए।");
 if(maxScheduledSeconds<=0||maxScheduledSeconds>PLAYER_QUEUE_LIMIT_SECONDS-0.5)throw new RangeError("maxScheduledSeconds शून्य से अधिक और Player की 12 सेकंड सीमा से कम होना चाहिए।");
 if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<10||pollIntervalMs>250)throw new RangeError("pollIntervalMs 10 से 250 मिलीसेकंड के बीच होना चाहिए।");
 if(options.setTimeout!=null&&typeof options.setTimeout!=="function")throw new TypeError("setTimeout एक function होना चाहिए।");
 if(options.clearTimeout!=null&&typeof options.clearTimeout!=="function")throw new TypeError("clearTimeout एक function होना चाहिए।");
 return Object.freeze({sampleRate,channelCount,maxPendingSeconds,maxScheduledSeconds,pollIntervalMs});
}
function copyAndValidatePcm(samples,options,session){
 if(!isObject(options))throw new TypeError("PCM chunk options एक object होना चाहिए।");
 const requestedRate=toNumber(options.sampleRate,session.sampleRate,"PCM sampleRate");
 const requestedChannels=toNumber(options.channelCount,session.channelCount,"PCM channelCount");
 if(requestedRate!==session.sampleRate)throw new RangeError("PCM chunk का sampleRate सक्रिय Stream से मेल खाना चाहिए।");
 if(requestedChannels!==session.channelCount)throw new RangeError("PCM chunk का channelCount सक्रिय Stream से मेल खाना चाहिए।");
 let data,format;const tag=objectTag(samples);
 try{
  if(tag==="[object Float32Array]"){format=options.format==null?"float32":options.format;if(format!=="float32")throw new TypeError("Float32Array के लिए format float32 होना चाहिए।");data=Float32Array.from(samples);}
  else if(tag==="[object Int16Array]"){format=options.format==null?"int16":options.format;if(format!=="int16")throw new TypeError("Int16Array के लिए format int16 होना चाहिए।");data=Int16Array.from(samples);}
  else if(tag==="[object ArrayBuffer]"){
   format=options.format==null?"int16":options.format;
   if(format==="float32"){if(samples.byteLength%4!==0)throw new RangeError("Float32 PCM byteLength चार से विभाज्य होना चाहिए।");data=new Float32Array(samples.slice(0));}
   else if(format==="int16"){if(samples.byteLength%2!==0)throw new RangeError("Int16 PCM byteLength दो से विभाज्य होना चाहिए।");data=new Int16Array(samples.slice(0));}
   else throw new TypeError("ArrayBuffer के लिए format float32 या int16 होना चाहिए।");
  }else throw new TypeError("PCM chunk केवल Float32Array, Int16Array या ArrayBuffer होना चाहिए।");
 }catch(error){if(error instanceof TypeError||error instanceof RangeError)throw error;throw new TypeError("PCM chunk की प्रतिलिपि नहीं बनाई जा सकी: "+(error&&error.message?error.message:"अमान्य Buffer"));}
 if(!data.length||data.length%session.channelCount!==0)throw new RangeError("PCM chunk में कम-से-कम एक पूर्ण audio frame होना चाहिए।");
 const frames=data.length/session.channelCount,durationSeconds=frames/session.sampleRate;
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>MAX_CHUNK_SECONDS)throw new RangeError("PCM chunk की अवधि शून्य से अधिक और अधिकतम पाँच सेकंड होनी चाहिए।");
 return Object.freeze({data,format,sampleRate:session.sampleRate,channelCount:session.channelCount,frames,durationSeconds});
}

/** Call start() from a user-initiated Play handler to unlock browser audio. */
export function createStreamProcessor(options={}){
 const player=options&&options.player;validatePlayer(player);const settings=normalizeOptions(options);
 const onStatus=typeof options.onStatus==="function"?options.onStatus:null;
 const setTimer=options.setTimeout||setTimeout,clearTimer=options.clearTimeout||clearTimeout;
 let phase="idle",session=null,pendingQueue=[],pendingSeconds=0,scheduledChunks=0,timerId=null;
 let endPromise=null,endResolve=null,endReject=null,disposed=false,pumpActive=false,startInFlight=false,operationGeneration=0,timerGeneration=0;
 function publishStatus(message,warning=false){if(!onStatus)return;try{onStatus(String(message),Boolean(warning));}catch(_){}}
 function clearPumpTimer(){timerGeneration+=1;if(timerId===null)return;const handle=timerId;timerId=null;try{clearTimer(handle);}catch(error){publishStatus("PCM queue timer साफ नहीं हो सका: "+(error.message||"अज्ञात त्रुटि"),true);}}
 function rejectPending(error){const queued=pendingQueue;pendingQueue=[];pendingSeconds=0;for(const item of queued)item.reject(error);}
 function safePlayerStop(){try{player.stop();}catch(error){publishStatus("Player Stop के समय त्रुटि: "+(error&&error.message?error.message:"अज्ञात त्रुटि"),true);}}
 function settleEnd(error,value){const resolve=endResolve,reject=endReject;endResolve=null;endReject=null;endPromise=null;if(error){if(reject)reject(error);}else if(resolve)resolve(value);}
 function failStream(error){
  if(disposed||phase==="failed"||phase==="stopped"||phase==="disposed")return;
  const failure=error instanceof Error?error:makeError(error&&error.message?error.message:"PCM Stream विफल हुआ।");
  phase="failed";operationGeneration+=1;session=null;clearPumpTimer();rejectPending(failure);safePlayerStop();
  settleEnd(failure);publishStatus(failure.message||"PCM stream में त्रुटि हुई।",true);
 }
 function schedulePump(){
  if(disposed||timerId!==null||["idle","starting","stopped","completed","failed","disposed"].includes(phase))return;
  try{
   const token=++timerGeneration;
   const handle=setTimer(()=>{if(token!==timerGeneration)return;timerId=null;pump();},settings.pollIntervalMs);
   if(handle==null)throw makeError("PCM queue timer ने वैध handle नहीं लौटाया।","TimerError");
   timerId=handle;
  }catch(error){failStream(makeError("PCM queue timer शुरू नहीं हो सका: "+(error&&error.message?error.message:"अज्ञात त्रुटि"),"TimerError"));}
 }
 function readPlayerState(){
  const state=player.getState();
  if(!isObject(state))throw makeError("Player ने अमान्य Stream स्थिति लौटाई।","PlayerStateError");
  if(state.streamOpen!==true||state.streamEnded!==false)throw makeError("Player stream बंद है; PCM chunk भेजना रोका गया।","PlayerStreamClosedError");
  if(typeof state.paused!=="boolean"||typeof state.audioContextState!=="string")throw makeError("Player ने अधूरी AudioContext/Paused स्थिति लौटाई।","PlayerStateError");
  if(!["running","suspended","interrupted"].includes(state.audioContextState))throw makeError("Player AudioContext सक्रिय या पुनः शुरू करने योग्य स्थिति में नहीं है: "+state.audioContextState,"PlayerAudioContextError");
  const queued=Number(state.queuedSeconds);
  if(!Number.isFinite(queued)||queued<0)throw makeError("Player ने अमान्य queuedSeconds स्थिति दी।","PlayerStateError");
  return {raw:state,queued};
 }
 function completeIfDrained(){
  if(phase!=="ending"||pendingQueue.length!==0)return;
  try{
   if(player.finishStream()===false)throw makeError("Player ने सक्रिय PCM stream समाप्त करने से मना किया।","PlayerFinishError");
   phase="completed";publishStatus("PCM stream पूरा Player तक पहुँच गया है।");settleEnd(null,getState());
  }catch(error){failStream(error);}
 }
 function pump(){
  if(disposed||pumpActive||["idle","starting","stopped","completed","failed","disposed"].includes(phase))return;
  pumpActive=true;
  try{
   while(pendingQueue.length){
    let playerState;try{playerState=readPlayerState();}catch(error){failStream(error);return;}
    if(playerState.raw.paused===true||playerState.raw.audioContextState!=="running"){schedulePump();return;}
    const item=pendingQueue[0];
    if(playerState.queued+item.durationSeconds>settings.maxScheduledSeconds){schedulePump();return;}
    try{
     const result=player.enqueuePcmChunk(item.data,{format:item.format,sampleRate:item.sampleRate,channelCount:item.channelCount});
     if(!isObject(result)||Number(result.frames)!==item.frames||!Number.isFinite(Number(result.durationSeconds))||Math.abs(Number(result.durationSeconds)-item.durationSeconds)>1e-9||!Number.isFinite(Number(result.scheduledAt))||!Number.isFinite(Number(result.queuedSeconds)))throw makeError("Player ने PCM chunk की वैध scheduling पुष्टि नहीं की।","PlayerEnqueueError");
     pendingQueue.shift();pendingSeconds=Math.max(0,pendingSeconds-item.durationSeconds);scheduledChunks+=1;item.resolve(result);
    }catch(error){
     let latest;try{latest=readPlayerState();}catch(stateError){failStream(stateError);return;}
     const queueFull=error&&error.name==="RangeError"&&latest.queued+item.durationSeconds>settings.maxScheduledSeconds;
     if(queueFull){schedulePump();return;}
     failStream(makeError("PCM chunk Player तक नहीं पहुँच सका; Stream को आंशिक/टूटी आवाज़ से बचाने के लिए रोका गया: "+(error&&error.message?error.message:"अज्ञात त्रुटि"),"PlayerEnqueueError"));return;
    }
   }
   completeIfDrained();
  }catch(error){failStream(error);}
  finally{pumpActive=false;}
 }
 async function start(startOptions={}){
  if(disposed)throw makeError("Stream Processor dispose हो चुका है।","DisposedError");
  if(startInFlight||phase==="starting"||phase==="streaming"||phase==="ending")throw makeError("एक PCM Stream पहले से शुरू या सक्रिय है।","StreamAlreadyActiveError");
  if(!isObject(startOptions))throw new TypeError("start() options एक object होना चाहिए।");
  const sampleRate=toNumber(startOptions.sampleRate,settings.sampleRate,"start sampleRate");
  const channelCount=toNumber(startOptions.channelCount,settings.channelCount,"start channelCount");
  const initialBufferMs=toNumber(startOptions.initialBufferMs,80,"initialBufferMs");
  if(sampleRate<MIN_SAMPLE_RATE||sampleRate>MAX_SAMPLE_RATE)throw new RangeError("Start sampleRate 8000 से 96000 Hz के बीच होना चाहिए。");
  if(!Number.isInteger(channelCount)||channelCount<1||channelCount>MAX_CHANNEL_COUNT)throw new RangeError("Start channelCount केवल 1 या 2 हो सकता है।");
  if(initialBufferMs<0||initialBufferMs>500)throw new RangeError("initialBufferMs 0 से 500 मिलीसेकंड के बीच होना चाहिए।");
  clearPumpTimer();rejectPending(makeError("नया PCM Stream शुरू हुआ।","AbortError"));settleEnd(makeError("पुराना PCM Stream बदल दिया गया।","AbortError"));
  const token=++operationGeneration;phase="starting";session=null;scheduledChunks=0;startInFlight=true;
  const current=()=>!disposed&&token===operationGeneration&&phase==="starting";
  try{
   await player.prepareAudio();
   if(!current())throw makeError("PCM Stream शुरू होने से पहले रोक दिया गया।","AbortError");
   await player.startStream({sampleRate,channelCount,initialBufferMs});
   if(!current()){safePlayerStop();throw makeError("PCM Stream शुरू होते समय रोक दिया गया।","AbortError");}
   const ps=player.getState();
   if(!isObject(ps)||ps.streamOpen!==true||ps.streamEnded===true||ps.audioContextState!=="running"||ps.sampleRate!==sampleRate||ps.channelCount!==channelCount)throw makeError("Player ने अपेक्षित Audio Stream configuration सक्रिय नहीं की।","PlayerStartError");
   session=Object.freeze({sampleRate,channelCount});phase="streaming";
   publishStatus("PCM stream तैयार है। पहले उपयोगी audio chunk की प्रतीक्षा है।");return getState();
  }catch(error){
   if(!current()){safePlayerStop();throw error;}
   phase="failed";session=null;safePlayerStop();publishStatus("PCM Stream शुरू नहीं हो सका: "+(error&&error.message?error.message:"अज्ञात त्रुटि"),true);throw error;
  }finally{startInFlight=false;}
 }
 /** Resolves when this PCM chunk is handed to the Player queue, not when speakers finish playing it. */
 function pushChunk(samples,chunkOptions={}){
  if(disposed)return Promise.reject(makeError("Stream Processor dispose हो चुका है。","DisposedError"));
  if(phase!=="streaming"||!session)return Promise.reject(makeError("PCM chunk भेजने से पहले start() सफल होना चाहिए।","StreamNotReadyError"));
  if(pendingQueue.length>=MAX_PENDING_CHUNKS)return Promise.reject(makeError("PCM अस्थायी Queue में अधिकतम chunk सीमा पूरी है; Producer को प्रतीक्षा करनी चाहिए।","BackpressureError"));
  let pcm;try{pcm=copyAndValidatePcm(samples,chunkOptions,session);}catch(error){return Promise.reject(error);}
  if(pcm.durationSeconds>settings.maxPendingSeconds||pcm.durationSeconds>settings.maxScheduledSeconds)return Promise.reject(makeError("PCM chunk की अवधि Processor की configured buffer सीमा से अधिक है।","ChunkLimitError"));
  if(pendingSeconds+pcm.durationSeconds>settings.maxPendingSeconds+Number.EPSILON)return Promise.reject(makeError("अस्थायी PCM buffer भर गया है; वर्तमान chunk पूरा होने तक प्रतीक्षा करें।","BackpressureError"));
  return new Promise((resolve,reject)=>{
   pendingQueue.push({data:pcm.data,format:pcm.format,sampleRate:pcm.sampleRate,channelCount:pcm.channelCount,frames:pcm.frames,durationSeconds:pcm.durationSeconds,resolve,reject});
   pendingSeconds+=pcm.durationSeconds;pump();
  });
 }
 /** Resolves after all pending chunks are handed to Player and finishStream() succeeds. */
 function end(){
  if(disposed)return Promise.reject(makeError("Stream Processor dispose हो चुका है।","DisposedError"));
  if(phase==="completed")return Promise.resolve(getState());
  if(phase==="ending"&&endPromise)return endPromise;
  if(phase!=="streaming")return Promise.reject(makeError("समाप्त करने के लिए कोई सक्रिय PCM stream नहीं है।","StreamNotReadyError"));
  phase="ending";const promise=new Promise((resolve,reject)=>{endResolve=resolve;endReject=reject;});endPromise=promise;pump();return promise;
 }
 function stop(reason="PCM stream रोक दिया गया।"){
  if(disposed||phase==="disposed"||phase==="stopped")return false;
  operationGeneration+=1;clearPumpTimer();const error=makeError(String(reason),"AbortError");rejectPending(error);
  session=null;phase="stopped";safePlayerStop();settleEnd(error);publishStatus(String(reason));return true;
 }
 function dispose(){if(disposed)return;stop("PCM stream processor dispose किया गया।");disposed=true;operationGeneration+=1;clearPumpTimer();rejectPending(makeError("Stream Processor dispose हो चुका है।","DisposedError"));session=null;phase="disposed";settleEnd(makeError("Stream Processor dispose हो चुका है।","DisposedError"));}
 function getState(){return Object.freeze({version:PROCESSOR_VERSION,phase,sampleRate:session?session.sampleRate:settings.sampleRate,channelCount:session?session.channelCount:settings.channelCount,pendingChunks:pendingQueue.length,pendingSeconds,scheduledChunks,maxPendingChunks:MAX_PENDING_CHUNKS,maxPendingSeconds:settings.maxPendingSeconds,maxScheduledSeconds:settings.maxScheduledSeconds,pollIntervalMs:settings.pollIntervalMs,disposed});}
 return Object.freeze({start,pushChunk,end,stop,dispose,getState});
}
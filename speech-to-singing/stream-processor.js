/* Swar-Sadhika Speech-to-Singing — bounded PCM stream processor.
 * Accepts PCM chunks from a future local/native audio producer and forwards
 * them to the existing Player controller with bounded buffering/backpressure.
 * It does not synthesize audio or use SpeechSynthesis as a PCM source.
 */
const PROCESSOR_VERSION="0.1.0";
const DEFAULT_SAMPLE_RATE=48000,DEFAULT_CHANNEL_COUNT=1,DEFAULT_MAX_PENDING_SECONDS=8;
const DEFAULT_MAX_SCHEDULED_SECONDS=10.5,DEFAULT_POLL_INTERVAL_MS=35;
const MAX_SAMPLE_RATE=96000,MIN_SAMPLE_RATE=8000,MAX_CHANNEL_COUNT=2,MAX_CHUNK_SECONDS=5,PLAYER_QUEUE_LIMIT_SECONDS=12;
function makeError(message,name="Error"){const error=new Error(message);error.name=name;return error;}
function validatePlayer(player){
 if(!player||typeof player!=="object")throw new TypeError("Stream Processor को Player controller object आवश्यक है।");
 const required=["prepareAudio","startStream","enqueuePcmChunk","finishStream","stop","getState"];
 const missing=required.filter(name=>typeof player[name]!=="function");
 if(missing.length)throw new TypeError("Player controller में आवश्यक functions अनुपस्थित हैं: "+missing.join(", "));
}
function normalizeOptions(options={}){
 if(!options||typeof options!=="object")throw new TypeError("Stream Processor options object होना चाहिए।");
 const sampleRate=options.sampleRate==null?DEFAULT_SAMPLE_RATE:Number(options.sampleRate);
 const channelCount=options.channelCount==null?DEFAULT_CHANNEL_COUNT:Number(options.channelCount);
 const maxPendingSeconds=options.maxPendingSeconds==null?DEFAULT_MAX_PENDING_SECONDS:Number(options.maxPendingSeconds);
 const maxScheduledSeconds=options.maxScheduledSeconds==null?DEFAULT_MAX_SCHEDULED_SECONDS:Number(options.maxScheduledSeconds);
 const pollIntervalMs=options.pollIntervalMs==null?DEFAULT_POLL_INTERVAL_MS:Number(options.pollIntervalMs);
 if(!Number.isFinite(sampleRate)||sampleRate<MIN_SAMPLE_RATE||sampleRate>MAX_SAMPLE_RATE)throw new RangeError("Stream sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
 if(!Number.isInteger(channelCount)||channelCount<1||channelCount>MAX_CHANNEL_COUNT)throw new RangeError("Stream channelCount केवल 1 या 2 हो सकता है।");
 if(!Number.isFinite(maxPendingSeconds)||maxPendingSeconds<=0||maxPendingSeconds>10)throw new RangeError("maxPendingSeconds शून्य से अधिक और अधिकतम 10 होना चाहिए।");
 if(!Number.isFinite(maxScheduledSeconds)||maxScheduledSeconds<=0||maxScheduledSeconds>PLAYER_QUEUE_LIMIT_SECONDS-0.5)throw new RangeError("maxScheduledSeconds 0 से अधिक और Player की 12 सेकंड सीमा से कम होना चाहिए।");
 if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<10||pollIntervalMs>250)throw new RangeError("pollIntervalMs 10 से 250 मिलीसेकंड के बीच होना चाहिए।");
 return {sampleRate,channelCount,maxPendingSeconds,maxScheduledSeconds,pollIntervalMs};
}
function copyAndValidatePcm(samples,options,session){
 if(!options||typeof options!=="object")throw new TypeError("PCM chunk options object होना चाहिए।");
 const requestedRate=options.sampleRate==null?session.sampleRate:Number(options.sampleRate);
 const requestedChannels=options.channelCount==null?session.channelCount:Number(options.channelCount);
 if(requestedRate!==session.sampleRate)throw new RangeError("PCM chunk का sampleRate सक्रिय Stream से मेल खाना चाहिए।");
 if(requestedChannels!==session.channelCount)throw new RangeError("PCM chunk का channelCount सक्रिय Stream से मेल खाना चाहिए।");
 let data,format;
 if(samples instanceof Float32Array){
  format=options.format==null?"float32":options.format;
  if(format!=="float32")throw new TypeError("Float32Array के लिए format float32 होना चाहिए।");
  data=samples.slice();
 }else if(samples instanceof Int16Array){
  format=options.format==null?"int16":options.format;
  if(format!=="int16")throw new TypeError("Int16Array के लिए format int16 होना चाहिए।");
  data=samples.slice();
 }else if(samples instanceof ArrayBuffer){
  format=options.format==null?"int16":options.format;
  if(format==="float32"){
   if(samples.byteLength%4!==0)throw new RangeError("Float32 PCM byteLength चार से विभाज्य होना चाहिए।");
   data=new Float32Array(samples.slice(0));
  }else if(format==="int16"){
   if(samples.byteLength%2!==0)throw new RangeError("Int16 PCM byteLength दो से विभाज्य होना चाहिए।");
   data=new Int16Array(samples.slice(0));
  }else throw new TypeError("ArrayBuffer के लिए format float32 या int16 होना चाहिए।");
 }else throw new TypeError("PCM chunk केवल Float32Array, Int16Array या ArrayBuffer होना चाहिए।");
 if(!data.length||data.length%session.channelCount!==0)throw new RangeError("PCM chunk में कम-से-कम एक पूर्ण audio frame होना चाहिए।");
 const frames=data.length/session.channelCount,durationSeconds=frames/session.sampleRate;
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>MAX_CHUNK_SECONDS)throw new RangeError("PCM chunk की अवधि शून्य से अधिक और अधिकतम पाँच सेकंड होनी चाहिए।");
 return Object.freeze({data,format,sampleRate:session.sampleRate,channelCount:session.channelCount,frames,durationSeconds});
}

/** Call start() from a user-initiated Play handler so the browser can unlock AudioContext. */
export function createStreamProcessor(options={}){
 const player=options.player;validatePlayer(player);
 const settings=normalizeOptions(options);
 const onStatus=typeof options.onStatus==="function"?options.onStatus:null;
 const setTimer=typeof options.setTimeout==="function"?options.setTimeout:setTimeout;
 const clearTimer=typeof options.clearTimeout==="function"?options.clearTimeout:clearTimeout;
 let phase="idle",session=null,pendingQueue=[],pendingSeconds=0,scheduledChunks=0,timerId=null;
 let endPromise=null,endResolve=null,endReject=null,disposed=false,pumpActive=false;
 function publishStatus(message,warning=false){if(!onStatus)return;try{onStatus(String(message),Boolean(warning));}catch(_){}}
 function clearPumpTimer(){if(timerId!==null){clearTimer(timerId);timerId=null;}}
 function rejectPending(error){const queued=pendingQueue;pendingQueue=[];pendingSeconds=0;queued.forEach(item=>item.reject(error));}
 function failStream(error){
  phase="failed";clearPumpTimer();rejectPending(error);session=null;
  try{player.stop();}catch(_){}
  const reject=endReject;endResolve=null;endReject=null;endPromise=null;
  publishStatus(error.message||"PCM stream में त्रुटि हुई।",true);if(reject)reject(error);
 }
 function schedulePump(){
  if(disposed||timerId!==null||["idle","stopped","completed","failed"].includes(phase))return;
  timerId=setTimer(()=>{timerId=null;pump();},settings.pollIntervalMs);
 }
 function completeIfDrained(){
  if(phase!=="ending"||pendingQueue.length!==0)return;
  try{
   const finished=player.finishStream();
   if(finished===false)throw makeError("Player ने सक्रिय PCM stream समाप्त करने से मना किया।");
   phase="completed";publishStatus("PCM stream पूरा Player तक पहुँचा दिया गया है।");
   if(endResolve)endResolve(getState());
  }catch(error){failStream(error);return;}
  endResolve=null;endReject=null;endPromise=null;
 }
 function pump(){
  if(disposed||pumpActive||["idle","stopped","completed","failed"].includes(phase))return;
  pumpActive=true;
  try{
   while(pendingQueue.length){
    let ps;try{ps=player.getState();}catch(error){failStream(error);return;}
    if(!ps||!ps.streamOpen||ps.streamEnded){failStream(makeError("Player stream बंद है; PCM chunk भेजना रोका गया।"));return;}
    if(ps.paused||ps.audioContextState!=="running"){schedulePump();return;}
    const item=pendingQueue[0],queued=Number(ps.queuedSeconds);
    if(!Number.isFinite(queued)||queued<0){failStream(makeError("Player ने अमान्य queuedSeconds स्थिति दी।"));return;}
    if(queued+item.durationSeconds>settings.maxScheduledSeconds){schedulePump();return;}
    try{
     const result=player.enqueuePcmChunk(item.data,{format:item.format,sampleRate:item.sampleRate,channelCount:item.channelCount});
     pendingQueue.shift();pendingSeconds=Math.max(0,pendingSeconds-item.durationSeconds);scheduledChunks+=1;item.resolve(result);
    }catch(error){
     let latest;try{latest=player.getState();}catch(stateError){failStream(stateError);return;}
     const latestQueued=Number(latest&&latest.queuedSeconds);
     if(error instanceof RangeError&&Number.isFinite(latestQueued)&&latestQueued+item.durationSeconds>settings.maxScheduledSeconds){schedulePump();return;}
     pendingQueue.shift();pendingSeconds=Math.max(0,pendingSeconds-item.durationSeconds);item.reject(error);
     publishStatus("एक PCM chunk Player तक नहीं पहुँच सका: "+error.message,true);
    }
   }
   completeIfDrained();
  }finally{pumpActive=false;}
 }
 async function start(startOptions={}){
  if(disposed)throw makeError("Stream Processor dispose हो चुका है।");
  if(phase==="streaming"||phase==="ending")throw makeError("एक PCM stream पहले से सक्रिय है।");
  if(!startOptions||typeof startOptions!=="object")throw new TypeError("start() options object होना चाहिए।");
  clearPumpTimer();rejectPending(makeError("नया PCM stream शुरू हुआ।","AbortError"));
  endPromise=null;endResolve=null;endReject=null;scheduledChunks=0;
  const sampleRate=startOptions.sampleRate==null?settings.sampleRate:Number(startOptions.sampleRate);
  const channelCount=startOptions.channelCount==null?settings.channelCount:Number(startOptions.channelCount);
  const initialBufferMs=startOptions.initialBufferMs==null?80:Number(startOptions.initialBufferMs);
  if(!Number.isFinite(sampleRate)||sampleRate<MIN_SAMPLE_RATE||sampleRate>MAX_SAMPLE_RATE)throw new RangeError("Start sampleRate 8000 से 96000 Hz के बीच होना चाहिए।");
  if(!Number.isInteger(channelCount)||channelCount<1||channelCount>MAX_CHANNEL_COUNT)throw new RangeError("Start channelCount केवल 1 या 2 हो सकता है।");
  if(!Number.isFinite(initialBufferMs)||initialBufferMs<0||initialBufferMs>500)throw new RangeError("initialBufferMs 0 से 500 मिलीसेकंड के बीच होना चाहिए।");
  try{
   await player.prepareAudio();await player.startStream({sampleRate,channelCount,initialBufferMs});
   const ps=player.getState();
   if(!ps||!ps.streamOpen||ps.audioContextState!=="running"||ps.sampleRate!==sampleRate||ps.channelCount!==channelCount)throw makeError("Player ने अपेक्षित Audio Stream configuration सक्रिय नहीं की।");
  }catch(error){
   try{player.stop();}catch(_){}
   throw error;
  }
  session=Object.freeze({sampleRate,channelCount});phase="streaming";
  publishStatus("PCM stream तैयार है। पहले उपयोगी audio chunk की प्रतीक्षा है।");return getState();
 }
 function pushChunk(samples,chunkOptions={}){
  if(disposed)return Promise.reject(makeError("Stream Processor dispose हो चुका है।"));
  if(phase!=="streaming")return Promise.reject(makeError("PCM chunk भेजने से पहले start() सफल होना चाहिए।"));
  let pcm;try{pcm=copyAndValidatePcm(samples,chunkOptions,session);}catch(error){return Promise.reject(error);}
  if(pcm.durationSeconds>settings.maxPendingSeconds||pcm.durationSeconds>settings.maxScheduledSeconds)return Promise.reject(makeError("PCM chunk की अवधि Processor की configured buffer सीमा से अधिक है।","ChunkLimitError"));
  if(pendingSeconds+pcm.durationSeconds>settings.maxPendingSeconds)return Promise.reject(makeError("अस्थायी PCM buffer भर गया है। Producer को वर्तमान chunk पूरा होने तक प्रतीक्षा करनी चाहिए।","BackpressureError"));
  return new Promise((resolve,reject)=>{
   pendingQueue.push({data:pcm.data,format:pcm.format,sampleRate:pcm.sampleRate,channelCount:pcm.channelCount,durationSeconds:pcm.durationSeconds,resolve,reject});
   pendingSeconds+=pcm.durationSeconds;pump();
  });
 }
 function end(){
  if(disposed)return Promise.reject(makeError("Stream Processor dispose हो चुका है।"));
  if(phase==="completed")return Promise.resolve(getState());
  if(phase==="ending"&&endPromise)return endPromise;
  if(phase!=="streaming")return Promise.reject(makeError("समाप्त करने के लिए कोई सक्रिय PCM stream नहीं है।"));
  phase="ending";endPromise=new Promise((resolve,reject)=>{endResolve=resolve;endReject=reject;});pump();return endPromise;
 }
 function stop(reason="PCM stream रोक दिया गया।"){
  if(disposed||phase==="stopped")return false;
  clearPumpTimer();const error=makeError(String(reason),"AbortError");rejectPending(error);
  try{player.stop();}catch(_){}
  phase="stopped";session=null;const reject=endReject;endResolve=null;endReject=null;endPromise=null;
  publishStatus(String(reason));if(reject)reject(error);return true;
 }
 function dispose(){if(disposed)return;stop("PCM stream processor dispose किया गया।");disposed=true;phase="disposed";}
 function getState(){return Object.freeze({version:PROCESSOR_VERSION,phase,sampleRate:session?session.sampleRate:settings.sampleRate,
  channelCount:session?session.channelCount:settings.channelCount,pendingChunks:pendingQueue.length,pendingSeconds,scheduledChunks,
  maxPendingSeconds:settings.maxPendingSeconds,maxScheduledSeconds:settings.maxScheduledSeconds,pollIntervalMs:settings.pollIntervalMs,disposed});}
 return Object.freeze({start,pushChunk,end,stop,dispose,getState});
}
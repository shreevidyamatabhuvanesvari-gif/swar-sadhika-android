/* Swar-Sadhika — identity-preserving photo avatar page.
 * Browser-local face landmarks, conservative photo-mesh deformation and Native TTS.
 * A single photograph supports subtle 2.5D motion only; this is not full 3D reconstruction.
 */
import { createAvatarTtsEngine } from "../tts/avatar-tts-engine.js";

const MEDIAPIPE_VERSION = "0.10.21";
const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MEDIAPIPE_VERSION;
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const CANVAS_WIDTH = 450;
const CANVAS_HEIGHT = 800;
const FRAME_INTERVAL = 1000 / 24;
const OUTER_MOUTH = [61,146,91,181,84,17,314,405,321,375,291];
const UPPER_MOUTH = [13,82,81,80,191,78,95,88,178,87];
const LOWER_MOUTH = [14,87,178,88,95,78,191,80,81,82];
const EYE_GROUPS = [
  { upper:[159,158,157,173], lower:[145,153,154,155], center:[33,133], iris:[468,469,470,471,472] },
  { upper:[386,385,384,398], lower:[374,380,381,382], center:[362,263], iris:[473,474,475,476,477] }
];

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function signedArea(a, b, c) {
  return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
}

function makeTriangle(a, b, c, points) {
  const area = signedArea(points[a], points[b], points[c]);
  return area >= 0 ? [a,b,c] : [a,c,b];
}

function circumcircleContains(triangle, point, points) {
  const a = points[triangle[0]];
  const b = points[triangle[1]];
  const c = points[triangle[2]];
  const ax = a.x-point.x;
  const ay = a.y-point.y;
  const bx = b.x-point.x;
  const by = b.y-point.y;
  const cx = c.x-point.x;
  const cy = c.y-point.y;
  const det = (ax*ax+ay*ay)*(bx*cy-cx*by) -
    (bx*bx+by*by)*(ax*cy-cx*ay) +
    (cx*cx+cy*cy)*(ax*by-bx*ay);
  return det > 1e-8;
}

function triangulate(input) {
  if (!Array.isArray(input) || input.length < 3) return [];
  const points = input.map(point => ({ x:finite(point.x), y:finite(point.y) }));
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const span = Math.max(maxX-minX, maxY-minY, 1);
  const midX = (minX+maxX)/2;
  const midY = (minY+maxY)/2;
  const superIndex = points.length;
  points.push(
    { x:midX-24*span, y:midY-12*span },
    { x:midX+24*span, y:midY-12*span },
    { x:midX, y:midY+24*span }
  );
  let triangles = [makeTriangle(superIndex,superIndex+1,superIndex+2,points)];

  for (let index=0; index<input.length; index+=1) {
    const bad = [];
    for (const triangle of triangles) {
      if (circumcircleContains(triangle, points[index], points)) bad.push(triangle);
    }
    const edges = new Map();
    for (const triangle of bad) {
      for (const edge of [[triangle[0],triangle[1]],[triangle[1],triangle[2]],[triangle[2],triangle[0]]]) {
        const key = edge[0] < edge[1] ? edge[0]+":"+edge[1] : edge[1]+":"+edge[0];
        const record = edges.get(key);
        if (record) record.count += 1;
        else edges.set(key, { edge, count:1 });
      }
    }
    const removed = new Set(bad);
    triangles = triangles.filter(triangle => !removed.has(triangle));
    for (const record of edges.values()) {
      if (record.count !== 1) continue;
      const triangle = makeTriangle(record.edge[0],record.edge[1],index,points);
      if (Math.abs(signedArea(points[triangle[0]],points[triangle[1]],points[triangle[2]])) > 1e-4) {
        triangles.push(triangle);
      }
    }
  }
  return triangles.filter(triangle => triangle.every(index => index < input.length));
}

function affineFromTriangles(source, target) {
  const x0=source[0].x, y0=source[0].y;
  const x1=source[1].x, y1=source[1].y;
  const x2=source[2].x, y2=source[2].y;
  const u0=target[0].x, v0=target[0].y;
  const u1=target[1].x, v1=target[1].y;
  const u2=target[2].x, v2=target[2].y;
  const den=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);
  if (Math.abs(den)<1e-7) return null;
  const a=(u0*(y1-y2)+u1*(y2-y0)+u2*(y0-y1))/den;
  const c=(u0*(x2-x1)+u1*(x0-x2)+u2*(x1-x0))/den;
  const e=(u0*(x1*y2-x2*y1)+u1*(x2*y0-x0*y2)+u2*(x0*y1-x1*y0))/den;
  const b=(v0*(y1-y2)+v1*(y2-y0)+v2*(y0-y1))/den;
  const d=(v0*(x2-x1)+v1*(x0-x2)+v2*(x1-x0))/den;
  const f=(v0*(x1*y2-x2*y1)+v1*(x2*y0-x0*y2)+v2*(x0*y1-x1*y0))/den;
  return [a,b,c,d,e,f].every(Number.isFinite) ? {a,b,c,d,e,f} : null;
}

function photoFit(imageWidth, imageHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth/imageWidth,targetHeight/imageHeight);
  const width = imageWidth*scale;
  const height = imageHeight*scale;
  return { scale, x:(targetWidth-width)/2, y:(targetHeight-height)/2 };
}

function mapLandmarks(landmarks, fit) {
  return landmarks.map(point => ({
    x:finite(point.x)*fit.scale*1 + fit.x,
    y:finite(point.y)*fit.scale*1 + fit.y,
    z:finite(point.z)
  }));
}

function blendshapeValue(categories, name) {
  if (!Array.isArray(categories)) return 0;
  const item = categories.find(entry => entry && entry.categoryName === name);
  return item ? Math.max(0,Math.min(1,finite(item.score))) : 0;
}

function characterMouthShape(character) {
  const char = String(character || "").normalize("NFC");
  const vowelShapes = {
    "अ":0.42,"आ":0.82,"इ":0.25,"ई":0.22,"उ":0.34,"ऊ":0.30,
    "ऋ":0.34,"ॠ":0.34,"ए":0.40,"ऐ":0.54,"ओ":0.50,"औ":0.62,
    "ा":0.78,"ि":0.24,"ी":0.22,"ु":0.32,"ू":0.30,"ृ":0.34,
    "े":0.40,"ै":0.52,"ो":0.50,"ौ":0.60
  };
  if (Object.prototype.hasOwnProperty.call(vowelShapes,char)) return vowelShapes[char];
  if (/[पफबभम]/u.test(char)) return 0.035;
  if (/[टठडढतथदधकखगघचछजझ]/u.test(char)) return 0.18;
  if (/[ंःँ]/u.test(char)) return 0.30;
  if (/[्।॥\s]/u.test(char)) return 0.055;
  return 0.20;
}

function smoothToward(current, target, amount) {
  return current + (target-current)*Math.max(0,Math.min(1,amount));
}

function makeAnimatedPoints(base, state, elapsedMs) {
  const points = base.map(point => ({ x:point.x, y:point.y, z:point.z }));
  if (!points.length) return points;
  const face = points.slice(0,468);
  const minX=Math.min(...face.map(point=>point.x));
  const maxX=Math.max(...face.map(point=>point.x));
  const minY=Math.min(...face.map(point=>point.y));
  const maxY=Math.max(...face.map(point=>point.y));
  const width=Math.max(1,maxX-minX);
  const height=Math.max(1,maxY-minY);
  const centerX=(minX+maxX)/2;
  const centerY=(minY+maxY)/2;

  // Very small, reversible head/neck sway; source-photo identity remains the texture.
  const seconds=elapsedMs/1000;
  const speechBoost=state.speechActive && !state.paused ? 1 : 0.55;
  const headTilt=Math.sin(seconds*0.72)*0.012*speechBoost;
  const headBob=Math.sin(seconds*1.35)*height*0.004*speechBoost;
  const shoulderSway=Math.sin(seconds*0.48)*width*0.0035*speechBoost;
  for (const point of points) {
    const dx=point.x-centerX;
    const dy=point.y-centerY;
    point.x=centerX+dx*Math.cos(headTilt)-dy*Math.sin(headTilt)+shoulderSway*(point.y>centerY+height*0.28?1:0.25);
    point.y=centerY+dx*Math.sin(headTilt)+dy*Math.cos(headTilt)+headBob;
  }

  const mouthLeft=points[61];
  const mouthRight=points[291];
  const mouthTop=points[13];
  const mouthBottom=points[14];
  const mouthCenterX=(mouthLeft.x+mouthRight.x)/2;
  const mouthCenterY=(mouthTop.y+mouthBottom.y)/2;
  const mouthWidth=Math.max(1,Math.hypot(mouthRight.x-mouthLeft.x,mouthRight.y-mouthLeft.y));
  const char = state.speechActive && !state.paused ? currentSpeechCharacter(state, elapsedMs) : "";
  const targetOpen = state.speechActive && !state.paused ? characterMouthShape(char) : 0;
  state.mouthOpen=smoothToward(state.mouthOpen,targetOpen,state.speechActive ? 0.58 : 0.22);
  const opening=state.mouthOpen;
  const gap=Math.min(height*0.055,opening*mouthWidth*0.19);
  if (gap>0.12) {
    const upperIds=[13,312,311,310,415,191,80,81,82];
    const lowerIds=[14,317,402,318,324,95,88,178,87];
    for (const index of upperIds) {
      if (points[index]) points[index].y-=gap*0.46;
    }
    for (const index of lowerIds) {
      if (points[index]) points[index].y+=gap*0.54;
    }
    for (let index=0; index<468; index+=1) {
      const point=points[index];
      if (point.y>mouthCenterY && point.y<mouthCenterY+height*0.22) {
        const dx=(point.x-mouthCenterX)/(mouthWidth*0.75);
        const dy=(point.y-mouthCenterY)/(height*0.22);
        const weight=Math.exp(-dx*dx*2.1)*Math.max(0,1-dy);
        point.y+=gap*0.11*weight;
      }
    }
  }

  // Move only the detected iris landmarks to simulate attentive eye direction.
  const gaze=state.gaze;
  for (const group of EYE_GROUPS) {
    const eyeWidth=Math.max(1,Math.hypot(points[group.center[1]].x-points[group.center[0]].x,points[group.center[1]].y-points[group.center[0]].y));
    const eyeHeight=Math.max(1,Math.abs(
      group.lower.reduce((sum,index)=>sum+points[index].y,0)/group.lower.length-
      group.upper.reduce((sum,index)=>sum+points[index].y,0)/group.upper.length
    ));
    for (const index of group.iris) {
      if (points[index]) {
        points[index].x+=gaze.x*eyeWidth*0.24;
        points[index].y+=gaze.y*eyeHeight*0.28;
      }
    }
    const topY=group.upper.reduce((sum,index)=>sum+(points[index]?.y||0),0)/group.upper.length;
    const lowY=group.lower.reduce((sum,index)=>sum+(points[index]?.y||0),0)/group.lower.length;
    const eyeCenter=(topY+lowY)/2;
    const close=state.blink;
    for (const index of group.upper) if (points[index]) points[index].y=smoothToward(points[index].y,eyeCenter,close*0.99);
    for (const index of group.lower) if (points[index]) points[index].y=smoothToward(points[index].y,eyeCenter,close*0.78);
  }
  return points;
}

function currentSpeechCharacter(state, elapsedMs) {
  const chars=Array.from(state.speechText || "");
  if (!chars.length) return "";
  const estimatedDuration=Math.max(650,chars.length*92/Math.max(0.55,state.rate||1));
  const estimate=Math.min(chars.length-1,Math.floor(elapsedMs/estimatedDuration*chars.length));
  const position=Math.max(state.boundaryCharacter,estimate);
  return chars[Math.min(chars.length-1,Math.max(0,position))] || "";
}

function drawWarpedPhoto(context, sourceCanvas, basePoints, targetPoints, triangles, faceLayer, faceLayerContext) {
  context.drawImage(sourceCanvas,0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  faceLayerContext.setTransform(1,0,0,1,0,0);
  faceLayerContext.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  for (const triangle of triangles) {
    const source=triangle.map(index=>basePoints[index]);
    const target=triangle.map(index=>targetPoints[index]);
    const transform=affineFromTriangles(source,target);
    if (!transform) continue;
    const minX=Math.max(0,Math.floor(Math.min(source[0].x,source[1].x,source[2].x)));
    const minY=Math.max(0,Math.floor(Math.min(source[0].y,source[1].y,source[2].y)));
    const maxX=Math.min(CANVAS_WIDTH,Math.ceil(Math.max(source[0].x,source[1].x,source[2].x))+1);
    const maxY=Math.min(CANVAS_HEIGHT,Math.ceil(Math.max(source[0].y,source[1].y,source[2].y))+1);
    const sourceWidth=maxX-minX;
    const sourceHeight=maxY-minY;
    if (sourceWidth<1 || sourceHeight<1) continue;
    faceLayerContext.save();
    faceLayerContext.beginPath();
    faceLayerContext.moveTo(target[0].x,target[0].y);
    faceLayerContext.lineTo(target[1].x,target[1].y);
    faceLayerContext.lineTo(target[2].x,target[2].y);
    faceLayerContext.closePath();
    faceLayerContext.clip();
    faceLayerContext.setTransform(transform.a,transform.b,transform.c,transform.d,transform.e,transform.f);
    // Draw only the source rectangle touched by this triangle, not the whole portrait.
    faceLayerContext.drawImage(sourceCanvas,minX,minY,sourceWidth,sourceHeight,minX,minY,sourceWidth,sourceHeight);
    faceLayerContext.restore();
  }
  context.drawImage(faceLayer,0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
}

function drawMouthCavity(context, points, open) {
  if (open<0.075 || !points[61] || !points[291] || !points[13] || !points[14]) return;
  const left=points[61], right=points[291], upper=points[13], lower=points[14];
  const width=Math.hypot(right.x-left.x,right.y-left.y);
  const centerX=(left.x+right.x)/2;
  const centerY=(upper.y+lower.y)/2;
  const radiusX=Math.max(2,width*0.34);
  const radiusY=Math.max(0.8,width*0.115*open);
  context.save();
  context.fillStyle="#241015";
  context.beginPath();
  context.ellipse(centerX,centerY,radiusX,radiusY,0,0,Math.PI*2);
  context.fill();
  if (open>0.34) {
    context.fillStyle="rgba(248,239,225,"+Math.min(0.82,open*0.78)+")";
    context.beginPath();
    context.ellipse(centerX,centerY-radiusY*0.46,radiusX*0.76,Math.max(0.7,radiusY*0.24),0,Math.PI,Math.PI*2);
    context.fill();
  }
  context.restore();
}

function drawFaceMesh(context, sourceCanvas, basePoints, targetPoints, triangles, state) {
  drawWarpedPhoto(context,sourceCanvas,basePoints,targetPoints,triangles,state.faceLayer,state.faceLayerContext);
  drawMouthCavity(context,targetPoints,state.mouthOpen);
}

function createStyles(doc) {
  const style=doc.createElement("style");
  style.textContent = [
    ".avatar-production{display:grid;gap:16px}",
    ".avatar-production .avatar-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.78fr);gap:16px;align-items:start}",
    ".avatar-production .avatar-stage{width:min(100%,360px);margin:auto;aspect-ratio:9/16;overflow:hidden;border-radius:20px;background:#090914;border:1px solid rgba(207,190,255,.22);box-shadow:0 15px 42px rgba(0,0,0,.32)}",
    ".avatar-production canvas{display:block;width:100%;height:100%;object-fit:contain;transform-origin:50% 70%;will-change:transform}",
    ".avatar-production .avatar-controls{display:grid;gap:12px;min-width:0}",
    ".avatar-production .avatar-actions{display:flex;gap:8px;flex-wrap:wrap}",
    ".avatar-production .avatar-field{display:grid;gap:6px}",
    ".avatar-production .avatar-field textarea{min-height:118px;resize:vertical}",
    ".avatar-production .avatar-status{min-height:42px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(207,190,255,.14)}",
    ".avatar-production .avatar-status.error{border-color:rgba(255,120,120,.4);color:#ffd0d0}",
    ".avatar-production .avatar-status.success{border-color:rgba(120,220,170,.3);color:#bff5d8}",
    ".avatar-production .avatar-note{font-size:.88rem;line-height:1.55;color:#beb9d0}",
    ".avatar-production .avatar-tuning{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".avatar-production input[type=range]{width:100%}",
    ".avatar-production .avatar-small{font-size:.8rem;color:#bdb7d1}",
    "@media(max-width:760px){.avatar-production .avatar-grid{grid-template-columns:1fr}.avatar-production .avatar-stage{width:min(100%,330px)}}"
  ].join("");
  return style;
}

export async function mount(context) {
  if (!context || !context.root || !context.document) {
    throw new TypeError("Avatar पेज को root और document context आवश्यक है।");
  }
  const root=context.root;
  const doc=context.document;
  const win=doc.defaultView || (typeof window!=="undefined"?window:null);
  if (!win) throw new Error("Avatar पेज के लिए Browser Window उपलब्ध नहीं है।");

  const style=createStyles(doc);
  root.innerHTML = [
    '<div class="intro"><h1>वास्तविक फोटो अवतार</h1><p>अपनी फोटो जोड़ें। चेहरा और पहचान मूल फोटो से ही रखकर सीमित, स्वाभाविक 2.5D गतिविधि दिखाएँ।</p></div>',
    '<div class="avatar-production">',
    ' <section class="panel avatar-grid">',
    '  <div><div class="avatar-stage"><canvas id="photo-avatar-canvas" width="450" height="800" aria-label="फोटो आधारित अवतार पूर्वावलोकन"></canvas></div>',
    '   <p class="avatar-small">पूर्वावलोकन · 9:16 · सभी फोटो processing इसी ब्राउज़र में होती है।</p></div>',
    '  <div class="avatar-controls">',
    '   <label class="filepick">＋ अपनी फोटो चुनें<input id="photo-avatar-file" type="file" accept="image/jpeg,image/png,image/webp"></label>',
    '   <div id="photo-avatar-status" class="avatar-status" role="status" aria-live="polite">पहले सामने से ली गई स्पष्ट, अच्छी रोशनी वाली फोटो चुनें।</div>',
    '   <div class="avatar-actions"><button id="photo-avatar-build" class="btn primary" type="button" disabled>फोटो पहचानें और अवतार बनाएँ</button><button id="photo-avatar-reset" class="btn" type="button" disabled>फोटो हटाएँ</button></div>',
    '   <label class="avatar-field">वाचन के लिए संस्कृत पाठ<textarea id="photo-avatar-text" maxlength="5000" placeholder="यहाँ श्लोक या मंत्र लिखें…"></textarea></label>',
    '   <label class="avatar-field">स्थानीय Hindi/Sanskrit आवाज़<select id="photo-avatar-voice"><option value="">आवाज़ सूची पढ़ी जा रही है…</option></select></label>',
    '   <div class="avatar-actions"><button id="photo-avatar-refresh-voices" class="btn" type="button">↻ आवाज़ सूची ताज़ा करें</button><button id="photo-avatar-test-voice" class="btn" type="button" disabled>♪ आवाज़ का नमूना सुनें</button></div>',
    '   <div id="photo-avatar-voice-status" class="avatar-status" role="status" aria-live="polite">Android की वास्तविक आवाज़ सूची जाँची जा रही है…</div>',
    '   <div class="avatar-tuning">',
    '    <label class="avatar-field">वाचन गति <span id="photo-avatar-rate-value">0.88×</span><input id="photo-avatar-rate" type="range" min="0.65" max="1.15" step="0.05" value="0.88"></label>',
    '    <label class="avatar-field">दृष्टि <select id="photo-avatar-gaze"><option value="auto">स्वाभाविक स्वतः</option><option value="left">बाईं ओर</option><option value="center">सामने</option><option value="right">दाईं ओर</option></select></label>',
    '   </div>',
    '   <div class="avatar-actions"><button id="photo-avatar-speak" class="btn primary" type="button" disabled>▶ बोलना शुरू करें</button><button id="photo-avatar-pause" class="btn" type="button" disabled>Ⅱ रोकें</button><button id="photo-avatar-resume" class="btn" type="button" disabled>▶ फिर शुरू करें</button><button id="photo-avatar-stop" class="btn danger" type="button" disabled>■ समाप्त करें</button></div>',
    '   <div class="avatar-note">पहचान-सुरक्षा: मूल फोटो की texture ही उपयोग होती है; कोई नया चेहरा या पहचान उत्पन्न नहीं की जाती। होंठों की गति पाठ और उपलब्ध Native TTS word-boundary संकेतों से अनुमानित होती है; Android की कुछ आवाज़ें boundary संकेत नहीं देतीं, इसलिए वहाँ समय-आधारित fallback चलता है।</div>',
    '  </div>',
    ' </section>',
    ' <section class="panel"><h2>अवतार की गतिविधियाँ</h2><p class="avatar-note">आँखों की पुतलियों की दिशा, पलक झपकना, होंठों का खुलना-बंद होना और बहुत हल्की सिर/चित्र की गति। एक स्थिर फोटो से वास्तविक 3D प्रोफ़ाइल, नए हाथों के हावभाव या पीछे छिपे शरीर का निर्माण संभव नहीं है।</p><p class="avatar-small">फोटो किसी server या AI inference API पर भेजी नहीं जाती। पहली बार Face Landmarker का browser runtime और मॉडल डाउनलोड करने के लिए इंटरनेट चाहिए।</p></section>',
    '</div>'
  ].join("");
  root.prepend(style);

  const byId=id=>root.querySelector("#"+id);
  const canvas=byId("photo-avatar-canvas");
  const context2d=canvas.getContext("2d",{alpha:false,desynchronized:true});
  if (!context2d) throw new Error("इस ब्राउज़र में Canvas 2D उपलब्ध नहीं है।");
  const photoInput=byId("photo-avatar-file");
  const buildButton=byId("photo-avatar-build");
  const resetButton=byId("photo-avatar-reset");
  const speakButton=byId("photo-avatar-speak");
  const pauseButton=byId("photo-avatar-pause");
  const resumeButton=byId("photo-avatar-resume");
  const stopButton=byId("photo-avatar-stop");
  const textInput=byId("photo-avatar-text");
  const voiceSelect=byId("photo-avatar-voice");
  const refreshVoicesButton=byId("photo-avatar-refresh-voices");
  const testVoiceButton=byId("photo-avatar-test-voice");
  const voiceStatus=byId("photo-avatar-voice-status");
  const rateInput=byId("photo-avatar-rate");
  const gazeSelect=byId("photo-avatar-gaze");
  const status=byId("photo-avatar-status");
  const aborter=new AbortController();

  const state={
    destroyed:false, visible:true, photoUrl:"", image:null, baseCanvas:null,
    basePoints:null, triangles:[], faceLayer:null, faceLayerContext:null, faceLandmarker:null, engine:null, motionPulse:0,
    voices:[], voiceInventory:null, speechText:"", speechActive:false, speechStartedAt:0,
    boundaryCharacter:0, rate:0.88, mouthOpen:0, blink:0, paused:false,
    nextBlink:2.8, blinkStart:-10, gaze:{x:0,y:0}, gazeMode:"auto",
    gazeTarget:0, lastFrame:0, raf:0, lastStatus:"", unsubscribers:[]
  };

  function setStatus(message,kind) {
    if (state.destroyed) return;
    status.textContent=String(message);
    status.classList.toggle("error",kind==="error");
    status.classList.toggle("success",kind==="success");
  }

  function updateButtons() {
    const ready=Boolean(state.image && state.basePoints && state.faceLandmarker);
    const voiceReady=Boolean(state.engine && state.voices.length && voiceSelect.value);
    speakButton.disabled=!ready || !voiceReady || state.speechActive;
    pauseButton.disabled=!state.speechActive || state.paused;
    resumeButton.disabled=!state.engine || !state.paused;
    stopButton.disabled=!state.speechActive;
    resetButton.disabled=!state.image && !state.faceLandmarker;
    refreshVoicesButton.disabled=!state.engine;
    testVoiceButton.disabled=!voiceReady || state.speechActive;
  }

  function setVoiceStatus(message,kind) {
    voiceStatus.textContent=String(message || "");
    voiceStatus.classList.toggle("error",kind==="error");
    voiceStatus.classList.toggle("success",kind==="success");
  }

  function fillVoices() {
    const old=voiceSelect.value;
    const inventory=state.voiceInventory || {selectable:[],informational:[],message:"आवाज़ सूची उपलब्ध नहीं है।"};
    state.voices=Array.from(inventory.selectable || []);
    voiceSelect.replaceChildren();
    if (state.voices.length) {
      const localGroup=doc.createElement("optgroup");
      localGroup.label="स्थानीय आवाज़ें · offline";
      for (const item of state.voices) {
        const option=doc.createElement("option");
        option.value=item.key;
        option.textContent=item.name+" · "+item.lang+" · "+item.femaleHint;
        localGroup.appendChild(option);
      }
      voiceSelect.appendChild(localGroup);
    } else {
      const option=doc.createElement("option");
      option.value="";
      option.textContent="स्थानीय Hindi/Sanskrit आवाज़ उपलब्ध नहीं";
      option.disabled=true;
      voiceSelect.appendChild(option);
    }
    const informational=Array.from(inventory.informational || []);
    if (informational.length) {
      const infoGroup=doc.createElement("optgroup");
      infoGroup.label="जानकारी मात्र · offline playback के लिए चयन योग्य नहीं";
      for (const item of informational) {
        const option=doc.createElement("option");
        option.value="";
        option.disabled=true;
        option.textContent=item.name+" · "+item.lang+" · "+item.localityLabel;
        infoGroup.appendChild(option);
      }
      voiceSelect.appendChild(infoGroup);
    }
    if (state.voices.some(item=>item.key===old)) voiceSelect.value=old;
    else if (state.voices.length) {
      const preferred=state.voices.find(item=>item.default) || state.voices[0];
      voiceSelect.value=preferred.key;
    }
    setVoiceStatus(inventory.message, state.voices.length ? "success" : "error");
    updateButtons();
  }

  function selectedVoice() {
    return state.voices.find(item=>item.key===voiceSelect.value) || null;
  }

  async function initializeSpeech() {
    if (state.engine) return;
    state.engine=createAvatarTtsEngine({target:win});
    state.unsubscribers.push(
      state.engine.on("voiceschanged",()=> {
        state.voiceInventory=state.engine.getInventory();
        fillVoices();
      }),
      state.engine.on("boundary",detail=>{
        if (!state.speechActive || !detail) return;
        const index=Math.max(0,finite(detail.charIndex,0));
        state.boundaryCharacter=Array.from(state.speechText.slice(0,index)).length;
        state.motionPulse=1;
      }),
      state.engine.on("speechstart",detail=>{
        if (detail && typeof detail.text==="string") state.speechText=detail.text;
        state.speechActive=true;
        state.paused=false;
        state.boundaryCharacter=0;
        state.speechStartedAt=win.performance.now();
        updateButtons();
      }),
      state.engine.on("speechend",()=>{ state.speechActive=false; state.paused=false; state.mouthOpen=0; updateButtons(); }),
      state.engine.on("speechcancel",()=>{ state.speechActive=false; state.paused=false; state.mouthOpen=0; updateButtons(); }),
      state.engine.on("speecherror",detail=>{ state.speechActive=false; state.paused=false; setStatus(detail && detail.message || "वाचन त्रुटि।","error"); updateButtons(); }),
      state.engine.on("pause",()=>{ state.paused=true; updateButtons(); }),
      state.engine.on("resume",()=>{ state.paused=false; state.speechStartedAt=win.performance.now(); updateButtons(); })
    );
    const initialized=await state.engine.initialize();
    state.voiceInventory=initialized.inventory;
    if (!initialized.ready) {
      setVoiceStatus("इस browser में Native SpeechSynthesis उपलब्ध नहीं है।","error");
      updateButtons();
      return;
    }
    fillVoices();
  }

  async function refreshVoices() {
    if (!state.engine || state.destroyed) return;
    try {
      state.voiceInventory=await state.engine.refreshVoices();
      fillVoices();
    } catch (error) {
      setVoiceStatus("आवाज़ सूची पढ़ने में त्रुटि: "+(error && error.message || "अज्ञात त्रुटि"),"error");
    }
  }

  async function testSelectedVoice() {
    const selected=selectedVoice();
    if (!selected || !state.engine) {
      setVoiceStatus("नमूना सुनाने के लिए स्थानीय Hindi/Sanskrit आवाज़ चुनें।","error");
      return;
    }
    try {
      const result=await state.engine.playSample(selected.key,{rate:finite(rateInput.value,0.88),pitch:1,volume:1});
      if (result.status==="ended") setVoiceStatus("आवाज़ का नमूना पूरा हुआ। स्वर की गुणवत्ता सुनकर स्वयं पुष्टि करें।","success");
    } catch (error) {
      setVoiceStatus("आवाज़ का नमूना नहीं चल सका: "+(error && error.message || "Native TTS त्रुटि"),"error");
    }
  }

  async function loadFaceLandmarker() {
    if (state.faceLandmarker) return state.faceLandmarker;
    setStatus("Face Landmarker browser runtime डाउनलोड हो रहा है…");
    const vision=await import(MEDIAPIPE_CDN+"/+esm");
    const fileset=await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_CDN+"/wasm");
    try {
      state.faceLandmarker=await vision.FaceLandmarker.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:FACE_MODEL_URL,delegate:"GPU"},
        runningMode:"IMAGE",numFaces:1,
        outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true,
        minFaceDetectionConfidence:0.55,minFacePresenceConfidence:0.55
      });
    } catch (gpuError) {
      state.faceLandmarker=await vision.FaceLandmarker.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:FACE_MODEL_URL,delegate:"CPU"},
        runningMode:"IMAGE",numFaces:1,
        outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true,
        minFaceDetectionConfidence:0.55,minFacePresenceConfidence:0.55
      });
    }
    return state.faceLandmarker;
  }

  function buildPhotoCanvas(image) {
    const base=doc.createElement("canvas");
    base.width=CANVAS_WIDTH;base.height=CANVAS_HEIGHT;
    const baseContext=base.getContext("2d",{alpha:false});
    const fit=photoFit(image.naturalWidth,image.naturalHeight,CANVAS_WIDTH,CANVAS_HEIGHT);
    baseContext.fillStyle="#090914";
    baseContext.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    baseContext.drawImage(image,fit.x,fit.y,image.naturalWidth*fit.scale,image.naturalHeight*fit.scale);
    return {base,fit};
  }

  async function buildAvatar() {
    if (!state.image) return;
    buildButton.disabled=true;
    try {
      const landmarker=await loadFaceLandmarker();
      if (state.destroyed || !state.image) return;
      setStatus("फोटो का चेहरा स्थानीय रूप से पहचाना जा रहा है…");
      const result=landmarker.detect(state.image);
      const landmarks=result && result.faceLandmarks && result.faceLandmarks[0];
      if (!landmarks || landmarks.length<478) {
        throw new Error("चेहरा स्पष्ट रूप से नहीं मिला। सामने से ली गई फोटो, खुली आँखें और साफ रोशनी आज़माएँ।");
      }
      const prepared=buildPhotoCanvas(state.image);
      const points=mapLandmarks(landmarks,prepared.fit);
      const mesh=triangulate(points);
      if (mesh.length<250) throw new Error("फोटो का facial mesh पर्याप्त नहीं बना। दूसरी, अधिक स्पष्ट फोटो चुनें।");
      state.baseCanvas=prepared.base;
      state.basePoints=points;
      state.triangles=mesh;
      state.faceLayer=doc.createElement("canvas");
      state.faceLayer.width=CANVAS_WIDTH;
      state.faceLayer.height=CANVAS_HEIGHT;
      state.faceLayerContext=state.faceLayer.getContext("2d",{alpha:true,desynchronized:true});
      if (!state.faceLayerContext) throw new Error("चेहरे की animation layer उपलब्ध नहीं है।");
      const categories=result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
      state.initialEyeBlink=(blendshapeValue(categories,"eyeBlinkLeft")+blendshapeValue(categories,"eyeBlinkRight"))/2;
      state.mouthOpen=0;
      state.nextBlink=2.5;
      setStatus("चेहरा पहचाना गया। मूल फोटो से पहचान-सुरक्षित अवतार तैयार है।","success");
      startAnimation();
    } catch (error) {
      setStatus(error && error.message ? error.message : "अवतार तैयार नहीं हो सका।","error");
    } finally {
      buildButton.disabled=false;
      updateButtons();
    }
  }

  function scheduleBlink(seconds) {
    state.nextBlink=seconds+2.6+((Math.sin(seconds*12.71)+1)*0.5)*2.8;
  }

  function updateIdle(elapsedMs) {
    const seconds=elapsedMs/1000;
    if (seconds>=state.nextBlink) {
      state.blinkStart=seconds;
      scheduleBlink(seconds);
    }
    const blinkAge=seconds-state.blinkStart;
    state.blink=blinkAge>=0 && blinkAge<0.22
      ? Math.sin(Math.PI*Math.min(1,blinkAge/0.22))
      : 0;
    let target=0;
    if (state.gazeMode==="left") target=-1;
    else if (state.gazeMode==="right") target=1;
    else if (state.gazeMode==="auto") target=Math.sin(seconds*0.37)*0.72;
    state.gazeTarget=target;
    state.gaze.x=smoothToward(state.gaze.x,state.gazeTarget,0.045);
    state.gaze.y=smoothToward(state.gaze.y,Math.sin(seconds*0.21)*0.18,0.025);
  }

  function render(elapsedMs) {
    if (!state.baseCanvas || !state.basePoints) return;
    updateIdle(elapsedMs);
    const points=makeAnimatedPoints(state.basePoints,state,elapsedMs);
    drawFaceMesh(context2d,state.baseCanvas,state.basePoints,points,state.triangles,state);
    const seconds=elapsedMs/1000;
    const pulse=state.speechActive && !state.paused ? state.motionPulse : 0;
    state.motionPulse*=0.90;
    const bob=state.speechActive && !state.paused
      ? Math.sin(seconds*5.4)*2.0+pulse*3.0+Math.sin(seconds*2.1)*0.9
      : Math.sin(seconds*1.15)*2.2;
    const tilt=state.speechActive && !state.paused
      ? Math.sin(seconds*1.8)*0.24+pulse*0.16
      : Math.sin(seconds*0.72)*0.20;
    canvas.style.transform="translate3d(0,"+bob.toFixed(2)+"px,0) rotate("+tilt.toFixed(3)+"deg)";
  }

  function animationFrame(timestamp) {
    if (state.destroyed || !state.visible || !state.basePoints) return;
    if (timestamp-state.lastFrame>=FRAME_INTERVAL) {
      state.lastFrame=timestamp;
      const elapsed=state.speechActive ? Math.max(0,win.performance.now()-state.speechStartedAt) : timestamp;
      try { render(elapsed); }
      catch (error) {
        state.visible=false;
        stopAnimation();
        setStatus("अवतार animation में त्रुटि: "+(error && error.message || "Canvas rendering failed"),"error");
        return;
      }
    }
    state.raf=win.requestAnimationFrame(animationFrame);
  }

  function startAnimation() {
    if (state.raf) win.cancelAnimationFrame(state.raf);
    state.visible=true;
    state.lastFrame=0;
    state.raf=win.requestAnimationFrame(animationFrame);
  }

  function stopAnimation() {
    if (state.raf) win.cancelAnimationFrame(state.raf);
    state.raf=0;
    canvas.style.transform="";
  }

  async function speak() {
    const text=textInput.value.trim();
    if (!text) { setStatus("पहले वाचन के लिए पाठ लिखें।","error"); return; }
    if (!state.engine || !state.basePoints) { setStatus("पहले फोटो से अवतार बनाएँ।","error"); return; }
    const voice=selectedVoice();
    if (!voice || !voice.selectable) { setVoiceStatus("स्थानीय Hindi/Sanskrit आवाज़ चुनें।","error"); return; }
    state.speechText=text;
    state.boundaryCharacter=0;
    state.speechStartedAt=win.performance.now();
    state.rate=finite(rateInput.value,0.88);
    state.speechActive=true;
    state.paused=false;
    updateButtons();
    try {
      const result=await state.engine.speak(text,{
        voiceKey:voice.key,rate:state.rate,pitch:1,volume:1,replace:true
      });
      if (result && result.status==="cancelled") state.speechActive=false;
    } catch (error) {
      state.speechActive=false;
      setStatus("वाचन शुरू नहीं हुआ: "+(error && error.message || "Native TTS त्रुटि"),"error");
    } finally {
      state.mouthOpen=0;
      state.paused=false;
      updateButtons();
    }
  }

  async function pause() {
    if (!state.engine || !state.speechActive) return;
    const ok=await state.engine.pause();
    state.paused=Boolean(ok);
    updateButtons();
    if (ok) setStatus("वाचन और अवतार की होंठ-गति रोक दी गई है।");
  }

  async function resume() {
    if (!state.engine || !state.paused) return;
    const ok=await state.engine.resume();
    state.paused=!ok;
    if (ok) state.speechStartedAt=win.performance.now();
    updateButtons();
  }

  async function stopSpeech() {
    if (!state.engine) return;
    try { state.engine.cancel("user-stop"); } catch (_) {}
    state.speechActive=false;state.paused=false;state.mouthOpen=0;
    updateButtons();
  }

  function resetPhoto() {
    void stopSpeech();
    stopAnimation();
    state.faceLayer=null;
    state.faceLayerContext=null;
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photoUrl="";
    state.image=null;state.baseCanvas=null;state.basePoints=null;state.triangles=[];state.faceLayer=null;state.faceLayerContext=null;
    photoInput.value="";
    context2d.fillStyle="#090914";context2d.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    setStatus("पहले सामने से ली गई स्पष्ट फोटो चुनें।");
    buildButton.disabled=true;
    updateButtons();
  }

  function handlePhoto() {
    const file=photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setStatus("केवल JPG, PNG या WebP फोटो चुनें।","error");return;
    }
    if (file.size>15*1024*1024) {
      setStatus("फोटो 15 MB से छोटी चुनें ताकि Android मोबाइल पर processing सहज रहे।","error");return;
    }
    resetPhoto();
    state.photoUrl=URL.createObjectURL(file);
    const image=new win.Image();
    image.onload=()=>{
      if (state.destroyed || !state.photoUrl) return;
      state.image=image;
      const preview=buildPhotoCanvas(image);
      context2d.drawImage(preview.base,0,0);
      buildButton.disabled=false;
      setStatus("फोटो तैयार है। अब चेहरा पहचानकर अवतार बनाएँ दबाएँ।");
      updateButtons();
    };
    image.onerror=()=>setStatus("फोटो खोली नहीं जा सकी। दूसरी फाइल चुनें।","error");
    image.src=state.photoUrl;
  }

  function setGaze() {
    state.gazeMode=gazeSelect.value;
  }

  function onRate() {
    state.rate=finite(rateInput.value,0.88);
    byId("photo-avatar-rate-value").textContent=state.rate.toFixed(2)+"×";
  }

  photoInput.addEventListener("change",handlePhoto,{signal:aborter.signal});
  buildButton.addEventListener("click",()=>void buildAvatar(),{signal:aborter.signal});
  resetButton.addEventListener("click",resetPhoto,{signal:aborter.signal});
  speakButton.addEventListener("click",()=>void speak(),{signal:aborter.signal});
  refreshVoicesButton.addEventListener("click",()=>void refreshVoices(),{signal:aborter.signal});
  testVoiceButton.addEventListener("click",()=>void testSelectedVoice(),{signal:aborter.signal});
  voiceSelect.addEventListener("change",updateButtons,{signal:aborter.signal});
  pauseButton.addEventListener("click",()=>void pause(),{signal:aborter.signal});
  resumeButton.addEventListener("click",()=>void resume(),{signal:aborter.signal});
  stopButton.addEventListener("click",()=>void stopSpeech(),{signal:aborter.signal});
  gazeSelect.addEventListener("change",setGaze,{signal:aborter.signal});
  rateInput.addEventListener("input",onRate,{signal:aborter.signal});

  context2d.fillStyle="#090914";
  context2d.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  onRate();
  try {
    await initializeSpeech();
    if (state.voiceInventory && state.voiceInventory.selectable.length) {
      setStatus("स्थानीय Native TTS तैयार है। फोटो चुनकर अवतार बनाएँ।","success");
    } else {
      setStatus("अवतार तैयार है, लेकिन इस डिवाइस में स्थानीय Hindi/Sanskrit आवाज़ उपलब्ध नहीं है। आवाज़ सेटिंग जाँचें।","error");
    }
  } catch (error) {
    setStatus("स्थानीय आवाज़ तैयार नहीं हुई: "+(error && error.message || "TTS initialization error"),"error");
  }
  updateButtons();

  const cleanup=async()=>{
    if (state.destroyed) return;
    state.destroyed=true;
    state.visible=false;
    stopAnimation();
    aborter.abort();
    try { if (state.engine) state.engine.cancel("page-unmount"); } catch (_) {}
    for (const unsubscribe of state.unsubscribers) {
      try { unsubscribe(); } catch (_) {}
    }
    if (state.engine) {
      try { await state.engine.dispose(); } catch (_) {}
    }
    if (state.faceLandmarker) {
      try { state.faceLandmarker.close(); } catch (_) {}
    }
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    if (style.parentNode) style.remove();
    root.innerHTML="";
  };

  return {
    onShow() {
      state.visible=true;
      if (state.basePoints) startAnimation();
    },
    async onHide() {
      state.visible=false;
      stopAnimation();
      await stopSpeech();
    },
    unmount:cleanup,
    selfTest
  };
}

export function selfTest() {
  const square=[
    {x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:5,y:5}
  ];
  const triangles=triangulate(square);
  const affine=affineFromTriangles(
    [{x:0,y:0},{x:10,y:0},{x:0,y:10}],
    [{x:2,y:3},{x:22,y:3},{x:2,y:33}]
  );
  const mapped=affine ? {
    x:affine.a*4+affine.c*5+affine.e,
    y:affine.b*4+affine.d*5+affine.f
  } : null;
  const synthetic=Array.from({length:478},(_,index)=>{
    const angle=(index/468)*Math.PI*2;
    return {x:110+Math.cos(angle)*55,y:130+Math.sin(angle)*70,z:0};
  });
  const put=(index,x,y)=>{synthetic[index]={x,y,z:0};};
  // Left and right eye contours with visible vertical apertures.
  [[159,42],[158,40],[157,41],[173,43],[145,52],[153,54],[154,53],[155,51],
   [386,42],[385,40],[384,41],[398,43],[374,52],[380,54],[381,53],[382,51]].forEach(([i,y],n)=>put(i,n<8?38+(n%4)*4:72+(n%4)*4,y));
  put(33,36,47);put(133,52,47);put(362,70,47);put(263,86,47);
  [468,469,470,471,472].forEach((i,n)=>put(i,44+(n%2),47+(n%3)*0.2));
  [473,474,475,476,477].forEach((i,n)=>put(i,78+(n%2),47+(n%3)*0.2));
  put(61,70,91);put(291,150,91);put(13,110,88);put(14,110,94);
  const upper=[13,312,311,310,415,191,80,81,82];
  const lower=[14,317,402,318,324,95,88,178,87];
  upper.forEach((index,n)=>put(index,95+n*3.6,88+Math.sin(n/8)*0.6));
  lower.forEach((index,n)=>put(index,95+n*3.6,94+Math.sin(n/8)*0.6));
  const gazeState={speechActive:false,paused:false,mouthOpen:0,blink:0,gaze:{x:1,y:0},gazeMode:"center",rate:1};
  const gazePoints=makeAnimatedPoints(synthetic,gazeState,900);
  const blinkState={speechActive:false,paused:false,mouthOpen:0,blink:1,gaze:{x:0,y:0},gazeMode:"center",rate:1};
  const blinkPoints=makeAnimatedPoints(synthetic,blinkState,900);
  const mouthState={speechActive:true,paused:false,speechText:"आ",boundaryCharacter:0,rate:1,mouthOpen:0,blink:0,gaze:{x:0,y:0},gazeMode:"center"};
  const mouthPoints=makeAnimatedPoints(synthetic,mouthState,250);
  const closedState={speechActive:true,paused:true,speechText:"आ",boundaryCharacter:0,rate:1,mouthOpen:0,blink:0,gaze:{x:0,y:0},gazeMode:"center"};
  const closedPoints=makeAnimatedPoints(synthetic,closedState,250);
  const maxPointDelta=(left,right)=>Math.max(...left.map((point,index)=>Math.hypot(point.x-right[index].x,point.y-right[index].y)));
  const mouthGap=(points)=>Math.abs(points[14].y-points[13].y);
  const checks=[
    {id:"delaunay-mesh-builds",passed:triangles.length>=4},
    {id:"affine-photo-warp",passed:Boolean(mapped && Math.abs(mapped.x-10)<1e-6 && Math.abs(mapped.y-18)<1e-6)},
    {id:"mouth-viseme-vowels",passed:characterMouthShape("आ")>characterMouthShape("इ") && characterMouthShape("ओ")>0},
    {id:"bilabial-lip-closure",passed:characterMouthShape("म")<characterMouthShape("आ")},
    {id:"mouth-index-contract",passed:OUTER_MOUTH.includes(61) && OUTER_MOUTH.includes(291) && UPPER_MOUTH.includes(13) && LOWER_MOUTH.includes(14)},
    {id:"eye-iris-index-contract",passed:EYE_GROUPS.every(group=>group.iris.length===5 && group.upper.length===4 && group.lower.length===4)},
    {id:"gaze-produces-visible-iris-displacement",passed:Math.abs(gazePoints[468].x-synthetic[468].x)>4},
    {id:"blink-closes-eye-landmarks",passed:Math.abs(blinkPoints[159].y-synthetic[159].y)>2 && Math.abs(blinkPoints[145].y-synthetic[145].y)>1},
    {id:"speech-opens-photo-mouth",passed:mouthGap(mouthPoints)>mouthGap(synthetic)+3 && mouthState.mouthOpen>0},
    {id:"pause-closes-viseme-motion",passed:closedState.mouthOpen===0 && Math.abs(Math.hypot(closedPoints[14].x-closedPoints[13].x,closedPoints[14].y-closedPoints[13].y)-Math.hypot(synthetic[14].x-synthetic[13].x,synthetic[14].y-synthetic[13].y))<1e-6},
    {id:"face-point-animation-preserves-source-count",passed:makeAnimatedPoints(synthetic,{speechActive:false,paused:false,mouthOpen:0,blink:0,gaze:{x:0,y:0},gazeMode:"center",rate:1},0).length===478},
    {id:"pinned-on-device-runtime",passed:MEDIAPIPE_VERSION==="0.10.21" && FACE_MODEL_URL.startsWith("https://storage.googleapis.com/mediapipe-models/")},
    {id:"dedicated-model-free-avatar-tts-imported",passed:typeof createAvatarTtsEngine==="function"}
  ];
  return {status:checks.every(check=>check.passed)?"PASSED":"FAILED",total:checks.length,passed:checks.filter(check=>check.passed).length,failed:checks.filter(check=>!check.passed).length,checks};
}

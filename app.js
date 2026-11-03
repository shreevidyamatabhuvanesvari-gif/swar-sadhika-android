'use strict';

/*
 * Swar-Sadhika GitHub Pages Web Index Panel.
 * PASS is counted only when progress = 100 and test context,
 * timezone-aware timestamp, and evidence are recorded.
 * This verifies record completeness; it cannot prove evidence is genuine.
 */

const STATUS_LABELS = Object.freeze({
  PASS: 'प्रमाणित PASS',
  IN_PROGRESS: 'कार्य जारी',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  NOT_STARTED: 'शुरू नहीं'
});

const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));
const REQUIRED_IDS = [
  'refreshButton','statusFilter','moduleList','overallPercent','overallBar',
  'totalCount','passCount','remainingCount','buildLabel','lastUpdated',
  'lastTestNote','overallNote','dataSource'
];

const FALLBACK_FEATURES = [
  ['index_panel','वेब Index Panel एवं Progress Dashboard','IN_PROGRESS','GitHub Pages का प्रारम्भिक प्रगति डैशबोर्ड उपलब्ध है। वास्तविक मॉड्यूल लॉन्च और AI नियंत्रण अभी विकसित होने हैं।'],
  ['local_model_loading','Browser Local TTS Model Loading','NOT_STARTED','Chrome में स्थानीय TTS मॉडल प्राप्त करने और लोड करने की सुविधा बाकी है।'],
  ['hindi_female_tts','Hindi Female TTS','NOT_STARTED','वास्तविक स्त्री-स्वर ऑडियो अभी उत्पन्न और सुना नहीं गया है।'],
  ['sanskrit_pronunciation','Sanskrit Pronunciation','NOT_STARTED','संस्कृत उच्चारण का वास्तविक ऑडियो परीक्षण बाकी है।'],
  ['chant_prosody','Chant-style Prosody','NOT_STARTED','लय, मात्रा, विराम और स्वर-उतार की सुविधा बाकी है।'],
  ['audio_generation_playback','Audio Generation एवं Playback','NOT_STARTED','ब्राउज़र में वास्तविक ऑडियो निर्माण और सुनने की सुविधा बाकी है।'],
  ['audio_save_share','Audio Save एवं Share','NOT_STARTED','तैयार ऑडियो को डाउनलोड और साझा करने का परीक्षण बाकी है।'],
  ['video_import','Video Import एवं Preview','NOT_STARTED','उपयोगकर्ता द्वारा चुने गए वीडियो को ब्राउज़र में खोलने की सुविधा बाकी है।'],
  ['caption_sync','Caption Synchronization','NOT_STARTED','ऑडियो के साथ पाठ और पंक्ति Highlight का तालमेल बाकी है।'],
  ['video_full_duration','पाठ की अवधि तक Video Playback','NOT_STARTED','पूरा पाठ समाप्त होने तक वीडियो चलाने की सुविधा बाकी है।'],
  ['lip_sync','Audio-Synchronized Lip-Sync','NOT_STARTED','वास्तविक ऑडियो से Avatar के होंठों का तालमेल बाकी है।'],
  ['body_language','Body Language एवं Expressions','NOT_STARTED','Avatar के भाव, सिर और शरीर की गति की सुविधा बाकी है।'],
  ['mp4_export','MP4 Export','NOT_STARTED','तैयार Audio/Video को MP4 में निर्यात करने की सुविधा बाकी है।'],
  ['offline_operation','Offline Browser Operation','NOT_STARTED','आवश्यक संसाधन उपलब्ध होने के बाद offline संचालन का परीक्षण बाकी है।'],
  ['privacy_permissions','Browser Privacy एवं Permissions','NOT_STARTED','फाइल, ऑडियो और वीडियो अनुमतियों तथा स्थानीय डेटा की जाँच बाकी है।']
].map(([id,name,status,summary]) => ({
  id,name,status,progress:0,summary,
  testEnvironment:'',lastTestAt:null,evidence:null,
  blocker:'वास्तविक कार्य और परीक्षण बाकी है।'
}));

const FALLBACK_DATA = {
  schemaVersion:1,
  buildLabel:'0.2.0-web-index-panel',
  lastUpdated:'प्रारम्भिक वेब Index Panel स्रोत',
  lastTestNote:'Browser में वास्तविक TTS, Audio और Video परीक्षण अभी प्रमाणित नहीं हैं।',
  features:FALLBACK_FEATURES
};

let currentData = FALLBACK_DATA;
let isLoading = false;

function byId(id) { return document.getElementById(id); }

function setText(id,value) {
  const element=byId(id);
  if(element) element.textContent=String(value);
}

function textOr(value,fallback='दर्ज नहीं') {
  return typeof value==='string' && value.trim()!=='' ? value.trim() : fallback;
}

function isMeaningfulEvidenceText(value) {
  if(typeof value!=='string' || value.trim()==='') return false;
  const text=value.trim().toLowerCase();
  if(/^(अभी|not tested|not available|none|null|n\/a|दर्ज नहीं)/i.test(text)) return false;
  if(/(परीक्षण बाकी|जाँच बाकी|अभी नहीं हुआ|अभी उपलब्ध नहीं|not yet tested|pending)/i.test(text)) return false;
  return true;
}

function isValidTestTimestamp(value) {
  if(typeof value!=='string') return false;
  const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if(!iso.test(value)) return false;
  const time=Date.parse(value);
  return Number.isFinite(time) && time<=Date.now()+5*60*1000;
}

function normalizeFeature(item,index,seenIds) {
  if(!item || typeof item!=='object' || Array.isArray(item)) {
    throw new Error(`मॉड्यूल ${index+1} का रिकॉर्ड वैध नहीं है।`);
  }
  const id=textOr(item.id,'');
  const name=textOr(item.name,'');
  if(!id || !name) throw new Error(`मॉड्यूल ${index+1} में id या name नहीं है।`);
  if(seenIds.has(id)) throw new Error(`दोहराया गया मॉड्यूल ID: ${id}`);
  seenIds.add(id);
  const progress=item.progress;
  if(typeof progress!=='number' || !Number.isFinite(progress) || progress<0 || progress>100) {
    throw new Error(`मॉड्यूल ${id} की progress संख्या 0 से 100 के बीच नहीं है।`);
  }
  let status=VALID_STATUSES.has(item.status)?item.status:'BLOCKED';
  const notes=[];
  if(!VALID_STATUSES.has(item.status)) notes.push(`अमान्य Status "${String(item.status)}" के कारण BLOCKED किया गया।`);
  if(status==='PASS') {
    if(progress!==100) notes.push('PASS के लिए progress 100 होना आवश्यक है।');
    if(!isMeaningfulEvidenceText(item.testEnvironment)) notes.push('वास्तविक परीक्षण परिवेश दर्ज नहीं है।');
    if(!isValidTestTimestamp(item.lastTestAt)) notes.push('समय-क्षेत्र सहित वैध ISO परीक्षण समय दर्ज नहीं है।');
    if(!isMeaningfulEvidenceText(item.evidence)) notes.push('परीक्षण प्रमाण/संदर्भ दर्ज नहीं है।');
    if(notes.length>0) status='BLOCKED';
  }
  const existingBlocker=textOr(item.blocker,'');
  return {
    id,name,status,progress,
    summary:textOr(item.summary),
    testEnvironment:textOr(item.testEnvironment),
    lastTestAt:isValidTestTimestamp(item.lastTestAt)?item.lastTestAt:null,
    evidence:textOr(item.evidence,''),
    blocker:[existingBlocker,...notes].filter(Boolean).join(' '),
    passRejected:notes.length>0 && item.status==='PASS'
  };
}

function normalizeData(data) {
  if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('प्रगति डेटा वैध JSON Object नहीं है।');
  if(data.schemaVersion!==1) throw new Error('schemaVersion 1 होना चाहिए।');
  if(!Array.isArray(data.features) || data.features.length===0) throw new Error('progress.json में features सूची नहीं मिली।');
  const ids=new Set();
  return {
    schemaVersion:1,
    buildLabel:textOr(data.buildLabel),
    lastUpdated:textOr(data.lastUpdated),
    lastTestNote:textOr(data.lastTestNote),
    features:data.features.map((item,index)=>normalizeFeature(item,index,ids))
  };
}

function makeElement(tag,className,text) {
  const element=document.createElement(tag);
  if(className) element.className=className;
  if(typeof text==='string') element.textContent=text;
  return element;
}

function renderModules() {
  const host=byId('moduleList');
  if(!host) return;
  const filter=byId('statusFilter')?.value||'ALL';
  const features=currentData.features.filter(feature=>filter==='ALL'||feature.status===filter);
  host.replaceChildren();
  if(features.length===0) {
    host.append(makeElement('p','empty','इस स्थिति में कोई मॉड्यूल नहीं है।'));
    return;
  }
  for(const feature of features) {
    const card=makeElement('article','module-card');
    const head=makeElement('div','module-head');
    head.append(
      makeElement('h3','module-title',feature.name),
      makeElement('span',`pill ${feature.status}`,STATUS_LABELS[feature.status])
    );
    const track=makeElement('div','mini-track');
    const fill=makeElement('div','progress-fill');
    fill.style.width=`${feature.progress}%`;
    fill.setAttribute('role','progressbar');
    fill.setAttribute('aria-valuemin','0');
    fill.setAttribute('aria-valuemax','100');
    fill.setAttribute('aria-valuenow',String(feature.progress));
    track.append(fill);
    const meta=makeElement('div','module-meta');
    meta.append(
      makeElement('span','',`मॉड्यूल तैयारी: ${feature.progress}%`),
      makeElement('span','',feature.id)
    );
    const details=makeElement('div','module-details');
    details.append(
      makeElement('p','module-summary',feature.summary),
      makeElement('p','',`परीक्षण परिवेश: ${feature.testEnvironment}`),
      makeElement('p','',`अंतिम परीक्षण: ${feature.lastTestAt||'अभी नहीं हुआ'}`),
      makeElement('p','',`प्रमाण: ${feature.evidence||'अभी उपलब्ध नहीं'}`)
    );
    if(feature.blocker) details.append(makeElement('p','',`रुकावट / जाँच टिप्पणी: ${feature.blocker}`));
    card.append(head,track,meta,details);
    host.append(card);
  }
}

function render(data) {
  const features=data.features;
  const passed=features.filter(item=>item.status==='PASS').length;
  const inProgress=features.filter(item=>item.status==='IN_PROGRESS').length;
  const total=features.length;
  const percent=total?Math.round((passed/total)*100):0;
  const rejectedPasses=features.filter(item=>item.passRejected).length;
  setText('overallPercent',`${percent}%`);
  setText('totalCount',total);
  setText('passCount',passed);
  setText('remainingCount',total-passed);
  setText('buildLabel',data.buildLabel);
  setText('lastUpdated',data.lastUpdated);
  setText('lastTestNote',data.lastTestNote);
  const bar=byId('overallBar');
  if(bar) {
    bar.style.width=`${percent}%`;
    bar.setAttribute('aria-valuenow',String(percent));
  }
  let note=`कुल ${total} में ${passed} मॉड्यूल प्रमाण सहित PASS हैं।`;
  if(inProgress>0) note+=` ${inProgress} मॉड्यूल पर काम जारी है।`;
  if(rejectedPasses>0) note+=` ${rejectedPasses} अपूर्ण PASS प्रविष्टियाँ BLOCKED की गईं।`;
  setText('overallNote',note);
  currentData=data;
  renderModules();
}

async function loadProgress() {
  if(isLoading) return;
  isLoading=true;
  const refreshButton=byId('refreshButton');
  if(refreshButton) refreshButton.disabled=true;
  setText('dataSource','डेटा स्रोत: progress.json पढ़ा जा रहा है…');
  try {
    const response=await fetch(`./progress.json?updated=${Date.now()}`,{
      method:'GET',cache:'no-store',headers:{Accept:'application/json'}
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=normalizeData(await response.json());
    render(data);
    const rejected=data.features.filter(item=>item.passRejected).length;
    const suffix=rejected?` · ${rejected} अपूर्ण PASS प्रविष्टियाँ BLOCKED की गईं`:'';
    setText('dataSource',`डेटा स्रोत: GitHub Pages पर प्रकाशित progress.json${suffix}`);
  } catch(error) {
    render(normalizeData(FALLBACK_DATA));
    const message=error instanceof Error?error.message:'अज्ञात त्रुटि';
    setText('dataSource',`progress.json लोड/जाँच नहीं हुआ (${message}); प्रारम्भिक सुरक्षित डेटा दिखाया जा रहा है।`);
    console.error('Swar-Sadhika progress load error:',error);
  } finally {
    isLoading=false;
    if(refreshButton) refreshButton.disabled=false;
  }
}

function initializeDashboard() {
  const missing=REQUIRED_IDS.filter(id=>!byId(id));
  if(missing.length>0) {
    console.error('Dashboard HTML में आवश्यक IDs नहीं मिले:',missing);
    setText('dataSource',`HTML में ये आवश्यक तत्व नहीं मिले: ${missing.join(', ')}`);
  }
  byId('refreshButton')?.addEventListener('click',loadProgress);
  byId('statusFilter')?.addEventListener('change',renderModules);
  loadProgress();
}

if(document.readyState==='loading') {
  document.addEventListener('DOMContentLoaded',initializeDashboard,{once:true});
} else {
  initializeDashboard();
}

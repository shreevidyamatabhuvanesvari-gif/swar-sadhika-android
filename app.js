'use strict';

const FALLBACK = {
  schemaVersion: 1,
  buildLabel: '0.1.0-index-panel',
  lastUpdated: 'प्रारम्भिक Index Panel स्रोत',
  lastTestNote: 'अभी Android SDK, Gradle और वास्तविक Android डिवाइस पर Build/Installation परीक्षण दर्ज नहीं है।',
  features: [
    ['index_panel','Index Panel एवं Progress Dashboard','IN_PROGRESS',35,'Dashboard का प्रारम्भिक स्रोत तैयार; Android Build और वास्तविक डिवाइस परीक्षण बाकी।','Android पर Build/Runtime परीक्षण बाकी।'],
    ['android_launch','Android App Launch','NOT_STARTED',0,'Android ऐप का पहला Launch परीक्षण बाकी।','APK Build और डिवाइस स्थापना बाकी।'],
    ['local_model_loading','Local TTS Model Loading','NOT_STARTED',0,'स्थानीय मॉडल चयन और लोडिंग सत्यापित नहीं।','मॉडल स्रोत, लाइसेंस और फाइलें जाँचनी हैं।'],
    ['hindi_female_tts','Hindi Female TTS','NOT_STARTED',0,'वास्तविक स्त्री-स्वर ऑडियो अभी जाँचा नहीं गया।','स्थानीय TTS एकीकरण बाकी।'],
    ['sanskrit_pronunciation','Sanskrit Pronunciation','NOT_STARTED',0,'संस्कृत उच्चारण का ऑडियो परीक्षण बाकी।','संस्कृत परीक्षण-पाठ और ऑडियो जाँच बाकी।'],
    ['chant_prosody','Chant-style Prosody','NOT_STARTED',0,'लय, मात्रा, विराम और स्वर-उतार की जाँच बाकी।','Prosody नियंत्रण बाकी।'],
    ['audio_generation_playback','Audio Generation एवं Playback','NOT_STARTED',0,'वास्तविक ऑडियो बाइट्स, अवधि और Playback जाँचना बाकी।','TTS इंजन एकीकरण बाकी।'],
    ['audio_save_share','Audio Save एवं Share','NOT_STARTED',0,'ऑडियो सेव और साझा करने का परीक्षण बाकी।','ऑडियो आउटपुट मॉड्यूल बाकी।'],
    ['video_import','Video Import एवं Preview','NOT_STARTED',0,'सुरक्षित वीडियो चयन और Preview बाकी।','Android Video Picker और Preview बाकी।'],
    ['caption_sync','Caption Synchronization','NOT_STARTED',0,'ऑडियो के साथ टेक्स्ट Highlight का परीक्षण बाकी।','ऑडियो टाइमस्टैम्प और Caption renderer बाकी।'],
    ['video_full_duration','पूरा पाठ समाप्त होने तक Video Playback','NOT_STARTED',0,'पूरा पाठ समाप्त होने तक वीडियो चलाने की जाँच बाकी।','वीडियो टाइमलाइन और Loop नियंत्रण बाकी।'],
    ['lip_sync','Lip-sync','NOT_STARTED',0,'वास्तविक ऑडियो से होंठों का तालमेल जाँचना बाकी।','Avatar और Viseme pipeline चयन बाकी।'],
    ['body_language','Body Language एवं Expressions','NOT_STARTED',0,'चेहरे और शरीर की गति का परीक्षण बाकी।','Avatar और Gesture timeline बाकी।'],
    ['mp4_export','MP4 Export','NOT_STARTED',0,'अंतिम वीडियो फाइल और Playback जाँचना बाकी।','स्थानीय Video Composition बाकी।'],
    ['offline_operation','Offline Operation','NOT_STARTED',0,'Airplane mode में मुख्य सुविधाओं का परीक्षण बाकी।','स्थानीय मॉडल एकीकरण बाकी।'],
    ['privacy_permissions','Privacy एवं Permissions','NOT_STARTED',0,'न्यूनतम Permissions और स्थानीय डेटा व्यवहार जाँचना बाकी।','Permission audit बाकी।'],
    ['android_build_install','Android Build एवं Installation','NOT_STARTED',0,'Signed APK और फोन पर स्थापना बाकी।','Android Build/Signing परीक्षण बाकी.']
  ].map(([id,name,status,progress,summary,blocker]) => ({id,name,status,progress,summary,blocker,testEnvironment:'अभी वास्तविक Android परीक्षण दर्ज नहीं',lastTestAt:null,evidence:null}))
};

const statusLabels = {
  PASS: 'PASS', IN_PROGRESS: 'कार्य जारी', FAIL: 'FAIL',
  BLOCKED: 'BLOCKED', NOT_STARTED: 'शुरू नहीं'
};
const $ = (id) => document.getElementById(id);
let currentData = FALLBACK;

function safeText(value, fallback='दर्ज नहीं') {
  return (typeof value === 'string' && value.trim()) ? value : fallback;
}
function validStatus(value) {
  return Object.hasOwn(statusLabels, value) ? value : 'BLOCKED';
}
function render(data) {
  const features = Array.isArray(data.features) ? data.features : [];
  const normalized = features.map(item => ({
    ...item,
    status: validStatus(item.status),
    progress: Number.isFinite(Number(item.progress)) ? Math.max(0, Math.min(100, Number(item.progress))) : 0
  }));
  const passed = normalized.filter(x => x.status === 'PASS').length;
  const overall = normalized.length ? Math.round(passed / normalized.length * 100) : 0;
  const inProgress = normalized.filter(x => x.status === 'IN_PROGRESS').length;
  const remaining = normalized.length - passed - inProgress;

  $('overallPercent').textContent = `${overall}%`;
  $('overallBar').style.width = `${overall}%`;
  $('totalCount').textContent = normalized.length;
  $('passCount').textContent = passed;
  $('remainingCount').textContent = remaining + inProgress;
  $('buildLabel').textContent = safeText(data.buildLabel);
  $('lastUpdated').textContent = safeText(data.lastUpdated);
  $('lastTestNote').textContent = safeText(data.lastTestNote);
  $('overallNote').textContent = `कुल ${normalized.length} में ${passed} मॉड्यूल वास्तविक प्रमाण सहित PASS हैं।`;
  currentData = {...data, features: normalized};
  renderModules();
}

function renderModules() {
  const filter = $('statusFilter').value;
  const features = currentData.features.filter(x => filter === 'ALL' || x.status === filter);
  const host = $('moduleList');
  host.replaceChildren();
  if (!features.length) {
    const p = document.createElement('p'); p.className='empty'; p.textContent='इस स्थिति में कोई मॉड्यूल नहीं है।'; host.append(p); return;
  }
  for (const f of features) {
    const card = document.createElement('article'); card.className='module-card';
    const head = document.createElement('div'); head.className='module-head';
    const title = document.createElement('h3'); title.className='module-title'; title.textContent=safeText(f.name, f.id);
    const pill = document.createElement('span'); pill.className=`pill ${f.status}`; pill.textContent=statusLabels[f.status];
    head.append(title,pill);
    const summary = document.createElement('p'); summary.className='module-summary'; summary.textContent=safeText(f.summary);
    const track = document.createElement('div'); track.className='mini-track';
    const fill = document.createElement('div'); fill.className='progress-fill'; fill.style.width=`${f.progress}%`; track.append(fill);
    const meta = document.createElement('div'); meta.className='module-meta';
    const prep = document.createElement('span'); prep.textContent=`मॉड्यूल तैयारी: ${f.progress}%`;
    const id = document.createElement('span'); id.textContent=f.id;
    meta.append(prep,id);
    const details = document.createElement('div'); details.className='module-details';
    const env = document.createElement('p'); env.textContent=`परीक्षण परिवेश: ${safeText(f.testEnvironment)}`;
    const date = document.createElement('p'); date.textContent=`अंतिम परीक्षण: ${safeText(f.lastTestAt, 'अभी नहीं हुआ')}`;
    const evidence = document.createElement('p'); evidence.textContent=`प्रमाण: ${safeText(f.evidence, 'अभी उपलब्ध नहीं')}`;
    details.append(env,date,evidence);
    if (f.blocker) { const b=document.createElement('p'); b.textContent=`रुकावट: ${f.blocker}`; details.append(b); }
    card.append(head,summary,track,meta,details);
    host.append(card);
  }
}

async function loadProgress() {
  $('refreshButton').disabled = true;
  $('dataSource').textContent = 'डेटा स्रोत: progress.json पढ़ा जा रहा है…';
  try {
    const response = await fetch(`./progress.json?updated=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('progress.json में features सूची नहीं मिली');
    render(data);
    $('dataSource').textContent = 'डेटा स्रोत: GitHub Pages पर प्रकाशित progress.json';
  } catch (error) {
    render(FALLBACK);
    $('dataSource').textContent = `progress.json लोड नहीं हुआ (${error.message}); प्रारम्भिक सुरक्षित डेटा दिखाया जा रहा है।`;
  } finally {
    $('refreshButton').disabled = false;
  }
}

$('refreshButton').addEventListener('click', loadProgress);
$('statusFilter').addEventListener('change', renderModules);
loadProgress();

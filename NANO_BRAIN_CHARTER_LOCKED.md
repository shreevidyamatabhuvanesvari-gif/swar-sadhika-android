# Swar-Sadhika Nano Brain — Locked Master Charter

**दस्तावेज़ ID:** SWAR-NANO-BRAIN-CHARTER  
**संस्करण:** 1.0.7  
**स्थिति:** LOCKED — मूल उद्देश्य और निर्माण-सीमाएँ स्थिर  
**निर्धारण तिथि:** 15 November 2026  
**मुख्य Repository:** `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`  
**प्राथमिक Runtime:** Android Chrome  
**मुख्य निष्पादन नीति:** Local-first, strict offline after installation

> यह दस्तावेज़ Swar-Sadhika Nano Brain का सर्वोच्च उद्देश्य और scope-control आधार है। आगे बनने वाली प्रत्येक Brain फ़ाइल, module, interface, test और architecture निर्णय इस Charter के अनुरूप होना आवश्यक है।

---

## 1. अंतिम उद्देश्य — LOCKED

Swar-Sadhika Nano Brain का अंतिम उद्देश्य एक **स्वतंत्र, शक्तिशाली, सुरक्षित, स्थानीय और निरंतर विकसित होने वाला बुद्धि-तंत्र** बनाना है, जो उपयोगकर्ता के निर्देश समझे, स्वयं तर्क करे, योजना बनाए, उपलब्ध कौशलों और विशेषज्ञ Engines का समन्वय करे, अपने परिणाम जाँचे, स्थानीय स्मृति बनाए रखे और प्रमाणित अनुभव से अपनी कार्यक्षमता सुधारे।

Brain को केवल chatbot, prompt-response स्क्रीन, TTS नियंत्रण-पैनल या knowledge-file viewer तक सीमित नहीं किया जाएगा।

अंतिम Brain में ये क्षमताएँ होनी चाहिए:

1. **स्वतंत्र समझ:** भाषा, Intent, Context, उद्देश्य और बाधाओं को समझना।
2. **तर्क:** तथ्य, नियम, संबंध, विकल्प और निष्कर्षों का विश्लेषण करना।
3. **योजना:** बड़े निर्देश को छोटे, क्रमबद्ध और जाँचने योग्य कार्यों में विभाजित करना।
4. **कार्य निष्पादन:** स्वीकृत Skills और मौजूदा ऐप Engines को उचित क्रम में चलाना।
5. **सत्यापन:** प्रत्येक महत्त्वपूर्ण परिणाम को नियम, स्रोत, परीक्षण या Engine diagnostics से जाँचना।
6. **स्मृति:** उपयोगकर्ता की स्वीकृत प्राथमिकताएँ, ज्ञान, अनुभव, कार्य-इतिहास और प्रक्रियाएँ स्थानीय रूप से याद रखना।
7. **सीखना:** गलतियों और feedback से सुधार प्रस्तावित करना, उनका परीक्षण करना और स्वीकृति के बाद ही सक्रिय करना।
8. **विशेषज्ञ बुद्धिमत्ता:** Sanskrit/Vedic, Music, Voice, TTS, Singing और Avatar जैसे क्षेत्रों के लिए समर्पित बुद्धि-तंत्र।
9. **स्थानीय AI:** जहाँ Neural Model आवश्यक हो, वहाँ मॉडल का inference डिवाइस पर चले।
10. **विश्वसनीय संचालन:** त्रुटि, कम संसाधन, बंद Runtime या अनुपलब्ध मॉडल की स्थिति में सुरक्षित fallback देना।

**मूल सफलता-नियम:** Brain का मूल्यांकन उसकी वास्तविक तर्क, ज्ञान, कार्य-निष्पादन, स्मृति, सीखने, सुरक्षा और Offline क्षमताओं से होगा—केवल सुंदर UI, बड़े दावों या सफल compilation से नहीं।

## 2. अनिवार्य सीमाएँ — LOCKED

निम्न सीमाएँ इस परियोजना के लिए अनिवार्य हैं:

- कोई बाहरी AI API, cloud inference provider, paid AI subscription या अलग अनिवार्य backend server नहीं।
- Neural inference, Memory और मुख्य निर्णय-प्रक्रिया स्थानीय डिवाइस पर।
- आवश्यक assets/model उपलब्ध और सत्यापित हो जाने के बाद Brain का संचालन Strict Offline होना चाहिए।
- किसी मॉडल या Browser API की क्षमता को वास्तविक Android परीक्षण के बिना उपलब्ध घोषित नहीं किया जाएगा।
- इंटरनेट से प्राप्त सामग्री या model file को बिना provenance, integrity और licence review के विश्वसनीय नहीं माना जाएगा।
- डाउनलोड किए गए executable JavaScript या अज्ञात remote Skills को स्वतः import/execute नहीं किया जाएगा।
- Brain स्वयं अपनी सुरक्षा नीति, permissions, source code या सक्रिय pronunciation rules को बिना नियंत्रित प्रक्रिया के नहीं बदल सकता।
- unreviewed/unverified Knowledge सीधे सक्रिय TTS/Sanskrit output को बदल नहीं सकता।
- उपयोगकर्ता की स्पष्ट अनुमति के बिना कोई destructive action, data deletion, engine replacement या production deployment नहीं।
- कोई सुविधा केवल placeholder, mock, fake inference या simulated data से कार्यशील घोषित नहीं होगी।

Strict Offline का अर्थ है कि आवश्यक Runtime और assets स्थापित होने के बाद मुख्य कार्यों के लिए किसी बाहरी network request या remote inference की आवश्यकता न हो। यदि किसी वैकल्पिक update/import के लिए network उपयोग किया जाए, तो वह उपयोगकर्ता के नियंत्रण में, अलग और स्पष्ट रूप से प्रदर्शित होगा।

## 3. मौजूदा Swar-Sadhika ऐप के साथ संबंध

Nano Brain मौजूदा ऐप का नियंत्रक और बुद्धिमत्ता-स्तर होगा; यह मौजूदा engines की अनावश्यक प्रतिलिपि बनाकर ऐप को दो समानांतर प्रणालियों में विभाजित नहीं करेगा।

मौजूदा आधार:

- Main application और Page Loader
- Nano Server तथा Knowledge API
- TTS Engine और Native SpeechSynthesis backend
- Sanskrit G2P एवं Pronunciation Compiler
- Vedic Sanskrit Pronunciation resources
- Avatar TTS और Avatar/Lip-Sync संबंधित modules

एकीकरण के नियम:

1. मौजूदा Engine का वास्तविक interface पहले audit होगा; उसी के अनुरूप adapter बनाया जाएगा।
2. किसी मौजूदा Engine को replace करने से पहले compatibility, regression और rollback परीक्षण आवश्यक हैं।
3. वर्तमान Project की locked शर्त के अनुसार `index.html` के script tags में नए entry points नहीं जोड़े जाएँगे।
4. नए Brain modules `Part2` naming और स्वीकृत Page Loader/Registry integration नियमों के अनुरूप होंगे।
5. मौजूदा Module Loader/Registry, TTS, Sanskrit, Avatar और Nano Server को बिना आवश्यकता या पृथक स्वीकृति बदला नहीं जाएगा।
6. पुराने `anujadha` ऐप और अन्य असंबद्ध परियोजनाओं को नहीं छुआ जाएगा।

## 4. अंतिम Architecture — LOCKED

Brain को Hybrid Neuro-Symbolic Architecture पर बनाया जाएगा। Symbolic Core मूल निर्णय और सुरक्षा आधार होगा; Local Neural Model प्राकृतिक भाषा, संदर्भ और जटिल pattern समझने में सहायता करेगा।

### 4.1 Central Orchestrator
Intent और Context प्राप्त करना, कार्य को विभाजित करना, योजना बनाना, Skills चुनना, lifecycle नियंत्रित करना और परिणाम एकीकृत करना।

### 4.2 Symbolic Reasoning Core
नियम-आधारित तर्क, constraints, logic, state transitions, निर्णय, योजना-जाँच और deterministic validation। Neural Model unavailable होने पर भी यह आधार कार्यशील रहना चाहिए।

### 4.3 Local Neural Model Runtime
स्थानीय मॉडल load/inference, device-capability checks, memory/resource management, model integrity और measured Android performance। कोई remote inference fallback नहीं।

### 4.4 Memory Core
- Working Memory — वर्तमान कार्य और context
- Episodic Memory — अनुभव और कार्य-इतिहास
- Semantic Memory — सत्यापित ज्ञान और अवधारणाएँ
- Procedural Memory — सफल प्रक्रियाएँ और Skills
- User Preference Memory — उपयोगकर्ता की स्वीकृत प्राथमिकताएँ

### 4.5 Knowledge Intelligence
Sources, provenance, licence, version, confidence, review status और evidence का प्रबंधन। Candidate Knowledge और Active Knowledge अलग रहेंगे।

### 4.6 Learning Intelligence
Feedback analysis, error classification, improvement proposals, regression testing, approval, versioning और rollback। अनुभव-स्मृति, नियम-सुधार और model-weight training को अलग-अलग क्षमताओं के रूप में माना जाएगा।

### 4.7 Skill and Execution Layer
Allowlisted Skills, स्पष्ट input/output contracts, capability permissions, timeouts, audit records और failure recovery। Brain arbitrary JavaScript execution नहीं करेगा।

### 4.8 Domain Intelligence
- Sanskrit/Vedic Intelligence
- Music Theory और Audio Analysis Intelligence
- Voice/TTS Intelligence
- Singing Voice Generation Intelligence
- Avatar, Lip-Sync और Body-Language Intelligence

ये अलग विशेषज्ञ क्षेत्र रहेंगे। विशेष रूप से TTS को Singing Voice Synthesis के समान नहीं माना जाएगा।

### 4.9 Local Runtime and Storage
IndexedDB structured records और metadata के लिए; OPFS बड़े assets/models के लिए जहाँ समर्थित हो; user-authorized folder/SD-card access केवल तभी जब वास्तविक Android/browser API उपलब्ध हो। Volatile Memory fallback को कभी persistent storage नहीं कहा जाएगा।

### 4.10 Safety, Diagnostics and Recovery
Permission gate, schema validation, source verification, integrity checks, audit trail, resource guard, backup, migration, rollback और failure isolation।

## 5. सीखने और ज्ञान-सक्रिय करने का नियम — LOCKED

कोई भी नई जानकारी सीधे सक्रिय Brain behavior, Sanskrit lexicon या TTS output में प्रवेश नहीं करेगी।

अनिवार्य क्रम:

`Source → Capture → Provenance → Review → Validation → Tests → Approval → Versioned Activation`

- अप्रमाणित जानकारी Candidate Store में रह सकती है।
- केवल अनुमोदित और परीक्षण-सफल नियम Active Store में जा सकते हैं।
- प्रत्येक बदलाव का कारण, स्रोत, version और rollback path उपलब्ध होगा।
- उपयोगकर्ता feedback को उपयोगी संकेत माना जाएगा; उसे स्वतः वैज्ञानिक/भाषिक सत्य नहीं माना जाएगा।

## 6. Voice और Music का अंतिम लक्ष्य — LOCKED

Voice Intelligence का उद्देश्य केवल browser की उपलब्ध आवाज़ चुनना नहीं है। अंतिम लक्ष्य स्थानीय रूप से उपलब्ध उपयुक्त Voice Model/Backend के आधार पर स्पष्ट, स्वाभाविक और उपयोगकर्ता द्वारा स्वीकृत स्त्री-सुलभ आवाज़ उपलब्ध कराना है।

सीमाएँ:

- Browser Native SpeechSynthesis आवाज़ के weights/timbre को Brain स्वयं train नहीं कर सकता।
- Lexicon/pronunciation सुधार और वास्तविक neural voice training अलग हैं।
- वास्तविक singing के लिए melody, pitch contour, note duration, rhythm, prosody और audio generation की अलग क्षमता चाहिए।
- Audio Analysis, TTS, Voice Adaptation और Singing Generation के लिए अलग contracts और tests होंगे।
- किसी मॉडल को Hindi/Sanskrit सक्षम घोषित करने से पहले वास्तविक पाठ और उच्चारण benchmark आवश्यक है।

## 7. Storage और Offline का अंतिम लक्ष्य — LOCKED

- Brain की structured memory स्थानीय और स्थायी हो।
- App restart के बाद आवश्यक records उपलब्ध रहें।
- Storage quota, corruption, browser eviction और migration failures संभाले जाएँ।
- Backup/Export/Import और Recovery की व्यवस्था हो।
- बड़े model assets के लिए वास्तविक device support और storage capacity मापी जाए।
- Android SD-card access को उपलब्ध API का प्रमाण पाए बिना अनिवार्य या सक्रिय न बताया जाए।
- Strict Offline certification में network बंद करके cold start, restart, memory access, reasoning, selected Skills और domain tasks जाँचे जाएँ।

## 8. निर्माण-क्रम — LOCKED

निर्माण निम्न क्रम में होगा; कोई चरण केवल जल्दी आगे बढ़ने के लिए छोड़ा नहीं जाएगा:

1. Locked Master Charter — यह दस्तावेज़।
2. वर्तमान Foundation का Android Chrome पर वास्तविक परीक्षण: Navigation, IndexedDB persistence, cold start, quota/error handling और storage diagnostics।
3. Integration/Security/Storage Foundation की शेष कमियाँ दूर करना।
4. Symbolic Reasoning Core।
5. Task Planner और controlled Execution/Safety contracts।
6. Persistent Memory Core।
7. Knowledge Intelligence और source governance।
8. Learning Intelligence तथा approval/rollback।
9. मौजूदा Sanskrit/Nano Server/TTS/Avatar engines के adapters और domain integration।
10. Local Neural Model Runtime का Android device benchmark और चयन।
11. Voice/TTS enhancement तथा अलग Music/Singing Intelligence।
12. Service Worker/asset lifecycle और Strict Offline certification।
13. End-to-end evaluation, recovery, security और user acceptance।

हर नए module से पहले उसकी interface specification और tests तय होंगे। Foundation Android verification के बिना Symbolic Core को Production-Integrated घोषित नहीं किया जाएगा।

## 9. एक फ़ाइल — एक Commit नियम — LOCKED

उपयोगकर्ता के निर्देशानुसार:

1. एक समय में केवल **एक नई या संशोधित Brain फ़ाइल** जोड़ी जाएगी।
2. प्रत्येक फ़ाइल का अपना अलग Git Commit होगा।
3. एक Commit में कई Brain files एक साथ नहीं जोड़ी जाएँगी।
4. हर फ़ाइल के साथ उसका उद्देश्य, dependencies, interface और tests स्पष्ट होंगे।
5. अगले फ़ाइल पर जाने से पहले वर्तमान फ़ाइल का syntax, unit/integration और आवश्यक browser test पूरा किया जाएगा।
6. असफल परीक्षण को छिपाया या हटाया नहीं जाएगा; कारण ठीक करके नया सफल Regression Run दर्ज किया जाएगा।
7. सभी बदलाव पहले अलग Feature Branch/Pull Request में होंगे। `main` और Production तब तक अपरिवर्तित रहेंगे जब तक आवश्यक checks सफल न हों और अलग से स्वीकृति न मिले।
8. कोई नई फ़ाइल केवल संख्या बढ़ाने के लिए नहीं बनाई जाएगी। प्रत्येक फ़ाइल का एक स्पष्ट, परीक्षण योग्य कार्य होना चाहिए।

## 10. सफलता का मापदंड — LOCKED

Brain की सफलता का कोई काल्पनिक प्रतिशत पहले से घोषित नहीं होगा। प्रतिशत केवल निश्चित benchmark set, स्पष्ट scoring rules और वास्तविक Android device runs के बाद निकाला जाएगा।

अंतिम स्वीकृति के लिए निम्न प्रमाण आवश्यक होंगे:

| क्षेत्र | सफलता का प्रमाण |
|---|---|
| Reasoning | निर्धारित प्रश्न/समस्या benchmark पर सही, reproducible परिणाम |
| Planning | multi-step tasks की पूर्णता और dependency correctness |
| Execution | allowlisted Skill का सही input/output और सुरक्षित failure handling |
| Knowledge | provenance, evidence और review-gate का पालन |
| Sanskrit/Vedic | विशेषज्ञ-समीक्षित उच्चारण/व्याकरण benchmark |
| Music | reference audio के विरुद्ध मापी गई pitch/rhythm/audio analysis |
| Voice/TTS | वास्तविक Android पर intelligibility, pronunciation और user acceptance test |
| Singing | generated audio का अलग musical quality benchmark |
| Memory | restart, backup, restore और migration के बाद record integrity |
| Learning | approved changes से benchmark में मापा गया सुधार; regression का पता लगना |
| Security | unauthorized action/code/knowledge activation का परीक्षण में अवरोध |
| Offline | network-disabled cold start और निर्धारित core tasks सफल |
| Reliability | failure recovery, rollback और resource-limit handling |

**CI green होना Brain success का पूर्ण प्रमाण नहीं है।** Browser automation, Android phone testing और domain-level quality benchmarks अलग-अलग दर्ज होंगे।

## 11. Scope Drift रोकने का Change-Control नियम — LOCKED

इस Charter के अंतिम उद्देश्य और अनिवार्य सीमाओं में कोई भी परिवर्तन तभी होगा जब:

1. प्रस्तावित परिवर्तन और उसका कारण लिखित रूप में दिया जाए।
2. उससे मौजूदा engines, offline policy, security और अंतिम लक्ष्य पर प्रभाव बताया जाए।
3. जोखिम और परीक्षण योजना प्रस्तुत हो।
4. उपयोगकर्ता स्पष्ट अनुमति दे।
5. संशोधित Charter का नया version/commit बने; पुराने version का इतिहास सुरक्षित रहे।

कोई तकनीकी सुविधा, library, model या नया UI अपने-आप परियोजना का लक्ष्य नहीं बदल सकता।

---

## 12. वर्तमान स्थिति — लक्ष्य और वास्तविकता अलग रखें

इस दस्तावेज़ के Commit के समय:

**आधार के रूप में उपलब्ध/परीक्षित**
- अलग Nano Brain Foundation Part 2 modules
- Default-deny capability gate और data-only Skill Manifest validation
- IndexedDB structured storage तथा explicit volatile fallback
- optional OPFS/Directory capability adapters
- Integration facade और lifecycle handling
- Foundation self-tests तथा Chromium IndexedDB persistence tests
- Chromium mobile viewport में Nano Brain Page Loader smoke test

**अभी निर्माण/प्रमाणन शेष**
- वास्तविक Android Chrome device verification
- पूरा Symbolic Reasoning और Task Planning
- पूर्ण local Memory/Knowledge/Learning intelligence
- चयनित और benchmark-सफल Local Neural Model Runtime
- trained/adapted neural voice और Singing Generation
- सभी domain engines का end-to-end integration
- Strict Offline certification

इस Charter में वर्णित अंतिम क्षमताएँ **परियोजना के लक्ष्य और स्वीकृति मानक** हैं; इन्हें वर्तमान में पूर्ण या सक्रिय होने का दावा नहीं किया जाता।

## 13. 22-फाइल क्रमिक निर्माण एवं Integration सूची — LOCKED

नीचे दिया गया क्रम उपयोगकर्ता के Master Build & Integration Plan का सटीक file-level क्रम है। इस क्रम को बिना स्पष्ट अनुमति बदला, छोटा या पुनर्व्यवस्थित नहीं किया जाएगा। किसी फाइल का Feature Branch में पहले से मौजूद होना उसकी स्वतंत्र जाँच, स्वीकृति या production readiness का प्रमाण नहीं है।

### A. मौजूदा फाइलें — UPDATE

| क्रम | सटीक फाइल पथ | अनिवार्य कार्य |
|---:|---|---|
| 1 | `assets/js/app.js` | Nano Brain route, Navigation और सुरक्षित Lazy Loading को मौजूदा Main App Page Loader/Lifecycle से जोड़ना; Loader या Registry को अनावश्यक रूप से बदलना नहीं। |
| 2 | `.github/workflows/swar-sadhika-regression.yml` | Brain Integration सहित पूरे App के Regression Tests चलाना; TTS, Sanskrit, Avatar, Video और पुराने Modules के परीक्षण सुरक्षित रखना। |

### B. Foundation — नई फाइलें ADD

| क्रम | सटीक फाइल पथ | अनिवार्य कार्य |
|---:|---|---|
| 3 | `.github/workflows/nano-brain-foundation.yml` | Brain Foundation के Syntax, Self-Test, Browser/Chromium और Integration checks। |
| 4 | `NANO_BRAIN_CHARTER_LOCKED.md` | Brain का सर्वोच्च उद्देश्य, Architecture, सीमाएँ, 22-फाइल क्रम, सत्यापन नियम और Acceptance Criteria। |
| 5 | `assets/js/brain/README-part2.md` | Foundation का उपयोग, interface, data contracts, सीमाएँ और परीक्षण निर्देश। |
| 6 | `assets/js/brain/brain-browser-test-part2.html` | वास्तविक browser APIs के माध्यम से Storage और Browser behavior का परीक्षण। |
| 7 | `assets/js/brain/brain-browser-test-runner-part2.mjs` | स्वचालित Chromium test orchestration और परिणाम सत्यापन। |
| 8 | `assets/js/brain/brain-foundation-selftest-part2.js` | Brain Foundation के सभी उपलब्ध Self-Tests का aggregate परिणाम। |
| 9 | `assets/js/brain/brain-integration-foundation-part2.js` | सुरक्षित App Facade, Initialization और Lifecycle Integration। |
| 10 | `assets/js/brain/brain-security-part2.js` | Input/schema validation, Capability Gate, सुरक्षित identifiers और integrity helpers। |
| 11 | `assets/js/brain/brain-storage-part2.js` | स्थानीय structured storage, metadata, events, migration और उपलब्ध asset storage interfaces। |
| 12 | `assets/js/pages/page-nano-brain-part2.js` | मौजूदा Page Loader में लोड होने वाला Nano Brain Foundation Page। |

### C. शक्तिशाली Brain — भविष्य के नए मॉड्यूल ADD

| क्रम | सटीक फाइल पथ | अनिवार्य कार्य |
|---:|---|---|
| 13 | `assets/js/brain/brain-core-part2.js` | Central Brain Orchestrator; सभी Brain Modules का समन्वय। |
| 14 | `assets/js/brain/brain-memory-engine-part2.js` | Working, Episodic, Semantic, Procedural और स्वीकृत User Preference Memory। |
| 15 | `assets/js/brain/brain-knowledge-engine-part2.js` | Sanskrit, श्लोक, मंत्र, स्तोत्र, वैदिक ऋचा, व्याकरण और उच्चारण ज्ञान; स्रोत एवं प्रमाण प्रबंधन। |
| 16 | `assets/js/brain/brain-reasoning-engine-part2.js` | Symbolic Reasoning, Context Understanding, Logical Analysis और निर्णय सत्यापन। |
| 17 | `assets/js/brain/brain-learning-engine-part2.js` | स्वीकृत उदाहरणों और Feedback से नियंत्रित स्थानीय Learning, परीक्षण, Versioning और Rollback। |
| 18 | `assets/js/brain/brain-task-planner-part2.js` | कार्य विभाजन, निर्भरता, प्राथमिकता, क्रम और परिणाम मूल्यांकन। |
| 19 | `assets/js/brain/brain-media-learning-adapter-part2.js` | उपयोगकर्ता द्वारा उपलब्ध कराए गए Audio/Video और अनुमत Media से Learning Integration। |
| 20 | `assets/js/brain/brain-speech-singing-adapter-part2.js` | मौजूदा TTS और भविष्य के स्थानीय Singing Voice Synthesis का पृथक interface-based Integration। |
| 21 | `assets/js/brain/brain-avatar-adapter-part2.js` | Avatar, Body Language, Facial Expression, Phoneme Synchronization और Lip-Sync Integration। |
| 22 | `assets/js/brain/brain-model-runtime-part2.js` | स्थानीय AI Model Loading, Integrity Verification, Device Resource Management और Inference Runtime। |

### 13.1 क्रम और स्थिति के अनिवार्य नियम

1. इस सूची के क्रमांक स्थिर हैं और भविष्य की file tracking में यही क्रम उपयोग होगा।
2. क्रमांक 13–22 भविष्य के प्रस्तावित मॉड्यूल हैं; वे इस Charter के कारण स्वतः निर्मित या सक्रिय नहीं माने जाएँगे।
3. प्रत्येक फाइल का अपना अलग Commit होना चाहिए। एक Commit में कई Brain फाइलों का नया निर्माण या संशोधन नहीं किया जाएगा।
4. पहले से Feature Branch में मौजूद फाइल को दोबारा बनाकर duplicate नहीं किया जाएगा। उसका वास्तविक content, interface और परीक्षण audit होगा; आवश्यक सुधार उसी एक फाइल के अलग Commit में होगा।
5. प्रत्येक फाइल के लिए dependency/interface review, syntax check, संबंधित Self-Test और आवश्यक Integration/Browser/Android परीक्षण पूरे किए जाएँगे।
6. Foundation tests पास होना Symbolic Reasoning, Neural Model, Singing Generation या पूर्ण Brain readiness का प्रमाण नहीं है।
7. Android Chrome पर वास्तविक device testing और Strict Offline certification अलग Acceptance Gates रहेंगे।
8. `index.html` तथा उसके Script Tags अपरिवर्तित रहेंगे। Brain को मौजूदा Page Loader के घोषित और सुरक्षित integration path से जोड़ना होगा।
9. कोई भी बाहरी AI API, remote inference या अलग अनिवार्य server इस निर्माण क्रम में स्वीकार्य नहीं है।

### 13.2 इस Charter Revision का अर्थ

संस्करण 1.0.1 में केवल इस क्रमिक 22-फाइल सूची और उसके tracking नियमों को स्पष्ट किया गया है। इससे किसी मॉड्यूल की वर्तमान उपलब्धता, गुणवत्ता, Android certification या अंतिम Brain क्षमता के बारे में अतिरिक्त दावा नहीं किया जाता। संस्करण 1.0.0 का Git इतिहास सुरक्षित रहेगा।

---

## 14. शून्य-अनुमान, Local-only निर्माण और Main App Integration Quality Gate — LOCKED

यह अनुभाग उपयोगकर्ता के स्पष्ट निर्देश को बाध्यकारी Engineering Rule बनाता है: Repository में उपलब्ध अधिकृत कार्य-क्षमता का उपयोग करके शक्तिशाली Nano Brain को बिना किसी बाहरी AI सेवा पर निर्भर हुए विकसित करना और उसे Swar-Sadhika Main App में वास्तविक रूप से जोड़ना है। केवल अलग-अलग फाइलें जोड़ना, बिना Integration के modules छोड़ना, या परीक्षण के बिना कार्य पूर्ण बताना स्वीकार्य नहीं है।

### 14.1 Local-only Runtime — अनिवार्य

1. Brain के सामान्य संचालन, reasoning, memory, learning और आवश्यक domain inference के लिए कोई बाहरी AI API, cloud inference provider, paid AI service या अलग अनिवार्य remote backend नहीं होगा।
2. जहाँ Neural Model आवश्यक हो, वहाँ model assets स्थानीय डिवाइस पर स्थापित और सत्यापित होंगे तथा inference स्थानीय रूप से चलेगा।
3. GitHub Repository, GitHub Actions, package installation और development/test tooling परियोजना के निर्माण और सत्यापन के साधन हैं; उन्हें App Runtime की AI dependency नहीं माना जाएगा।
4. किसी model, library या browser capability की offline उपलब्धता device पर वास्तविक installation, integrity verification और network-disabled test के बिना घोषित नहीं होगी।
5. कोई fallback चुपचाप remote service की ओर नहीं जाएगा। Local model या capability अनुपलब्ध होने पर स्पष्ट status और सुरक्षित fallback दिया जाएगा।

### 14.2 Main App Integration — अनिवार्य

1. Nano Brain का एक ही स्वीकृत Main App entry path होगा: मौजूदा `index.html` → `assets/js/app.js` Page Loader → Brain Page → Brain Core/Module Integration।
2. `index.html` तथा उसके Script Tags अपरिवर्तित रहेंगे; Brain के लिए नया Script Tag या parallel app entry point नहीं जोड़ा जाएगा।
3. Main App Navigation में Brain route और mount container, Page Loader में सुरक्षित Lazy Loading, तथा Brain Page के वास्तविक lifecycle hooks का Integration आवश्यक है।
4. प्रत्येक Brain module को घोषित central Brain interfaces/Orchestrator से जुड़ना होगा। किसी module को केवल Repository में उपस्थित होने से Integrated नहीं माना जाएगा।
5. मौजूदा Sanskrit, Nano Server, TTS, Singing, Avatar, Video और Media engines से जुड़ने से पहले उनके वास्तविक exports, inputs, outputs, lifecycle और side effects का source audit होगा। Adapter केवल सत्यापित interface के अनुरूप बनेगा।
6. Existing engines को अनावश्यक रूप से duplicate, replace या rewrite नहीं किया जाएगा। Engine replacement के लिए अलग compatibility, regression, rollback और user approval आवश्यक है।
7. हर module की Integration स्थिति को इन अलग अवस्थाओं में दर्ज करें: `PROPOSED`, `IMPLEMENTED`, `INTEGRATED`, `CI-TESTED`, `ANDROID-VERIFIED`, `OFFLINE-CERTIFIED`। एक अवस्था दूसरी अवस्था का स्वतः प्रमाण नहीं है।

### 14.3 One-file Engineering Gate — अनिवार्य

प्रत्येक क्रमांकित फाइल के लिए निम्न क्रम पूरा किए बिना अगली फाइल पर कार्य शुरू नहीं होगा:

1. Feature Branch पर target file, current commit, file existence और संबंधित source dependencies जाँचना।
2. उसी फाइल के वास्तविक contract, imports/exports, data flow और Main App integration point का audit करना।
3. केवल निर्धारित एक फाइल में आवश्यक परिवर्तन करना; unrelated files को न छूना।
4. उस एक फाइल का स्वतंत्र Git Commit और diff/content SHA सत्यापित करना।
5. आवश्यक syntax, module self-test, integration contract और browser/Chromium checks चलाना।
6. Workflow result के साथ failed, skipped और environment-dependent assertions अलग-अलग दर्ज करना।
7. किसी failure पर root cause ठीक करना और संबंधित परीक्षण पुनः सफल कराना; failure को हटाना, छिपाना या PASS में बदलना निषिद्ध है।
8. पूर्ण परिणाम, सीमाएँ और अगले क्रमांक की फाइल का पथ तथा उद्देश्य उपयोगकर्ता को उसी उत्तर में बताना।

### 14.4 Zero-known-defect और सत्यता नियम

1. किसी ज्ञात असफल या अपूर्ण आवश्यक जाँच को लंबित छोड़कर अगली implementation file पर आगे नहीं बढ़ेंगे।
2. कोई test assertion, security gate या regression check केवल workflow green दिखाने के लिए कमजोर या निष्क्रिय नहीं किया जाएगा।
3. कोई fake, mock, placeholder या अनुमानित output वास्तविक AI inference, durable storage, Android behavior या engine integration के रूप में प्रदर्शित नहीं होगा।
4. हर रिपोर्ट में यह स्पष्ट होगा कि कौन-सा परीक्षण वास्तव में चला, कौन-सा PASS/FAIL/SKIPPED रहा, और कौन-सी जाँच अभी हुई ही नहीं।
5. Absolute zero-defect guarantee तकनीकी रूप से सत्यापित नहीं की जा सकती। इस Charter का व्यावहारिक quality target है: कोई ज्ञात defect अनसुलझा छोड़कर आगे न बढ़ना, सभी आवश्यक स्वचालित परीक्षण सफल करना, और शेष जोखिम/सीमाएँ स्पष्ट रखना।
6. Repository write access या CI green होना सम्पूर्ण app correctness, physical Android compatibility या production readiness का प्रमाण नहीं है।

### 14.6 आवश्यक बदलाव, दक्षता और समय-सीमा — LOCKED

1. किसी मौजूदा फाइल को केवल इसलिए दोबारा update नहीं किया जाएगा कि वह निर्माण-क्रम में अगली है। पहले उसके वर्तमान content SHA, हाल के commit, dependencies, वास्तविक defect, integration gap और test evidence की समीक्षा होगी।
2. यदि फाइल पहले से अपेक्षित कार्य सही ढंग से कर रही है और कोई प्रमाणित defect, security issue, missing requirement या आवश्यक integration gap नहीं है, तो उसे दोबारा update नहीं किया जाएगा।
3. एक फाइल को बार-बार बदलने से बचें। एक ही review में सभी प्रमाणित आवश्यक सुधार समेकित करें; पर unrelated changes या multi-file scope expansion न करें।
4. हर update report में स्पष्ट रूप से बताएं: (a) बदलाव क्यों आवश्यक था, (b) क्या तकनीकी व्यवहार बदला, (c) App की वास्तविक क्षमता/दक्षता पर मापने योग्य प्रभाव क्या है, और (d) कौन-सा test उस प्रभाव का प्रमाण देता है।
5. यदि प्रभाव को विश्वसनीय रूप से मापा नहीं गया है, तो कोई प्रतिशत, speed-up या “इतनी शक्ति बढ़ी” जैसा अनुमान न दें। “कोई सीधा runtime gain नहीं; केवल testability/security/maintainability में सुधार” कहना स्वीकार्य और आवश्यक है।
6. जल्द पूर्ण करने के लिए अनावश्यक refactoring, duplicate modules या repeated commits न करें। पहले से सत्यापित और उपयोगी काम सुरक्षित रखते हुए सबसे छोटे प्रमाणित बदलाव को प्राथमिकता दें।
7. एक फाइल का आवश्यक update, commit और relevant verification पूरा होने के बाद ही अगले क्रमांक पर जाएँ। किसी test pass का अर्थ केवल उसी test की coverage तक सीमित रहेगा।

### 14.5 इस लॉक का Acceptance Evidence

किसी Brain increment को स्वीकार करने के लिए आवश्यक evidence में शामिल होगा:

- exact branch, file path, commit SHA और audited diff;
- dependency/interface और Main App integration evidence;
- आवश्यक self-tests और पूरे App के regression results;
- वास्तविक Browser/Chromium results, जहाँ लागू हों;
- physical Android Chrome test record, जब device-specific behavior का दावा हो;
- network-disabled test record, जब Offline capability का दावा हो;
- प्रत्येक skipped assertion और unresolved limitation की स्पष्ट सूची।

इस अनुभाग का उद्देश्य केवल त्रुटियाँ कम करना नहीं, बल्कि निर्माण-प्रक्रिया को सत्यापन-आधारित, traceable और Main App-केंद्रित बनाना है।

---

## 15. Main App Integration कब और किस चरण में होगा — LOCKED

यह अनुभाग उपयोगकर्ता के सीधे प्रश्न “निर्माणाधीन Brain को मूल Main App से कब जोड़ेंगे?” का बाध्यकारी उत्तर और निष्पादन-क्रम निर्धारित करता है।

### 15.1 वर्तमान स्थिति — Foundation का आंशिक Integration पहले से मौजूद

निम्न कनेक्शन Feature Branch पर मौजूद source के अनुसार लागू है:

`index.html` Navigation/View
→ `assets/js/app.js` PAGE_MODULES और सुरक्षित Lazy Page Loader
→ `page-nano-brain-part2.js` mount(context)
→ `brain-integration-foundation-part2.js`
→ `brain-security-part2.js` + `brain-storage-part2.js`

यह Brain Foundation Page को Main App के Navigation से खोलता है और उसे सीमित App Facade, Security और Storage देता है। इसे पूर्ण central intelligence integration नहीं कहा जाएगा। Main App TTS route key `jump-text` अभी Brain Facade की route allowlist में मौजूद नहीं है; संबंधित Integration Contract Audit/Correction के बाद ही इस route bridge को पूर्ण माना जाएगा।

### 15.2 Central Brain को Main App में जोड़ने का प्रारंभिक बिंदु

Central Brain Integration क्रमांक 13 — `assets/js/brain/brain-core-part2.js` के निर्माण के साथ शुरू होगा। इसे सभी 22 फाइलें समाप्त होने तक टाला नहीं जाएगा।

इस milestone में:
1. Brain Core को मौजूदा Main App Facade और Brain Integration Foundation से जोड़ा जाएगा।
2. Brain Page/Page Loader से Core का नियंत्रित initialization, lifecycle, diagnostics और shutdown contract स्थापित होगा।
3. Core, Memory/Knowledge/Reasoning/Planning adapters के लिए एक केंद्रीय module interface देगा।
4. Core के initialization और उपयोगकर्ता-facing Brain route का वास्तविक Main App Browser Integration Test होगा।
5. यदि Page/Integration bridge की मौजूदा फाइल में आवश्यक बदलाव हो, तो उसका अलग one-file Commit और regression test होगा; `index.html` Script Tags अपरिवर्तित रहेंगे।

इस प्रकार Main App में Brain का central orchestration क्रमांक 13 के चरण से जुड़ना शुरू होगा, न कि सभी भावी modules बन जाने के बाद।

### 15.3 प्रत्येक बाद के Module का तत्काल Integration

क्रमांक 14–22 में कोई module अलग-थलग deliverable नहीं माना जाएगा। हर module के बनने पर:
- उसका interface Central Brain Core में register/connect होगा;
- संबंधित मौजूदा App Engine का source/interface audit होगा;
- आवश्यक adapter के माध्यम से वास्तविक data/control flow जोड़ा जाएगा;
- module self-test और Main App integration/regression test चलेंगे;
- feature को केवल उसके प्रमाणित स्तर तक ही Integrated/Ready घोषित किया जाएगा।

विशेषतः Sanskrit/Nano Server, TTS, Singing Voice Synthesis, Avatar/Lip-Sync, Media Learning और Local Model Runtime अपने-अपने adapter/runtime उपलब्ध होने और test pass होने के बाद ही सक्रिय क्षमताएँ माने जाएँगे।

### 15.4 Full Main App Integration की अंतिम स्वीकृति

पूरा Brain तभी Main App में Integrated/Accepted माना जाएगा जब:
1. Central Brain Core Main App से वास्तविक रूप में जुड़ा हो;
2. क्रमांक 14–22 के आवश्यक engines/adapters Core से जुड़े और परीक्षणित हों;
3. TTS, Sanskrit, Avatar, Video/Media तथा अन्य मौजूदा सुविधाएँ Regression Tests में सुरक्षित रहें;
4. प्रत्येक integration पर Browser/Chromium tests सफल हों;
5. वास्तविक Android Chrome डिवाइस पर app cold start, navigation, performance, storage, voice/avatar flow और recovery परीक्षण दर्ज हों;
6. Strict Offline दावे के लिए network-disabled वास्तविक device test सफल हो;
7. सभी आवश्यक Acceptance Criteria पूरे हों और कोई ज्ञात high-severity defect खुला न हो।

### 15.5 समय-सीमा के बारे में सत्यता

किसी निश्चित कैलेंडर तारीख़ या अवधि का अनुमान बिना implementation और device-test evidence के नहीं दिया जाएगा। प्रगति फाइल-क्रम और acceptance gates से मापी जाएगी। लेकिन integration का प्रारंभिक milestone निश्चित है: Foundation bridge की आवश्यक जाँच/सुधार के बाद क्रमांक 13 पर Central Brain Core को Main App से जोड़ना शुरू करना अनिवार्य है; इसे क्रमांक 22 के बाद तक टालना इस Charter का उल्लंघन होगा।

---

## 16. Brain की पूरी क्षमता सुरक्षित रखना — NO POWER-REDUCTION LOCKED

यह अनुभाग उपयोगकर्ता के निर्देश को सर्वोच्च Capability Preservation नियम के रूप में दर्ज करता है: App या Brain की वास्तविक और निर्धारित क्षमता को कमजोर करने वाला परिवर्तन स्वीकार्य नहीं है।

### 16.1 सभी 12 Capability प्रकार सुरक्षित रहेंगे

Security Foundation में घोषित ये सभी बारह capability types Brain Architecture के भविष्य के लिए सुरक्षित रहेंगे:

1. `memory.read`
2. `memory.write`
3. `knowledge.read`
4. `knowledge.propose`
5. `tts.speak`
6. `audio.analyze`
7. `microphone.read`
8. `media.read`
9. `filesystem.read`
10. `filesystem.write`
11. `model.inference`
12. `avatar.control`

इनमें से किसी capability को केवल सुविधा, सरलता या अस्थायी सुरक्षा के नाम पर हटाना, निष्क्रिय करना या भविष्य के Brain की Architecture से बाहर करना बिना स्पष्ट उपयोगकर्ता स्वीकृति के निषिद्ध है।

### 16.2 Permission और Intelligence में अंतर

- Capability catalogue Brain को उपलब्ध संभावित कार्यों और संसाधनों के प्रकार बताता है।
- वास्तविक शक्ति संबंधित Engine, Adapter, Model, Data और Integration से आती है।
- केवल permission नाम घोषित कर देने से सुविधा implemented या active नहीं हो जाती।
- सभी 12 capabilities का catalogue और उनका भविष्य में उपयोग करने योग्य Architecture सुरक्षित रखना अनिवार्य है।

### 16.3 सुरक्षित Permission उपयोग — शक्ति कम किए बिना

1. किसी module को हर कार्य के लिए सभी 12 permissions स्वतः देने की आवश्यकता नहीं है; वह अपने वास्तविक कार्य के समय आवश्यक permission माँगेगा।
2. यह task-specific permission request, 12-capability catalogue हटाना या Brain की समग्र क्षमता कम करना नहीं है।
3. जब भविष्य का कोई module `model.inference`, `microphone.read`, `filesystem.write`, `tts.speak` या `avatar.control` उपयोग करने के लिए तैयार हो, तो संबंधित capability उसके सत्यापित module contract में उपलब्ध होनी चाहिए।
4. Permission माँगना वास्तविक user gesture, स्पष्ट कारण और आवश्यक user approval के साथ होगा। बिना अनुमति restricted data या action का उपयोग नहीं होगा।
5. Per-module permission scope का उद्देश्य अनावश्यक access रोकना है; यह Brain Core को भविष्य की घोषित क्षमताओं को orchestrate करने से रोकने का बहाना नहीं बनेगा।
6. किसी सुरक्षा परिवर्तन से यदि कोई निर्धारित App task, Engine integration या future capability वास्तव में अनुपयोगी/अप्राप्य हो जाती है, तो उस परिवर्तन को capability regression मानकर स्वीकार नहीं किया जाएगा।

### 16.4 Power-preservation review

किसी भी Security, Runtime, Model, Adapter या Integration परिवर्तन से पहले यह जाँचना अनिवार्य है:

- क्या सभी 12 capability names और उनके intended use सुरक्षित हैं?
- क्या भविष्य का module आवश्यक permission के लिए वैध रूप से request कर सकता है?
- क्या Brain Core उस module को नियंत्रित और समन्वित कर सकेगा?
- क्या कोई मौजूदा App Engine, data path या planned feature अनजाने में बंद हो रहा है?
- क्या permission user-controlled रहते हुए वास्तविक कार्य पूरा किया जा सकता है?

यदि किसी उत्तर से क्षमता घटने का पता चले, तो design को बदला जाएगा; क्षमता हटाकर समस्या हल नहीं की जाएगी। किसी भी unavoidable functional trade-off के लिए पहले उपयोगकर्ता की स्पष्ट स्वीकृति आवश्यक है।

---

## 17. Dependency-First Commit and Verified-Repair Workflow — LOCKED

यह नियम Brain Foundation की सभी वर्तमान और भविष्य की फाइलों, उनके integration और GitHub Actions पर लागू होगा।

1. किसी नई फाइल या परिवर्तन से पहले Repository की वर्तमान branch, exact file path, latest commit, imports/exports और dependent modules की जाँच अनिवार्य है।
2. फाइलों को dependency order में बनाया और commit किया जाएगा: पहले आवश्यक आधार/contract, फिर उस पर निर्भर implementation, फिर adapter/page और अंत में aggregate/browser integration।
3. प्रत्येक dependency stage की फाइल GitHub पर commit करने के बाद उसके exact commit SHA पर संबंधित Self-Test, syntax check और आवश्यक Regression/Browser tests चलाए जाएँगे।
4. जब तक किसी stage के अनिवार्य tests सफल न हों, उस पर निर्भर अगली फाइल का implementation/commit शुरू नहीं किया जाएगा। Failure होने पर पहले उसी failure का job log पढ़कर कारण पहचाना जाएगा।
5. GitHub Actions में लाल, cancelled या skipped result को “फाइलें हट गईं” या “सफल” नहीं माना जाएगा। Repository contents और exact workflow logs देखकर स्थिति बताई जाएगी।
6. किसी failed run के पुराने commit को नए commit का प्रमाण नहीं माना जाएगा। परीक्षण हमेशा उस exact commit SHA पर होना चाहिए जिसमें सुधार मौजूद है।
7. प्रत्येक फाइल के लिए केवल आवश्यक परिवर्तन होंगे। पहले से सही और हाल ही में commit की गई फाइल को बिना प्रमाणित आवश्यकता दोबारा नहीं बदला जाएगा।
8. यदि एक file fix दूसरे modules को प्रभावित करता है, तो संबंधित regression tests भी चलेंगे। मौजूदा TTS, Sanskrit, Avatar, Video, Module Loader, Registry और App lifecycle सुरक्षित रहेंगे।
9. उपयोगकर्ता को हर commit के बाद exact file path, commit SHA, बदला हुआ व्यवहार, वास्तविक test status और अगली dependency बताई जाएगी।
10. कोई भी फाइल “complete”, “ready” या “integrated” तभी कही जाएगी जब उसके निर्धारित tests और वास्तविक integration checks पास हों। केवल commit होना कार्यक्षमता का प्रमाण नहीं है।
11. उपयोगकर्ता की स्वीकृति के बिना Main App की मौजूदा कार्यक्षमता, 12 capability catalogue, स्थानीय डेटा या निर्धारित Brain उद्देश्य कम करने वाला परिवर्तन नहीं किया जाएगा।
12. index.html और उसके Script Tags अपरिवर्तित रहेंगे, जब तक उपयोगकर्ता अलग से स्पष्ट अनुमति न दे।

---

## 18. Single-Pass File Audit and Minimal Commit Policy — कठोर LOCKED

यह नियम वर्तमान तथा भविष्य के सभी 22 क्रमांकित modules, Main App integration, tests और documentation पर लागू होगा।

1. किसी फाइल को update करने से पहले उसका पूरा relevant source, import/export contracts, dependency graph, recent commit history, existing tests और Main App use एक ही समेकित audit में जाँचे जाएँगे।
2. उसी audit में मिले सभी प्रमाणित, संबंधित और आवश्यक सुधारों को एक ही complete patch में समेकित किया जाएगा। केवल एक-एक छोटे सुधार के लिए बार-बार उसी फाइल को Commit करना अनुचित है।
3. सामान्य नियम: एक निर्धारित file task में अधिकतम एक update और एक implementation Commit। यदि कोई प्रमाणित कमी नहीं है, तो file unchanged रहेगी और कोई Commit नहीं बनेगा।
4. Commit से पहले उपलब्ध syntax/static checks, self-test expectations, call sites, browser contracts और dependency compatibility का पूरा pre-commit review किया जाएगा। परीक्षण के बिना अधूरा या अनुमानित patch Commit नहीं किया जाएगा।
5. किसी उसी फाइल पर दूसरा Commit तभी स्वीकार्य होगा जब पहले Commit के बाद नया, पहले से उपलब्ध source/test evidence से न पहचाना जा सकने वाला गंभीर defect मिले, या वास्तविक test run किसी नए failure को उजागर करे। कारण, log और आवश्यक diff दर्ज करना अनिवार्य है।
6. केवल formatting, version number, message, cosmetic wording या पहले से पता सुधार छूट जाने के कारण लगातार follow-up Commits नहीं किए जाएँगे।
7. यदि test failure किसी दूसरे dependent module में है, तो बिना आवश्यकता मूल फाइल को फिर से बदलने के बजाय वास्तविक failing dependency को अलग audit किया जाएगा।
8. एक Commit में कई files के बदलाव नहीं मिलाए जाएँगे; प्रत्येक file का अपना atomic Commit रहेगा। परन्तु उसी file के सभी प्रमाणित सुधार उसी single patch में रहेंगे।
9. समय बचाने के लिए सही और हाल ही में सत्यापित फाइल को दोबारा नहीं छुआ जाएगा। Repository inspection और पहले से उपलब्ध test evidence का पुनः उपयोग किया जाएगा।
10. हर रिपोर्ट में साफ लिखा जाएगा: file बदली गई या unchanged रही; क्यों; कितने Commits आवश्यक हुए; tests का exact SHA परिणाम; और App की शक्ति/दक्षता पर प्रमाणित प्रभाव।
11. कोई भी बदलाव Brain की निर्धारित क्षमता, 12-capability catalogue, मौजूदा Main App engines या user data को कमजोर नहीं करेगा। सुरक्षा के नाम पर भविष्य की कार्यक्षमता हटाना स्वीकार्य समाधान नहीं है।
12. अगली फाइल पर तभी बढ़ेंगे जब मौजूदा file task के आवश्यक tests और उस पर निर्भर regression/browser checks पास हों।

इस नियम का उद्देश्य “कम Commit” अपने-आप में नहीं, बल्कि एक ही बार में सही, पूर्ण, समीक्षा योग्य और सत्यापित परिवर्तन करना है।

---

**अंतिम लॉक घोषणा:** Swar-Sadhika Nano Brain का एकमात्र अंतिम उद्देश्य ऊपर परिभाषित स्वतंत्र, शक्तिशाली, सुरक्षित, स्थानीय और सीखने-सक्षम बुद्धि-तंत्र का निर्माण और सत्यापन है। सभी अगली फ़ाइलें और commits इसी उद्देश्य की सेवा करेंगे। परियोजना इस लक्ष्य से बिना उपयोगकर्ता की स्पष्ट स्वीकृति के नहीं भटकेगी।

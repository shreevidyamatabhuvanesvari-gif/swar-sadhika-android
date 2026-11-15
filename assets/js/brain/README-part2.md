# Swar-Sadhika Nano Brain — Foundation Part 2

**दस्तावेज़ संस्करण:** 1.1.0  
**स्थिति:** Foundation implementation और Main App integration का तकनीकी विवरण  
**निर्धारित Runtime:** Android Chrome  
**Execution Policy:** Local-first; कोई external AI API, remote inference या अनिवार्य server नहीं

यह README केवल मौजूदा कोड और परीक्षणों से सत्यापित Foundation व्यवहार बताता है। भविष्य के लक्ष्य और अभी अनुपस्थित क्षमताएँ अलग से चिह्नित हैं। यह दस्तावेज़ NANO_BRAIN_CHARTER_LOCKED.md के 22-फाइल क्रम का अधीनस्थ तकनीकी विवरण है।

---

## 1. Main App से वास्तविक Integration

Nano Brain को अलग HTML entry page या अलग Script Tag के रूप में नहीं चलाया जाता। वह Swar-Sadhika के मौजूदा Main App Page Loader के माध्यम से खुलता है।

### 1.1 वास्तविक navigation chain

1. index.html में मुख्य Navigation के भीतर data-route="nano-brain" बटन पहले से मौजूद है।
2. उसी index.html में id="view-nano-brain" वाला View/Root Container मौजूद है।
3. index.html केवल मौजूदा assets/js/app.js module entry point लोड करता है। Brain के लिए कोई अतिरिक्त Script Tag नहीं है।
4. assets/js/app.js की PAGE_MODULES सूची में nano-brain route, page-nano-brain-part2.js, view-nano-brain root और view mapping घोषित है।
5. Main Page Loader loadPageModule() के भीतर module को Dynamic Import से लोड करता है और उसका mount(context) चलाता है।
6. Page Loader का context Brain Page को app, page, root, document, navigate, emit, on और shared state interface देता है।
7. Brain Page context.app को Integration Foundation में देता है। उसी Foundation से Security Gate और Local Storage जोड़े जाते हैं।
8. Page Module onShow, onHide और unmount lifecycle hooks लौटाता है; unmount पर event listeners हटाए जाते हैं और Brain Integration dispose होता है।

इसका अर्थ है कि Nano Brain Foundation Page Main App Navigation और मौजूदा Page Loader में वास्तविक रूप से routed है। यह केवल README में प्रस्तावित Integration नहीं है।

### 1.2 Integration flow

Main App navigation
→ Main App Page Loader
→ page-nano-brain-part2.js mount(context)
→ brain-core-part2.js
→ brain-memory-engine-part2.js
→ brain-integration-foundation-part2.js
→ brain-security-part2.js + brain-storage-part2.js
→ Capability-checked local Memory operations

### 1.3 Main App से साझा interface

Main App Bridge में app.version, app.navigate(), app.emit() और app.on() उपलब्ध हैं। Brain Integration केवल इन्हीं सीमित methods का façade उपयोग करता है। App events को Main App DOM event channel के माध्यम से भेजा/सुना जाता है; Brain façade केवल brain:* नाम वाले events स्वीकार करता है।

Brain App façade के वर्तमान route allowlist में index, nano-brain, nano-server, avatar और video शामिल हैं। Main App का मौजूदा TTS navigation key jump-text है; वर्तमान façade allowlist में jump-text शामिल नहीं है। इसलिए Brain Page खुलने और Main App के Page Loader से integrate होने का प्रमाण मौजूद है, लेकिन Brain façade से TTS route navigation अभी पूर्ण नहीं है। इस route-contract mismatch को अलग, एक-फाइल Commit और Regression Test में ठीक करना आवश्यक है। इसे पूर्ण integration घोषित न करें।

### 1.4 अभी तक क्या-क्या Main App में नहीं जुड़ा

वर्तमान Foundation किसी मौजूदा domain engine को स्वतः नियंत्रित या replace नहीं करता। अभी निम्न Integration adapters/functionalities मौजूद नहीं माने जाएँगे:

- Sanskrit/Nano Server knowledge engine का Brain reasoning से वास्तविक समन्वय।
- TTS engine के commands, result और pronunciation feedback का Brain orchestration।
- Singing Voice Synthesis generation।
- Avatar, facial expression, body-language और phoneme-synchronized lip-sync control।
- Video/Media learning pipeline।
- Central reasoning, planning, long-term semantic memory और approved learning engine।

इनका निर्माण Charter में निर्धारित संबंधित Part 2 modules और मौजूदा engine interfaces के audit के बाद होगा। किसी मौजूदा engine को इस Foundation के कारण बदला हुआ न मानें।

---

## 2. वर्तमान Foundation Modules

| Module | वास्तविक जिम्मेदारी | प्रमुख निर्भरता |
|---|---|---|
| brain-security-part2.js | Safe JSON boundary, safe IDs, data-only Skill Manifest, capability grants और SHA-256 verification helpers | Browser Event/crypto interfaces जहाँ उपलब्ध हों |
| brain-storage-part2.js | IndexedDB structured storage, backup/import, metadata/events, storage diagnostics और optional OPFS adapter | IndexedDB; optional navigator.storage / OPFS |
| brain-integration-foundation-part2.js | Main App facade, single-flight initialization, lifecycle-safe integration और capability-checked Memory facade | Security + Storage |
| brain-memory-engine-part2.js | Core-registered reader/writer/maintainer Skills, user-approved append-only versioned memory, bounded search, history, archive और backup export | Central Core + Integration Memory facade + Security |
| brain-foundation-selftest-part2.js | Foundation modules के self-tests को क्रम से चलाना और परिणाम aggregate करना | Security, Storage, Integration, Core, Memory Engine और Page self-tests |
| page-nano-brain-part2.js | Main App के Brain View में Foundation Console, वास्तविक diagnostics, permission actions और Memory probe | Main Page Loader context, Integration + Storage |
| brain-browser-test-part2.html | Browser native IndexedDB के write/read, metadata, event और route smoke tests | Browser secure context |
| brain-browser-test-runner-part2.mjs | Playwright/Chromium के माध्यम से browser test phases चलाना और सत्यापित करना | CI में स्थापित Playwright और Chromium |

यह Foundation है; इसे पूर्ण autonomous Brain, Neural Model Runtime या chatbot न समझें।

---

## 3. Integration Foundation का App Contract

Integration Foundation Main App object को सीधे expose नहीं करता। createBrainAppFacadePart2(app) एक सीमित façade लौटाता है।

### App façade

- version: Main App version की diagnostic पहचान।
- emit(eventName, detail): केवल brain:* event namespace के safe JSON details भेजता है।
- on(eventName, callback): केवल brain:* events सुनता है और unsubscribe function लौटाता है।
- navigate(route): केवल declared route allowlist में मौजूद route स्वीकार करता है।

अज्ञात event names, unsafe JSON और allowlist के बाहर के routes अस्वीकृत होने चाहिए। किसी Brain module को document पर arbitrary event names भेजकर Main App contract bypass नहीं करना चाहिए।

### Integration API

createBrainIntegrationPart2({ app, host, allowVolatileFallback, ... }) से बनाया गया Integration object निम्न public methods देता है:

- initialize()
- diagnostics()
- getMemory()
- requestCapabilities(capabilities, trustedEvent)
- revokeCapabilities(capabilities)
- securityDiagnostics()
- dispose()

Initialization एकल साझा Promise के रूप में नियंत्रित है। Storage और Security dependencies दोनों सही तरह तैयार होने के बाद ही उन्हें Ready state में प्रकाशित किया जाता है। Initialization failure या dispose के दौरान अधूरी dependencies की cleanup की जाती है।

getMemory() से मिलने वाला Memory façade raw IndexedDB connection या raw Capability Gate नहीं देता। प्रत्येक read operation के लिए memory.read और प्रत्येक write/delete/import operation के लिए memory.write grant आवश्यक है।

### Page lifecycle

Main Page Loader page module का एक ही mounted instance cache करता है। Page route दोबारा खुलने पर onShow चल सकता है; दूसरे page पर जाने पर onHide; App pagehide पर unmount cleanup किया जाता है। Brain Page अपने listeners हटाकर Integration.dispose() बुलाता है।

---

## 4. Central Brain Memory Engine

**फ़ाइल:** `assets/js/brain/brain-memory-engine-part2.js`

Memory Engine Main App Page में Central Core के Initialize होने के बाद तीन local built-in Skills register करता है:

| Skill | Permission | कार्य |
|---|---|---|
| memory.reader | memory.read | Record retrieval, bounded list/search, version history और backup export |
| memory.writer | memory.write | नया user-approved Memory Record जोड़ना |
| memory.maintainer | memory.read + memory.write | पुराने Record का नया version बनाना या उसे archive करना |

मुख्य API:

- `initialize()` — Core में तीनों Skills register करता है।
- `requestPermissions(event, { read, write })` — वास्तविक trusted user gesture पर session permissions माँगता है।
- `issueWriteApproval(event)` — प्रत्येक write/revision/archive के लिए एक बार उपयोग होने वाला 60-second approval token बनाता है।
- `remember(input, approval)` — नया local record बनाता है।
- `revise(recordId, patch, approval)` — पुराने record को overwrite किए बिना नया version जोड़ता है।
- `archive(recordId, approval)` — नया archived version बनाता है; hard delete API उपलब्ध नहीं है।
- `get(recordId)`, `list(options)`, `search(query, options)`, `history(logicalId)` — read operations।
- `exportBackup()` — Integration Memory facade के checksummed backup export को उपयोग करता है।
- `cancelActiveTasks(reason)` और `dispose()` — चल रहे tasks को रोककर पूरा cleanup करते हैं।

### Memory integrity rules

- Read, write और read+write maintenance अलग-अलग Core Skills हैं; permission को आपस में बढ़ाया नहीं जाता।
- हर write से पहले एक fresh trusted user gesture आवश्यक है। Approval token एक बार इस्तेमाल होता है, 60 seconds में expire होता है और अप्रयुक्त tokens की संख्या 16 तक सीमित है।
- नया record unique ID के साथ append होता है। Revision पुराने record को बदलती या मिटाती नहीं; `supersedes` link और बढ़ता version number history सुरक्षित रखते हैं।
- Stale version को दोबारा revise/archive करना अस्वीकृत है।
- Archive भी एक नया version है; destructive hard delete API expose नहीं की गई है।
- Search अधिकतम 500 stored records scan करता है और अधिकतम 100 results देता है। Diagnostics में window limit स्पष्ट है; यह अभी full-database pagination/search नहीं है।
- JSON-only content, 32 KiB per-record content, bounded tags/title/source और credential-जैसे field names की rejection लागू है।
- Memory Engine local record experience/provenance को दर्ज करता है; यह स्वयं model training, semantic neural recall या automatic truth verification नहीं करता।

Main Brain Page Core के बाद Memory Engine initialize करता है, Console में उसकी स्थिति दिखाता है और Page hide/unmount पर active task cleanup, Engine disposal, Core disposal तथा Integration disposal इसी क्रम में करता है।

---

## 5. Security और Permissions

- Capabilities default-deny हैं।
- Page mount पर Memory permissions स्वतः grant नहीं की जातीं।
- वर्तमान Brain Page केवल memory.read और memory.write के explicit session grants माँगता है।
- Capability grant वास्तविक trusted browser event पर निर्भर है; नकली event object अनुमति नहीं दे सकता।
- Grant browser confirmation और capability validation के बाद ही स्वीकार होता है।
- Grants केवल current page/session lifecycle के लिए हैं; उन्हें permanent permission record के रूप में save नहीं किया जाता।
- Skill Manifest declarative metadata है। इसमें executable script/file/URL को स्वीकार या import नहीं किया जाता।
- Safe JSON validator prototype-pollution keys, accessors, symbol keys, non-finite numbers, non-plain objects, excessive nesting और excessive data size अस्वीकार करता है।
- Backup import checksum और schema validation के बाद additive तरीके से होता है; existing key conflict होने पर overwrite/partial import स्वीकार नहीं होना चाहिए।

कोई भी नया module इन security rules को bypass करके local data, permissions या active engine behavior नहीं बदल सकता।

---

## 6. Local Storage Contract

**Database name:** swar-sadhika-brain-part2  
**IndexedDB version:** 2

| Object Store | Key Path | उपयोग |
|---|---|---|
| records | id | Memory, Knowledge और Learning records |
| metadata | key | Schema/version metadata और key-value metadata |
| events | id | Append-style operational events |

वर्तमान v2 migration additive/non-destructive है। यह stores को साफ़ नहीं करती; आवश्यक stores/indexes और schema marker जोड़ती है। Records में byUpdatedAt और events में byCreatedAt indexes बनाए जाते हैं। पुराने v1 records सुरक्षित रखने का उद्देश्य migration contract का हिस्सा है।

### Persistence का सही अर्थ

- IndexedDB उपलब्ध और सफलतापूर्वक खुलने पर backend indexeddb और persistent=true रिपोर्ट करता है।
- इसका अर्थ अपने-आप browser-persistent durability की गारंटी नहीं है।
- navigator.storage.persist() के सफल अनुरोध की पुष्टि मिलने पर ही diagnostics browser-persistent durability दिखा सकते हैं।
- अन्यथा IndexedDB best-effort है और browser storage eviction/quota policies लागू हो सकती हैं।
- Volatile Memory fallback को persistent storage नहीं कहा जाता।
- वर्तमान Brain Page allowVolatileFallback=false देता है; IndexedDB initialization विफल होने पर page को असफल स्थिति दिखानी चाहिए, silently temporary Memory को durable न बताना चाहिए।

### Backup और Recovery

Storage API checksummed export/import प्रदान करता है। Import schema, version, size और SHA-256 integrity जाँचता है। Import additive है; existing keys overwrite करने की जगह conflict reject होना चाहिए। Backup/restore को वास्तविक data पर चलाने से पहले user permission और स्पष्ट intent आवश्यक हैं।

### Optional asset storage

- OPFS adapter feature-detection के साथ उपलब्ध है; हर browser में इसकी उपलब्धता मानकर नहीं चलना चाहिए।
- OPFS adapter को model installer या active Model Runtime समझना गलत होगा।
- User-selected directory picker वैकल्पिक है और trusted user gesture पर निर्भर है।
- चयनित directory handle को यह Foundation स्थायी रूप से save करने का दावा नहीं करता।
- Android SD-card access को तभी उपलब्ध बताएँ जब वास्तविक device/browser API परीक्षण में इसकी पुष्टि हो।

---

## 7. Network, Offline और Model Policy

इस Foundation के app runtime में कोई external AI API, remote inference endpoint या अलग server call नहीं है। Brain Foundation के लिए downloaded executable JavaScript या remote Skill execution लागू नहीं है।

CI में Playwright/Chromium install करने के लिए network उपयोग हो सकता है; यह केवल GitHub Actions test environment का dependency installation है, Android App runtime dependency नहीं।

Strict Offline certification अभी प्राप्त नहीं है। इसे प्रमाणित करने के लिए आवश्यक model/runtime/assets स्थापित करने के बाद network disabled अवस्था में Android Chrome cold start, navigation, storage, memory, reasoning, allowed domain tasks और recovery tests चलाने होंगे।

वर्तमान diagnostics में:
- symbolicReasoning: not-installed
- neuralModelRuntime: not-installed
- autonomousExecution: not-installed

इन स्थितियों को READY, ACTIVE या COMPLETE में बदलने का कोई अनुमानित/स्थिर दावा स्वीकार्य नहीं है।

---

## 8. Foundation Console का वर्तमान व्यवहार

page-nano-brain-part2.js वास्तविक Main Page Loader context माँगता है। यह:

1. Brain Integration initialize करता है।
2. Storage और Security diagnostics पढ़ता है।
3. वास्तविक backend, persistence, quota और capability state दिखाता है।
4. उपयोगकर्ता के स्पष्ट action पर memory.read या memory.write permission माँगता है।
5. स्वीकृत permissions के बाद एक probe record लिखता, पढ़ता और अंत में हटाता है।
6. Page unmount होने पर listeners हटाता और Integration dispose करता है।

Page स्वयं पूरा Brain नहीं है। इसमें reasoning/chat response, model inference, autonomous planning या singing generation नहीं है।

---

## 9. Tests और Verification

### Dedicated Nano Brain Foundation workflow

Workflow: .github/workflows/nano-brain-foundation.yml

यह वर्तमान में:
- JavaScript तथा browser runner syntax जाँचता है।
- Security, Integration और Brain Page के independent self-tests चलाता है।
- Aggregate Brain Foundation self-test चलाता है।
- Chromium में IndexedDB write/read, migration और cross-process persistence audit चलाता है।
- Main App shell को mobile-sized viewport पर खोलकर Brain route/Page Loader mount जाँचता है।

Feature branch पर यह workflow Pull Request event से चलता है; main branch पर push और workflow_dispatch triggers उपलब्ध हैं। Feature branch पर duplicate push + pull_request Foundation runs से बचने के लिए feature-branch push trigger हटाया गया है।

### Main App Regression workflow

Workflow: .github/workflows/swar-sadhika-regression.yml

यह:
- assets/js JavaScript files का syntax check करता है।
- Vedic pronunciation, Sanskrit G2P, pronunciation compiler और TTS self-tests चलाता है।
- Avatar TTS engine, Avatar Page और Avatar TTS integration tests चलाता है।
- Sanskrit Display Studio HTML/JavaScript contract जाँचता है।
- Brain Foundation aggregate self-test और Main App route/lazy-load contract जाँचता है।

एक Green CI run केवल उन assertions की सफलता बताता है जो उस run में चले। वह physical Android certification, full Brain capability या Strict Offline certification का विकल्प नहीं है।

### Browser test interpretation

Browser persistence audit Playwright/Chromium द्वारा दो अलग browser process phases में same isolated profile उपयोग करके record, metadata और event persistence जाँचता है। यह वास्तविक Chromium behavior है, पर physical Android phone का प्रमाण नहीं।

Android device verification में कम-से-कम:
- वास्तविक Android Chrome version
- cold start और page navigation
- IndexedDB persistence तथा database upgrade
- quota estimate, persistent-storage request और eviction behavior
- network-disabled behavior
- app restart और error recovery

दर्ज किए जाने चाहिए।

---

## 10. वर्तमान Integration Status — सत्यापित सीमाएँ

| क्षेत्र | वर्तमान स्थिति |
|---|---|
| Main App navigation | Integrated through existing Page Loader |
| Brain Page lazy loading | Integrated |
| index.html extra Brain Script Tag | नहीं जोड़ा गया |
| Brain Foundation Security/Storage | Foundation implemented; CI-tested |
| Main App event façade | Brain-scoped events उपलब्ध |
| TTS route through Brain façade | अभी allowlist gap; jump-text जोड़ना बाकी |
| Sanskrit/Nano Server engine adapter | अभी नहीं |
| TTS/Singing engine adapter | अभी नहीं |
| Avatar/Body Language/Lip-Sync adapter | अभी नहीं |
| Video/Media Learning adapter | अभी नहीं |
| Symbolic Reasoning/Task Planner | अभी नहीं |
| Long-term Knowledge/Learning intelligence | अभी नहीं |
| Neural Model Runtime | अभी नहीं |
| Physical Android Chrome certification | अभी नहीं |
| Strict Offline certification | अभी नहीं |

इस तालिका में “अभी नहीं” का अर्थ है कि इस Foundation code और उपलब्ध परीक्षण से उस क्षमता का वास्तविक implementation प्रमाणित नहीं है।

---

## 11. आगे के निर्माण के नियम

1. NANO_BRAIN_CHARTER_LOCKED.md में दर्ज 22-file क्रम का पालन करें।
2. एक समय में एक ही Brain file update/add और एक स्वतंत्र Commit करें।
3. कोई फाइल पहले से मौजूद हो तो duplicate न बनाएँ; पहले उसका वास्तविक interface और integration audit करें।
4. प्रत्येक मॉड्यूल का contract, dependency और failure behavior लिखें।
5. संबंधित unit/self-test के साथ आवश्यक integration/browser tests जोड़ें।
6. Failure को छिपाएँ नहीं; root cause ठीक कर नया green run दर्ज करें।
7. मौजूदा TTS, Sanskrit, Avatar, Video और Nano Server interfaces का audit किए बिना adapters न लिखें।
8. index.html और उसके Script Tags अपरिवर्तित रखें।
9. कोई destructive migration, data deletion, model activation या engine replacement उपयोगकर्ता की स्वीकृति के बिना न करें।
10. किसी सुविधा को वास्तविक device और domain benchmark से पहले READY घोषित न करें।

---

## 12. निष्कर्ष

वर्तमान Foundation का वास्तविक कार्य Main App के Page Loader से Brain Page को खोलना, सुरक्षित App facade प्रदान करना, local structured Storage initialize करना, capability-checked Memory operations देना और diagnostics/test results उपलब्ध कराना है।

यह Swar-Sadhika के शक्तिशाली अंतिम Nano Brain की पहली आधार-परत है—अंतिम Brain नहीं। Central reasoning, task planning, long-term knowledge/learning, Sanskrit/TTS/Singing/Avatar/Media adapters और local model runtime को अगले क्रमिक modules में स्पष्ट contracts तथा परीक्षणों के साथ जोड़ा जाना है।

हर अगला Commit इसी Main App integration graph का विस्तार करेगा; अलग-थलग files जोड़ना स्वीकार्य निर्माण-पद्धति नहीं है।

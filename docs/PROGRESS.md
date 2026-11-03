# Swar-Sadhika Web App — Project Status

**प्रकाशन:** GitHub Pages  
**मुख्य URL:** https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/  
**संचालन:** Android Chrome सहित आधुनिक browser

## स्वीकृत दायरा

यह परियोजना browser-based web app है। Android Native source, APK, Gradle build और Play Store वितरण इसके दायरे में नहीं हैं।

## वर्तमान वेब फाइलें

- `index.html` — वेब प्रवेश पृष्ठ
- `styles.css` — responsive UI
- `app.js` — progress dashboard व्यवहार
- `progress.json` — 15 browser-oriented मॉड्यूल का status data
- `tools/validate_progress.py` — progress JSON की read-only जाँच

## वास्तविक वर्तमान स्थिति

GitHub Pages का प्रगति डैशबोर्ड उपलब्ध है। यह अभी पूर्ण chant studio नहीं है। वर्तमान स्रोत में वास्तविक स्थानीय Hindi female TTS model/inference, Sanskrit chant prosody, audio generation, video import, synchronized captions, Avatar lip-sync, body-language engine और MP4 export लागू/प्रमाणित नहीं हैं।

## आगे की प्राथमिकता

1. Chrome में प्रकाशित वेब पैनल की कार्यक्षमता और मोबाइल layout जाँचना।
2. Browser में चल सकने वाले स्थानीय TTS मॉडल, उसके लाइसेंस, आकार और WebAssembly/WebGPU compatibility का आकलन।
3. वास्तविक स्थानीय inference और सुनाई देने वाला audio output लागू करके परीक्षण करना।
4. संस्कृत उच्चारण और chant prosody विकसित करना।
5. Audio/Video, captions, lip-sync, body language और MP4 export क्रमशः जोड़ना।
6. Offline operation और browser privacy की जाँच करना।

## सफलता का नियम

किसी सुविधा को PASS तभी माना जाएगा जब वास्तविक browser/device परीक्षण, वातावरण, timezone सहित समय और समीक्षा योग्य प्रमाण दर्ज हों। केवल UI, स्थिर JSON या source code मौजूद होना सफलता का प्रमाण नहीं है।

# Swar-Sadhika — Browser Chant Studio

Live: https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/

यह GitHub Pages पर चलने वाला browser-first व्यक्तिगत Sanskrit text एवं chant workspace है। Android APK, Gradle और Play Store इस परियोजना के दायरे में नहीं हैं।

## भाषा चयन — ठीक तीन विकल्प
1. वैदिक संस्कृत — `sa-IN`
2. सामान्य संस्कृत — `sa-IN`
3. हिंदी — `hi-IN`

वेब पेज में एक ही Language dropdown है। डिवाइस की उपलब्ध आवाज़ ऐप स्वयं भाषा के अनुसार चुनता है; अलग-अलग device voices या अन्य भाषाओं की सूची उपयोगकर्ता को नहीं दिखाई जाती।

यदि Sanskrit voice अनुपलब्ध हो तो सामान्य संस्कृत/वैदिक मोड में सीमित Hindi fallback स्वतः चुना जा सकता है और UI यह स्पष्ट बताता है। उदाहरण: fallback में `सर्वे` के लिए TTS-only phonetic रूप `सर्-वे` है; स्रोत पाठ और Library में मूल वर्तनी यथावत रहती है। यह fallback पूर्ण संस्कृत या वैदिक TTS का विकल्प नहीं है।

## वर्तमान सुविधाएँ
- Sanskrit/Hindi पाठ लिखना, शुद्ध करना, गिनना और IndexedDB में सहेजना।
- केवल तीन भाषा-मोड; आवाज़ का स्वतः चयन, कोई अतिरिक्त voice/language picker नहीं।
- “सर्वे” उच्चारण जाँच बटन।
- स्थानीय Audio/Video preview और अध्ययन नोट्स।
- IndexedDB Library और JSON backup/import।
- प्रारम्भिक Avatar UI animation और module status panel।
- PWA manifest और service-worker shell caching।

## अभी उपलब्ध नहीं
- प्रशिक्षित Neural Female TTS model / local inference
- प्रमाणित वैदिक स्वर-गायन और पूर्ण Sanskrit phonology engine
- स्वतः audio/video से singing-style learning
- word/phoneme aligned captions
- वास्तविक photo avatar और phoneme-synchronized lip-sync
- body-language learning और MP4 export

किसी सुविधा को PASS तभी चिह्नित करें जब Android Chrome सहित लक्ष्य browser/device पर वास्तविक परीक्षण और समीक्षा योग्य प्रमाण उपलब्ध हो।
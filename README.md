# Swar-Sadhika — Browser Chant Studio

Live: https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/

यह GitHub Pages पर चलने वाला browser-first व्यक्तिगत Sanskrit text एवं chant workspace है। Android APK, Gradle और Play Store इस परियोजना के दायरे में नहीं हैं।

## भाषा मोड — केवल तीन
1. वैदिक संस्कृत — `sa-IN`; वैदिक स्वर-चिह्न पाठ में हों तो सुरक्षित रखे जाते हैं। सामान्य browser TTS से वैदिक स्वर-पाठ प्रमाणित नहीं होता।
2. सामान्य संस्कृत — `sa-IN`; Sanskrit-specific device voice उपलब्ध होने पर वही उपयोग होगी।
3. हिंदी — `hi-IN`; केवल उपलब्ध Hindi device voices उपयोग होंगी।

Language/voice routing browser से वास्तव में लौटे हुए device voices पर निर्भर है। यदि Sanskrit voice अनुपलब्ध हो तो सीमित Hindi fallback और curated pronunciation dictionary उपयोग होती है। उदाहरण: सामान्य संस्कृत fallback में `सर्वे` → `सर्-वे`। स्रोत पाठ और Library में मूल वर्तनी यथावत रहती है। यह fallback पूर्ण संस्कृत या वैदिक TTS का विकल्प नहीं है।

## वर्तमान सुविधाएँ
- Sanskrit/Hindi पाठ लिखना, शुद्ध करना, गिनना और IndexedDB में सहेजना।
- भाषा-मोड के अनुसार device voice preview; बोलने से पहले pronunciation helper।
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
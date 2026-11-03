# Swar-Sadhika Browser Studio

यह repository GitHub Pages पर प्रकाशित browser-based Sanskrit text एवं chant workspace है।

## Live App

https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/

## वर्तमान सुविधाएँ

- Sanskrit/Hindi पाठ लिखना और IndexedDB में सहेजना।
- Browser/OS Speech Synthesis से voice preview।
- स्थानीय Audio/Video file preview।
- Media study और learning notes।
- Local Library में सहेजी गई सामग्री देखना और हटाना।
- प्रारम्भिक Avatar UI animation।
- Module status panel।
- PWA manifest और service-worker द्वारा app-shell caching।

## GitHub Pages सेटिंग

Settings → Pages → Deploy from a branch → Branch `main` → Folder `/ (root)`।

## आवश्यक सीमा

Voice Preview, प्रशिक्षित Neural Female TTS नहीं है। Avatar animation वास्तविक phoneme Lip-Sync नहीं है। Audio/Video file केवल device पर preview होती है; automatic singing-style learning उपलब्ध नहीं है। MP4 export और स्थानीय neural model inference अभी लागू नहीं हैं।

## विकास अनुशासन

किसी सुविधा को PASS तभी चिह्नित करें जब Android Chrome सहित लक्षित browser/device पर वास्तविक परीक्षण और समीक्षा योग्य प्रमाण उपलब्ध हो। इस परियोजना में Android APK, Gradle और Play Store Build शामिल नहीं हैं।

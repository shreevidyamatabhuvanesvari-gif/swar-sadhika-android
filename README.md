# Swar-Sadhika Web App

Swar-Sadhika अब केवल browser-based वेब परियोजना है। इसका संचालन GitHub Pages लिंक से Android Chrome या अन्य आधुनिक ब्राउज़र में किया जाएगा।

## Live site

https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/

## Repository

https://github.com/shreevidyamatabhuvanesvari-gif/swar-sadhika-android

## Current web entry points

- `index.html` — GitHub Pages का मुख्य पेज
- `styles.css` — मोबाइल-अनुकूल वेब UI
- `app.js` — Progress Panel का browser JavaScript
- `progress.json` — मॉड्यूल की स्थिति और परीक्षण रिकॉर्ड

## उद्देश्य

ब्राउज़र में संस्कृत/Hindi पाठ, स्थानीय स्त्री-स्वर TTS, Chant Prosody, Audio/Video, captions, Avatar Lip-Sync और offline संचालन की सुविधाएँ क्रमशः विकसित करना।

**वर्तमान सीमा:** प्रकाशित साइट अभी मुख्यतः प्रगति डैशबोर्ड है। वास्तविक TTS, गायन, वीडियो, Lip-Sync और MP4 export सुविधाएँ अभी विकसित/प्रमाणित नहीं हैं।

## विकास नियम

- Android APK, Gradle, Android Studio या Play Store Build इस परियोजना का हिस्सा नहीं हैं।
- मुख्य संचालन GitHub Pages और Chrome में रहेगा।
- पहले browser में वास्तविक TTS inference और सुनाई देने वाला audio output प्रमाणित किया जाएगा।
- किसी सुविधा को वास्तविक परीक्षण और साक्ष्य के बिना PASS नहीं दिखाया जाएगा।
- बाहरी Paid AI API या अलग server पर निर्भरता प्राथमिक समाधान नहीं होगी।

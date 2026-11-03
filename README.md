# Swar-Sadhika — Browser Chant Studio

Live: https://shreevidyamatabhuvanesvari-gif.github.io/swar-sadhika-android/

यह GitHub Pages पर चलने वाला browser-first व्यक्तिगत Sanskrit text एवं chant workspace है। Android APK, Gradle और Play Store इस परियोजना के दायरे में नहीं हैं।

## अभी उपलब्ध ब्राउज़र सुविधाएँ
- Index Panel के पाँच अनुभाग: पाठ एवं स्वर, Audio/Video, Library, Avatar Preview और Engine Status।
- Sanskrit/Hindi पाठ संपादित करना और IndexedDB में सुरक्षित रखना।
- Browser Speech Synthesis से डिवाइस-आधारित voice preview; यह प्रशिक्षित Female Neural TTS मॉडल नहीं है।
- उपयोगकर्ता द्वारा चुनी गई Audio/Video फाइल का local preview; फाइल सर्वर पर upload नहीं होती।
- Media study notes और learning notes को IndexedDB में सुरक्षित रखना।
- सीमित UI avatar mouth animation; phoneme synchronization नहीं।
- PWA manifest और service-worker shell caching का प्रारम्भिक ढाँचा।

## अभी उपलब्ध नहीं
- स्थानीय neural female TTS model / inference
- संस्कृत के लिए प्रमाणित phoneme और chant prosody engine
- स्वतः audio/video से singing-style learning
- word/phoneme aligned captions
- वास्तविक photo avatar और phoneme-synchronized lip-sync
- body-language learning
- MP4 export
- मॉडल-आधारित पूर्ण offline generation

## तकनीकी संरचना
- `index.html`: browser app entry
- `styles.css`: responsive UI
- `app.js`: ES module bootstrap
- `app/main.js`: module wiring and navigation
- `app/core/storage.js`: IndexedDB wrapper
- `app/core/status-board.js`: progress registry view
- `app/features/`: text, voice preview, media, library and avatar modules
- `progress.json`: project status, not runtime AI model
- `manifest.webmanifest`, `sw.js`: installable/offline shell scaffolding

## Data and privacy
Text and notes are stored in this browser's IndexedDB. Clearing browser site data may erase them. Selected media files are previewed via temporary object URLs and are not uploaded. Do not store sensitive material on a shared device.

## Deploy
GitHub Pages should publish the repository root from `main`. Open the Live URL in Chrome. Service-worker/offline behavior requires HTTPS and may take one reload after first visit.

## Next engineering milestones
1. Select a permissively licensed browser-compatible TTS model and verify Hindi/Sanskrit coverage, model size and Android Chrome inference.
2. Integrate local inference and prove audible audio output on target mobile devices.
3. Add phoneme/viseme timing and real caption synchronization.
4. Implement real avatar rendering, body motion and media export.
5. Add backup/export/import for IndexedDB content and perform offline/privacy tests.

A module must not be marked PASS without a real browser/device test and reviewable evidence.
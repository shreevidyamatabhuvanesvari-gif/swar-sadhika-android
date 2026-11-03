# Swar-Sadhika Web Index Panel

यह repository GitHub Pages पर प्रकाशित होने वाला browser-based वेब पैनल है।

## प्रकाशित करना

GitHub Pages को `main` branch के repository root से प्रकाशित करें। मुख्य वेब फाइलें:

- `index.html`
- `styles.css`
- `app.js`
- `progress.json`

GitHub में **Settings → Pages** खोलकर पुष्टि करें कि Source `Deploy from a branch`, Branch `main` और Folder `/ (root)` है।

## प्रगति अपडेट

`progress.json` में मॉड्यूल की स्थिति, परीक्षण परिवेश, timezone सहित समय और वास्तविक प्रमाण अपडेट करें। बिना प्रमाण किसी सुविधा को `PASS` न करें।

## संचालन

वेब पेज GitHub Pages URL से Chrome में खुलेगा। यह फिलहाल प्रगति डैशबोर्ड है; TTS, Audio/Video, Avatar और अन्य AI सुविधाएँ अलग से विकसित की जानी हैं।

## परियोजना सीमा

इस repository में Android Native App, APK, Gradle या Play Store Build नहीं रखा जाएगा।

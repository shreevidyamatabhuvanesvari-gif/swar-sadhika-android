import { SANSKRIT_PRONUNCIATION_LEXICON } from '../data/sanskrit-pronunciation-lexicon.js';
import { LANGUAGE_MODES, resolveLanguageVoices } from './language-modes.js';

export { LANGUAGE_MODES, resolveLanguageVoices };

export function normalizeSanskritInput(value = '') {
  return String(value)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC');
}

export function prepareSpeechText(sourceText, modeId, speechPath = 'native') {
  const text = normalizeSanskritInput(sourceText);
  if (modeId === 'hindi' || speechPath !== 'hindi-fallback') return text;
  return text.replace(/[\p{L}\p{M}]+/gu, token =>
    SANSKRIT_PRONUNCIATION_LEXICON[token] || token
  );
}

export function describeLanguagePath(modeId, path) {
  if (modeId === 'hindi') {
    return path === 'unavailable'
      ? 'डिवाइस में हिंदी आवाज़ उपलब्ध नहीं है। Android की Text-to-Speech सेटिंग में हिंदी आवाज़ स्थापित करें।'
      : 'हिंदी आवाज़ उपलब्ध है।';
  }
  if (path === 'native') {
    return modeId === 'vedic'
      ? 'संस्कृत आवाज़ मिली है। वैदिक स्वर-चिह्नों का सही पाठ फिर भी आवाज़ की क्षमता पर निर्भर है।'
      : 'संस्कृत आवाज़ मिली है; अब उसी का उपयोग होगा।';
  }
  if (path === 'hindi-fallback') {
    return modeId === 'vedic'
      ? 'संस्कृत आवाज़ नहीं मिली। हिंदी आवाज़ से केवल अनुमानित ध्वनि-Preview उपलब्ध है; इसे वैदिक स्वर-पाठ न मानें।'
      : 'संस्कृत आवाज़ नहीं मिली। हिंदी आवाज़ के साथ सीमित संस्कृत उच्चारण-सहायक लागू होगा।';
  }
  return 'इस डिवाइस में संस्कृत या हिंदी की उपयुक्त आवाज़ उपलब्ध नहीं है। पहले Android Text-to-Speech में संबंधित भाषा स्थापित करें।';
}

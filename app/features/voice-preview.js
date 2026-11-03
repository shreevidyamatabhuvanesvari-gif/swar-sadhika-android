import { normalizeStoredText } from '../core/storage.js';
import {
  LANGUAGE_MODES,
  resolveLanguageVoices,
  prepareSpeechText,
  describeLanguagePath
} from '../core/pronunciation-engine.js';

export function initVoicePreview({ onSpeaking = () => {} } = {}) {
  const support = document.getElementById('voiceSupport');
  const languageMode = document.getElementById('languageMode');
  const languageStatus = document.getElementById('languageModeStatus');
  const text = document.getElementById('sourceText');
  const speak = document.getElementById('speakButton');
  const testButton = document.getElementById('pronunciationTestButton');
  const pause = document.getElementById('pauseButton');
  const resume = document.getElementById('resumeButton');
  const stop = document.getElementById('stopButton');
  const status = document.getElementById('speechStatus');
  const caption = document.getElementById('captionPreview');
  const rate = document.getElementById('rateControl');
  const pitch = document.getElementById('pitchControl');

  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    support.textContent = 'आवाज़ API अनुपलब्ध';
    speak.disabled = true;
    testButton.disabled = true;
    status.textContent = 'इस ब्राउज़र में Speech Synthesis उपलब्ध नहीं है।';
    return;
  }

  const synth = window.speechSynthesis;
  let allVoices = [];
  let active = false;

  function currentMode() {
    return LANGUAGE_MODES[languageMode.value] || LANGUAGE_MODES.sanskrit;
  }

  function refreshLanguageStatus() {
    const mode = currentMode();
    const resolution = resolveLanguageVoices(allVoices, mode.id);

    speak.disabled = resolution.path === 'unavailable';
    testButton.disabled = resolution.path === 'unavailable';

    languageStatus.textContent =
      describeLanguagePath(mode.id, resolution.path) + ' ' + mode.hint;

    support.textContent = resolution.path === 'native'
      ? (mode.id === 'hindi' ? 'हिंदी आवाज़ स्वतः चुनी गई' : 'संस्कृत आवाज़ स्वतः चुनी गई')
      : resolution.path === 'hindi-fallback'
        ? 'हिंदी सहायक आवाज़ स्वतः चुनी गई'
        : 'उपयुक्त आवाज़ उपलब्ध नहीं';

    document.documentElement.lang = mode.speechLang;
    return resolution;
  }

  function loadVoices() {
    allVoices = synth.getVoices();
    refreshLanguageStatus();
  }

  loadVoices();
  if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;

  function chooseVoice(resolution) {
    // Voice selection is automatic. No device-language/voice picker is exposed.
    return resolution.voices.find(voice => voice.default) || resolution.voices[0] || null;
  }

  function updateControls() {
    pause.disabled = !active || synth.paused;
    resume.disabled = !active || !synth.paused;
    stop.disabled = !active;
  }

  function finish() {
    active = false;
    onSpeaking(false);
    updateControls();
  }

  function speakText(sourceText, isTest = false) {
    const mode = currentMode();
    const resolution = refreshLanguageStatus();

    if (resolution.path === 'unavailable') {
      status.textContent = describeLanguagePath(mode.id, resolution.path);
      return;
    }

    const original = normalizeStoredText(sourceText).trim();
    if (!original) {
      status.textContent = 'पहले पाठ लिखें।';
      return;
    }

    if (/\\\\n/.test(original)) {
      status.textContent = 'पाठ में literal backslash-n मिला। पहले पाठ शुद्ध करें।';
      return;
    }

    const speechText = prepareSpeechText(original, mode.id, resolution.path);
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.voice = chooseVoice(resolution);
    utterance.lang = utterance.voice?.lang || resolution.speechLang;
    utterance.rate = Number(rate.value);
    utterance.pitch = Number(pitch.value);

    synth.cancel();

    utterance.onstart = () => {
      active = true;
      onSpeaking(true);
      status.textContent = resolution.path === 'hindi-fallback'
        ? 'हिंदी आवाज़ स्वतः चुनी गई है। यह ध्वनि-सहायक Preview है, प्रमाणित संस्कृत उच्चारण नहीं।'
        : mode.id === 'vedic'
          ? 'वैदिक संस्कृत Preview चल रहा है। वैदिक स्वर-पाठ की शुद्धता आवाज़ की क्षमता पर निर्भर है।'
          : 'चयनित भाषा की आवाज़ चल रही है।';
      caption.textContent = isTest ? 'उच्चारण जाँच: सर्वे' : original;
      updateControls();
    };

    utterance.onend = () => {
      finish();
      status.textContent = isTest
        ? '“सर्वे” का Preview समाप्त हुआ। सुनकर उच्चारण जाँचें।'
        : 'पाठ का Preview समाप्त हुआ।';
      caption.textContent = original;
    };

    utterance.onerror = event => {
      finish();
      status.textContent = 'आवाज़ त्रुटि: ' + event.error;
    };

    caption.textContent = isTest
      ? (resolution.path === 'hindi-fallback' ? 'सर्वे → सर्-वे' : 'सर्वे')
      : original;

    synth.speak(utterance);
  }

  languageMode.addEventListener('change', () => {
    synth.cancel();
    finish();
    refreshLanguageStatus();
    status.textContent = 'भाषा बदल गई है। आवाज़ अपने-आप चुनी जाएगी।';
  });

  speak.addEventListener('click', () => speakText(text.value));
  testButton.addEventListener('click', () => speakText('सर्वे', true));

  pause.addEventListener('click', () => {
    synth.pause();
    updateControls();
  });

  resume.addEventListener('click', () => {
    synth.resume();
    updateControls();
  });

  stop.addEventListener('click', () => {
    synth.cancel();
    finish();
    status.textContent = 'Preview रोक दिया गया।';
  });

  rate.addEventListener('input', () => {
    document.getElementById('rateValue').textContent = Number(rate.value).toFixed(2) + '×';
  });

  pitch.addEventListener('input', () => {
    document.getElementById('pitchValue').textContent = Number(pitch.value).toFixed(2);
  });

  return {
    stop() {
      synth.cancel();
      finish();
    },
    refreshVoices: loadVoices
  };
}

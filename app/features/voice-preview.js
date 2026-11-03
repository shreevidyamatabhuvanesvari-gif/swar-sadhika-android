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
  const select = document.getElementById('voiceSelect');
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
  let selectedPath = null;
  let active = false;

  function currentMode() {
    return LANGUAGE_MODES[languageMode.value] || LANGUAGE_MODES.sanskrit;
  }

  function refreshVoiceChoices() {
    const mode = currentMode();
    const resolution = resolveLanguageVoices(allVoices, mode.id);
    selectedPath = resolution.path;
    const previous = select.value;
    select.replaceChildren();

    if (resolution.path === 'unavailable') {
      select.add(new Option('उपयुक्त भाषा-आवाज़ उपलब्ध नहीं', ''));
      select.disabled = true;
      speak.disabled = true;
      testButton.disabled = true;
    } else {
      const defaultLabel = resolution.path === 'hindi-fallback'
        ? 'डिवाइस की हिंदी आवाज़ (ध्वनि-सहायक)'
        : 'डिवाइस की उपयुक्त आवाज़';
      select.add(new Option(defaultLabel, ''));
      resolution.voices.forEach((voice, index) => {
        select.add(new Option(voice.name + ' · ' + voice.lang, String(index)));
      });
      select.disabled = false;
      speak.disabled = false;
      testButton.disabled = false;
      select.value = previous;
      if (select.value !== previous) select.value = '';
    }

    languageStatus.textContent = describeLanguagePath(mode.id, resolution.path) + ' ' + mode.hint;
    support.textContent = resolution.path === 'native'
      ? (mode.id === 'hindi' ? 'हिंदी आवाज़' : 'संस्कृत आवाज़')
      : resolution.path === 'hindi-fallback'
        ? 'हिंदी ध्वनि-सहायक'
        : 'आवाज़ अनुपलब्ध';
    document.documentElement.lang = mode.speechLang;
    return resolution;
  }

  function loadVoices() {
    allVoices = synth.getVoices();
    refreshVoiceChoices();
  }

  loadVoices();
  if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;

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
    const resolution = refreshVoiceChoices();
    if (resolution.path === 'unavailable') {
      status.textContent = describeLanguagePath(mode.id, resolution.path);
      return;
    }

    const original = normalizeStoredText(sourceText).trim();
    if (!original) {
      status.textContent = 'पहले पाठ लिखें।';
      return;
    }
    if (/\\n/.test(original)) {
      status.textContent = 'पाठ में literal backslash-n मिला। पहले पाठ शुद्ध करें।';
      return;
    }

    const speechText = prepareSpeechText(original, mode.id, resolution.path);
    const utterance = new SpeechSynthesisUtterance(speechText);
    const chosen = select.value;
    utterance.voice = chosen !== ''
      ? resolution.voices[Number(chosen)] || null
      : resolution.voices[0] || null;
    utterance.lang = utterance.voice?.lang || resolution.speechLang;
    utterance.rate = Number(rate.value);
    utterance.pitch = Number(pitch.value);

    synth.cancel();
    utterance.onstart = () => {
      active = true;
      onSpeaking(true);
      status.textContent = resolution.path === 'hindi-fallback'
        ? 'हिंदी आवाज़ से ध्वनि-सहायक Preview चल रहा है। संस्कृत का प्रमाणित उच्चारण अभी उपलब्ध नहीं है।'
        : mode.id === 'vedic'
          ? 'वैदिक संस्कृत Preview चल रहा है। स्वर-चिह्नों का वास्तविक पाठ आवाज़ पर निर्भर करता है।'
          : 'चयनित भाषा की आवाज़ चल रही है।';
      caption.textContent = isTest
        ? 'उच्चारण जाँच: सर्वे'
        : original;
      updateControls();
    };
    utterance.onend = () => {
      finish();
      status.textContent = isTest ? '“सर्वे” का Preview समाप्त हुआ। सुनकर उच्चारण जाँचें।' : 'पाठ का Preview समाप्त हुआ।';
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
    refreshVoiceChoices();
    status.textContent = 'भाषा मोड बदल गया। अब पाठ सुनें।';
  });

  select.addEventListener('change', () => {
    status.textContent = 'चयनित भाषा की आवाज़ तैयार है।';
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

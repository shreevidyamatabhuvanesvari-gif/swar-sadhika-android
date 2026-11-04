import { moduleEntry } from "./shared.js?v=20261104-language-three-v3";

const enginePanel = (title, body) => `<section class="card"><div class="heading-row"><h3>${title}</h3><span class="state-tag state-not-started">NOT_STARTED</span></div><p>${body}</p><p class="muted">इस क्षमता का PASS वास्तविक Output, Timing/Quality Tests और Android Chrome Evidence से ही तय होगा।</p></section>`;

export const avatarIndex = {
  id: "avatar", number: "INDEX 4", shortTitle: "अवतार एवं वीडियो", title: "अवतार, Body Language एवं Video Studio", kicker: "PERSONAL AVATAR · LIP-SYNC · VIDEO",
  modules: [
    moduleEntry("personal-avatar","Personal Avatar","Personal Photo एवं Video Avatar","अपनी Photo और Loop Video Clip को इसी Device के स्थानीय Database में सुरक्षित और बदलने का कार्य-पटल।",`
      <section class="card">
        <div class="card-grid avatar-upload-grid">
          <div><label class="field-label" for="avatar-photo-file">Avatar Photo चुनें / बदलें</label><input id="avatar-photo-file" class="field" type="file" accept="image/jpeg,image/png,image/webp"><div class="avatar-photo-thumb"><img id="avatar-photo-preview" alt="Saved Avatar Photo" hidden></div><button class="button button-soft" data-action="save-avatar-photo">नई Photo सुरक्षित करें / बदलें</button><p id="avatar-photo-status" class="status-line">नई Photo सुरक्षित करने पर पुरानी Photo इसी स्थान पर बदलेगी।</p></div>
          <div><label class="field-label" for="avatar-video-file">Avatar के साथ चलने वाली Video Clip चुनें</label><input id="avatar-video-file" class="field" type="file" accept="video/*"><button class="button button-soft" data-action="save-avatar-video">Video Clip सुरक्षित करें</button><p id="avatar-video-status" class="status-line">MP4/WebM जैसी Browser-supported Clip चुनें। अधिकतम 100 MB।</p></div>
        </div>
        <div class="field-group"><label class="field-label" for="avatar-chant-text">पूरा पाठ — इसके समाप्त होने तक Video Loop होगी</label><textarea id="avatar-chant-text" class="field-textarea">ॐ नमः शिवाय। सर्वे भवन्तु सुखिनः। सर्वे सन्तु निरामयाः॥</textarea><button class="button button-soft" data-action="load-latest-text">Text Studio का आखिरी सुरक्षित पाठ लाएँ</button></div>
        <div class="card-grid"><div><label class="field-label" for="avatar-language-select">भाषा चुनें</label><select id="avatar-language-select" class="field-select"><option value="vedic">वैदिक संस्कृत</option><option value="sanskrit" selected>संस्कृत</option><option value="hindi">हिंदी</option></select></div><div><label class="field-label" for="avatar-tts-rate">आवाज़ की गति</label><input id="avatar-tts-rate" class="field" type="range" min="0.5" max="1.5" step="0.05" value="0.9"></div><div><label class="field-label" for="avatar-tts-pitch">आवाज़ की Pitch</label><input id="avatar-tts-pitch" class="field" type="range" min="0.5" max="1.5" step="0.05" value="1.05"></div></div>
        <div id="avatar-stage" class="avatar-stage" aria-label="9:16 Avatar Playback Stage">
          <img id="avatar-stage-photo" alt="Avatar Photo" hidden>
          <video id="avatar-stage-video" playsinline muted loop preload="metadata" hidden></video>
          <div id="avatar-stage-placeholder" class="avatar-stage-placeholder">9:16 Avatar Stage<br>Photo या Video Clip चुनें</div>
          <button class="avatar-play-control" type="button" data-action="play-avatar-fullscreen"><span aria-hidden="true">▶</span> Fullscreen + पाठ चलाएँ</button>
        </div>
        <p id="avatar-play-status" class="status-line">Play दबाने पर 9:16 Stage Fullscreen होगा। नियंत्रण छिपेंगे; Clip Loop होकर पाठ पूरा होने पर रुकेगी।</p>
        <p class="notice">ध्यान दें: Video Clip का Loop और Device Speech Voice Playback वास्तविक रूप से जोड़ा गया है। Photo से स्वतः चेहरा animate करना या Phoneme-सynchronized Lip-Sync अभी लागू नहीं है। Video का Audio म्यूट रहेगा ताकि पाठ की आवाज़ स्पष्ट सुनाई दे।</p>
      </section>`,{engine:"A1 · A11",status:"IN_PROGRESS"}),
    moduleEntry("avatar-renderer","Avatar Renderer","Avatar Renderer एवं 9:16 Stage","स्थानीय Photo/Video को 9:16 Portrait Stage में प्रस्तुत करना।",`
      <section class="card"><p>Personal Avatar के 9:16 Stage का उपयोग Photo या Saved Video Clip के साथ किया जाता है। यह Stage स्वयं Face Rig या Photorealistic Animation तैयार नहीं करता।</p><p class="muted">Full-screen Playback का नियंत्रण Personal Avatar पटल में उपलब्ध है।</p></section>`,{engine:"A1 · A2 · A8",status:"IN_PROGRESS"}),
    moduleEntry("face-animation","Face Animation","Face Landmark एवं Face Animation","Face Landmarks, Blendshape Scores और Avatar Rig Mapping।",enginePanel("Face Landmarker","Face detection, landmarks और blendshapes का वास्तविक Model Output तथा Android Frame-Performance Evidence आवश्यक।"),{engine:"A2"}),
    moduleEntry("mouth-animation","Mouth Animation","Mouth Animation एवं Viseme Preview","Phoneme से Viseme/Mouth Shape Mapping और Timeline Preview।",enginePanel("Mouth Shape Mapping","Static CSS Animation को वास्तविक Phoneme/Viseme Lip-Sync नहीं माना जाएगा।"),{engine:"A4 · A5"}),
    moduleEntry("phoneme-alignment","Phoneme Alignment","Text एवं Audio Phoneme Alignment","Text, Phoneme और Generated Audio के बीच Word/Syllable/Phoneme Timestamps।",enginePanel("Phoneme Alignment","Model-provided timing या वास्तविक Alignment Model का Timestamp Track, Confidence और Error Report आवश्यक।"),{engine:"A3"}),
    moduleEntry("viseme-mapping","Viseme Mapping","Phoneme-to-Viseme Mapping","Hindi एवं Sanskrit Phonemes को Mouth Shapes में बदलना।",enginePanel("Viseme Inventory","Vowel/Consonant Mapping, Coarticulation, Transition और Rig Compatibility Test आवश्यक।"),{engine:"A4"}),
    moduleEntry("lip-sync","Lip-Sync","Audio-Synchronized Lip-Sync","Audio Clock के अनुसार समयबद्ध Mouth State और Frame-wise Viseme Rendering।",enginePanel("Real Lip-Sync","Pause, Resume, Seek, Long Audio, Drift Measurement और वास्तविक Lip-Sync Video आवश्यक।"),{engine:"A5"}),
    moduleEntry("facial-expression","Facial Expression","Facial Expression एवं Eye Movement","समर्थित Expression, Blink, Eye और Head Motion Controls।",enginePanel("Expression Rig","Blendshape/Rig Mapping और वास्तविक Render Test के बिना Expression Capability को PASS नहीं किया जाएगा।"),{engine:"A9"}),
    moduleEntry("body-language","Body Language","Body Language एवं Motion Retargeting","Pose Landmarks से Motion Profile और Avatar Rig में Retargeting।",enginePanel("Pose-to-Rig Retargeting","स्थिर Photo को Full Body Rig नहीं माना जाएगा। Pose Data, Joint Constraints और Rendered Motion आवश्यक।"),{engine:"A6 · A7 · A8"}),
    moduleEntry("caption","Caption एवं Text Synchronization","Caption एवं Text Synchronization","Audio Timeline के साथ उपलब्ध Word/Line Timing के अनुसार Caption Track तैयार करने का कार्य-पटल।",enginePanel("Caption Track","Caption Timing, Audio Seek और Playback Highlight का वास्तविक Output तथा Timing Test आवश्यक।"),{engine:"A10"}),
    moduleEntry("video-composition","Video Composition","Video Timeline एवं Composition","Avatar, Audio, Lip-Sync, Body Motion और Captions को एक Timeline में संयोजित करने का कार्य-पटल।",enginePanel("Video Composer","Rendered Frames, Audio Integration, Frame Rate और Timeline Validation आवश्यक।"),{engine:"A11"}),
    moduleEntry("video-export","Video Export","Video Encoding एवं Export","समर्थित Codec/Container में वास्तविक Video File बनाने, Mux करने और Validate करने का कार्य-पटल।",enginePanel("Video Encoder एवं Muxer","वास्तविक Encoded File, Container/Codec Inspection और Android Playback Evidence आवश्यक।"),{engine:"A12"})
  ]
};

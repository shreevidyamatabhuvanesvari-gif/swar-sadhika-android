import { putRecord } from "../core/storage.js";

export function initMediaLab({ toast = () => {} } = {}) {
  const input = document.getElementById("mediaFileInput");
  const audio = document.getElementById("audioPreview");
  const video = document.getElementById("videoPreview");
  const info = document.getElementById("mediaInfo");
  const actions = document.getElementById("audioPlaybackActions");
  const play = document.getElementById("audioPlayButton");
  const pause = document.getElementById("audioPauseButton");
  const stop = document.getElementById("audioStopButton");
  const status = document.getElementById("audioPlaybackStatus");
  if (!input || !audio || !video) return () => {};
  let objectUrl = null;
  let selected = null;

  function release() {
    audio.pause();
    video.pause();
    audio.removeAttribute("src");
    video.removeAttribute("src");
    audio.load();
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function updateButtons(ready) {
    if (play) play.disabled = !ready || !audio.paused;
    if (pause) pause.disabled = !ready || audio.paused;
    if (stop) stop.disabled = !ready;
  }

  input.addEventListener("change", () => {
    release();
    selected = input.files?.[0] || null;
    audio.hidden = true;
    video.hidden = true;
    if (actions) actions.hidden = true;
    updateButtons(false);
    if (!selected) {
      if (info) info.textContent = "कोई मीडिया फ़ाइल नहीं चुनी गई।";
      return;
    }
    const isAudio = selected.type.startsWith("audio/") ||
      /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(selected.name);
    const isVideo = selected.type.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v|ogv)$/i.test(selected.name);
    if (!isAudio && !isVideo) {
      selected = null;
      if (info) info.textContent = "समर्थित Audio या Video फ़ाइल चुनें।";
      return;
    }
    objectUrl = URL.createObjectURL(selected);
    if (isAudio) {
      audio.src = objectUrl;
      audio.hidden = false;
      if (actions) actions.hidden = false;
      updateButtons(true);
      if (status) status.textContent = "ऑडियो Preview तैयार है।";
    } else {
      video.src = objectUrl;
      video.hidden = false;
    }
    if (info) {
      info.textContent = selected.name + " · " +
        (selected.size / 1048576).toFixed(2) +
        " MB · इसी टैब में Preview; मूल फ़ाइल Upload नहीं हुई।";
    }
  });

  play?.addEventListener("click", async () => {
    try {
      await audio.play();
      if (status) status.textContent = "ऑडियो चल रहा है।";
      updateButtons(true);
    } catch (error) {
      if (status) status.textContent = "ऑडियो शुरू नहीं हुआ: " + error.message;
    }
  });
  pause?.addEventListener("click", () => {
    audio.pause();
    if (status) status.textContent = "ऑडियो रोका गया।";
    updateButtons(true);
  });
  stop?.addEventListener("click", () => {
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    if (status) status.textContent = "ऑडियो आरम्भ पर लौट आया।";
    updateButtons(true);
  });
  audio.addEventListener("play", () => updateButtons(true));
  audio.addEventListener("pause", () => updateButtons(Boolean(audio.src)));
  audio.addEventListener("ended", () => {
    if (status) status.textContent = "ऑडियो पूरा हुआ।";
    updateButtons(true);
  });

  document.getElementById("saveMediaNotesButton")?.addEventListener("click", async () => {
    const notes = String(document.getElementById("mediaNotes")?.value || "").trim();
    if (!selected) {
      toast("पहले Audio या Video चुनें।");
      return;
    }
    if (!notes) {
      toast("मीडिया अध्ययन टिप्पणी लिखें।");
      return;
    }
    try {
      await putRecord("mediaNotes", { title: selected.name, mimeType: selected.type, notes });
      toast("मीडिया नोट्स सुरक्षित हुए। मूल मीडिया फ़ाइल स्थायी Library में Copy नहीं हुई।");
    } catch (error) {
      toast(error.message);
    }
  });

  window.addEventListener("pagehide", release, { once: true });
  return release;
}

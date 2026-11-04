import { createSingingEnginePart2 } from "../singing/singing-engine-part2.js";
import { createAvatarEnginePart2 } from "../avatar/avatar-engine-part2.js";

export function createCoordinatedEnginesPart2(options = {}) {
  const singing = options.singingEngine || createSingingEnginePart2();
  const avatar = options.avatarEngine || createAvatarEnginePart2();
  const audioFactory = options.audioFactory || (() => new Audio());
  const urlApi = options.urlApi || URL;
  const requestFrame = options.requestAnimationFrame || globalThis.requestAnimationFrame?.bind(globalThis)
    || (callback => globalThis.setTimeout(() => callback(Date.now()), 25));
  const cancelFrame = options.cancelAnimationFrame || globalThis.cancelAnimationFrame?.bind(globalThis)
    || globalThis.clearTimeout?.bind(globalThis);
  let active = null;
  let nextSessionId = 1;

  function getStatus() {
    return Object.freeze({
      version: "2.0.0",
      singing: singing.getStatus(),
      avatar: avatar.getStatus(),
      synchronization: "GENERATED_AUDIO_MASTER_CLOCK"
    });
  }

  function stop(reason = "Playback stopped") {
    const session = active;
    if (!session) return false;
    active = null;
    session.cancelled = true;
    try { session.audio.pause(); } catch {}
    try { session.audio.removeAttribute?.("src"); session.audio.load?.(); } catch {}
    if (session.frameId != null && cancelFrame) cancelFrame(session.frameId);
    try { avatar.reset(); } catch {}
    try { if (session.url) urlApi.revokeObjectURL(session.url); } catch {}
    session.finish?.(new Error(reason));
    return true;
  }

  async function play(text, playOptions = {}) {
    stop("Superseded by a new chant session");
    const sessionId = nextSessionId++;
    const audio = audioFactory();
    if (!audio) throw new Error("HTMLAudioElement is unavailable");
    const session = { id: sessionId, audio, url: null, frameId: null, cancelled: false, finish: null };
    active = session;
    const onStatus = typeof playOptions.onStatus === "function" ? playOptions.onStatus : () => {};
    const stage = playOptions.stage || null;
    avatar.attachStage(stage);

    let generated;
    try {
      onStatus({ state: "GENERATING_AUDIO", sessionId });
      generated = await singing.generate(text, {
        languageMode: playOptions.languageMode || "sanskrit",
        tempo: playOptions.tempo,
        voiceProfile: playOptions.voiceProfile,
        ...playOptions.providerOptions
      });
      if (active !== session || session.cancelled) throw new Error("Chant session was cancelled");
      session.url = urlApi.createObjectURL(generated.audio);
      audio.preload = "auto";
      audio.src = session.url;
      audio.load?.();
      const alignmentCount = avatar.setAlignment(generated.alignment);
      onStatus({
        state: "AUDIO_READY",
        sessionId,
        audioBytes: generated.audio.size,
        hasPhonemeAlignment: alignmentCount > 0,
        lipSyncState: alignmentCount > 0 ? "TIMELINE_AVAILABLE_RENDERER_UNVERIFIED" : "ALIGNMENT_UNAVAILABLE"
      });
    } catch (error) {
      if (active === session) active = null;
      try { if (session.url) urlApi.revokeObjectURL(session.url); } catch {}
      onStatus({ state: "ERROR", sessionId, message: error.message });
      throw error;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        if (session.frameId != null && cancelFrame) cancelFrame(session.frameId);
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        if (active === session) active = null;
        try { avatar.reset(); } catch {}
        try { if (session.url) urlApi.revokeObjectURL(session.url); } catch {}
        if (error) {
          onStatus({ state: "ERROR", sessionId, message: error.message });
          reject(error);
        } else {
          onStatus({ state: "COMPLETED", sessionId });
          resolve(Object.freeze({ sessionId, generated, synchronized: generated.alignment.length > 0 }));
        }
      };
      session.finish = finish;
      const tick = () => {
        if (active !== session || session.cancelled) return;
        try {
          const state = avatar.updateAt(Number(audio.currentTime || 0));
          onStatus({ state: "PLAYING", sessionId, currentTime: Number(audio.currentTime || 0), viseme: state.viseme });
        } catch (error) {
          onStatus({ state: "SYNC_ERROR", sessionId, message: error.message });
        }
        if (!audio.paused && !audio.ended) session.frameId = requestFrame(tick);
      };
      audio.onplay = () => {
        onStatus({ state: "PLAYING", sessionId, masterClock: "HTMLAudioElement.currentTime" });
        tick();
      };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error(audio.error?.message || "Generated audio could not be played"));
      audio.onpause = () => {
        if (!audio.ended && active === session) {
          if (session.frameId != null && cancelFrame) cancelFrame(session.frameId);
          session.frameId = null;
          avatar.reset();
          onStatus({ state: "PAUSED", sessionId });
        }
      };
      Promise.resolve(audio.play()).catch(finish);
    });
  }

  return Object.freeze({
    singing,
    avatar,
    play,
    stop,
    getStatus,
    registerSingingProvider: singing.registerProvider,
    registerAvatarRenderer: avatar.setRenderer,
    hasSingingProvider: () => singing.getStatus().state !== "NO_PROVIDER"
  });
}

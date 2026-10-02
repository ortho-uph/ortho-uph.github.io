(function () {
  "use strict";

  let enginePromise = null;
  let engine = null;
  let audioContext = null;
  let activeSource = null;
  let status = "idle";
  const listeners = new Set();

  function announce(nextStatus, message) {
    status = nextStatus;
    listeners.forEach(listener => listener({ status, message }));
  }

  function getAudioContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("เบราว์เซอร์นี้ไม่รองรับ Web Audio");
      audioContext = new AudioContextClass();
    }
    return audioContext;
  }

  async function unlock() {
    const context = getAudioContext();
    if (context.state === "suspended") await context.resume();
    const silent = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = silent;
    source.connect(context.destination);
    source.start();
  }

  async function prepare() {
    if (engine) return engine;
    if (enginePromise) return enginePromise;

    announce("loading", "กำลังโหลดเสียงภาษาไทยของระบบ ครั้งแรกประมาณ 24 MB…");
    enginePromise = import("./vendor/espeak/espeak-ng.js")
      .then(module => module.default({
        setStatus(message) {
          if (message && /Downloading data/i.test(message)) {
            announce("loading", "กำลังโหลดเสียงภาษาไทยของระบบ ครั้งแรกประมาณ 24 MB…");
          }
        }
      }))
      .then(runtime => {
        const worker = new runtime.eSpeakNGWorker();
        const thaiVoice = worker.list_voices().find(voice => voice.languages.some(language => language.name === "th"));
        if (!thaiVoice || worker.set_voice("", "th") !== 0) throw new Error("ไม่พบเสียงภาษาไทยในเอนจิน");
        worker.rate = 145;
        worker.pitch = 48;
        worker.volume = 100;
        engine = { worker, sampleRate: worker.samplerate };
        announce("ready", "เสียงภาษาไทยของระบบพร้อมใช้งานทุกเครื่อง");
        return engine;
      })
      .catch(error => {
        enginePromise = null;
        announce("error", "โหลดเสียงไทยไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
        throw error;
      });
    return enginePromise;
  }

  function stop() {
    if (!activeSource) return;
    try { activeSource.stop(); } catch (_) { /* source may have ended */ }
    activeSource = null;
  }

  async function speak(text) {
    const phrase = String(text || "").trim();
    if (!phrase) return;
    await unlock();
    const { worker, sampleRate } = await prepare();
    const chunks = [];
    let totalLength = 0;
    worker.synthesize(phrase, samples => {
      if (samples.length) {
        chunks.push(samples);
        totalLength += samples.length;
      }
      return false;
    });
    if (!totalLength) throw new Error("สร้างเสียงไม่สำเร็จ");

    const context = getAudioContext();
    const buffer = context.createBuffer(1, totalLength, sampleRate);
    const channel = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of chunks) {
      for (let index = 0; index < chunk.length; index++) channel[offset + index] = chunk[index] / 32768;
      offset += chunk.length;
    }

    stop();
    activeSource = context.createBufferSource();
    activeSource.buffer = buffer;
    activeSource.connect(context.destination);
    activeSource.onended = () => { activeSource = null; };
    activeSource.start();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.ThaiSpeech = { prepare, speak, stop, unlock, subscribe, getStatus: () => status };
})();

(function () {
  "use strict";

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbzkTF08dH_w6FU8CixUThwO25fDZ9n2SI6XMqTJqnWbSeo-gTFpsVy9JYdDqRDdPmS51A/exec";
  const CACHE_NAME = "medicine-thai-speech-premwadee-v1";
  let audioContext = null;
  let activeSource = null;
  let requestId = 0;
  let preparePromise = null;
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
    if (status === "ready") return true;
    if (preparePromise) return preparePromise;
    announce("loading", "กำลังเชื่อมต่อเสียงพากย์ภาษาไทย…");
    preparePromise = fetch(`${ENDPOINT}?action=medicineSpeechStatus&_=${Date.now()}`, { cache: "no-store" })
      .then(response => response.json())
      .then(result => {
        if (!result?.ok || !result.configured) throw new Error(result?.err || "speech_not_configured");
        announce("ready", "เสียงไทย Premwadee พร้อมใช้งาน");
        return true;
      })
      .catch(error => {
        preparePromise = null;
        announce("fallback", "เสียงไทยออนไลน์ยังไม่พร้อม — จะใช้เสียงอังกฤษสำรอง");
        throw error;
      });
    return preparePromise;
  }

  function cacheRequest(text) {
    return new Request(`${location.origin}${location.pathname}__thai_speech__/${encodeURIComponent(text)}`);
  }

  async function cachedAudio(text) {
    if (!("caches" in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheRequest(text));
    return response ? response.arrayBuffer() : null;
  }

  async function requestAudio(text) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "medicineSpeech", text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok || !result.audio) throw new Error(result?.err || "speech_request_failed");
    const binary = atob(result.audio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const buffer = bytes.buffer;
    if ("caches" in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheRequest(text), new Response(buffer.slice(0), { headers: { "content-type": result.mime || "audio/mpeg" } }));
    }
    return buffer;
  }

  function speakEnglish(text) {
    if (!("speechSynthesis" in window)) throw new Error("english_fallback_unavailable");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || "Medicine detected"));
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /^en-(US|GB)/i.test(voice.lang)) || voices.find(voice => /^en/i.test(voice.lang)) || null;
    utterance.lang = utterance.voice?.lang || "en-US";
    utterance.rate = 0.88;
    utterance.onend = () => announce("fallback", "กำลังใช้เสียงอังกฤษสำรอง");
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    requestId++;
    window.speechSynthesis?.cancel();
    if (!activeSource) return;
    try { activeSource.stop(); } catch (_) { /* source may have ended */ }
    activeSource = null;
  }

  async function speak(value, englishFallback) {
    const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) return;
    await unlock();
    const activeRequest = ++requestId;
    try {
      await prepare();
      if (activeRequest !== requestId) return;
      announce("speaking", "กำลังอ่านชื่อยาเป็นภาษาไทย…");
      const encodedAudio = await cachedAudio(text) || await requestAudio(text);
      if (activeRequest !== requestId) return;
      const context = getAudioContext();
      const buffer = await context.decodeAudioData(encodedAudio.slice(0));
      if (activeRequest !== requestId) return;
      if (activeSource) {
        try { activeSource.stop(); } catch (_) { /* source may have ended */ }
      }
      activeSource = context.createBufferSource();
      activeSource.buffer = buffer;
      activeSource.connect(context.destination);
      activeSource.onended = () => {
        if (activeRequest === requestId) announce("ready", "เสียงไทย Premwadee พร้อมใช้งาน");
        activeSource = null;
      };
      activeSource.start();
    } catch (error) {
      if (activeRequest !== requestId) return;
      announce("fallback", "เสียงไทยขัดข้อง — กำลังใช้เสียงอังกฤษสำรอง");
      speakEnglish(englishFallback || text);
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.ThaiSpeech = { prepare, speak, stop, unlock, subscribe, getStatus: () => status };
})();

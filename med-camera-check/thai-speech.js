/*
 * ThaiSpeech — อ่านชื่อยาเป็นเสียงภาษาไทย แบบมีหลายชั้นสำรอง
 *
 * ลำดับการทำงานในโหมด "อัตโนมัติ":
 *   1) Azure Premwadee ผ่าน Google Apps Script (เสียงดีที่สุด ต้องตั้งค่า key)
 *   2) เสียงภาษาไทยที่มีในเครื่อง/เบราว์เซอร์ (Edge มี Premwadee/Niwat ฟรี, Windows มี Pattara)
 *   3) eSpeak-NG ภาษาไทยแบบออฟไลน์ (อยู่ใน vendor/espeak ใช้ได้เสมอเมื่อเปิดผ่าน http/https)
 *   4) เสียงภาษาอังกฤษของเครื่อง (ทางสุดท้าย)
 */
(function () {
  "use strict";

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbzkTF08dH_w6FU8CixUThwO25fDZ9n2SI6XMqTJqnWbSeo-gTFpsVy9JYdDqRDdPmS51A/exec";
  const CACHE_NAME = "medicine-thai-speech-premwadee-v1";
  const AZURE_TIMEOUT_MS = 8000;
  const AZURE_RETRY_AFTER_MS = 5 * 60 * 1000;
  const ESPEAK_URL = new URL("vendor/espeak/espeak-ng.js", document.currentScript?.src || location.href).href;
  const ENGINE_KEY = "thaiSpeechEngine";
  const ENGINE_LABEL = {
    azure: "เสียงไทย Premwadee (Azure)",
    browser: "เสียงไทยของเครื่อง",
    espeak: "เสียงไทยออฟไลน์ (eSpeak)",
    english: "เสียงอังกฤษสำรอง"
  };

  let audioContext = null;
  let activeSource = null;
  let requestId = 0;
  let status = "idle";
  let lastEngine = "";
  const listeners = new Set();

  // ---------- สถานะ ----------
  function announce(nextStatus, message) {
    status = nextStatus;
    listeners.forEach(listener => { try { listener({ status, message, engine: lastEngine }); } catch (_) { /* ignore */ } });
  }

  function getPreferredEngine() {
    try { return localStorage.getItem(ENGINE_KEY) || "auto"; } catch (_) { return "auto"; }
  }

  function setPreferredEngine(value) {
    try { localStorage.setItem(ENGINE_KEY, value); } catch (_) { /* ignore */ }
    azure.failedAt = 0;
    announce("idle", "เปลี่ยนแหล่งเสียงแล้ว กด “ทดสอบเสียงไทย” เพื่อลองฟัง");
  }

  // ---------- Web Audio ----------
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

  function playBuffer(buffer, activeRequest) {
    return new Promise(resolve => {
      const context = getAudioContext();
      if (activeSource) { try { activeSource.stop(); } catch (_) { /* ended */ } }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => { if (activeSource === source) activeSource = null; resolve(activeRequest === requestId); };
      activeSource = source;
      source.start();
    });
  }

  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + "_timeout")), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  // ---------- 1) Azure ผ่าน Apps Script ----------
  const azure = { checked: null, failedAt: 0 };

  function azureCoolingDown() {
    return azure.failedAt && Date.now() - azure.failedAt < AZURE_RETRY_AFTER_MS;
  }

  async function azureAvailable() {
    if (azureCoolingDown()) return false;
    if (azure.checked) return azure.checked;
    azure.checked = withTimeout(
      fetch(`${ENDPOINT}?action=medicineSpeechStatus&_=${Date.now()}`, { cache: "no-store" }).then(r => r.json()),
      AZURE_TIMEOUT_MS, "azure_status"
    ).then(result => {
      if (!result?.ok || !result.configured) throw new Error(result?.err || "speech_not_configured");
      return true;
    }).catch(error => {
      console.warn("Azure Thai speech unavailable:", error);
      azure.failedAt = Date.now();
      azure.checked = null;
      return false;
    });
    return azure.checked;
  }

  function cacheRequest(text) {
    return new Request(`${location.origin}${location.pathname}__thai_speech__/${encodeURIComponent(text)}`);
  }

  async function cachedAudio(text) {
    if (!("caches" in window)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(cacheRequest(text));
      return response ? response.arrayBuffer() : null;
    } catch (_) { return null; }
  }

  async function requestAzureAudio(text) {
    const response = await withTimeout(fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "medicineSpeech", text })
    }), AZURE_TIMEOUT_MS, "azure_speech");
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok || !result.audio) throw new Error(result?.err || "speech_request_failed");
    const binary = atob(result.audio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const buffer = bytes.buffer;
    if ("caches" in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheRequest(text), new Response(buffer.slice(0), { headers: { "content-type": result.mime || "audio/mpeg" } }));
      } catch (_) { /* cache is optional */ }
    }
    return buffer;
  }

  async function speakAzure(text, activeRequest) {
    const cached = await cachedAudio(text);
    if (!cached && !(await azureAvailable())) throw new Error("azure_unavailable");
    let encoded;
    try {
      encoded = cached || await requestAzureAudio(text);
    } catch (error) {
      azure.failedAt = Date.now();
      throw error;
    }
    if (activeRequest !== requestId) return;
    const buffer = await getAudioContext().decodeAudioData(encoded.slice(0));
    if (activeRequest !== requestId) return;
    await playBuffer(buffer, activeRequest);
  }

  // ---------- 2) เสียงไทยของเบราว์เซอร์/Windows ----------
  function loadVoices() {
    if (!("speechSynthesis" in window)) return Promise.resolve([]);
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) return Promise.resolve(voices);
    return new Promise(resolve => {
      const done = () => resolve(window.speechSynthesis.getVoices());
      window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1500);
    });
  }

  function rankThaiVoice(voice) {
    const name = voice.name || "";
    let score = 0;
    if (/natural|neural|online/i.test(name)) score += 4;
    if (/premwadee|niwat|achara/i.test(name)) score += 3;
    if (/google/i.test(name)) score += 2;
    if (voice.localService) score += 1;
    return score;
  }

  async function findThaiVoice() {
    const voices = await loadVoices();
    const thai = voices.filter(voice => /^th([-_]|$)/i.test(voice.lang || "") || /thai|ไทย/i.test(voice.name || ""));
    return thai.sort((a, b) => rankThaiVoice(b) - rankThaiVoice(a))[0] || null;
  }

  function speakUtterance(text, voice, lang, rate, activeRequest) {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || lang;
      utterance.rate = rate;
      let started = false;
      // ถ้าเสียงไม่เริ่มภายใน 4 วินาที ถือว่าเสียงนี้ใช้ไม่ได้ (เช่น เสียงออนไลน์ของ Edge ต่อเน็ตไม่ได้)
      const startTimer = setTimeout(() => { if (!started) { synth.cancel(); reject(new Error("voice_no_start")); } }, 4000);
      utterance.onstart = () => { started = true; clearTimeout(startTimer); };
      utterance.onend = () => { clearTimeout(startTimer); resolve(activeRequest === requestId); };
      utterance.onerror = event => {
        clearTimeout(startTimer);
        if (event.error === "interrupted" || event.error === "canceled") resolve(false);
        else reject(new Error("voice_" + (event.error || "error")));
      };
      synth.speak(utterance);
    });
  }

  async function speakBrowserThai(text, activeRequest) {
    if (!("speechSynthesis" in window)) throw new Error("speech_synthesis_unavailable");
    const voice = await findThaiVoice();
    if (!voice) throw new Error("no_thai_voice");
    if (activeRequest !== requestId) return;
    await speakUtterance(text, voice, "th-TH", 0.9, activeRequest);
  }

  // ---------- 3) eSpeak-NG ภาษาไทยแบบออฟไลน์ ----------
  let espeakPromise = null;

  function loadEspeak() {
    if (!espeakPromise) {
      if (location.protocol === "file:") {
        espeakPromise = Promise.reject(new Error("espeak_needs_http"));
      } else {
        espeakPromise = import(ESPEAK_URL)
          .then(module => module.default())
          .then(Module => {
            const worker = new Module.eSpeakNGWorker();
            worker.set_voice("th", "", 0, 0, 0);
            worker.set_rate(145);
            return worker;
          });
      }
      espeakPromise.catch(() => { espeakPromise = null; });
    }
    return espeakPromise;
  }

  async function speakEspeak(text, activeRequest) {
    const worker = await loadEspeak();
    if (activeRequest !== requestId) return;
    const pieces = [];
    let total = 0;
    worker.synthesize(text, samples => {
      if (samples && samples.length) { pieces.push(samples.slice()); total += samples.length; }
      return 0;
    });
    if (!total) throw new Error("espeak_no_audio");
    const sampleRate = worker.get_samplerate();
    const context = getAudioContext();
    const buffer = context.createBuffer(1, total, sampleRate);
    const channel = buffer.getChannelData(0);
    let offset = 0;
    for (const piece of pieces) {
      for (let i = 0; i < piece.length; i++) channel[offset + i] = piece[i] / 32768;
      offset += piece.length;
    }
    if (activeRequest !== requestId) return;
    await playBuffer(buffer, activeRequest);
  }

  // ---------- 4) เสียงอังกฤษ ----------
  async function speakEnglish(text, activeRequest) {
    if (!("speechSynthesis" in window)) throw new Error("english_fallback_unavailable");
    const voices = await loadVoices();
    const voice = voices.find(v => /^en-(US|GB)/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
    await speakUtterance(String(text || "Medicine detected"), voice, "en-US", 0.88, activeRequest);
  }

  // ---------- ตัวควบคุมหลัก ----------
  const ENGINES = {
    azure: (text, englishText, id) => speakAzure(text, id),
    browser: (text, englishText, id) => speakBrowserThai(text, id),
    espeak: (text, englishText, id) => speakEspeak(text, id),
    english: (text, englishText, id) => speakEnglish(englishText || text, id)
  };

  function engineOrder() {
    const preferred = getPreferredEngine();
    const auto = ["azure", "browser", "espeak", "english"];
    if (preferred === "auto" || !ENGINES[preferred]) return auto;
    return [preferred, ...auto.filter(name => name !== preferred)];
  }

  async function prepare() {
    announce("loading", "กำลังตรวจหาเสียงภาษาไทย…");
    const preferred = getPreferredEngine();
    if ((preferred === "auto" || preferred === "azure") && await azureAvailable()) {
      lastEngine = "azure";
      announce("ready", "พร้อม: " + ENGINE_LABEL.azure);
      return true;
    }
    if (preferred !== "espeak" && await findThaiVoice().catch(() => null)) {
      const voice = await findThaiVoice();
      lastEngine = "browser";
      announce("ready", `พร้อม: ${ENGINE_LABEL.browser} (${voice.name})`);
      return true;
    }
    try {
      await loadEspeak();
      lastEngine = "espeak";
      announce("ready", "พร้อม: " + ENGINE_LABEL.espeak);
      return true;
    } catch (error) {
      console.warn("eSpeak unavailable:", error);
    }
    lastEngine = "english";
    announce("fallback", "ไม่พบเสียงภาษาไทย จะใช้เสียงอังกฤษสำรอง (ดูวิธีแก้ในหน้าตั้งค่า)");
    return false;
  }

  function stop() {
    requestId++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (!activeSource) return;
    try { activeSource.stop(); } catch (_) { /* source may have ended */ }
    activeSource = null;
  }

  async function speak(value, englishFallback) {
    const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) return;
    try { await unlock(); } catch (_) { /* Web Audio may be unavailable; speechSynthesis can still work */ }
    stop();
    const activeRequest = requestId;
    const errors = [];
    for (const name of engineOrder()) {
      if (activeRequest !== requestId) return;
      try {
        lastEngine = name;
        announce(name === "english" ? "fallback" : "speaking", `กำลังอ่านด้วย${ENGINE_LABEL[name]}…`);
        await ENGINES[name](text, englishFallback, activeRequest);
        if (activeRequest === requestId) announce(name === "english" ? "fallback" : "ready", "อ่านล่าสุดด้วย: " + ENGINE_LABEL[name]);
        return name;
      } catch (error) {
        errors.push(`${name}: ${error?.message || error}`);
        console.warn(`Thai speech engine "${name}" failed`, error);
      }
    }
    announce("error", "อ่านเสียงไม่สำเร็จ กรุณาตรวจลำโพง");
    throw new Error(errors.join(" | "));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.ThaiSpeech = {
    prepare, speak, stop, unlock, subscribe,
    getStatus: () => status,
    getEngine: () => lastEngine,
    getPreferredEngine, setPreferredEngine,
    preloadOffline: () => loadEspeak()
  };
})();

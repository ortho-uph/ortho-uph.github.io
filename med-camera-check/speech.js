/*
 * MedSpeech — อ่านชื่อยาเป็นภาษาไทยด้วยเสียง AI
 *
 * ใช้เฉพาะเสียงภาษาไทยเท่านั้น ไม่มีเสียงสังเคราะห์แบบหุ่นยนต์ (eSpeak) และไม่ใช้เสียงอังกฤษอ่านภาษาไทย
 *   1) เสียง AI ภาษาไทยของ Microsoft Edge: Premwadee / Niwat (Online Natural) — แนะนำ
 *   2) เสียงไทยอื่นของเครื่อง เช่น Pattara (Windows), Kanya (Apple), Google ไทย (Android)
 *   3) ถ้าเครื่องไม่มีเสียงไทยเลย: เล่นเสียงสัญญาณ "ติ๊ง" และแสดงชื่อยาตัวใหญ่บนจอแทน
 */
(function () {
  "use strict";

  const PREF_KEY = "medSpeechVoiceURI";
  const RATE_KEY = "medSpeechRate";
  const listeners = new Set();
  let voices = [];
  let audioCtx = null;
  let speakToken = 0;

  const synth = window.speechSynthesis || null;

  function rankVoice(voice) {
    const name = voice.name || "";
    if (/Premwadee/i.test(name)) return 100;
    if (/Niwat/i.test(name)) return 95;
    if (/Achara/i.test(name)) return 90;
    if (/Natural|Neural|Online/i.test(name)) return 85;
    if (/Kanya|Narisa/i.test(name)) return 75;
    if (/Google/i.test(name)) return 70;
    if (/Pattara/i.test(name)) return 60;
    return 50;
  }

  function isThai(voice) {
    return /^th(-|_|$)/i.test(voice.lang || "") || /Thai|ไทย/i.test(voice.name || "");
  }

  function isAiVoice(voice) {
    return Boolean(voice) && rankVoice(voice) >= 85;
  }

  function thaiVoices() {
    return voices.filter(isThai).sort((a, b) => rankVoice(b) - rankVoice(a));
  }

  function selectedVoice() {
    const list = thaiVoices();
    const preferred = localStorage.getItem(PREF_KEY);
    return list.find(v => v.voiceURI === preferred) || list[0] || null;
  }

  function isEdge() { return /Edg\//.test(navigator.userAgent); }

  function status() {
    const voice = selectedVoice();
    if (!synth) return { level: "none", voice: null, message: "เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง กรุณาเปิดใน Microsoft Edge" };
    if (!voice) {
      return {
        level: "none", voice: null,
        message: isEdge()
          ? "ยังไม่พบเสียงไทย ตรวจว่าเครื่องต่ออินเทอร์เน็ต แล้วรีเฟรชหน้า"
          : "เครื่องนี้ไม่มีเสียงไทย กรุณาเปิดเว็บนี้ใน Microsoft Edge เพื่อใช้เสียง AI ภาษาไทย"
      };
    }
    if (isAiVoice(voice)) return { level: "ai", voice, message: `ใช้เสียง AI ภาษาไทย: ${voice.name}` };
    return {
      level: "basic", voice,
      message: `ใช้เสียงไทยของเครื่อง: ${voice.name} — ถ้าต้องการเสียง AI ที่เป็นธรรมชาติกว่า ให้เปิดใน Microsoft Edge`
    };
  }

  function emit() { const s = status(); listeners.forEach(fn => { try { fn(s); } catch (e) { console.error(e); } }); }

  function refreshVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    emit();
  }

  function ensureAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  // ต้องเรียกจากการคลิกของผู้ใช้หนึ่งครั้ง เพื่อให้เบราว์เซอร์ยอมเล่นเสียง
  function unlock() {
    ensureAudio();
    if (synth && !unlock.done) {
      try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch (e) { /* ignore */ }
      unlock.done = true;
    }
  }

  function tone(kind = "ok") {
    const ctx = ensureAudio();
    if (!ctx) return Promise.resolve();
    const notes = kind === "ok" ? [880, 1320] : kind === "warn" ? [440, 330] : [660];
    const start = ctx.currentTime + .02;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      const t = start + i * .16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(.35, t + .02);
      gain.gain.exponentialRampToValueAtTime(.001, t + .28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + .3);
    });
    return new Promise(resolve => setTimeout(resolve, notes.length * 160 + 150));
  }

  function stop() {
    speakToken++;
    if (synth) synth.cancel();
  }

  function utter(text, voice, token) {
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice.lang || "th-TH";
      u.voice = voice;
      u.rate = Number(localStorage.getItem(RATE_KEY) || .95);
      u.pitch = 1; u.volume = 1;
      let started = false;
      // เสียงออนไลน์ของ Edge ถ้าเน็ตหลุดจะไม่เริ่มพูด — รอ 6 วินาทีแล้วเปลี่ยนไปใช้เสียงอื่น
      const guard = setTimeout(() => { if (!started) { synth.cancel(); reject(new Error("timeout")); } }, 6000);
      u.onstart = () => { started = true; };
      u.onend = () => { clearTimeout(guard); resolve(); };
      u.onerror = event => {
        clearTimeout(guard);
        if (token !== speakToken || event.error === "interrupted" || event.error === "canceled") resolve();
        else reject(new Error(event.error || "speech error"));
      };
      synth.speak(u);
    });
  }

  // พูดข้อความภาษาไทย คืนค่าวิธีที่ใช้จริง: "ai" | "basic" | "tone"
  async function speak(text) {
    const token = ++speakToken;
    if (synth) synth.cancel();
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const candidates = thaiVoices();
    const first = selectedVoice();
    const ordered = first ? [first, ...candidates.filter(v => v !== first)] : candidates;
    for (const voice of ordered.slice(0, 3)) {
      if (token !== speakToken) return "cancelled";
      try {
        await utter(clean, voice, token);
        return isAiVoice(voice) ? "ai" : "basic";
      } catch (error) {
        console.warn("Thai voice failed, trying next", voice.name, error.message);
      }
    }
    await tone("ok");
    return "tone";
  }

  function subscribe(fn) { listeners.add(fn); fn(status()); return () => listeners.delete(fn); }

  function setVoice(voiceURI) {
    if (voiceURI) localStorage.setItem(PREF_KEY, voiceURI); else localStorage.removeItem(PREF_KEY);
    emit();
  }

  function setRate(rate) { localStorage.setItem(RATE_KEY, String(rate)); }
  function getRate() { return Number(localStorage.getItem(RATE_KEY) || .95); }

  if (synth) {
    refreshVoices();
    synth.addEventListener?.("voiceschanged", refreshVoices);
    // บางเครื่องโหลดรายชื่อเสียงช้า
    [300, 1000, 2500, 5000].forEach(ms => setTimeout(refreshVoices, ms));
  }

  window.MedSpeech = { speak, stop, tone, unlock, subscribe, status, thaiVoices, setVoice, setRate, getRate, isEdge, isAiVoice };
})();

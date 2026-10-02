(function () {
  "use strict";

  const MODEL_URL = "https://huggingface.co/siridech/mms-tts-tha-onnx/resolve/main/model.onnx?download=true";
  const SAMPLE_RATE = 16000;
  const BLANK_ID = 0;
  const UNKNOWN_ID = 71;
  const VOCAB = {
    "า": 0, "น": 1, "่": 2, "ร": 3, "เ": 4, "้": 5, "อ": 6, "ง": 7,
    "ก": 8, "ว": 9, "ะ": 10, "ั": 11, "ม": 12, "ท": 13, "พ": 14, "ย": 15,
    "ล": 16, "จ": 17, "ี": 18, "ค": 19, "ต": 20, "ด": 21, "ห": 22, "ข": 23,
    "ิ": 24, "แ": 25, "ส": 26, "บ": 27, "ป": 28, "ไ": 29, "ู": 30, "ใ": 31,
    "็": 32, "ื": 33, "์": 34, "ช": 35, "ุ": 36, "ึ": 37, "ํ": 38, "โ": 39,
    "ผ": 40, "ถ": 41, "ญ": 42, "ซ": 43, "ธ": 44, "ศ": 45, "ณ": 46, "ษ": 47,
    "ฟ": 48, "ภ": 49, "ฉ": 50, "ฝ": 51, "ฐ": 52, "ฤ": 53, "ฏ": 54, "ฮ": 55,
    "ฆ": 56, "๋": 57, "ฎ": 58, "'": 59, "0": 60, "๊": 61, "ฑ": 62, "1": 63,
    "4": 64, "2": 65, "-": 66, "ฬ": 67, "ฒ": 68, "ฌ": 69, " ": 70
  };

  let sessionPromise = null;
  let session = null;
  let audioContext = null;
  let activeSource = null;
  let requestId = 0;
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
    if (session) return session;
    if (sessionPromise) return sessionPromise;
    if (!window.ort?.InferenceSession) {
      const error = new Error("ไม่พบตัวรันโมเดลเสียง ONNX");
      announce("error", "เปิดระบบเสียง AI ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
      throw error;
    }

    announce("loading", "กำลังโหลดเสียง AI ภาษาไทย ครั้งแรกประมาณ 114 MB…");
    window.ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
    window.ort.env.wasm.numThreads = window.crossOriginIsolated
      ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 1))
      : 1;
    window.ort.env.wasm.proxy = !navigator.gpu;

    sessionPromise = window.ort.InferenceSession.create(MODEL_URL, {
      executionProviders: navigator.gpu ? ["webgpu", "wasm"] : ["wasm"],
      graphOptimizationLevel: "all"
    }).then(createdSession => {
      session = createdSession;
      announce("ready", "เสียง AI ภาษาไทยธรรมชาติพร้อมใช้งาน");
      return session;
    }).catch(error => {
      sessionPromise = null;
      announce("error", "โหลดเสียง AI ภาษาไทยไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
      throw error;
    });
    return sessionPromise;
  }

  function tokenize(text) {
    const normalized = String(text || "")
      .normalize("NFC")
      .replace(/ำ/g, "ํา")
      .replace(/\s+/g, " ")
      .trim();
    const plainIds = [];
    for (const char of normalized) {
      if (Object.prototype.hasOwnProperty.call(VOCAB, char)) plainIds.push(VOCAB[char]);
      else if (/\p{L}|\p{N}/u.test(char)) plainIds.push(UNKNOWN_ID);
    }
    if (!plainIds.length) return [];
    const ids = new Array(plainIds.length * 2 + 1).fill(BLANK_ID);
    plainIds.forEach((id, index) => { ids[index * 2 + 1] = id; });
    return ids;
  }

  function stop() {
    requestId++;
    if (!activeSource) return;
    try { activeSource.stop(); } catch (_) { /* source may have ended */ }
    activeSource = null;
  }

  async function speak(text) {
    const ids = tokenize(text);
    if (!ids.length) return;
    await unlock();
    const activeRequest = ++requestId;
    const currentSession = await prepare();
    if (activeRequest !== requestId) return;

    announce("speaking", "กำลังสร้างเสียงอ่านภาษาไทย…");
    const inputIds = BigInt64Array.from(ids, value => BigInt(value));
    const attention = BigInt64Array.from(ids, () => 1n);
    const outputs = await currentSession.run({
      input_ids: new window.ort.Tensor("int64", inputIds, [1, ids.length]),
      attention_mask: new window.ort.Tensor("int64", attention, [1, ids.length])
    });
    if (activeRequest !== requestId) return;

    const samples = outputs.waveform?.data;
    if (!samples?.length) throw new Error("โมเดลไม่สร้างข้อมูลเสียง");
    const context = getAudioContext();
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(Float32Array.from(samples), 0);

    if (activeSource) {
      try { activeSource.stop(); } catch (_) { /* source may have ended */ }
    }
    activeSource = context.createBufferSource();
    activeSource.buffer = buffer;
    activeSource.connect(context.destination);
    activeSource.onended = () => {
      if (activeRequest === requestId) announce("ready", "เสียง AI ภาษาไทยธรรมชาติพร้อมใช้งาน");
      activeSource = null;
    };
    activeSource.start();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.ThaiSpeech = { prepare, speak, stop, unlock, subscribe, getStatus: () => status };
})();

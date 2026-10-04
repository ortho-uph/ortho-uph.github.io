(function () {
  "use strict";

  /* =========================================================
   * ระบบรีเช็คยาด้วยกล้อง v2
   * ตรวจจับ 3 ทาง: บาร์โค้ด/QR (แม่นที่สุด) · จำภาพแผงยา (AI) · อ่านชื่อยา (OCR)
   * ผ่านแล้วอ่านชื่อยาด้วยเสียง AI ภาษาไทย (MedSpeech)
   * ========================================================= */

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  const now = () => performance.now();

  const STABLE_FRAMES = 4;        // ภาพต้องตรงกันติดต่อกันกี่เฟรมจึงยืนยัน
  const ABSENT_MS = 700;          // ยาตัวเดิมต้องหายจากกรอบนานเท่าไรจึงนับใหม่ (กันนับซ้ำ)
  const OCR_INTERVAL_MS = 900;
  const OCR_FRESH_MS = 2500;
  const OCR_PASS = .80;

  const state = {
    medicines: [], history: [], session: [],
    aiReady: false, ocrReady: false, barcodeReady: false,
    stream: null,
    cameraDeviceId: localStorage.getItem("cameraDeviceId") || "",
    zoom: Number(localStorage.getItem("medicineCameraZoom") || 1.5),
    threshold: Number(localStorage.getItem("matchThresholdV2") || 60) / 100,
    use: {
      barcode: localStorage.getItem("useBarcode") !== "0",
      image: localStorage.getItem("useImage") !== "0",
      ocr: localStorage.getItem("useOcr") !== "0"
    },
    speechOn: localStorage.getItem("speechEnabled") !== "0",
    form: { front: [], back: [], barcodes: [] },
    formAug: new Map(),      // ภาพจำลองของภาพที่เพิ่งถ่าย (ยังไม่บันทึก)
    aug: new Map(),          // refId → ค่า AI ของภาพจำลอง
    filter: "all",
    live: {
      running: false, paused: false, timer: null,
      lockedId: null, absentSince: 0,
      stableKey: null, stableCount: 0,
      ocrBusy: false, ocrStartedAt: 0, lastOcr: null, ocrStreak: { id: null, count: 0 },
      unknownCode: null, lastSpokenText: ""
    },
    barcodeScanUntil: 0,
    bg: { emb: null, feature: null, samples: [], scores: new Map(), updates: 0 }
  };

  /* ---------------- helpers ---------------- */
  function toast(message, ms = 2800) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), ms);
  }
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  const showCode = code => String(code || "").replace(/^0(?=\d{13}$)/, "");
  const medById = id => state.medicines.find(m => m.id === id);
  const label = med => `${med.name}${med.strength ? " " + med.strength : ""}`;
  const isTrainable = med => (med.frontRefs?.length || 0) >= 3 || (med.backRefs?.length || 0) >= 3;
  const hasBarcode = med => (med.barcodes?.length || 0) > 0;

  /* ---------------- ข้อความภาษาไทยสำหรับอ่าน ---------------- */
  const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  function integerToThai(value) {
    const places = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
    const number = String(value).replace(/^0+(?=\d)/, "");
    if (!number || Number(number) === 0) return DIGITS[0];
    if (number.length > 6) {
      const head = number.slice(0, -6), tail = number.slice(-6);
      return `${integerToThai(head)}ล้าน${Number(tail) ? integerToThai(tail) : ""}`;
    }
    return [...number].map((char, index) => {
      const digit = Number(char); if (!digit) return "";
      const place = number.length - index - 1;
      if (place === 1 && digit === 1) return "สิบ";
      if (place === 1 && digit === 2) return "ยี่สิบ";
      if (place === 0 && digit === 1 && number.length > 1) return "เอ็ด";
      return DIGITS[digit] + places[place];
    }).join("");
  }
  function numberToThai(value) {
    const [whole, decimal] = String(value).split(".");
    return integerToThai(whole) + (decimal ? "จุด" + [...decimal].map(d => DIGITS[Number(d)]).join("") : "");
  }
  function strengthToThai(value) {
    return String(value || "")
      .replace(/[๐-๙]/g, d => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))
      .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
      .replace(/\d+(?:\.\d+)?/g, numberToThai)
      .replace(/\s*(mcg|ug|µg)\b/gi, " ไมโครกรัม")
      .replace(/\s*mg\b/gi, " มิลลิกรัม")
      .replace(/\s*ml\b/gi, " มิลลิลิตร")
      .replace(/\s*IU\b/gi, " ยูนิต")
      .replace(/\s*g\b/gi, " กรัม")
      .replace(/%/g, " เปอร์เซ็นต์")
      .replace(/\//g, " ต่อ ")
      .replace(/\s+/g, " ").trim();
  }
  function autoPronunciation(name) {
    return window.DrugNamesTH ? DrugNamesTH.toThai(name) : String(name || "");
  }
  function spokenName(med) {
    return String(med.pronunciation || "").trim() || autoPronunciation(med.name);
  }
  function speechText(med) {
    return `${spokenName(med)} ${strengthToThai(med.strength)}`.replace(/\s+/g, " ").trim();
  }

  async function say(text, force = false) {
    if (!force && !state.speechOn) return "off";
    state.live.lastSpokenText = text;
    try {
      const mode = await MedSpeech.speak(text);
      if (mode === "tone" && !say.warned) { say.warned = true; toast("เครื่องนี้ไม่มีเสียงไทย — ใช้ Microsoft Edge เพื่อฟังเสียง AI", 5000); }
      return mode;
    } catch (error) {
      console.error(error); return "error";
    }
  }

  // บันทึกยาที่แก้ในเครื่องนี้ แล้วส่งขึ้นฐานข้อมูลกลาง (ถ้าเชื่อมต่อไว้)
  async function persistMed(med) {
    med.updatedAt = new Date().toISOString();
    med.dirty = true;
    await MedDB.put("medicines", med);
    if (window.MedSync) MedSync.changed();
    return med;
  }

  /* ---------------- tabs ---------------- */
  function activeTab() { return document.querySelector(".tab.active")?.dataset.tab; }
  function switchTab(id) {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === id));
    document.querySelectorAll(".panel").forEach(x => x.classList.toggle("active", x.id === id));
    if (id === "check") { if (state.live.paused) { state.live.paused = false; schedule(0); } }
    else if (state.live.running) state.live.paused = true;
  }

  /* ---------------- camera ---------------- */
  async function refreshCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    $("cameraSelect").innerHTML = `<option value="">กล้องค่าเริ่มต้น</option>` +
      devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || "กล้อง " + (i + 1))}</option>`).join("");
    $("cameraSelect").value = devices.some(d => d.deviceId === state.cameraDeviceId) ? state.cameraDeviceId : "";
  }

  async function openCamera() {
    if (state.stream && state.stream.getVideoTracks().some(t => t.readyState === "live")) return state.stream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง");
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    if (state.cameraDeviceId) video.deviceId = { exact: state.cameraDeviceId };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      if (state.cameraDeviceId && ["NotFoundError", "OverconstrainedError"].includes(error.name)) {
        state.cameraDeviceId = ""; localStorage.removeItem("cameraDeviceId");
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } else throw error;
    }
    state.stream = stream;
    // ปรับโฟกัสอัตโนมัติถ้ากล้องรองรับ
    const track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities?.() || {};
      if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch (e) { /* ignore */ }
    for (const v of [$("checkVideo"), $("registerVideo")]) { v.srcObject = stream; v.play().catch(() => {}); }
    $("cameraPlaceholder").hidden = true; $("registerPlaceholder").hidden = true;
    applyZoom();
    await refreshCameras();
    return stream;
  }

  function cameraErrorMessage(error) {
    if (["NotReadableError", "AbortError"].includes(error.name)) return "กล้องถูกโปรแกรมอื่นใช้อยู่ ปิด Zoom / Camera / LINE แล้วลองใหม่";
    if (error.name === "NotAllowedError") return "ยังไม่ได้อนุญาตกล้อง คลิกรูปกล้องที่แถบที่อยู่เว็บแล้วเลือกอนุญาต";
    if (error.name === "NotFoundError") return "ไม่พบกล้อง ตรวจสายกล้อง USB แล้วกดค้นหาใหม่ในหน้าตั้งค่า";
    return "เปิดกล้องไม่ได้: " + (error.message || error.name);
  }

  function closeCamera() {
    state.stream?.getTracks().forEach(t => t.stop());
    state.stream = null;
    for (const v of [$("checkVideo"), $("registerVideo")]) v.srcObject = null;
    $("cameraPlaceholder").hidden = false; $("registerPlaceholder").hidden = false;
  }

  function applyZoom() {
    const z = Math.round(Math.max(1, Math.min(2.5, state.zoom)) * 10) / 10;
    state.zoom = z;
    $("zoomRange").value = z; $("zoomValue").textContent = z.toFixed(1) + "×";
    $("checkVideo").style.transform = `scale(${z})`;
    $("registerVideo").style.transform = `scale(${z})`;
  }

  /* ---------------- live check ---------------- */
  const BG_FRAMES = 8;            // จำพื้นหลังว่าง ๆ กี่เฟรมตอนเริ่มตรวจ
  const PRESENT_COS = .93;        // ภาพต่างจากพื้นหลังเท่านี้ = มีของวางอยู่
  const BG_MARGIN = .15;          // คะแนนภาพต้องสูงกว่าคะแนนของพื้นหลังอย่างน้อยเท่านี้
  const FAIL_AFTER_MS = 3500;     // วางของค้างนานเท่านี้แล้วยังตรวจไม่ได้ → แจ้งด้วยเสียง
  const WARN_REPEAT_MS = 9000;    // แจ้งเตือนเสียงซ้ำได้ไม่ถี่กว่านี้

  function dot(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function normalizeVec(v) {
    let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
    return Array.from(v, x => x / n);
  }

  function resetBackground() {
    state.bg = { emb: null, feature: null, samples: [], scores: new Map(), updates: 0 };
  }

  function computeBgScores(warn = false) {
    const bg = state.bg; if (!bg.feature) return;
    bg.scores = new Map();
    const bad = [];
    for (const r of scoreImages(bg.feature)) {
      bg.scores.set(r.med.id, r.score);
      if (r.score >= state.threshold) bad.push(label(r.med));
    }
    if (warn && bad.length) toast(`ภาพอ้างอิงของ ${bad.slice(0, 3).join(", ")} เหมือนพื้นหลังมาก ควรถ่ายใหม่ให้ยาเต็มกรอบ`, 7000);
  }

  async function startChecking() {
    MedSpeech.unlock();
    try { await openCamera(); }
    catch (error) { toast(cameraErrorMessage(error), 5000); say("เปิดกล้องไม่ได้"); return; }
    if (!state.medicines.length) { toast("ยังไม่มีรายการยา — เพิ่มยาในแท็บ “ฐานข้อมูลยา” ก่อน", 4000); }
    if (state.use.ocr && !state.ocrReady) loadOcr();
    state.live.running = true; state.live.paused = false;
    $("startBtn").hidden = true; $("stopBtn").hidden = false; $("recalibrateBtn").hidden = false;
    resetLock(); resetBackground();
    if (state.aiReady) setResult("scanning", { status: "กำลังจำพื้นหลัง — ยังไม่ต้องวางยา", name: "รอสักครู่…", thai: "", hint: "เอายาออกจากกรอบก่อน ระบบจะจำพื้นหลังประมาณ 1 วินาที" });
    else showReady();
    schedule(300);
  }

  function stopChecking() {
    state.live.running = false; state.live.paused = false;
    clearTimeout(state.live.timer);
    $("startBtn").hidden = false; $("stopBtn").hidden = true; $("recalibrateBtn").hidden = true;
    $("startBtn").textContent = "เริ่มตรวจอีกครั้ง";
    setResult("idle", { status: "หยุดตรวจแล้ว", name: "—", thai: "", hint: "" });
    closeCamera();
  }

  function schedule(delay = 60) {
    clearTimeout(state.live.timer);
    if (state.live.running && !state.live.paused && !document.hidden) state.live.timer = setTimeout(tick, delay);
  }

  function resetLock() {
    Object.assign(state.live, { lockedId: null, absentSince: 0, stableKey: null, stableCount: 0, unknownCode: null, ocrStreak: { id: null, count: 0 }, lastOcr: null, presentSince: 0 });
    $("checkVideoWrap").classList.remove("pass", "conflict");
    $("nextBtn").disabled = true;
  }

  /* ---------- ตัวจำภาพ: เทียบกับภาพอ้างอิง + ภาพจำลอง แล้วตัดสินจากภาพที่ใกล้ที่สุดหลายภาพ (k-NN) ---------- */
  const TOP_PER_MED = 3;   // คะแนนของยา = ค่าเฉลี่ยภาพที่ใกล้ที่สุด 3 ภาพของยานั้น
  const KNN_K = 7;         // ดูภาพที่ใกล้ที่สุด 7 ภาพจากทุกยา แล้วนับว่าเป็นของยาไหน
  let imageIndex = null;
  function invalidateIndex() { imageIndex = null; }
  const toF32 = v => v instanceof Float32Array ? v : Float32Array.from(v);

  function buildIndex() {
    const entries = [];
    for (const med of state.medicines.filter(isTrainable)) {
      for (const [sideKey, refs] of [["หน้า", med.frontRefs || []], ["หลัง", med.backRefs || []]]) {
        for (const ref of refs) {
          if (!ref.feature?.embedding) continue;
          entries.push({ med, side: sideKey, emb: toF32(ref.feature.embedding), ref });
          for (const a of state.aug.get(ref.id) || []) entries.push({ med, side: sideKey, emb: a, ref: null });
        }
      }
    }
    return { entries };
  }

  function stripEmbedding(f) { return f ? { ...f, embedding: null } : f; }
  // สำเนาแบบไม่มี embedding ของภาพอ้างอิง เก็บไว้ใช้ซ้ำ (ไม่ต้องคัดลอกใหม่ทุกเฟรม)
  const plainCache = new WeakMap();
  function plainFeature(f) {
    let p = plainCache.get(f);
    if (!p) { p = stripEmbedding(f); plainCache.set(f, p); }
    return p;
  }

  function scoreImages(feature) {
    if (!feature?.embedding) return [];
    const idx = imageIndex || (imageIndex = buildIndex());
    if (!idx.entries.length) return [];
    const q = toF32(feature.embedding);
    const dim = q.length;
    // เก็บเฉพาะภาพที่ใกล้ที่สุดที่ต้องใช้ (top-3 ต่อยา และ top-7 รวม) แทนการเก็บทั้งหมดแล้ว sort
    // ผลลัพธ์เท่าเดิม แต่เร็วขึ้นมากเมื่อมีภาพอ้างอิงหลายพันภาพ
    const perMed = new Map();
    const topAll = [];   // เรียงจากมากไปน้อย ยาวไม่เกิน KNN_K
    const insertTop = (arr, item, max) => {
      if (arr.length >= max && item[0] <= arr[arr.length - 1][0]) return;
      let i = arr.length;
      while (i > 0 && arr[i - 1][0] < item[0]) i--;
      arr.splice(i, 0, item);
      if (arr.length > max) arr.pop();
    };
    for (const e of idx.entries) {
      let c = 0; const a = e.emb;
      if (a.length !== dim) continue;
      for (let i = 0; i < dim; i++) c += a[i] * q[i];
      const s = c <= .4 ? 0 : c >= 1 ? 1 : (c - .4) / .6;
      const item = [s, e];
      insertTop(topAll, item, KNN_K);
      let m = perMed.get(e.med.id);
      if (!m) { m = { med: e.med, list: [], count: 0 }; perMed.set(e.med.id, m); }
      m.count++;
      insertTop(m.list, item, TOP_PER_MED);
    }
    const votes = new Map();
    for (const [, e] of topAll) votes.set(e.med.id, (votes.get(e.med.id) || 0) + 1);
    const plain = stripEmbedding(feature);
    const ranked = [...perMed.values()].map(({ med, list, count }) => {
      const top = list;
      const ai = top.reduce((t, x) => t + x[0], 0) / top.length;
      const v = votes.get(med.id) || 0;
      const need = Math.min(4, Math.ceil(.6 * Math.min(KNN_K, count)));
      return { med, ai, side: list[0][1].side, votes: v, votesOk: v >= need };
    }).sort((a, b) => b.ai - a.ai);
    // ส่วนสี/ลาย (ไม่ใช่ AI) คิดเฉพาะยา 5 อันดับแรก เพื่อความเร็ว
    ranked.forEach((r, i) => {
      let legacy = 0;
      if (i < 5) for (const refs of [r.med.frontRefs || [], r.med.backRefs || []]) {
        for (const ref of refs) if (ref.feature) legacy = Math.max(legacy, MedVision.compare(plain, plainFeature(ref.feature)));
      }
      r.score = r.ai * .85 + legacy * .15;
    });
    return ranked.sort((a, b) => b.score - a.score);
  }

  function rankImages(feature) {
    return scoreImages(feature).map(r => ({ ...r, rel: r.score - (state.bg.scores.get(r.med.id) ?? 0) }));
  }

  // สร้างภาพจำลองให้ภาพอ้างอิงที่ยังไม่มี (ทำเบื้องหลัง ครั้งเดียว)
  async function ensureAugments() {
    if (ensureAugments.running || !state.aiReady) return;
    ensureAugments.running = true;
    try {
      const todo = state.medicines.flatMap(m => [...(m.frontRefs || []), ...(m.backRefs || [])]).filter(r => r.image && !state.aug.has(r.id));
      let done = 0;
      for (const ref of todo) {
        try {
          const embs = await MedAI.embedVariantsFromDataUrl(ref.image);
          state.aug.set(ref.id, embs);
          await MedDB.put("augments", { id: ref.id, embs });
        } catch (e) { console.warn("augment failed", e); }
        done++;
        if (done % 10 === 0 || done === todo.length) {
          invalidateIndex();
          $("chipImage").textContent = done < todo.length ? `เตรียมภาพจำลอง ${done}/${todo.length}` : "จำภาพ";
        }
        // ระหว่างกำลังตรวจยา ทำช้า ๆ ไม่ให้แย่งเครื่อง
        await new Promise(r => setTimeout(r, state.live.running && !state.live.paused ? 250 : 0));
      }
      if (todo.length && state.bg?.feature) computeBgScores();
    } finally { ensureAugments.running = false; $("chipImage").textContent = "จำภาพ"; }
  }

  function findByBarcode(code) {
    return state.medicines.find(m => (m.barcodes || []).some(c => MedBarcode.normalize(c) === code));
  }

  async function runOcr(video) {
    const live = state.live;
    if (live.ocrBusy || !state.ocrReady) return;
    live.ocrBusy = true; live.ocrStartedAt = now();
    try {
      const result = await MedOCR.recognize(video, state.medicines, null, state.zoom);
      const top = result.matches[0] || null;
      live.lastOcr = { at: now(), top, text: result.text };
      if (top && top.score >= OCR_PASS) {
        if (live.ocrStreak.id === top.medicineId) live.ocrStreak.count++;
        else live.ocrStreak = { id: top.medicineId, count: 1 };
      } else live.ocrStreak = { id: null, count: 0 };
      const words = (result.text || "").replace(/\s+/g, " ").trim();
      $("seeOcr").textContent = top ? `${label(medById(top.medicineId) || {})} ${Math.round(top.score * 100)}%` : (words ? `“${words.slice(0, 28)}”` : "ไม่พบตัวอักษร");
    } catch (error) {
      console.warn("OCR failed", error);
    } finally { live.ocrBusy = false; }
  }

  // แจ้งเตือนด้วยเสียงภาษาไทย ไม่ถี่เกินไป
  function warnVoice(text, key) {
    const live = state.live;
    if (live.warnKey === key && now() - live.warnAt < WARN_REPEAT_MS) return;
    live.warnKey = key; live.warnAt = now();
    say(text);
  }

  async function tick() {
    const live = state.live;
    if (!live.running || live.paused) return;
    const video = $("checkVideo");
    if (!video.videoWidth) return schedule(150);
    const started = now();

    // 0) ภาพ + ความต่างจากพื้นหลัง (ใช้ตรวจว่ามียาวางอยู่หรือไม่)
    let feature = null;
    if (state.aiReady) {
      try {
        feature = MedVision.featureFromSource(video, state.zoom);
        feature.embedding = await MedAI.embedFromSource(video, state.zoom);
      } catch (e) { console.warn(e); feature = null; }
    }
    const bg = state.bg;
    if (feature && !bg.emb) {
      bg.samples.push(feature.embedding);
      if (bg.samples.length < BG_FRAMES) return schedule(60);
      const sum = new Array(feature.embedding.length).fill(0);
      bg.samples.forEach(s => s.forEach((x, i) => { sum[i] += x; }));
      bg.emb = normalizeVec(sum); bg.samples = [];
      bg.feature = { ...feature, embedding: bg.emb };
      computeBgScores(true);
      setResult("scanning", { status: "พร้อมตรวจ — วางยา 1 ชนิดในกรอบ", name: "รอวางยา…", thai: "", hint: "ให้ชื่อยาหรือบาร์โค้ดหันเข้ากล้อง" });
      say("พร้อมตรวจยา");
    }
    const bgCos = feature && bg.emb ? dot(feature.embedding, bg.emb) : null;
    const presence = bgCos == null ? null : bgCos < PRESENT_COS;
    if (presence === false && !live.lockedId && bgCos > .965) {
      bg.emb = normalizeVec(bg.emb.map((x, i) => x * .95 + feature.embedding[i] * .05));
      bg.feature.embedding = bg.emb;
      if (++bg.updates % 30 === 0) computeBgScores();
    }

    // 1) บาร์โค้ด
    // ตอนกรอบว่าง (ไม่มียา) อ่านบาร์โค้ดแค่ทุก 3 เฟรม ลดภาระเครื่องตอนรอวางยา
    // พอมีของวางอยู่ หรือยังไม่รู้ว่ามีของไหม จะอ่านทุกเฟรมเหมือนเดิม
    live.idleTicks = presence === false ? (live.idleTicks || 0) + 1 : 0;
    const scanBarcode = presence !== false || live.idleTicks % 3 === 1;
    let codes = [];
    if (state.use.barcode && state.barcodeReady && scanBarcode) {
      try { codes = await MedBarcode.scan(video, state.zoom); } catch (e) { console.warn(e); }
    }
    const hits = codes.map(c => ({ ...c, med: findByBarcode(c.code) }));
    const hit = hits.find(h => h.med);
    $("seeBarcode").textContent = codes.length ? (hit ? `${showCode(hit.code)} ✓` : `${showCode(codes[0].code)} (ยังไม่ผูก)`) : "–";

    // 2) เทียบภาพกับยาที่ถ่ายภาพไว้
    let ranked = [];
    if (feature && state.use.image && state.medicines.some(isTrainable)) ranked = rankImages(feature);
    $("seeImage").textContent = presence === false ? "ไม่มียาในกรอบ" : ranked[0] ? `${label(ranked[0].med)} ${Math.round(ranked[0].score * 100)}%` : "–";

    // 3) OCR (ทำงานเบื้องหลัง ไม่รอผล) — ข้ามเมื่อกรอบว่าง
    if (state.use.ocr && state.ocrReady && presence !== false && !live.ocrBusy && now() - live.ocrStartedAt > OCR_INTERVAL_MS && state.medicines.length) runOcr(video);

    if (!live.running || live.paused) return;
    evaluate(hit, hits, ranked, presence);
    schedule(Math.max(30, 140 - (now() - started)));
  }

  function freshOcr() {
    const o = state.live.lastOcr;
    return o && now() - o.at < OCR_FRESH_MS ? o.top : null;
  }

  function showReady() {
    setResult("scanning", { status: "พร้อมตรวจ — วางยา 1 ชนิดในกรอบ", name: "รอวางยา…", thai: "", hint: "ให้ชื่อยาหรือบาร์โค้ดหันเข้ากล้อง" });
  }

  function evaluate(hit, hits, ranked, presence) {
    const live = state.live;
    const th = state.threshold;
    const ocrTop = freshOcr();
    const top = ranked[0];
    const margin = top ? top.score - (ranked[1]?.score || 0) : 0;
    // ภาพผ่านเมื่อ: คะแนนถึงเกณฑ์ + สูงกว่าพื้นหลังชัดเจน + มีของวางอยู่จริง + ไม่ก้ำกึ่งกับยาอื่น
    const multi = ranked.length >= 2;
    const imagePass = Boolean(top && presence !== false && top.score >= th && top.rel >= BG_MARGIN && margin >= .06 && (!multi || top.votesOk));

    // ---------- เพิ่งตรวจผ่าน: ยาตัวอื่นตรวจต่อได้ทันที ยาตัวเดิมต้องยกออกก่อน (กันนับซ้ำ) ----------
    if (live.lockedId) {
      const locked = medById(live.lockedId);
      if (hit && hit.med.id !== live.lockedId) { resetLock(); return evaluate(hit, hits, ranked, presence); }
      if (imagePass && top.med.id !== live.lockedId) { resetLock(); return evaluate(hit, hits, ranked, presence); }
      if (ocrTop && ocrTop.score >= OCR_PASS && ocrTop.medicineId !== live.lockedId && !hit) { resetLock(); return evaluate(hit, hits, ranked, presence); }
      const lockedImg = locked ? ranked.find(r => r.med.id === locked.id) : null;
      const present = presence !== false && ((hit && hit.med.id === live.lockedId) || (lockedImg && lockedImg.rel >= .1) || (ocrTop && ocrTop.medicineId === live.lockedId));
      if (present) live.absentSince = 0;
      else if (!live.absentSince) live.absentSince = now();
      if (live.absentSince && now() - live.absentSince >= ABSENT_MS) { resetLock(); showReady(); }
      return;
    }

    // ---------- กรอบว่าง ----------
    if (presence === false && !hit && !hits.length) {
      live.presentSince = 0; live.stableKey = null; live.stableCount = 0;
      if (live.unknownCode) { live.unknownCode = null; }
      if (!$("resultCard").classList.contains("scanning") || $("resultStatus").textContent !== "พร้อมตรวจ — วางยา 1 ชนิดในกรอบ") showReady();
      live.warnKey = null;
      return;
    }
    if (!live.presentSince) live.presentSince = now();

    // ---------- 1) บาร์โค้ดตรงกับยาในฐานข้อมูล = ผ่านทันที ----------
    if (hit) {
      const imgScore = ranked.find(r => r.med.id === hit.med.id)?.score;
      if (imagePass && top.med.id !== hit.med.id && top.score >= th + .1) {
        return showConflict(`บาร์โค้ดเป็น ${label(hit.med)} แต่ภาพคล้าย ${label(top.med)}`);
      }
      return confirm(hit.med, [
        { text: "บาร์โค้ดตรง", strong: true },
        imgScore != null ? { text: `ภาพ ${Math.round(imgScore * 100)}%`, strong: imgScore >= th } : null,
        ocrTop?.medicineId === hit.med.id ? { text: "ชื่อบนฉลากตรง", strong: true } : null
      ], 100, "barcode");
    }

    // ---------- บาร์โค้ดที่ยังไม่รู้จัก ----------
    const unknown = hits.find(h => !h.med);
    if (unknown && !imagePass && !(ocrTop && ocrTop.score >= OCR_PASS)) {
      if (live.unknownCode !== unknown.code) {
        live.unknownCode = unknown.code;
        setResult("unknown", {
          status: "ตรวจไม่ผ่าน — บาร์โค้ดนี้ยังไม่มีในระบบ",
          name: showCode(unknown.code), thai: "",
          hint: "ถ้าเป็นยาที่มีในรายการ กด “ผูกบาร์โค้ดนี้กับยา” ครั้งหน้าจะผ่านทันที"
        });
        $("bindBarcodeBtn").hidden = false;
        warnVoice("บาร์โค้ดนี้ยังไม่มีในระบบ", "unknown:" + unknown.code);
      }
      return;
    }

    // ---------- ภาพกับตัวอักษรขัดกัน: ไม่ยืนยัน ----------
    if (imagePass && ocrTop && ocrTop.score >= OCR_PASS && ocrTop.medicineId !== top.med.id) {
      live.stableKey = null; live.stableCount = 0;
      return showConflict(`ภาพคล้าย ${label(top.med)} แต่ตัวหนังสืออ่านได้ ${label(medById(ocrTop.medicineId) || {})}`);
    }

    // ---------- 2) ภาพผ่านเกณฑ์ต่อเนื่อง ----------
    if (imagePass) {
      if (live.stableKey === top.med.id) live.stableCount++; else { live.stableKey = top.med.id; live.stableCount = 1; }
      const ocrAgree = ocrTop?.medicineId === top.med.id;
      if (live.stableCount >= (ocrAgree ? 2 : STABLE_FRAMES)) {
        return confirm(top.med, [
          { text: `ภาพด้าน${top.side} ${Math.round(top.score * 100)}%`, strong: true },
          multi ? { text: `ภาพใกล้สุด ${top.votes}/${KNN_K} เป็นยานี้`, strong: true } : null,
          ocrAgree ? { text: "ชื่อบนฉลากตรง", strong: true } : null
        ], Math.round(top.score * 100), "image");
      }
      setResult("scanning", { status: "กำลังยืนยัน อย่าขยับยา…", name: label(top.med), thai: "", hint: `ภาพตรง ${Math.round(top.score * 100)}%` }, true);
      return;
    }
    live.stableKey = null; live.stableCount = 0;

    // ---------- 3) OCR อ่านชื่อยาได้ ----------
    if (ocrTop && ocrTop.score >= OCR_PASS) {
      const med = medById(ocrTop.medicineId);
      if (med) {
        const r = ranked.find(x => x.med.id === med.id);
        const imageAgrees = r != null && r.score >= th - .15 && r.rel >= .05;
        const imageDisagrees = isTrainable(med) && r != null && presence !== false && r.score < th - .25;
        if (!imageDisagrees && (imageAgrees || live.ocrStreak.id === med.id && live.ocrStreak.count >= 2)) {
          return confirm(med, [
            { text: `ชื่อบนฉลากตรง ${Math.round(ocrTop.score * 100)}%`, strong: true },
            r != null ? { text: `ภาพ ${Math.round(r.score * 100)}%`, strong: imageAgrees } : null
          ], Math.round(ocrTop.score * 100), "ocr");
        }
        setResult("scanning", { status: "อ่านชื่อยาได้ กำลังยืนยัน…", name: label(med), thai: "", hint: "ถือนิ่ง ๆ อีกสักครู่" }, true);
        return;
      }
    }

    if (live.unknownCode && !unknown) { live.unknownCode = null; $("bindBarcodeBtn").hidden = true; }

    // ---------- วางยาค้างไว้แล้วยังตรวจไม่ได้ → แจ้งด้วยเสียง ----------
    if (presence === true && now() - live.presentSince >= FAIL_AFTER_MS) {
      const close = top && top.score >= th - .15 && top.rel >= .05;
      const spoken = close ? "ยังไม่แน่ใจ กรุณาหันชื่อยาหรือบาร์โค้ดเข้ากล้อง" : "ตรวจไม่ผ่าน ไม่พบยานี้ในระบบ";
      setResult("unknown", {
        status: close ? "ยังยืนยันไม่ได้" : "ตรวจไม่ผ่าน — ไม่พบยานี้ในระบบ",
        name: close ? `คล้าย ${label(top.med)}?` : "ไม่รู้จักยานี้",
        thai: "",
        hint: close ? "หันชื่อยาหรือบาร์โค้ดเข้ากล้อง หรือถ่ายภาพอ้างอิงเพิ่ม" : "ตรวจสอบด้วยตา ถ้าเป็นยาใหม่ให้เพิ่มในฐานข้อมูลยา"
      });
      warnVoice(spoken, close ? "close" : "fail");
      return;
    }

    const card = $("resultCard");
    if (!card.classList.contains("scanning") || $("resultStatus").textContent !== "กำลังตรวจ…") {
      setResult("scanning", { status: "กำลังตรวจ…", name: "กำลังดูยาในกรอบ", thai: "", hint: top ? `ภาพใกล้เคียงที่สุด: ${label(top.med)} ${Math.round(top.score * 100)}%` : "ให้ชื่อยาหรือบาร์โค้ดหันเข้ากล้อง" });
    }
  }

  function showConflict(message) {
    $("checkVideoWrap").classList.add("conflict");
    warnVoice("ผลไม่ตรงกัน ห้ามจ่าย กรุณาตรวจซ้ำ", "conflict");
    setResult("conflict", { status: "ผลขัดกัน — ห้ามจ่าย ตรวจสอบด้วยตาอีกครั้ง", name: "ตรวจซ้ำ", thai: "", hint: message });
    setTimeout(() => $("checkVideoWrap").classList.remove("conflict"), 800);
  }

  function setResult(kind, { status, name, thai, hint }, keepEvidence = false) {
    const card = $("resultCard");
    card.className = "result-card " + kind;
    $("resultStatus").textContent = status;
    $("resultName").textContent = name;
    $("resultThai").textContent = thai || "";
    $("resultHint").textContent = hint || "";
    if (!keepEvidence) $("resultEvidence").innerHTML = "";
    if (kind !== "unknown") $("bindBarcodeBtn").hidden = true;
    if (kind !== "pass") $("repeatBtn").disabled = true;
  }

  async function confirm(med, evidence, score, source) {
    const live = state.live;
    live.lockedId = med.id; live.absentSince = 0; live.stableKey = null; live.stableCount = 0; live.unknownCode = null; live.warnKey = null;
    const text = speechText(med);
    // อ่านออกเสียงทันที ก่อนทำอย่างอื่น
    const speaking = say(text);
    setResult("pass", {
      status: "ตรวจผ่าน ✓",
      name: label(med),
      thai: "อ่านว่า " + text,
      hint: "วางยาตัวถัดไปได้เลย (ยาตัวเดิมให้ยกออกจากกรอบก่อน)"
    });
    $("resultEvidence").innerHTML = evidence.filter(Boolean).map(e => `<span class="${e.strong ? "" : "weak"}">${esc(e.text)}</span>`).join("");
    $("repeatBtn").disabled = false; $("nextBtn").disabled = false;
    const wrap = $("checkVideoWrap"); wrap.classList.add("pass");
    const flash = $("flash"); flash.classList.add("on"); requestAnimationFrame(() => setTimeout(() => flash.classList.remove("on"), 60));

    state.session.unshift({ med, at: new Date(), source });
    renderSession();
    const record = {
      id: uid(), type: "scan", createdAt: new Date().toISOString(), medicineId: med.id,
      medicineLabel: label(med), score, result: "pass", source,
      reason: evidence.filter(Boolean).map(e => e.text).join(", ")
    };
    MedDB.put("history", record).then(() => { state.history.unshift(record); renderHistory(); }).catch(console.error);
    await speaking;
  }

  function renderSession() {
    $("sessionCount").textContent = state.session.length;
    $("sessionList").innerHTML = state.session.length
      ? state.session.slice(0, 50).map(s => `<li>${esc(label(s.med))}<small>${s.at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${({ barcode: "บาร์โค้ด", image: "ภาพ", ocr: "ตัวอักษร" })[s.source] || ""}</small></li>`).join("")
      : `<li class="empty">ยังไม่มีรายการ</li>`;
  }

  /* ---------------- bind unknown barcode ---------------- */
  function openBindDialog() {
    const code = state.live.unknownCode; if (!code) return;
    $("bindCode").textContent = showCode(code); $("bindCode").dataset.code = code;
    $("bindSearch").value = "";
    renderBindList();
    $("bindDialog").showModal();
    setTimeout(() => $("bindSearch").focus(), 50);
  }
  function renderBindList() {
    const q = $("bindSearch").value.trim().toLowerCase();
    const list = state.medicines.filter(m => !q || `${m.name} ${m.strength} ${m.pronunciation}`.toLowerCase().includes(q)).slice(0, 60);
    $("bindList").innerHTML = list.length
      ? list.map(m => `<button type="button" data-bind="${m.id}"><strong>${esc(label(m))}</strong> ${m.pronunciation ? `<small>${esc(m.pronunciation)}</small>` : ""}</button>`).join("")
      : `<div class="empty-state">ไม่พบยา — เพิ่มยาในแท็บฐานข้อมูลยาก่อน</div>`;
  }
  async function bindCodeTo(medId) {
    const code = $("bindCode").dataset.code;
    const med = medById(medId); if (!med || !code) return;
    med.barcodes = [...new Set([...(med.barcodes || []), code])];
    med.updatedAt = new Date().toISOString();
    await persistMed(med);
    $("bindDialog").close();
    state.live.unknownCode = null;
    renderMedicines();
    toast(`ผูกบาร์โค้ดกับ ${label(med)} แล้ว`);
  }

  /* ---------------- register form ---------------- */
  function renderFormBarcodes() {
    $("barcodeChips").innerHTML = state.form.barcodes.map((c, i) => `<span>${esc(showCode(c))}<button type="button" data-remove-code="${i}" aria-label="ลบ">×</button></span>`).join("");
  }
  function addFormBarcode(raw) {
    const code = MedBarcode.normalize(raw);
    if (!code) return false;
    if (!state.form.barcodes.includes(code)) state.form.barcodes.push(code);
    const owner = findByBarcode(code);
    if (owner && owner.id !== $("medicineId").value) toast(`คำเตือน: บาร์โค้ดนี้ผูกกับ ${label(owner)} อยู่แล้ว`, 4000);
    renderFormBarcodes();
    return true;
  }

  async function scanBarcodeForForm() {
    try { await openCamera(); } catch (error) { return toast(cameraErrorMessage(error), 5000); }
    if (!state.barcodeReady) return toast("ตัวอ่านบาร์โค้ดยังโหลดไม่เสร็จ");
    const btn = $("scanBarcodeBtn");
    btn.disabled = true; btn.textContent = "กำลังหา… (10 วิ)";
    const until = now() + 10000;
    const video = $("registerVideo");
    try {
      while (now() < until) {
        const codes = await MedBarcode.scan(video, state.zoom).catch(() => []);
        if (codes.length) { addFormBarcode(codes[0].code); MedSpeech.tone("ok"); toast("เพิ่มบาร์โค้ด " + codes[0].code); return; }
        await new Promise(r => setTimeout(r, 120));
      }
      toast("ไม่พบบาร์โค้ด ลองขยับให้ใกล้ขึ้นหรือเพิ่มแสง");
    } finally { btn.disabled = false; btn.textContent = "สแกนจากกล้อง"; }
  }

  function renderRefs() {
    for (const side of ["front", "back"]) {
      $(side + "Count").textContent = state.form[side].length;
      $(side + "Refs").innerHTML = state.form[side].map(ref => `<div class="thumb"><img src="${ref.image}" alt=""><button type="button" data-remove-ref="${ref.id}" data-side="${side}" aria-label="ลบภาพ">×</button></div>`).join("");
    }
  }

  async function captureRef(side) {
    try { await openCamera(); } catch (error) { return toast(cameraErrorMessage(error), 5000); }
    const video = $("registerVideo");
    if (!video.videoWidth) await new Promise(r => setTimeout(r, 500));
    if (!state.aiReady) return toast("AI จำภาพกำลังโหลด รอสักครู่");
    try {
      const image = MedVision.cropDataUrl(video, 960, state.zoom);
      const feature = MedVision.featureFromSource(video, state.zoom);
      feature.embedding = await MedAI.embedFromSource(video, state.zoom);
      if (state.bg?.emb && dot(feature.embedding, state.bg.emb) >= PRESENT_COS) {
        return toast("ภาพนี้เหมือนพื้นหลังว่าง ๆ — วางยาให้เต็มกรอบแล้วถ่ายใหม่", 4500);
      }
      const id = uid();
      state.form[side].push({ id, image, feature, createdAt: new Date().toISOString() });
      renderRefs();
      MedAI.embedVariantsFromDataUrl(image).then(embs => state.formAug.set(id, embs)).catch(console.warn);
      const warnings = MedVision.qualityWarnings(feature);
      toast(warnings.length ? "เพิ่มภาพแล้ว แต่ " + warnings.join(" / ") : `เพิ่มภาพด้าน${side === "front" ? "หน้า" : "หลัง"}แล้ว (${state.form[side].length})`);
    } catch (error) { console.error(error); toast("ถ่ายภาพไม่สำเร็จ ลองใหม่"); }
  }

  async function addRefFiles(files) {
    if (!state.aiReady) return toast("AI จำภาพกำลังโหลด รอสักครู่");
    const side = $("fileSide").value;
    for (const file of files) {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const feature = await MedVision.featureFromDataUrl(dataUrl);
      feature.embedding = await MedAI.embedFromDataUrl(dataUrl);
      const id = uid();
      state.form[side].push({ id, image: dataUrl, feature, createdAt: new Date().toISOString() });
      try { state.formAug.set(id, await MedAI.embedVariantsFromDataUrl(dataUrl)); } catch (e) { console.warn(e); }
    }
    renderRefs(); toast(`เพิ่มภาพ ${files.length} ภาพแล้ว`);
  }

  // เติมคำอ่านภาษาไทยให้อัตโนมัติจากชื่อยา — ถ้าผู้ใช้พิมพ์แก้เอง จะไม่เขียนทับ
  function updatePronunciationHint() {
    const name = $("medicineName").value.trim();
    const field = $("medicinePronunciation");
    const hint = $("pronunciationHint");
    if (field.dataset.auto !== "0") {
      field.value = name ? autoPronunciation(name) : "";
      field.dataset.auto = "1";
    }
    const value = field.value.trim();
    if (!value) { hint.textContent = ""; return; }
    const unknown = (value.match(/[A-Za-z][A-Za-z-]*/g) || []).filter(w => !/^(mg|mcg|ml|g|iu)$/i.test(w));
    if (field.dataset.auto === "1") {
      hint.textContent = unknown.length
        ? `เติมให้อัตโนมัติแล้ว แต่ยังมีคำที่ระบบไม่รู้จัก: ${unknown.join(", ")} — พิมพ์แก้เป็นภาษาไทยได้เลย`
        : "เติมให้อัตโนมัติแล้ว กด 🔊 ฟังเพื่อตรวจ ถ้าอ่านไม่ถูกพิมพ์แก้ได้";
    } else hint.textContent = unknown.length ? `ยังมีคำภาษาอังกฤษ: ${unknown.join(", ")}` : "";
  }

  async function autofillAllPronunciations() {
    const targets = state.medicines.filter(m => !String(m.pronunciation || "").trim());
    if (!targets.length) return toast("ทุกรายการมีคำอ่านแล้ว");
    let full = 0;
    for (const m of targets) {
      m.pronunciation = autoPronunciation(m.name);
      if (!/[A-Za-z]/.test(m.pronunciation)) full++;
      m.updatedAt = new Date().toISOString();
      await persistMed(m);
    }
    await loadMedicines();
    const partial = targets.length - full;
    toast(`เติมคำอ่าน ${targets.length} รายการ${partial ? ` · ${partial} รายการยังมีคำภาษาอังกฤษ ดูได้ที่ตัวกรอง “ยังไม่มีคำอ่าน”` : ""}`, 5000);
  }

  function resetForm() {
    $("medicineForm").reset(); $("medicineId").value = "";
    state.form = { front: [], back: [], barcodes: [] }; state.formAug.clear();
    $("formTitle").textContent = "เพิ่มยาใหม่"; $("cancelEditBtn").hidden = true;
    $("medicinePronunciation").dataset.auto = "1";
    renderRefs(); renderFormBarcodes(); updatePronunciationHint();
  }

  function editMedicine(id) {
    const med = medById(id); if (!med) return;
    $("medicineId").value = med.id;
    $("medicineName").value = med.name || "";
    $("medicineStrength").value = med.strength || "";
    $("medicinePronunciation").value = med.pronunciation || "";
    $("medicinePronunciation").dataset.auto = med.pronunciation ? "0" : "1";
    $("medicineFormType").value = med.formType || "แผงยา";
    $("medicineNote").value = med.note || "";
    state.form = { front: structuredClone(med.frontRefs || []), back: structuredClone(med.backRefs || []), barcodes: [...(med.barcodes || [])] };
    $("formTitle").textContent = "แก้ไข: " + label(med); $("cancelEditBtn").hidden = false;
    renderRefs(); renderFormBarcodes(); updatePronunciationHint();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveMedicine(event) {
    event.preventDefault();
    const pending = $("barcodeInput").value.trim();
    if (pending) { addFormBarcode(pending); $("barcodeInput").value = ""; }
    const existing = medById($("medicineId").value);
    const med = {
      ...(existing || {}),
      id: existing?.id || uid(),
      name: $("medicineName").value.trim(),
      strength: $("medicineStrength").value.trim(),
      pronunciation: $("medicinePronunciation").value.trim(),
      formType: $("medicineFormType").value,
      note: $("medicineNote").value.trim(),
      barcodes: state.form.barcodes,
      frontRefs: state.form.front, backRefs: state.form.back,
      updatedAt: new Date().toISOString()
    };
    if (!med.name) return toast("กรุณากรอกชื่อยา");
    await persistMed(med);
    // บันทึกภาพจำลองของภาพใหม่ และลบของภาพที่ถูกลบออก
    const keep = new Set([...med.frontRefs, ...med.backRefs].map(r => r.id));
    for (const ref of [...med.frontRefs, ...med.backRefs]) {
      const embs = state.formAug.get(ref.id);
      if (embs) { state.aug.set(ref.id, embs); await MedDB.put("augments", { id: ref.id, embs }); }
    }
    for (const ref of [...(existing?.frontRefs || []), ...(existing?.backRefs || [])]) {
      if (!keep.has(ref.id)) { state.aug.delete(ref.id); await MedDB.remove("augments", ref.id).catch(() => {}); }
    }
    state.formAug.clear();
    await loadMedicines();
    resetForm();
    const ways = [hasBarcode(med) && "บาร์โค้ด", isTrainable(med) && "ภาพ", "ตัวอักษร"].filter(Boolean).join(" + ");
    toast(`บันทึก ${label(med)} แล้ว · ตรวจได้ด้วย ${ways}`);
  }

  /* ---------------- medicine list ---------------- */
  function renderMedicines() {
    $("medicineCount").textContent = state.medicines.length;
    const q = $("searchInput").value.trim().toLowerCase();
    const list = state.medicines.filter(m => {
      if (q && !`${m.name} ${m.strength} ${m.pronunciation || ""} ${(m.barcodes || []).join(" ")}`.toLowerCase().includes(q)) return false;
      if (state.filter === "ready") return isTrainable(m) || hasBarcode(m);
      if (state.filter === "draft") return !isTrainable(m) && !hasBarcode(m);
      if (state.filter === "nothai") return /[A-Za-z]/.test(spokenName(m).replace(/\b(mg|mcg|ml|g|iu)\b/gi, ""));
      return true;
    });
    $("medicineList").innerHTML = list.length ? list.map(m => {
      const auto = !m.pronunciation;
      const reading = spokenName(m);
      const thaiClass = /[A-Za-z]/.test(reading) ? "thai missing" : "thai";
      return `<article class="med-item">
        <div>
          <h3>${esc(label(m))}</h3>
          <div class="${thaiClass}">อ่านว่า “${esc(reading)}”${auto ? " (อัตโนมัติ)" : ""}</div>
          <div class="badges">
            <span class="${hasBarcode(m) ? "on" : ""}">บาร์โค้ด ${(m.barcodes || []).length}</span>
            <span class="${isTrainable(m) ? "on" : ""}">ภาพ ${(m.frontRefs || []).length + (m.backRefs || []).length}</span>
            <span class="on">ตัวอักษร</span>
          </div>
        </div>
        <div class="med-actions">
          <button class="button ghost" type="button" data-speak-med="${m.id}" title="ฟังเสียง">🔊</button>
          <button class="button ghost" type="button" data-edit-med="${m.id}">แก้ไข</button>
          <button class="button danger" type="button" data-delete-med="${m.id}">ลบ</button>
        </div>
      </article>`;
    }).join("") : `<div class="empty-state">${state.medicines.length ? "ไม่พบยาที่ค้นหา" : "ยังไม่มีรายการยา — กรอกฟอร์มด้านซ้าย หรือนำเข้ารายชื่อจากไฟล์ CSV"}</div>`;
    updateChips();
  }

  async function loadMedicines() {
    state.medicines = (await MedDB.all("medicines")).sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
    invalidateIndex();
    renderMedicines();
    if (state.bg?.feature) computeBgScores();
    if (state.aiReady) setTimeout(ensureAugments, 300);
  }

  /* ---------------- import list ---------------- */
  function parseDelimited(text, delimiter) {
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (ch === delimiter && !quoted) { row.push(field.trim()); field = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field.trim()); field = "";
        if (row.some(v => v)) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field.trim()); if (row.some(v => v)) rows.push(row);
    return rows;
  }

  function rowsFromFile(fileName, text) {
    text = text.replace(/^﻿/, "");
    if (fileName.toLowerCase().endsWith(".json")) {
      const payload = JSON.parse(text);
      const rows = Array.isArray(payload) ? payload : payload.medicines;
      if (!Array.isArray(rows)) throw new Error("ไฟล์ JSON ต้องเป็นรายการยา");
      return rows.map(x => ({
        name: x.name ?? x["ชื่อยา"] ?? "", strength: x.strength ?? x["ความแรง"] ?? "",
        pronunciation: x.pronunciation ?? x["คำอ่านภาษาไทย"] ?? x["คำอ่าน"] ?? "",
        formType: x.formType ?? x["รูปแบบยา"] ?? "", note: x.note ?? x["หมายเหตุ"] ?? "",
        barcodes: x.barcodes ?? x["บาร์โค้ด"] ?? ""
      }));
    }
    const first = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = first.includes("\t") && !first.includes(",") ? "\t" : ",";
    const rows = parseDelimited(text, delimiter);
    if (!rows.length) return [];
    const norm = v => String(v || "").trim().toLowerCase().replace(/[\s_-]/g, "");
    const aliases = {
      name: ["ชื่อยา", "ชื่อสามัญ", "name", "medicine", "drug"],
      strength: ["ความแรง", "ขนาด", "strength", "dose"],
      pronunciation: ["คำอ่านภาษาไทย", "คำอ่าน", "pronunciation", "thai"],
      formType: ["รูปแบบยา", "รูปแบบ", "formtype", "form"],
      note: ["หมายเหตุ", "note"],
      barcodes: ["บาร์โค้ด", "barcode", "barcodes", "gtin", "รหัสบาร์โค้ด"]
    };
    const headers = rows[0].map(norm);
    const hasHeader = Object.values(aliases).flat().some(a => headers.includes(norm(a)));
    const idx = key => aliases[key].map(a => headers.indexOf(norm(a))).find(i => i >= 0) ?? -1;
    const pos = hasHeader
      ? Object.fromEntries(Object.keys(aliases).map(k => [k, idx(k)]))
      : { name: 0, strength: 1, pronunciation: 2, formType: 3, note: 4, barcodes: 5 };
    return rows.slice(hasHeader ? 1 : 0).map(cols => Object.fromEntries(Object.keys(aliases).map(k => [k, pos[k] >= 0 ? cols[pos[k]] || "" : ""])));
  }

  async function importList(file) {
    const rows = rowsFromFile(file.name, await file.text()).filter(r => String(r.name || "").trim());
    if (!rows.length) throw new Error("ไม่พบรายชื่อยาในไฟล์");
    const byKey = new Map(state.medicines.map(m => [`${m.name}|${m.strength}`.toLowerCase(), m]));
    let added = 0, updated = 0;
    for (const r of rows) {
      const name = String(r.name).trim(), strength = String(r.strength || "").trim();
      const codes = (Array.isArray(r.barcodes) ? r.barcodes : String(r.barcodes || "").split(/[|;,\s]+/)).map(c => MedBarcode.normalize(c)).filter(Boolean);
      const key = `${name}|${strength}`.toLowerCase();
      const old = byKey.get(key);
      if (old) {
        let changed = false;
        if (!old.pronunciation) { old.pronunciation = String(r.pronunciation || "").trim() || autoPronunciation(name); changed = true; }
        const merged = [...new Set([...(old.barcodes || []), ...codes])];
        if (merged.length !== (old.barcodes || []).length) { old.barcodes = merged; changed = true; }
        if (changed) { await persistMed(old); updated++; }
        continue;
      }
      const med = {
        id: uid(), name, strength, pronunciation: String(r.pronunciation || "").trim() || autoPronunciation(name),
        formType: String(r.formType || "แผงยา").trim() || "แผงยา", note: String(r.note || "").trim(),
        barcodes: codes, frontRefs: [], backRefs: [], updatedAt: new Date().toISOString()
      };
      await persistMed(med); byKey.set(key, med); added++;
    }
    await loadMedicines();
    toast(`นำเข้าแล้ว: เพิ่มใหม่ ${added} · อัปเดต ${updated} รายการ`, 4000);
  }

  /* ---------------- history ---------------- */
  async function loadHistory() {
    state.history = (await MedDB.all("history")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    renderHistory();
  }
  function renderHistory() {
    const items = state.history.filter(h => h.type === "scan" || !h.type).slice(0, 300);
    const src = { barcode: "บาร์โค้ด", image: "ภาพ", ocr: "ตัวอักษร" };
    $("historyList").innerHTML = items.length ? items.map(h => `<div class="history-item">
        <time>${new Date(h.createdAt).toLocaleString("th-TH")}</time>
        <div><strong>${esc(h.medicineLabel)}</strong> <span class="src">${esc(src[h.source] || "")}${h.reason ? " · " + esc(h.reason) : ""}</span></div>
        <span class="pill">ผ่าน ✓</span>
      </div>`).join("") : `<div class="empty-state">ยังไม่มีประวัติการตรวจ</div>`;
  }

  /* ---------------- status chips & voice ui ---------------- */
  function setChip(id, cls, title) { const el = $(id); el.className = "chip " + (cls || ""); if (title) el.title = title; }
  function updateChips() {
    const trainable = state.medicines.filter(isTrainable).length;
    setChip("chipBarcode", !state.use.barcode ? "off" : state.barcodeReady ? "ok" : "", "อ่านบาร์โค้ด");
    setChip("chipImage", !state.use.image ? "off" : state.aiReady ? (trainable ? "ok" : "warn") : "", trainable ? `ยาที่มีภาพครบ ${trainable} รายการ` : "ยังไม่มียาที่ถ่ายภาพครบ 3 ภาพ");
    setChip("chipOcr", !state.use.ocr ? "off" : state.ocrReady ? "ok" : "", "อ่านตัวอักษร");
  }

  function onVoiceStatus(status) {
    setChip("chipVoice", status.level === "ai" ? "ok" : "warn", status.message);
    $("chipVoice").textContent = status.level === "ai" ? "เสียง AI" : status.level === "basic" ? "เสียงไทยพื้นฐาน" : "ไม่มีเสียงไทย";
    $("voiceStatus").textContent = status.message;
    $("voiceStatus").className = "voice-status " + status.level;
    $("voiceBanner").hidden = status.level === "ai";
    $("voiceBannerText").textContent = status.message;
    $("copyLinkBtn").hidden = MedSpeech.isEdge();
    const voices = MedSpeech.thaiVoices();
    const current = status.voice?.voiceURI || "";
    $("voiceSelect").innerHTML = voices.length
      ? voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}${MedSpeech.isAiVoice(v) ? " — AI" : ""}</option>`).join("")
      : `<option value="">(ไม่พบเสียงภาษาไทย)</option>`;
    $("voiceSelect").value = current;
  }

  /* ---------------- loading engines ---------------- */
  async function loadOcr() {
    if (loadOcr.p) return loadOcr.p;
    loadOcr.p = MedOCR.load().then(() => { state.ocrReady = true; updateChips(); })
      .catch(error => { console.warn("OCR load failed", error); loadOcr.p = null; setChip("chipOcr", "warn", "โหลดตัวอ่านตัวอักษรไม่สำเร็จ"); });
    return loadOcr.p;
  }

  async function upgradeEmbeddings() {
    for (const med of state.medicines) {
      let changed = false;
      for (const ref of [...(med.frontRefs || []), ...(med.backRefs || [])]) {
        if (!ref.feature) { ref.feature = await MedVision.featureFromDataUrl(ref.image); changed = true; }
        if (!ref.feature.embedding) { ref.feature.embedding = await MedAI.embedFromDataUrl(ref.image); changed = true; }
      }
      if (changed) await MedDB.put("medicines", med);
    }
  }

  /* ---------------- ฐานข้อมูลกลาง (หลายเครื่อง) ---------------- */
  function startSync() {
    if (!window.MedSync) return;
    MedSync.subscribe(st => {
      $("syncStatus").textContent = st.message;
      $("syncStatus").className = "voice-status " + ({ ok: "ai", busy: "basic", error: "none", off: "" })[st.level];
      setChip("chipSync", ({ ok: "ok", busy: "", error: "warn", off: "off" })[st.level], st.message);
      $("chipSync").hidden = st.level === "off";
      $("syncConnected").hidden = !MedSync.isConfigured();
      $("syncForm").hidden = MedSync.isConfigured();
    });
    MedSync.init({
      getMedicines: () => state.medicines,
      saveLocal: async med => {
        await MedDB.put("medicines", med);
        const i = state.medicines.findIndex(m => m.id === med.id);
        if (i >= 0) state.medicines[i] = med; else state.medicines.push(med);
      },
      removeLocal: async med => {
        await MedDB.remove("medicines", med.id);
        for (const ref of [...(med.frontRefs || []), ...(med.backRefs || [])]) { state.aug.delete(ref.id); await MedDB.remove("augments", ref.id).catch(() => {}); }
        state.medicines = state.medicines.filter(m => m.id !== med.id);
      },
      afterChange: async () => {
        if (state.aiReady) await upgradeEmbeddings();
        await loadMedicines();
      }
    });
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
    $("startBtn").addEventListener("click", startChecking);
    $("stopBtn").addEventListener("click", stopChecking);
    $("zoomRange").addEventListener("input", e => { state.zoom = Number(e.target.value); localStorage.setItem("medicineCameraZoom", String(state.zoom)); applyZoom(); });
    $("repeatBtn").addEventListener("click", () => { const m = medById(state.live.lockedId); if (m) say(speechText(m), true); });
    $("nextBtn").addEventListener("click", nextPiece);
    $("recalibrateBtn").addEventListener("click", () => {
      if (!state.live.running) return;
      resetLock(); resetBackground();
      setResult("scanning", { status: "กำลังจำพื้นหลัง — ยังไม่ต้องวางยา", name: "รอสักครู่…", thai: "", hint: "เอายาออกจากกรอบก่อน" });
    });
    $("bindBarcodeBtn").addEventListener("click", openBindDialog);
    $("bindSearch").addEventListener("input", renderBindList);
    $("bindList").addEventListener("click", e => { const b = e.target.closest("[data-bind]"); if (b) bindCodeTo(b.dataset.bind); });
    $("clearSessionBtn").addEventListener("click", () => { state.session = []; renderSession(); });

    $("medicineForm").addEventListener("submit", saveMedicine);
    $("cancelEditBtn").addEventListener("click", resetForm);
    $("medicineName").addEventListener("input", updatePronunciationHint);
    $("medicinePronunciation").addEventListener("input", e => { e.target.dataset.auto = e.target.value.trim() ? "0" : "1"; updatePronunciationHint(); });
    $("autofillThaiBtn").addEventListener("click", autofillAllPronunciations);
    $("previewSpeechBtn").addEventListener("click", () => {
      MedSpeech.unlock();
      const med = { name: $("medicineName").value, strength: $("medicineStrength").value, pronunciation: $("medicinePronunciation").value };
      if (!med.name && !med.pronunciation) return toast("กรอกชื่อยาก่อน");
      say(speechText(med), true);
    });
    $("barcodeInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (addFormBarcode(e.target.value)) e.target.value = ""; } });
    $("addBarcodeBtn").addEventListener("click", () => { if (addFormBarcode($("barcodeInput").value)) $("barcodeInput").value = ""; });
    $("scanBarcodeBtn").addEventListener("click", scanBarcodeForForm);
    $("barcodeChips").addEventListener("click", e => { const b = e.target.closest("[data-remove-code]"); if (b) { state.form.barcodes.splice(Number(b.dataset.removeCode), 1); renderFormBarcodes(); } });
    $("openRegisterCameraBtn").addEventListener("click", () => openCamera().catch(err => toast(cameraErrorMessage(err), 5000)));
    $("addFrontBtn").addEventListener("click", () => captureRef("front"));
    $("addBackBtn").addEventListener("click", () => captureRef("back"));
    $("refFileInput").addEventListener("change", e => { addRefFiles([...e.target.files]); e.target.value = ""; });
    $("searchInput").addEventListener("input", renderMedicines);
    document.querySelectorAll(".filter").forEach(f => f.addEventListener("click", () => {
      state.filter = f.dataset.filter;
      document.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === f));
      renderMedicines();
    }));
    $("importListInput").addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      try { await importList(file); } catch (error) { toast("นำเข้าไม่สำเร็จ: " + error.message, 5000); }
      e.target.value = "";
    });
    $("templateBtn").addEventListener("click", () => download("รายชื่อยา-แบบฟอร์ม.csv",
      "﻿ชื่อยา,ความแรง,คำอ่านภาษาไทย,รูปแบบยา,หมายเหตุ,บาร์โค้ด\r\nCephalexin,500 mg,เซฟาเล็กซิน,แผงยา,,\r\nParacetamol,500 mg,พาราเซตามอล,แผงยา,,8851234567890\r\n",
      "text/csv;charset=utf-8"));

    document.addEventListener("click", async e => {
      const rr = e.target.closest("[data-remove-ref]");
      if (rr) { state.form[rr.dataset.side] = state.form[rr.dataset.side].filter(x => x.id !== rr.dataset.removeRef); renderRefs(); }
      const ed = e.target.closest("[data-edit-med]"); if (ed) editMedicine(ed.dataset.editMed);
      const sp = e.target.closest("[data-speak-med]"); if (sp) { MedSpeech.unlock(); const m = medById(sp.dataset.speakMed); if (m) say(speechText(m), true); }
      const del = e.target.closest("[data-delete-med]");
      if (del) {
        const m = medById(del.dataset.deleteMed);
        if (m && window.confirm(`ลบ ${label(m)} ออกจากฐานข้อมูลหรือไม่`)) { await MedDB.remove("medicines", m.id);
          if (window.MedSync) MedSync.deleted(m);
          for (const ref of [...(m.frontRefs || []), ...(m.backRefs || [])]) { state.aug.delete(ref.id); await MedDB.remove("augments", ref.id).catch(() => {}); }
          await loadMedicines(); }
      }
    });

    $("exportHistoryBtn").addEventListener("click", () => {
      const rows = [["วันเวลา", "ยา", "วิธีตรวจ", "คะแนน", "หลักฐาน"], ...state.history.filter(h => h.type === "scan" || !h.type).map(h => [h.createdAt, h.medicineLabel, h.source || "", h.score ?? "", h.reason || ""])];
      download(`ประวัติตรวจยา-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    });

    // settings
    $("speechToggle").checked = state.speechOn;
    $("speechToggle").addEventListener("change", e => { state.speechOn = e.target.checked; localStorage.setItem("speechEnabled", e.target.checked ? "1" : "0"); if (!e.target.checked) MedSpeech.stop(); });
    $("voiceSelect").addEventListener("change", e => MedSpeech.setVoice(e.target.value));
    $("rateRange").value = MedSpeech.getRate(); $("rateValue").textContent = MedSpeech.getRate().toFixed(2);
    $("rateRange").addEventListener("input", e => { MedSpeech.setRate(e.target.value); $("rateValue").textContent = Number(e.target.value).toFixed(2); });
    $("testSpeechBtn").addEventListener("click", async () => {
      MedSpeech.unlock();
      const mode = await say($("testText").value, true);
      if (mode === "tone") toast("ไม่มีเสียงไทยในเบราว์เซอร์นี้ — เปิดใน Microsoft Edge", 5000);
    });
    $("copyLinkBtn").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); toast("คัดลอกลิงก์แล้ว เปิด Microsoft Edge แล้ววางลิงก์", 4000); }
      catch { toast("คัดลอกไม่ได้ — ลิงก์คือ " + location.href, 6000); }
    });
    for (const key of ["barcode", "image", "ocr"]) {
      const el = $("use" + key[0].toUpperCase() + key.slice(1));
      el.checked = state.use[key];
      el.addEventListener("change", () => {
        state.use[key] = el.checked; localStorage.setItem("use" + key[0].toUpperCase() + key.slice(1), el.checked ? "1" : "0");
        if (key === "ocr" && el.checked) loadOcr();
        updateChips();
      });
    }
    $("thresholdRange").value = Math.round(state.threshold * 100); $("thresholdValue").textContent = Math.round(state.threshold * 100) + "%";
    $("thresholdRange").addEventListener("input", e => { state.threshold = Number(e.target.value) / 100; localStorage.setItem("matchThresholdV2", e.target.value); $("thresholdValue").textContent = e.target.value + "%"; });
    $("cameraSelect").addEventListener("change", e => {
      state.cameraDeviceId = e.target.value;
      if (e.target.value) localStorage.setItem("cameraDeviceId", e.target.value); else localStorage.removeItem("cameraDeviceId");
      const wasRunning = state.live.running;
      if (wasRunning) stopChecking(); else closeCamera();
      toast("เปลี่ยนกล้องแล้ว" + (wasRunning ? " กดเริ่มตรวจอีกครั้ง" : ""));
    });
    $("refreshCamerasBtn").addEventListener("click", async () => { await refreshCameras(); toast("อัปเดตรายชื่อกล้องแล้ว"); });
    $("syncConnectBtn").addEventListener("click", async () => {
      const btn = $("syncConnectBtn"); btn.disabled = true;
      try { await MedSync.connect($("syncUrl").value, $("syncKey").value); toast("เชื่อมต่อฐานข้อมูลกลางแล้ว"); }
      catch (error) { toast("เชื่อมต่อไม่สำเร็จ: " + error.message, 6000); }
      finally { btn.disabled = false; }
    });
    $("syncNowBtn").addEventListener("click", () => MedSync.syncNow("manual"));
    $("syncDisconnectBtn").addEventListener("click", () => {
      if (window.confirm("ยกเลิกการเชื่อมต่อฐานข้อมูลกลางในเครื่องนี้หรือไม่ (ข้อมูลในเครื่องยังอยู่)")) MedSync.disconnect();
    });
    $("exportDbBtn").addEventListener("click", async () => download(`ฐานข้อมูลยา-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await MedDB.exportAll()), "application/json"));
    $("importDbInput").addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      if (!window.confirm("นำเข้าจะเขียนทับข้อมูลยาเดิมในเครื่องนี้ทั้งหมด ดำเนินการต่อหรือไม่")) { e.target.value = ""; return; }
      try { await MedDB.importAll(JSON.parse(await file.text())); state.aug.clear(); await loadMedicines(); await loadHistory(); toast("นำเข้าฐานข้อมูลแล้ว"); }
      catch (err) { toast("นำเข้าไม่สำเร็จ: " + err.message, 5000); }
      e.target.value = "";
    });
    $("clearDbBtn").addEventListener("click", async () => {
      if (!window.confirm("ลบข้อมูลยา ภาพ และประวัติทั้งหมดในเครื่องนี้หรือไม่ (กู้คืนไม่ได้ ถ้ายังไม่ได้ส่งออก)")) return;
      await MedDB.clear("medicines"); await MedDB.clear("history"); await MedDB.clear("augments"); state.aug.clear(); await loadMedicines(); await loadHistory(); toast("ลบข้อมูลแล้ว");
    });

    // คีย์ลัดในหน้าตรวจยา
    document.addEventListener("keydown", e => {
      if (activeTab() !== "check" || e.target.closest("input, textarea, select, dialog")) return;
      if (e.code === "Space") { e.preventDefault(); if (state.live.running) nextPiece(); else startChecking(); }
      else if (e.key === "r" || e.key === "R" || e.key === "ร") { const m = medById(state.live.lockedId); if (m) say(speechText(m), true); }
    });
    window.addEventListener("beforeunload", () => { MedSpeech.stop(); closeCamera(); });
    // ย่อหน้าต่าง/สลับแท็บเบราว์เซอร์ → หยุดประมวลผลภาพชั่วคราว (กล้องยังเปิดอยู่) กลับมาแล้วตรวจต่อทันที
    document.addEventListener("visibilitychange", () => {
      if (!state.live.running) return;
      if (document.hidden) { state.live.hiddenPause = true; clearTimeout(state.live.timer); }
      else if (state.live.hiddenPause) { state.live.hiddenPause = false; schedule(0); }
    });
  }

  function nextPiece() {
    if (!state.live.running) return;
    MedSpeech.stop();
    resetLock();
    setResult("scanning", { status: "พร้อมตรวจชิ้นถัดไป", name: "รอวางยา…", thai: "", hint: "วางยาชิ้นถัดไปในกรอบ" });
  }

  /* ---------------- init ---------------- */
  async function init() {
    bindEvents();
    applyZoom();
    renderSession(); renderRefs(); renderFormBarcodes();
    MedSpeech.subscribe(onVoiceStatus);
    await MedDB.open();
    for (const a of await MedDB.all("augments").catch(() => [])) state.aug.set(a.id, a.embs);
    await loadMedicines(); await loadHistory();

    if (location.protocol === "file:") {
      setResult("conflict", { status: "เปิดไฟล์ผิดวิธี", name: "กรุณาเปิดผ่านเว็บไซต์", thai: "", hint: "https://ortho-uph.github.io/med-camera-check/" });
      $("startBtn").disabled = true;
      return;
    }

    refreshCameras().catch(() => {});
    navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshCameras().catch(() => {}));

    MedBarcode.load().then(() => { state.barcodeReady = true; updateChips(); })
      .catch(error => { console.warn("Barcode load failed", error); setChip("chipBarcode", "warn", "โหลดตัวอ่านบาร์โค้ดไม่สำเร็จ"); });
    if (state.use.ocr) loadOcr();

    try {
      await MedAI.load();
      state.aiReady = true; updateChips();
      await upgradeEmbeddings();
      await loadMedicines();   // จะเริ่มสร้างภาพจำลองให้ภาพเดิมเบื้องหลังเอง
    } catch (error) {
      console.error(error);
      setChip("chipImage", "warn", "โหลด AI จำภาพไม่สำเร็จ");
      toast("โหลด AI จำภาพไม่สำเร็จ — ยังตรวจด้วยบาร์โค้ดและตัวอักษรได้", 5000);
    }
    startSync();
  }

  // สำหรับทดสอบ/ตรวจปัญหาใน DevTools
  window.__medDebug = { scoreImages: f => scoreImages(f), invalidateIndex: () => invalidateIndex(), state };

  init().catch(error => { console.error(error); toast("เริ่มระบบไม่สำเร็จ: " + error.message, 6000); });
})();

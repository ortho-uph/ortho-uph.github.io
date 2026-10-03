(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  const state = {
    medicines: [], history: [],
    aiReady: false,
    streams: { check: null, register: null },
    cameraDeviceId: localStorage.getItem("cameraDeviceId") || "",
    zoom: { check: 1.5 },
    refs: { front: [], back: [] },
    live: {
      running: false, timer: null, phase: "first", stableKey: null,
      stableCount: 0, candidateId: null, firstSide: null,
      firstScore: 0, firstFeature: null, resultLocked: false,
      lastMedicineId: null, removalCount: 0
    }
  };

  // Analyse at up to 10 FPS. The feature extractor is intentionally small so
  // this remains responsive on ordinary dispensary PCs without a GPU.
  const LIVE_INTERVAL_MS = 100;
  const STABLE_FRAMES = 4;

  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }

  function switchTab(id) {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === id));
    document.querySelectorAll(".panel").forEach(x => x.classList.toggle("active", x.id === id));
  }

  function normalizeZoom(value) {
    return Math.round(Math.max(1, Math.min(2.5, Number(value) || 1)) * 10) / 10;
  }

  function applyZoomDisplay() {
    const checkZoom = normalizeZoom(state.zoom.check);
    $("checkZoomRange").value = checkZoom;
    $("registerZoomRange").value = checkZoom;
    $("checkZoomValue").textContent = checkZoom.toFixed(1) + "×";
    $("registerZoomValue").textContent = checkZoom.toFixed(1) + "×";
    $("checkVideo").style.transform = `scale(${checkZoom})`;
    $("registerVideo").style.transform = `scale(${checkZoom})`;
  }

  function setZoom(kind, value) {
    const next = normalizeZoom(value);
    state.zoom.check = next;
    localStorage.setItem("medicineCameraZoom", String(next));
    if (state.live.running) stopRealtime("เปลี่ยน Zoom แล้ว กรุณากดเริ่มตรวจอีกครั้ง");
    applyZoomDisplay();
  }

  function stopStream(kind) {
    if (state.streams[kind]) state.streams[kind].getTracks().forEach(track => track.stop());
    state.streams[kind] = null;
    const video = kind === "check" ? $("checkVideo") : $("registerVideo");
    if (video) video.srcObject = null;
  }

  async function refreshCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
    if (state.cameraDeviceId && !devices.some(device => device.deviceId === state.cameraDeviceId)) {
      state.cameraDeviceId = "";
      localStorage.removeItem("cameraDeviceId");
    }
    const options = [`<option value="">กล้องค่าเริ่มต้น</option>`, ...devices.map((device, index) => `<option value="${esc(device.deviceId)}">${esc(device.label || `กล้อง ${index + 1}`)}</option>`)].join("");
    $("cameraDeviceSelect").innerHTML = options;
    $("cameraDeviceSelect").value = state.cameraDeviceId;
  }

  function selectCamera(deviceId) {
    state.cameraDeviceId = deviceId;
    if (deviceId) localStorage.setItem("cameraDeviceId", deviceId);
    else localStorage.removeItem("cameraDeviceId");
    stopRealtime("เปลี่ยนกล้องแล้ว กรุณากดเปิดกล้องอีกครั้ง");
    ["check", "register"].forEach(stopStream);
    $("cameraStatus").textContent = "เลือกกล้องแล้ว กดเปิดกล้อง";
    $("cameraStatus").className = "status neutral";
    toast("เลือกกล้องแล้ว กรุณากดเปิดกล้องอีกครั้ง");
  }

  async function startCamera(kind) {
    if (!navigator.mediaDevices?.getUserMedia) return toast("เบราว์เซอร์นี้ไม่รองรับกล้อง");
    try {
      stopStream(kind);
      const videoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
      if (state.cameraDeviceId) videoConstraints.deviceId = { exact: state.cameraDeviceId };
      else videoConstraints.facingMode = { ideal: "environment" };
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      state.streams[kind] = stream;
      const video = kind === "check" ? $("checkVideo") : $("registerVideo");
      video.srcObject = stream; await video.play();
      const actualDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (actualDeviceId) {
        state.cameraDeviceId = actualDeviceId;
        localStorage.setItem("cameraDeviceId", actualDeviceId);
      }
      await refreshCameraDevices();
      applyZoomDisplay();
      if (kind === "check") {
        $("cameraStatus").textContent = "กล้องพร้อมใช้งาน"; $("cameraStatus").className = "status good";
        updateRealtimeAvailability();
        if (hasTrainableMedicines() && state.aiReady) startRealtime();
      } else {
        $("addFrontReferenceBtn").disabled = !state.aiReady;
        $("addBackReferenceBtn").disabled = !state.aiReady;
        if (!state.aiReady) toast("เปิดกล้องแล้ว กำลังโหลด AI กรุณารอข้อความ “AI พร้อม”");
      }
    } catch (error) {
      if (["NotReadableError", "AbortError"].includes(error.name)) toast("กล้องถูกโปรแกรมอื่นใช้งานอยู่ กรุณาปิด Camera Hub, Zoom หรือโปรแกรมกล้องอื่นแล้วลองใหม่");
      else if (["NotFoundError", "OverconstrainedError"].includes(error.name)) { state.cameraDeviceId = ""; localStorage.removeItem("cameraDeviceId"); await refreshCameraDevices(); toast("ไม่พบกล้องที่เลือก กรุณากดค้นหากล้องใหม่"); }
      else if (error.name === "NotAllowedError") toast("ยังไม่ได้อนุญาตกล้อง กรุณาอนุญาต Camera ใน Chrome");
      else toast("เปิดกล้องไม่ได้ กรุณาเลือกกล้องใหม่หรือใช้ปุ่มเพิ่มภาพจากไฟล์");
    }
  }

  async function capture(kind, side) {
    const video = $("registerVideo");
    if (!video.videoWidth) return toast("กรุณากด “เปิดกล้อง” ก่อน แล้วจึงเพิ่มภาพอ้างอิง");
    if (!state.aiReady) return toast("AI กำลังโหลด กรุณารอจนมุมบนแสดง “AI พร้อม”");
    const buttons = [$("addFrontReferenceBtn"), $("addBackReferenceBtn")];
    const activeButton = side === "front" ? buttons[0] : buttons[1];
    const originalText = activeButton.textContent;
    buttons.forEach(button => { button.disabled = true; });
    activeButton.textContent = "กำลังบันทึกภาพ…";
    toast("กำลังประมวลผลภาพ กรุณาถือยาให้นิ่งสักครู่");
    try {
      const dataUrl = MedVision.cropDataUrl(video, 960, state.zoom.check);
      const feature = MedVision.featureFromSource(video, state.zoom.check);
      feature.embedding = await MedAI.embedFromSource(video, state.zoom.check);
      const warnings = MedVision.qualityWarnings(feature);
      state.refs[side].push({ id: uid(), image: dataUrl, feature, createdAt: new Date().toISOString() });
      renderRefs();
      toast(warnings.length ? "เพิ่มภาพแล้ว แต่ควรถ่ายใหม่: " + warnings.join(" / ") : "เพิ่มภาพอ้างอิงแล้ว");
    } catch (error) {
      console.error("Reference capture failed", error);
      toast("ถ่ายภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      activeButton.textContent = originalText;
      buttons.forEach(button => { button.disabled = !state.aiReady; });
    }
  }

  function hasTrainableMedicines() {
    return state.medicines.some(isTrainable);
  }

  function updateRealtimeAvailability() {
    const cameraReady = Boolean(state.streams.check && $("checkVideo").videoWidth);
    const hasReadyMedicine = hasTrainableMedicines();
    $("startRealtimeBtn").disabled = !cameraReady || !state.aiReady;
    $("startRealtimeBtn").textContent = hasReadyMedicine ? "เริ่มตรวจอัตโนมัติ" : "เพิ่มภาพอ้างอิงก่อน";
    if (cameraReady && !hasReadyMedicine && !state.live.running) {
      setLiveMessage("กล้องพร้อม แต่ยังไม่มียาที่พร้อมตรวจ", "ลงทะเบียนยาและเพิ่มภาพด้านใดด้านหนึ่งอย่างน้อย 3 ภาพ");
    }
    if (!hasTrainableMedicines() && state.live.running) stopRealtime("ยังไม่มียาที่มีภาพอ้างอิงครบ");
  }

  function setLiveMessage(message, candidate = "") {
    $("liveInstruction").textContent = message;
    $("liveCandidate").textContent = candidate || "กำลังค้นหาแผงยาในกรอบ";
  }

  function renderLiveProgress() {
    const first = $("firstSideProgress");
    const second = $("secondSideProgress");
    first.className = "side-step";
    second.className = "side-step";
    first.querySelector("small").textContent = "รอวางแผงยา";
    second.querySelector("small").textContent = "ทำต่ออัตโนมัติ";
    if (!state.live.running) return;
    if (state.live.phase === "first") {
      first.classList.add("active");
      first.querySelector("small").textContent = "กำลังตรวจด้านที่วาง";
    } else if (state.live.phase === "complete") {
      first.classList.add("done"); second.classList.add("active");
      first.querySelector("small").textContent = "เช็คแล้ว";
      second.querySelector("small").textContent = "นำชิ้นเดิมออก แล้ววางชิ้นถัดไป";
    }
  }

  function resetLiveCycle(hideResult = true) {
    Object.assign(state.live, {
      phase: "first", stableKey: null, stableCount: 0, candidateId: null,
      firstSide: null, firstScore: 0, firstFeature: null,
      resultLocked: false, lastMedicineId: null, removalCount: 0
    });
    if (hideResult) $("resultCard").hidden = true;
    $("stabilityMeter").firstElementChild.style.width = "0%";
    $("liveDot").className = state.live.running ? "live-dot scanning" : "live-dot idle";
    setLiveMessage(state.live.running ? "วางแผงยา 1 ชนิดให้อยู่ในกรอบ" : "เปิดกล้องและกดเริ่มตรวจอัตโนมัติ");
    renderLiveProgress();
  }

  function startRealtime() {
    if (state.live.running) return;
    if (!state.streams.check || !$("checkVideo").videoWidth) return toast("กรุณาเปิดกล้องก่อน");
    if (!state.aiReady) return toast("โมเดล AI ยังโหลดไม่เสร็จ");
    if (!hasTrainableMedicines()) {
      switchTab("register");
      return toast("ยังไม่มียาพร้อมตรวจ เพิ่มภาพด้านหน้า หรือด้านหลัง อย่างน้อย 3 ภาพ");
    }
    state.live.running = true;
    $("startRealtimeBtn").hidden = true;
    $("stopRealtimeBtn").hidden = false;
    $("liveDot").className = "live-dot scanning";
    resetLiveCycle();
    scheduleLiveAnalysis(0);
  }

  function stopRealtime(message = "หยุดการตรวจแล้ว") {
    state.live.running = false;
    clearTimeout(state.live.timer);
    state.live.timer = null;
    $("startRealtimeBtn").hidden = false;
    $("stopRealtimeBtn").hidden = true;
    $("liveDot").className = "live-dot idle";
    setLiveMessage(message, "");
  }

  function scheduleLiveAnalysis(delay = LIVE_INTERVAL_MS) {
    clearTimeout(state.live.timer);
    if (state.live.running) state.live.timer = setTimeout(analyzeLiveFrame, delay);
  }

  function updateStability(key) {
    if (state.live.stableKey === key) state.live.stableCount++;
    else { state.live.stableKey = key; state.live.stableCount = 1; }
    $("stabilityMeter").firstElementChild.style.width = `${Math.min(100, state.live.stableCount / STABLE_FRAMES * 100)}%`;
    return state.live.stableCount >= STABLE_FRAMES;
  }

  async function analyzeLiveFrame() {
    if (!state.live.running) return;
    const video = $("checkVideo");
    if (!video.videoWidth) { scheduleLiveAnalysis(); return; }
    const feature = MedVision.featureFromSource(video, state.zoom.check);
    feature.embedding = await MedAI.embedFromSource(video, state.zoom.check);
    const threshold = Number(localStorage.getItem("matchThreshold") || 50) / 100;
    const qualityWarnings = MedVision.qualityWarnings(feature);
    // Slight softness varies greatly between camera models and should not stop
    // recognition completely. Keep it visible as advice while AI continues.
    const blockingWarnings = qualityWarnings.filter(warning => warning !== "ภาพอาจไม่คมชัด");

    if (state.live.resultLocked) {
      const med = state.medicines.find(m => m.id === state.live.lastMedicineId);
      const stillPresent = med ? Math.max(MedVision.bestAgainst(feature, med.frontRefs), MedVision.bestAgainst(feature, med.backRefs)) : 0;
      const nextDifferent = state.medicines
        .filter(item => item.id !== state.live.lastMedicineId)
        .map(item => ({
          item,
          score: Math.max(MedVision.bestAgainst(feature, item.frontRefs), MedVision.bestAgainst(feature, item.backRefs))
        }))
        .sort((a, b) => b.score - a.score)[0];

      // A different medicine can start immediately. An identical next blister
      // needs one clear frame between pieces so one blister is never counted twice.
      if (nextDifferent && nextDifferent.score >= threshold) {
        resetLiveCycle();
        scheduleLiveAnalysis(0);
        return;
      }
      state.live.removalCount = stillPresent < .38 ? 1 : 0;
      setLiveMessage("เช็คแล้ว ✓ ตรวจชิ้น 2, 3, 4 ต่อได้เลย", stillPresent < .38 ? "พร้อมตรวจชิ้นถัดไป" : "นำชิ้นเดิมพ้นกรอบ แล้ววางชิ้นถัดไป");
      if (state.live.removalCount >= 1) {
        resetLiveCycle();
        scheduleLiveAnalysis(0);
        return;
      }
      scheduleLiveAnalysis();
      return;
    }

    if (blockingWarnings.length) {
      state.live.stableCount = 0; state.live.stableKey = null;
      $("stabilityMeter").firstElementChild.style.width = "0%";
      $("qualityMessage").textContent = blockingWarnings.join(" / ");
      $("qualityMessage").classList.add("warn");
      setLiveMessage("ปรับตำแหน่งแผงยาแล้วรอสักครู่", "ภาพยังไม่พร้อมสำหรับการยืนยัน");
      scheduleLiveAnalysis();
      return;
    }

    $("qualityMessage").textContent = qualityWarnings.length ? "ภาพไม่คมชัดเล็กน้อย — AI กำลังตรวจต่อ" : "กำลังวิเคราะห์วิดีโอแบบเรียลไทม์";
    $("qualityMessage").classList.toggle("warn", qualityWarnings.length > 0);

    if (state.live.phase === "first") {
      const ranked = state.medicines.filter(isTrainable).map(med => {
        const front = MedVision.bestAgainst(feature, med.frontRefs);
        const back = MedVision.bestAgainst(feature, med.backRefs);
        return { med, front, back, side: front >= back ? "front" : "back", score: Math.max(front, back) };
      }).sort((a, b) => b.score - a.score);
      const top = ranked[0];
      if (!top) { scheduleLiveAnalysis(); return; }
      const margin = ranked[1] ? top.score - ranked[1].score : 1;
      if (top.score >= threshold && margin >= .06) {
        $("liveDot").className = "live-dot scanning";
        setLiveMessage("กำลังยืนยันผล อย่าขยับแผงยา", `${top.med.name} ${top.med.strength} · ${Math.round(top.score * 100)}%`);
        if (updateStability(`${top.med.id}:${top.side}`)) {
          await finalizeLiveResult(top.med, top.score, top.side);
        }
      } else {
        state.live.stableCount = 0; state.live.stableKey = null;
        $("stabilityMeter").firstElementChild.style.width = "0%";
        $("liveDot").className = "live-dot bad";
        const score = Math.round(top.score * 100);
        const required = Math.round(threshold * 100);
        const reason = top.score < threshold ? `คะแนน ${score}% ต่ำกว่าเกณฑ์ ${required}%` : "ภาพคล้ายยามากกว่าหนึ่งรายการ ยังแยกไม่ได้ชัดเจน";
        setLiveMessage("ยังไม่ผ่าน — กรุณาตรวจซ้ำ", `${top.med.name} ${top.med.strength} · ${score}%`);
        $("qualityMessage").textContent = reason;
        $("qualityMessage").classList.add("warn");
      }
    }
    scheduleLiveAnalysis();
  }

  async function finalizeLiveResult(med, score, detectedSide) {
    state.live.phase = "complete"; state.live.resultLocked = true; state.live.lastMedicineId = med.id;
    state.live.stableCount = 0; state.live.stableKey = null; state.live.removalCount = 0;
    renderLiveProgress();
    const sideLabel = detectedSide === "front" ? "ด้านหน้า" : "ด้านหลัง";
    const reason = `ภาพ${sideLabel}ตรงกับฐานข้อมูลยา`;
    $("liveDot").className = "live-dot good";
    setLiveMessage("เช็คแล้ว ✓", `${med.name} ${med.strength} · ${Math.round(score * 100)}%`);
    const card = $("resultCard"); card.hidden = false; card.className = "result-card pass";
    card.innerHTML = `<div class="result-head"><div><p class="eyebrow">เช็คแล้ว ✓</p><h3>${esc(med.name)} ${esc(med.strength)}</h3><p>${esc(reason)}</p></div><div class="score">${Math.round(score * 100)}%</div></div><p>ระบบอ่านชื่อและขนาดยาแล้ว นำชิ้นเดิมออกและวางชิ้นถัดไปได้ทันที</p>`;
    const record = { id: uid(), type: "scan", createdAt: new Date().toISOString(), medicineId: med.id, medicineLabel: medicineLabel(med), score: Math.round(score * 1000) / 10, result: "pass", reason, manual: false, mode: "realtime-one-side", detectedSide };
    await MedDB.put("history", record); await loadHistory();
    toast(`เช็คแล้ว: ${med.name} ${med.strength}`);
    speakMedicine(med);
  }

  function renderRefs() {
    ["front", "back"].forEach(side => {
      const target = side === "front" ? $("frontReferences") : $("backReferences");
      const count = side === "front" ? $("frontRefCount") : $("backRefCount");
      count.textContent = `${state.refs[side].length} ภาพ`;
      target.innerHTML = state.refs[side].map(ref => `<div class="thumb"><img src="${ref.image}" alt="ภาพอ้างอิง"><button type="button" data-remove-ref="${ref.id}" data-side="${side}" aria-label="ลบภาพ">×</button></div>`).join("");
    });
  }

  function medicineLabel(med) { return `${med.name} ${med.strength} (${med.formType})`; }
  function isTrainable(med) { return (med.frontRefs?.length || 0) >= 3 || (med.backRefs?.length || 0) >= 3; }

  function renderMedicines() {
    $("medicineCount").textContent = `${state.medicines.length} รายการ`;
    $("medicineList").innerHTML = state.medicines.length ? state.medicines.map(m => `
      <article class="medicine-card">
        <div><h3>${esc(m.name)} ${esc(m.strength)}</h3><div class="medicine-meta">${esc(m.formType)} · หน้า ${(m.frontRefs || []).length} ภาพ · หลัง ${(m.backRefs || []).length} ภาพ · ${isTrainable(m) ? "AI พร้อมตรวจ" : "ฉบับร่าง — เพิ่มด้านใดด้านหนึ่งให้ครบ 3 ภาพ"}${m.pronunciation ? " · อ่านว่า “" + esc(m.pronunciation) + "”" : ""}${m.note ? " · " + esc(m.note) : ""}</div></div>
        <div class="card-actions"><button class="button ghost" data-edit-med="${m.id}">${isTrainable(m) ? "แก้ไขข้อมูล/รูป" : "เพิ่มรูปภายหลัง"}</button><button class="button danger" data-delete-med="${m.id}">ลบ</button></div>
      </article>`).join("") : `<div class="empty-state">ยังไม่มีฐานข้อมูลยา เริ่มจากลงทะเบียนยาและเพิ่มภาพอ้างอิงด้านหน้า หรือด้านหลัง อย่างน้อย 3 ภาพ</div>`;
    updateRealtimeAvailability();
  }

  async function saveMedicine(event) {
    event.preventDefault();
    const id = $("medicineId").value || uid();
    const med = {
      id, name: $("medicineName").value.trim(), strength: $("medicineStrength").value.trim(),
      pronunciation: $("medicinePronunciation").value.trim(),
      formType: $("medicineFormType").value, note: $("medicineNote").value.trim(),
      frontRefs: state.refs.front, backRefs: state.refs.back,
      updatedAt: new Date().toISOString()
    };
    await MedDB.put("medicines", med);
    const ready = isTrainable(med);
    resetMedicineForm(); await loadData();
    toast(ready ? "บันทึกข้อมูลยาแล้ว พร้อมใช้ตรวจ" : "บันทึกข้อมูลยาเป็นฉบับร่างแล้ว สามารถกลับมาเพิ่มรูปภายหลังได้");
  }

  function resetMedicineForm() {
    $("medicineForm").reset(); $("medicineId").value = ""; state.refs = { front: [], back: [] };
    $("cancelEditBtn").hidden = true; renderRefs();
  }

  function editMedicine(id) {
    const med = state.medicines.find(m => m.id === id); if (!med) return;
    $("medicineId").value = med.id; $("medicineName").value = med.name; $("medicineStrength").value = med.strength;
    $("medicinePronunciation").value = med.pronunciation || "";
    $("medicineFormType").value = med.formType; $("medicineNote").value = med.note || "";
    state.refs = { front: structuredClone(med.frontRefs), back: structuredClone(med.backRefs) };
    $("cancelEditBtn").hidden = false; renderRefs(); switchTab("register"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addFiles(files) {
    if (!state.aiReady) return toast("โมเดล AI ยังโหลดไม่เสร็จ");
    const side = $("fileSide").value;
    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      const feature = await MedVision.featureFromDataUrl(dataUrl);
      feature.embedding = await MedAI.embedFromDataUrl(dataUrl);
      state.refs[side].push({ id: uid(), image: dataUrl, feature, createdAt: new Date().toISOString() });
    }
    renderRefs(); toast(`เพิ่มภาพด้าน${side === "front" ? "หน้า" : "หลัง"}แล้ว`);
  }

  function parseDelimited(text, delimiter) {
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field.trim()); field = "";
        if (row.some(value => value)) rows.push(row);
        row = [];
      } else field += char;
    }
    row.push(field.trim());
    if (row.some(value => value)) rows.push(row);
    return rows;
  }

  function medicineRowsFromFile(fileName, text) {
    if (fileName.toLowerCase().endsWith(".json")) {
      const payload = JSON.parse(text);
      const rows = Array.isArray(payload) ? payload : payload.medicines;
      if (!Array.isArray(rows)) throw new Error("ไฟล์ JSON ต้องเป็นรายการยาแบบ array");
      return rows.map(item => ({
        name: item.name ?? item["ชื่อยา"] ?? "", strength: item.strength ?? item["ความแรง"] ?? "",
        pronunciation: item.pronunciation ?? item["คำอ่านภาษาไทย"] ?? item["คำอ่าน"] ?? "",
        formType: item.formType ?? item["รูปแบบยา"] ?? "แผงยา", note: item.note ?? item["หมายเหตุ"] ?? ""
      }));
    }
    const firstLine = text.replace(/^\ufeff/, "").split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
    const rows = parseDelimited(text.replace(/^\ufeff/, ""), delimiter);
    if (!rows.length) return [];
    const normalize = value => String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
    const aliases = {
      name: ["ชื่อยา", "ชื่อสามัญ", "name", "medicine"], strength: ["ความแรง", "strength", "dose"],
      pronunciation: ["คำอ่านภาษาไทย", "คำอ่าน", "pronunciation", "thai pronunciation"],
      formType: ["รูปแบบยา", "รูปแบบ", "formtype", "form", "type"], note: ["หมายเหตุ", "ลักษณะ", "note", "description"]
    };
    const headers = rows[0].map(normalize);
    const hasHeader = Object.values(aliases).flat().some(alias => headers.includes(normalize(alias)));
    const indexFor = key => aliases[key].map(alias => headers.indexOf(normalize(alias))).find(index => index >= 0) ?? -1;
    const indexes = { name: indexFor("name"), strength: indexFor("strength"), pronunciation: indexFor("pronunciation"), formType: indexFor("formType"), note: indexFor("note") };
    return rows.slice(hasHeader ? 1 : 0).map(columns => ({
      name: columns[hasHeader ? indexes.name : 0] || "", strength: columns[hasHeader ? indexes.strength : 1] || "",
      pronunciation: hasHeader ? columns[indexes.pronunciation] || "" : "",
      formType: columns[hasHeader ? indexes.formType : 2] || "แผงยา", note: columns[hasHeader ? indexes.note : 3] || ""
    }));
  }

  async function importMedicineList(file) {
    const rows = medicineRowsFromFile(file.name, await file.text()).filter(item => String(item.name || "").trim());
    if (!rows.length) throw new Error("ไม่พบรายชื่อยาในไฟล์");
    const existing = new Set(state.medicines.map(item => `${item.name}|${item.strength}`.toLocaleLowerCase("th-TH")));
    let added = 0, skipped = 0;
    for (const item of rows) {
      const name = String(item.name || "").trim();
      const strength = String(item.strength || "").trim();
      const key = `${name}|${strength}`.toLocaleLowerCase("th-TH");
      if (existing.has(key)) { skipped++; continue; }
      await MedDB.put("medicines", {
        id: uid(), name, strength, pronunciation: String(item.pronunciation || "").trim(), formType: String(item.formType || "แผงยา").trim(), note: String(item.note || "").trim(),
        frontRefs: [], backRefs: [], updatedAt: new Date().toISOString()
      });
      existing.add(key); added++;
    }
    await loadData();
    toast(`นำเข้ารายชื่อยา ${added} รายการ${skipped ? ` · ข้ามรายการซ้ำ ${skipped}` : ""}`);
  }

  function integerToThaiWords(value) {
    const digits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    const places = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
    const number = String(value).replace(/^0+(?=\d)/, "");
    if (!number || Number(number) === 0) return digits[0];
    if (number.length > 6) {
      const head = number.slice(0, -6);
      const tail = number.slice(-6);
      return `${integerToThaiWords(head)}ล้าน${Number(tail) ? integerToThaiWords(tail) : ""}`;
    }
    return [...number].map((char, index) => {
      const digit = Number(char);
      if (!digit) return "";
      const place = number.length - index - 1;
      if (place === 1 && digit === 1) return "สิบ";
      if (place === 1 && digit === 2) return "ยี่สิบ";
      if (place === 0 && digit === 1 && number.length > 1) return "เอ็ด";
      return digits[digit] + places[place];
    }).join("");
  }

  function numberToThaiWords(value) {
    const [integer, decimal] = String(value).split(".");
    const whole = integerToThaiWords(integer);
    if (!decimal) return whole;
    const digits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    return `${whole}จุด${[...decimal].map(digit => digits[Number(digit)]).join("")}`;
  }

  function strengthForThaiSpeech(value) {
    return String(value || "")
      .replace(/[๐-๙]/g, digit => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
      .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
      .replace(/\d+(?:\.\d+)?/g, numberToThaiWords)
      .replace(/\s*(mcg|ug|µg)\b/gi, " ไมโครกรัม")
      .replace(/\s*mg\b/gi, " มิลลิกรัม")
      .replace(/\s*ml\b/gi, " มิลลิลิตร")
      .replace(/\s*IU\b/gi, " ไอ ยู")
      .replace(/\s*g\b/gi, " กรัม")
      .replace(/%/g, " เปอร์เซ็นต์")
      .replace(/\//g, " ต่อ ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function speak(text, force = false, englishFallback = "") {
    if (!force && !$("speechToggle").checked) return;
    try {
      await ThaiSpeech.speak(text, englishFallback);
    } catch (error) {
      console.error("Thai speech failed", error);
      toast("ระบบเสียงไม่พร้อม กรุณาตรวจลำโพงและลองใหม่อีกครั้ง");
    }
  }

  function speakMedicine(medicine, force = false) {
    const spokenName = String(medicine.pronunciation || medicine.name || "").trim();
    const thaiText = `${spokenName} ${strengthForThaiSpeech(medicine.strength)}`.trim();
    const englishText = `${medicine.name || "Medicine"} ${medicine.strength || ""}`.trim();
    speak(thaiText, force, englishText);
  }

  function updateSpeechVoiceStatus(event) {
    $("speechVoiceStatus").textContent = event.message;
    $("speechVoiceStatus").classList.toggle("error", event.status === "error");
    $("speechVoiceStatus").classList.toggle("ready", event.status === "ready");
  }

  async function loadHistory() {
    state.history = (await MedDB.all("history")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const queues = state.history.filter(record => record.type === "queue");
    const scans = state.history.filter(record => record.type === "scan" || !record.type);
    const queueCards = queues.map(queue => `<details class="queue-history"><summary><div><h3>คิว ${esc(queue.jobCode)}</h3><div class="history-meta">${new Date(queue.completedAt || queue.createdAt).toLocaleString("th-TH")} · ${queue.totalItems || 0} ชิ้น · ${(queue.items || []).length} รายการยา</div></div></summary><div class="queue-history-body">${(queue.items || []).map(item => {
      const scores = (queue.checks || []).filter(check => check.medicineId === item.medicineId && check.result === "pass").map(check => check.score);
      const scoreText = scores.length ? ` · คะแนนสูงสุด ${Math.max(...scores)}%` : "";
      return `<div class="queue-history-item"><div><strong>${esc(item.medicineLabel)}</strong><span>${item.labelQuantity ? `ฉลาก ${esc(item.labelQuantity)} · ` : ""}ตรวจครบ ${item.checked}/${item.quantity}${scoreText}</span></div><span class="history-result pass">ครบ ✓</span></div>`;
    }).join("")}</div></details>`).join("");
    const scanCards = scans.map(h => {
      const status = h.result === "pass" ? "ตรวจพบ ✓" : h.result === "manual-pass" ? "ยืนยันโดยเภสัชกร" : h.result === "review" ? "ตรวจยืนยัน" : "ไม่ผ่าน";
      const cls = h.result === "pass" || h.result === "manual-pass" ? "pass" : "fail";
      return `<article class="history-card"><div><h3>${esc(h.medicineLabel)}</h3><div class="history-meta">${new Date(h.createdAt).toLocaleString("th-TH")} · คะแนน ${h.score}%</div></div><span class="history-result ${cls}">${status}</span></article>`;
    }).join("");
    $("historyList").innerHTML = scanCards + queueCards || `<div class="empty-state">ยังไม่มีประวัติการตรวจยา</div>`;
  }

  async function loadData() {
    state.medicines = (await MedDB.all("medicines")).sort((a, b) => a.name.localeCompare(b.name, "th")); renderMedicines();
    await loadHistory();
  }

  async function upgradeMedicineEmbeddings() {
    let total = 0, completed = 0;
    for (const med of state.medicines) {
      for (const ref of [...(med.frontRefs || []), ...(med.backRefs || [])]) {
        if (!ref.feature?.embedding) total++;
      }
    }
    if (!total) return;
    $("storageBadge").textContent = `กำลังเรียนรู้ภาพเดิม 0/${total}`;
    for (const med of state.medicines) {
      let changed = false;
      for (const ref of [...(med.frontRefs || []), ...(med.backRefs || [])]) {
        if (!ref.feature) ref.feature = await MedVision.featureFromDataUrl(ref.image);
        if (!ref.feature.embedding) {
          ref.feature.embedding = await MedAI.embedFromDataUrl(ref.image);
          completed++; changed = true;
          $("storageBadge").textContent = `กำลังเรียนรู้ภาพเดิม ${completed}/${total}`;
        }
      }
      if (changed) await MedDB.put("medicines", med);
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
    $("checkZoomRange").addEventListener("input", e => setZoom("check", e.target.value));
    $("registerZoomRange").addEventListener("input", e => setZoom("check", e.target.value));
    $("openCheckCameraBtn").addEventListener("click", () => {
      ThaiSpeech.unlock().catch(() => {});
      ThaiSpeech.prepare().catch(error => console.error("Thai speech load failed", error));
      startCamera("check");
    });
    $("openRegisterCameraBtn").addEventListener("click", () => startCamera("register"));
    $("cameraDeviceSelect").addEventListener("change", e => selectCamera(e.target.value));
    $("refreshCamerasBtn").addEventListener("click", async () => { await refreshCameraDevices(); toast("อัปเดตรายชื่อกล้องแล้ว"); });
    $("startRealtimeBtn").addEventListener("click", () => {
      ThaiSpeech.unlock().catch(() => {});
      startRealtime();
    });
    $("stopRealtimeBtn").addEventListener("click", () => stopRealtime());
    $("addFrontReferenceBtn").addEventListener("click", () => capture("register", "front"));
    $("addBackReferenceBtn").addEventListener("click", () => capture("register", "back"));
    $("medicineForm").addEventListener("submit", saveMedicine);
    $("cancelEditBtn").addEventListener("click", resetMedicineForm);
    $("referenceFileInput").addEventListener("change", e => { addFiles([...e.target.files]); e.target.value = ""; });
    $("downloadMedicineTemplateBtn").addEventListener("click", () => download("medicine-list-template.csv", "\ufeffชื่อยา,ความแรง,คำอ่านภาษาไทย,รูปแบบยา,หมายเหตุ\r\nCephalexin,500 mg,เซฟาเล็กซิน,แคปซูล,\r\n", "text/csv;charset=utf-8"));
    $("medicineListFileInput").addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return; try { await importMedicineList(file); } catch (error) { toast(`นำเข้าไม่สำเร็จ: ${error.message}`); } e.target.value = ""; });
    $("thresholdRange").addEventListener("input", e => { $("thresholdValue").textContent = e.target.value + "%"; localStorage.setItem("matchThreshold", e.target.value); });
    $("speechToggle").addEventListener("change", e => {
      localStorage.setItem("speechEnabled", e.target.checked ? "1" : "0");
      if (e.target.checked) ThaiSpeech.prepare().catch(error => console.error("Thai speech load failed", error));
      else ThaiSpeech.stop();
    });
    $("testSpeechBtn").addEventListener("click", () => {
      const sample = state.medicines.find(isTrainable) || { name: "พาราเซตามอล", strength: "500 mg" };
      speakMedicine(sample, true);
    });
    $("exportDbBtn").addEventListener("click", async () => download(`med-database-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(await MedDB.exportAll()), "application/json"));
    $("importDbInput").addEventListener("change", async e => { try { await MedDB.importAll(JSON.parse(await e.target.files[0].text())); await loadData(); toast("นำเข้าฐานข้อมูลแล้ว"); } catch (err) { toast(err.message); } e.target.value = ""; });
    $("exportHistoryBtn").addEventListener("click", () => {
      const queueRows = state.history.filter(record => record.type === "queue").flatMap(queue => (queue.items || []).map(item => {
        const scores = (queue.checks || []).filter(check => check.medicineId === item.medicineId && check.result === "pass").map(check => check.score);
        return [queue.completedAt || queue.createdAt, queue.jobCode, item.medicineLabel, item.quantity, item.checked, scores.length ? Math.max(...scores) : "", "completed"];
      }));
      const scanRows = state.history.filter(record => record.type === "scan" || !record.type).map(record => [record.createdAt, record.medicineLabel, record.score, record.result]);
      const rows = [["วันที่ตรวจ","ยา","คะแนน","ผล"], ...scanRows, ...queueRows.map(row => [row[0], row[2], row[5], row[6]])];
      const csv = "\ufeff" + rows.map(row => row.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n"); download(`med-check-history-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv;charset=utf-8");
    });
    $("clearDbBtn").addEventListener("click", async () => { if (!confirm("ต้องการลบฐานข้อมูลยาและประวัติทั้งหมดในเครื่องนี้หรือไม่")) return; await MedDB.clear("medicines"); await MedDB.clear("history"); await loadData(); toast("ลบข้อมูลทั้งหมดแล้ว"); });

    document.addEventListener("click", async e => {
      const removeRef = e.target.closest("[data-remove-ref]"); if (removeRef) { state.refs[removeRef.dataset.side] = state.refs[removeRef.dataset.side].filter(x => x.id !== removeRef.dataset.removeRef); renderRefs(); }
      const edit = e.target.closest("[data-edit-med]"); if (edit) editMedicine(edit.dataset.editMed);
      const del = e.target.closest("[data-delete-med]"); if (del && confirm("ลบรายการยานี้ออกจากฐานข้อมูลหรือไม่")) { await MedDB.remove("medicines", del.dataset.deleteMed); await loadData(); }
    });

    window.addEventListener("beforeunload", () => { clearTimeout(state.live.timer); ThaiSpeech.stop(); Object.values(state.streams).filter(Boolean).forEach(s => s.getTracks().forEach(t => t.stop())); });
  }

  async function init() {
    bindEvents(); await MedDB.open();
    if (location.protocol === "file:") {
      await loadData();
      $("storageBadge").textContent = "เปิดผิดวิธี — AI ไม่ทำงาน";
      const notice = document.querySelector(".notice");
      notice.innerHTML = `<strong>กรุณาเปิดผ่านเว็บไซต์</strong><span>การเปิด index.html โดยตรงทำให้กล้องและโมเดล AI ถูกบล็อก</span><a class="notice-link" href="https://ortho-uph.github.io/med-camera-check/">เปิดระบบที่ถูกต้อง →</a>`;
      renderRefs(); resetLiveCycle(); updateRealtimeAvailability();
      toast("กรุณาใช้เว็บไซต์ห้องยา ห้ามเปิดไฟล์ index.html โดยตรง");
      return;
    }
    if (!localStorage.getItem("aiThreshold50TrialMigrated")) {
      localStorage.setItem("matchThreshold", "50");
      localStorage.setItem("aiThreshold50TrialMigrated", "1");
    }
    const threshold = localStorage.getItem("matchThreshold") || "50"; $("thresholdRange").value = threshold; $("thresholdValue").textContent = threshold + "%";
    state.zoom.check = normalizeZoom(localStorage.getItem("medicineCameraZoom") || 1.5);
    applyZoomDisplay();
    await refreshCameraDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshCameraDevices);
    $("speechToggle").checked = localStorage.getItem("speechEnabled") !== "0";
    ThaiSpeech.subscribe(updateSpeechVoiceStatus);
    updateSpeechVoiceStatus({ status: "idle", message: "เสียงไทยออนไลน์จะทำงานก่อน และใช้เสียงอังกฤษของเครื่องเมื่อขัดข้อง" });
    $("storageBadge").textContent = "กำลังโหลดโมเดล AI";
    try {
      await MedAI.load();
      state.aiReady = true;
      await loadData();
      await upgradeMedicineEmbeddings();
      await loadData();
      $("storageBadge").textContent = "AI พร้อม ข้อมูลอยู่ในเครื่องนี้";
      // Keep capture actions clickable once AI is ready. If the camera has not
      // been opened yet, capture() explains what to do instead of presenting a
      // disabled button that looks broken.
      $("addFrontReferenceBtn").disabled = false;
      $("addBackReferenceBtn").disabled = false;
      if ($("speechToggle").checked) ThaiSpeech.prepare().catch(error => console.error("Thai speech load failed", error));
    } catch (error) {
      console.error(error);
      state.aiReady = false;
      await loadData();
      $("storageBadge").textContent = "AI โหลดไม่สำเร็จ";
      toast("โหลดโมเดล AI ไม่สำเร็จ กรุณารีเฟรชหรือตรวจไฟล์โมเดล");
    }
    renderRefs(); resetLiveCycle(); updateRealtimeAvailability();
    if (!window.isSecureContext) toast("กล้องต้องเปิดผ่าน http://localhost ไม่ควรเปิดไฟล์โดยตรง");
  }

  init().catch(error => { console.error(error); toast("เริ่มระบบไม่สำเร็จ: " + error.message); });
})();

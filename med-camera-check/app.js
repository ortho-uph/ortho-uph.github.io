(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  const state = {
    medicines: [], history: [], expected: [],
    aiReady: false,
    streams: { label: null, check: null, register: null },
    zoom: { label: 1.2, check: 1.5 },
    ocrResults: [],
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
    const labelZoom = normalizeZoom(state.zoom.label);
    const checkZoom = normalizeZoom(state.zoom.check);
    $("labelZoomRange").value = labelZoom;
    $("labelZoomValue").textContent = labelZoom.toFixed(1) + "×";
    $("checkZoomRange").value = checkZoom;
    $("registerZoomRange").value = checkZoom;
    $("checkZoomValue").textContent = checkZoom.toFixed(1) + "×";
    $("registerZoomValue").textContent = checkZoom.toFixed(1) + "×";
    $("labelVideo").style.transform = `scale(${labelZoom})`;
    $("checkVideo").style.transform = `scale(${checkZoom})`;
    $("registerVideo").style.transform = `scale(${checkZoom})`;
  }

  function setZoom(kind, value) {
    const next = normalizeZoom(value);
    if (kind === "label") {
      state.zoom.label = next;
      localStorage.setItem("labelCameraZoom", String(next));
    } else {
      state.zoom.check = next;
      localStorage.setItem("medicineCameraZoom", String(next));
      if (state.live.running) stopRealtime("เปลี่ยน Zoom แล้ว กรุณากดเริ่มตรวจอีกครั้ง");
    }
    applyZoomDisplay();
  }

  function stopStream(kind) {
    if (state.streams[kind]) state.streams[kind].getTracks().forEach(track => track.stop());
    state.streams[kind] = null;
    const video = kind === "label" ? $("labelVideo") : kind === "check" ? $("checkVideo") : $("registerVideo");
    if (video) video.srcObject = null;
  }

  async function startCamera(kind) {
    if (!navigator.mediaDevices?.getUserMedia) return toast("เบราว์เซอร์นี้ไม่รองรับกล้อง");
    try {
      if (kind === "check") stopStream("label");
      if (kind === "label") { stopRealtime("กำลังอ่านฉลากยา"); stopStream("check"); }
      stopStream(kind);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      state.streams[kind] = stream;
      const video = kind === "label" ? $("labelVideo") : kind === "check" ? $("checkVideo") : $("registerVideo");
      video.srcObject = stream; await video.play();
      applyZoomDisplay();
      if (kind === "label") {
        $("scanLabelBtn").disabled = false;
        $("ocrStatus").hidden = false;
        $("ocrStatus").className = "ocr-status ready";
        $("ocrStatus").textContent = "กล้องพร้อม จัดฉลากให้คมชัดแล้วกดอ่านสติ๊กเกอร์";
      } else if (kind === "check") {
        $("cameraStatus").textContent = "กล้องพร้อมใช้งาน"; $("cameraStatus").className = "status good";
        $("startRealtimeBtn").disabled = !hasPendingExpected() || !state.aiReady;
        if (hasPendingExpected() && state.aiReady) startRealtime();
      } else {
        $("addFrontReferenceBtn").disabled = !state.aiReady;
        $("addBackReferenceBtn").disabled = !state.aiReady;
        if (!state.aiReady) toast("เปิดกล้องแล้ว กำลังโหลด AI กรุณารอข้อความ “AI พร้อม”");
      }
    } catch (error) {
      toast("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องหรือใช้ปุ่มเพิ่มภาพจากไฟล์");
    }
  }

  function setOcrStatus(message, mode = "working") {
    const element = $("ocrStatus");
    element.hidden = false;
    element.className = `ocr-status ${mode}`;
    element.textContent = message;
  }

  function renderOcrReview(result) {
    state.ocrResults = result.matches;
    $("ocrReview").hidden = false;
    $("ocrRawText").textContent = result.text || "(ไม่อ่านข้อความได้)";
    if (!result.matches.length) {
      $("ocrResultList").innerHTML = `<div class="empty-state compact">ยังจับคู่กับฐานข้อมูลไม่ได้ กรุณาจัดฉลากให้ตรงและถ่ายใหม่ หรือเพิ่มรายการด้วยตนเอง</div>`;
      $("confirmOcrBtn").disabled = true;
      return;
    }
    $("confirmOcrBtn").disabled = false;
    $("ocrResultList").innerHTML = result.matches.map((match, index) => {
      const med = state.medicines.find(item => item.id === match.medicineId);
      if (!med) return "";
      const trainable = isTrainable(med);
      return `<label class="ocr-result ${trainable ? "" : "not-ready"}">
        <input type="checkbox" data-ocr-index="${index}" ${trainable ? "checked" : "disabled"}>
        <span class="ocr-result-main"><strong>${esc(med.name)} ${esc(med.strength)}</strong><small>${match.quantityText ? `ฉลากระบุ ${esc(match.quantityText)} · ` : ""}${trainable ? "พร้อมตรวจแผงยา" : "ภาพอ้างอิงยังไม่ครบด้านละ 3 ภาพ"}</small></span>
        <span class="ocr-score">${Math.round(match.score * 100)}%</span>
      </label>`;
    }).join("");
  }

  async function scanLabel() {
    const video = $("labelVideo");
    if (!video.videoWidth) return toast("กล้องอ่านฉลากยังไม่พร้อม");
    if (!state.medicines.length) return toast("กรุณาลงทะเบียนยาในฐานข้อมูลก่อน");
    $("scanLabelBtn").disabled = true;
    $("ocrReview").hidden = true;
    setOcrStatus("กำลังเตรียมตัวอ่าน OCR ในเครื่อง…");
    try {
      const result = await MedOCR.recognize(video, state.medicines, progress => {
        if (progress.status === "recognizing text") {
          setOcrStatus(`กำลังอ่านข้อความ ${Math.round((progress.progress || 0) * 100)}%`);
        } else if (progress.status) {
          setOcrStatus("กำลังเตรียม OCR…");
        }
      }, state.zoom.label);
      renderOcrReview(result);
      if (result.matches.length) setOcrStatus(`พบรายการที่อาจตรง ${result.matches.length} รายการ กรุณาตรวจทานก่อนยืนยัน`, "success");
      else setOcrStatus("ไม่พบรายการที่จับคู่ได้ ห้ามยืนยันอัตโนมัติ กรุณาถ่ายใหม่หรือเพิ่มด้วยตนเอง", "warning");
    } catch (error) {
      console.error(error);
      setOcrStatus("อ่านฉลากไม่สำเร็จ กรุณาตรวจว่าเปิดโปรแกรมผ่าน start.bat แล้วลองใหม่", "error");
    } finally {
      $("scanLabelBtn").disabled = false;
    }
  }

  function confirmOcrResults() {
    const selected = [...document.querySelectorAll("[data-ocr-index]:checked")]
      .map(input => state.ocrResults[Number(input.dataset.ocrIndex)])
      .filter(Boolean);
    if (!selected.length) return toast("กรุณาเลือกรายการที่ตรวจทานแล้วอย่างน้อย 1 รายการ");
    for (const match of selected) {
      const existing = state.expected.find(item => item.medicineId === match.medicineId);
      if (existing) {
        if (!existing.labelQuantity && match.quantityText) existing.labelQuantity = match.quantityText;
      } else {
        state.expected.push({ medicineId: match.medicineId, quantity: 1, checked: 0, labelQuantity: match.quantityText || "", source: "label-ocr" });
      }
    }
    stopStream("label");
    $("scanLabelBtn").disabled = true;
    renderExpected();
    setOcrStatus(`ยืนยันแล้ว ${selected.length} รายการ พร้อมเปิดกล้องตรวจแผงยา`, "success");
    toast("เพิ่มรายการจากสติ๊กเกอร์แล้ว กรุณาเปิดกล้องตรวจแผงยา");
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

  function hasPendingExpected() {
    return state.expected.some(item => item.checked < item.quantity);
  }

  function updateRealtimeAvailability() {
    const cameraReady = Boolean(state.streams.check && $("checkVideo").videoWidth);
    $("startRealtimeBtn").disabled = !cameraReady || !hasPendingExpected() || !state.aiReady;
    if (!hasPendingExpected() && state.live.running) stopRealtime("ตรวจครบทุกรายการแล้ว");
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
    if (!hasPendingExpected()) return toast("กรุณาเพิ่มรายการยาที่ต้องตรวจก่อน");
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

    if (qualityWarnings.length) {
      state.live.stableCount = 0; state.live.stableKey = null;
      $("stabilityMeter").firstElementChild.style.width = "0%";
      $("qualityMessage").textContent = qualityWarnings.join(" / ");
      $("qualityMessage").classList.add("warn");
      setLiveMessage("ปรับตำแหน่งแผงยาแล้วรอสักครู่", "ภาพยังไม่พร้อมสำหรับการยืนยัน");
      scheduleLiveAnalysis();
      return;
    }

    $("qualityMessage").textContent = "กำลังวิเคราะห์วิดีโอแบบเรียลไทม์";
    $("qualityMessage").classList.remove("warn");

    if (state.live.phase === "first") {
      const ranked = state.medicines.map(med => {
        const front = MedVision.bestAgainst(feature, med.frontRefs);
        const back = MedVision.bestAgainst(feature, med.backRefs);
        return { med, front, back, side: front >= back ? "front" : "back", score: Math.max(front, back) };
      }).sort((a, b) => b.score - a.score);
      const top = ranked[0];
      if (!top) { scheduleLiveAnalysis(); return; }
      const margin = ranked[1] ? top.score - ranked[1].score : 1;
      setLiveMessage("กำลังตรวจด้านที่วาง อย่าขยับแผงยา", `${top.med.name} ${top.med.strength} · ${Math.round(top.score * 100)}%`);
      if (top.score >= threshold && margin >= .06) {
        if (updateStability(`${top.med.id}:${top.side}`)) {
          await finalizeLiveResult(top.med, top.score, top.side);
        }
      } else {
        state.live.stableCount = 0; state.live.stableKey = null;
        $("stabilityMeter").firstElementChild.style.width = "0%";
      }
    }
    scheduleLiveAnalysis();
  }

  async function finalizeLiveResult(med, score, detectedSide) {
    state.live.phase = "complete"; state.live.resultLocked = true; state.live.lastMedicineId = med.id;
    state.live.stableCount = 0; state.live.stableKey = null; state.live.removalCount = 0;
    renderLiveProgress();
    const expectedItem = state.expected.find(x => x.medicineId === med.id && x.checked < x.quantity);
    const passed = Boolean(expectedItem);
    if (expectedItem) expectedItem.checked++;
    renderExpected();
    const sideLabel = detectedSide === "front" ? "ด้านหน้า" : "ด้านหลัง";
    const reason = passed ? `ภาพ${sideLabel}ตรงกับฐานข้อมูลและอยู่ในรายการที่ต้องจ่าย` : "พบยาในฐานข้อมูล แต่ไม่ได้อยู่ในรายการหรือรายการนี้ตรวจครบแล้ว";
    $("liveDot").className = passed ? "live-dot good" : "live-dot bad";
    setLiveMessage(passed ? "เช็คแล้ว ✓" : "ไม่ตรงรายการ", `${med.name} ${med.strength} · ${Math.round(score * 100)}%`);
    const card = $("resultCard"); card.hidden = false; card.className = `result-card ${passed ? "pass" : "fail"}`;
    card.innerHTML = `<div class="result-head"><div><p class="eyebrow">${passed ? "เช็คแล้ว ✓" : "คำเตือน ไม่ตรงรายการ"}</p><h3>${esc(med.name)} ${esc(med.strength)}</h3><p>${esc(reason)}</p></div><div class="score">${Math.round(score * 100)}%</div></div><p>${passed ? "บันทึกผลแล้ว นำชิ้นเดิมออกและวางชิ้น 2, 3, 4 ต่อได้ทันที" : "นำยาที่ไม่ตรงรายการออกจากกรอบ"}</p>`;
    const record = { id: uid(), createdAt: new Date().toISOString(), jobCode: $("jobCode").value.trim() || "ไม่ระบุ", medicineId: med.id, medicineLabel: medicineLabel(med), score: Math.round(score * 1000) / 10, result: passed ? "pass" : "fail", reason, manual: false, mode: "realtime-one-side", detectedSide };
    await MedDB.put("history", record); await loadHistory();
    speak(passed ? `${med.name} ${med.strength} ถูกต้อง` : `คำเตือน ${med.name} ${med.strength} ไม่ตรงรายการ`);
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
  function isTrainable(med) { return (med.frontRefs?.length || 0) >= 3 && (med.backRefs?.length || 0) >= 3; }

  function renderMedicines() {
    $("medicineCount").textContent = `${state.medicines.length} รายการ`;
    $("expectedMedicine").innerHTML = state.medicines.length
      ? `<option value="">เลือกรายการยา</option>` + state.medicines.map(m => `<option value="${m.id}" ${isTrainable(m) ? "" : "disabled"}>${esc(medicineLabel(m))}${isTrainable(m) ? "" : " — ภาพฝึกยังไม่ครบ"}</option>`).join("")
      : `<option value="">ยังไม่มีข้อมูลยา</option>`;
    $("medicineList").innerHTML = state.medicines.length ? state.medicines.map(m => `
      <article class="medicine-card">
        <div><h3>${esc(m.name)} ${esc(m.strength)}</h3><div class="medicine-meta">${esc(m.formType)} · หน้า ${m.frontRefs.length} ภาพ · หลัง ${m.backRefs.length} ภาพ · ${isTrainable(m) ? "AI พร้อมตรวจ" : "ต้องเพิ่มภาพอย่างน้อยด้านละ 3 ภาพ"}${m.note ? " · " + esc(m.note) : ""}</div></div>
        <div class="card-actions"><button class="button ghost" data-edit-med="${m.id}">แก้ไข</button><button class="button danger" data-delete-med="${m.id}">ลบ</button></div>
      </article>`).join("") : `<div class="empty-state">ยังไม่มีฐานข้อมูลยา เริ่มจากลงทะเบียนยาและถ่ายภาพอ้างอิงทั้งสองด้าน</div>`;
    renderExpected();
  }

  function renderExpected() {
    $("expectedEmpty").hidden = state.expected.length > 0;
    $("expectedList").innerHTML = state.expected.map((item, index) => {
      const med = state.medicines.find(m => m.id === item.medicineId);
      if (!med) return "";
      const labelInfo = item.labelQuantity ? ` · ฉลาก ${esc(item.labelQuantity)}` : "";
      return `<div class="expected-item ${item.checked >= item.quantity ? "done" : ""}"><div class="expected-index">${item.checked >= item.quantity ? "✓" : index + 1}</div><div class="expected-name"><strong>${esc(med.name)} ${esc(med.strength)}</strong><span>${esc(med.formType)}${labelInfo}</span></div><span class="quantity">${item.checked}/${item.quantity} รายการ</span><button class="icon-button" data-remove-expected="${item.medicineId}" aria-label="นำออก">นำออก</button></div>`;
    }).join("");
    updateRealtimeAvailability();
  }

  async function saveMedicine(event) {
    event.preventDefault();
    if (state.refs.front.length < 3 || state.refs.back.length < 3) return toast("ต้องมีภาพฝึกด้านหน้าและด้านหลังอย่างน้อยด้านละ 3 ภาพ");
    const id = $("medicineId").value || uid();
    const med = {
      id, name: $("medicineName").value.trim(), strength: $("medicineStrength").value.trim(),
      formType: $("medicineFormType").value, note: $("medicineNote").value.trim(),
      frontRefs: state.refs.front, backRefs: state.refs.back,
      updatedAt: new Date().toISOString()
    };
    await MedDB.put("medicines", med);
    resetMedicineForm(); await loadData(); toast("บันทึกข้อมูลยาแล้ว");
  }

  function resetMedicineForm() {
    $("medicineForm").reset(); $("medicineId").value = ""; state.refs = { front: [], back: [] };
    $("cancelEditBtn").hidden = true; renderRefs();
  }

  function editMedicine(id) {
    const med = state.medicines.find(m => m.id === id); if (!med) return;
    $("medicineId").value = med.id; $("medicineName").value = med.name; $("medicineStrength").value = med.strength;
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

  function addExpected() {
    const medicineId = $("expectedMedicine").value;
    const quantity = Math.max(1, Number($("expectedQty").value) || 1);
    if (!medicineId) return toast("กรุณาเลือกรายการยา");
    const existing = state.expected.find(x => x.medicineId === medicineId);
    if (existing) existing.quantity += quantity; else state.expected.push({ medicineId, quantity, checked: 0 });
    renderExpected();
  }

  function speak(text) {
    if (!$("speechToggle").checked || !window.speechSynthesis) return;
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "th-TH"; speechSynthesis.speak(utterance);
  }

  async function loadHistory() {
    state.history = (await MedDB.all("history")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("historyList").innerHTML = state.history.length ? state.history.map(h => {
      const status = h.result === "pass" ? "ผ่าน" : h.result === "manual-pass" ? "ยืนยันโดยเภสัชกร" : h.result === "review" ? "ตรวจยืนยัน" : "ไม่ผ่าน";
      const cls = h.result === "pass" || h.result === "manual-pass" ? "pass" : "fail";
      return `<article class="history-card"><div><h3>${esc(h.medicineLabel)}</h3><div class="history-meta">งาน ${esc(h.jobCode)} · ${new Date(h.createdAt).toLocaleString("th-TH")} · คะแนน ${h.score}%</div></div><span class="history-result ${cls}">${status}</span></article>`;
    }).join("") : `<div class="empty-state">ยังไม่มีประวัติการตรวจ</div>`;
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
    $("openLabelCameraBtn").addEventListener("click", () => startCamera("label"));
    $("scanLabelBtn").addEventListener("click", scanLabel);
    $("confirmOcrBtn").addEventListener("click", confirmOcrResults);
    $("labelZoomRange").addEventListener("input", e => setZoom("label", e.target.value));
    $("checkZoomRange").addEventListener("input", e => setZoom("check", e.target.value));
    $("registerZoomRange").addEventListener("input", e => setZoom("check", e.target.value));
    $("openCheckCameraBtn").addEventListener("click", () => startCamera("check"));
    $("openRegisterCameraBtn").addEventListener("click", () => startCamera("register"));
    $("startRealtimeBtn").addEventListener("click", startRealtime);
    $("stopRealtimeBtn").addEventListener("click", () => stopRealtime());
    $("addFrontReferenceBtn").addEventListener("click", () => capture("register", "front"));
    $("addBackReferenceBtn").addEventListener("click", () => capture("register", "back"));
    $("medicineForm").addEventListener("submit", saveMedicine);
    $("cancelEditBtn").addEventListener("click", resetMedicineForm);
    $("referenceFileInput").addEventListener("change", e => { addFiles([...e.target.files]); e.target.value = ""; });
    $("addExpectedBtn").addEventListener("click", addExpected);
    $("newSessionBtn").addEventListener("click", () => { stopRealtime("ล้างรายการแล้ว"); stopStream("label"); state.expected = []; state.ocrResults = []; $("jobCode").value = ""; $("ocrReview").hidden = true; $("ocrStatus").hidden = true; $("scanLabelBtn").disabled = true; resetLiveCycle(); renderExpected(); });
    $("thresholdRange").addEventListener("input", e => { $("thresholdValue").textContent = e.target.value + "%"; localStorage.setItem("matchThreshold", e.target.value); });
    $("speechToggle").addEventListener("change", e => localStorage.setItem("speechEnabled", e.target.checked ? "1" : "0"));
    $("exportDbBtn").addEventListener("click", async () => download(`med-database-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(await MedDB.exportAll()), "application/json"));
    $("importDbInput").addEventListener("change", async e => { try { await MedDB.importAll(JSON.parse(await e.target.files[0].text())); await loadData(); toast("นำเข้าฐานข้อมูลแล้ว"); } catch (err) { toast(err.message); } e.target.value = ""; });
    $("exportHistoryBtn").addEventListener("click", () => {
      const rows = [["วันที่เวลา","รหัสงาน","ยา","คะแนน","ผล","เหตุผล"], ...state.history.map(h => [h.createdAt,h.jobCode,h.medicineLabel,h.score,h.result,h.reason])];
      const csv = "\ufeff" + rows.map(row => row.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n"); download(`med-check-history-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv;charset=utf-8");
    });
    $("clearDbBtn").addEventListener("click", async () => { if (!confirm("ต้องการลบฐานข้อมูลยาและประวัติทั้งหมดในเครื่องนี้หรือไม่")) return; await MedDB.clear("medicines"); await MedDB.clear("history"); state.expected = []; await loadData(); toast("ลบข้อมูลทั้งหมดแล้ว"); });

    document.addEventListener("click", async e => {
      const removeRef = e.target.closest("[data-remove-ref]"); if (removeRef) { state.refs[removeRef.dataset.side] = state.refs[removeRef.dataset.side].filter(x => x.id !== removeRef.dataset.removeRef); renderRefs(); }
      const edit = e.target.closest("[data-edit-med]"); if (edit) editMedicine(edit.dataset.editMed);
      const del = e.target.closest("[data-delete-med]"); if (del && confirm("ลบรายการยานี้ออกจากฐานข้อมูลหรือไม่")) { await MedDB.remove("medicines", del.dataset.deleteMed); state.expected = state.expected.filter(x => x.medicineId !== del.dataset.deleteMed); await loadData(); }
      const removeExpected = e.target.closest("[data-remove-expected]"); if (removeExpected) { state.expected = state.expected.filter(x => x.medicineId !== removeExpected.dataset.removeExpected); renderExpected(); }
    });

    window.addEventListener("beforeunload", () => { clearTimeout(state.live.timer); Object.values(state.streams).filter(Boolean).forEach(s => s.getTracks().forEach(t => t.stop())); });
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
    state.zoom.label = normalizeZoom(localStorage.getItem("labelCameraZoom") || 1.2);
    state.zoom.check = normalizeZoom(localStorage.getItem("medicineCameraZoom") || 1.5);
    applyZoomDisplay();
    $("speechToggle").checked = localStorage.getItem("speechEnabled") !== "0";
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

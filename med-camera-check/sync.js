/*
 * MedSync — ซิงก์รายชื่อยาและรูปภาพอ้างอิงกับฐานข้อมูลกลาง (Google Sheet + Drive ผ่าน Apps Script)
 * ให้คอมพิวเตอร์หลายเครื่องใช้ข้อมูลชุดเดียวกัน ข้อมูลยังเก็บในเครื่องด้วย จึงใช้งานได้แม้เน็ตหลุดชั่วคราว
 * หลักการ: รายการที่แก้ล่าสุด (updatedAt ใหม่กว่า) ชนะ
 */
(function () {
  "use strict";

  const URL_KEY = "medSyncUrl", SECRET_KEY = "medSyncKey", DEL_KEY = "medSyncPendingDeletes", LAST_KEY = "medSyncLast";
  const listeners = new Set();
  let hooks = null, running = null, pushTimer = null, timer = null;
  let status = { level: "off", message: "ยังไม่ได้เชื่อมต่อฐานข้อมูลกลาง (ข้อมูลอยู่ในเครื่องนี้เท่านั้น)" };

  // ฐานข้อมูลกลางของห้องยา — ใส่ไว้ในโค้ดเลย เปิดเครื่องไหนก็เชื่อมต่อเอง ไม่ต้องกรอกอะไร
  const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbzUKhCbOxQFX2UM_sCUyb__yIjfkKbp1LAalEQ3tzw0nlNYFru5hETGOYVg2NaySma2GQ/exec";
  const OFF_KEY = "medSyncOff";
  const cfg = () => ({ url: localStorage.getItem(URL_KEY) || DEFAULT_URL, key: localStorage.getItem(SECRET_KEY) || "" });
  const isConfigured = () => Boolean(cfg().url) && localStorage.getItem(OFF_KEY) !== "1";

  function setStatus(level, message) { status = { level, message }; listeners.forEach(fn => { try { fn(status); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.add(fn); fn(status); }

  async function request(action, payload = {}, conf = cfg()) {
    const res = await fetch(conf.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },   // ไม่ทำให้เกิด CORS preflight
      body: JSON.stringify({ ...payload, action, key: conf.key }),
      redirect: "follow"
    });
    if (!res.ok) throw new Error("เซิร์ฟเวอร์ตอบกลับ " + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "ไม่ทราบสาเหตุ");
    return data;
  }

  function pendingDeletes() { try { return JSON.parse(localStorage.getItem(DEL_KEY) || "[]"); } catch { return []; } }
  function setPendingDeletes(list) { localStorage.setItem(DEL_KEY, JSON.stringify(list)); }

  function allRefs(med) {
    return [...(med.frontRefs || []).map(r => ({ r, side: "front" })), ...(med.backRefs || []).map(r => ({ r, side: "back" }))];
  }

  async function pushMedicine(med) {
    const images = {};
    const refs = allRefs(med).map(({ r, side }) => {
      if (!r.fileId && r.image) images[r.id] = r.image;
      return { id: r.id, side, fileId: r.fileId || "", createdAt: r.createdAt || "" };
    });
    const payload = {
      id: med.id, name: med.name, strength: med.strength || "", pronunciation: med.pronunciation || "",
      formType: med.formType || "", note: med.note || "", barcodes: med.barcodes || [], refs, updatedAt: med.updatedAt
    };
    const data = await request("save", { medicine: payload, images });
    const remote = data.medicine;
    if (data.skipped) return applyRemote(remote, med);        // เครื่องอื่นแก้ใหม่กว่า → ใช้ของกลาง
    const fileIds = new Map(remote.refs.map(r => [r.id, r.fileId]));
    allRefs(med).forEach(({ r }) => { if (fileIds.get(r.id)) r.fileId = fileIds.get(r.id); });
    med.dirty = false; med.syncedAt = med.updatedAt;
    await hooks.saveLocal(med);
  }

  async function imageToRef(remoteRef) {
    const data = await request("image", { fileId: remoteRef.fileId });
    const ref = { id: remoteRef.id, image: data.dataUrl, fileId: remoteRef.fileId, createdAt: remoteRef.createdAt };
    ref.feature = await MedVision.featureFromDataUrl(data.dataUrl);
    if (window.MedAI?.isReady()) ref.feature.embedding = await MedAI.embedFromDataUrl(data.dataUrl);
    return ref;
  }

  // นำข้อมูลจากฐานกลางมาเขียนในเครื่อง (ดาวน์โหลดเฉพาะรูปที่ยังไม่มี)
  async function applyRemote(remote, local) {
    const localRefs = new Map(local ? allRefs(local).map(({ r }) => [r.id, r]) : []);
    const med = {
      ...(local || {}),
      id: remote.id, name: remote.name, strength: remote.strength, pronunciation: remote.pronunciation,
      formType: remote.formType || "แผงยา", note: remote.note, barcodes: remote.barcodes || [],
      frontRefs: [], backRefs: [], updatedAt: remote.updatedAt, syncedAt: remote.updatedAt, dirty: false
    };
    for (const rr of remote.refs || []) {
      let ref = localRefs.get(rr.id);
      if (ref) ref.fileId = rr.fileId;
      else if (rr.fileId) { try { ref = await imageToRef(rr); } catch (e) { console.warn("ดาวน์โหลดรูปไม่สำเร็จ", e); } }
      if (ref) (rr.side === "back" ? med.backRefs : med.frontRefs).push(ref);
    }
    await hooks.saveLocal(med);
    return med;
  }

  async function syncNow(reason = "") {
    if (!isConfigured() || !hooks) return;
    if (running) return running;
    running = (async () => {
      setStatus("busy", "กำลังซิงก์กับฐานข้อมูลกลาง…");
      let down = 0, up = 0, removed = 0;
      try {
        // 1) ส่งการลบที่ค้างอยู่
        const dels = pendingDeletes();
        for (const d of dels) { await request("delete", d); }
        setPendingDeletes([]);

        // 2) ดึงรายการจากฐานกลาง
        const { medicines: remote } = await request("list");
        const locals = new Map(hooks.getMedicines().map(m => [m.id, m]));
        const remoteIds = new Set();
        for (const rm of remote) {
          remoteIds.add(rm.id);
          const lm = locals.get(rm.id);
          if (rm.deleted) {
            if (lm && !(lm.dirty && lm.updatedAt > rm.updatedAt)) { await hooks.removeLocal(lm); removed++; }
            continue;
          }
          if (!lm || (rm.updatedAt > (lm.updatedAt || "") && !(lm.dirty && lm.updatedAt > rm.updatedAt))) {
            setStatus("busy", `กำลังรับข้อมูล ${rm.name}…`);
            await applyRemote(rm, lm); down++;
          } else if (lm.dirty || lm.updatedAt > rm.updatedAt) {
            await pushMedicine(lm); up++;
          }
        }
        // 3) ยาที่มีเฉพาะในเครื่องนี้ → ส่งขึ้นฐานกลาง
        for (const lm of hooks.getMedicines()) {
          if (remoteIds.has(lm.id)) continue;
          if (!lm.updatedAt) lm.updatedAt = new Date().toISOString();
          setStatus("busy", `กำลังส่ง ${lm.name} ขึ้นฐานข้อมูลกลาง…`);
          await pushMedicine(lm); up++;
        }
        localStorage.setItem(LAST_KEY, new Date().toISOString());
        if (down || up || removed) await hooks.afterChange();
        setStatus("ok", `ซิงก์แล้ว ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · มียา ${hooks.getMedicines().length} รายการ${down ? ` · รับ ${down}` : ""}${up ? ` · ส่ง ${up}` : ""}${removed ? ` · ลบ ${removed}` : ""}`);
      } catch (error) {
        console.warn("sync failed", error);
        setStatus("error", "ซิงก์ไม่สำเร็จ: " + error.message + " (ข้อมูลยังอยู่ในเครื่อง จะลองใหม่อัตโนมัติ)");
      } finally { running = null; }
    })();
    return running;
  }

  // เรียกหลังบันทึก/แก้ยาในเครื่อง
  function changed() {
    if (!isConfigured()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow("change"), 1500);
  }

  function deleted(med) {
    if (!isConfigured()) return;
    setPendingDeletes([...pendingDeletes(), { id: med.id, updatedAt: new Date().toISOString() }]);
    changed();
  }

  async function connect(url, key) {
    url = String(url || "").trim(); key = String(key || "").trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) throw new Error("URL ต้องเป็นลิงก์เว็บแอป Apps Script ที่ลงท้ายด้วย /exec");
    await request("ping", {}, { url, key });
    localStorage.removeItem(OFF_KEY);
    localStorage.setItem(URL_KEY, url);
    if (key) localStorage.setItem(SECRET_KEY, key); else localStorage.removeItem(SECRET_KEY);
    start();
    return syncNow("connect");
  }

  function disconnect() {
    localStorage.removeItem(URL_KEY); localStorage.removeItem(SECRET_KEY);
    localStorage.setItem(OFF_KEY, "1");
    clearInterval(timer); timer = null;
    setStatus("off", "ยกเลิกการเชื่อมต่อแล้ว (ข้อมูลอยู่ในเครื่องนี้เท่านั้น)");
  }

  function start() {
    if (!isConfigured()) return;
    clearInterval(timer);
    timer = setInterval(() => syncNow("timer"), 2 * 60 * 1000);
    syncNow("start");
  }

  function init(h) {
    hooks = h;
    window.addEventListener("focus", () => { if (isConfigured()) syncNow("focus"); });
    if (isConfigured()) { setStatus("busy", "กำลังเชื่อมต่อฐานข้อมูลกลาง…"); start(); }
    else setStatus("off", status.message);
  }

  window.MedSync = { init, connect, disconnect, syncNow, changed, deleted, subscribe, isConfigured, config: cfg };
})();

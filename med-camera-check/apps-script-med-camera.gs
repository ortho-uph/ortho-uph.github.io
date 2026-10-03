/**
 * ฐานข้อมูลกลาง — ระบบรีเช็คยาด้วยกล้อง (med-camera-check)
 * เก็บรายชื่อยาใน Google Sheet และรูปภาพอ้างอิงใน Google Drive
 * ให้คอมพิวเตอร์หลายเครื่องใช้ข้อมูลชุดเดียวกัน
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 *  1) สร้าง Google Sheet ใหม่ ตั้งชื่อเช่น "ฐานข้อมูลยา-ระบบตรวจยาด้วยกล้อง"
 *  2) เมนู ส่วนขยาย → Apps Script → ลบโค้ดเดิม แล้ววางไฟล์นี้ทั้งหมด → บันทึก
 *  3) ด้านซ้าย ⚙ การตั้งค่าโปรเจ็กต์ → พร็อพเพอร์ตี้ของสคริปต์ → เพิ่ม
 *       ชื่อ: SYNC_KEY   ค่า: รหัสลับที่ตั้งเอง (เช่น ortho2569-xxxx)
 *  4) ปุ่ม ทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → ประเภท: เว็บแอป
 *       เรียกใช้ในฐานะ: ฉัน   |   ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน
 *     กด ทำให้ใช้งานได้ → อนุญาตสิทธิ์ → คัดลอก URL ที่ลงท้ายด้วย /exec
 *  5) ในหน้าเว็บระบบตรวจยา → ตั้งค่า → ฐานข้อมูลกลาง → วาง URL และรหัสลับ → เชื่อมต่อ
 *     (ทำข้อ 5 ที่คอมพิวเตอร์ทุกเครื่อง)
 *
 * ถ้าแก้โค้ดนี้ภายหลัง ต้อง "จัดการการทำให้ใช้งานได้ → แก้ไข → เวอร์ชันใหม่" URL จะเหมือนเดิม
 */

const SHEET_NAME = "medicines";
const FOLDER_NAME = "med-camera-check-images";
const HEADERS = ["id", "name", "strength", "pronunciation", "formType", "note", "barcodes", "refs", "updatedAt", "deleted"];

function doGet() {
  return json_({ ok: true, app: "med-camera-check", time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || "{}");
    const key = PropertiesService.getScriptProperties().getProperty("SYNC_KEY");
    if (!key) return json_({ ok: false, error: "ยังไม่ได้ตั้ง SYNC_KEY ในพร็อพเพอร์ตี้ของสคริปต์" });
    if (req.key !== key) return json_({ ok: false, error: "รหัสลับไม่ถูกต้อง" });
    switch (req.action) {
      case "ping": return json_({ ok: true, time: new Date().toISOString() });
      case "list": return json_({ ok: true, medicines: listMedicines_(), time: new Date().toISOString() });
      case "save": return json_(withLock_(() => saveMedicine_(req.medicine, req.images || {})));
      case "delete": return json_(withLock_(() => deleteMedicine_(req.id, req.updatedAt)));
      case "image": return json_(getImage_(req.fileId));
      default: return json_({ ok: false, error: "ไม่รู้จักคำสั่ง " + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat("@");   // เก็บเป็นข้อความ ไม่ให้ Sheets แปลงวันที่เอง
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* สร้างใหม่ */ } }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function rows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function rowToMedicine_(r) {
  const m = {};
  HEADERS.forEach((h, i) => { m[h] = r[i]; });
  m.barcodes = parse_(m.barcodes, []);
  m.refs = parse_(m.refs, []);
  m.deleted = m.deleted === true || m.deleted === "TRUE";
  m.updatedAt = m.updatedAt instanceof Date ? m.updatedAt.toISOString() : String(m.updatedAt || "");
  return m;
}

function parse_(v, fallback) { try { return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }

function listMedicines_() {
  return rows_().filter(r => r[0]).map(rowToMedicine_);
}

function findRow_(id) {
  const rows = rows_();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(id)) return { index: i + 2, row: rows[i] };
  return null;
}

/**
 * medicine: { id, name, strength, pronunciation, formType, note, barcodes[], refs[{id, side, fileId?, createdAt}], updatedAt }
 * images:   { refId: "data:image/jpeg;base64,..." } เฉพาะรูปใหม่ที่ยังไม่มี fileId
 */
function saveMedicine_(med, images) {
  if (!med || !med.id) return { ok: false, error: "ข้อมูลยาไม่ครบ" };
  const found = findRow_(med.id);
  const old = found ? rowToMedicine_(found.row) : null;
  if (old && old.updatedAt && med.updatedAt && old.updatedAt > med.updatedAt) {
    return { ok: true, skipped: true, medicine: old };   // บนเซิร์ฟเวอร์ใหม่กว่า
  }
  const folder = folder_();
  const oldFiles = {};
  (old ? old.refs : []).forEach(r => { if (r.fileId) oldFiles[r.id] = r.fileId; });
  const refs = (med.refs || []).map(r => {
    let fileId = r.fileId || oldFiles[r.id] || "";
    if (!fileId && images[r.id]) {
      const m = String(images[r.id]).match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], `${med.name || "med"}-${r.side}-${r.id}.jpg`);
        fileId = folder.createFile(blob).getId();
      }
    }
    return { id: r.id, side: r.side, fileId, createdAt: r.createdAt || "" };
  });
  // ลบรูปที่ถูกเอาออก
  const keep = {}; refs.forEach(r => { keep[r.id] = true; });
  Object.keys(oldFiles).forEach(id => { if (!keep[id]) { try { DriveApp.getFileById(oldFiles[id]).setTrashed(true); } catch (e) {} } });

  const row = [med.id, med.name || "", med.strength || "", med.pronunciation || "", med.formType || "", med.note || "",
    JSON.stringify(med.barcodes || []), JSON.stringify(refs), med.updatedAt || new Date().toISOString(), false];
  const sh = sheet_();
  const rowIndex = found ? found.index : sh.getLastRow() + 1;
  sh.getRange(rowIndex, 1, 1, HEADERS.length).setNumberFormat("@").setValues([row.map(v => typeof v === "boolean" ? String(v).toUpperCase() : v)]);
  return { ok: true, medicine: rowToMedicine_(row) };
}

function deleteMedicine_(id, updatedAt) {
  const found = findRow_(id);
  if (!found) return { ok: true };
  const old = rowToMedicine_(found.row);
  old.refs.forEach(r => { if (r.fileId) { try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) {} } });
  const row = [id, old.name, old.strength, old.pronunciation, old.formType, old.note, "[]", "[]", updatedAt || new Date().toISOString(), true];
  sheet_().getRange(found.index, 1, 1, HEADERS.length).setNumberFormat("@").setValues([row.map(v => typeof v === "boolean" ? String(v).toUpperCase() : v)]);
  return { ok: true };
}

function getImage_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  return { ok: true, dataUrl: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()) };
}

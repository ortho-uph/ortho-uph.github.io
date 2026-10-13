const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const CELL_LIMIT = 50000;
function fakeSheet() {
  const cells = [];
  const formats = [];
  return {
    getLastRow: () => cells.reduce((last, row, i) => row && row.some(v => v !== '' && v != null) ? i + 1 : last, 0),
    getLastColumn: () => cells.reduce((w, row) => Math.max(w, row ? row.length : 0), 0),
    clearContents: () => { cells.length = 0; },
    getRange: (row, col, rows = 1, cols = 1) => {
      const each = fn => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn(row - 1 + r, col - 1 + c, r, c); };
      const read = () => { const out = []; for (let r = 0; r < rows; r++) { out.push([]); for (let c = 0; c < cols; c++) out[r].push((cells[row - 1 + r] || [])[col - 1 + c] ?? ''); } return out; };
      const write = (r, c, value) => {
        if (String(value).length > CELL_LIMIT) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
        const asText = (formats[r] || [])[c] === '@';
        cells[r] = cells[r] || [];
        cells[r][c] = !asText && /^\d+$/.test(String(value)) ? Number(value) : value;
      };
      const range = {
        getDisplayValues: () => read().map(r => r.map(v => String(v))),
        setValues: values => { each((r, c, i, j) => write(r, c, values[i][j])); return range; },
        setNumberFormat: format => { each((r, c) => { formats[r] = formats[r] || []; formats[r][c] = format; }); return range; },
      };
      return range;
    },
  };
}
const sheets = new Map();
const props = new Map();
const cache = new Map();
let uuid = 0;
const context = {
  console, Date, JSON, Math, String, Number, Array, Object, RegExp, Error,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheets.get(name) || null, insertSheet: name => { const sh = fakeSheet(); sheets.set(name, sh); return sh; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperties: o => Object.entries(o).forEach(([k, v]) => props.set(k, String(v))) }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)), remove: k => cache.delete(k) }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    // ไม่ต้องเป็น SHA-256 จริง ขอแค่ข้อความต่างกันได้ผลต่างกัน
    computeDigest: (_alg, text) => { let h = 2166136261; const out = []; for (let i = 0; i < 32; i++) { for (const ch of text + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); out.push((h & 255) - 128); } return out; },
    getUuid: () => 'uuid' + String(++uuid).padStart(32, '0'),
    formatDate: () => '2026',
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('owed-medication/apps-script/Code.gs', 'utf8'), context);
const post = body => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }));
const get = parameter => JSON.parse(context.doGet({ parameter }));
const auditRows = () => context.auditList_();

// ยังไม่มีผู้ใช้: ต้องสร้างผู้ดูแลคนแรกด้วย API key ที่ยาวพอเท่านั้น
assert.equal(post({ action: 'login', username: 'admin', password: 'whatever' }).err, 'no_users');
const KEY = 'k'.repeat(32);
props.set('API_KEY', 'short');
assert.equal(post({ action: 'bootstrapAdmin', key: 'short', username: 'boss', name: 'ผู้ดูแล', password: 'secret12' }).err, 'unauthorized', 'a short API key is never accepted');
props.set('API_KEY', KEY);
assert.equal(post({ action: 'bootstrapAdmin', key: 'wrong', username: 'boss', name: 'ผู้ดูแล', password: 'secret12' }).err, 'unauthorized');
assert.equal(post({ action: 'bootstrapAdmin', key: KEY, username: 'Bo', name: 'ผู้ดูแล', password: 'secret12' }).err, 'invalid_username');
assert.equal(post({ action: 'bootstrapAdmin', key: KEY, username: 'boss', name: 'ผู้ดูแล', password: '123' }).err, 'invalid_password');
const boot = post({ action: 'bootstrapAdmin', key: KEY, username: 'Boss', name: 'ภก.ผู้ดูแล', password: 'secret12' });
assert.equal(boot.ok, 1);
assert.equal(boot.user.username, 'boss', 'usernames are lowercase');
assert.equal(boot.user.role, 'admin');
assert(!JSON.stringify(sheets.get('Users').getRange(1, 1, 5, 12).getDisplayValues()).includes('secret12'), 'passwords are stored hashed');

const adminLogin = post({ action: 'login', username: 'BOSS', password: 'secret12' });
assert.equal(adminLogin.ok, 1);
assert.equal(adminLogin.user.name, 'ภก.ผู้ดูแล');
assert.equal(adminLogin.user.hash, undefined, 'password hash never leaves the server');
const admin = adminLogin.session;

// ผู้ดูแลเพิ่มเจ้าหน้าที่ได้ ชื่อผู้ใช้ห้ามซ้ำ
const created = post({ action: 'userCreate', session: admin, username: 'nurse.a', name: 'จนท.เอ', role: 'staff', password: 'pass1234' });
assert.equal(created.ok, 1);
assert.equal(post({ action: 'userCreate', session: admin, username: 'nurse.a', name: 'ซ้ำ', password: 'pass1234' }).err, 'username_taken');
const staffLogin = post({ action: 'login', username: 'nurse.a', password: 'pass1234' });
assert.equal(staffLogin.ok, 1);
const staff = staffLogin.session;
assert.equal(get({ action: 'list', session: staff }).me.role, 'staff');

// แยกสิทธิ์: เจ้าหน้าที่ใช้งานประจำวันได้ แต่จัดการผู้ใช้ ลบใบแจ้ง และแก้วันหยุดไม่ได้
assert.equal(get({ action: 'userList', session: staff }).err, 'forbidden');
assert.equal(get({ action: 'auditList', session: staff }).err, 'forbidden');
assert.equal(post({ action: 'userCreate', session: staff, username: 'evil', name: 'x', password: 'pass1234' }).err, 'forbidden');
assert.equal(post({ action: 'holidaySave', session: staff, holidays: [] }).err, 'forbidden');
assert.equal(get({ action: 'list' }).err, 'unauthorized');
assert.equal(post({ action: 'create', session: 'forged', item: {} }).err, 'unauthorized');
assert.equal(post({ action: '__proto__', session: admin }).err, 'unknown action', 'prototype keys are not actions');
assert.equal(post({ action: 'constructor', session: admin }).err, 'unknown action');
assert.equal(JSON.parse(context.doPost({ postData: { contents: '{bad' } })).err, 'bad_request');

// ประวัติ: ใบแจ้งบันทึกว่าใครสร้าง ใครแก้อะไร และใครเลื่อนสถานะ
const drugs = [{ name: 'Tamsulosin 0.4 mg', unit: 'เม็ด', rx: '90', got: '30' }];
const rounds = [{ date: '2026-10-19', status: 'waiting', qty: [30] }, { date: '2026-11-16', status: 'waiting', qty: [30] }];
const slip = post({ action: 'create', session: staff, item: { clinic: 'URO', hn: '0012', patient: 'นายทดสอบ ระบบ', phone1: '0812345678', drugs, rounds } }).item;
assert.equal(slip.id, '2026-001');
assert.equal(slip.createdBy, 'จนท.เอ');
assert.deepEqual(slip.log.map(l => l.by + ':' + l.what), ['จนท.เอ:สร้างใบแจ้ง']);
const moved = post({ action: 'update', session: admin, id: slip.id, item: Object.assign({}, slip, { phone1: '0899999999', rounds: [Object.assign({}, rounds[0], { status: 'ready' }), rounds[1]] }) }).item;
assert.deepEqual(moved.log.map(l => l.by + ':' + l.what), ['จนท.เอ:สร้างใบแจ้ง', 'ภก.ผู้ดูแล:แก้เบอร์โทร · นัดที่ 1 → พร้อมจ่าย']);
assert.equal(moved.createdBy, 'จนท.เอ', 'creator is kept on update');
assert.equal(moved.statusHistory[1].by, 'ภก.ผู้ดูแล');
const unchanged = post({ action: 'update', session: staff, id: slip.id, item: moved }).item;
assert.equal(unchanged.log.length, 2, 'saving without changes adds no history');
assert.equal(moved.publicToken, slip.publicToken, 'QR token never changes on update');

// นำเข้าและจองใบเปล่าบันทึกต่างกัน
const blank = post({ action: 'import', session: staff, source: 'blank', items: [{ clinic: 'URO' }, { clinic: 'URO' }] });
assert.deepEqual(blank.items.map(x => x.log[0].what), ['จองเลขที่ใบเปล่า', 'จองเลขที่ใบเปล่า']);
const excel = post({ action: 'import', session: staff, source: 'excel', items: [{ clinic: 'URO', hn: '690000001', patient: 'นำเข้า หนึ่ง' }] });
assert.equal(excel.items[0].log[0].what, 'นำเข้าจาก Excel');
assert.equal(excel.items[0].id, '2026-004');

// ลบใบแจ้งได้เฉพาะผู้ดูแล และบันทึกไว้ในประวัติกลาง
assert.equal(post({ action: 'delete', session: staff, id: '2026-004' }).err, 'forbidden');
assert.equal(post({ action: 'delete', session: admin, id: '2026-004' }).ok, 1);
const audit = get({ action: 'auditList', session: admin }).entries;
assert.equal(audit[0].action, 'delete');
assert.equal(audit[0].userName, 'ภก.ผู้ดูแล');
assert(audit[0].detail.includes('นำเข้า หนึ่ง'));
assert(audit.some(e => e.action === 'update' && e.slipId === '2026-001' && e.userName === 'ภก.ผู้ดูแล'));
assert(audit.some(e => e.action === 'login' && e.userName === 'จนท.เอ'));

// หน้าผู้ป่วยไม่เห็นข้อมูลส่วนตัวและประวัติการแก้ไข
const patient = get({ action: 'patient', token: slip.publicToken });
assert.equal(patient.item.patient, 'นายทดสอบ XXX');
for (const hidden of ['hn', 'phone1', 'phone2', 'address', 'publicToken', 'recipientName', 'clinic', 'log', 'createdBy', 'statusHistory']) assert.equal(patient.item[hidden], undefined, hidden + ' must not reach the patient page');
assert.equal(get({ action: 'patient', token: '' }).err, 'not_found');

// ระงับผู้ใช้มีผลทันที แม้ยังถือ session เดิมอยู่
const staffId = created.user.id;
assert.equal(post({ action: 'userUpdate', session: admin, id: staffId, active: false }).ok, 1);
assert.equal(get({ action: 'list', session: staff }).err, 'unauthorized', 'disabled user loses access immediately');
assert.equal(post({ action: 'login', username: 'nurse.a', password: 'pass1234' }).err, 'unauthorized');
assert.equal(post({ action: 'userUpdate', session: admin, id: staffId, active: true }).ok, 1);

// รีเซ็ตรหัส: รหัสเก่าใช้ไม่ได้ รหัสใหม่ใช้ได้
assert.equal(post({ action: 'userResetPassword', session: admin, id: staffId, password: '12' }).err, 'invalid_password');
assert.equal(post({ action: 'userResetPassword', session: admin, id: staffId, password: 'newpass99' }).ok, 1);
assert.equal(post({ action: 'login', username: 'nurse.a', password: 'pass1234' }).err, 'unauthorized');
const relogin = post({ action: 'login', username: 'nurse.a', password: 'newpass99' });
assert.equal(relogin.ok, 1);

// เปลี่ยนรหัสของตัวเองต้องรู้รหัสเดิม
assert.equal(post({ action: 'changePassword', session: relogin.session, oldPassword: 'nope', newPassword: 'abcdef12' }).err, 'wrong_password');
assert.equal(post({ action: 'changePassword', session: relogin.session, oldPassword: 'newpass99', newPassword: 'abcdef12' }).ok, 1);
assert.equal(post({ action: 'login', username: 'nurse.a', password: 'abcdef12' }).ok, 1);

// ผู้ดูแลระงับหรือลดสิทธิ์ตัวเองไม่ได้ และต้องเหลือผู้ดูแลที่ใช้งานได้อย่างน้อย 1 คน
const adminId = boot.user.id;
assert.equal(post({ action: 'userUpdate', session: admin, id: adminId, active: false }).err, 'cannot_change_self');
assert.equal(post({ action: 'userUpdate', session: admin, id: adminId, role: 'staff' }).err, 'cannot_change_self');
assert.equal(post({ action: 'userUpdate', session: admin, id: staffId, role: 'admin' }).ok, 1);
const second = post({ action: 'login', username: 'nurse.a', password: 'abcdef12' }).session;
assert.equal(post({ action: 'userUpdate', session: second, id: adminId, role: 'staff' }).ok, 1, 'another admin can demote while one admin remains');
assert.equal(post({ action: 'userUpdate', session: admin, id: staffId, role: 'staff' }).err, 'forbidden', 'demoted admin lost admin rights at once');
assert.equal(post({ action: 'userUpdate', session: second, id: staffId, role: 'staff' }).err, 'cannot_change_self');

// ใส่รหัสผิดติดกัน 5 ครั้ง ชื่อผู้ใช้นั้นถูกล็อก
for (let i = 0; i < 5; i++) assert.equal(post({ action: 'login', username: 'boss', password: 'wrong-pass' }).err, 'unauthorized');
assert.equal(post({ action: 'login', username: 'boss', password: 'secret12' }).err, 'locked');
// API key กู้คืนผู้ดูแลได้ และปลดล็อกชื่อนั้น
assert.equal(post({ action: 'bootstrapAdmin', key: KEY, username: 'boss', name: 'ภก.ผู้ดูแล', password: 'recover1' }).ok, 1);
const recovered = post({ action: 'login', username: 'boss', password: 'recover1' });
assert.equal(recovered.user.role, 'admin', 'recovery restores admin role');
assert.equal(get({ action: 'userList', session: recovered.session }).users.length, 2);

// ออกจากระบบแล้ว session ใช้ไม่ได้
assert.equal(post({ action: 'logout', session: recovered.session }).ok, 1);
assert.equal(get({ action: 'list', session: recovered.session }).err, 'unauthorized');

// 300 ใบแจ้งที่หมายเหตุและที่อยู่ยาว ต้องไม่ชนเพดาน 50,000 ตัวอักษรต่อเซลล์
const s3 = post({ action: 'login', username: 'nurse.a', password: 'abcdef12' }).session;
const note = 'ก'.repeat(1200);
for (let i = 0; i < 300; i++) assert.equal(post({ action: 'create', session: s3, item: { hn: String(i), patient: 'ผู้ป่วย ' + i, note, address: note, drugs, rounds } }).ok, 1);
assert.equal(get({ action: 'list', session: s3 }).items.length, 303);
assert(auditRows().length <= 300, 'audit list returns the latest 300 rows');

// วันหยุดและรายชื่อยา
const saved = post({ action: 'holidaySave', session: s3, holidays: [{ date: '2027-02-20', name: 'วันมาฆบูชา' }, { date: '2026-12-31', name: 'วันสิ้นปี' }, { date: '2026-12-31', name: 'ซ้ำ' }, { date: '31/12/2026', name: 'ผิดรูปแบบ' }] });
assert.deepEqual(saved.holidays, [{ date: '2026-12-31', name: 'วันสิ้นปี' }, { date: '2027-02-20', name: 'วันมาฆบูชา' }]);
assert.deepEqual(post({ action: 'drugSave', session: s3, names: ['Tamsulosin 0.4 mg', 'tamsulosin 0.4 MG', ' '] }).names, ['Tamsulosin 0.4 mg']);
assert.deepEqual(get({ action: 'drugList', session: s3 }).names, ['Tamsulosin 0.4 mg']);

// คลินิก: มีค่าตั้งต้น ผู้ดูแลเพิ่ม/แก้ชื่อได้ ลบคลินิกที่ยังมีใบแจ้งไม่ได้
assert.deepEqual(get({ action: 'list', session: s3 }).clinics.map(c => c.code), ['ORTHO', 'URO']);
const staffOnly = post({ action: 'login', username: 'boss', password: 'recover1' });
assert.equal(post({ action: 'userUpdate', session: staffOnly.session, id: staffId, role: 'staff' }).ok, 1);
const s4 = post({ action: 'login', username: 'nurse.a', password: 'abcdef12' }).session;
assert.equal(post({ action: 'clinicSave', session: s4, clinics: [{ code: 'MED', name: 'อายุรกรรม' }] }).err, 'forbidden', 'only admins edit clinics');
const clinicSaved = post({ action: 'clinicSave', session: staffOnly.session, clinics: [{ code: 'ORTHO', name: 'กระดูกและข้อ' }, { code: 'URO', name: 'URO' }, { code: 'MED', name: 'อายุรกรรม' }, { code: 'med', name: 'ซ้ำ' }, { code: '', name: 'ไม่มีรหัส' }] });
assert.deepEqual(clinicSaved.clinics, [{ code: 'ORTHO', name: 'กระดูกและข้อ' }, { code: 'URO', name: 'URO' }, { code: 'MED', name: 'อายุรกรรม' }]);
assert.deepEqual(get({ action: 'list', session: s4 }).clinics, clinicSaved.clinics);
const inUse = post({ action: 'clinicSave', session: staffOnly.session, clinics: [{ code: 'ORTHO', name: 'กระดูกและข้อ' }, { code: 'MED', name: 'อายุรกรรม' }] });
assert.equal(inUse.err, 'clinic_in_use', 'URO still has slips');
assert.deepEqual(inUse.codes, ['URO']);
assert.equal(post({ action: 'clinicSave', session: staffOnly.session, clinics: [] }).err, 'clinic_required');
assert(get({ action: 'auditList', session: staffOnly.session }).entries.some(e => e.action === 'clinic' && e.detail.includes('MED=อายุรกรรม')));

console.log('Owed medication backend smoke tests passed');

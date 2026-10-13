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
    getUuid: () => 'uuid-' + String(++uuid).padStart(28, '0'),
    formatDate: () => '2026',
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('owed-medication/apps-script/Code.gs', 'utf8'), context);
const post = body => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }));
const get = parameter => JSON.parse(context.doGet({ parameter }));

// ตั้ง PIN ครั้งแรกต้องใช้ API key จาก Script Properties ที่ยาวพอ
assert.equal(post({ action: 'login', pin: '1234' }).err, 'pin_not_set', 'there is no default PIN');
assert.equal(post({ action: 'setPin', key: '', pin: '1234' }).err, 'unauthorized');
props.set('API_KEY', 'short');
assert.equal(post({ action: 'setPin', key: 'short', pin: '1234' }).err, 'unauthorized', 'a short API key is never accepted');
const KEY = 'k'.repeat(32);
props.set('API_KEY', KEY);
assert.equal(post({ action: 'setPin', key: KEY, pin: '12' }).err, 'invalid_pin');
assert.equal(post({ action: 'setPin', key: KEY, pin: '482915' }).ok, 1);
assert.equal(get({ action: 'pinStatus' }).configured, true);
assert(!props.get('PIN_HASH').includes('482915'), 'PIN is stored hashed');

// PIN ผิดติดกันครบ 10 ครั้งแล้วล็อก แม้ PIN ถูกก็เข้าไม่ได้จนกว่าจะหมดเวลาหรือตั้ง PIN ใหม่
for (let i = 0; i < 10; i++) assert.equal(post({ action: 'login', pin: '000000' }).err, 'unauthorized');
assert.equal(post({ action: 'login', pin: '482915' }).err, 'locked');
assert.equal(post({ action: 'setPin', key: KEY, pin: '482915' }).ok, 1);
const login = post({ action: 'login', pin: '482915' });
assert.equal(login.ok, 1);
const session = login.session;

// ทุกคำสั่งที่อ่านหรือแก้ข้อมูลต้องมีสิทธิ์
assert.equal(get({ action: 'list' }).err, 'unauthorized');
assert.equal(post({ action: 'create', item: {} }).err, 'unauthorized');
assert.equal(post({ action: 'create', session: 'forged', item: {} }).err, 'unauthorized');
assert.equal(post({ action: '__proto__', session }).err, 'unknown action', 'prototype keys are not actions');
assert.equal(post({ action: 'constructor', session }).err, 'unknown action');
assert.equal(JSON.parse(context.doPost({ postData: { contents: '{bad' } })).err, 'bad_request');

// สร้าง แก้ และเลื่อนสถานะ ผ่าน HTTP จริงของ Apps Script
const drugs = [{ name: 'Tamsulosin 0.4 mg', unit: 'เม็ด', rx: '90', got: '30' }, { name: 'Finasteride 5 mg', unit: 'เม็ด', rx: 60, got: 20 }];
const rounds = [['2026-10-19', [30, 20]], ['2026-11-16', [30, 20]]].map(([date, qty]) => ({ date, status: 'waiting', qty }));
const created = post({ action: 'create', session, item: { clinic: 'URO', hn: '0012', patient: 'นายทดสอบ ระบบ', phone1: '0812345678', address: 'ต.แม่กา อ.เมืองพะเยา จ.พะเยา 56000', drugs, rounds } });
assert.equal(created.ok, 1);
assert.equal(created.item.id, '2026-001');
assert.deepEqual(created.item.drugs.map(d => d.rx), [90, 60], 'quantities are stored as numbers');
const moved = post({ action: 'update', session, id: '2026-001', item: Object.assign({}, created.item, { rounds: [Object.assign({}, rounds[0], { status: 'received' }), rounds[1]] }) });
assert.equal(moved.ok, 1);
assert.deepEqual(moved.item.statusHistory.map(h => (h.round ?? '') + ':' + h.status), [':created', '0:received']);
assert.equal(moved.item.publicToken, created.item.publicToken, 'QR token never changes on update');
let list = get({ action: 'list', session });
assert.equal(list.items[0].hn, '0012', 'HN keeps leading zeros');
assert.equal(list.items[0].rounds[0].status, 'received');
assert(list.holidays.some(h => h.date === '2026-10-23'), 'default holidays are seeded');

// รายการยาที่ไม่มีชื่อถูกตัดทิ้งพร้อมจำนวนของยาตัวนั้นในทุกนัด
const trimmed = context.item_({ drugs: [{ name: '' }, { name: 'B', rx: 5 }], rounds: [{ date: 'bad', status: 'weird', qty: [1, 2] }] }, {});
assert.deepEqual(JSON.parse(JSON.stringify(trimmed.rounds)), [{ date: '', status: 'waiting', qty: [2] }]);

// หน้าผู้ป่วย: ชื่อปิดนามสกุล ไม่มี HN เบอร์โทร ที่อยู่ หรือจำนวนที่แพทย์สั่ง
const patient = get({ action: 'patient', token: created.item.publicToken });
assert.equal(patient.ok, 1);
assert.equal(patient.item.patient, 'นายทดสอบ XXX');
for (const hidden of ['hn', 'phone1', 'phone2', 'address', 'publicToken', 'recipientName', 'clinic']) assert.equal(patient.item[hidden], undefined, hidden + ' must not reach the patient page');
assert.deepEqual(Object.keys(patient.item.drugs[0]).sort(), ['got', 'name', 'unit']);
assert.equal(get({ action: 'patient', token: '' }).err, 'not_found');
assert.equal(get({ action: 'patient', token: 'nope' }).err, 'not_found');

// นำเข้า Excel หลายคนในครั้งเดียว เลขที่ต่อจากเดิม
const imported = post({ action: 'import', session, items: Array.from({ length: 53 }, (_, i) => ({ clinic: 'URO', hn: String(690000000 + i), patient: 'นำเข้า ' + i })) });
assert.equal(imported.items.length, 53);
assert.deepEqual([imported.items[0].id, imported.items[52].id], ['2026-002', '2026-054']);
assert.equal(new Set(imported.items.map(x => x.publicToken)).size, 53);
assert.equal(post({ action: 'import', session, items: [] }).err, 'empty_import');

// 300 ใบแจ้งที่หมายเหตุและที่อยู่ยาว ต้องไม่ชนเพดาน 50,000 ตัวอักษรต่อเซลล์
const note = 'ก'.repeat(1200);
for (let i = 0; i < 300; i++) assert.equal(post({ action: 'create', session, item: { hn: String(i), patient: 'ผู้ป่วย ' + i, note, address: note, drugs, rounds } }).ok, 1);
list = get({ action: 'list', session });
assert.equal(list.items.length, 354);

// ลบแล้วไม่มีแถวค้าง
assert.equal(post({ action: 'delete', session, id: '2026-010' }).ok, 1);
assert.equal(get({ action: 'list', session }).items.length, 353);
assert.equal(post({ action: 'delete', session, id: '2026-010' }).err, 'not_found');

// วันหยุด: เรียงวันที่ ตัดรายการซ้ำและรูปแบบผิด
const saved = post({ action: 'holidaySave', session, holidays: [{ date: '2027-02-20', name: 'วันมาฆบูชา' }, { date: '2026-12-31', name: 'วันสิ้นปี' }, { date: '2026-12-31', name: 'ซ้ำ' }, { date: '31/12/2026', name: 'ผิดรูปแบบ' }, { date: '2026-11-01', name: '' }] });
assert.deepEqual(saved.holidays, [{ date: '2026-12-31', name: 'วันสิ้นปี' }, { date: '2027-02-20', name: 'วันมาฆบูชา' }]);
assert.deepEqual(get({ action: 'list', session }).holidays, saved.holidays);

// รายชื่อยา: รวมกับของเดิม ไม่ซ้ำ ไม่สนตัวพิมพ์เล็กใหญ่
assert.deepEqual(post({ action: 'drugSave', session, names: ['Tamsulosin 0.4 mg', 'tamsulosin 0.4 MG', ' '] }).names, ['Tamsulosin 0.4 mg']);
assert.deepEqual(post({ action: 'drugSave', session, names: ['Finasteride 5 mg'] }).names, ['Tamsulosin 0.4 mg', 'Finasteride 5 mg']);
assert.deepEqual(get({ action: 'drugList', session }).names, ['Tamsulosin 0.4 mg', 'Finasteride 5 mg']);

console.log('Owed medication backend smoke tests passed');

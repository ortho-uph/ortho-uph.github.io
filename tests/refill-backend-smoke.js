const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const CELL_LIMIT = 50000;
function fakeSheet() {
  const cells = [];
  const formats = [];
  const sheet = {
    cells,
    getLastRow: () => cells.reduce((last, row, i) => row && row.some(v => v !== '' && v != null) ? i + 1 : last, 0),
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
        getValue: () => read()[0][0],
        getDisplayValues: () => read().map(r => r.map(v => String(v))),
        setValue: value => { write(row - 1, col - 1, value); return range; },
        setValues: values => { each((r, c, i, j) => write(r, c, values[i][j])); return range; },
        setNumberFormat: format => { each((r, c) => { formats[r] = formats[r] || []; formats[r][c] = format; }); return range; },
      };
      return range;
    },
  };
  return sheet;
}
const sheets = new Map();
const spreadsheet = {
  getSheetByName: name => sheets.get(name) || null,
  insertSheet: name => { const sh = fakeSheet(); sheets.set(name, sh); return sh; },
};
const context = {
  console, Date, JSON, Math, String, Number, Array, Object, RegExp, Error,
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => Math.floor(Math.random() * 16).toString(16)), formatDate: () => '2026' },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script-backend.gs', 'utf8'), context);

// ข้อมูลเดิมที่เก็บเป็น JSON ในเซลล์ A1 ต้องอ่านได้และย้ายเป็นแถวเมื่อบันทึกครั้งแรก
const legacyItem = { id: '2026-001', publicToken: 'legacytoken000000001', hn: '0012345', patient: 'ทดสอบ ระบบ', phone1: '0812345678', availableDate: '2026-10-19', status: 'waiting', createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z', statusHistory: [{ status: 'waiting', at: '2026-10-01T03:00:00.000Z' }] };
const legacyRaw = JSON.stringify([legacyItem]);
spreadsheet.insertSheet('PharmacyRefill').getRange(1, 1).setValue(legacyRaw);
assert.equal(context.refillLoad_()[0].id, '2026-001', 'legacy A1 blob must still be readable');

const updated = context.refillUpdate_('2026-001', Object.assign({}, legacyItem, { status: 'ready' }));
assert.equal(updated.ok, 1);
const refillSheet = sheets.get('PharmacyRefill');
assert.equal(refillSheet.getRange(1, 1).getValue(), 'id', 'first save must replace the blob with a header row');
assert.equal(sheets.get('PharmacyRefill_legacy').getRange(1, 1).getValue(), legacyRaw, 'legacy blob must be backed up before migration');
const migrated = context.refillLoad_()[0];
assert.equal(migrated.hn, '0012345', 'HN must keep leading zeros');
assert.equal(migrated.phone1, '0812345678', 'phone must keep leading zero');
assert.equal(migrated.availableDate, '2026-10-19');
assert.equal(migrated.publicToken, 'legacytoken000000001');
assert.deepEqual(migrated.statusHistory.map(h => h.status), ['waiting', 'ready']);

// ข้อมูลเสียต้องไม่ถูกเขียนทับเป็นรายการว่าง
const corrupt = fakeSheet(); corrupt.getRange(1, 1).setValue('[{"id":');
sheets.set('PharmacyRefill', corrupt);
assert.throws(() => context.refillLoad_(), /refill_data_corrupt/);
assert.throws(() => context.refillCreate_({}), /refill_data_corrupt/, 'create must not wipe a corrupt blob');
assert.equal(corrupt.getRange(1, 1).getValue(), '[{"id":');
sheets.delete('PharmacyRefill');

// 300 รายการที่มีหมายเหตุยาว ต้องไม่ชนเพดาน 50,000 ตัวอักษรต่อเซลล์
const note = 'ก'.repeat(1200);
for (let i = 1; i <= 300; i++) {
  const created = context.refillCreate_({ hn: '00' + i, patient: 'ผู้ป่วย ' + i, phone1: '08' + String(i).padStart(8, '0'), note, deliveryAddress: note, status: 'waiting' });
  assert.equal(created.ok, 1, 'create #' + i + ' failed');
  assert.equal(created.item.id, '2026-' + String(i).padStart(3, '0'));
}
let items = context.refillLoad_();
assert.equal(items.length, 300);
assert.equal(items.find(x => x.id === '2026-007').hn, '007');

// ลบแล้วต้องไม่มีแถวค้าง
const lastRowBefore = sheets.get('PharmacyRefill').getLastRow();
assert.equal(context.refillDelete_('2026-150').ok, 1);
assert.equal(sheets.get('PharmacyRefill').getLastRow(), lastRowBefore - 1);
items = context.refillLoad_();
assert.equal(items.length, 299);
assert(!items.some(x => x.id === '2026-150'));
assert.equal(context.refillDelete_('2026-150').err, 'not_found');

// ผู้ป่วยค้นด้วย token ได้ และไม่เห็น HN/เบอร์โทร
const target = items.find(x => x.id === '2026-042');
const patient = context.refillPatient_(target.publicToken);
assert.equal(patient.ok, 1);
assert.equal(patient.item.id, '2026-042');
assert.equal(patient.item.hn, undefined);
assert.equal(patient.item.phone1, undefined);
assert.equal(context.refillPatient_('nope').err, 'not_found');

console.log('Refill backend storage smoke tests passed');

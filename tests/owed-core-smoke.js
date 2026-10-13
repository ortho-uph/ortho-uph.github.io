const fs = require('fs');
const assert = require('assert');

const C = new Function(fs.readFileSync('owed-medication/core.js', 'utf8') + '\nreturn RefillCore;')();
const slip = (rounds, extra = {}) => Object.assign({ receiveMethod: 'self', drugs: [{ name: 'A', unit: 'เม็ด', rx: 90, got: 30 }, { name: 'B', unit: 'ซอง', rx: 60, got: 20 }], rounds }, extra);
const R = (date, status, qty = [30, 20]) => ({ date, status, qty });

// สถานะของใบแจ้งมาจากนัดแรกที่ยังรับไม่ครบ
assert.equal(C.status(slip([])), 'draft');
assert.equal(C.status(slip([R('2026-10-19', 'received'), R('2026-11-02', 'ready')])), 'ready');
assert.equal(C.status(slip([R('2026-10-19', 'received')])), 'received');
assert.equal(C.leftOf(slip([R('2026-10-19', 'received'), R('2026-11-02', 'waiting')]), 1), 20);
assert.equal(C.receivedOf(slip([R('2026-10-19', 'received'), R('2026-11-02', 'waiting')]), 0), 60);
assert.deepEqual(C.next(slip([R('2026-10-19', 'ready')], { receiveMethod: 'mail' })), ['delivery', 'ส่งพัสดุแล้ว']);
assert.deepEqual(C.next(slip([R('2026-10-19', 'ready')])), ['received', 'รับยานัดนี้แล้ว']);
assert.equal(C.next(slip([R('2026-10-19', 'received')])), null);

// แบ่งนัด: แบ่งยอดค้างเท่า ๆ กัน (เศษไปนัดแรก ๆ) และเลื่อนวันหยุดไปวันทำการถัดไป
const holidays = [{ date: '2026-10-23', name: 'วันปิยมหาราช' }];
const plan = C.planRounds([61, 14], 3, 14, '2026-10-09', holidays);
assert.deepEqual(plan.map(r => r.date), ['2026-10-09', '2026-10-26', '2026-11-06'], '23 ต.ค. (holiday, Fri) moves to Mon 26 ต.ค.');
assert.deepEqual(plan.map(r => r.movedFrom), [null, '2026-10-23', null]);
assert.deepEqual(plan.map(r => r.qty), [[21, 5], [20, 5], [20, 4]]);
assert.equal(C.offReason('2026-10-25', holidays), 'วันอาทิตย์');
assert.equal(C.offReason('2026-10-24', holidays), 'วันเสาร์');
assert.equal(C.offReason('2026-10-26', holidays), null);
assert.equal(C.nextWorkday('2026-10-23', holidays), '2026-10-26');

// ข้อความที่ผู้ป่วยเห็นต้องไม่บอกว่ายาหมดหรือไม่พอ ในทุกสถานะและทุกวิธีรับยา
const forbidden = /หมด|ไม่พอ|ขาด|ยายังไม่มา|จัดหา|รอยา|สต็อก/;
const views = [];
for (const method of ['self', 'mail']) {
  for (const s of [slip([]), slip([R('2026-10-30', 'waiting')]), slip([R('2026-10-01', 'waiting')]), slip([R('2026-10-01', 'ready')]), slip([R('2026-10-01', 'delivery')]), slip([R('2026-10-01', 'received'), R('2026-11-01', 'waiting')]), slip([R('2026-10-01', 'received')])]) {
    s.receiveMethod = method;
    const v = C.patientView(s, '2026-10-13');
    views.push(v);
    assert(!forbidden.test(v.title + v.message + C.patientHeadline(s)), `patient wording leaks shortage: ${v.title} ${v.message}`);
  }
}
const future = C.patientView(slip([R('2026-10-19', 'waiting')]), '2026-10-13');
assert.equal(future.title, 'นัดรับยาส่วนที่เหลือ');
assert.equal(future.daysLeft, 6, 'countdown counts whole days to the appointment');
const overdue = C.patientView(slip([R('2026-10-10', 'waiting')]), '2026-10-13');
assert.equal(overdue.title, 'ห้องยากำลังจัดเตรียมยาส่วนที่เหลือ');
assert.equal(overdue.daysLeft, null, 'no countdown once the date has passed');
assert.deepEqual(C.patientView(slip([R('2026-10-01', 'received'), R('2026-11-01', 'waiting')]), '2026-10-13').round, { number: 2, total: 2 });
assert.equal(C.patientView(slip([R('2026-10-01', 'ready')]), '2026-10-13').daysLeft, null);

// ที่อยู่ เบอร์โทร และรหัสไปรษณีย์
assert.equal(C.cleanAddress('13-15 หมู่     ถนนถนนดอนสนาม  ต.เวียง'), '13-15 ถนนดอนสนาม ต.เวียง');
assert.deepEqual(C.cleanPhone('812345678'), { value: '081-234-5678', fixed: true, bad: false });
assert.deepEqual(C.cleanPhone('094-352-5939'), { value: '094-352-5939', fixed: false, bad: false });
assert.equal(C.cleanPhone('12345').bad, true);
assert.deepEqual(C.parseAddress('65/15 ซอย 56/2 ต.ท่าแร้ง อ.เขตบางเขน จ.กรุงเทพมหานคร'), { tambon: 'ท่าแร้ง', amphoe: 'บางเขน', province: 'กรุงเทพมหานคร' });
const idx = C.buildZipIndex({ lookup: 'แม่กา', words: 'เมือง', data: [['พะเยา', [['Aพะเยา', [[0, '56000'], ['บ้านต๋อม', '56000']]], ['งาว', [['บ้านร้อง', '52110']]]]], ['ลำปาง', [['งาว', [['บ้านร้อง', '52110'], ['บ้านร้อง', '52111']]]]]] });
assert.deepEqual(C.findZip(idx, '1 หมู่ 2 ต.แม่กา อ.เมืองพะเยา จ.พะเยา'), { zip: '56000', guess: '' }, 'compressed names expand (lookup index + word letters)');
assert.deepEqual(C.findZip(idx, '9 ต.ไม่มีจริง อ.เมืองพะเยา จ.พะเยา'), { zip: '56000', guess: 'ไม่มีจริง' }, 'unknown tambon falls back to a single-zip district and says so');
assert.deepEqual(C.findZip(idx, '9 ต.บ้านร้อง อ.งาว จ.ลำปาง'), { multi: ['52110', '52111'] });
assert.deepEqual(C.findZip(idx, 'ต.แม่กา อ.เมืองพะเยา จ.พะเยา 56000'), { has: '56000' });
assert.deepEqual(C.findZip(idx, 'ไม่มีจังหวัด'), {});

console.log('Refill core smoke tests passed');

/* โดเมนนัดเติมยา: ใช้ร่วมกันระหว่างหน้าเจ้าหน้าที่ (index.html) และหน้าผู้ป่วย (status.html)
   ใบแจ้ง 1 ใบ = ยาหลายรายการ (drugs) + นัดหลายรอบ (rounds) · rounds[k].qty[j] คือจำนวนยา drugs[j] ในนัดที่ k
   สถานะของใบแจ้งไม่เก็บแยก แต่คำนวณจากนัดแรกที่ยังรับไม่ครบ */
const RefillCore = (() => {
  const STATUS = {
    draft: 'รอกรอกข้อมูล',
    waiting: 'รอนัดรับยา',
    ready: 'พร้อมจ่าย',
    delivery: 'จัดส่งแล้ว',
    received: 'รับครบแล้ว',
  };

  const isDraft = s => !s.drugs.length || !s.rounds.length;
  const cur = s => s.rounds.findIndex(r => r.status !== 'received');
  const curRound = s => s.rounds[cur(s)] || null;
  const status = s => (isDraft(s) ? 'draft' : cur(s) < 0 ? 'received' : curRound(s).status);
  const leftOf = (s, j) => s.rounds.filter(r => r.status !== 'received').reduce((a, r) => a + (r.qty[j] || 0), 0);
  const receivedOf = (s, j) => (s.drugs[j].got || 0) + s.rounds.filter(r => r.status === 'received').reduce((a, r) => a + (r.qty[j] || 0), 0);
  const roundItems = (s, r) => s.drugs.map((d, j) => (r.qty[j] ? `${d.name} ${r.qty[j]} ${d.unit}` : '')).filter(Boolean);

  // ขั้นถัดไปของนัดปัจจุบัน: [สถานะใหม่, ข้อความบนปุ่ม]
  function next(s) {
    const st = status(s);
    if (st === 'waiting') return ['ready', 'ยาพร้อมจ่ายแล้ว'];
    if (st === 'ready') return s.receiveMethod === 'mail' ? ['delivery', 'ส่งพัสดุแล้ว'] : ['received', 'รับยานัดนี้แล้ว'];
    if (st === 'delivery') return ['received', 'ผู้ป่วยได้รับแล้ว'];
    return null;
  }

  const pad = n => String(n).padStart(2, '0');
  const isoLocal = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const today = () => isoLocal(new Date());
  const toDate = d => new Date(d + 'T00:00:00');
  const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return isoLocal(x); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  const fmt = (d, opts) => (d ? new Intl.DateTimeFormat('th-TH', opts).format(toDate(d)) : '-');
  const dateShort = d => fmt(d, { day: 'numeric', month: 'short', year: '2-digit' });
  const dateDay = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
  const dateLong = d => fmt(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const isDue = (s, on = today()) => status(s) === 'waiting' && !!curRound(s).date && curRound(s).date <= on;

  // วันหยุด: เสาร์–อาทิตย์ และรายการวันหยุดราชการที่เจ้าหน้าที่ดูแลเอง
  function offReason(d, holidays) {
    if (!d) return null;
    const h = holidays.find(x => x.date === d);
    if (h) return h.name;
    const w = toDate(d).getDay();
    return w === 0 ? 'วันอาทิตย์' : w === 6 ? 'วันเสาร์' : null;
  }
  function nextWorkday(d, holidays) {
    let x = d;
    for (let i = 0; i < 30 && offReason(x, holidays); i++) x = addDays(x, 1);
    return x;
  }
  // กำหนดจำนวนต่อรอบของยาแต่ละตัวซ้ำเป็น n นัด แล้วเลื่อนวันที่ตรงกับวันหยุดไปวันทำการถัดไป
  function planRounds(remaining, n, gapDays, start, holidays) {
    return Array.from({ length: n }, (_, k) => {
      const raw = addDays(start, gapDays * k);
      const date = nextWorkday(raw, holidays);
      const qty = remaining.map(amount => Math.max(0, +amount || 0));
      return { date, status: 'waiting', qty, movedFrom: raw === date ? null : raw };
    });
  }

  // ข้อความที่ผู้ป่วยเห็น: ไม่บอกว่ายาหมดหรือไม่พอ ใช้คำว่า "ยาตามนัด" เสมอ
  function patientView(s, on = today()) {
    const st = status(s);
    const n = s.rounds.length, k = cur(s);
    const round = k >= 0 ? { number: k + 1, total: n } : null;
    const mail = s.receiveMethod === 'mail';
    const target = st === 'waiting' && curRound(s).date ? daysBetween(on, curRound(s).date) : null;
    const daysLeft = target !== null && target > 0 ? target : null;
    const views = {
      draft: ['waiting', '◷', 'ห้องยากำลังจัดเตรียมข้อมูล', 'กรุณาตรวจสอบอีกครั้งภายหลัง'],
      waiting: isDue(s, on)
        ? ['waiting', '◷', 'ห้องยากำลังจัดเตรียมยาตามนัด', 'ห้องยาจะอัปเดตสถานะในหน้านี้เมื่อพร้อม หากมีข้อสงสัยโทรสอบถามได้']
        : ['waiting', '◷', 'นัดรับยาตามนัด', daysLeft ? 'ห้องยาจะอัปเดตสถานะในหน้านี้เมื่อพร้อมรับยา' : `รับยาได้ตั้งแต่วันที่ ${dateLong(curRound(s) && curRound(s).date)} ห้องยาจะอัปเดตสถานะในหน้านี้`],
      ready: mail
        ? ['ready', '✓', 'ยาตามนัดพร้อมจัดส่ง', 'ห้องยาจะจัดส่งทางไปรษณีย์ ค่าส่ง 55 บาท เก็บเงินปลายทาง']
        : ['ready', '✓', 'ยาตามนัดพร้อมรับแล้ว', 'กรุณานำใบแจ้งมาติดต่อห้องจ่ายยา โดยไม่ต้องพบแพทย์'],
      delivery: ['delivery', '↗', 'จัดส่งยาตามนัดแล้ว', 'โปรดเตรียมชำระค่าส่ง 55 บาท (เก็บเงินปลายทาง)'],
      received: ['received', '✓', 'ได้รับยาครบแล้ว', 'ขอบคุณที่ใช้บริการห้องยา'],
    };
    const [tone, icon, title, message] = views[st];
    return { tone, icon, title, message, round: n > 1 ? round : null, daysLeft };
  }
  const patientHeadline = s => { const v = patientView(s); return v.title + (v.round ? ` · นัดที่ ${v.round.number} จาก ${v.round.total}` : ''); };

  // ที่อยู่และรหัสไปรษณีย์
  const cleanText = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const cleanAddress = v => cleanText(v).replace(/หมู่\s+(?!\d)/g, '').replace(/(ถนน|ซอย)\s*\1/g, '$1').trim();
  function cleanPhone(v) {
    const raw = cleanText(v);
    if (!raw) return { value: '', fixed: false, bad: false };
    let d = raw.replace(/\D/g, ''), fixed = false;
    if (d.length === 9 && /^[689]/.test(d)) { d = '0' + d; fixed = true; }
    return { value: d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw, fixed, bad: d.length !== 10 };
  }
  function parseAddress(a) {
    const pick = re => { const m = a.match(re); return m ? m[1] : ''; };
    const tambon = pick(/(?:^|\s)(?:ต\.|ตำบล|แขวง)\s*([^\s]+)/);
    const amphoe = pick(/(?:^|\s)(?:อ\.|อำเภอ|เขต)\s*([^\s]+)/).replace(/^เขต/, '');
    let province = pick(/(?:^|\s)(?:จ\.|จังหวัด)\s*([^\s]+)/);
    if (/กรุงเทพ|กทม/.test(province || a)) province = 'กรุงเทพมหานคร';
    return { tambon, amphoe, province };
  }
  // ฐานข้อมูลรูปแบบ thai-address-database (db.json แบบบีบอัด)
  function buildZipIndex(raw) {
    const lookup = raw.lookup.split('|'), words = raw.words.split('|');
    const expand = x => (typeof x === 'number' ? lookup[x] : x).replace(/[A-Z]/gi, m => { const c = m.charCodeAt(0); return words[c < 97 ? c - 65 : 26 + c - 97]; });
    const idx = { dap: new Map(), dp: new Map(), ap: new Map() };
    const add = (m, key, zip) => { if (!m.has(key)) m.set(key, new Set()); m.get(key).add(zip); };
    raw.data.forEach(p => {
      const i = p.length === 3 ? 2 : 1, pn = expand(p[0]);
      p[i].forEach(a => {
        const an = expand(a[0]);
        a[i].forEach(d => {
          const dn = expand(d[0]);
          [].concat(d[i]).forEach(zip => { add(idx.dap, `${dn}|${an}|${pn}`, zip); add(idx.dp, `${dn}|${pn}`, zip); add(idx.ap, `${an}|${pn}`, zip); });
        });
      });
    });
    return idx;
  }
  // { zip, guess } รหัสเดียว (guess = ชื่อตำบลที่หาไม่เจอแต่อำเภอมีรหัสเดียว) · { multi } หลายรหัส · { has } มีอยู่แล้ว · {} หาไม่เจอ
  function findZip(idx, address) {
    const has = address.match(/(?:^|\D)(\d{5})(?:\D|$)/);
    if (has) return { has: has[1] };
    if (!idx) return {};
    const { tambon, amphoe, province } = parseAddress(address);
    if (!province) return {};
    const tries = [[idx.dap, `${tambon}|${amphoe}|${province}`, true], [idx.dp, `${tambon}|${province}`, true], [idx.ap, `${amphoe}|${province}`, false]];
    for (const [map, key, byTambon] of tries) {
      const zips = map.get(key);
      if (!zips || (byTambon && !tambon)) continue;
      const list = [...zips];
      if (list.length === 1) return { zip: list[0], guess: byTambon ? '' : tambon };
      if (byTambon) return { multi: list };
    }
    return {};
  }

  return {
    STATUS, isDraft, cur, curRound, status, leftOf, receivedOf, roundItems, next,
    today, addDays, daysBetween, dateShort, dateDay, dateLong, isDue, offReason, nextWorkday, planRounds,
    patientView, patientHeadline, cleanText, cleanAddress, cleanPhone, parseAddress, buildZipIndex, findZip,
  };
})();

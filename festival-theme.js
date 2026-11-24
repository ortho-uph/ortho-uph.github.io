(() => {
  'use strict';

  const backgrounds = {
    'new-year': 'festival-new-year.png',
    'chinese-new-year': 'festival-chinese-new-year.png',
    buddhist: 'festival-buddhist.png',
    songkran: 'festival-songkran.png',
    'loy-krathong': 'festival-loy-krathong.png'
  };

  const fixedEvents = [
    { theme: 'new-year', month: 1, day: 1, endMonth: 1, endDay: 1, priority: 10 },
    { theme: 'songkran', month: 4, day: 13, endMonth: 4, endDay: 15, priority: 30 }
  ];

  // Lunar observances change date each year. Confirmed Thai dates are included
  // for 2026–2027; later entries are calendar forecasts to review each year.
  const lunarEvents = [
    { theme: 'chinese-new-year', start: '2026-02-17', end: '2026-02-19', priority: 20 },
    { theme: 'chinese-new-year', start: '2027-02-06', end: '2027-02-08', priority: 20 },
    { theme: 'chinese-new-year', start: '2028-01-26', end: '2028-01-28', priority: 20 },
    { theme: 'chinese-new-year', start: '2029-02-13', end: '2029-02-15', priority: 20 },
    { theme: 'chinese-new-year', start: '2030-02-03', end: '2030-02-05', priority: 20 },

    { theme: 'buddhist', start: '2026-03-03', priority: 25 },
    { theme: 'buddhist', start: '2026-05-31', priority: 25 },
    { theme: 'buddhist', start: '2026-07-29', end: '2026-07-30', priority: 25 },
    { theme: 'buddhist', start: '2027-02-21', priority: 25 },
    { theme: 'buddhist', start: '2027-05-20', priority: 25 },
    { theme: 'buddhist', start: '2027-07-18', end: '2027-07-19', priority: 25 },
    { theme: 'buddhist', start: '2028-02-10', priority: 25 },
    { theme: 'buddhist', start: '2028-05-08', priority: 25 },
    { theme: 'buddhist', start: '2028-07-06', end: '2028-07-07', priority: 25 },
    { theme: 'buddhist', start: '2029-02-27', priority: 25 },
    { theme: 'buddhist', start: '2029-05-27', priority: 25 },
    { theme: 'buddhist', start: '2029-07-25', end: '2029-07-26', priority: 25 },
    { theme: 'buddhist', start: '2030-02-17', priority: 25 },
    { theme: 'buddhist', start: '2030-05-16', priority: 25 },
    { theme: 'buddhist', start: '2030-07-15', end: '2030-07-16', priority: 25 },

    { theme: 'loy-krathong', start: '2026-11-24', priority: 40 },
    { theme: 'loy-krathong', start: '2027-11-13', priority: 40 },
    { theme: 'loy-krathong', start: '2028-11-01', priority: 40 },
    { theme: 'loy-krathong', start: '2029-11-20', priority: 40 },
    { theme: 'loy-krathong', start: '2030-11-10', priority: 40 }
  ];

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const currentYear = Number(parts.find(part => part.type === 'year').value);
  const today = parts.find(part => part.type === 'year').value + '-' +
    parts.find(part => part.type === 'month').value + '-' +
    parts.find(part => part.type === 'day').value;
  const ordinal = isoDate => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  const todayOrdinal = ordinal(today);
  const occurrences = lunarEvents.slice();

  for (let year = currentYear - 1; year <= currentYear + 1; year += 1) {
    fixedEvents.forEach(event => {
      const start = `${year}-${String(event.month).padStart(2, '0')}-${String(event.day).padStart(2, '0')}`;
      const end = `${year}-${String(event.endMonth).padStart(2, '0')}-${String(event.endDay).padStart(2, '0')}`;
      occurrences.push({ theme: event.theme, start, end, priority: event.priority });
    });
  }

  const active = occurrences
    .filter(event => {
      const start = ordinal(event.start);
      const end = ordinal(event.end || event.start);
      return todayOrdinal >= start - 7 && todayOrdinal <= end;
    })
    .sort((a, b) => b.priority - a.priority || ordinal(a.start) - ordinal(b.start))[0];

  if (!active || !backgrounds[active.theme]) return;

  const filename = backgrounds[active.theme];
  document.body.style.backgroundImage =
    `linear-gradient(90deg, rgba(255,255,255,.34), rgba(255,255,255,.56)), url("${filename}")`;
  document.documentElement.dataset.festivalTheme = active.theme;
})();

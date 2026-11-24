const weekdays=['อา','จ','อ','พ','พฤ','ศ','ส'];
const shiftLabels={'ช':'เช้า','บ':'บ่าย','ด':'ดึก','X':'หยุด','V':'ลา'};

export function personalCalendar({dayCount,dow,daysOff,holidays,shifts,source}){
 const headings=weekdays.map(day=>'<div class="personal-weekday">'+day+'</div>').join('');
 const leading='<div aria-hidden="true"></div>'.repeat(dow(1));
 const dates=shifts.slice(1,dayCount+1).map((code,index)=>{
  const day=index+1;
  const holiday=holidays.includes(day);
  const background=holiday?'holiday':daysOff.includes(day)?'weekend':'';
  const color=(source?.[day]||code==='X')?'fixed':code==='ช'&&!daysOff.includes(day)?'morning':/[ชบด]/.test(code)?'generated':'empty-shift';
  const label=code.split('/').map(part=>shiftLabels[part]).filter(Boolean).join(' / ')||'–';
  return '<div class="personal-day '+background+'"><b>'+day+'</b><span class="'+color+'">'+label+'</span></div>';
 }).join('');
 return headings+leading+dates;
}

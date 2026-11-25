const weekdays=['อา','จ','อ','พ','พฤ','ศ','ส'];
const shiftLabels={'ช':'เช้า','บ':'บ่าย','ด':'ดึก','X':'หยุด','V':'ลา'};

export function personalCalendar({dayCount,dow,daysOff,holidays,shifts,source,editable=false}){
 const headings=weekdays.map(day=>'<div class="personal-weekday">'+day+'</div>').join('');
 const leading='<div aria-hidden="true"></div>'.repeat(dow(1));
 const dates=shifts.slice(1,dayCount+1).map((code,index)=>{
  const day=index+1;
  const holiday=holidays.includes(day);
  const background=holiday?'holiday':daysOff.includes(day)?'weekend':'';
  const color=(source?.[day]||code==='X')?'fixed':code==='ช'&&!daysOff.includes(day)?'morning':/[ชบด]/.test(code)?'generated':'empty-shift';
  const parts=code.split('/').filter(part=>Object.hasOwn(shiftLabels,part));
  const label=parts.map(part=>shiftLabels[part]).join(' / ')||'ยังไม่กำหนดเวร';
  const abbreviation=parts.join('/')||'–';
  const content='<b>'+day+'</b><span class="'+color+'">'+abbreviation+'</span>';
  const classes='personal-day '+background;
  return editable?'<button type="button" class="'+classes+'" data-personal-day="'+day+'" aria-label="วันที่ '+day+' '+label+'">'+content+'</button>':'<div class="'+classes+'">'+content+'</div>';
 }).join('');
 return headings+leading+dates;
}

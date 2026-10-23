const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function teamHTML(data,draft){
 const days=new Date(data.year,data.month,0).getDate(),week=['อา','จ','อ','พ','พฤ','ศ','ส'];
 const header=Array.from({length:days},(_,i)=>{const d=i+1,dow=new Date(data.year,data.month-1,d).getDay();return`<th class="${data.holidays.includes(d)?'holiday':[0,6].includes(dow)?'weekend':''}"><small>${week[dow]}</small>${d}</th>`;}).join('');
 const rows=(data.team||[]).map(p=>{const own=p.id===data.person.id&&!data.preview,row=own?draft:p.source||{};let total=0;
  const cells=Array.from({length:days},(_,i)=>{const d=i+1,v=row[d]||'',dow=new Date(data.year,data.month-1,d).getDay(),off=[0,6].includes(dow)||data.holidays.includes(d);total+=(v.includes('ช')&&off?1:0)+(v.includes('บ')?1:0)+(v.includes('ด')?1:0);const color=v==='V'?'leave':v==='X'?'off':v.includes('ด')?'night':v.includes('บ')?'afternoon':'';return`<td class="${color} ${data.holidays.includes(d)?'holiday':[0,6].includes(dow)?'weekend':''}">${own?`<button data-day="${d}" aria-label="แก้เวรของ ${esc(p.name)} วันที่ ${d}">${esc(v||'·')}</button>`:`<span title="ดูอย่างเดียว">${esc(v||'·')}</span>`}</td>`;}).join('');
  return`<tr data-team-person="${p.id}" class="${own?'my-roster':''}"><th scope="row">${esc(p.name)}${own?'<small>คุณ · แก้ไขได้</small>':'<small>ดูอย่างเดียว</small>'}</th>${cells}<td class="team-total">${total}</td></tr>`;
 }).join('');return`<table class="team-table"><thead><tr><th>บุคลากร</th>${header}<th>นอกเวลา</th></tr></thead><tbody>${rows}</tbody></table>`;
}
export function mergeRemoteDraft(previous,incoming,draft,notes){
 const source={...draft},nextNotes={...notes};for(const d of new Set([...Object.keys(previous.source||{}),...Object.keys(incoming.source||{}),...Object.keys(previous.notes||{}),...Object.keys(incoming.notes||{})])){
  if(previous.source?.[d]!==incoming.source?.[d]||previous.notes?.[d]!==incoming.notes?.[d]){if(incoming.source?.[d])source[d]=incoming.source[d];else delete source[d];if(incoming.notes?.[d])nextNotes[d]=incoming.notes[d];else delete nextNotes[d];}
 }
 return{source,notes:nextNotes,dirty:JSON.stringify(source)!==JSON.stringify(incoming.source||{})||JSON.stringify(nextNotes)!==JSON.stringify(incoming.notes||{})};
}

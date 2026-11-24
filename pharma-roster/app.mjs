import {personalCalendar} from './personal-summary.mjs?v=locked-off1';
import{capacityConflict}from'./capacity.mjs?v=capacity4';
import{requirements,staffing,applySourceRow,monthlyQuota,requestQuotaError,calendar,initial,counts,validate,readiness,display,codes,clone,parsePreferenceCSV}from'./engine.mjs?v=locked-off1';
const apiBase=(window.ROSTER_API_BASE||'').replace(/\/$/,'');
const authHeaders=()=>({authorization:'Bearer '+(sessionStorage.getItem('roster-session')||'')});
async function apiFetch(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(apiBase+path,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
function showConnectionError(error){const bar=document.getElementById('sync-bar'),title=document.getElementById('sync-title'),detail=document.getElementById('sync-detail'),retry=document.getElementById('sync-now');bar?.classList.add('error');if(title)title.textContent='เชื่อมต่อระบบส่วนกลางไม่ได้';if(detail)detail.textContent=error?.name==='AbortError'?'ระบบไม่ตอบกลับภายใน 15 วินาที กรุณากด “ลองเชื่อมต่อใหม่”':'ไม่สามารถติดต่อบริการบัญชีและตารางเวรได้ กรุณากด “ลองเชื่อมต่อใหม่” หรือติดต่อผู้ดูแลระบบ';if(retry){retry.disabled=false;retry.textContent='↻ ลองเชื่อมต่อใหม่';retry.onclick=()=>location.reload();}}
let authResponse,auth;
try{authResponse=await apiFetch('/api/session',{headers:authHeaders()});if(!authResponse.ok){location.replace('./');throw Error('Admin login required');}auth=await authResponse.json();}catch(error){if(error.message==='Admin login required')throw error;showConnectionError(error);throw error;}
if(!auth.owner){location.replace('./');throw Error('Admin login required');}
const $=id=>document.getElementById(id),months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],days=['อา','จ','อ','พ','พฤ','ศ','ส'],key='roster-studio-v1';
let state,mode='source',worker=null,cell=null,person=null,syncing=false,lastSync=0,syncPromise=null,preparing=false,cellCapacity=null,syncedRoster=null;
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Month strip: six months from the current Bangkok month, each month's work kept separately in this browser.
const archiveKey='roster-studio-months',MONTHS_SHOWN=6,MONTHS_MAX=12;let winStart=0;
function bangkokToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date()),part=t=>Number(parts.find(p=>p.type===t).value);return{year:part('year'),month:part('month')};}
const monthAt=o=>{const t=bangkokToday(),d=new Date(t.year,t.month-1+o,1);return{year:d.getFullYear(),month:d.getMonth()+1};},offsetOf=(y,m)=>{const t=bangkokToday();return(y-t.year)*12+m-t.month;},monthKey=(y,m)=>`${y}-${String(m).padStart(2,'0')}`;
function renderMonths(){const t=bangkokToday(),o=offsetOf(state.year,state.month);if(o>=0&&o<MONTHS_MAX){if(o<winStart)winStart=o;if(o>=winStart+MONTHS_SHOWN)winStart=o-MONTHS_SHOWN+1;}$('month-prev').disabled=o<=0;$('month-next').disabled=o>=MONTHS_MAX-1;$('month-tabs').innerHTML=Array.from({length:MONTHS_SHOWN},(_,i)=>monthAt(winStart+i)).map(m=>{const active=m.year===state.year&&m.month===state.month,now=m.year===t.year&&m.month===t.month;return`<button class="month-tab${active?' active':''}${now?' now':''}" data-ym="${m.year}-${m.month}" aria-pressed="${active}"><b>${months[m.month-1]}</b><small>พ.ศ. ${m.year+543}${now?' · เดือนนี้':''}</small></button>`;}).join('');}
function switchMonth(year,month){if(preparing||worker||(state.year===year&&state.month===month))return;let archive={};try{archive=JSON.parse(localStorage.getItem(archiveKey)||'{}');}catch{}archive[monthKey(state.year,state.month)]=state;let next=null,broken=false;try{if(archive[monthKey(year,month)])next=checkImport(archive[monthKey(year,month)]);}catch{broken=true;}if(!next)next={...clone(state),year,month,source:state.people.map(()=>({})),holidays:[],shifts:null,synced:{},locked:false,bookingRevision:null,excludedPersonIds:[]};try{localStorage.setItem(archiveKey,JSON.stringify(archive));}catch{notice('พื้นที่บันทึกในเครื่องเต็ม กรุณาสำรอง JSON',true);}state=next;mode=next.shifts?'result':'source';$('notice').hidden=true;save();render();if(broken)notice('ข้อมูลที่เก็บไว้ของเดือนนี้อ่านไม่ได้ จึงเริ่มเดือนใหม่จากรายชื่อเดิม',true);syncPreferences();}
function stepMonth(delta){const o=Math.min(Math.max(offsetOf(state.year,state.month)+delta,0),MONTHS_MAX-1),m=monthAt(o);switchMonth(m.year,m.month);}
function notice(text,error=false){$('notice').hidden=false;$('notice').textContent=text;$('notice').className=error?'error':'';}
function save(){try{localStorage.setItem(key,JSON.stringify(state));$('saved').textContent='บันทึกแล้วในเครื่องนี้';}catch{notice('พื้นที่บันทึกในเครื่องไม่พร้อมใช้งาน กรุณาสำรอง JSON',true);}}
function freshPerson(name,id){return{id,name,night:![6,8].includes(id),afternoon:true,addMorning:![6,8,12].includes(id),forbidNight:id===1?[1]:id===7?[4,5]:[],forbidAfternoon:id===1?[5]:[]};}
async function preset(name,ask=false){if(ask&&!confirm('โหลดตัวอย่างนี้แทนข้อมูลปัจจุบัน? แนะนำให้สำรอง JSON ก่อน'))return;if(worker)finish();const r=await fetch(apiBase+`/${name}.json`,{headers:authHeaders()});if(!r.ok)throw Error('โหลดตัวอย่างไม่ได้');const data=await r.json();state={version:1,year:name==='january'?2027:2026,month:name==='january'?1:12,people:data.names.map((n,i)=>freshPerson(n,i+1)),source:data.source,shifts:null,holidays:data.holidays,apart:[[6,8]],spacing:true,noNightAfterV:true,synced:{}};mode='source';save();render();if(ask)await syncPreferences();}
function visibleShifts(){
 return mode!=='source'&&state.shifts?state.shifts:initial(state,{regularMorning:false});
}
function render(){const c=calendar(state),check=validate(state),shifts=visibleShifts(),cs=counts(state,shifts),quota=monthlyQuota(c.total,state.people.length);$('title').textContent=`${months[state.month-1]} ${state.year+543}`;renderMonths();$('total').innerHTML=`${c.total} <small>ครั้ง</small>`;$('total-detail').textContent=`เช้าวันหยุด ${c.mornings} · บ่าย ${c.afternoons} · ดึก ${c.nights}`;$('target').innerHTML=`${quota.range} <small>เวรต่อคน</small>`;$('target-detail').textContent=`${c.total} เวร ÷ ${state.people.length} คน · วันปกติ ${c.days-c.off.length} · วันหยุด ${c.off.length}`;$('health').textContent=check.errors.length?`${check.errors.length} จุดต้องตรวจ`:'ผ่านเงื่อนไขหลัก';$('health').style.color=check.errors.length?'#ae695a':'';$('health-detail').textContent=check.errors.length?'ยังมีเวรไม่ครบหรือขัดกับเงื่อนไข':`ยอดรวม ${Math.min(...cs.map(c=>c.total))}–${Math.max(...cs.map(c=>c.total))} · ข้อสังเกต ${check.warnings.length}`;$('lock-count').textContent=state.source.reduce((n,row)=>n+Object.values(row).filter(Boolean).length,0);
 $('mode-note').textContent=mode==='source'?'แสดงเวรที่กำหนดไว้ รวมวันหยุด X และวันลา V':mode==='summary'?'นับเช้าวันหยุด + บ่าย + ดึก ไม่รวมเช้าวันปกติ':state.shifts?'แสดงผลจัดเวร รวมเวรเช้าประจำที่ระบบเติม':'แสดงเฉพาะเวรที่กำหนดไว้ กด “จัดเวรอัตโนมัติ” เพื่อเติมเวรในช่องว่าง';
 const preview=!!(state.shifts&&state.quotaPreview);
 if(preview&&mode==='result')$('mode-note').textContent='ตารางร่าง · จัดได้ '+check.counts.reduce((n,r)=>n+r.total,0)+' จาก '+c.total+' เวรนอกเวลา';
 if(mode==='summary')renderSummary(cs);else renderGrid(c,cs,shifts);
 $('holiday-days').innerHTML=Array.from({length:c.days},(_,i)=>{const d=i+1,w=[0,6].includes(c.dow(d)),h=state.holidays.includes(d);return`<button class="day-toggle ${h?'selected':w?'weekend-day':''}" data-holiday="${d}" aria-pressed="${h}" title="${days[c.dow(d)]} ${d}">${d}</button>`;}).join('');
 const ready=readiness(state),hasResult=!!state.shifts;
 $('issues-title').textContent=hasResult?'ตรวจตารางและข้อสังเกต':'ความพร้อมก่อนจัดเวร';
 if(!hasResult){$('health').textContent=ready.errors.length?`${ready.errors.length} จุดต้องแก้ก่อนจัด`:'ยังไม่ได้จัดเวร';$('health').style.color=ready.errors.length?'#ae695a':'';$('health-detail').textContent=ready.errors.length?'ตรวจเวรที่กำหนดเองด้านล่าง':`พร้อมเติมเวรอีก ${ready.remaining} ครั้ง`;}
 const shortfalls=preview?check.counts.flatMap((r,i)=>r.total<quota.min?[{message:`${state.people[i].name} ได้ ${r.total} เวร ขาด ${quota.min-r.total} เวรจากขั้นต่ำ ${quota.min}`}]:[]):[];
 const shown=hasResult?[...shortfalls,...check.errors]:ready.errors;
 if(preview){$('issues-title').textContent='จุดที่ยังขาดในตารางร่าง';$('health').textContent='ตารางร่าง';$('health-detail').textContent=shortfalls.map(v=>v.message).join(' · ')||check.errors[0]?.message||'';}
 else if(!hasResult&&ready.errors.length){
  $('health').textContent='จัดตารางร่างได้';$('health-detail').textContent='กดจัดเวรอัตโนมัติเพื่อดูตารางและยอดที่ยังขาด';
 }
 $('issues').innerHTML=[...(!hasResult?[`<p class="issue">ยังไม่ได้จัดเวรอัตโนมัติ · มีเวรที่ต้องเติม ${ready.remaining} ครั้ง</p><button class="button primary" id="generate-from-issues">✦ จัดเวรอัตโนมัติ</button>`]:[]),...(preview?shown:shown.slice(0,6)).map(v=>`<p class="issue error">${escape(v.message)}</p>`),...(!preview&&shown.length>6?[`<p class="muted">อีก ${shown.length-6} จุดที่ต้องตรวจ</p>`]:[]),...(hasResult?check.warnings.map(v=>`<p class="issue warning">${escape(v)}</p>`):[]),...(hasResult&&!check.errors.length?[`<p class="issue">บ่ายและดึกครบทุกวัน · คงเวรต้นฉบับและวันลา</p>`]:[]),...check.exceptions.map(v=>`<p class="issue">${escape(v)}</p>`)].join('');
 if($('generate-from-issues')){$('generate-from-issues').disabled=!!worker||preparing;$('generate-from-issues').onclick=()=>{$('generate').click();$('notice').scrollIntoView({behavior:'smooth',block:'center'});};}
 const options=state.people.map((p,i)=>'<option value="'+i+'">'+escape(p.name)+'</option>').join('');
 for(const id of ['rule-person','pair-first','pair-second'])$(id).innerHTML=options;
 $('pair-second').selectedIndex=Math.min(1,state.people.length-1);
 staffing(state).forEach((v,i)=>$('staff-'+i).value=v);
 $('rule-inputs').disabled=!!(state.locked||worker||preparing);
 renderPeople();renderActions();$('spacing').checked=state.spacing;$('no-v').checked=state.noNightAfterV;$('spacing').disabled=!!state.locked;$('no-v').disabled=!!state.locked;$('apart-editor').innerHTML=(state.apart||[]).map((pair,i)=>({pair,i})).filter(({pair})=>pair.every(id=>state.people.some(p=>p.id===id))).map(({pair,i})=>`<p>${pair.map(id=>escape(state.people.find(p=>p.id===id)?.name||'?')).join(' + ')} <button class="text-button" data-remove-pair="${i}">ยกเลิก</button></p>`).join('')||'<p>ยังไม่ได้กำหนดคู่ที่ห้ามบ่ายร่วมกัน</p>';
}
function renderGrid(c,cs,a){let html='<table><thead><tr><th class="name-cell">บุคลากร</th>';for(let d=1;d<=c.days;d++){
 const gaps=[];
 if(state.shifts&&mode==='result'){
  for(const [k,need,label] of requirements(state,c.off.includes(d))){
   const have=a.filter(row=>row[d][k]).length;
   if(have<need)gaps.push(label+' ขาด '+(need-have)+' คน');
  }
 }
 html+=`<th title="${gaps.join(' · ')}" class="${gaps.length?'short-day ':''}${state.holidays.includes(d)?'holiday-cell':c.off.includes(d)?'weekend':''}"><small>${days[c.dow(d)]}</small>${d}${gaps.length?'<small>ขาดเวร</small>':''}</th>`;}html+='<th>เช้าหยุด</th><th>บ่าย</th><th>ดึก</th><th class="sum">รวม</th></tr></thead><tbody>';
 state.people.forEach((p,i)=>{html+=`<tr><td class="name-cell"><small>${i+1}</small>${escape(p.name)}</td>`;for(let d=1;d<=c.days;d++){const v=mode==='source'?(state.source[i]?.[d]||'·'):display(state,i,d,a),locked=!!state.source[i]?.[d],extra=!locked&&/[บด]/.test(v)||!locked&&v==='ช'&&c.off.includes(d);html+=`<td tabindex="0" role="button" data-cell="${i},${d}" aria-label="${escape(p.name)} วันที่ ${d} ${escape(v)}" class="daycell ${v==='V'?'leave':state.holidays.includes(d)?'holiday-cell':c.off.includes(d)?'weekend':''} ${locked?'locked':extra?'assigned':v==='ช'?'regular-morning':''} ${v==='X'?'off-x':v==='–'||v==='·'?'rest':''}">${escape(v)}</td>`;}html+=`<td class="number">${cs[i].m}</td><td class="number">${cs[i].b}</td><td class="number">${cs[i].n}</td><td class="number sum">${cs[i].total}</td></tr>`;});
 html+='</tbody><tfoot>';
 for(const [label,shift] of [['บ่ายที่เลือกแล้ว',1,2],['ดึกที่เลือกแล้ว',2,1]]){
  html+=`<tr class="coverage"><th scope="row" class="name-cell">${label}</th>`;
  for(let d=1;d<=c.days;d++){
   const required=requirements(state,c.off.includes(d)).find(([k])=>k===shift)[1];
   const selected=a.filter(row=>row[d][shift]).length;
   const status=selected===required?'coverage-full':selected>required?'coverage-over':'';
   html+=`<td class="${status}">${selected}/${required}</td>`;
  }
  html+='<td></td><td></td><td></td><td class="sum"></td></tr>';
 }
 $('table').innerHTML=html+'</tfoot></table>';}

function openPersonalRoster(index){
 const member=state.people[index];
 if(!member)return;
 const {days:dayCount,dow,off}=calendar(state);
 const shifts=visibleShifts();
 const totals=counts(state,shifts)[index];
 $('personal-roster-title').textContent=member.name;
 $('personal-roster-month').textContent=months[state.month-1]+' พ.ศ. '+(state.year+543);
 $('personal-roster-status').textContent=state.locked?'ล็อกตารางแล้ว':!state.shifts?'เวรที่กำหนดไว้':state.quotaPreview?'ตารางร่าง':'ผลจัดเวร';
 $('personal-roster-totals').innerHTML=[
  ['เช้าปกติ',totals.regularMorning],['เช้าวันหยุด',totals.m],['บ่าย',totals.b],['ดึก',totals.n],['เวรนอกเวลารวม',totals.total]
 ].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('');
 const codes=Array.from({length:dayCount+1},(_,day)=>day?display(state,index,day,shifts):'');
 $('personal-roster-grid').innerHTML=personalCalendar({dayCount,dow,daysOff:off,holidays:state.holidays,shifts:codes,source:state.source[index]});
 $('personal-roster').showModal();
}
$('table').addEventListener('click',event=>{
 const button=event.target.closest('[data-personal-roster]');
 if(button&&mode==='summary')openPersonalRoster(Number(button.dataset.personalRoster));
});

function renderSummary(cs){const columns=[['regularMorning','เช้าปกติ'],['m','เช้าวันหยุด'],['b','บ่าย'],['n','ดึก'],['x','หยุด X'],['v','ลา V'],['total','รวมเวรนอกเวลา']];$('table').innerHTML='<table><thead><tr><th class="name-cell">บุคลากร</th>'+columns.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+state.people.map((p,i)=>`<tr><td class="name-cell"><button type="button" class="summary-person" data-personal-roster="${i}">${i+1}. ${escape(p.name)} <span aria-hidden="true">↗</span></button></td>${columns.map(([k])=>`<td class="${k==='total'?'sum':''}">${cs[i][k]}</td>`).join('')}</tr>`).join('')+'<tr><td class="name-cell">รวม</td>'+columns.map(([k])=>`<td class="${k==='total'?'sum':''}">${cs.reduce((n,c)=>n+c[k],0)}</td>`).join('')+'</tr></tbody></table>';}
function renderActions(){renderHistory();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('generate').disabled=!!worker||preparing||!!state.locked;$('publish-roster').disabled=!!worker||preparing||!!state.locked||!state.shifts||state.quotaPreview||validate(state).errors.length>0;$('publish-roster').hidden=!!state.locked;$('unlock-roster').hidden=!state.locked;$('unlock-roster').disabled=preparing;$('import-manual').hidden=mode!=='source'||!!state.locked;$('import-manual').disabled=!!worker||preparing;$('export').textContent=mode==='source'?'↓ แบบฟอร์ม CSV':'↓ ส่งออก CSV';$('export').onclick=mode==='source'?manualTemplateCSV:csv;if($('generate-from-issues'))$('generate-from-issues').disabled=!!worker||preparing;}
function renderPeople(){$('people-list').innerHTML=state.people.map((p,i)=>`<div class="person-row" role="button" tabindex="0" data-person="${i}"><div><strong>${i+1}. ${escape(p.name)}</strong> <em>${p.night?'รับดึก':'ไม่รับดึก'}</em>${!p.addMorning?'<em>ไม่เพิ่มเช้าวันหยุด</em>':''}</div><span>${p.forbidNight.length?'งดดึก '+p.forbidNight.map(d=>days[d]).join(', ')+' · ':''}${p.forbidAfternoon.length?'งดบ่าย '+p.forbidAfternoon.map(d=>days[d]).join(', '):''} แก้ไข ↗</span></div>`).join('');}
async function openCell(i,d){if(state.locked){notice('ตารางนี้บันทึกและล็อกแล้ว กดปลดล็อกตารางก่อนแก้ไข');return;}if(worker||preparing)return;const personId=state.people[i]?.id;if(!personId)return;cell={personId,d,month:cloudMonth()};const current=cell;cellCapacity=null;$('cell-title').textContent=`${state.people[i].name} · ${d} ${months[state.month-1]}`;const shown=mode==='result'&&state.shifts?display(state,i,d):'';$('cell-code').value=state.source[i]?.[d]||(codes.includes(shown)?shown:'');$('cell-save-error').hidden=true;$('save-cell').disabled=true;$('cell-dialog').showModal();
 try{const latest=await cloudRequest('/api/preferences?month='+cloudMonth()+'&person='+personId);if(cell!==current)return;cellCapacity=latest;checkCellCapacity();}catch(error){if(cell!==current)return;$('cell-save-error').textContent=error.message;$('cell-save-error').hidden=false;}
}
function checkCellCapacity(){if(!cellCapacity)return;const {personId,d}=cell,full=capacityConflict(cellCapacity,personId,{[d]:$('cell-code').value},cellCapacity.source);const quotaError=requestQuotaError(cellCapacity,cellCapacity.team,personId,cellCapacity.source,{...cellCapacity.source,[d]:$('cell-code').value});
 const error=full?`เวรที่ท่านเลือกเต็มแล้ว (วันที่ ${d} เวร${full.label})`:quotaError;
 $('save-cell').disabled=!!error;$('cell-save-error').hidden=!error;$('cell-save-error').textContent=error;}
$('cell-code').onchange=checkCellCapacity;
function saveEditedRoster(){
 if(state.shifts)state.quotaPreview=validate(state).errors.length>0;
 save();render();
}
function invalidate(){if(worker)finish();state.shifts=null;mode='source';save();render();notice('ปรับข้อมูลแล้ว กด “จัดเวรอัตโนมัติ” เพื่อจัดช่องที่เหลือ');}
function freshDraftPerson(){
 const ids=[...state.people.map(p=>p.id),...(state.excludedPersonIds||[])];
 return freshPerson('',Math.max(0,...ids)+1);
}
function openPerson(i){
 if(preparing||worker)return;
 if(state.locked)return notice('กรุณาปลดล็อกตารางก่อนแก้ไขบุคลากร');
 const p=i===null?freshDraftPerson():state.people[i];
 if(!p)return;
 person=i===null?null:p.id;
 $('person-save-error').hidden=true;
 $('person-name').value=p.name;
 $('p-night').checked=p.night;
 $('p-afternoon').checked=p.afternoon;
 $('p-morning').checked=p.addMorning;
 for(const[key,ban] of [['p-ban-b',p.forbidAfternoon],['p-ban-n',p.forbidNight]]){
  $(key).innerHTML=days.map((v,d)=>`<label><input type="checkbox" value="${d}" ${ban.includes(d)?'checked':''}>${v}</label>`).join('');
 }
 $('delete-person').hidden=person===null;
 $('person-dialog').showModal();
}
function removePersonRows(ids){
 const people=[],source=[];
 state.people.forEach((person,i)=>{
  if(ids.includes(person.id))return;
  people.push(person);
  source.push(state.source[i]);
 });
 if(people.length===state.people.length)return false;
 state.people=people;
 state.source=source;
 for(const id of ids)delete state.synced?.[id];
 return true;
}

function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(){const c=calendar(state),shifts=visibleShifts(),cs=counts(state,shifts),quote=v=>`"${String(v).replaceAll('"','""')}"`,rows=[['ตารางเวร',months[state.month-1],state.year+543],['ชื่อ',...Array.from({length:c.days},(_,i)=>`${i+1} ${days[c.dow(i+1)]}`),'เช้าปกติ','เช้าวันหยุด','บ่าย','ดึก','หยุด X','ลา V','รวมเวรนอกเวลา','เวรที่กำหนดเอง JSON'],...state.people.map((p,i)=>[p.name,...Array.from({length:c.days},(_,d)=>display(state,i,d+1,shifts)),cs[i].regularMorning,cs[i].m,cs[i].b,cs[i].n,cs[i].x,cs[i].v,cs[i].total,JSON.stringify(state.source[i]||{})])];download('\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8',`${state.shifts&&state.quotaPreview?'ตารางร่าง':'ตารางเวร'}_${state.month}_${state.year+543}.csv`);}
function manualTemplateCSV(){const c=calendar(state),quote=v=>`"${String(v).replaceAll('"','""')}"`,rows=[['ตารางเวร',months[state.month-1],state.year+543],['ชื่อ',...Array.from({length:c.days},(_,i)=>`${i+1} ${days[c.dow(i+1)]}`)],...state.people.map((p,i)=>[p.name,...Array.from({length:c.days},(_,d)=>state.source[i]?.[d+1]||'')])];download('\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8',`แบบฟอร์มเวร_${state.month}_${state.year+543}.csv`);}
function importManualCSV(text){
 const imported=parsePreferenceCSV(text,state),c=calendar(state);
 if(imported.days!==c.days)throw Error(`ไฟล์มีคอลัมน์วันที่ ${imported.days} วัน แต่เดือนนี้มี ${c.days} วัน`);
 if(imported.monthLabel||imported.yearLabel){
  const month=months.indexOf(imported.monthLabel)+1,year=Number(imported.yearLabel);
  if(month&&(month!==state.month||![state.year,state.year+543].includes(year)))throw Error(`ไฟล์เป็น ${imported.monthLabel} ${imported.yearLabel} แต่กำลังเปิด ${months[state.month-1]}`);
  if(!month||!Number.isFinite(year))throw Error('ข้อมูลเดือน/ปีในไฟล์ไม่ถูกต้อง');
 }
 if(imported.isRenderedExport&&!imported.hasManualSource){
  for(const [i,row] of imported.source.entries())for(const[d,value]of Object.entries(row)){
   const hasFixedMorning=state.source[i]?.[d]?.includes('ช');
   if(!c.off.includes(+d)&&value.includes('ช')&&!hasFixedMorning){
    const withoutMorning=value.split('/').filter(code=>code!=='ช').join('/');
    if(!withoutMorning)delete row[d];
    else if(codes.includes(withoutMorning))row[d]=withoutMorning;
   }
  }
  imported.total=imported.source.reduce((n,row)=>n+Object.values(row).filter(Boolean).length,0);
 }
 return imported;
}

function planManualCSV(imported){
 const partial=imported.people<state.people.length;
 const changes=[];
 let retained=0;
 const team=state.people.map((person,i)=>{
  if(!partial)return{id:person.id,source:imported.source[i]};
  const source={...state.source[i]};
  for(const[day,code]of Object.entries(imported.source[i])){
   if(source[day]){
    if(source[day]!==code)retained++;
    continue;
   }
   source[day]=code;
   changes.push({personId:person.id,day:Number(day),code});
  }
  return{id:person.id,source};
 });
 const cfg={year:state.year,month:state.month,holidays:state.holidays,team};
 for(const [i,person] of team.entries()){
  const quotaError=requestQuotaError(cfg,team,person.id,state.source[i]||{},person.source);
  if(quotaError)throw Error(state.people[i].name+' · '+quotaError);
  const conflict=capacityConflict(cfg,person.id,person.source,partial?state.source[i]:{});
  if(conflict)throw Error(`วันที่ ${conflict.day}: เวร${conflict.label}เกินจำนวน ${conflict.limit} คน`);
 }
 return{...imported,partial,changes,retained};
}
async function applyImportedManualCSV(imported){const removals=[],additions=[];for(let i=0;i<state.people.length;i++){const old=state.source[i]||{},next=imported.source[i]||{};for(const[d,value]of Object.entries(old))if(value&&next[d]!==value)removals.push({personId:state.people[i].id,day:+d,code:''});for(const[d,value]of Object.entries(next))if(value&&old[d]!==value)additions.push({personId:state.people[i].id,day:+d,code:value});}const changes=[...removals,...additions];for(let i=0;i<changes.length;i++){const item=changes[i];try{await cloudRequest('/api/overrides',{method:'POST',body:JSON.stringify({month:cloudMonth(),...item})});notice(`กำลังบันทึกเวรจากไฟล์ส่วนกลาง ${i+1}/${changes.length} ช่อง`);}catch(error){throw Error(`บันทึกเวรจากไฟล์ได้ ${i}/${changes.length} ช่องแล้ว · ${error.message}`);}}state.source=imported.source;state.shifts=null;mode='source';state.synced??={};save();render();if(!await syncPreferences())throw Error('บันทึกไฟล์แล้ว แต่โหลดสถานะส่วนกลางกลับมาไม่สำเร็จ กรุณากด “โหลดล่าสุด”');}
function checkImport(s){if(!s||!Array.isArray(s.people)||s.people.length<2||s.people.length>40||!Array.isArray(s.source)||s.source.length!==s.people.length||!Number.isInteger(s.year)||s.year<1900||s.year>2100||!Number.isInteger(s.month)||s.month<1||s.month>12||!Array.isArray(s.holidays))throw Error('JSON ไม่ตรงรูปแบบโปรแกรมนี้');const ids=new Set();s.people.forEach(p=>{if(!p||typeof p.name!=='string'||!p.name.trim()||ids.has(p.id)||![p.forbidNight,p.forbidAfternoon].every(Array.isArray)||![p.night,p.afternoon,p.addMorning].every(v=>typeof v==='boolean'))throw Error('ข้อมูลบุคลากรไม่ถูกต้อง');ids.add(p.id);});s.source.forEach(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.values(row).some(v=>!codes.includes(v)))throw Error('รหัสเวรใน JSON ไม่ถูกต้อง');});const c=calendar(s);if(s.holidays.some(d=>!Number.isInteger(d)||d<1||d>c.days))throw Error('วันหยุดไม่ถูกต้อง');if(s.shifts&&(!Array.isArray(s.shifts)||s.shifts.length!==s.people.length||s.shifts.some(row=>!Array.isArray(row)||row.length!==c.days+1||row.some(v=>!Array.isArray(v)||v.length!==3||v.some(b=>typeof b!=='boolean')))))throw Error('ตารางผลลัพธ์ใน JSON ไม่ถูกต้อง');return s;}
$('cell-code').innerHTML=codes.map(c=>`<option value="${c}">${c||'ช่องว่าง — ให้โปรแกรมจัด'}</option>`).join('');
document.addEventListener('click',e=>{const t=e.target.closest('[data-cell],[data-person],[data-holiday],[data-mode],[data-page],[data-preset],[data-remove-pair]');if(!t)return;if(t.dataset.cell){const[i,d]=t.dataset.cell.split(',').map(Number);openCell(i,d);}else if(t.dataset.person!==undefined)openPerson(+t.dataset.person);else if(t.dataset.holiday){const d=+t.dataset.holiday;saveHolidays(state.holidays.includes(d)?state.holidays.filter(v=>v!==d):[...state.holidays,d]);}else if(t.dataset.mode){mode=t.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===t));render();}else if(t.dataset.page){const page=t.dataset.page;['schedule','people','rules'].forEach(p=>$(p+'-page').hidden=p!==page);document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b===t));$('breadcrumb').textContent=t.textContent.trim();}else if(t.dataset.preset)preset(t.dataset.preset,true).catch(e=>notice(e.message,true));else if(t.dataset.removePair!==undefined){if(state.locked)return;state.apart.splice(+t.dataset.removePair,1);invalidate();}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-cell],[data-person]')){e.preventDefault();e.target.click();}});
$('save-cell').onclick=async e=>{
 e.preventDefault();
 if(!cellCapacity||$('save-cell').disabled||!$('cell-dialog').querySelector('form').reportValidity())return;
 const {personId,d,month}=cell,code=$('cell-code').value;
 const clearGenerated=mode==='result'&&!code;
 $('save-cell').disabled=true;$('cell-save-error').hidden=true;
 try{
  const result=await cloudRequest('/api/overrides',{method:'POST',body:JSON.stringify({month,personId,day:d,code})});
  if(month!==cloudMonth()||state.locked)return;
  const index=state.people.findIndex(p=>p.id===personId);
  if(index>=0&&!(state.synced?.[personId]>result.submittedAt)){
   applySourceRow(state,index,result.source,clearGenerated?d:null);
   state.synced??={};state.synced[personId]=result.submittedAt;
  }
  $('cell-dialog').close();
  saveEditedRoster();
  notice(state.shifts?'บันทึกแล้ว ตรวจยอดรายคนและจำนวนเวรที่ขาดในตารางได้เลย':'บันทึกเวรที่กำหนดเองแล้ว');
 }catch(error){$('cell-save-error').textContent=error.message;$('cell-save-error').hidden=false;}
 finally{$('save-cell').disabled=false;}
};
$('save-person').onclick=e=>{e.preventDefault();if(preparing||state.locked||!$('person-dialog').querySelector('form').reportValidity())return;const p=person===null?freshDraftPerson():state.people.find(p=>p.id===person);if(!p)return;p.name=$('person-name').value.trim();if(!p.name){notice('กรุณาระบุชื่อ',true);return;}p.night=$('p-night').checked;p.afternoon=$('p-afternoon').checked;p.addMorning=$('p-morning').checked;p.forbidAfternoon=[...$('p-ban-b').querySelectorAll('input:checked')].map(n=>+n.value);p.forbidNight=[...$('p-ban-n').querySelectorAll('input:checked')].map(n=>+n.value);if(person===null){state.people.push(p);state.source.push({});}$('person-dialog').close();invalidate();};
$('delete-person').onclick=async()=>{
 if(preparing||worker||state.locked||person===null)return;
 const selected=state.people.find(p=>p.id===person);
 if(!selected)return;
 const errorBox=$('person-save-error');
 const showError=message=>{errorBox.textContent=message;errorBox.hidden=false;};
 errorBox.hidden=true;
 if(state.people.length<=2){showError('เดือนนี้ต้องมีบุคลากรอย่างน้อย 2 คน');return;}
 const monthName=months[state.month-1]+' '+(state.year+543);
 if(!confirm(`นำ ${selected.name} ออกจากตารางเดือน ${monthName}?\nบัญชีผู้ใช้และเวรเดือนอื่นยังอยู่ในระบบ`))return;
 preparing=true;
 $('delete-person').disabled=true;
 $('save-person').disabled=true;
 renderActions();
 try{
  const month=cloudMonth();
  if(!await syncPreferences()||syncedRoster?.month!==month)throw Error('โหลดข้อมูลส่วนกลางไม่ได้ กรุณาลองใหม่');
  if(state.locked)throw Error('กรุณาปลดล็อกตารางก่อนนำบุคลากรออก');
  const id=selected.id;
  if(syncedRoster.personIds.has(id)){
   const update=await cloudRequest('/api/roster/person/remove',{
    method:'POST',body:JSON.stringify({month,personId:id,revision:state.bookingRevision})
   });
   state.excludedPersonIds=update.excludedPersonIds;
   state.bookingRevision=update.bookingRevision;
   removePersonRows(update.excludedPersonIds);
  }else if(!state.excludedPersonIds?.includes(id)){
   removePersonRows([id]);
   state.apart=(state.apart||[]).filter(pair=>!pair.includes(id));
  }
  $('person-dialog').close();
  invalidate();
  if(syncedRoster.personIds.has(id))await syncPreferences();
  notice(`นำ ${selected.name} ออกจากตารางเดือน ${monthName} แล้ว`);
 }catch(error){
  showError(error.message);
 }finally{
  preparing=false;
  $('delete-person').disabled=false;
  $('save-person').disabled=false;
  renderActions();
 }
};
$('rule-person-edit').onclick=()=>openPerson(+$('rule-person').value);
$('rule-save').onclick=()=>{
 if(state.locked||worker||preparing)return;
 const fields=Array.from({length:5},(_,i)=>$('staff-'+i));
 if(fields.some(f=>!f.reportValidity()))return;
 state.staffing=fields.map(f=>f.valueAsNumber);
 save();render();notice('บันทึกจำนวนคนแล้ว กดจัดเวรอัตโนมัติเพื่อใช้กับตารางใหม่');
};
$('pair-add').onclick=()=>{
 if(state.locked||worker||preparing)return;
 const pair=['pair-first','pair-second'].map(id=>state.people[+$(id).value].id);
 state.apart??=[];
 if(pair[0]===pair[1]||state.apart.some(p=>pair.every(id=>p.includes(id))))return notice('กรุณาเลือกสองคนต่างกันและยังไม่ได้จับคู่',true);
 state.apart.push(pair);save();render();
};
$('add-person').onclick=()=>openPerson(null);$('spacing').onchange=e=>{state.spacing=e.target.checked;invalidate();};$('no-v').onchange=e=>{state.noNightAfterV=e.target.checked;invalidate();};
$('backup').onclick=()=>download(JSON.stringify(state,null,2),'application/json',`จัดเวร_${state.month}_${state.year+543}.json`);
$('export').onclick=csv;
$('import-manual').onclick=()=>$('manual-file').click();
$('manual-file').onchange=async e=>{
 const input=e.target,file=input.files[0];
 if(!file||preparing||worker)return;
 preparing=true;
 renderActions();
 try{
  if(state.locked)throw Error('ตารางเดือนนี้ล็อกแล้ว กรุณาปลดล็อกก่อนนำเข้า');
  const text=await file.text();
  if(!await syncPreferences())throw Error('โหลดข้อมูลล่าสุดไม่ได้ กรุณาลองใหม่');
  if(state.locked)throw Error('ตารางเดือนนี้ล็อกแล้ว กรุณาปลดล็อกก่อนนำเข้า');
  const plan=planManualCSV(importManualCSV(text));
  const retained=plan.retained?` คงเวรเดิมที่ต่างจากไฟล์ ${plan.retained} ช่อง` : '';
  if(plan.partial&&!plan.changes.length){
   notice('ไฟล์นี้ไม่มีเวรใหม่สำหรับเติมในช่องว่าง'+retained);
   return;
  }
  const oldExport=plan.isRenderedExport&&!plan.hasManualSource
   ? '\n\nไฟล์ผลลัพธ์รุ่นเก่าไม่มีข้อมูลเวรที่ล็อกจริง เวรเช้าปกติที่ระบบเติมอัตโนมัติจะไม่ถูกล็อกซ้ำ' : '';
  const action=plan.partial
   ? `เติมเฉพาะช่องว่าง ${plan.changes.length} ช่อง เก็บเวรเดิมและข้อมูลของคนที่ไม่มีชื่อในไฟล์ไว้${retained}`
   : 'เวรที่กำหนดเองและความประสงค์เดิมของทั้งทีมในเดือนนี้จะถูกแทนที่ ช่องว่างในไฟล์จะเปิดให้โปรแกรมจัดเวร';
  const message=`นำเข้าไฟล์ ${file.name}\nเดือน ${months[state.month-1]} ${state.year+543}\nบุคลากร ${plan.people}/${state.people.length} คน · วันที่ ${plan.days} วัน${oldExport}\n\n${action}\n\nยืนยันนำเข้า?`;
  if(!confirm(message))return;
  if(plan.partial){
   const result=await cloudRequest('/api/overrides/import-missing',{
    method:'POST',body:JSON.stringify({month:cloudMonth(),revision:state.bookingRevision,changes:plan.changes})
   });
   if(!await syncPreferences())throw Error('บันทึกเวรแล้ว แต่โหลดสถานะส่วนกลางกลับมาไม่สำเร็จ กรุณากด “โหลดล่าสุด”');
   notice(`นำเข้าเวรใหม่ ${result.count} ช่องแล้ว${retained}`);
  }else{
   await applyImportedManualCSV(plan);
   notice(`นำเข้าและบันทึกเวรส่วนกลาง ${plan.total} ช่องแล้ว ตรวจข้อสังเกตก่อนจัดเวรต่อ`);
  }
 }catch(error){
  if(/บันทึกเวรจากไฟล์ได้/.test(error.message))await syncPreferences();
  notice('นำเข้าเวรไม่ได้: '+error.message,true);
 }finally{
  preparing=false;
  input.value='';
  renderActions();
 }
};
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const imported=checkImport(JSON.parse(await f.text()));if(confirm('นำเข้าข้อมูลแทนตารางปัจจุบัน?')){state=imported;mode=state.shifts?'result':'source';save();render();notice('นำเข้าข้อมูลแล้ว');syncPreferences();}}catch(error){notice('นำเข้าไม่ได้: '+error.message,true);}e.target.value='';};$('validate').onclick=()=>{render();notice('ตรวจเงื่อนไขล่าสุดแล้ว ดูรายละเอียดในส่วนข้อสังเกต');};
function historyKey(){return 'roster-history-'+cloudMonth();}
function rosterHistory(){return JSON.parse(localStorage.getItem(historyKey())||'[]');}
function rememberCurrent(){
 if(!state.shifts)return;
 const entries=rosterHistory();
 const entry={at:new Date().toISOString(),ids:state.people.map(p=>p.id),shifts:state.shifts,source:state.source};
 entries.push(entry);
 localStorage.setItem(historyKey(),JSON.stringify(entries));
}
function renderHistory(){
 const select=$('roster-history');
 if(!select)return;
 let entries=[];
 try{entries=rosterHistory();}catch{}
 select.hidden=!entries.length;
 select.disabled=!!worker||preparing||state.locked;
 select.innerHTML='<option value="">เรียกตารางรอบก่อน</option>'+entries.map((r,i)=>`<option value="${i}">รอบที่ ${i+1} · ${new Date(r.at).toLocaleTimeString('th-TH')}</option>`).reverse().join('');
}
$('roster-history').onchange=e=>{
 if(e.target.value===''||worker||preparing||state.locked)return;
 try{
  const entry=rosterHistory()[Number(e.target.value)];
  if(JSON.stringify(entry.ids)!==JSON.stringify(state.people.map(p=>p.id)))throw Error('รายชื่อเดือนนี้เปลี่ยนแล้ว จึงเรียกตารางชุดนี้กลับมาไม่ได้');
  rememberCurrent();
  const current=state.source;
  state.shifts=entry.shifts;state.source=entry.source;
  current.forEach((row,i)=>applySourceRow(state,i,row));
  mode='result';saveEditedRoster();notice('เรียกตารางรอบก่อนแล้ว โดยใช้เวรที่ล็อกล่าสุด');
 }catch(error){notice(error.message,true);}
 e.target.value='';
};
function finish(){worker?.terminate();worker=null;$('generate').disabled=false;if($('generate-from-issues'))$('generate-from-issues').disabled=false;$('generate').textContent='✦ จัดเวรอัตโนมัติ';$('cancel').hidden=true;}
$('generate').onclick=async()=>{
 if(worker||preparing||state.locked)return;
 preparing=true;renderActions();$('generate').textContent='กำลังโหลดความประสงค์…';notice('กำลังโหลดความประสงค์ล่าสุดก่อนจัดเวร');
 try{
  if(!await syncPreferences())throw Error('ยังเริ่มจัดเวรไม่ได้ เพราะโหลดความประสงค์ล่าสุดไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่หากหมดเวลา');
  if(state.locked)throw Error('ตารางนี้บันทึกและล็อกแล้ว กรุณาปลดล็อกก่อนจัดใหม่');
  const {year,month,people,source,holidays,apart,spacing,noNightAfterV}=state;
  const input=clone({staffing:staffing(state),year,month,people,source,holidays,apart,spacing,noNightAfterV});
  worker=new Worker(new URL('./worker.mjs?v=rules3',import.meta.url),{type:'module'});
  $('generate').textContent='กำลังจัดเวร…';$('cancel').hidden=false;notice('กำลังจัดเวรให้ครบทุกวัน โดยคงเวรที่กำหนดไว้');
  const fail=message=>{finish();notice(message+(state.shifts?' · ยังแสดงผลจากรอบก่อน':''),true);$('notice').scrollIntoView({behavior:'smooth',block:'center'});};
  worker.onmessage=e=>{const r=e.data;if(r.type==='progress')notice(`กำลังจัดเวร · ตรวจแล้ว ${r.tries} ทางเลือก · เหลือ ${r.remaining} เวรในร่างที่ใกล้ที่สุด`);else if(r.type==='done'){
   const check=validate(input,r.shifts);
   const preview=check.errors.length>0;
   let comparison='';
   if(state.shifts){
    let changed=0;
    r.shifts.forEach((row,i)=>row.slice(1).forEach((shift,d)=>{
     if(shift.some((value,k)=>value!==state.shifts[i][d+1][k]))changed++;
    }));
    comparison=changed?` · เวรเปลี่ยนจากรอบก่อน ${changed} ช่อง`:' · คำนวณใหม่แล้ว ได้เวรตรงกับรอบก่อนทุกช่อง';
   }
   try{rememberCurrent();}catch{ return fail('พื้นที่เก็บประวัติไม่พร้อม ตารางเดิมยังอยู่'); }
   comparison+=' · '+r.solver;
   state.shifts=r.shifts;state.quotaPreview=preview;mode='result';finish();save();render();
   if(preview){notice('เปิดตารางร่างแล้ว ดูยอดรายคนและเวรที่ยังขาดใต้ตาราง'+comparison);$('table').closest('.schedule-panel').scrollIntoView({behavior:'smooth',block:'start'});}
   else notice('จัดเวรเสร็จแล้ว บ่าย 2 คน ดึก 1 คนครบทุกวัน และยอดรวมต่างกันไม่เกิน 1 ครั้ง'+comparison);
  }else fail(r.message||'จัดเวรไม่สำเร็จ กรุณาลองใหม่');};
  worker.onerror=()=>fail('โหลดโปรแกรมจัดเวรไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วกดจัดเวรอีกครั้ง');
  worker.postMessage(input);
 }catch(error){finish();notice(error.message,true);$('notice').scrollIntoView({behavior:'smooth',block:'center'});}
 finally{preparing=false;renderActions();if($('generate-from-issues'))$('generate-from-issues').disabled=!!worker;}
};$('cancel').onclick=()=>{finish();notice('หยุดค้นหาแล้ว ตารางเดิมยังคงอยู่');};
try{const saved=localStorage.getItem(key);if(saved){state=checkImport(JSON.parse(saved));if(state.shifts)mode='result';render();}else await preset('january');}catch{await preset('january');notice('เริ่มด้วยตัวอย่างมกราคม 2570 คุณสามารถสำรองข้อมูลเป็น JSON ได้');}
const cloudMonth=()=>`${state.year}-${String(state.month).padStart(2,'0')}`;
async function cloudRequest(path,options={}){const r=await apiFetch(path,{...options,headers:{...authHeaders(),...(options.body?{'content-type':'application/json'}:{})}});let j;try{j=await r.json();}catch{throw Error('บริการรับความประสงค์ยังไม่พร้อมใช้งาน');}if(!r.ok)throw Error(j.error||'เชื่อมต่อไม่ได้');return j;}
$('admin-logout').onclick=async()=>{try{await cloudRequest('/api/logout',{method:'POST'});}catch{}sessionStorage.removeItem('roster-session');location.replace('./');};
// Submitted preferences lock into the table on their own: a person's row is replaced only when they send a newer submission.
const sameRow=(a,b)=>{const x=Object.entries(a).filter(([,v])=>v);return x.length===Object.values(b).filter(Boolean).length&&x.every(([d,v])=>b[d]===v);};
function renderSync(status){const sent=status.filter(p=>p.submittedAt),wait=status.filter(p=>!p.submittedAt),last=sent.map(p=>p.submittedAt).sort().at(-1);$('sync-bar').classList.remove('error');$('sync-bar').classList.toggle('complete',!wait.length);$('sync-title').textContent=`ส่งความประสงค์แล้ว ${sent.length}/${status.length} คน`;$('sync-detail').textContent=(last?`ส่งล่าสุด ${new Date(last).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})} · `:'')+'เวรที่ส่งมาจะล็อกในตารางให้อัตโนมัติ';$('sync-pending').innerHTML=wait.length?'<span>ยังไม่ส่ง</span>'+wait.map(p=>`<em>${escape(p.name)}</em>`).join(''):'<span class="done">✓ ครบทุกคนแล้ว</span>';}
function syncPreferences(){if(syncPromise)return syncPromise;if(worker)return Promise.resolve(false);syncPromise=loadPreferences().finally(()=>syncPromise=null);return syncPromise;}
async function saveHolidays(holidays){
 if(preparing||worker||state.locked)return;
 const month=cloudMonth();
 preparing=true;
 try{
  if(syncPromise)await syncPromise;
  if(month!==cloudMonth()||syncedRoster?.month!==month)throw Error('กรุณาโหลดข้อมูลเดือนนี้ก่อนบันทึกวันหยุด');
  const saved=await cloudRequest('/api/roster/holidays',{method:'POST',body:JSON.stringify({month,revision:state.bookingRevision,holidays})});
  state.holidays=saved.holidays;
  state.bookingRevision=saved.bookingRevision;
  $('share-holidays').hidden=true;
  invalidate();
  notice('บันทึกวันหยุดและปรับโควตาของเดือนนี้ให้ทั้งทีมแล้ว');
 }catch(error){notice(error.message,true);}
 finally{preparing=false;renderActions();}
}
$('share-holidays').onclick=()=>saveHolidays(state.holidays);
async function loadPreferences(){
 syncing=true;
 $('sync-now').disabled=true;
 const month=cloudMonth();
 try{
  const result=await cloudRequest('/api/aggregate?month='+month);
  if(month!==cloudMonth())return false;
  const {people,source,status,published,bookingRevision,excludedPersonIds=[]}=result;
  syncedRoster={month,personIds:new Set(people.map(p=>p.id))};
  state.bookingRevision=bookingRevision;
  state.excludedPersonIds=excludedPersonIds;
  if(published){
   $('share-holidays').hidden=true;
   state={...published.state,excludedPersonIds,synced:Object.fromEntries(status.map(p=>[p.id,p.submittedAt])),locked:true,bookingRevision,rosterRevision:published.revision,publishedAt:published.publishedAt};
   mode='result';
   save();
   render();
   renderSync(status);
   $('sync-title').textContent='ตารางบันทึกและล็อกแล้ว';
   $('sync-detail').textContent='ทุกคนเห็นตารางเดียวกัน · '+new Date(state.publishedAt).toLocaleString('th-TH');
   $('sync-pending').innerHTML='';
   lastSync=Date.now();
   return true;
  }
  const differentHolidays=state.holidays.length!==result.holidays.length||state.holidays.some(d=>!result.holidays.includes(d));
  const useShared=differentHolidays&&(result.sharedHolidays||!state.holidays.length);
  if(useShared)state.holidays=result.holidays;
  $('share-holidays').hidden=useShared||!differentHolidays;
  const removed=removePersonRows(excludedPersonIds);
  if(removed)state.shifts=null;
  const wasLocked=state.locked;
  if(wasLocked){state.locked=false;mode='result';}
  state.synced??={};
  const fresh=[];
  let added=false;
  people.forEach((person,k)=>{
   const i=state.people.findIndex(p=>p.id===person.id);
   const at=status[k]?.submittedAt;
   const row={...source[k]};
   if(i<0){
    state.people.push({...freshPerson(person.name,person.id),...person});
    state.source.push(row);
    if(at)state.synced[person.id]=at;
    added=true;
    return;
   }
   if(!wasLocked&&(!at||(state.synced[person.id]&&state.synced[person.id]>=at)))return;
   state.synced[person.id]=at;
   if(!sameRow(row,state.source[i]||{})){
    applySourceRow(state,i,row);
    fresh.push(person.name);
   }
  });
  lastSync=Date.now();
  renderSync(status);
  if(useShared||removed||added){
   invalidate();
   if(removed)notice('อัปเดตรายชื่อบุคลากรของเดือนนี้แล้ว');
  }else if(fresh.length||wasLocked){
   saveEditedRoster();
   if(fresh.length)notice(`อัปเดตเวรที่แก้ของ ${fresh.join(', ')} แล้ว`);
  }else{
   save();
  }
  return true;
 }catch(error){
  $('sync-bar').classList.add('error');
  $('sync-title').textContent='โหลดความประสงค์ไม่ได้';
  $('sync-detail').textContent=error.message;
  return false;
 }finally{
  syncing=false;
  $('sync-now').disabled=false;
 }
}
$('month-prev').onclick=()=>stepMonth(-1);$('month-next').onclick=()=>stepMonth(1);$('month-tabs').onclick=e=>{const b=e.target.closest('[data-ym]');if(b){const[y,m]=b.dataset.ym.split('-').map(Number);switchMonth(y,m);}};
$('sync-now').onclick=syncPreferences;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!preparing&&Date.now()-lastSync>60000)syncPreferences();});syncPreferences();

$('publish-roster').onclick=async()=>{if(preparing||worker||state.locked)return;preparing=true;renderActions();try{if(!await syncPreferences())throw Error('โหลดความประสงค์ล่าสุดไม่สำเร็จ');if(state.locked)return;if(state.shifts&&validate(state).errors.length)throw Error('กรุณาตรวจจุดที่ยังขาดหรือขัดเงื่อนไขก่อนล็อกตาราง');if(!state.shifts)throw Error('มีความประสงค์เปลี่ยนแปลง กรุณาจัดเวรใหม่ก่อนบันทึก');await cloudRequest('/api/roster',{method:'POST',body:JSON.stringify({month:cloudMonth(),state:clone(state),revision:state.bookingRevision})});await syncPreferences();notice('บันทึกและล็อกตารางแล้ว เภสัชกรทุกคนเห็นตารางเดียวกันและแก้เวรไม่ได้');}catch(error){notice(error.message,true);}finally{preparing=false;renderActions();}};
$('unlock-roster').onclick=async()=>{if(preparing||!state.locked)return;preparing=true;renderActions();try{await cloudRequest('/api/roster/unlock',{method:'POST',body:JSON.stringify({month:cloudMonth(),revision:state.bookingRevision})});if(!await syncPreferences())throw Error('ปลดล็อกแล้ว กรุณาโหลดล่าสุดเพื่อตรวจสถานะ');notice('ปลดล็อกแล้ว แก้ไขตารางที่จัดไว้ได้ เมื่อเสร็จให้บันทึกและล็อกอีกครั้ง');}catch(error){notice(error.message,true);}finally{preparing=false;renderActions();}};

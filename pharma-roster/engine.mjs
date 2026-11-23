export const codes=['','ช','บ','ด','ช/บ','ด/ช','ด/ช/บ','X','V'];
export const clone=x=>JSON.parse(JSON.stringify(x));
export function parsePreferenceCSV(text,s){
 const rows=[];let row=[],field='',quoted=false;const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('ไฟล์ CSV มีเครื่องหมายคำพูดไม่ครบ');if(field||row.length){row.push(field);if(row.some(v=>v.trim()))rows.push(row);}
 const h=rows.findIndex(r=>['ชื่อ','บุคลากร','ชื่อ-สกุล'].includes(r[0]?.trim()));if(h<0)throw Error('ไม่พบหัวตาราง ชื่อ,1,2,... กรุณาใช้แบบฟอร์มจากโปรแกรม');
 const header=rows[h],days=calendar(s).days,mapping=[],manualSourceColumn=header.findIndex(v=>v.trim()==='เวรที่กำหนดเอง JSON'),isRenderedExport=header.some(v=>['เช้าปกติ','รวมเวรนอกเวลา'].includes(v.trim()));const seenDays=new Set();for(let j=1;j<header.length;j++){const v=header[j].trim();if(!/^\d+(\s|$)/.test(v))continue;const d=parseInt(v,10);if(d<1||d>days)throw Error(`วันที่ ${d} ไม่มีในเดือนนี้`);if(seenDays.has(d))throw Error(`หัววันที่ ${d} ซ้ำ`);seenDays.add(d);mapping.push([j,d]);}if(!mapping.length)throw Error('ไม่พบคอลัมน์วันที่');
 const source=s.people.map(()=>({})),seen=new Set();let total=0;const normalizeName=v=>v.trim().replace(/^\d+[.\s]+/,'').trim();
 for(const r of rows.slice(h+1)){if(!r[0]?.trim()||r[0].trim()==='รวม')continue;const name=normalizeName(r[0]),i=s.people.findIndex(p=>p.name===name);if(i<0)throw Error(`ไม่พบรายชื่อ “${name}” กรุณาเพิ่มหรือแก้รายชื่อบุคลากรให้ตรงก่อน`);if(seen.has(i))throw Error(`ชื่อ ${name} ซ้ำในไฟล์`);seen.add(i);for(const[j,d]of mapping){let v=(r[j]||'').trim();if(['-','–','·'].includes(v))v='';v=v.replace(/\s/g,'').toUpperCase();if(!['X','V',''].includes(v)){const tokens=v.split('/');if(tokens.length!==new Set(tokens).size||tokens.some(t=>!['ช','บ','ด'].includes(t)))throw Error(`${name} วันที่ ${d}: รหัสเวร “${v}” ไม่ถูกต้อง`);v=['ด','ช','บ'].filter(t=>tokens.includes(t)).join('/');}if(!codes.includes(v))throw Error(`${name} วันที่ ${d}: ไม่รองรับ “${v}”`);if(v){source[i][d]=v;total++;}}if(manualSourceColumn>=0){let stored;try{stored=JSON.parse(r[manualSourceColumn]||'{}');}catch{throw Error(`${name}: ข้อมูลเวรที่กำหนดเองในไฟล์ไม่ถูกต้อง`);}if(!stored||typeof stored!=='object'||Array.isArray(stored))throw Error(`${name}: ข้อมูลเวรที่กำหนดเองในไฟล์ไม่ถูกต้อง`);const clean={};for(const[d,v]of Object.entries(stored)){if(!/^\d+$/.test(d)||+d<1||+d>days||!codes.includes(v))throw Error(`${name}: ข้อมูลเวรที่กำหนดเองวันที่ ${d} ไม่ถูกต้อง`);if(v)clean[d]=v;}source[i]=clean;}}
 if(!seen.size)throw Error('ไม่มีแถวข้อมูลบุคลากร');if(manualSourceColumn>=0)total=source.reduce((n,row)=>n+Object.values(row).filter(Boolean).length,0);const metadata=rows.find(r=>r[0]?.trim()==='ตารางเวร');return{source,total,people:seen.size,days:seenDays.size,monthLabel:metadata?.[1]?.trim()||null,yearLabel:metadata?.[2]?.trim()||null,isRenderedExport,hasManualSource:manualSourceColumn>=0};
}
export function calendar(s){const days=new Date(s.year,s.month,0).getDate(),dow=d=>new Date(s.year,s.month-1,d).getDay(),off=Array.from({length:days},(_,i)=>i+1).filter(d=>[0,6].includes(dow(d))||s.holidays.includes(d));return{days,dow,off,total:days*3+off.length*2};}
export function monthlyQuota(total, people){
 const min=Math.floor(total/people),max=Math.ceil(total/people);
 return {min,max,range:min===max?String(min):min+'–'+max};
}
export function requestedOvertime(off, source){
 let count=0;
 for(const [day,code] of Object.entries(source)){
  if(code.includes('บ'))count++;
  if(code.includes('ด'))count++;
  if(code.includes('ช')&&off.includes(Number(day)))count++;
 }
 return count;
}
export function requestQuotaError(config,team,personId,previous,next){
 const people=team.length;
 const {off,total}=calendar(config),{min,max}=monthlyQuota(total,people);
 const count=requestedOvertime(off,next),prior=requestedOvertime(off,previous);
 if(count<=prior)return '';
 if(count>max){
  return `ขอเวรได้สูงสุด ${max} เวรต่อคนในเดือนนี้ (${total} เวร ÷ ${people} คน) รายการนี้จะทำให้รวมเป็น ${count} เวร`;
 }
 if(count>min&&prior<=min){
  const upperPlaces=total%people;
  const used=team.filter(p=>p.id!==personId&&requestedOvertime(off,p.source)>min).length;
  if(used>=upperPlaces)return `เดือนนี้มีผู้ขอครบ ${max} เวรแล้ว ${upperPlaces} คน จากยอดรวม ${total} เวร คุณขอได้สูงสุด ${min} เวร`;
 }
 return '';
}
function shiftParts(code,regularMorning){
 if(code==='X'||code==='V')return [false,false,false];
 return [code.includes('ช')||regularMorning,code.includes('บ'),code.includes('ด')];
}
export function applySourceRow(s,i,row,clearDay=null){
 const old=s.source[i]||{};
 if(s.shifts){
  const {off,days}=calendar(s);
  for(let d=1;d<=days;d++){
   const code=row[d]||'';
   if((old[d]||'')!==code||d===clearDay)s.shifts[i][d]=shiftParts(code,!off.includes(d));
  }
 }
 s.source[i]=row;
}
export function initial(s,{regularMorning=true}={}){
 const {days,off}=calendar(s);
 return s.people.map((_,i)=>Array.from({length:days+1},(_,d)=>{
  if(!d)return [false,false,false];
  const v=s.source[i]?.[d]||'';
  return shiftParts(v,regularMorning&&!off.includes(d));
 }));
}
export function display(s,i,d,shifts=s.shifts){
 const v=s.source[i]?.[d];
 if(!shifts||v==='X'||v==='V')return v||'–';
 const [morning,afternoon,night]=shifts[i][d];
 return [night&&'ด',morning&&'ช',afternoon&&'บ'].filter(Boolean).join('/')||'–';
}
export function counts(s,a=s.shifts||initial(s)){const c=calendar(s);return s.people.map((p,i)=>{const m=c.off.filter(d=>a[i][d][0]).length,b=a[i].slice(1).filter(v=>v[1]).length,n=a[i].slice(1).filter(v=>v[2]).length;return{m,b,n,regularMorning:a[i].slice(1).filter((v,d)=>!c.off.includes(d+1)&&v[0]).length,x:Object.values(s.source[i]||{}).filter(v=>v==='X').length,v:Object.values(s.source[i]||{}).filter(v=>v==='V').length,total:m+b+n};});}
// Shift indexes are 1 for afternoon and 2 for night. The day is the first day of the pair.
export function approvedPair(s,i,day,first,second){
 if(s.year!==2026||s.month!==12||second!==1)return false;
 const id=s.people[i].id;
 if(id===8)return first===1&&(day===2||day===17);
 return id===9&&((first===1&&day===8)||(first===2&&(day===14||day===28)));
}
export function validate(s,a=s.shifts||initial(s)){
 const{days,dow,off}=calendar(s),errors=[],warnings=[],exceptions=[];const add=(message,i,d)=>errors.push({message,i,d});
 const original=(i,d)=>s.source[i]?.[d]||'',oh=(i,d)=>/[บด]/.test(original(i,d));
 for(let d=1;d<=days;d++){
  for(const[k,need,label]of [[1,2,'บ่าย'],[2,1,'ดึก'],...(off.includes(d)?[[0,2,'เช้าวันหยุด']]:[])]){const n=a.filter(row=>row[d]?.[k]).length;if(n!==need)add(`วันที่ ${d}: ${label} ${n}/${need} คน`,null,d);}
  for(const pair of s.apart||[]){const i=s.people.findIndex(p=>p.id===pair[0]),j=s.people.findIndex(p=>p.id===pair[1]);if(i>=0&&j>=0&&a[i][d][1]&&a[j][d][1])add(`${s.people[i].name} และ ${s.people[j].name} มีบ่ายร่วมกันวันที่ ${d}`,i,d);}
  s.people.forEach((p,i)=>{
   const v=original(i,d),r=a[i][d],name=p.name;
   if(['X','V'].includes(v)&&r.some(Boolean))add(`${name} วันที่ ${d}: มีเวรในวัน ${v}`,i,d);
   if(v==='ช'&&(r[1]||r[2]))add(`${name} วันที่ ${d}: ช่อง ช ต้องเป็นเช้าอย่างเดียว`,i,d);
   ['ช','บ','ด'].forEach((t,k)=>{if(v.includes(t)&&!r[k])add(`${name} วันที่ ${d}: เวรเดิม ${t} หายไป`,i,d);});
   if(!off.includes(d)&&!['X','V'].includes(v)&&!r[0])add(`${name} วันที่ ${d}: ขาดเช้าวันปกติ`,i,d);
   if(!p.night&&r[2])add(`${name} วันที่ ${d}: ไม่รับดึก`,i,d);
   if(!p.afternoon&&r[1])add(`${name} วันที่ ${d}: ไม่รับบ่าย`,i,d);
   if(!p.addMorning&&off.includes(d)&&r[0]&&!v.includes('ช'))add(`${name} วันที่ ${d}: ไม่รับเช้าวันหยุดเพิ่ม`,i,d);
   if(r[2]&&p.forbidNight.includes(dow(d)))add(`${name} วันที่ ${d}: ดึกตรงวันที่ไม่รับ`,i,d);
   if(r[1]&&p.forbidAfternoon.includes(dow(d)))add(`${name} วันที่ ${d}: บ่ายตรงวันที่ไม่รับ`,i,d);
   if(s.noNightAfterV&&r[2]&&original(i,d-1)==='V')add(`${name} วันที่ ${d}: ดึกต่อจาก V`,i,d);
   if(r[1]&&r[2]&&!(v.includes('บ')&&v.includes('ด')))add(`${name} วันที่ ${d}: มีบ่ายและดึกที่ไม่ได้กำหนดเอง`,i,d);
   if(s.spacing&&d<days&&(r[1]||r[2])&&(a[i][d+1][1]||a[i][d+1][2])){if([1,2].every(k=>!r[k]||[1,2].every(next=>!a[i][d+1][next]||approvedPair(s,i,d,k,next))))exceptions.push(`${name}: คู่เวรที่อนุญาต ${d}–${d+1}`);
    else if(oh(i,d)&&oh(i,d+1))exceptions.push(`${name}: เวรเดิมติดกัน ${d}–${d+1}`);else add(`${name}: เวรบ่าย/ดึกติดกัน ${d}–${d+1}`,i,d);}
   if(d<days&&r.every(Boolean)&&a[i][d+1][0]&&!['ช','บ','ด'].every(t=>v.includes(t)))add(`${name}: สามเวรต่อเช้า ${d}–${d+1}`,i,d);
  });
 }
 const cs=counts(s,a),ts=cs.map(c=>c.total);if(Math.max(...ts)-Math.min(...ts)>1){
  if(errors.length===0){
   const quota=monthlyQuota(calendar(s).total,s.people.length);
   add(`ตารางที่จัดครบแล้วต้องมีเวรนอกเวลา ${quota.range} เวรต่อคน`,null,null);
  }else warnings.push('ยอดเวรรวมต่างกันเกิน 1 ครั้ง');
 }
 const ns=cs.filter((_,i)=>s.people[i].night).map(c=>c.n);if(ns.length&&Math.max(...ns)-Math.min(...ns)>1)warnings.push('เวรดึกต่างกันเกิน 1 ครั้ง โปรดดูเวรที่กำหนดไว้และยอดรวมรายคน');
 return{errors,warnings,exceptions:[...new Set(exceptions)],counts:cs};
}
class Flow{constructor(n){this.g=Array.from({length:n},()=>[]);}add(u,v,c){const e={v,c,r:null},r={v:u,c:0,r:e};e.r=r;this.g[u].push(e);this.g[v].push(r);return e;}run(s,t){let n=0;while(true){const q=[s],prev=new Map([[s,null]]);for(let pos=0;pos<q.length&&!prev.has(t);pos++){const u=q[pos];for(const e of this.g[u])if(e.c&&!prev.has(e.v)){prev.set(e.v,[u,e]);q.push(e.v);}}if(!prev.has(t))return n;for(let v=t;v!==s;){const[u,e]=prev.get(v);e.c--;e.r.c++;v=u;}n++;}}}
function fixedShiftEligibility(s, c, base, counts, ceiling){
 const indexById=new Map(s.people.map((person,index)=>[person.id,index]));
 const afternoonConflicts=s.people.map(()=>[]);
 for(const [firstId,secondId] of s.apart||[]){
  const first=indexById.get(firstId),second=indexById.get(secondId);
  if(first===undefined||second===undefined)continue;
  afternoonConflicts[first].push(second);
  afternoonConflicts[second].push(first);
 }

 const hasOvertime=(i,d)=>base[i][d]?.[1]||base[i][d]?.[2];
 return (i,d,k)=>{
  const person=s.people[i], original=s.source[i]?.[d]||'';
  if(counts[i].total>=ceiling||original==='X'||original==='V')return false;
  if(k===0)return person.addMorning&&!base[i][d][0];
  if(original==='ช'||hasOvertime(i,d))return false;
  if(s.spacing&&[1,2].some(other=>
   (base[i][d-1]?.[other]&&!approvedPair(s,i,d-1,other,k))||
   (base[i][d+1]?.[other]&&!approvedPair(s,i,d,k,other))))return false;
  if(k===2){
   return person.night&&!person.forbidNight.includes(c.dow(d))&&!(s.noNightAfterV&&s.source[i]?.[d-1]==='V');
  }
  return person.afternoon&&!person.forbidAfternoon.includes(c.dow(d))&&
   !afternoonConflicts[i].some(other=>base[other][d][1]);
 };
}

export function readiness(s){
 const c=calendar(s), base=initial(s), check=validate(s,base);
 const errors=check.errors.filter(error=>error.i!==null), missing=[];
 const {min:floor,max:ceiling,range}=monthlyQuota(c.total,s.people.length);
 const canTake=fixedShiftEligibility(s,c,base,check.counts,ceiling);
 const capacity=s.people.map(()=>ceiling);
 const potential=s.people.map(()=>({mornings:0,overtimeDays:new Set()}));
 for(let d=1;d<=c.days;d++){
  const required=[[1,2,'บ่าย'],[2,1,'ดึก']];
  if(c.off.includes(d))required.push([0,2,'เช้าวันหยุด']);
  for(const [k,need,label] of required){
   const have=base.filter(row=>row[d][k]).length;
   if(have>need)errors.push({message:`วันที่ ${d}: กำหนด${label}ไว้ ${have} คน เกินจำนวน ${need} คน`,d,i:null});
   if(have>=need)continue;
   const count=need-have, candidates=[];
   for(let i=0;i<s.people.length;i++){
    if(!canTake(i,d,k))continue;
    candidates.push(i);
    if(k===0)potential[i].mornings++;
    else potential[i].overtimeDays.add(d);
   }
   missing.push({d,k,count,candidates});
   if(candidates.length<count){
    errors.push({message:`วันที่ ${d}: เวร${label}ยังขาด ${count} คน แต่มีผู้ลงได้ ${candidates.length} คนตามเวรเดิมและข้อจำกัด`,d,i:null});
   }
  }
 }
 check.counts.forEach(({total},i)=>{
  const name=s.people[i].name;
  if(total>ceiling){
   errors.push({message:`${name} มีเวรเดิม ${total} ครั้ง เกินเป้า ${ceiling} ครั้ง กรุณาปรับเวรที่กำหนดเองก่อน`,i});
   return;
  }
  if(total>=floor)return;
  const {mornings,overtimeDays}=potential[i];
  let extraOvertime=0,last=-Infinity;
  for(const d of overtimeDays){
   if(!s.spacing||d>last+1||approvedPair(s,i,last,1,1)||approvedPair(s,i,last,2,1)){extraOvertime++;last=d;}
  }
  const maximum=total+mornings+extraOvertime;
  capacity[i]=Math.min(ceiling,maximum);
  if(maximum<floor){
   errors.push({kind:'quota-shortfall',message:`${name} ยังขาดอย่างน้อย ${floor-maximum} เวรเพื่อให้ถึงเป้า ${range} เวรต่อคนของเดือนนี้ เมื่อคงเวรเดิมและข้อจำกัด จะจัดได้ไม่เกิน ${maximum} เวร`,i});
  }
 });
 const highCount=c.total-floor*s.people.length;
 if(floor!==ceiling&&check.counts.filter(({total})=>total>floor).length>highCount){
  errors.push({message:`มีบุคลากรล็อกไว้เกิน ${floor} เวรมากกว่า ${highCount} คน จึงกระจายยอดให้ต่างกันไม่เกิน 1 ครั้งไม่ได้`,i:null});
 }
 return {errors,missing,capacity,remaining:missing.reduce((sum,slot)=>sum+slot.count,0)};
}
function searchRoster(s,base,missing,limits,{nightRange,deadline,progress,vacancies=0}){
 const groups=[],choices=[],values=[],trail=[];
 const dayCount=base[0].length;
 const totals=limits.map(({min,max})=>addGroup(min,max));
 const nightLoads=counts(s,base).map(({n})=>n);
 const nights=nightLoads.map((n,i)=>nightRange && s.people[i].night
  ? addGroup(Math.max(0,nightRange.min-n),nightRange.max-n)
  : null);
 const overtime=s.people.map(()=>Array.from({length:dayCount},()=>[]));
 const afternoons=Array.from({length:dayCount},()=>new Map());
 const daily=new Set();
 const vacancyGroup=vacancies?addGroup(0,vacancies):null;
 let filled=0;

 function addGroup(min,max){
  const id=groups.length;
  groups.push({min,max,assigned:0,open:0,choices:[]});
  return id;
 }
 function addChoice(i,d,k,ids){
  const id=choices.length;
  choices.push({i,d,k,groups:ids,conflicts:[]});
  values.push(0);
  for(const g of ids){
   groups[g].choices.push(id);
   groups[g].open++;
  }
  return id;
 }
 function excludeTogether(a,b){
  choices[a].conflicts.push(b);
  choices[b].conflicts.push(a);
 }
 for(const {d,k,count,candidates} of missing){
  const dayGroup=addGroup(count,count);
  daily.add(dayGroup);
  if(vacancies){
   for(let n=0;n<count;n++)addChoice(null,d,-1,[dayGroup,vacancyGroup]);
  }
  for(const i of candidates){
   const ids=[dayGroup,totals[i]];
   if(k===2&&nights[i]!==null)ids.push(nights[i]);
   const id=addChoice(i,d,k,ids);
   if(k>0)overtime[i][d].push(id);
   if(k===1)afternoons[d].set(s.people[i].id,id);
  }
 }
 for(const row of overtime){
  for(let d=1;d<dayCount;d++){
   const current=row[d];
   for(let a=0;a<current.length;a++){
    for(let b=a+1;b<current.length;b++)excludeTogether(current[a],current[b]);
    if(s.spacing&&d+1<dayCount){
     for(const next of row[d+1]){
      const first=choices[current[a]],second=choices[next];
      if(!approvedPair(s,first.i,d,first.k,second.k))excludeTogether(current[a],next);
     }
    }
   }
  }
 }
 for(const [first,second] of s.apart||[]){
  for(const byPerson of afternoons){
   if(first!==second&&byPerson.has(first)&&byPerson.has(second))excludeTogether(byPerson.get(first),byPerson.get(second));
  }
 }

 function propagate(choice,value){
  const dirty=new Set();
  function assign(id,next){
   if(values[id])return values[id]===next;
   values[id]=next;
   trail.push(id);
   const candidate=choices[id];
   if(next===1){
    filled++;
    if(candidate.k===2)nightLoads[candidate.i]++;
   }
   for(const g of candidate.groups){
    const group=groups[g];
    group.open--;
    if(next===1)group.assigned++;
    dirty.add(g);
   }
   if(next===1){
    for(const blocked of candidate.conflicts){
     if(!assign(blocked,-1))return false;
    }
   }
   return true;
  }
  if(choice===null)groups.forEach((_,id)=>dirty.add(id));
  else if(!assign(choice,value))return false;
  for(const id of dirty){
   dirty.delete(id);
   const group=groups[id];
   if(group.assigned>group.max||group.assigned+group.open<group.min)return false;
   const forced=group.assigned===group.max?-1:group.assigned+group.open===group.min?1:0;
   if(forced){
    for(const id of group.choices){
     if(!values[id]&&!assign(id,forced))return false;
    }
   }
  }
  return true;
 }
 function undo(mark){
  while(trail.length>mark){
   const id=trail.pop(),wasChosen=values[id]===1;
   values[id]=0;
   const candidate=choices[id];
   if(wasChosen){
    filled--;
    if(candidate.k===2)nightLoads[candidate.i]--;
   }
   for(const g of candidate.groups){
    groups[g].open++;
    if(wasChosen)groups[g].assigned--;
   }
  }
 }
 function nextChoice(){
  let selected=null,tightest=Infinity;
  for(const [id,group] of groups.entries()){
   const need=group.min-group.assigned;
   if(need<=0)continue;
   const slack=(group.open-need)/need;
   if(slack<tightest||(slack===tightest&&daily.has(id))){
    selected=group;
    tightest=slack;
   }
  }
  if(!selected)return null;
  let best=null,bestScore=-Infinity;
  for(const id of selected.choices){
   if(values[id])continue;
   if(choices[id].i===null){
    if(best===null)best=id;
    continue;
   }
   const {i,k,groups:members,conflicts}=choices[id],total=groups[totals[i]];
   const need=Math.max(0,total.min-total.assigned);
   const pressure=need/Math.max(1,total.open);
   const blocks=conflicts.reduce((n,other)=>n+(values[other]===0),0);
   const day=groups[members[0]],dayPressure=(day.min-day.assigned)/day.open;
   const score=pressure*3+dayPressure-blocks*0.08-(k===2?nightLoads[i]*0.45:0);
   if(score>bestScore){best=id;bestScore=score;}
  }
  return best;
 }
 function visit(){
  if(!progress.step(filled,deadline))return false;
  const id=nextChoice();
  if(id===null)return true;
  const before=trail.length;
  for(const value of [1,-1]){
   if(propagate(id,value)&&visit())return true;
   undo(before);
   if(Date.now()>=deadline)return false;
  }
  return false;
 }
 if(Date.now()>=deadline)return {shifts:null,complete:false};
 if(!propagate(null,0))return {shifts:null,complete:true};
 if(!visit())return {shifts:null,complete:Date.now()<deadline};
 const shifts=clone(base);
 for(const [id,{i,d,k}] of choices.entries()){
  if(i!==null&&values[id]===1)shifts[i][d][k]=true;
 }
 return {shifts,complete:true};
}

function checkSharedCapacity(missing,limits){
 const personStart=1,slotStart=personStart+limits.length,sink=slotStart+missing.length;
 const available=new Flow(sink+1),required=new Flow(sink+1);
 let shifts=0,minimum=0;
 for(const [i,{min,max}] of limits.entries()){
  available.add(personStart+i,sink,max);
  required.add(0,personStart+i,min);
  minimum+=min;
 }
 for(const [i,{count,candidates}] of missing.entries()){
  available.add(0,slotStart+i,count);
  required.add(slotStart+i,sink,count);
  shifts+=count;
  for(const person of candidates){
   available.add(slotStart+i,personStart+person,1);
   required.add(personStart+person,slotStart+i,1);
  }
 }
 const coverage=available.run(0,sink);
 if(coverage<shifts)throw Error('ผู้ที่ลงเวรได้เติมได้สูงสุด '+coverage+' จาก '+shifts+' เวร ภายใต้เวรที่ล็อกไว้และเพดานเวรต่อคน');
 const sharedMinimum=required.run(0,sink);
 if(sharedMinimum<minimum)throw Error('ช่องเวรที่ลงได้ทับกันระหว่างบุคลากร จึงเติมได้ '+sharedMinimum+' จาก '+minimum+' เวรที่ต้องใช้เพื่อให้ทุกคนถึงยอดขั้นต่ำ');
}

// A review copy may have vacancies or a short monthly total. All assignments still use the normal eligibility checks.
function previewUnderQuota(s,ready,deadline){
 const c=calendar(s),base=initial(s),fixed=counts(s,base);
 const {min,max}=monthlyQuota(c.total,s.people.length);
 let best=base,bestFilled=-1,bestDeficit=Infinity,bestNightSpread=Infinity;
 for(let pass=0;pass<32;pass++){
  const shifts=clone(base),loads=fixed.map(row=>({...row}));
  const canTake=fixedShiftEligibility(s,c,shifts,loads,max);
  const pending=ready.missing.map(slot=>({...slot}));
  let filled=0;
  while(pending.length){
   let selected=-1,options=[],tightest=Infinity;
   for(const [index,slot] of pending.entries()){
    const available=slot.candidates.filter(i=>canTake(i,slot.d,slot.k));
    const slack=available.length-slot.count;
    if(slack<tightest){
     selected=index;options=available;tightest=slack;
    }
   }
   const slot=pending[selected];
   if(options.length){
    const weight=i=>loads[i].total+2*(ready.capacity[i]-max)+(slot.k===2?loads[i].n*0.35:0);
    options.sort((a,b)=>weight(a)-weight(b));
    const pool=options.filter(i=>weight(i)<=weight(options[0])+(pass%3)*0.5);
    const i=pool[(pass*7+filled*13+slot.d)%pool.length];
    shifts[i][slot.d][slot.k]=true;
    loads[i].total++;
    if(slot.k===2)loads[i].n++;
    filled++;
    slot.count--;
   }
   if(!options.length||!slot.count)pending.splice(selected,1);
  }
  const deficit=loads.reduce((n,l)=>n+Math.max(0,min-l.total),0);
  const nightLoads=loads.filter((_,i)=>s.people[i].night).map(l=>l.n);
  const spread=nightLoads.length?Math.max(...nightLoads)-Math.min(...nightLoads):0;
  if(filled>bestFilled||(filled===bestFilled&&(deficit<bestDeficit||(deficit===bestDeficit&&spread<bestNightSpread)))){
   best=shifts;bestFilled=filled;bestDeficit=deficit;bestNightSpread=spread;
  }
 }
 // Try to cover more vacancies while bringing each person as close as possible to the monthly minimum.
 const limits=fixed.map((r,i)=>({min:Math.max(0,Math.min(min,ready.capacity[i])-r.total),max:max-r.total}));
 const unavoidable=Math.max(0,c.total-ready.capacity.reduce((n,v)=>n+v,0));
 const holes=ready.remaining-bestFilled;
 for(let vacancies=unavoidable;vacancies<=holes&&Date.now()<deadline;vacancies++){
  const result=searchRoster(s,base,ready.missing,limits,{
   vacancies,nightRange:null,deadline,progress:{step:()=>Date.now()<deadline}
  });
  if(result.shifts)return result.shifts;
 }
 return best;
}

function shuffleForSearch(items){
 for(let i=items.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [items[i],items[j]]=[items[j],items[i]];
 }
}

export function solve(s,{timeMs=22000,onProgress=()=>{},allowQuotaPreview=false}={}){
 const began=Date.now(),deadline=began+timeMs;
 const {total,days}=calendar(s),people=s.people.length;
 if(people<2)throw Error('ต้องมีบุคลากรอย่างน้อย 2 คน');
 const ready=readiness(s);
 // Only change the search order among available assignments; locks and eligibility are already resolved.
 shuffleForSearch(ready.missing);
 for(const slot of ready.missing)shuffleForSearch(slot.candidates);
 if(allowQuotaPreview&&ready.errors.length){
  const shifts=previewUnderQuota(s,ready,Math.min(deadline,began+1800));
  return shifts;
 }
 if(ready.errors.length)throw Error('จัดเวรไม่ได้: '+ready.errors.slice(0,4).map(e=>e.message).join(' · '));

 const base=initial(s),fixed=counts(s,base);
 const {min:floor,max:ceil}=monthlyQuota(total,people);
 const limits=fixed.map(({total})=>({min:Math.max(0,floor-total),max:ceil-total}));
 try{checkSharedCapacity(ready.missing,limits);}
 catch(error){
  if(allowQuotaPreview)return previewUnderQuota(s,ready,Date.now()+1800);
  throw error;
 }

 const fixedNights=fixed.filter((_,i)=>s.people[i].night).map(({n})=>n);
 let tries=0,lowest=Infinity,lastProgress=0;
 const progress={step(filled,until){
  const now=Date.now();
  tries++;
  const remaining=ready.remaining-filled;
  lowest=Math.min(lowest,remaining);
  if(now>=until)return false;
  if(now-lastProgress>=180||lowest===0){
   onProgress({tries,remaining:lowest});
   lastProgress=now;
  }
  return true;
 }};

 // Start with the smallest night spread and reserve time for a search without a night range.
 // Daily coverage, locked assignments and total balance are hard requirements in every pass.
 let result={shifts:null,complete:false};
 if(fixedNights.length){
  const min=Math.floor(days/fixedNights.length),max=Math.ceil(days/fixedNights.length);
  const balancedUntil=Math.min(deadline,began+Math.floor(timeMs*0.55));
  const ranges=[{min,max},{min:Math.max(0,min-1),max},{min,max:max+1}];
  for(const nightRange of ranges){
   if(Date.now()>=balancedUntil)break;
   if(fixedNights.some(n=>n>nightRange.max))continue;
   if(fixedNights.reduce((sum,n)=>sum+Math.max(n,nightRange.min),0)>days)continue;
   const passUntil=Math.min(balancedUntil,Date.now()+Math.max(1,Math.floor(timeMs*0.19)));
   result=searchRoster(s,base,ready.missing,limits,{nightRange,deadline:passUntil,progress});
   if(result.shifts)break;
  }
 }
 if(!result.shifts)result=searchRoster(s,base,ready.missing,limits,{nightRange:null,deadline,progress});
 if(result.shifts){
  const check=validate(s,result.shifts);
  if(check.errors.length)throw Error('ตารางที่ได้ไม่ผ่านการตรวจซ้ำ: '+check.errors[0].message);
  if(check.warnings.some(message=>message.startsWith('ยอดเวรรวม')))throw Error('ตารางที่ได้กระจายยอดรวมต่างกันเกิน 1 ครั้ง');
  return result.shifts;
 }
 if(allowQuotaPreview)return previewUnderQuota(s,ready,Date.now()+1800);
 if(result.complete)throw Error('จัดเวรไม่ได้ด้วยชุดเงื่อนไขนี้ แม้จำนวนคนที่ลงได้รายวันจะพอ แต่เมื่อรวมเวรที่ล็อกไว้ ข้อจำกัดรายบุคคล และเป้าต่อคนแล้วไม่มีตารางที่ผ่านครบ');
 const closest=Number.isFinite(lowest)?' ร่างที่ใกล้ที่สุดยังขาด '+lowest+' เวร':'';
 throw Error('ค้นหาตารางไม่เสร็จในเวลาที่กำหนด (ตรวจ '+tries+' ทางเลือก)'+closest+' ยังยืนยันไม่ได้ว่าชุดเงื่อนไขนี้ไม่มีคำตอบ');
}

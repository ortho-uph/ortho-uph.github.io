export const codes=['','ช','บ','ด','ช/บ','ด/ช','ด/ช/บ','X','V'];
export const clone=x=>JSON.parse(JSON.stringify(x));
export function parsePreferenceCSV(text,s){
 const rows=[];let row=[],field='',quoted=false;const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('ไฟล์ CSV มีเครื่องหมายคำพูดไม่ครบ');if(field||row.length){row.push(field);if(row.some(v=>v.trim()))rows.push(row);}
 const h=rows.findIndex(r=>['ชื่อ','บุคลากร','ชื่อ-สกุล'].includes(r[0]?.trim()));if(h<0)throw Error('ไม่พบหัวตาราง ชื่อ,1,2,... กรุณาใช้แบบฟอร์มจากโปรแกรม');
 const header=rows[h],days=calendar(s).days,mapping=[];const seenDays=new Set();for(let j=1;j<header.length;j++){const v=header[j].trim();if(!/^\d+(\s|$)/.test(v))continue;const d=parseInt(v,10);if(d<1||d>days)throw Error(`วันที่ ${d} ไม่มีในเดือนนี้`);if(seenDays.has(d))throw Error(`หัววันที่ ${d} ซ้ำ`);seenDays.add(d);mapping.push([j,d]);}if(!mapping.length)throw Error('ไม่พบคอลัมน์วันที่');
 const source=s.people.map(()=>({})),seen=new Set();let total=0;const normalizeName=v=>v.trim().replace(/^\d+[.\s]+/,'').trim();
 for(const r of rows.slice(h+1)){if(!r[0]?.trim()||r[0].trim()==='รวม')continue;const name=normalizeName(r[0]),i=s.people.findIndex(p=>p.name===name);if(i<0)throw Error(`ไม่พบรายชื่อ “${name}” กรุณาเพิ่มหรือแก้รายชื่อบุคลากรให้ตรงก่อน`);if(seen.has(i))throw Error(`ชื่อ ${name} ซ้ำในไฟล์`);seen.add(i);for(const[j,d]of mapping){let v=(r[j]||'').trim();if(['-','–','·'].includes(v))v='';v=v.replace(/\s/g,'').toUpperCase();if(!['X','V',''].includes(v)){const tokens=v.split('/');if(tokens.length!==new Set(tokens).size||tokens.some(t=>!['ช','บ','ด'].includes(t)))throw Error(`${name} วันที่ ${d}: รหัสเวร “${v}” ไม่ถูกต้อง`);v=['ด','ช','บ'].filter(t=>tokens.includes(t)).join('/');}if(!codes.includes(v))throw Error(`${name} วันที่ ${d}: ไม่รองรับ “${v}”`);if(v){source[i][d]=v;total++;}}}
 if(!seen.size)throw Error('ไม่มีแถวข้อมูลบุคลากร');return{source,total,people:seen.size,days:seenDays.size};
}
export function calendar(s){const days=new Date(s.year,s.month,0).getDate(),dow=d=>new Date(s.year,s.month-1,d).getDay(),off=Array.from({length:days},(_,i)=>i+1).filter(d=>[0,6].includes(dow(d))||s.holidays.includes(d));return{days,dow,off,total:days*3+off.length*2};}
export function initial(s){const{days,off}=calendar(s);return s.people.map((p,i)=>Array.from({length:days+1},(_,d)=>{if(!d)return[false,false,false];const v=s.source[i]?.[d]||'';if(['X','V'].includes(v))return[false,false,false];return[v.includes('ช')||!off.includes(d),v.includes('บ'),v.includes('ด')];}));}
export function display(s,i,d){const v=s.source[i]?.[d];if(v==='X'||v==='V')return v;const a=(s.shifts||initial(s))[i][d];return ['ด','ช','บ'].filter(t=>a[{ช:0,บ:1,ด:2}[t]]).join('/')||'–';}
export function counts(s,a=s.shifts||initial(s)){const c=calendar(s);return s.people.map((p,i)=>{const m=c.off.filter(d=>a[i][d][0]).length,b=a[i].slice(1).filter(v=>v[1]).length,n=a[i].slice(1).filter(v=>v[2]).length;return{m,b,n,regularMorning:a[i].slice(1).filter((v,d)=>!c.off.includes(d+1)&&v[0]).length,x:Object.values(s.source[i]||{}).filter(v=>v==='X').length,v:Object.values(s.source[i]||{}).filter(v=>v==='V').length,total:m+b+n};});}
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
   if(s.spacing&&d<days&&(r[1]||r[2])&&(a[i][d+1][1]||a[i][d+1][2])){if(oh(i,d)&&oh(i,d+1))exceptions.push(`${name}: เวรเดิมติดกัน ${d}–${d+1}`);else add(`${name}: เวรบ่าย/ดึกติดกัน ${d}–${d+1}`,i,d);}
   if(d<days&&r.every(Boolean)&&a[i][d+1][0]&&!['ช','บ','ด'].every(t=>v.includes(t)))add(`${name}: สามเวรต่อเช้า ${d}–${d+1}`,i,d);
  });
 }
 const cs=counts(s,a),ts=cs.map(c=>c.total);if(Math.max(...ts)-Math.min(...ts)>1)warnings.push('ยอดเวรรวมต่างกันเกิน 1 ครั้ง');
 const ns=cs.filter((_,i)=>s.people[i].night).map(c=>c.n);if(ns.length&&Math.max(...ns)-Math.min(...ns)>1)warnings.push('เวรดึกต่างกันเกิน 1 ครั้ง โปรดดูเวรที่กำหนดไว้และยอดรวมรายคน');
 return{errors,warnings,exceptions:[...new Set(exceptions)],counts:cs};
}
class Flow{constructor(n){this.g=Array.from({length:n},()=>[]);}add(u,v,c){const e={v,c,r:null},r={v:u,c:0,r:e};e.r=r;this.g[u].push(e);this.g[v].push(r);return e;}run(s,t){let n=0;while(true){const q=[s],prev=new Map([[s,null]]);for(let pos=0;pos<q.length&&!prev.has(t);pos++){const u=q[pos];for(const e of this.g[u])if(e.c&&!prev.has(e.v)){prev.set(e.v,[u,e]);q.push(e.v);}}if(!prev.has(t))return n;for(let v=t;v!==s;){const[u,e]=prev.get(v);e.c--;e.r.c++;v=u;}n++;}}}
export function readiness(s){
 const c=calendar(s),base=initial(s),check=validate(s,base),errors=check.errors.filter(e=>e.i!==null),missing=[];
 for(let d=1;d<=c.days;d++)for(const[k,need,label]of [[1,2,'บ่าย'],[2,1,'ดึก'],...(c.off.includes(d)?[[0,2,'เช้าวันหยุด']]:[])]){
  const have=base.filter(r=>r[d][k]).length;if(have>need)errors.push({message:`วันที่ ${d}: กำหนด${label}ไว้ ${have} คน เกินจำนวน ${need} คน`,d,i:null});
  if(have<need)missing.push({d,k,count:need-have});
 }
 const ceiling=Math.ceil(c.total/s.people.length);check.counts.forEach((n,i)=>{if(n.total>ceiling)errors.push({message:`${s.people[i].name} มีเวรเดิม ${n.total} ครั้ง เกินเป้า ${ceiling} ครั้ง กรุณาปรับเวรที่กำหนดเองก่อน`,i});});
 return{errors,missing,remaining:missing.reduce((n,v)=>n+v.count,0)};
}
const pick=a=>a[Math.floor(Math.random()*a.length)],shuffle=a=>a.sort(()=>Math.random()-.5);
export function solve(s,{timeMs=22000,onProgress=()=>{}}={}){
 const{days,dow,off,total}=calendar(s),P=s.people.length,base=initial(s),source=(i,d)=>s.source[i]?.[d]||'',fixed=(i,d,k)=>['ช','บ','ด'][k]&&source(i,d).includes(['ช','บ','ด'][k]);
 if(P<2)throw Error('ต้องมีบุคลากรอย่างน้อย 2 คน');
 const ready=readiness(s);if(ready.errors.length)throw Error('จัดเวรไม่ได้: '+ready.errors.slice(0,4).map(e=>e.message).join(' · '));
 const floor=Math.floor(total/P),ceil=Math.ceil(total/P),start=Date.now();
 for(let i=0;i<P;i++){const c=counts(s,base)[i];if(c.total>ceil)throw Error(`${s.people[i].name} มีเวรเดิม ${c.total} ครั้ง เกินเป้า ${ceil} ครั้ง กรุณาปรับเวรที่กำหนดเองก่อน`);}
 function can(i,d,k,a){const p=s.people[i],v=source(i,d);if(['X','V','ช'].includes(v)||a[i][d][1]||a[i][d][2])return false;if(k===2){if(!p.night||p.forbidNight.includes(dow(d))||(s.noNightAfterV&&source(i,d-1)==='V'))return false;}else{if(!p.afternoon||p.forbidAfternoon.includes(dow(d)))return false;for(const pair of s.apart||[]){const mate=pair[0]===p.id?pair[1]:pair[1]===p.id?pair[0]:null,j=s.people.findIndex(p=>p.id===mate);if(j>=0&&a[j][d][1])return false;}}return true;}
 function allocate(k,target,a){const sink=P+days+1,f=new Flow(sink+1),edges=[];let need=0;for(const i of shuffle(Array.from({length:P},(_,i)=>i))){const n=target[i]-a[i].slice(1).filter(v=>v[k]).length;if(n<0)return false;need+=n;f.add(0,i+1,n);}for(const d of shuffle(Array.from({length:days},(_,i)=>i+1))){const n=(k===1?2:1)-a.filter(r=>r[d][k]).length;if(n<0)return false;f.add(P+d,sink,n);for(const i of shuffle(Array.from({length:P},(_,i)=>i)))if(can(i,d,k,a))edges.push([i,d,f.add(i+1,P+d,1)]);}if(f.run(0,sink)!==need)return false;for(const[i,d,e]of edges)if(!e.c)a[i][d][k]=true;return true;}
 function bads(a){if(!s.spacing)return[];const bad=[];for(let i=0;i<P;i++)for(let d=1;d<days;d++)if((a[i][d][1]||a[i][d][2])&&(a[i][d+1][1]||a[i][d+1][2])&&!(/[บด]/.test(source(i,d))&&/[บด]/.test(source(i,d+1))))bad.push([i,d]);return bad;}
 let tries=0,closest=Infinity;
 while(Date.now()-start<timeMs){tries++;const a=clone(base),minimum=counts(s,a),targets=Array(P).fill(floor),high=total-floor*P,forced=minimum.map((v,i)=>v.total>floor?i:-1).filter(i=>i>=0);if(forced.length>high)throw Error('เวรที่กำหนดเองทำให้แบ่งยอดต่างกันไม่เกิน 1 ไม่ได้');const win=[...forced,...shuffle(Array.from({length:P},(_,i)=>i).filter(i=>!forced.includes(i))).slice(0,high-forced.length)];win.forEach(i=>targets[i]=ceil);
  let possible=true;
  for(const d of off){let missing=2-a.filter(r=>r[d][0]).length;if(missing<0)throw Error(`วันที่ ${d} มีเช้าที่กำหนดไว้เกิน 2 คน`);const candidates=shuffle(Array.from({length:P},(_,i)=>i).filter(i=>s.people[i].addMorning&&!a[i][d][0]&&!['X','V'].includes(source(i,d))&&counts(s,a)[i].total<targets[i]));if(candidates.length<missing){possible=false;break;}for(const i of candidates.slice(0,missing))a[i][d][0]=true;}
  if(!possible)continue;
  const cs=counts(s,a),nt=cs.map(c=>c.n),max=cs.map((c,i)=>s.people[i].night?targets[i]-c.m-c.b:0);let remaining=days-nt.reduce((v,n)=>v+n,0);if(max.some((v,i)=>v<nt[i]))continue;
  while(remaining>0){const candidates=Array.from({length:P},(_,i)=>i).filter(i=>s.people[i].night&&nt[i]<max[i]);if(!candidates.length){possible=false;break;}const low=Math.min(...candidates.map(i=>nt[i]));nt[pick(candidates.filter(i=>nt[i]===low))]++;remaining--;}
  if(!possible)continue;const bt=cs.map((c,i)=>targets[i]-c.m-nt[i]);if(!allocate(2,nt,a)||!allocate(1,bt,a))continue;
  for(let it=0;it<90000&&Date.now()-start<timeMs;it++){
   const bad=bads(a);if(bad.length<closest){closest=bad.length;onProgress({tries,remaining:closest});}
   if(!bad.length){const check=validate(s,a);if(!check.errors.length&&!check.warnings.some(v=>v.startsWith('ยอด')))return a;break;}
   let i,d,k;if(Math.random()<.92){[i,d]=pick(bad);d+=Math.random()<.5?0:1;const ks=[1,2].filter(k=>a[i][d][k]&&!fixed(i,d,k));if(!ks.length)continue;k=pick(ks);}else{i=Math.floor(Math.random()*P);d=1+Math.floor(Math.random()*days);k=pick([1,2]);if(!a[i][d][k]||fixed(i,d,k))continue;}
   const j=Math.floor(Math.random()*P);if(i===j)continue;const options=Array.from({length:days},(_,d)=>d+1).filter(e=>e!==d&&a[j][e][k]&&!fixed(j,e,k));if(!options.length)continue;const e=pick(options);a[i][d][k]=false;a[j][e][k]=false;if(!can(i,e,k,a)||!can(j,d,k,a)){a[i][d][k]=true;a[j][e][k]=true;continue;}a[i][e][k]=true;a[j][d][k]=true;const delta=bads(a).length-bad.length,temp=.55*(1-(it%12000)/12000)+.02;if(delta>0&&Math.random()>Math.exp(-delta/temp)){a[i][d][k]=true;a[j][e][k]=true;a[i][e][k]=false;a[j][d][k]=false;}
  }
 }
 throw Error(`ยังหาตารางที่ผ่านทุกเงื่อนไขไม่พบในเวลาที่กำหนด (ลอง ${tries} แบบ) ลองจัดใหม่ หรือทบทวนวันหยุดและเวรที่กำหนดเอง โดยตารางเดิมยังคงอยู่`);
}

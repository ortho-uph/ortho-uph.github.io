(function(){
'use strict';
const KEY='ortho-virtual-stock-v2';
const DEFAULT_ENDPOINT='https://script.google.com/macros/s/AKfycbzkTF08dH_w6FU8CixUThwO25fDZ9n2SI6XMqTJqnWbSeo-gTFpsVy9JYdDqRDdPmS51A/exec';
const DEFAULT_KEY='CHANGE_ME_TO_A_LONG_RANDOM_SECRET';
let db=null, pending=new Map(), centralState='loading', centralMessage='กำลังเชื่อมต่อฐานข้อมูลกลาง', centralVer=0, lastPull=0;
const enabled=()=>!['127.0.0.1','localhost'].includes(location.hostname);
const iso=d=>{let x=d instanceof Date?d:new Date(d+'T00:00:00');return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const add=(d,n)=>{let x=new Date(d+'T00:00:00');x.setDate(x.getDate()+n);return iso(x)};
const days=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
const range=(a,b)=>Array.from({length:days(a,b)+1},(_,i)=>add(a,i));
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const endpoint=()=>localStorage.getItem('upSyncUrl')||DEFAULT_ENDPOINT;
const apiKey=()=>localStorage.getItem('upSyncKey')||DEFAULT_KEY;
async function centralRequest(body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  let response;
  if(body){response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({key:apiKey()},body)),signal:controller.signal})}
  else{let q=new URLSearchParams({action:'stockLoad',key:apiKey()});response=await fetch(endpoint()+'?'+q,{signal:controller.signal,cache:'no-store'})}
  let text=await response.text(),result;
  try{result=JSON.parse(text)}catch(_){throw Error('ฐานข้อมูลกลางตอบกลับไม่ถูกต้อง')}
  if(!response.ok||!result.ok)throw Error(result.err||'เชื่อมต่อฐานข้อมูลกลางไม่สำเร็จ');
  return result;
 }catch(error){if(error.name==='AbortError')throw Error('ฐานข้อมูลกลางตอบช้าเกินไป');throw error}
 finally{clearTimeout(timer)}
}
function setCentralError(error){
 centralState='error';
 centralMessage=error&&error.message==='unknown action'?'Apps Script ยังเป็นเวอร์ชันเก่า กรุณา Deploy เวอร์ชันใหม่':(error&&error.message)||'ติดต่อฐานข้อมูลกลางไม่ได้';
}
const validStockData=value=>!!value&&Array.isArray(value.drugs)&&Array.isArray(value.daily)&&Array.isArray(value.refills)&&Array.isArray(value.coverage);
function normalize(){
 db.nextRefill=Math.max(0,...db.refills.map(x=>Number(x.id)||0))+1;db.imports=db.imports||[];db.settings=db.settings||{safety:20,target:7};
 if(!db.settings.start){let latest=db.daily.map(x=>x[0]).sort().at(-1);db.settings.start=latest?add(latest,1):iso(new Date())}
}
async function pullCentral(force=false){
 if(!enabled())return;
 if(!force&&Date.now()-lastPull<5000)return;
 try{
  const result=await centralRequest();
  if(result.data){if(!validStockData(result.data))throw Error('Apps Script ยังเป็นเวอร์ชันเก่า กรุณา Deploy เวอร์ชันใหม่');db=result.data;normalize();save();centralVer=result.ver||0}
  else if(db){normalize();const saved=await centralRequest({action:'stockSave',data:db,baseVer:0});centralVer=saved.ver||0}
  centralState='ready';centralMessage='เชื่อมต่อฐานข้อมูลกลางแล้ว';lastPull=Date.now();
 }catch(error){lastPull=Date.now();setCentralError(error)}
}
async function pushCentral(previous){
 if(!enabled())return;
 if(centralState!=='ready'){db=previous;save();throw Error(centralMessage+' — ระบบยังไม่บันทึกรายการเพื่อป้องกันข้อมูลแยกกันหลายเครื่อง')}
 try{
  const result=await centralRequest({action:'stockSave',data:db,baseVer:centralVer||0});centralVer=result.ver||centralVer;lastPull=Date.now();save();
 }catch(error){
  db=previous;save();
  if(error.message==='stale'){await pullCentral(true);throw Error('มีข้อมูลใหม่จากเครื่องอื่น ระบบโหลดข้อมูลล่าสุดแล้ว กรุณาทำรายการอีกครั้ง')}
  setCentralError(error);throw Error(centralMessage+' — ไม่ได้บันทึกรายการนี้')
 }
}
async function load(){
 if(db)return db;
 let saved=localStorage.getItem(KEY);
 if(saved){try{db=JSON.parse(saved)}catch(_){localStorage.removeItem(KEY)}}
 if(!db){let r=await fetch(new URL('offline-data.json',location.href),{cache:'no-store'});if(!r.ok)throw Error('ไม่พบข้อมูลเริ่มต้นของระบบ');db=await r.json();save()}
 if(enabled())await pullCentral(true);
 normalize();
 return db;
}
function inferUnit(name){let x=name.trim().split(/\s+/).pop().toUpperCase();return ['TAB','CAP','CAPSULE','TUBE','SAC','AMP','VIAL','BOTTLE','ML','G','PACK','PATCH'].includes(x)?x:'หน่วย (โปรดตรวจสอบ)'}
function metric(asof){
 let end=asof, covered=new Set(db.coverage), rows=[];
 let daily=new Map(), refills=new Map();
 for(let [day,drug,qty] of db.daily)if(day<=asof){if(!daily.has(drug))daily.set(drug,[]);daily.get(drug).push([day,+qty])}
 for(let r of db.refills)if(!r.voided&&r.day<=asof){if(!refills.has(r.drug))refills.set(r.drug,[]);refills.get(r.drug).push(r)}
 for(let d0 of db.drugs){
  let d={...d0}, rec=daily.get(d.id)||[], avgs=[7,30].map(n=>rec.filter(x=>x[0]>=add(end,-n+1)).reduce((s,x)=>s+x[1],0)/n), rate=Math.max(...avgs)*(1+db.settings.safety/100);
  let rs=(refills.get(d.id)||[]).sort((a,b)=>a.day.localeCompare(b.day)||a.id-b.id), eventDays=[...new Set(rs.map(x=>x.day))].sort(), byDay={};
  for(let r of rs)if(r.normalized!==0)byDay[r.day]=(byDay[r.day]||0)+(+r.qty);
  let recentDays=eventDays.slice(-4), intervals=recentDays.slice(1).map((x,i)=>days(recentDays[i],x)), avgInterval=avg(intervals), qtyDays=Object.keys(byDay).sort(), recentQty=qtyDays.slice(-3).map(x=>byDay[x]), avgRefill=avg(recentQty), coverageDays=avgRefill!==null&&rate>0?avgRefill/rate:null;
  let orderCycle=(rate>0||avgInterval!==null)?(avgInterval>0?avgInterval:+db.settings.target):null;
  let liveDays=eventDays.filter(x=>x>=db.settings.start),lastLive=liveDays.at(-1)||null,lastLiveQty=lastLive?(byDay[lastLive]??null):null,currentCoverage=lastLiveQty!==null&&rate>0?lastLiveQty/rate:null,candidates=rate>0?[orderCycle,currentCoverage].filter(x=>x>0):[],cycle=candidates.length?Math.min(...candidates):null;
  let expected=lastLive&&cycle!==null?add(lastLive,Math.max(1,Math.ceil(cycle))):(rate>0?asof:null),until=expected?days(asof,expected):null;
  let status=rate<=0?'no_usage':!lastLive?'first_order':cycle===null?'no_usage':until<=0?'urgent':until<=2?'today':until<=3?'near':'ok';
  let base=rate>0?rate*orderCycle:null, recommendedUnits=base===null?null:Math.ceil(base-1e-10), recommendedPacks=base!==null&&d.pack_set?Math.ceil(base/d.pack-1e-10):null;
  if(rate>0&&!d.pack_set)status='no_pack';
  Object.assign(d,{status,recommended:recommendedUnits,recommended_units:recommendedUnits,recommended_packs:recommendedPacks,avg7:avgs[0],avg30:avgs[1],rate,last_refill:eventDays.at(-1)||null,last_refill_qty:eventDays.length?(byDay[eventDays.at(-1)]??null):null,last_live_refill:lastLive,last_live_refill_qty:lastLiveQty,avg_refill:avgRefill,avg_interval:avgInterval,coverage_days:coverageDays,current_coverage_days:currentCoverage,cycle_days:cycle,order_cycle_days:orderCycle,expected,days_until:until,refill_count:eventDays.length,live_refill_count:liveDays.length});rows.push(d);
 }
 let enriched=db.refills.slice().sort((a,b)=>b.day.localeCompare(a.day)||b.id-a.id).map(r=>{let d=db.drugs.find(x=>x.id===r.drug);return {...r,name:d.name,unit:d.unit}});
 let miss=n=>range(add(asof,-n+1),asof).filter(x=>!covered.has(x)).length;
 return {asof,last:[...covered].filter(x=>x<=asof).sort().at(-1)||null,settings:{...db.settings},rows,missing7:miss(7),missing30:miss(30),refills:enriched,imports:db.imports.slice().sort((a,b)=>(b.id||0)-(a.id||0)).slice(0,20),onlineMode:true,central:{state:centralState,message:centralMessage,ver:centralVer}};
}
function parseCSV(text){let rows=[],row=[],cell='',quote=false;for(let i=0;i<text.length;i++){let c=text[i];if(quote){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quote=false;else cell+=c}else if(c==='"')quote=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(x=>String(x).trim()))}
function dateValue(v){
 if(v instanceof Date)v=`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
 let s=String(v).trim(),m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(m){let y=+m[3];if(y>2400)y-=543;s=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||iso(s)!==s)throw Error('วันที่ไม่ถูกต้อง');return s;
}
async function fileRows(file){
 if(file.name.toLowerCase().endsWith('.csv'))return parseCSV((await file.text()).replace(/^\ufeff/,''));
 if(file.name.toLowerCase().endsWith('.xlsx')){
  if(!window.XLSX)throw Error('โหลดตัวอ่าน Excel ไม่สำเร็จ กรุณาลองใหม่ หรือบันทึกเป็น CSV UTF-8');
  let workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  if(workbook.SheetNames.length!==1)throw Error('กรุณาใช้ไฟล์ที่มีชีตข้อมูลหนึ่งชีต');
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:'',raw:true}).filter(r=>r.some(x=>String(x).trim()));
 }
 throw Error('รองรับเฉพาะ .xlsx และ .csv UTF-8');
}
function headerIndex(headers,aliases){let found=headers.map((x,i)=>aliases.includes(String(x).trim().toLowerCase())?i:-1).filter(i=>i>=0);if(found.length!==1)throw Error('ชื่อคอลัมน์ไม่ถูกต้อง');return found[0]}
async function previewDaily(file){await load();let rows=await fileRows(file),h=rows.shift(),di=headerIndex(h,['วันที่','date','day']),ni=headerIndex(h,['ยา','ชื่อยา','drug','name']),qi=headerIndex(h,['จำนวน','qty','quantity']),group=new Map(),count=0;
 for(let [i,r] of rows.entries()){let day=dateValue(r[di]),name=String(r[ni]||'').trim(),qty=Number(r[qi]);if(!name||!Number.isFinite(qty)||qty<0)throw Error(`ข้อมูลไม่ถูกต้องแถว ${i+2}`);let k=day+'\0'+name;group.set(k,(group.get(k)||0)+qty);count++}
 let daily=[...group].map(([k,q])=>{let [d,n]=k.split('\0');return [d,n,q]}).sort(),dates=[...new Set(daily.map(x=>x[0]))].sort(),names=[...new Set(daily.map(x=>x[1]))],existing=new Map(db.daily.map(x=>[x[0]+'\0'+(db.drugs.find(d=>d.id===x[1])?.name||''),x[2]])),conflicts=dates.filter(day=>daily.some(x=>x[0]===day&&existing.has(day+'\0'+x[1])&&existing.get(day+'\0'+x[1])!==x[2]));
 let p={kind:'daily',file:file.name,daily,dates,names},token=crypto.randomUUID();pending.set(token,p);return {token,name:file.name,rows:count,drugs:names.length,days:dates.length,first:dates[0],last:dates.at(-1),conflicts:[...new Set(conflicts)],unchanged:0,new_drugs:names.filter(n=>!db.drugs.some(d=>d.name===n)),total:daily.reduce((s,x)=>s+x[2],0),gap_days:days(dates[0],dates.at(-1))+1-dates.length}}
async function previewRefills(file){await load();let rows=await fileRows(file),h=rows.shift(),di=headerIndex(h,['วันที่','วันที่เบิก','date','day']),ni=headerIndex(h,['ยา','ชื่อยา','drug','name']),pi=headerIndex(h,['จำนวนแพ็ค','แพ็ค','packs','pack']),notei=h.findIndex(x=>['หมายเหตุ','note'].includes(String(x).trim().toLowerCase())),items=new Map(),count=0;
 for(let [i,r] of rows.entries()){let day=dateValue(r[di]),name=String(r[ni]||'').trim().replace(/^'/,''),packs=Number(r[pi]),drug=db.drugs.find(d=>d.name===name);if(!drug)throw Error(`ไม่พบยา ${name} (แถว ${i+2})`);if(!drug.pack_set)throw Error(`ยังไม่ตั้งขนาดแพ็คของ ${name}`);if(!Number.isInteger(packs)||packs<=0)throw Error(`จำนวนแพ็คไม่ถูกต้องแถว ${i+2}`);let k=day+'\0'+drug.id,x=items.get(k)||{day,drug:drug.id,name,packs:0,note:'',pack_size:drug.pack};x.packs+=packs;if(notei>=0&&r[notei])x.note=String(r[notei]).slice(0,500);items.set(k,x);count++}
 let list=[...items.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.name.localeCompare(b.name));for(let x of list)x.qty=x.packs*x.pack_size;let conflicts=list.filter(x=>db.refills.some(r=>!r.voided&&r.day===x.day&&r.drug===x.drug)).map(x=>`${x.day} · ${x.name}`),token=crypto.randomUUID();pending.set(token,{kind:'refill',file:file.name,items:list});return {token,name:file.name,rows:count,drugs:new Set(list.map(x=>x.drug)).size,days:new Set(list.map(x=>x.day)).size,first:list[0].day,last:list.at(-1).day,total_packs:list.reduce((s,x)=>s+x.packs,0),conflicts}}
async function api(path,data){await load();let route=path.split('?')[0],asof=new URL(path,location.origin).searchParams.get('date')||new Date().toISOString().slice(0,10);
 if(route.endsWith('/api/state')){await pullCentral();return metric(asof)}
 let previous=JSON.parse(JSON.stringify(db));
 if(route.endsWith('/api/settings')){db.settings.safety=+data.safety;db.settings.target=+data.target;if(data.start)db.settings.start=dateValue(data.start)}
 else if(route.endsWith('/api/packs')){for(let [k,v] of Object.entries(data)){if(!k.startsWith('pack_')||v==='')continue;let id=+k.slice(5),pack=+v,d=db.drugs.find(x=>x.id===id);d.pack=pack;d.pack_set=1;for(let r of db.refills)if(r.drug===id&&r.source_qty!=null&&['box','pack','กล่อง'].includes(String(r.source_unit).toLowerCase()))Object.assign(r,{qty:r.source_qty*pack,packs:r.source_qty,pack_size:pack,normalized:1})}}
 else if(route.endsWith('/api/refill')){let d=db.drugs.find(x=>x.id===+data.drug),packs=+data.packs;if(!d?.pack_set)throw Error('กรุณาตั้งขนาดบรรจุต่อแพ็คก่อน');db.refills.push({id:db.nextRefill++,drug:d.id,day:data.day,qty:packs*d.pack,note:data.note||'',created:new Date().toISOString(),voided:0,packs,pack_size:d.pack,source_qty:null,source_unit:null,source_file:null,normalized:1})}
 else if(route.endsWith('/api/void-refill')){let r=db.refills.find(x=>x.id===+data.id);if(!r)throw Error('ไม่พบรายการ');r.voided=1}
 else if(route.endsWith('/api/coverage')){for(let x of range(data.first,data.last))if(!db.coverage.includes(x))db.coverage.push(x)}
 else if(route.endsWith('/api/import-commit')){let p=pending.get(data.token);if(!p)throw Error('ตัวอย่างนำเข้าหมดอายุ');for(let n of p.names)if(!db.drugs.some(d=>d.name===n))db.drugs.push({id:Math.max(...db.drugs.map(x=>x.id))+1,name:n,unit:inferUnit(n),start:null,opening:null,pack:1,pack_set:0});db.daily=db.daily.filter(x=>!p.dates.includes(x[0]));for(let [day,name,qty] of p.daily)db.daily.push([day,db.drugs.find(d=>d.name===name).id,qty]);if(data.complete)for(let x of range(p.dates[0],p.dates.at(-1)))if(!db.coverage.includes(x))db.coverage.push(x);db.imports.push({id:Math.max(0,...db.imports.map(x=>x.id||0))+1,name:p.file,created:new Date().toISOString().slice(0,19),detail:JSON.stringify({rows:p.daily.length,drugs:p.names.length,first:p.dates[0],last:p.dates.at(-1)})});pending.delete(data.token)}
 else if(route.endsWith('/api/refill-import-commit')){let p=pending.get(data.token);if(!p)throw Error('ตัวอย่างนำเข้าหมดอายุ');if(data.replace)for(let x of p.items)for(let r of db.refills)if(!r.voided&&r.day===x.day&&r.drug===x.drug)r.voided=1;for(let x of p.items)db.refills.push({id:db.nextRefill++,drug:x.drug,day:x.day,qty:x.qty,note:x.note,created:new Date().toISOString(),voided:0,packs:x.packs,pack_size:x.pack_size,source_qty:null,source_unit:null,source_file:p.file,normalized:1});pending.delete(data.token)}
 else throw Error('ไม่พบคำสั่ง');save();await pushCentral(previous);return {ok:true}
}
function csvCell(v){let s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function download(name,rows,type='text/csv;charset=utf-8'){let text=rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),blob=new Blob(['\ufeff'+text],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function handleDownload(path){await load();let asof=new URL(path,location.origin).searchParams.get('date')||new Date().toISOString().slice(0,10),s=metric(asof);
 if(path.includes('/api/refill-template'))download('requisition-upload.csv',[['วันที่เบิก','ยา','จำนวนแพ็ค','หน่วยต่อแพ็ค','เทียบเป็นหน่วย','หมายเหตุ'],...s.rows.filter(r=>r.recommended_packs>0).map(r=>[asof,r.name,r.recommended_packs,r.pack,r.recommended_packs*r.pack,''])]);
 else if(path.includes('/api/export'))download('requisition.csv',[['วันที่ประเมิน','ยา','หน่วยใช้','หน่วยต่อแพ็ค','เฉลี่ย7วัน','เฉลี่ย30วัน','อัตราใช้เผื่อแล้ว','เบิกล่าสุด','สถานะ','แนะนำเบิก (แพ็ค)','เทียบเป็นหน่วย'],...s.rows.map(r=>[asof,r.name,r.unit,r.pack_set?r.pack:'',r.avg7,r.avg30,r.rate,r.last_refill||'',r.status,r.recommended_packs??'',r.recommended_units??''])]);
 else{let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='stock-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
}
document.addEventListener('click',e=>{if(!enabled())return;let a=e.target.closest('a[href*="/virtual-stock/api/"]');if(a){e.preventDefault();handleDownload(a.href).catch(x=>alert(x.message))}},true);
async function configure(url,key){
 if(url!==undefined)localStorage.setItem('upSyncUrl',String(url).trim());
 if(key!==undefined)localStorage.setItem('upSyncKey',String(key).trim());
 centralState='loading';centralMessage='กำลังเชื่อมต่อฐานข้อมูลกลาง';lastPull=0;await pullCentral(true);
 if(centralState!=='ready')throw Error(centralMessage);
 return status();
}
async function refresh(){await load();await pullCentral(true);if(centralState!=='ready')throw Error(centralMessage);return status()}
function status(){return {state:centralState,message:centralMessage,endpoint:endpoint(),hasKey:!!apiKey(),ver:centralVer}}
window.OfflineStock={enabled,api,previewDaily,previewRefills,configure,refresh,status};
})();

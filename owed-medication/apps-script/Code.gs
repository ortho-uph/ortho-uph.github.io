/* ระบบยาค้างจ่าย: Apps Script ของ Google Sheet ชุดใหม่ (แยกจากระบบเดิมทั้งหมด)
   ติดตั้งตาม owed-medication/README.md · ต้องตั้ง Script Property API_KEY ก่อน Deploy
   ใบแจ้ง = ยาหลายรายการ (drugs) + นัดหลายรอบ (rounds) · rounds[k].qty[j] คือจำนวนยา drugs[j] ในนัดที่ k */
const FIELDS=['id','publicToken','createdAt','updatedAt','clinic','hn','patient','phone1','phone2','address','recipientName','receiveMethod','note','firstDate','drugs','rounds','statusHistory'];
const JSON_FIELDS=['drugs','rounds','statusHistory'];
const STATUSES=['waiting','ready','delivery','received'];
const DEFAULT_HOLIDAYS=[['2026-10-13','วันนวมินทรมหาราช'],['2026-10-23','วันปิยมหาราช'],['2026-12-05','วันพ่อแห่งชาติ'],['2026-12-07','ชดเชยวันพ่อแห่งชาติ'],['2026-12-10','วันรัฐธรรมนูญ'],['2026-12-31','วันสิ้นปี'],['2027-01-01','วันขึ้นปีใหม่'],['2027-04-06','วันจักรี'],['2027-04-13','วันสงกรานต์'],['2027-04-14','วันสงกรานต์'],['2027-04-15','วันสงกรานต์']];
const SESSION_SECONDS=21600;
// PIN มีแค่ 4–8 หลัก จึงล็อกการเข้าสู่ระบบทั้งระบบเมื่อผิดติดกันหลายครั้ง เพื่อกันการสุ่ม PIN จากภายนอก
const LOGIN_MAX_FAILS=10,LOGIN_LOCK_SECONDS=900;

function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function props_(){return PropertiesService.getScriptProperties();}
function cache_(){return CacheService.getScriptCache();}
function sheet_(name){const ss=SpreadsheetApp.getActiveSpreadsheet();return ss.getSheetByName(name)||ss.insertSheet(name);}
function clean_(v,n){return String(v==null?'':v).trim().slice(0,n||250);}
function num_(v){const m=String(v==null?'':v).replace(/,/g,'').match(/\d+/);return m?Math.min(99999,parseInt(m[0],10)):0;}
function date_(v){v=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';}
function withLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(20000);try{return fn();}finally{lock.releaseLock();}}

const GET_ACTIONS={
  list:function(){return {ok:1,items:load_(),holidays:holidays_()};},
  drugList:function(){return {ok:1,names:drugNames_()};}
};
const POST_ACTIONS={
  create:function(r){return create_(r.item);},
  update:function(r){return update_(r.id,r.item);},
  'delete':function(r){return remove_(r.id);},
  'import':function(r){return import_(r.items);},
  holidaySave:function(r){return holidaySave_(r.holidays);},
  drugSave:function(r){return drugSave_(r.names);}
};
function doGet(e){
  const p=(e&&e.parameter)||{};
  try{
    if(p.action==='patient')return out(patient_(p.token));
    if(p.action==='pinStatus')return out({ok:1,configured:!!props_().getProperty('PIN_HASH')});
    if(!authorized_(p))return out({ok:0,err:'unauthorized'});
    const action=GET_ACTIONS[p.action];
    return out(action?action(p):{ok:0,err:'unknown action'});
  }catch(err){return out({ok:0,err:String(err&&err.message||err)});}
}
function doPost(e){
  let req;
  try{req=JSON.parse(e.postData.contents);}catch(err){return out({ok:0,err:'bad_request'});}
  try{
    if(req.action==='login')return out(login_(req.pin));
    if(req.action==='setPin')return out(apiKeyOk_(req)?setPin_(req.pin):{ok:0,err:'unauthorized'});
    if(!authorized_(req))return out({ok:0,err:'unauthorized'});
    const action=Object.prototype.hasOwnProperty.call(POST_ACTIONS,req.action)?POST_ACTIONS[req.action]:null;
    return out(action?action(req):{ok:0,err:'unknown action'});
  }catch(err){return out({ok:0,err:String(err&&err.message||err)});}
}

/* ===== สิทธิ์: API key (ตั้ง PIN ครั้งแรก) และ PIN ส่วนกลาง (ใช้งานประจำวัน) ===== */
function apiKeyOk_(req){const key=props_().getProperty('API_KEY');return !!key&&key.length>=16&&!!req&&req.key===key;}
function authorized_(req){return apiKeyOk_(req)||(!!req&&!!req.session&&cache_().get('SESSION_'+String(req.session))==='1');}
function pinHash_(pin,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+pin,Utilities.Charset.UTF_8);
  return bytes.map(function(v){const b=v<0?v+256:v;return ('0'+b.toString(16)).slice(-2);}).join('');
}
function validPin_(pin){return /^\d{4,8}$/.test(pin);}
function setPin_(pin){
  pin=String(pin==null?'':pin).trim();
  if(!validPin_(pin))return {ok:0,err:'invalid_pin'};
  const salt=Utilities.getUuid();
  props_().setProperties({PIN_SALT:salt,PIN_HASH:pinHash_(pin,salt)});
  cache_().remove('LOGIN_FAILS');
  return {ok:1};
}
function login_(pin){
  pin=String(pin==null?'':pin).trim();
  const hash=props_().getProperty('PIN_HASH'),salt=props_().getProperty('PIN_SALT');
  if(!hash||!salt)return {ok:0,err:'pin_not_set'};
  const fails=Number(cache_().get('LOGIN_FAILS')||0);
  if(fails>=LOGIN_MAX_FAILS)return {ok:0,err:'locked'};
  if(!validPin_(pin)||pinHash_(pin,salt)!==hash){cache_().put('LOGIN_FAILS',String(fails+1),LOGIN_LOCK_SECONDS);return {ok:0,err:'unauthorized'};}
  cache_().remove('LOGIN_FAILS');
  const token=Utilities.getUuid().replace(/-/g,'');
  cache_().put('SESSION_'+token,'1',SESSION_SECONDS);
  return {ok:1,session:token,expiresIn:SESSION_SECONDS};
}

/* ===== ใบแจ้ง: แท็บ Slips หนึ่งแถวต่อหนึ่งใบแจ้ง ===== */
// ตรวจและจัดรูปข้อมูลจากภายนอกให้เป็นใบแจ้งที่ถูกต้อง
function item_(input,base){
  input=input||{};
  const rawDrugs=(Array.isArray(input.drugs)?input.drugs:[]).slice(0,20).map(function(d){d=d||{};return {name:clean_(d.name,120),unit:clean_(d.unit,20)||'เม็ด',rx:num_(d.rx),got:num_(d.got)};});
  const keep=[];rawDrugs.forEach(function(d,j){if(d.name)keep.push(j);});
  const rounds=(Array.isArray(input.rounds)?input.rounds:[]).slice(0,24).map(function(r){r=r||{};const q=Array.isArray(r.qty)?r.qty:[];return {date:date_(r.date),status:STATUSES.indexOf(r.status)>=0?r.status:'waiting',qty:keep.map(function(j){return num_(q[j]);})};});
  return Object.assign({},base||{},{
    clinic:clean_(input.clinic,40)||'ORTHO',hn:clean_(input.hn,20),patient:clean_(input.patient,120),
    phone1:clean_(input.phone1,30),phone2:clean_(input.phone2,30),address:clean_(input.address,1200),
    recipientName:clean_(input.recipientName,120),receiveMethod:input.receiveMethod==='mail'?'mail':'self',note:clean_(input.note,1200),
    firstDate:date_(input.firstDate),drugs:keep.map(function(j){return rawDrugs[j];}),rounds:rounds
  });
}
function parseArray_(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function load_(){
  const sh=sheet_('Slips'),last=sh.getLastRow();if(last<2)return [];
  const values=sh.getRange(1,1,last,sh.getLastColumn()).getDisplayValues(),head=values[0];
  return values.slice(1).map(function(row){const o={};head.forEach(function(k,i){if(k)o[k]=row[i]||'';});JSON_FIELDS.forEach(function(k){o[k]=parseArray_(o[k]);});return o;}).filter(function(o){return o.id;});
}
function save_(items){
  const rows=[FIELDS].concat(items.map(function(o){return FIELDS.map(function(k){return JSON_FIELDS.indexOf(k)>=0?JSON.stringify(o[k]||[]):String(o[k]==null?'':o[k]);});}));
  const sh=sheet_('Slips');sh.clearContents();
  sh.getRange(1,1,rows.length,FIELDS.length).setNumberFormat('@').setValues(rows);
}
function nextIds_(items,count){
  const year=Utilities.formatDate(new Date(),'GMT+7','yyyy');let seq=0;
  items.forEach(function(x){if(String(x.id||'').indexOf(year+'-')===0)seq=Math.max(seq,Number(String(x.id).split('-')[1])||0);});
  const ids=[];for(let i=1;i<=count;i++)ids.push(year+'-'+('000'+(seq+i)).slice(-3));return ids;
}
function newSlip_(input,id){
  const now=new Date().toISOString();
  return item_(input,{id:id,publicToken:Utilities.getUuid().replace(/-/g,''),createdAt:now,updatedAt:now,statusHistory:[{status:'created',at:now}]});
}
function create_(input){
  return withLock_(function(){const items=load_();const item=newSlip_(input,nextIds_(items,1)[0]);items.unshift(item);save_(items);return {ok:1,item:item};});
}
// นำเข้ารายชื่อจาก Excel ทีละหลายคนในการล็อกครั้งเดียว
function import_(list){
  const input=(Array.isArray(list)?list:[]).slice(0,500);
  if(!input.length)return {ok:0,err:'empty_import'};
  return withLock_(function(){const items=load_(),ids=nextIds_(items,input.length);const created=input.map(function(x,i){return newSlip_(x,ids[i]);});save_(created.slice().reverse().concat(items));return {ok:1,items:created};});
}
function update_(id,input){
  return withLock_(function(){
    const items=load_();const at=items.map(function(x){return x.id;}).indexOf(String(id||'').toUpperCase());
    if(at<0)return {ok:0,err:'not_found'};
    const old=items[at],now=new Date().toISOString();
    const item=item_(input,{id:old.id,publicToken:old.publicToken,createdAt:old.createdAt,updatedAt:now});
    const history=old.statusHistory.slice();
    item.rounds.forEach(function(r,k){const before=old.rounds[k];if(!before||before.status!==r.status)history.push({round:k,status:r.status,at:now});});
    item.statusHistory=history.slice(-200);items[at]=item;save_(items);return {ok:1,item:item};
  });
}
function remove_(id){
  return withLock_(function(){const items=load_();const next=items.filter(function(x){return x.id!==String(id||'').toUpperCase();});if(next.length===items.length)return {ok:0,err:'not_found'};save_(next);return {ok:1};});
}
// หน้าผู้ป่วยเปิดได้โดยไม่ต้องล็อกอิน: ส่งเฉพาะข้อมูลที่จำเป็น ปิดนามสกุลที่ฝั่งเซิร์ฟเวอร์ ไม่ส่ง HN เบอร์โทร หรือที่อยู่
function mask_(name){const first=String(name||'').trim().split(/\s+/)[0];return (first||'ผู้รับบริการ')+' XXX';}
function patient_(token){
  token=String(token||'');
  const item=token?load_().filter(function(x){return x.publicToken===token;})[0]:null;
  if(!item)return {ok:0,err:'not_found'};
  return {ok:1,item:{id:item.id,patient:mask_(item.patient),receiveMethod:item.receiveMethod,note:item.note,firstDate:item.firstDate,
    drugs:item.drugs.map(function(d){return {name:d.name,unit:d.unit,got:d.got};}),rounds:item.rounds,updatedAt:item.updatedAt}};
}

/* ===== วันหยุดราชการ: แท็บ Holidays (date, name) แก้ได้จากหน้าเว็บหรือในชีต ===== */
function holidayWrite_(list){
  const rows=[['date','name']].concat(list.map(function(h){return [h.date,h.name];}));
  const sh=sheet_('Holidays');sh.clearContents();sh.getRange(1,1,rows.length,2).setNumberFormat('@').setValues(rows);
}
function holidays_(){
  const sh=sheet_('Holidays');
  if(sh.getLastRow()===0)holidayWrite_(DEFAULT_HOLIDAYS.map(function(h){return {date:h[0],name:h[1]};}));
  const last=sh.getLastRow();if(last<2)return [];
  return sh.getRange(2,1,last-1,2).getDisplayValues().map(function(r){return {date:date_(r[0]),name:clean_(r[1],80)};}).filter(function(h){return h.date&&h.name;});
}
function holidaySave_(input){
  const seen={};
  const list=(Array.isArray(input)?input:[]).slice(0,400).map(function(h){h=h||{};return {date:date_(h.date),name:clean_(h.name,80)};})
    .filter(function(h){if(!h.date||!h.name||seen[h.date])return false;seen[h.date]=1;return true;})
    .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
  return withLock_(function(){holidayWrite_(list);return {ok:1,holidays:list};});
}

/* ===== รายชื่อยาสำหรับช่องค้นหา: แท็บ DrugNames คอลัมน์ A ===== */
function drugNames_(){
  const sh=sheet_('DrugNames'),last=sh.getLastRow();if(last<2)return [];
  return sh.getRange(2,1,last-1,1).getDisplayValues().map(function(r){return clean_(r[0],120);}).filter(Boolean);
}
function drugSave_(input){
  return withLock_(function(){
    const seen={},names=drugNames_().concat((Array.isArray(input)?input:[]).slice(0,5000).map(function(n){return clean_(n,120);}))
      .filter(function(n){const k=n.toLowerCase();if(!n||seen[k])return false;seen[k]=1;return true;});
    const rows=[['ชื่อยา']].concat(names.map(function(n){return [n];}));
    const sh=sheet_('DrugNames');sh.clearContents();sh.getRange(1,1,rows.length,1).setNumberFormat('@').setValues(rows);
    return {ok:1,names:names};
  });
}

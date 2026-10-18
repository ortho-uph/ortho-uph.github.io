/* คลินิกเติมยา (ระบบนัดเติมยา): Apps Script ของ Google Sheet ชุดใหม่ แยกจากระบบเดิมทั้งหมด
   ติดตั้งตาม owed-medication/README.md · ต้องตั้ง Script Property API_KEY ก่อน Deploy
   ใบแจ้ง = ยาหลายรายการ (drugs) + นัดหลายรอบ (rounds) · rounds[k].qty[j] คือจำนวนยา drugs[j] ในนัดที่ k
   ผู้ใช้แต่ละคนมีชื่อผู้ใช้และรหัสผ่านของตัวเอง สิทธิ์ admin จัดการผู้ใช้ได้ ส่วน staff ใช้งานประจำวัน */
const FIELDS=['id','publicToken','createdAt','updatedAt','createdBy','clinic','hn','patient','phone1','phone2','address','recipientName','receiveMethod','note','firstDate','drugs','rounds','statusHistory','log'];
const JSON_FIELDS=['drugs','rounds','statusHistory','log'];
const STATUSES=['waiting','ready','delivery','received'];
const STATUS_TH={waiting:'รอนัดรับยา',ready:'พร้อมจ่าย',delivery:'จัดส่งแล้ว',received:'รับแล้ว'};
const USER_FIELDS=['id','username','name','role','active','salt','hash','createdAt','createdBy','lastLoginAt'];
const ROLES=['admin','staff'];
const DEFAULT_HOLIDAYS=[['2026-10-13','วันนวมินทรมหาราช'],['2026-10-23','วันปิยมหาราช'],['2026-12-05','วันพ่อแห่งชาติ'],['2026-12-07','ชดเชยวันพ่อแห่งชาติ'],['2026-12-10','วันรัฐธรรมนูญ'],['2026-12-31','วันสิ้นปี'],['2027-01-01','วันขึ้นปีใหม่'],['2027-04-06','วันจักรี'],['2027-04-13','วันสงกรานต์'],['2027-04-14','วันสงกรานต์'],['2027-04-15','วันสงกรานต์']];
const SESSION_SECONDS=21600;
// ล็อกชื่อผู้ใช้นั้นชั่วคราวเมื่อใส่รหัสผิดติดกัน เพื่อกันการสุ่มรหัสจากภายนอก
const LOGIN_MAX_FAILS=5,LOGIN_LOCK_SECONDS=900;
// hash ซ้ำหลายรอบ ถ้าชีตรั่ว การเดารหัสผ่านจาก hash จะช้าลงมาก
const HASH_ROUNDS=300;

function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function props_(){return PropertiesService.getScriptProperties();}
function cache_(){return CacheService.getScriptCache();}
function sheet_(name){const ss=SpreadsheetApp.getActiveSpreadsheet();return ss.getSheetByName(name)||ss.insertSheet(name);}
function clean_(v,n){return String(v==null?'':v).trim().slice(0,n||250);}
function num_(v){const m=String(v==null?'':v).replace(/,/g,'').match(/\d+/);return m?Math.min(99999,parseInt(m[0],10)):0;}
function date_(v){v=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';}
function now_(){return new Date().toISOString();}
function withLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(20000);try{return fn();}finally{lock.releaseLock();}}
function readTable_(name){
  const sh=sheet_(name),last=sh.getLastRow();if(last<2)return [];
  const values=sh.getRange(1,1,last,sh.getLastColumn()).getDisplayValues(),head=values[0];
  return values.slice(1).map(function(row){const o={};head.forEach(function(k,i){if(k)o[k]=row[i]||'';});return o;});
}
function writeTable_(name,fields,rows){
  const data=[fields].concat(rows.map(function(o){return fields.map(function(k){return o[k]==null?'':String(o[k]);});}));
  const sh=sheet_(name);sh.clearContents();sh.getRange(1,1,data.length,fields.length).setNumberFormat('@').setValues(data);
}

/* ===== คำสั่งทั้งหมดพร้อมสิทธิ์ที่ต้องมี: public (ไม่ต้องล็อกอิน) · staff (ผู้ใช้ทุกคนที่เปิดใช้งาน) · admin ===== */
const GET_ACTIONS={
  patient:{role:'public',fn:function(p){return patient_(p.token);}},
  list:{role:'staff',fn:function(p,u){return {ok:1,items:load_(),holidays:holidays_(),clinics:clinics_(),organization:organization_(),me:publicUser_(u)};}},
  drugList:{role:'staff',fn:function(){return {ok:1,names:drugNames_()};}},
  userList:{role:'admin',fn:function(){return {ok:1,users:users_().map(publicUser_)};}},
  auditList:{role:'admin',fn:function(){return {ok:1,entries:auditList_()};}}
};
const POST_ACTIONS={
  organizationSave:{role:'admin',fn:function(r,u){return organizationSave_(r.organization,u);}},
  login:{role:'public',fn:function(r){return login_(r.username,r.password);}},
  bootstrapAdmin:{role:'public',fn:function(r){return apiKeyOk_(r)?bootstrapAdmin_(r):{ok:0,err:'unauthorized'};}},
  logout:{role:'staff',fn:function(r){cache_().remove('SESSION_'+String(r.session));return {ok:1};}},
  changePassword:{role:'staff',fn:function(r,u){return changePassword_(u,r.oldPassword,r.newPassword);}},
  create:{role:'staff',fn:function(r,u){return create_(r.item,u);}},
  update:{role:'staff',fn:function(r,u){return update_(r.id,r.item,u);}},
  'import':{role:'staff',fn:function(r,u){return import_(r.items,r.source,u);}},
  drugSave:{role:'staff',fn:function(r,u){return drugSave_(r.names,u);}},
  'delete':{role:'admin',fn:function(r,u){return remove_(r.id,u);}},
  holidaySave:{role:'admin',fn:function(r,u){return holidaySave_(r.holidays,u);}},
  clinicSave:{role:'admin',fn:function(r,u){return clinicSave_(r.clinics,u);}},
  userCreate:{role:'admin',fn:function(r,u){return userCreate_(r,u);}},
  userUpdate:{role:'admin',fn:function(r,u){return userUpdate_(r,u);}},
  userResetPassword:{role:'admin',fn:function(r,u){return userResetPassword_(r,u);}}
};
function dispatch_(table,req){
  const action=Object.prototype.hasOwnProperty.call(table,req.action)?table[req.action]:null;
  if(!action)return {ok:0,err:'unknown action'};
  if(action.role==='public')return action.fn(req,null);
  const user=sessionUser_(req.session);
  if(!user)return {ok:0,err:'unauthorized'};
  if(action.role==='admin'&&user.role!=='admin')return {ok:0,err:'forbidden'};
  return action.fn(req,user);
}
function doGet(e){
  try{return out(dispatch_(GET_ACTIONS,(e&&e.parameter)||{}));}
  catch(err){return out({ok:0,err:String(err&&err.message||err)});}
}
function doPost(e){
  let req;
  try{req=JSON.parse(e.postData.contents);}catch(err){return out({ok:0,err:'bad_request'});}
  try{return out(dispatch_(POST_ACTIONS,req||{}));}
  catch(err){return out({ok:0,err:String(err&&err.message||err)});}
}

/* ===== ผู้ใช้: แท็บ Users ===== */
function apiKeyOk_(req){const key=props_().getProperty('API_KEY');return !!key&&key.length>=16&&!!req&&req.key===key;}
function hash_(password,salt){
  let text=salt+'|'+password;
  for(let i=0;i<HASH_ROUNDS;i++){
    const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8);
    text=bytes.map(function(v){const b=v<0?v+256:v;return ('0'+b.toString(16)).slice(-2);}).join('');
  }
  return text;
}
function users_(){return readTable_('Users').filter(function(u){return u.id;}).map(function(u){u.active=u.active!=='false';return u;});}
function saveUsers_(list){writeTable_('Users',USER_FIELDS,list);}
function publicUser_(u){return {id:u.id,username:u.username,name:u.name,role:u.role,active:u.active,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt};}
function validUsername_(v){return /^[a-z0-9._-]{3,30}$/.test(v);}
function validPassword_(v){return typeof v==='string'&&v.length>=6&&v.length<=64;}
function sessionUser_(token){
  if(!token)return null;
  const uid=cache_().get('SESSION_'+String(token));if(!uid)return null;
  // อ่านผู้ใช้ทุกครั้ง การระงับผู้ใช้จึงมีผลทันทีแม้ยังเปิดหน้าเว็บค้างไว้
  return users_().filter(function(u){return u.id===uid&&u.active;})[0]||null;
}
function login_(username,password){
  username=clean_(username,30).toLowerCase();password=String(password==null?'':password);
  const lockKey='LOGIN_FAILS_'+username,fails=Number(cache_().get(lockKey)||0);
  if(fails>=LOGIN_MAX_FAILS)return {ok:0,err:'locked'};
  const list=users_();
  if(!list.length)return {ok:0,err:'no_users'};
  const user=list.filter(function(u){return u.username===username;})[0];
  if(!user||!user.active||hash_(password,user.salt)!==user.hash){cache_().put(lockKey,String(fails+1),LOGIN_LOCK_SECONDS);return {ok:0,err:'unauthorized'};}
  cache_().remove(lockKey);
  user.lastLoginAt=now_();
  withLock_(function(){const fresh=users_();fresh.forEach(function(u){if(u.id===user.id)u.lastLoginAt=user.lastLoginAt;});saveUsers_(fresh);});
  const token=Utilities.getUuid().replace(/-/g,'');
  cache_().put('SESSION_'+token,user.id,SESSION_SECONDS);
  audit_(user,'login','','');
  return {ok:1,session:token,expiresIn:SESSION_SECONDS,user:publicUser_(user)};
}
function newUser_(input,actor,list){
  const salt=Utilities.getUuid();let id;
  do{id='U-'+Utilities.getUuid().replace(/-/g,'').slice(-12);}while(list.some(function(u){return u.id===id;}));
  return {id:id,username:input.username,name:input.name,role:input.role,active:true,salt:salt,hash:hash_(input.password,salt),createdAt:now_(),createdBy:actor?actor.name:'API key',lastLoginAt:''};
}
function userInput_(r){return {username:clean_(r.username,30).toLowerCase(),name:clean_(r.name,80),role:ROLES.indexOf(r.role)>=0?r.role:'staff',password:String(r.password==null?'':r.password)};}
function checkNewUser_(input){
  if(!validUsername_(input.username))return 'invalid_username';
  if(!input.name)return 'invalid_name';
  if(!validPassword_(input.password))return 'invalid_password';
  return '';
}
// สร้างผู้ดูแลคนแรก หรือกู้คืนสิทธิ์ผู้ดูแลเมื่อลืมรหัส ต้องใช้ API key จาก Script Properties
function bootstrapAdmin_(r){
  const input=userInput_(r);input.role='admin';
  const bad=checkNewUser_(input);if(bad)return {ok:0,err:bad};
  return withLock_(function(){
    const list=users_(),found=list.filter(function(u){return u.username===input.username;})[0];
    let user;
    if(found){found.salt=Utilities.getUuid();found.hash=hash_(input.password,found.salt);found.role='admin';found.active=true;found.name=input.name;user=found;}
    else{user=newUser_(input,null,list);list.push(user);}
    saveUsers_(list);cache_().remove('LOGIN_FAILS_'+input.username);
    audit_({id:'',name:'API key'},'user',user.id,(found?'กู้คืนสิทธิ์ผู้ดูแล ':'สร้างผู้ดูแลคนแรก ')+user.name+' ('+user.username+')');
    return {ok:1,user:publicUser_(user)};
  });
}
function userCreate_(r,actor){
  const input=userInput_(r),bad=checkNewUser_(input);if(bad)return {ok:0,err:bad};
  return withLock_(function(){
    const list=users_();
    if(list.some(function(u){return u.username===input.username;}))return {ok:0,err:'username_taken'};
    const user=newUser_(input,actor,list);list.push(user);saveUsers_(list);
    audit_(actor,'user',user.id,'เพิ่มผู้ใช้ '+user.name+' ('+user.username+') สิทธิ์ '+user.role);
    return {ok:1,user:publicUser_(user)};
  });
}
function userUpdate_(r,actor){
  return withLock_(function(){
    const list=users_(),user=list.filter(function(u){return u.id===String(r.id||'');})[0];
    if(!user)return {ok:0,err:'not_found'};
    const next={name:r.name==null?user.name:clean_(r.name,80),role:ROLES.indexOf(r.role)>=0?r.role:user.role,active:r.active==null?user.active:!!r.active};
    if(!next.name)return {ok:0,err:'invalid_name'};
    // ผู้แก้ต้องเป็นผู้ดูแลอยู่แล้ว เมื่อห้ามลดสิทธิ์หรือระงับตัวเอง ระบบจึงเหลือผู้ดูแลอย่างน้อยหนึ่งคนเสมอ
    if(user.id===actor.id&&(!next.active||next.role!=='admin'))return {ok:0,err:'cannot_change_self'};
    const changes=[];
    if(next.name!==user.name)changes.push('ชื่อ '+user.name+' → '+next.name);
    if(next.role!==user.role)changes.push('สิทธิ์ '+user.role+' → '+next.role);
    if(next.active!==user.active)changes.push(next.active?'เปิดใช้งาน':'ระงับการใช้งาน');
    Object.assign(user,next);saveUsers_(list);
    if(changes.length)audit_(actor,'user',user.id,user.username+': '+changes.join(', '));
    return {ok:1,user:publicUser_(user)};
  });
}
function userResetPassword_(r,actor){
  const password=String(r.password==null?'':r.password);
  if(!validPassword_(password))return {ok:0,err:'invalid_password'};
  return withLock_(function(){
    const list=users_(),user=list.filter(function(u){return u.id===String(r.id||'');})[0];
    if(!user)return {ok:0,err:'not_found'};
    user.salt=Utilities.getUuid();user.hash=hash_(password,user.salt);saveUsers_(list);
    cache_().remove('LOGIN_FAILS_'+user.username);
    audit_(actor,'user',user.id,'ตั้งรหัสผ่านใหม่ให้ '+user.username);
    return {ok:1};
  });
}
function changePassword_(actor,oldPassword,newPassword){
  if(!validPassword_(String(newPassword==null?'':newPassword)))return {ok:0,err:'invalid_password'};
  return withLock_(function(){
    const list=users_(),user=list.filter(function(u){return u.id===actor.id;})[0];
    if(!user||hash_(String(oldPassword==null?'':oldPassword),user.salt)!==user.hash)return {ok:0,err:'wrong_password'};
    user.salt=Utilities.getUuid();user.hash=hash_(String(newPassword),user.salt);saveUsers_(list);
    audit_(actor,'user',user.id,'เปลี่ยนรหัสผ่านของตัวเอง');
    return {ok:1};
  });
}

/* ===== บันทึกการใช้งาน: แท็บ AuditLog (ต่อท้ายทีละแถว) ===== */
const AUDIT_FIELDS=['at','userId','userName','action','slipId','detail'];
function audit_(actor,action,slipId,detail){
  const sh=sheet_('AuditLog');
  if(sh.getLastRow()===0)sh.getRange(1,1,1,AUDIT_FIELDS.length).setNumberFormat('@').setValues([AUDIT_FIELDS]);
  const row=[now_(),actor?actor.id:'',actor?actor.name:'',action,slipId||'',clean_(detail,500)];
  sh.getRange(sh.getLastRow()+1,1,1,row.length).setNumberFormat('@').setValues([row]);
}
function auditList_(){return readTable_('AuditLog').slice(-300).reverse();}

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
  return readTable_('Slips').map(function(o){JSON_FIELDS.forEach(function(k){o[k]=parseArray_(o[k]);});return o;}).filter(function(o){return o.id;});
}
function save_(items){
  writeTable_('Slips',FIELDS,items.map(function(o){const row=Object.assign({},o);JSON_FIELDS.forEach(function(k){row[k]=JSON.stringify(o[k]||[]);});return row;}));
}
function nextIds_(items,count){
  const year=Utilities.formatDate(new Date(),'GMT+7','yyyy');let seq=0;
  items.forEach(function(x){if(String(x.id||'').indexOf(year+'-')===0)seq=Math.max(seq,Number(String(x.id).split('-')[1])||0);});
  const ids=[];for(let i=1;i<=count;i++)ids.push(year+'-'+('000'+(seq+i)).slice(-3));return ids;
}
function logEntry_(actor,what){return {at:now_(),by:actor.name,userId:actor.id,what:what};}
function newSlip_(input,id,actor,what){
  const at=now_();
  return item_(input,{id:id,publicToken:Utilities.getUuid().replace(/-/g,''),createdAt:at,updatedAt:at,createdBy:actor.name,statusHistory:[{status:'created',at:at}],log:[logEntry_(actor,what)]});
}
function create_(input,actor){
  return withLock_(function(){
    const items=load_();const item=newSlip_(input,nextIds_(items,1)[0],actor,'สร้างใบแจ้ง');items.unshift(item);save_(items);
    audit_(actor,'create',item.id,'สร้างใบแจ้ง '+(item.patient||'(ใบเปล่า)'));
    return {ok:1,item:item};
  });
}
// นำเข้ารายชื่อจาก Excel หรือจองเลขที่ใบเปล่า ทีละหลายใบในการล็อกครั้งเดียว
function import_(list,source,actor){
  const input=(Array.isArray(list)?list:[]).slice(0,500);
  if(!input.length)return {ok:0,err:'empty_import'};
  const what=source==='blank'?'จองเลขที่ใบเปล่า':'นำเข้าจาก Excel';
  return withLock_(function(){
    const items=load_(),ids=nextIds_(items,input.length);
    const created=input.map(function(x,i){return newSlip_(x,ids[i],actor,what);});
    save_(created.slice().reverse().concat(items));
    audit_(actor,'import',ids[0]+(ids.length>1?'–'+ids[ids.length-1]:''),what+' '+ids.length+' ใบ');
    return {ok:1,items:created};
  });
}
const FIELD_TH={clinic:'คลินิก',hn:'HN',patient:'ชื่อ',phone1:'เบอร์โทร',phone2:'เบอร์สำรอง',address:'ที่อยู่',recipientName:'ผู้รับยาแทน',receiveMethod:'วิธีรับยา',note:'หมายเหตุ',firstDate:'วันที่จ่ายครั้งแรก'};
// สรุปว่าการบันทึกครั้งนี้เปลี่ยนอะไร เพื่อเก็บเป็นประวัติที่คนอ่านเข้าใจ
function describeChanges_(old,item){
  const out=[],fields=Object.keys(FIELD_TH).filter(function(k){return String(old[k]||'')!==String(item[k]||'');});
  if(fields.length)out.push('แก้'+fields.map(function(k){return FIELD_TH[k];}).join(', '));
  const shape=function(s){return JSON.stringify({d:s.drugs,r:s.rounds.map(function(r){return [r.date,r.qty];})});};
  if(shape(old)!==shape(item))out.push(old.drugs.length?'แก้รายการยา/ตารางนัด':'กรอกรายการยาและตารางนัด');
  item.rounds.forEach(function(r,k){const before=old.rounds[k];if(before&&before.status!==r.status)out.push('นัดที่ '+(k+1)+' → '+STATUS_TH[r.status]);});
  return out;
}
function update_(id,input,actor){
  return withLock_(function(){
    const items=load_();const at=items.map(function(x){return x.id;}).indexOf(String(id||'').toUpperCase());
    if(at<0)return {ok:0,err:'not_found'};
    const old=items[at],time=now_();
    const item=item_(input,{id:old.id,publicToken:old.publicToken,createdAt:old.createdAt,createdBy:old.createdBy,updatedAt:time});
    const history=old.statusHistory.slice();
    item.rounds.forEach(function(r,k){const before=old.rounds[k];if(!before||before.status!==r.status)history.push({round:k,status:r.status,at:time,by:actor.name});});
    item.statusHistory=history.slice(-200);
    const changes=describeChanges_(old,item);
    item.log=old.log.concat(changes.length?[logEntry_(actor,changes.join(' · '))]:[]).slice(-200);
    items[at]=item;save_(items);
    if(changes.length)audit_(actor,'update',item.id,changes.join(' · '));
    return {ok:1,item:item};
  });
}
function remove_(id,actor){
  return withLock_(function(){
    const items=load_(),target=items.filter(function(x){return x.id===String(id||'').toUpperCase();})[0];
    if(!target)return {ok:0,err:'not_found'};
    save_(items.filter(function(x){return x!==target;}));
    audit_(actor,'delete',target.id,'ลบใบแจ้ง '+(target.patient||'(ใบเปล่า)')+(target.hn?' HN '+target.hn:''));
    return {ok:1};
  });
}
// หน้าผู้ป่วยเปิดได้โดยไม่ต้องล็อกอิน: ส่งเฉพาะข้อมูลที่จำเป็น ปิดนามสกุลที่ฝั่งเซิร์ฟเวอร์ ไม่ส่ง HN เบอร์โทร ที่อยู่ หรือประวัติการแก้ไข
function mask_(name){const first=String(name||'').trim().split(/\s+/)[0];return (first||'ผู้รับบริการ')+' XXX';}
function patient_(token){
  token=String(token||'');
  const item=token?load_().filter(function(x){return x.publicToken===token;})[0]:null;
  if(!item)return {ok:0,err:'not_found'};
  return {ok:1,organization:organization_(),item:{id:item.id,patient:mask_(item.patient),receiveMethod:item.receiveMethod,note:item.note,firstDate:item.firstDate,
    drugs:item.drugs.map(function(d){return {name:d.name,unit:d.unit,got:d.got};}),rounds:item.rounds,updatedAt:item.updatedAt}};
}

/* ===== คลินิก: แท็บ Clinics (code, name) · code คือค่าที่เก็บในใบแจ้ง name คือชื่อที่แสดง ===== */
const DEFAULT_CLINICS=[['ORTHO','ศัลยกรรมกระดูกและข้อ'],['URO','ระบบทางเดินปัสสาวะ (URO)']];
function clinics_(){
  if(sheet_('Clinics').getLastRow()===0)writeTable_('Clinics',['code','name'],DEFAULT_CLINICS.map(function(c){return {code:c[0],name:c[1]};}));
  return readTable_('Clinics').map(function(c){return {code:clean_(c.code,20),name:clean_(c.name,80)};}).filter(function(c){return c.code&&c.name;});
}
function clinicSave_(input,actor){
  const seen={};
  const list=(Array.isArray(input)?input:[]).slice(0,100).map(function(c){c=c||{};return {code:clean_(c.code,20),name:clean_(c.name,80)};})
    .filter(function(c){const k=c.code.toLowerCase();if(!c.code||!c.name||seen[k])return false;seen[k]=1;return true;});
  if(!list.length)return {ok:0,err:'clinic_required'};
  return withLock_(function(){
    // ห้ามลบคลินิกที่ยังมีใบแจ้งอยู่ ไม่งั้นใบแจ้งเหล่านั้นจะไม่มีคลินิกให้เลือก
    const keep={};list.forEach(function(c){keep[c.code]=1;});
    const used=load_().map(function(s){return s.clinic;}).filter(function(code,i,all){return code&&!keep[code]&&all.indexOf(code)===i;});
    if(used.length)return {ok:0,err:'clinic_in_use',codes:used};
    const before=clinics_().map(function(c){return c.code+'='+c.name;}).join(', ');
    writeTable_('Clinics',['code','name'],list);
    audit_(actor,'clinic','','บันทึกคลินิก '+list.map(function(c){return c.code+'='+c.name;}).join(', ')+' (เดิม '+before+')');
    return {ok:1,clinics:list};
  });
}

/* ===== วันหยุดราชการ: แท็บ Holidays (date, name) แก้ได้จากหน้าเว็บ (ผู้ดูแล) หรือในชีต ===== */
function holidays_(){
  if(sheet_('Holidays').getLastRow()===0)writeTable_('Holidays',['date','name'],DEFAULT_HOLIDAYS.map(function(h){return {date:h[0],name:h[1]};}));
  return readTable_('Holidays').map(function(h){return {date:date_(h.date),name:clean_(h.name,80)};}).filter(function(h){return h.date&&h.name;});
}
function holidaySave_(input,actor){
  const seen={};
  const list=(Array.isArray(input)?input:[]).slice(0,400).map(function(h){h=h||{};return {date:date_(h.date),name:clean_(h.name,80)};})
    .filter(function(h){if(!h.date||!h.name||seen[h.date])return false;seen[h.date]=1;return true;})
    .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
  return withLock_(function(){writeTable_('Holidays',['date','name'],list);audit_(actor,'holiday','','บันทึกวันหยุด '+list.length+' วัน');return {ok:1,holidays:list};});
}

/* ===== รายชื่อยาสำหรับช่องค้นหา: แท็บ DrugNames ===== */
function drugNames_(){return readTable_('DrugNames').map(function(r){return clean_(r['ชื่อยา'],120);}).filter(Boolean);}
function drugSave_(input,actor){
  return withLock_(function(){
    const seen={},names=drugNames_().concat((Array.isArray(input)?input:[]).slice(0,5000).map(function(n){return clean_(n,120);}))
      .filter(function(n){const k=n.toLowerCase();if(!n||seen[k])return false;seen[k]=1;return true;});
    writeTable_('DrugNames',['ชื่อยา'],names.map(function(n){return {'ชื่อยา':n};}));
    audit_(actor,'drugs','','บันทึกรายชื่อยา '+names.length+' รายการ');
    return {ok:1,names:names};
  });
}

/* ===== ยืนยันรับยาทางไปรษณีย์อัตโนมัติหลังจัดส่งครบ 72 ชั่วโมง ===== */
function completeDeliveredRounds_(item, time) {
  if(item.receiveMethod!=='mail')return [];
  const changed=[],history=item.statusHistory||[];
  item.rounds.forEach(function(round,k){
    if(round.status!=='delivery'||item.rounds.slice(0,k).some(function(r){return r.status!=='received';}))return;
    const last=history.filter(function(h){return Number(h.round)===k;}).slice(-1)[0];
    if(!last||last.status!=='delivery')return;
    const shipped=Date.parse(last.at),now=Date.parse(time);
    if(!isFinite(shipped)||!isFinite(now)||now-shipped<3*24*60*60*1000)return;
    round.status='received';changed.push(k);
  });
  return changed;
}
function autoCompleteDeliveries() {
  return withLock_(function(){
    const items=load_(),time=now_(),actor={id:'system',name:'ระบบอัตโนมัติ'};let count=0;
    const audits=[];
    items.forEach(function(item){
      const changed=completeDeliveredRounds_(item,time);if(!changed.length)return;
      const detail=changed.map(function(k){return 'นัดที่ '+(k+1)+' → รับครบแล้ว (จัดส่งครบ 3 วัน)';}).join(' · ');
      item.statusHistory=(item.statusHistory||[]).concat(changed.map(function(k){return {round:k,status:'received',at:time,by:actor.name};})).slice(-200);
      item.updatedAt=time;item.log=(item.log||[]).concat([{at:time,by:actor.name,userId:actor.id,what:detail}]).slice(-200);
      audits.push({id:item.id,detail:detail});count+=changed.length;
    });
    if(count){save_(items);audits.forEach(function(a){audit_(actor,'autoReceived',a.id,a.detail);});}
    return {ok:1,completedRounds:count};
  });
}
// เรียกครั้งเดียวจาก Apps Script Editor เพื่อติดตั้งตัวตรวจทุกชั่วโมง
function installAutoCompleteDeliveries() {
  const exists=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='autoCompleteDeliveries';});
  if(!exists)ScriptApp.newTrigger('autoCompleteDeliveries').timeBased().everyHours(1).create();
  return {ok:1,installed:true};
}

/* ===== ข้อมูลโรงพยาบาลส่วนกลาง: เฉพาะข้อมูลติดต่อสาธารณะ ===== */
function normalizeOrganization_(input){
  input=input||{};const limits={hospitalName:120,department:80,phone:40,extensions:80,address:300,sender:500},out={};
  Object.keys(limits).forEach(function(k){out[k]=clean_(input[k],limits[k]);});return out;
}
function organization_(){
  const stored=props_().getProperty('ORGANIZATION_PROFILE');if(!stored)return null;
  try{return normalizeOrganization_(JSON.parse(stored));}catch(e){return null;}
}
function organizationSave_(input,actor){
  const org=normalizeOrganization_(input);if(!org.hospitalName||!org.department)return {ok:0,err:'organization_required'};
  return withLock_(function(){props_().setProperty('ORGANIZATION_PROFILE',JSON.stringify(org));audit_(actor,'organization','','แก้ไขข้อมูลโรงพยาบาล');return {ok:1,organization:org};});
}

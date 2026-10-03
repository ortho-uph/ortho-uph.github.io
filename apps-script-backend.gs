const SHEET_NAME='DB';
const API_KEY='CHANGE_ME_TO_A_LONG_RANDOM_SECRET';
const DEFAULT_PHARMACY_PIN='9999';
function doGet(e){
  const action=e&&e.parameter&&e.parameter.action;
  if(action==='medicineSpeechStatus')return out(medicineSpeechStatus_());
  if(action==='pharmacyPatient')return out(pharmacyPatient_(e.parameter.token));
  if(action==='refillPatient')return out(refillPatient_(e.parameter.token));
  if(action==='pharmacyPinStatus')return out({ok:1,pinApiVersion:2,configured:true});
  if(!authorizedGet_(e))return out({ok:0,err:'unauthorized'});
  if(action==='pharmacyList')return out({ok:1,items:pharmacyLoad_()});
  if(action==='refillList')return out({ok:1,items:refillLoad_()});
  if(action==='pharmacyDrugList')return out({ok:1,names:pharmacyDrugLoad_()});
  if(action==='stockLoad')return out(stockLoad_());
  if(e&&e.parameter&&e.parameter.check){
    return out({ok:1,ver:sheet_().getRange(1,2).getValue()||0});
  }
  if(e&&e.parameter&&e.parameter.backups){
    return out({ok:1,list:listBackups_()});
  }
  return out(load_());
}
function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents);
    if(req.action==='medicineSpeech')return out(medicineSpeech_(req.text));
    if(req.action==='tkaLogin')return out(tkaLogin_(req.password));
    if(String(req.action||'').indexOf('tka')===0)return out(tkaHandle_(req));
    if(req.action==='pharmacyLogin')return out(pharmacyLogin_(req.pin));
    if(req.action==='pharmacySetPin'){
      if(!authorizedApiKey_(req))return out({ok:0,err:'unauthorized'});
      return out(pharmacySetPin_(req.pin));
    }
    if(!authorizedPost_(req))return out({ok:0,err:'unauthorized'});
    if(req.action==='pharmacyCreate')return out(pharmacyCreate_(req.item));
    if(req.action==='pharmacyUpdate')return out(pharmacyUpdate_(req.id,req.item));
    if(req.action==='pharmacyDelete')return out(pharmacyDelete_(req.id));
    if(req.action==='refillCreate')return out(refillCreate_(req.item));
    if(req.action==='refillUpdate')return out(refillUpdate_(req.id,req.item));
    if(req.action==='refillDelete')return out(refillDelete_(req.id));
    if(req.action==='pharmacyDrugSave')return out(pharmacyDrugSave_(req.names));
    if(req.action==='stockSave')return out(stockSave_(req.data,req.baseVer));
    if(req.action==='save')return out(saveVersioned_(req.data,req.baseVer));
    if(req.action==='backup'){return out(backup_());}
    if(req.action==='restore'){return out(restore_(req.name));}
    if(req.action==='upload'){return out(upload_(req));}
    if(req.action==='setupAutoBackup'){return out(setupAutoBackup_());}
    return out({ok:0,err:'unknown action'});
  }catch(err){return out({ok:0,err:String(err)});}
}
/* ===== เสียงอ่านชื่อยาภาษาไทย (Azure Speech Free F0) =====
 * ตั้งค่า Script Properties: AZURE_SPEECH_KEY และ AZURE_SPEECH_REGION
 * จำกัดที่ 450,000 ตัวอักษรต่อเดือน เพื่อเว้นระยะจากโควตาฟรี 500,000 ตัวอักษร
 */
function medicineSpeechStatus_(){
  const props=PropertiesService.getScriptProperties();
  return {ok:1,configured:!!(props.getProperty('AZURE_SPEECH_KEY')&&props.getProperty('AZURE_SPEECH_REGION')),voice:'th-TH-PremwadeeNeural',tier:'F0'};
}
function medicineSpeechEscape_(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function medicineSpeechHash_(value){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8);
  return bytes.map(function(v){v=v<0?v+256:v;return ('0'+v.toString(16)).slice(-2);}).join('');
}
function medicineSpeech_(value){
  const text=String(value==null?'':value).replace(/\s+/g,' ').trim();
  if(!text||text.length>160)return {ok:0,err:'invalid_text'};
  if(!/^[\u0E00-\u0E7Fa-zA-Z0-9\s.,()%+\-\/]+$/.test(text))return {ok:0,err:'invalid_text'};
  const props=PropertiesService.getScriptProperties();
  const key=props.getProperty('AZURE_SPEECH_KEY'),region=props.getProperty('AZURE_SPEECH_REGION');
  if(!key||!region)return {ok:0,err:'speech_not_configured'};
  const cache=CacheService.getScriptCache(),cacheKey='MED_TTS_'+medicineSpeechHash_(text),saved=cache.get(cacheKey);
  if(saved)return {ok:1,audio:saved,mime:'audio/mpeg',cached:true};
  const month=Utilities.formatDate(new Date(),'GMT+7','yyyy-MM'),monthKey='AZURE_TTS_MONTH',usageKey='AZURE_TTS_CHARS';
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    if(props.getProperty(monthKey)!==month){props.setProperty(monthKey,month);props.setProperty(usageKey,'0');}
    const used=Number(props.getProperty(usageKey)||0);
    if(used+text.length>450000)return {ok:0,err:'free_quota_guard'};
    const ssml='<speak version="1.0" xml:lang="th-TH"><voice name="th-TH-PremwadeeNeural"><prosody rate="-4%">'+medicineSpeechEscape_(text)+'</prosody></voice></speak>';
    const response=UrlFetchApp.fetch('https://'+region+'.tts.speech.microsoft.com/cognitiveservices/v1',{
      method:'post',contentType:'application/ssml+xml',payload:ssml,muteHttpExceptions:true,
      headers:{'Ocp-Apim-Subscription-Key':key,'X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3','User-Agent':'UPH-Medicine-Check'}
    });
    const code=response.getResponseCode();
    if(code<200||code>=300)return {ok:0,err:'speech_provider_'+code};
    const audio=Utilities.base64Encode(response.getBlob().getBytes());
    props.setProperty(usageKey,String(used+text.length));
    if(audio.length<95000)cache.put(cacheKey,audio,21600);
    return {ok:1,audio:audio,mime:'audio/mpeg',cached:false};
  }finally{lock.releaseLock();}
}

function authorizedGet_(e){
  return !!(e&&e.parameter)&&(authorizedApiKey_(e.parameter)||authorizedSession_(e.parameter.session));
}
function authorizedPost_(req){
  return !!req&&(authorizedApiKey_(req)||authorizedSession_(req.session));
}
function authorizedApiKey_(req){
  return !!API_KEY&&!!req&&req.key===API_KEY;
}
function authorizedSession_(token){
  return !!token&&CacheService.getScriptCache().get('PHARMACY_SESSION_'+String(token))==='1';
}
function pharmacyPinHash_(pin){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(pin||''),Utilities.Charset.UTF_8);
  return bytes.map(function(value){const byte=value<0?value+256:value;return ('0'+byte.toString(16)).slice(-2);}).join('');
}
function pharmacySetPin_(pin){
  pin=String(pin==null?'':pin).trim();
  if(!pharmacyValidPin_(pin))return {ok:0,err:'invalid_pin'};
  PropertiesService.getScriptProperties().setProperty('PHARMACY_PIN_HASH',pharmacyPinHash_(pin));
  return {ok:1};
}
function pharmacyValidPin_(pin){
  if(pin.length<4||pin.length>8)return false;
  for(let i=0;i<pin.length;i++)if(pin.charAt(i)<'0'||pin.charAt(i)>'9')return false;
  return true;
}
function pharmacyLogin_(pin){
  pin=String(pin==null?'':pin).trim();
  const saved=PropertiesService.getScriptProperties().getProperty('PHARMACY_PIN_HASH');
  const enteredHash=pharmacyPinHash_(pin);
  const defaultHash=pharmacyPinHash_(DEFAULT_PHARMACY_PIN);
  if(!pharmacyValidPin_(pin)||(saved?enteredHash!==saved:enteredHash!==defaultHash))return {ok:0,err:'unauthorized'};
  const token=Utilities.getUuid().replace(/-/g,'');
  CacheService.getScriptCache().put('PHARMACY_SESSION_'+token,'1',21600);
  return {ok:1,session:token,expiresIn:21600};
}

/* ===== ระบบบริหารเคสผ่าตัด TKA =====
 * การเข้าสู่ระบบใช้รหัสผ่านอย่างเดียว แต่รหัสแต่ละชุดผูกกับบุคคลและบทบาท
 * เก็บเฉพาะ salted hash ใน Script Properties และเก็บ session ชั่วคราวใน Cache
 */
const TKA_CASE_FIELDS=['id','hn','patientName','dob','sex','weight','creatinine','creatinineDate','egfr','crcl','surgeryDate','laterality','surgeon','assignedPharmacist','status','allergies','comorbidities','anticoagulants','notes','meds','createdAt','createdBy','createdByName','updatedAt','updatedBy','updatedByName','archivedAt'];
function tkaHandle_(req){
  if(req.action==='tkaLogout')return tkaLogout_(req.session);
  const actor=tkaSession_(req.session);
  if(!actor)return {ok:0,err:'session_expired'};
  if(req.action==='tkaMe')return {ok:1,user:tkaPublicUser_(actor)};
  if(req.action==='tkaList')return {ok:1,items:tkaCaseLoad_()};
  if(req.action==='tkaCreate')return tkaCaseCreate_(actor,req.item);
  if(req.action==='tkaUpdate')return tkaCaseUpdate_(actor,req.id,req.item);
  if(req.action==='tkaArchive')return tkaCaseArchive_(actor,req.id);
  if(req.action==='tkaRestore')return tkaCaseRestore_(actor,req.id);
  if(req.action==='tkaAuditList')return tkaAuditList_(actor);
  if(req.action==='tkaUserList')return tkaUserList_(actor);
  if(req.action==='tkaUserCreate')return tkaUserCreate_(actor,req.user);
  if(req.action==='tkaUserToggle')return tkaUserToggle_(actor,req.id,req.active);
  return {ok:0,err:'unknown action'};
}
function tkaProps_(){return PropertiesService.getScriptProperties();}
function tkaPepper_(){let p=tkaProps_().getProperty('TKA_PASSWORD_PEPPER');if(!p){p=Utilities.getUuid()+Utilities.getUuid();tkaProps_().setProperty('TKA_PASSWORD_PEPPER',p);}return p;}
function tkaHash_(password,salt){
  const raw=String(salt||'')+'|'+String(password||'')+'|'+tkaPepper_();
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8);
  return bytes.map(function(v){v=v<0?v+256:v;return ('0'+v.toString(16)).slice(-2);}).join('');
}
function tkaUsers_(){try{const v=JSON.parse(tkaProps_().getProperty('TKA_USERS')||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function tkaUsersSave_(users){tkaProps_().setProperty('TKA_USERS',JSON.stringify(users));}
function tkaPublicUser_(u){return {id:u.id,name:u.name,role:u.role,active:u.active!==false,lastLoginAt:u.lastLoginAt||''};}
function tkaLegacyAdmin_(password){
  const saved=tkaProps_().getProperty('PHARMACY_PIN_HASH');
  const entered=pharmacyPinHash_(String(password||'').trim());
  return saved?entered===saved:entered===pharmacyPinHash_(DEFAULT_PHARMACY_PIN);
}
function tkaLogin_(password){
  password=String(password==null?'':password);
  if(password.length<4||password.length>64)return {ok:0,err:'unauthorized'};
  const attempt=tkaHash_(password,'attempt').slice(0,18),cache=CacheService.getScriptCache(),blockKey='TKA_FAIL_'+attempt,globalKey='TKA_FAIL_GLOBAL';
  if(Number(cache.get(blockKey)||0)>=7||Number(cache.get(globalKey)||0)>=30)return {ok:0,err:'too_many_attempts'};
  const users=tkaUsers_();let user=null;
  for(let i=0;i<users.length;i++)if(users[i].active!==false&&tkaHash_(password,users[i].salt)===users[i].hash){user=users[i];break;}
  if(!user&&!users.length&&tkaLegacyAdmin_(password))user={id:'bootstrap-admin',name:'ผู้ดูแลระบบเริ่มต้น',role:'admin',active:true,bootstrap:true};
  if(!user){cache.put(blockKey,String(Number(cache.get(blockKey)||0)+1),900);cache.put(globalKey,String(Number(cache.get(globalKey)||0)+1),900);tkaAudit_({id:'unknown',name:'ไม่ทราบ',role:'unknown'},'LOGIN_FAILED','', 'พยายามเข้าสู่ระบบไม่สำเร็จ');return {ok:0,err:'unauthorized'};}
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const now=new Date().toISOString();user.lastLoginAt=now;
  if(!user.bootstrap)tkaUsersSave_(users);
  cache.put('TKA_SESSION_'+token,JSON.stringify({id:user.id,name:user.name,role:user.role,bootstrap:!!user.bootstrap,lastSeen:new Date().getTime()}),900);
  tkaAudit_(user,'LOGIN','',user.bootstrap?'เข้าสู่ระบบด้วยรหัสผู้ดูแลเดิมเพื่อเริ่มตั้งค่า':'เข้าสู่ระบบสำเร็จ');
  return {ok:1,session:token,expiresIn:21600,user:tkaPublicUser_(user),bootstrap:!!user.bootstrap};
}
function tkaSession_(token){
  if(!token)return null;const cache=CacheService.getScriptCache(),key='TKA_SESSION_'+String(token),raw=cache.get(key);if(!raw)return null;
  try{const actor=JSON.parse(raw),now=new Date().getTime();if(!actor.lastSeen||now-Number(actor.lastSeen)>600000){cache.remove(key);return null;}actor.lastSeen=now;cache.put(key,JSON.stringify(actor),900);return actor;}catch(e){cache.remove(key);return null;}
}
function tkaLogout_(token){const actor=tkaSession_(token);if(actor)tkaAudit_(actor,'LOGOUT','', 'ออกจากระบบ');if(token)CacheService.getScriptCache().remove('TKA_SESSION_'+String(token));return {ok:1};}
function tkaCanEdit_(actor){return actor&&['admin','pharmacist'].indexOf(actor.role)>=0;}
function tkaIsAdmin_(actor){return actor&&actor.role==='admin';}
function tkaClean_(v,n){return String(v==null?'':v).trim().slice(0,n||250);}
function tkaCaseSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName('TKA_Cases');if(!sh)sh=ss.insertSheet('TKA_Cases');
  if(sh.getLastRow()===0)sh.getRange(1,1,1,TKA_CASE_FIELDS.length).setValues([TKA_CASE_FIELDS]);return sh;
}
function tkaCaseLoad_(){
  const sh=tkaCaseSheet_(),last=sh.getLastRow();if(last<2)return [];
  return sh.getRange(2,1,last-1,TKA_CASE_FIELDS.length).getDisplayValues().map(function(row){const o={};TKA_CASE_FIELDS.forEach(function(k,i){o[k]=row[i]||'';});try{o.meds=JSON.parse(o.meds||'[]');}catch(e){o.meds=[];}return o;}).filter(function(o){return o.id;});
}
function tkaMeds_(value){
  const a=Array.isArray(value)?value.slice(0,40):[];return a.map(function(m){return {stage:['preop','intraop','postop'].indexOf(m.stage)>=0?m.stage:'postop',drug:tkaClean_(m.drug,100),dose:tkaClean_(m.dose,160),timing:tkaClean_(m.timing,300),renal:tkaClean_(m.renal,500),status:['planned','verified','given','held'].indexOf(m.status)>=0?m.status:'planned'};}).filter(function(m){return m.drug;});
}
function tkaCaseInput_(input,old){
  input=input||{};const o=Object.assign({},old||{}),text={hn:30,patientName:120,dob:12,sex:10,weight:12,creatinine:12,creatinineDate:12,egfr:12,crcl:12,surgeryDate:12,laterality:12,surgeon:120,assignedPharmacist:120,status:20,allergies:1200,comorbidities:1200,anticoagulants:1200,notes:2400};
  Object.keys(text).forEach(function(k){o[k]=tkaClean_(input[k],text[k]);});
  if(['female','male',''].indexOf(o.sex)<0)o.sex='';if(['right','left','bilateral'].indexOf(o.laterality)<0)o.laterality='right';if(['planned','preop','intraop','postop','complete'].indexOf(o.status)<0)o.status='planned';o.meds=tkaMeds_(input.meds);return o;
}
function tkaCaseRow_(o){return TKA_CASE_FIELDS.map(function(k){return k==='meds'?JSON.stringify(o.meds||[]):o[k]||'';});}
function tkaNextId_(items){const year=Utilities.formatDate(new Date(),'GMT+7','yyyy');let n=0;items.forEach(function(x){const m=String(x.id||'').match(new RegExp('^TKA-'+year+'-(\\d+)$'));if(m)n=Math.max(n,Number(m[1])||0);});return 'TKA-'+year+'-'+('000'+(n+1)).slice(-3);}
function tkaCaseCreate_(actor,input){
  if(!tkaCanEdit_(actor))return {ok:0,err:'forbidden'};const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const items=tkaCaseLoad_(),o=tkaCaseInput_(input,{});if(!o.hn||!o.patientName||!o.surgeryDate)return {ok:0,err:'missing_required_fields'};const now=new Date().toISOString();o.id=tkaNextId_(items);o.createdAt=now;o.createdBy=actor.id;o.createdByName=actor.name;o.updatedAt=now;o.updatedBy=actor.id;o.updatedByName=actor.name;o.archivedAt='';tkaCaseSheet_().appendRow(tkaCaseRow_(o));tkaAudit_(actor,'CASE_CREATE',o.id,'สร้างเคส '+o.id);return {ok:1,item:o};}finally{lock.releaseLock();}
}
function tkaChanged_(a,b){return ['hn','patientName','dob','sex','weight','creatinine','creatinineDate','egfr','crcl','surgeryDate','laterality','surgeon','assignedPharmacist','status','allergies','comorbidities','anticoagulants','notes','meds'].filter(function(k){return JSON.stringify(a[k]||'')!==JSON.stringify(b[k]||'');});}
function tkaCaseUpdate_(actor,id,input){
  if(!tkaCanEdit_(actor))return {ok:0,err:'forbidden'};const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const sh=tkaCaseSheet_(),items=tkaCaseLoad_(),at=items.map(function(x){return x.id;}).indexOf(String(id||''));if(at<0)return {ok:0,err:'not_found'};const old=items[at];if(input&&input.baseUpdatedAt&&old.updatedAt!==input.baseUpdatedAt)return {ok:0,err:'stale'};const o=tkaCaseInput_(input,old);if(!o.hn||!o.patientName||!o.surgeryDate)return {ok:0,err:'missing_required_fields'};const changed=tkaChanged_(old,o);o.id=old.id;o.createdAt=old.createdAt;o.createdBy=old.createdBy;o.createdByName=old.createdByName;o.archivedAt=old.archivedAt;o.updatedAt=new Date().toISOString();o.updatedBy=actor.id;o.updatedByName=actor.name;sh.getRange(at+2,1,1,TKA_CASE_FIELDS.length).setValues([tkaCaseRow_(o)]);tkaAudit_(actor,'CASE_UPDATE',o.id,changed.length?'แก้ไข: '+changed.join(', '):'บันทึกโดยไม่มีข้อมูลเปลี่ยนแปลง');return {ok:1,item:o};}finally{lock.releaseLock();}
}
function tkaCaseArchive_(actor,id){
  if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const sh=tkaCaseSheet_(),items=tkaCaseLoad_(),at=items.map(function(x){return x.id;}).indexOf(String(id||''));if(at<0)return {ok:0,err:'not_found'};const o=items[at];o.archivedAt=new Date().toISOString();o.updatedAt=o.archivedAt;o.updatedBy=actor.id;o.updatedByName=actor.name;sh.getRange(at+2,1,1,TKA_CASE_FIELDS.length).setValues([tkaCaseRow_(o)]);tkaAudit_(actor,'CASE_ARCHIVE',o.id,'เก็บเคสเข้าคลังโดยไม่ลบข้อมูล');return {ok:1};}finally{lock.releaseLock();}
}
function tkaCaseRestore_(actor,id){
  if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const sh=tkaCaseSheet_(),items=tkaCaseLoad_(),at=items.map(function(x){return x.id;}).indexOf(String(id||''));if(at<0)return {ok:0,err:'not_found'};const o=items[at];o.archivedAt='';o.updatedAt=new Date().toISOString();o.updatedBy=actor.id;o.updatedByName=actor.name;sh.getRange(at+2,1,1,TKA_CASE_FIELDS.length).setValues([tkaCaseRow_(o)]);tkaAudit_(actor,'CASE_RESTORE',o.id,'นำเคสกลับจากคลัง');return {ok:1};}finally{lock.releaseLock();}
}
function tkaAuditSheet_(){const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName('TKA_Audit');if(!sh)sh=ss.insertSheet('TKA_Audit');if(sh.getLastRow()===0)sh.appendRow(['at','actorId','actorName','role','action','caseId','summary']);return sh;}
function tkaAudit_(actor,action,caseId,summary){try{tkaAuditSheet_().appendRow([new Date().toISOString(),actor&&actor.id||'',actor&&actor.name||'',actor&&actor.role||'',action||'',caseId||'',tkaClean_(summary,800)]);}catch(e){}}
function tkaAuditList_(actor){if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};const sh=tkaAuditSheet_(),last=sh.getLastRow();if(last<2)return {ok:1,items:[]};const start=Math.max(2,last-499),rows=sh.getRange(start,1,last-start+1,7).getDisplayValues();const items=rows.map(function(r){return {at:r[0],actorId:r[1],actorName:r[2],role:r[3],action:r[4],caseId:r[5],summary:r[6]};}).reverse();return {ok:1,items:items};}
function tkaUserList_(actor){if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};return {ok:1,items:tkaUsers_().map(tkaPublicUser_)};}
function tkaUserCreate_(actor,input){
  if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};input=input||{};const name=tkaClean_(input.name,80),password=String(input.password||''),users=tkaUsers_();let role=['admin','pharmacist','viewer'].indexOf(input.role)>=0?input.role:'viewer';if(!users.length)role='admin';if(!name||password.length<8||password.length>64||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return {ok:0,err:'invalid_user'};
  for(let i=0;i<users.length;i++)if(tkaHash_(password,users[i].salt)===users[i].hash)return {ok:0,err:'password_in_use'};
  const salt=Utilities.getUuid(),u={id:'U-'+Utilities.getUuid().slice(0,8),name:name,role:role,active:true,salt:salt,hash:tkaHash_(password,salt),createdAt:new Date().toISOString(),createdBy:actor.id,lastLoginAt:''};users.push(u);tkaUsersSave_(users);tkaAudit_(actor,'USER_CREATE','', 'สร้างผู้ใช้ '+name+' สิทธิ์ '+role);return {ok:1,user:tkaPublicUser_(u),firstUser:users.length===1};
}
function tkaUserToggle_(actor,id,active){
  if(!tkaIsAdmin_(actor))return {ok:0,err:'forbidden'};const users=tkaUsers_(),at=users.map(function(u){return u.id;}).indexOf(String(id||''));if(at<0)return {ok:0,err:'not_found'};if(users[at].id===actor.id&&!active)return {ok:0,err:'cannot_disable_self'};if(users[at].role==='admin'&&!active&&users.filter(function(u){return u.active!==false&&u.role==='admin';}).length<=1)return {ok:0,err:'last_admin'};users[at].active=!!active;tkaUsersSave_(users);tkaAudit_(actor,active?'USER_ENABLE':'USER_DISABLE','', (active?'เปิดใช้ ':'ระงับ ')+users[at].name);return {ok:1};
}
/* ===== ระบบแจ้งสถานะรอยา: เก็บในแท็บ PharmacyWaiting ===== */
function pharmacySheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName('PharmacyWaiting');
  if(!sh)sh=ss.insertSheet('PharmacyWaiting');
  return sh;
}
function pharmacyLoad_(){
  const raw=pharmacySheet_().getRange(1,1).getValue();
  if(!raw)return [];
  try{const rows=JSON.parse(raw);return Array.isArray(rows)?rows:[];}catch(err){return [];}
}
function pharmacySave_(items){
  pharmacySheet_().getRange(1,1).setValue(JSON.stringify(items));
}
function pharmacyClean_(v,n){return String(v||'').trim().slice(0,n||250);}
function pharmacyItem_(input,old){
  const fields=['hn','patient','drug','unit','quantity','prescribedQuantity','dispensedQuantity','availableDate','status','note','receiveMethod','recipientName','phone1','phone2','deliveryAddress'];
  const item={};
  fields.forEach(function(k){item[k]=pharmacyClean_(input&&input[k],(k==='note'||k==='deliveryAddress')?1200:250);});
  if(['waiting','ready','delivery','received','cancelled'].indexOf(item.status)<0)item.status='waiting';
  return Object.assign({},old||{},item);
}
function pharmacyCreate_(input){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const items=pharmacyLoad_();
    const year=Utilities.formatDate(new Date(),'GMT+7','yyyy');
    let seq=0;items.forEach(function(x){if(String(x.id||'').indexOf(year+'-')===0)seq=Math.max(seq,Number(String(x.id).split('-')[1])||0);});
    const now=new Date().toISOString();
    const requestedId=pharmacyClean_(input&&input.id,20).toUpperCase();
    const requestedToken=pharmacyClean_(input&&input.publicToken,80);
    const existingAt=items.map(function(x){return x.id;}).indexOf(requestedId);
    if(existingAt>=0){
      if(requestedToken&&items[existingAt].publicToken===requestedToken){
        const replay=pharmacyItem_(input,items[existingAt]);replay.id=items[existingAt].id;replay.publicToken=items[existingAt].publicToken;replay.createdAt=items[existingAt].createdAt;replay.updatedAt=now;
        const replayHistory=Array.isArray(items[existingAt].statusHistory)?items[existingAt].statusHistory.slice():[];if(items[existingAt].status!==replay.status)replayHistory.push({status:replay.status,at:now});replay.statusHistory=replayHistory;items[existingAt]=replay;pharmacySave_(items);return {ok:1,item:replay};
      }
      return {ok:0,err:'id_conflict'};
    }
    const item=pharmacyItem_(input,{});
    item.id=/^\d{4}-\d{3}$/.test(requestedId)?requestedId:year+'-'+('000'+(seq+1)).slice(-3);
    item.publicToken=/^[A-Za-z0-9]{16,80}$/.test(requestedToken)?requestedToken:Utilities.getUuid().replace(/-/g,'');
    item.createdAt=pharmacyClean_(input&&input.createdAt,50)||now;item.updatedAt=now;item.statusHistory=Array.isArray(input&&input.statusHistory)&&input.statusHistory.length?input.statusHistory:[{status:item.status,at:item.createdAt}];
    items.unshift(item);pharmacySave_(items);return {ok:1,item:item};
  }finally{lock.releaseLock();}
}
function pharmacyUpdate_(id,input){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const items=pharmacyLoad_();const at=items.map(function(x){return x.id;}).indexOf(String(id||'').toUpperCase());
    if(at<0)return {ok:0,err:'not_found'};
    const item=pharmacyItem_(input,items[at]);item.id=items[at].id;item.publicToken=items[at].publicToken;item.createdAt=items[at].createdAt;item.updatedAt=new Date().toISOString();
    const history=Array.isArray(items[at].statusHistory)?items[at].statusHistory.slice():[];
    if(!history.length)history.push({status:items[at].status||'waiting',at:items[at].createdAt||items[at].updatedAt||item.updatedAt});
    if(items[at].status!==item.status)history.push({status:item.status,at:item.updatedAt});
    item.statusHistory=history;
    items[at]=item;pharmacySave_(items);return {ok:1,item:item};
  }finally{lock.releaseLock();}
}
function pharmacyDelete_(id){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const items=pharmacyLoad_();const next=items.filter(function(x){return x.id!==String(id||'').toUpperCase();});if(next.length===items.length)return {ok:0,err:'not_found'};pharmacySave_(next);return {ok:1};}finally{lock.releaseLock();}
}
function pharmacyPatient_(token){
  const item=pharmacyLoad_().filter(function(x){return x.publicToken===String(token||'');})[0];
  if(!item)return {ok:0,err:'not_found'};
  return {ok:1,item:{id:item.id,patient:item.patient,drug:item.drug,quantity:item.quantity,availableDate:item.availableDate,status:item.status,note:item.note,createdAt:item.createdAt,updatedAt:item.updatedAt,statusHistory:item.statusHistory||[]}};
}
/* ===== ระบบจัดการยารีฟิว: เก็บแยกในแท็บ PharmacyRefill ===== */
function refillSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName('PharmacyRefill');
  if(!sh)sh=ss.insertSheet('PharmacyRefill');
  return sh;
}
function refillLoad_(){
  const raw=refillSheet_().getRange(1,1).getValue();
  if(!raw)return [];
  try{const rows=JSON.parse(raw);return Array.isArray(rows)?rows:[];}catch(err){return [];}
}
function refillSave_(items){refillSheet_().getRange(1,1).setValue(JSON.stringify(items));}
function refillItem_(input,old){
  const fields=['hn','patient','drug','unit','quantity','prescribedQuantity','dispensedQuantity','availableDate','status','note','receiveMethod','recipientName','phone1','phone2','deliveryAddress'];
  const item={};fields.forEach(function(k){item[k]=pharmacyClean_(input&&input[k],(k==='note'||k==='deliveryAddress')?1200:250);});
  if(['waiting','ready','delivery','received','cancelled'].indexOf(item.status)<0)item.status='waiting';
  return Object.assign({},old||{},item);
}
function refillCreate_(input){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const items=refillLoad_();const year=Utilities.formatDate(new Date(),'GMT+7','yyyy');let seq=0;
    items.forEach(function(x){if(String(x.id||'').indexOf(year+'-')===0)seq=Math.max(seq,Number(String(x.id).split('-')[1])||0);});
    const now=new Date().toISOString();const requestedId=pharmacyClean_(input&&input.id,20).toUpperCase();const requestedToken=pharmacyClean_(input&&input.publicToken,80);
    const existingAt=items.map(function(x){return x.id;}).indexOf(requestedId);
    if(existingAt>=0){
      if(requestedToken&&items[existingAt].publicToken===requestedToken){const replay=refillItem_(input,items[existingAt]);replay.id=items[existingAt].id;replay.publicToken=items[existingAt].publicToken;replay.createdAt=items[existingAt].createdAt;replay.updatedAt=now;const replayHistory=Array.isArray(items[existingAt].statusHistory)?items[existingAt].statusHistory.slice():[];if(items[existingAt].status!==replay.status)replayHistory.push({status:replay.status,at:now});replay.statusHistory=replayHistory;items[existingAt]=replay;refillSave_(items);return {ok:1,item:replay};}
      return {ok:0,err:'id_conflict'};
    }
    const item=refillItem_(input,{});item.id=/^\d{4}-\d{3}$/.test(requestedId)?requestedId:year+'-'+('000'+(seq+1)).slice(-3);item.publicToken=/^[A-Za-z0-9]{16,80}$/.test(requestedToken)?requestedToken:Utilities.getUuid().replace(/-/g,'');item.createdAt=pharmacyClean_(input&&input.createdAt,50)||now;item.updatedAt=now;item.statusHistory=Array.isArray(input&&input.statusHistory)&&input.statusHistory.length?input.statusHistory:[{status:item.status,at:item.createdAt}];
    items.unshift(item);refillSave_(items);return {ok:1,item:item};
  }finally{lock.releaseLock();}
}
function refillUpdate_(id,input){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const items=refillLoad_();const at=items.map(function(x){return x.id;}).indexOf(String(id||'').toUpperCase());
    if(at<0)return {ok:0,err:'not_found'};
    const item=refillItem_(input,items[at]);item.id=items[at].id;item.publicToken=items[at].publicToken;item.createdAt=items[at].createdAt;item.updatedAt=new Date().toISOString();
    const history=Array.isArray(items[at].statusHistory)?items[at].statusHistory.slice():[];
    if(!history.length)history.push({status:items[at].status||'waiting',at:items[at].createdAt||items[at].updatedAt||item.updatedAt});
    if(items[at].status!==item.status)history.push({status:item.status,at:item.updatedAt});
    item.statusHistory=history;items[at]=item;refillSave_(items);return {ok:1,item:item};
  }finally{lock.releaseLock();}
}
function refillDelete_(id){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const items=refillLoad_();const next=items.filter(function(x){return x.id!==String(id||'').toUpperCase();});if(next.length===items.length)return {ok:0,err:'not_found'};refillSave_(next);return {ok:1};}finally{lock.releaseLock();}
}
function refillPatient_(token){
  const item=refillLoad_().filter(function(x){return x.publicToken===String(token||'');})[0];
  if(!item)return {ok:0,err:'not_found'};
  return {ok:1,item:{id:item.id,patient:item.patient,drug:item.drug,quantity:item.quantity,availableDate:item.availableDate,status:item.status,note:item.note,createdAt:item.createdAt,updatedAt:item.updatedAt,statusHistory:item.statusHistory||[]}};
}
function pharmacyDrugSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName('PharmacyDrugNames');
  if(!sh){sh=ss.insertSheet('PharmacyDrugNames');sh.getRange(1,1).setValue('ชื่อยา');}
  if(!sh.getRange(1,1).getValue())sh.getRange(1,1).setValue('ชื่อยา');
  return sh;
}
function pharmacyDrugLoad_(){
  const sh=pharmacyDrugSheet_();const last=sh.getLastRow();
  if(last<2)return [];
  const values=sh.getRange(2,1,last-1,1).getDisplayValues().map(function(row){return pharmacyClean_(row[0],250);}).filter(Boolean);
  const seen={};return values.filter(function(name){const key=name.toLocaleLowerCase();if(seen[key])return false;seen[key]=1;return true;});
}
function pharmacyDrugSave_(input){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const incoming=Array.isArray(input)?input:[];
    const all=pharmacyDrugLoad_().concat(incoming.map(function(name){return pharmacyClean_(name,250);}).filter(Boolean));
    const seen={};const names=all.filter(function(name){const key=name.toLocaleLowerCase();if(seen[key])return false;seen[key]=1;return true;}).sort();
    const sh=pharmacyDrugSheet_();sh.clearContents();sh.getRange(1,1).setValue('ชื่อยา');
    if(names.length)sh.getRange(2,1,names.length,1).setValues(names.map(function(name){return [name];}));
    return {ok:1,names:names};
  }finally{lock.releaseLock();}
}
/* ===== ระบบแจ้งเตือนเบิกยา: เก็บแยกในแท็บ VirtualStock ===== */
function stockSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName('VirtualStock');
  if(!sh)sh=ss.insertSheet('VirtualStock');
  return sh;
}
function stockLoad_(){
  const sh=stockSheet_();
  const ver=sh.getRange(1,2).getValue()||0;
  const n=Number(sh.getRange(1,1).getValue())||0;
  if(!n)return {ok:1,data:null,ver:0};
  let json='';
  const values=sh.getRange(2,1,n,1).getValues();
  for(let i=0;i<n;i++)json+=values[i][0];
  try{return {ok:1,data:JSON.parse(json),ver:ver};}
  catch(err){return {ok:0,err:'stock_data_invalid'};}
}
function stockSave_(data,baseVer){
  if(!data||!Array.isArray(data.drugs)||!Array.isArray(data.daily)||!Array.isArray(data.refills))return {ok:0,err:'invalid_stock_data'};
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const current=stockLoad_();
    if(current.data&&String(baseVer||0)!==String(current.ver||0))return {ok:0,err:'stale',data:current.data,ver:current.ver};
    const json=JSON.stringify(data);
    const CHUNK=45000,chunks=[];
    for(let i=0;i<json.length;i+=CHUNK)chunks.push([json.substr(i,CHUNK)]);
    const sh=stockSheet_(),ver=new Date().getTime();
    sh.clearContents();
    sh.getRange(1,1).setValue(chunks.length);
    sh.getRange(1,2).setValue(ver);
    if(chunks.length)sh.getRange(2,1,chunks.length,1).setValues(chunks);
    return {ok:1,ver:ver};
  }finally{lock.releaseLock();}
}
function backup_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const name='Backup '+Utilities.formatDate(new Date(),'GMT+7','dd-MM-yyyy HH.mm');
  const old=ss.getSheetByName(name);
  if(old)ss.deleteSheet(old);
  sheet_().copyTo(ss).setName(name);
  return {ok:1,name:name};
}
function setupAutoBackup_(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='autoBackupDaily_')ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoBackupDaily_')
    .timeBased()
    .everyDays(1)
    .atHour(17)
    .nearMinute(0)
    .create();
  PropertiesService.getScriptProperties().setProperty('AUTO_BACKUP_ENABLED','1');
  return {ok:1};
}
function autoBackupDaily_(){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('DATA_CHANGED')!=='1')return;
  const today=Utilities.formatDate(new Date(),'GMT+7','yyyy-MM-dd');
  if(props.getProperty('LAST_AUTO_BACKUP_DATE')===today)return;
  const r=backup_();
  if(r&&r.ok){
    props.setProperty('LAST_AUTO_BACKUP_DATE',today);
    props.deleteProperty('DATA_CHANGED');
  }
}
function listBackups_(){
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .map(function(s){return s.getName();})
    .filter(function(n){return n.indexOf('Backup ')===0;})
    .sort().reverse();
}
function restore_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const b=ss.getSheetByName(name);
  if(!b)return {ok:0,err:'backup not found'};
  const n=Number(b.getRange(1,1).getValue())||0;
  if(!n)return {ok:0,err:'backup empty'};
  let s='';
  const vals=b.getRange(2,1,n,1).getValues();
  for(let i=0;i<n;i++)s+=vals[i][0];
  const data=JSON.parse(s);
  const ver=save_(data);
  return {ok:1,data:data,ver:ver};
}
function upload_(req){
  const folderName='ไฟล์แนบเคส-ระบบรายงานยา';
  const it=DriveApp.getFoldersByName(folderName);
  const folder=it.hasNext()?it.next():DriveApp.createFolder(folderName);
  const bytes=Utilities.base64Decode(req.data);
  const blob=Utilities.newBlob(bytes,req.mime||'application/pdf',req.name||'file.pdf');
  const file=folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return {ok:1,url:file.getUrl(),name:file.getName()};
}
function sheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(SHEET_NAME);
  if(!sh)sh=ss.insertSheet(SHEET_NAME);
  return sh;
}
function load_(){
  const sh=sheet_();
  const ver=sh.getRange(1,2).getValue()||0;
  const n=Number(sh.getRange(1,1).getValue())||0;
  if(!n)return {ok:1,data:null,ver:0};
  let s='';
  const vals=sh.getRange(2,1,n,1).getValues();
  for(let i=0;i<n;i++)s+=vals[i][0];
  return {ok:1,data:JSON.parse(s),ver:ver};
}
function mergeProtectedFields_(oldData,newData){
  if(!oldData||!newData)return newData;
  const oldById={};
  (oldData.patients||[]).forEach(function(p){if(p&&p.id)oldById[p.id]=p;});
  (newData.patients||[]).forEach(function(p){
    const old=oldById[p&&p.id];
    if(!old)return;
    if(old.pdfUrl&&!p.pdfUrl)p.pdfUrl=old.pdfUrl;
    if(old.pdfName&&!p.pdfName)p.pdfName=old.pdfName;
  });
  return newData;
}
function writeData_(sh,data){
  const s=JSON.stringify(data);
  const CH=45000;
  const chunks=[];
  for(let i=0;i<s.length;i+=CH)chunks.push([s.substr(i,CH)]);
  const ver=new Date().getTime();
  sh.clearContents();
  sh.getRange(1,1).setValue(chunks.length);
  sh.getRange(1,2).setValue(ver);
  sh.getRange(2,1,chunks.length,1).setValues(chunks);
  mirror_(data);
  PropertiesService.getScriptProperties().setProperty('DATA_CHANGED','1');
  return ver;
}
function saveVersioned_(data,baseVer){
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    const sh=sheet_();
    const current=load_();
    if(baseVer&&current.ver&&String(baseVer)!==String(current.ver)){
      return {ok:0,err:'stale',data:current.data,ver:current.ver};
    }
    const ver=writeData_(sh,mergeProtectedFields_(current.data,data));
    return {ok:1,ver:ver};
  }finally{lock.releaseLock();}
}
function save_(data){
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    return writeData_(sheet_(),data);
  }finally{lock.releaseLock();}
}
function mirror_(data){
  try{
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    let sh=ss.getSheetByName('รายงาน');
    if(!sh)sh=ss.insertSheet('รายงาน');
    sh.clearContents();
    const head=['ชื่อผู้ป่วย','HN','เบอร์โทร','อายุ','สิทธิ์','ยา','แพทย์','สถานะ','ได้รับยาแล้ว(Dose)','รับยาล่าสุด','วันที่อนุมัติ','วันนัด','หมายเหตุ'];
    const DR={deno:'Denosumab',teri:'Teriparatide'};
    const ST={pending:'ลงทะเบียนแล้ว รออนุมัติ',waiting:'อนุมัติแล้ว รอทำนัดฉีดยา',active:'ทำนัดแล้ว รอรับยา',waitnext:'ใช้ยาอยู่ รอทำนัดครั้งถัดไป',done:'สิ้นสุดการรักษา'};
    const rows=(data.patients||[]).map(function(p){
      return [p.name,p.hn,p.phone,p.age,p.right,DR[p.drug]||p.drug,p.doctor,ST[p.status]||p.status,p.doses||0,p.lastDose||'',p.approved,p.appt,p.note];
    });
    sh.getRange(1,1,1,head.length).setValues([head]);
    if(rows.length)sh.getRange(2,1,rows.length,head.length).setValues(rows);
    mirrorList_(ss,'แพทย์',['รายชื่อแพทย์'],(data.doctors||[]).map(function(d){return [d];}));
    const DR2={deno:'Denosumab',teri:'Teriparatide'};
    mirrorList_(ss,'Stock',['ยา','Lot','วันหมดอายุ','จำนวน'],(data.stock||[]).map(function(s){return [DR2[s.drug]||s.drug,s.lot||'',s.exp||'',s.qty||0];}));
    const SG=[['ortho','หัวหน้าภาควิชาออร์โธปิดิกส์'],['pharm','หัวหน้างานเภสัชกรรม'],['deputy','รองผู้อำนวยการฝ่ายการแพทย์'],['director','ผู้อำนวยการโรงพยาบาล']];
    mirrorList_(ss,'ผู้ลงนาม',['ตำแหน่ง','ชื่อ'],SG.map(function(x){return [x[1],(data.signers&&data.signers[x[0]])||''];}));
  }catch(e){}
}
function mirrorList_(ss,name,head,rows){
  let sh=ss.getSheetByName(name);
  if(!sh)sh=ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1,1,1,head.length).setValues([head]);
  if(rows.length)sh.getRange(2,1,rows.length,head.length).setValues(rows);
}
function out(o){
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

const $=id=>document.getElementById(id),base=(window.ROSTER_API_BASE||'').replace(/\/$/,''),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let currentUser='';
async function api(path,options={}){const r=await fetch(base+path,{...options,headers:{authorization:'Bearer '+(sessionStorage.getItem('roster-session')||''),...(options.body?{'content-type':'application/json'}:{})}}),j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'เชื่อมต่อไม่ได้'),{status:r.status});return j;}
function mode(){const reset=$('account-mode').value==='PUT';$('new-user-label').hidden=reset;$('existing-user-label').hidden=!reset;$('person-label').hidden=reset;$('new-username').required=!reset;$('account-person').required=!reset;$('account-save').textContent=reset?'เปลี่ยนรหัสผ่าน':'สร้างบัญชี';}
async function refresh(){const j=await api('/api/accounts');const options=j.people.map(({id,name})=>'<option value="'+id+'">'+esc(name)+'</option>').join('');$('purge-person').innerHTML='<option value="">เลือกบุคลากร</option>'+options;$('purge-submit').disabled=false;$('account-list').innerHTML=j.users.map(u=>`<p><b>${esc(u.username)}</b> · ${u.role==='admin'?'ผู้ดูแลระบบ':esc(j.people.find(p=>p.id===u.personId)?.name||'รหัสบุคลากร '+u.personId)}</p>`).join('');$('existing-username').innerHTML=j.users.map(u=>`<option value="${esc(u.username)}">${esc(u.username)}${u.role==='admin'?' (admin)':''}</option>`).join('');$('account-person').innerHTML=j.people.filter(p=>!j.users.some(u=>u.personId===p.id)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');}
$('account-mode').onchange=mode;
$('account-form').onsubmit=async e=>{e.preventDefault();if($('account-password').value!==$('confirm-password').value){$('account-status').textContent='รหัสผ่านยืนยันไม่ตรงกัน';return;}$('account-save').disabled=true;const method=$('account-mode').value,username=method==='PUT'?$('existing-username').value:$('new-username').value;try{await api('/api/accounts',{method,body:JSON.stringify({username,personId:Number($('account-person').value),password:$('account-password').value})});$('account-password').value='';$('confirm-password').value='';$('account-status').textContent='บันทึกแล้ว แจ้งชื่อผู้ใช้และรหัสผ่านใหม่ให้เจ้าของบัญชี';if(method==='PUT'&&username.toLowerCase()===currentUser){sessionStorage.removeItem('roster-session');location.replace('./');return;}await refresh();}catch(error){$('account-status').textContent=error.message;}finally{$('account-save').disabled=false;}};
$('purge-form').onsubmit=async event=>{
 event.preventDefault();
 const selected=$('purge-person').selectedOptions[0];
 const exactName=$('purge-confirm-name').value.trim();
 if(!selected?.value||exactName!==selected.textContent.trim()){
  $('purge-status').textContent='กรุณาพิมพ์ชื่อให้ตรงกับรายชื่อที่เลือก';
  return;
 }
 $('purge-submit').disabled=true;
 try{
  await api('/api/roster/person/purge',{method:'POST',body:JSON.stringify({personId:Number(selected.value),name:exactName})});
  $('purge-confirm-name').value='';
  await refresh();
  $('purge-status').textContent='ลบ '+exactName+' จากระบบส่วนกลางแล้ว';
 }catch(error){$('purge-status').textContent=error.message;}
 finally{$('purge-submit').disabled=false;}
};
try{const s=await api('/api/session');if(!s.owner)throw Error('เฉพาะ admin เท่านั้น');currentUser=s.username;await refresh();mode();}catch(error){$('account-save').disabled=true;$('account-status').textContent=error.message;if(error.status===401)location.replace('./');}

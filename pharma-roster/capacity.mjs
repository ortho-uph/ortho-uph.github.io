// Count only newly added shift parts; keeping or reducing an existing booking remains possible.
export function capacityConflict(config,personId,source,previous={}){
 for(const[d,value]of Object.entries(source)){
  const day=Number(d),dow=new Date(config.year,config.month-1,day).getDay(),off=[0,6].includes(dow)||(config.holidays||[]).includes(day);
  for(const[code,limit,label]of [['บ',2,'บ่าย'],['ด',1,'ดึก'],...(off?[['ช',2,'เช้าวันหยุด']]:[])]){
   if(!value.includes(code)||(previous[d]||'').includes(code))continue;
   const others=config.team.filter(p=>p.id!==personId&&(p.source[d]||'').includes(code)).length;
   if(others>=limit)return{day,code,label,limit};
  }
 }
 return null;
}

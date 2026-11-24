// Count only newly added shift parts; keeping or reducing an existing booking remains possible.
export function capacityConflict(config,personId,source,previous={}){
 for(const[d,value]of Object.entries(source)){
  const day=Number(d),dow=new Date(config.year,config.month-1,day).getDay(),off=[0,6].includes(dow)||(config.holidays||[]).includes(day);
  const [b,n,m,hb,hn]=config.staffing??[2,1,2,2,1];
  for(const[code,limit,label]of [['บ',off?hb:b,'บ่าย'],['ด',off?hn:n,'ดึก'],...(off?[['ช',m,'เช้าวันหยุด']]:[])]){
   if(!value.includes(code)||(previous[d]||'').includes(code))continue;
   const others=config.team.filter(p=>p.id!==personId&&(p.source[d]||'').includes(code)).length;
   if(others>=limit)return{day,code,label,limit};
  }
 }
 return null;
}

import {solve} from './engine.mjs?v=pairs1';
self.onmessage=async({data})=>{
 try{
  const {solveCP}=await import('./cp-roster.mjs?v=pairs1');
  const shifts=await solveCP(data);
  self.postMessage({type:'done',shifts,solver:'CP-SAT'});
 }catch(error){
  try{
   const shifts=solve(data,{allowQuotaPreview:true});
   self.postMessage({type:'done',shifts,solver:'ตัวจัดสำรอง',reason:error.message});
  }catch(fallback){self.postMessage({type:'error',message:fallback.message});}
 }
};

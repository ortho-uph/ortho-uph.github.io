import{solve}from'./engine.mjs?v=rerun1';
self.onmessage=e=>{try{const shifts=solve(e.data,{allowQuotaPreview:true,onProgress:p=>self.postMessage({type:'progress',...p})});self.postMessage({type:'done',shifts});}catch(error){self.postMessage({type:'error',message:error.message});}};

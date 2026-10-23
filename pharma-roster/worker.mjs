import{solve}from'./engine.mjs';
self.onmessage=e=>{try{const shifts=solve(e.data,{onProgress:p=>self.postMessage({type:'progress',...p})});self.postMessage({type:'done',shifts});}catch(error){self.postMessage({type:'error',message:error.message});}};

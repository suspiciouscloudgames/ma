// The gallery wakes the bounded server queue. Uploads never await translation.
export function startTranslationWorker(isPaused:()=>boolean,onCompleted:()=>void,send:typeof fetch=fetch){
 let stopped=false,running=false;
 const run=async()=>{
  if(stopped||running||isPaused()||document.visibilityState==='hidden')return;
  running=true;
  try{
   const response=await send('https://lhpfrkumzpinzgkkmgmd.supabase.co/functions/v1/translate-workshop',{method:'POST',headers:{apikey:'sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL'},signal:AbortSignal.timeout(120000)});
   if(response.ok){const body=await response.json();if(body.processed&&!stopped)onCompleted();}
  }catch{/* Translation failure must not alter the original canvas or upload UI. */}
  finally{running=false;}
 };
 const resume=()=>{void run();};
 const timer=setInterval(resume,4000);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);resume();
 return()=>{stopped=true;clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
}

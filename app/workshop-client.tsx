'use client';
import { useEffect,useRef,useState } from 'react';
import { readState,subscribeTables,type ExhibitState } from './supabase';
import { enqueue,flush,jobs,retryBlocked,observeJobs,type Job } from './outbox';

export function useExhibitState() {
  const [state,setState]=useState<ExhibitState>({id:true,display_mode:'none',questions_enabled:false,locale:'ko',version:0});
  useEffect(()=>{let alive=true; const refresh=async()=>{const next=await readState();if(alive)setState(old=>next.version>=old.version?next:old);};const off=subscribeTables(refresh,['exhibit_state']);return()=>{alive=false;off();};},[]);
  return state;
}
export function useDraft<T>(key:string,initial:T) {
  const [value,setValue]=useState(initial);const ready=useRef(false);
  useEffect(()=>{try{const saved=localStorage.getItem(key);if(saved)setValue(JSON.parse(saved));}catch{}ready.current=true;},[key]);
  const update=(next:T)=>{setValue(next);if(ready.current)try{localStorage.setItem(key,JSON.stringify(next));}catch{}};
  return [value,update] as const;
}
export function useSubmission(kind:Job['kind']) {
  const [state,setState]=useState<'idle'|'saving'|'pending'|'sent'|'blocked'|'storage'>('idle');
  const lock=useRef(false); const id=useRef<string|null>(null);
  useEffect(()=>{let alive=true;try{id.current=localStorage.getItem(`ma-current-${kind}`);}catch{}
    const refresh=async()=>{try{const job=(await jobs()).find(j=>j.id===id.current);if(alive&&job)setState(job.state);}catch{}};
    void refresh(); const off=observeJobs(refresh);return()=>{alive=false;off();};
  },[kind]);
  const submit=async(input:Omit<Parameters<typeof enqueue>[0],'kind'>)=>{
    if(lock.current||['pending','saving'].includes(state))return false;lock.current=true;setState('saving');
    id.current=null;
    try{id.current=await enqueue({...input,kind});try{localStorage.setItem(`ma-current-${kind}`,id.current);}catch{}setState('pending');try{const job=(await jobs()).find(j=>j.id===id.current);if(job)setState(job.state);}catch{/* Already saved: an optional status read must not enable duplicate submission. */}return true;}
    catch{setState('storage');return false;}finally{lock.current=false;}
  };
  return {state,submit,reset:()=>{id.current=null;try{localStorage.removeItem(`ma-current-${kind}`);}catch{}setState('idle');},busy:state==='pending'||state==='saving'};
}
export function SubmissionStatus({state,en,tr=false,onRetry}:{state:string;en:boolean;tr?:boolean;onRetry?:()=>void|Promise<void>}) {
  if(state==='sent')return <p aria-live="polite" className="submission-status">{tr?"Gönderildi.":en?'Sent successfully.':'전송 완료'}</p>;
  // Blocked durable jobs are handled by the shared retry notice below.
  if(state!=='storage')return null;
  return <p aria-live="polite" className="submission-status">{tr?"Gönderilemedi. Lütfen tekrar deneyin.":en?'Could not send. Please try again.':'전송하지 못했습니다. 다시 보내주세요.'}{onRetry&&<button onClick={()=>void onRetry()}>{tr?"Tekrar dene":en?'Retry':'다시 보내기'}</button>}</p>;
}
export default function WorkshopClient() {
  const state=useExhibitState();const [blocked,setBlocked]=useState(0);const tr=state.locale==='tr',en=state.locale==='en';
  useEffect(()=>{document.documentElement.lang=state.locale;},[state.locale]);
  useEffect(()=>{let alive=true;const refresh=()=>{void jobs().then(all=>{if(alive)setBlocked(all.filter(j=>j.state==='blocked').length);}).catch(()=>{});};
    const resume=()=>{if(document.visibilityState==='visible'){void flush(true);refresh();}};
    const off=observeJobs(refresh);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);const timer=setInterval(()=>{void flush();},3000);resume();
    return()=>{alive=false;clearInterval(timer);off();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  return blocked>0?<aside className="outbox-status" aria-live="polite"><span>{tr?"Gönderilemedi. Lütfen tekrar deneyin.":en?'Could not send. Please try again.':'전송하지 못했습니다. 다시 보내주세요.'} <button onClick={()=>void retryBlocked()}>{tr?"Tekrar dene":en?'Retry':'다시 보내기'}</button></span></aside>:null;
}

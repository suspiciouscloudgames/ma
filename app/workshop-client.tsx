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
    try{id.current=await enqueue({...input,kind});try{localStorage.setItem(`ma-current-${kind}`,id.current);}catch{}setState('pending');const job=(await jobs()).find(j=>j.id===id.current);if(job)setState(job.state);return true;}
    catch{setState('storage');return false;}finally{lock.current=false;}
  };
  return {state,submit,reset:()=>{id.current=null;try{localStorage.removeItem(`ma-current-${kind}`);}catch{}setState('idle');},busy:state==='pending'||state==='saving'};
}
export function SubmissionStatus({state,en}:{state:string;en:boolean}) {
  return <p aria-live="polite" className="submission-status">{state==='pending'||state==='saving'?(en?'Waiting to send. Keep this page open; it will retry automatically.':'전송 대기 중 · 페이지를 열어두면 자동으로 다시 보냅니다.'):state==='sent'?(en?'Sent successfully.':'전송 완료'):state==='storage'?(en?'Your device could not save this item. Keep this page open and free some storage before trying again.':'기기에 임시 저장하지 못했습니다. 페이지를 닫지 말고 저장 공간을 확보한 뒤 다시 눌러주세요.'):state==='blocked'?(en?'This item needs attention. Your copy is saved on this device; please ask the facilitator.':'이 항목은 확인이 필요합니다. 기기에 보관되어 있으니 진행자에게 알려주세요.'):''}</p>;
}
export default function WorkshopClient() {
  const state=useExhibitState();const [pending,setPending]=useState(0),[blocked,setBlocked]=useState(0);const en=state.locale==='en';
  useEffect(()=>{document.documentElement.lang=state.locale;},[state.locale]);
  useEffect(()=>{let alive=true;const refresh=()=>{void jobs().then(all=>{if(alive){setPending(all.filter(j=>j.state==='pending').length);setBlocked(all.filter(j=>j.state==='blocked').length);}}).catch(()=>{});};
    const resume=()=>{if(document.visibilityState==='visible'){void flush(true);refresh();}};
    const off=observeJobs(refresh);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);const timer=setInterval(()=>{void flush();},3000);resume();
    return()=>{alive=false;clearInterval(timer);off();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  return pending||blocked?<aside className="outbox-status" aria-live="polite">{pending>0&&(en?`${pending} waiting to send · Keep this page open`:`${pending}건 전송 대기 중 · 페이지를 열어두세요`)}{blocked>0&&<span> {en?`${blocked} saved items need attention`:`${blocked}건 기기 보관 중 · 진행자 확인 필요`} <button onClick={()=>void retryBlocked()}>{en?'Retry':'다시 보내기'}</button></span>}</aside>:null;
}

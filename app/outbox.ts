import { supabase } from './supabase';
import { preparePhoto } from './photo-processing';

export type Job = { id: string; kind: 'photo' | 'question' | 'response'; state: 'pending' | 'sent' | 'blocked'; created: number; file?: File; main?: Blob; thumbnail?: Blob; row?: Record<string,string>; attempts: number; next: number; reason?: string };
let dbPromise: Promise<IDBDatabase> | undefined;
export function observeJobs(refresh:()=>void) {
  window.addEventListener('ma-outbox',refresh);
  const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('ma-outbox');
  if(channel)channel.onmessage=refresh;
  const resume=()=>{if(document.visibilityState==='visible')refresh();};
  document.addEventListener('visibilitychange',resume);
  const timer=setInterval(refresh,5000);
  return()=>{window.removeEventListener('ma-outbox',refresh);document.removeEventListener('visibilitychange',resume);clearInterval(timer);channel?.close();};
}
function database() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open('ma-workshop-outbox',1);
    request.onupgradeneeded = () => request.result.createObjectStore('jobs',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise=undefined; reject(request.error); };
  });
}
export async function jobs(): Promise<Job[]> {
  const db=await database();
  return new Promise((resolve,reject) => { const request=db.transaction('jobs').objectStore('jobs').getAll(); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
}
async function save(job: Job) {
  const db=await database();
  await new Promise<void>((resolve,reject) => {const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs'),previous=store.get(job.id);previous.onsuccess=()=>{if(previous.result?.state!=='sent')store.put(job);};tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);});
  window.dispatchEvent(new Event('ma-outbox'));
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('ma-outbox');channel.postMessage('changed');channel.close();}
}
export async function enqueue(input: Pick<Job,'kind'|'file'|'row'>) {
  const job:Job={...input,id:crypto.randomUUID(),state:'pending',created:Date.now(),attempts:0,next:0};
  // Persist the original file/text BEFORE making any network request.
  await save(job); void flush(); return job.id;
}
export async function retryBlocked() { for(const job of await jobs()) if(job.state==='blocked') await save({...job,state:'pending',next:0}); void flush(); }
function failure(error: {code?:string;message?:string;statusCode?:string|number}) {
  const fatal=['23503','23514','42501'].includes(error.code??'');
  return Object.assign(new Error(error.message??'Request failed'),{fatal});
}
async function send(job:Job) {
  if(job.kind==='photo') {
    if(!job.main || !job.thumbnail) {
      let prepared;
      try { prepared=await preparePhoto(job.file!); }
      catch {throw Object.assign(new Error('photo-format'),{fatal:true});}
      job.main=prepared.main; job.thumbnail=prepared.thumbnail; await save(job);
    }
    for(const [path,blob] of [[`photos/${job.id}.jpg`,job.main],[`thumbnails/${job.id}.jpg`,job.thumbnail]] as const) {
      const {error}=await supabase.storage.from('workshop-photos').upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000'});
      // Paths belong exclusively to this durable job. An earlier attempt may have succeeded.
      if(error && !['409','400'].includes(String(error.statusCode))) throw failure(error);
      if(error && !/duplicate|already exists/i.test(error.message) && String(error.statusCode)!=='409') throw failure(error);
    }
  }
  const table=job.kind==='photo'?'photos':job.kind==='question'?'questions':'responses';
  const row:Record<string,string>=job.kind==='photo'?{id:job.id,storage_path:`photos/${job.id}.jpg`,thumbnail_path:`thumbnails/${job.id}.jpg`}:{...job.row,id:job.id};
  const {error}=await supabase.from(table).insert(row);
  if(error && error.code!=='23505') throw failure(error);
  // A lost acknowledgement or another tab's retry must not create a second submission.
  const confirmed=await supabase.from(table).select('id').eq('id',job.id).single();
  if(confirmed.error || !confirmed.data) throw new Error('Awaiting server confirmation');
}
let running=false;
export async function flush(force=false) {
  if(running || !navigator.onLine) return;
  running=true;
  try {
    const pending=(await jobs()).filter(j=>j.state==='pending'&&(force||j.next<=Date.now())).sort((a,b)=>a.created-b.created);
    // Bounded parallelism: one large phone photo cannot stall all text submissions.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(2,pending.length)},async()=>{
      while(cursor<pending.length){const job=pending[cursor++];try {
        await send(job);
        await save({...job,state:'sent',file:undefined,main:undefined,thumbnail:undefined,row:undefined});
      } catch(error) {
        const fatal=!!(error as {fatal?:boolean}).fatal;
        await save({...job,state:fatal?'blocked':'pending',reason:error instanceof Error?error.message:'network',attempts:job.attempts+1,next:Date.now()+Math.min(30000,1000*2**Math.min(job.attempts,5))});
      }}
    }));
  } catch { /* Storage unavailable: the form retains its input and reports it. */ }
  finally {running=false;}
}

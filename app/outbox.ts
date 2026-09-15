import { supabase,readState } from './supabase';
import { preparePhoto } from './photo-processing';

export type Job = { id: string; kind: 'photo' | 'question' | 'response'; state: 'pending' | 'sent' | 'blocked'; created: number; file?: File; main?: Blob; thumbnail?: Blob; row?: Record<string,string>; attempts: number; next: number; reason?: string };
let dbPromise: Promise<IDBDatabase> | undefined;
// If browser storage is unavailable, retain the same upload ID across a retry
// of the selected file. Do not clear the form until the server confirms it.
const unsavedJobs=new WeakMap<object,Job>();
const confirmedInMemory=new Map<string,Job>();
export function observeJobs(refresh:()=>void) {
  window.addEventListener('ma-outbox',refresh);
  let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel('ma-outbox');}catch{}
  if(channel)channel.onmessage=refresh;
  const resume=()=>{if(document.visibilityState==='visible')refresh();};
  document.addEventListener('visibilitychange',resume);
  const timer=setInterval(refresh,5000);
  return()=>{window.removeEventListener('ma-outbox',refresh);document.removeEventListener('visibilitychange',resume);clearInterval(timer);channel?.close();};
}
function database() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve,reject) => {
    let settled=false;
    const fail=(error:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
    const timer=setTimeout(()=>fail(new Error('Device storage open timeout')),5000);
    let request:IDBOpenDBRequest;
    try { request = indexedDB.open('ma-workshop-outbox',1); }
    catch(error){fail(error);return;}
    request.onupgradeneeded = () => request.result.createObjectStore('jobs',{keyPath:'id'});
    request.onsuccess = () => {const db=request.result;if(settled){db.close();return;}settled=true;clearTimeout(timer);db.onversionchange=()=>{db.close();dbPromise=undefined;};resolve(db);};
    request.onblocked = () => fail(new Error('Device storage is busy'));
    request.onerror = () => fail(request.error);
  }).catch(error=>{dbPromise=undefined;throw error;});
}
export async function jobs(): Promise<Job[]> {
  try {
  const db=await database();
  const stored=await new Promise<Job[]>((resolve,reject) => { const request=db.transaction('jobs').objectStore('jobs').getAll(); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
  return [...new Map([...stored,...confirmedInMemory.values()].map(j=>[j.id,j])).values()];
  }catch(error){if(confirmedInMemory.size)return [...confirmedInMemory.values()];throw error;}
}
async function save(job: Job) {
  const db=await database();
  await new Promise<void>((resolve,reject) => {const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs'),previous=store.get(job.id);previous.onsuccess=()=>{if(previous.result?.state!=='sent')store.put(job);};tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);});
  // Notifications are optional. Once committed, a browser notification failure
  // must never be reported as a failed save (which could create a second job).
  try{window.dispatchEvent(new Event('ma-outbox'));}catch{}
  try{if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('ma-outbox');channel.postMessage('changed');channel.close();}}catch{}
}
export async function enqueue(input: Pick<Job,'kind'|'file'|'row'>) {
  const identity=input.file??input.row;
  const job:Job=(identity&&unsavedJobs.get(identity))??{...input,id:crypto.randomUUID(),state:'pending',created:Date.now(),attempts:0,next:0};
  // Persist only the small prepared JPEGs. Keep the original in the form until
  // this transaction succeeds; a failed conversion/save must not clear it.
  if(job.kind==='photo'&&!job.main){
    const photo=await preparePhoto(job.file!);job.main=photo.main;job.thumbnail=photo.thumbnail;job.file=undefined;
  }
  if(identity)unsavedJobs.set(identity,job);
  try{await save(job);}catch(storageError){
    if(!navigator.onLine)throw storageError;
    if((await readState()).workshop_closed)throw Error('workshop_closed');
    await send(job);
    const receipt:Job={...job,state:'sent',file:undefined,main:undefined,thumbnail:undefined,row:undefined};
    confirmedInMemory.set(job.id,receipt);
    try{await save(receipt);}catch{/* Server receipt is authoritative, even if local storage stays unavailable. */}
    if(identity)unsavedJobs.delete(identity);
    return job.id;
  }
  if(identity)unsavedJobs.delete(identity);
  void flush(); return job.id;
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
      job.main=prepared.main; job.thumbnail=prepared.thumbnail; job.file=undefined; await save(job);
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
    if((await readState()).workshop_closed)return;
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

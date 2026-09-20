'use client';
import {useRef,useState} from 'react';
import {adminStorage,supabase} from './supabase';
import {archiveAndDelete,type ArchiveSnapshot,type ArchiveRow} from './workshop-archive';
import {writeLocal,type Dir} from './local-archive';
async function rows(table:string){const result:ArchiveRow[]=[];for(let offset=0;;offset+=500){const {data,error}=await supabase.from(table).select('*').order('created_at').order('id').range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)return result;}}
async function storage(prefix=''):Promise<{id:string;name:string}[]>{const result:{id:string;name:string}[]=[];for(let offset=0;;offset+=100){const {data,error}=await supabase.storage.from('workshop-photos').list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw error;for(const item of data){const name=prefix?`${prefix}/${item.name}`:item.name;if(item.id)result.push({id:item.id,name});else result.push(...await storage(name));}if(data.length<100)return result;}}
async function snapshot():Promise<ArchiveSnapshot>{const {data:state,error}=await supabase.from('exhibit_state').select('*').single();if(error)throw error;if(!state.workshop_closed)throw Error('workshop_not_closed');return{photos:await rows('photos'),questions:await rows('questions'),responses:await rows('responses'),state,storage:await storage()};}
export default function EndWorkshop({locale='ko',capture,onBusy,onFinished}:{locale?:'ko'|'tr'|'en';capture:(snapshot:ArchiveSnapshot,files:Map<string,Blob>)=>Promise<{name:string;blob:Blob}[]>;onBusy:(busy:boolean)=>void;onFinished:()=>void}){
 const tr=locale==='tr',en=locale==='en';const title=tr?'Atölyeyi bitir':en?'End workshop':'워크숍 종료';
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[stage,setStage]=useState<'password'|'folder'|'running'|'done'>('password'),[message,setMessage]=useState('');
 const key=useRef(''),lock=useRef(false);
 function show(){setPassword('');key.current='';setMessage('');setStage('password');setOpen(true);}
 function close(){if(lock.current)return;setPassword('');key.current='';setOpen(false);onFinished();}
 async function authenticate(){if(!password||lock.current)return;lock.current=true;setMessage('');try{
  const {error}=await supabase.rpc('admin_begin_workshop_end',{admin_key:password});if(error)throw error;
  key.current=password;setPassword('');setStage('folder');
 }catch(error){setPassword('');const code=(error as {code?:string}).code;setMessage(code==='42501'?'관리자 암호가 맞지 않습니다.':'종료를 시작하지 못했습니다. 자료는 삭제하지 않았습니다.');}finally{lock.current=false;}}
 async function saveAndEnd(){if(lock.current||!key.current)return;
  const picker=(window as unknown as {showDirectoryPicker?: (options:{mode:string})=>Promise<Dir>}).showDirectoryPicker;
  if(!picker){setMessage('로컬 저장 확인이 가능한 컴퓨터 Chrome에서 실행해주세요. 자료는 삭제하지 않았습니다.');return;}
  lock.current=true;let deleting=false;
  try{
   const parent=await picker.call(window,{mode:'readwrite'});
   const folder=`Loopntale-Workshop-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
   const directory=await parent.getDirectoryHandle(folder,{create:true});setStage('running');onBusy(true);
   const result=await archiveAndDelete({snapshot,download:async name=>{const {data,error}=await supabase.storage.from('workshop-photos').download(name);if(error)throw error;return data;},capture,
    write:(name,blob)=>writeLocal(directory,name,blob),progress:setMessage,
    finalize:async backup=>{deleting=true;const {data,error}=await supabase.rpc('admin_finalize_workshop_end',{admin_key:key.current,backup});if(error)throw error;return data;},
    remove:async names=>{const {error}=await adminStorage(key.current).storage.from('workshop-photos').remove(names);if(error)throw error;},
    remaining:async()=>{const current=await snapshot();return current.photos.length+current.questions.length+current.responses.length+current.storage.length;}
   });
   key.current='';setStage('done');setMessage(`종료 완료 · 전체 이미지와 사진 ${result.photos}장 저장, 클라우드 비움\n저장 폴더: ${folder}`);
  }catch(error){setStage('folder');if((error as {name?:string}).name==='AbortError')setMessage('저장을 취소했습니다. 자료는 삭제하지 않았습니다.');else setMessage(deleting?'로컬 백업은 완료됐지만 클라우드 정리 완료를 확인하지 못했습니다. 백업 폴더를 보관하고 다시 시도해주세요.':'저장·검증을 완료하지 못했습니다. 클라우드 자료는 삭제하지 않았습니다.');}
  finally{lock.current=false;onBusy(false);onFinished();}
 }
 return <div className="archive-exclude workshop-end-control"><button className="workshop-end" title={title} aria-label={title} onClick={show}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 3v9M6.3 5.8a8 8 0 1 0 11.4 0"/></svg></button>{open&&<div className="archive-overlay"><section className="archive-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title"><h2 id="archive-title">{title}</h2>
 {stage==='password'&&<form onSubmit={e=>{e.preventDefault();void authenticate();}}><label>{tr?'Şifre':en?'Password':'비밀번호'}<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} autoFocus/></label><button disabled={!password} type="submit">{tr?'Onayla':en?'Confirm':'확인'}</button></form>}
 {stage==='folder'&&<button onClick={()=>void saveAndEnd()}>{tr?'Kaydet':en?'Save':'저장하기'}</button>}
 {message&&<p role="status" style={{whiteSpace:'pre-wrap'}}>{message}</p>}{stage!=='running'&&<button onClick={close}>{stage==='done'?(tr?'Kapat':en?'Close':'닫기'):(tr?'İptal':en?'Cancel':'취소')}</button>}
 </section></div>}</div>;
}

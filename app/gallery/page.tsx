'use client';
import Link from 'next/link';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { adminStorage,publicPhotoUrl,subscribeTables,supabase } from '../supabase';
import { useExhibitState } from '../workshop-client';
import { playLayout,type Card } from '../play-layout';
type Mode='none'|'photos'|'play';type Locale='ko'|'en';
type Photo=Card&{storage_path:string;thumbnail_path:string;created_at:string};
type Question=Card&{text:string;created_at:string};
type Response=Card&{question_id:string;photo_id:string;text:string;created_at:string};
type Kind='photo'|'question'|'response';
type Drag={kind:Kind;id:string;dx:number;dy:number;x:number;y:number;z:number};
const MOBILE_URL='https://suspiciouscloudgames.github.io/ma/';
export default function GalleryPage(){
 const state=useExhibitState(),{display_mode:mode,questions_enabled:questionsEnabled,locale}=state,en=locale==='en';
 const [photos,setPhotos]=useState<Photo[]>([]),[questions,setQuestions]=useState<Question[]>([]),[responses,setResponses]=useState<Response[]>([]),[qr,setQr]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const canvas=useRef<HTMLElement>(null),drag=useRef<Drag|null>(null),movingIds=useRef(new Set<string>()),pendingMoves=useRef(new Map<string,Drag>());
 const savingMoves=useRef(false);
 const [width,setWidth]=useState(1400),[heights,setHeights]=useState<Record<string,number>>({}),[tick,setTick]=useState(0);
 const load=useCallback(async()=>{
   const [p,q,r]=await Promise.all([supabase.from('photos').select('*').order('created_at').order('id'),supabase.from('questions').select('*').order('created_at').order('id'),supabase.from('responses').select('*').order('created_at').order('id')]);
   const merge=<T extends Card>(next:T[],old:T[])=>next.map(item=>{const pending=pendingMoves.current.get(item.id);if(pending)return {...item,x:pending.x,y:pending.y,z:pending.z};return movingIds.current.has(item.id)?old.find(x=>x.id===item.id)??item:item;});
   // Retain the last complete canvas on errors; never turn a failed read into empty data.
   if(p.error||q.error||r.error)return;
   setPhotos(old=>merge(p.data as Photo[],old));setQuestions(old=>merge(q.data as Question[],old));setResponses(old=>merge(r.data as Response[],old));
 },[]);
 useEffect(()=>subscribeTables(load,['photos','questions','responses']),[load]);
 useEffect(()=>{const section=canvas.current;if(!section)return;const measure=()=>{
   setWidth(section.clientWidth||1400);const next:Record<string,number>={};section.querySelectorAll<HTMLElement>('[data-card]').forEach(el=>{next[el.dataset.card!]=el.offsetHeight;});
   setHeights(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);setTick(v=>v+1);
 };const observer=new ResizeObserver(measure);observer.observe(section);section.querySelectorAll('[data-card]').forEach(el=>observer.observe(el));measure();return()=>observer.disconnect();},[mode,questions,responses]);
 const layout=useMemo(()=>playLayout(questions,responses,width,heights),[questions,responses,width,heights]);
 const photoMap=useMemo(()=>new Map(photos.map(p=>[p.id,p])),[photos]);
 function admin(){let key=sessionStorage.getItem('ma-admin')??'';if(!key)key=prompt(en?'Enter administrator password.':'관리자 암호를 입력하세요.')?.trim()??'';return key;}
 function report(error:{code?:string;message?:string}){if(error.code==='42501'){sessionStorage.removeItem('ma-admin');setNotice(en?'Incorrect administrator password.':'관리자 암호가 맞지 않습니다.');}else setNotice(en?'Connection interrupted. The current screen is preserved. Please try again.':'연결이 원활하지 않습니다. 현재 화면은 유지됩니다. 다시 눌러주세요.');}
 async function setState(next:{mode?:Mode;questions?:boolean;locale?:Locale}){if(busy)return;const key=admin();if(!key)return;setBusy(true);setNotice('');try{
   const {error}=await supabase.rpc('admin_set_state',{admin_key:key,next_display_mode:next.mode??mode,next_questions_enabled:next.questions??questionsEnabled,next_locale:next.locale??locale});
   if(error)report(error);else{sessionStorage.setItem('ma-admin',key);window.dispatchEvent(new Event('online'));}
 }catch{report({});}finally{setBusy(false);}}
 function start(e:ReactPointerEvent<HTMLElement>,kind:Kind,id:string){if(innerWidth<=760||(e.target as HTMLElement).closest('button'))return;const box=layout.boxes[id];if(!box)return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect();movingIds.current.add(id);drag.current={kind,id,dx:e.clientX-r.left,dy:e.clientY-r.top,x:box.x/width*100,y:box.y,z:999};e.currentTarget.setPointerCapture(e.pointerId);}
 function moving(e:ReactPointerEvent<HTMLElement>){if(!drag.current||!canvas.current)return;const c=canvas.current.getBoundingClientRect(),r=e.currentTarget.getBoundingClientRect(),d=drag.current;
   d.x=Math.max(0,Math.min(100-r.width/c.width*100,(e.clientX-c.left-d.dx)/c.width*100));d.y=Math.max(0,e.clientY-c.top-d.dy);
   const apply=<T extends Card>(items:T[])=>items.map(v=>v.id===d.id?{...v,x:d.x,y:d.y,z:d.z}:v);
   if(d.kind==='question')setQuestions(apply);else setResponses(apply);setTick(v=>v+1);
 }
 const saveMoves=useCallback(async()=>{const key=sessionStorage.getItem('ma-admin');if(!key||savingMoves.current)return;savingMoves.current=true;try{
   for(const [id,d] of pendingMoves.current){const {error}=await supabase.rpc('admin_move_item',{admin_key:key,item_kind:d.kind,item_id:id,next_x:d.x,next_y:d.y,next_z:d.z});if(error?.code==='42501'){sessionStorage.removeItem('ma-admin');setNotice('관리자 암호가 맞지 않습니다. / Incorrect administrator password.');return;}if(!error&&pendingMoves.current.get(id)===d){pendingMoves.current.delete(id);movingIds.current.delete(id);}}
   }catch{/* Keep pending positions and retry after reconnection. */}finally{savingMoves.current=false;try{sessionStorage.setItem('ma-pending-moves',JSON.stringify([...pendingMoves.current]));}catch{}}
 },[]);
 useEffect(()=>{try{for(const [id,d] of JSON.parse(sessionStorage.getItem('ma-pending-moves')??'[]'))pendingMoves.current.set(id,d);}catch{}const retry=()=>{void saveMoves();};window.addEventListener('online',retry);const timer=setInterval(retry,5000);retry();return()=>{window.removeEventListener('online',retry);clearInterval(timer);};},[saveMoves]);
 async function finish(){const d=drag.current;if(!d)return;drag.current=null;const key=admin();if(!key){movingIds.current.delete(d.id);void load();return;}sessionStorage.setItem('ma-admin',key);pendingMoves.current.set(d.id,{...d});try{sessionStorage.setItem('ma-pending-moves',JSON.stringify([...pendingMoves.current]));}catch{}await saveMoves();if(pendingMoves.current.has(d.id))setNotice(en?'Position saved on this device; waiting to sync.':'위치를 기기에 보관했습니다. 연결되면 다시 저장합니다.');}
 async function remove(kind:Kind,id:string){if(!confirm(en?'Delete this item?':'삭제할까요?'))return;const key=admin();if(!key)return;
   // Delete the record first: a failed database request must not destroy its image.
   const {error}=await supabase.rpc('admin_delete_item',{admin_key:key,item_kind:kind,item_id:id});if(error){report(error);return;}
   if(kind==='photo'){const photo=photos.find(p=>p.id===id);if(photo)await adminStorage(key).storage.from('workshop-photos').remove([photo.storage_path,photo.thumbnail_path]);}
   sessionStorage.setItem('ma-admin',key);void load();
 }
 const lines=useMemo(()=>{if(mode!=='play'||!canvas.current)return[];const cr=canvas.current.getBoundingClientRect();
   const edge=(box:DOMRect,target:{x:number;y:number})=>{const center={x:box.left+box.width/2,y:box.top+box.height/2},dx=target.x-center.x,dy=target.y-center.y,scale=1/Math.max(1e-6,Math.abs(dx)/(box.width/2),Math.abs(dy)/(box.height/2));return{x:center.x+dx*scale-cr.left,y:center.y+dy*scale-cr.top};};
   return responses.flatMap(r=>{const a=canvas.current!.querySelector(`[data-q="${r.question_id}"]`)?.getBoundingClientRect(),b=canvas.current!.querySelector(`[data-r="${r.id}"]`)?.getBoundingClientRect();if(!a||!b)return[];
     const start=edge(a,{x:b.left+b.width/2,y:b.top+b.height/2}),end=edge(b,{x:a.left+a.width/2,y:a.top+a.height/2}),dx=end.x-start.x,dy=end.y-start.y,length=Math.max(1,Math.hypot(dx,dy)),bend=Math.min(120,Math.max(28,length*.16)),nx=-dy/length,ny=dx/length,direction=[...r.id].reduce((s,c)=>s+c.charCodeAt(0),0)%2?1:-1;
     return[{id:r.id,d:`M ${start.x} ${start.y} C ${start.x+dx*.3+nx*bend*direction} ${start.y+dy*.3+ny*bend*direction}, ${start.x+dx*.7-nx*bend*.45*direction} ${start.y+dy*.7-ny*bend*.45*direction}, ${end.x} ${end.y}`}];
   });
 },[mode,responses,questions,tick,layout]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>setTick(v=>v+1));return()=>cancelAnimationFrame(frame);},[layout]);
 const styleFor=(id:string)=>{const b=layout.boxes[id];return b?{left:b.x,top:b.y,zIndex:b.z}:{};};
 return <main className="gallery-page exhibit-page"><header className="gallery-header exhibit-header"><div className="gallery-title"><h1>{en?'Mobile Archaeology':'모바일 고고학'}</h1><p>{en?'Press and hold a photo to save it.':'사진을 길게 눌러 선택하고 저장하세요.'}</p></div><Link className="gallery-back" href="/">{en?'Back':'돌아가기'}</Link><div className="exhibit-controls"><div className="language-switch" aria-label="워크숍 언어"><button aria-pressed={locale==='ko'} className={locale==='ko'?'active':''} disabled={busy} onClick={()=>setState({locale:'ko'})}>한국어</button><button aria-pressed={locale==='en'} className={locale==='en'?'active':''} disabled={busy} onClick={()=>setState({locale:'en'})}>EN</button></div><div className="exhibit-modes"><button className={mode==='photos'?'active':''} disabled={busy} onClick={()=>setState({mode:mode==='photos'?'none':'photos'})}>{en?'1. Mobile Archaeology':'1. 모바일 고고학'}</button><button className={questionsEnabled?'active':''} disabled={busy} onClick={()=>setState({questions:!questionsEnabled})}>{en?'2. Questions':'2. 질문'}</button><button className={mode==='play'?'active':''} disabled={busy} onClick={()=>setState({mode:mode==='play'?'none':'play'})}>{en?'3. Play of Traces':'3. 기척의 놀이'}</button></div></div><button className="gallery-qr" onClick={()=>setQr(true)}><QRCodeSVG value={MOBILE_URL}/></button></header>
 {notice&&<p className="admin-notice" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></p>}
 {qr&&<button className="qr-overlay" onClick={()=>setQr(false)}><QRCodeSVG value={MOBILE_URL}/></button>}
 {mode==='none'&&<div className="gallery-empty"/>}
 <section ref={canvas} className={`gallery-grid exhibit-canvas ${mode==='photos'?'chronological-photos':''}`} style={{minHeight:mode==='play'?layout.height:undefined,display:mode==='none'?'none':undefined}}>
 {mode==='photos'&&photos.map(p=><article key={p.id} className="gallery-item"><div className="photo-actions"><button onClick={()=>remove('photo',p.id)}>×</button></div><img src={publicPhotoUrl(p.storage_path)} alt={en?'Shared photo':'공동 사진'}/></article>)}
 {mode==='play'&&<svg className="gallery-connections" width="100%" height={layout.height}>{lines.map(l=><path key={l.id} d={l.d}/>)}</svg>}
 {mode==='play'&&questions.map(q=><article key={q.id} data-card={q.id} data-q={q.id} className="question-node" style={styleFor(q.id)} onPointerDown={e=>start(e,'question',q.id)} onPointerMove={moving} onPointerUp={finish} onPointerCancel={finish}><button className="node-delete" onClick={()=>remove('question',q.id)}>×</button><span>{q.text}</span></article>)}
 {mode==='play'&&responses.map(r=><article key={r.id} data-card={r.id} data-r={r.id} className="question-response-node" style={styleFor(r.id)} onPointerDown={e=>start(e,'response',r.id)} onPointerMove={moving} onPointerUp={finish} onPointerCancel={finish}><button className="node-delete" onClick={()=>remove('response',r.id)}>×</button>{photoMap.get(r.photo_id)&&<img src={publicPhotoUrl(photoMap.get(r.photo_id)!.storage_path)} alt={en?'Linked photo':'연결된 사진'}/>}<p>{r.text}</p></article>)}
 </section><section className="mobile-photo-list">{photos.map(p=><img key={p.id} src={publicPhotoUrl(p.storage_path)} alt={en?'Shared photo':'공동 사진'}/>)}</section></main>;
}

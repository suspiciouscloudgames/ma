// Local-only QA entry. The fixture server bundles this with its own API origin.
import {preparePhoto} from '../app/photo-processing';
import {enqueue,flush,jobs} from '../app/outbox';
const output=document.querySelector('pre')!;
const log=(value:unknown)=>{output.textContent+=JSON.stringify(value)+'\n';};
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
async function finishJob(id:string){for(let i=0;i<100;i++){await flush(true);const job=(await jobs()).find(j=>j.id===id);if(job?.state==='sent')return job;await new Promise(r=>setTimeout(r,100));}throw Error('Job did not finish');}
document.querySelector('button')!.onclick=async()=>{
 (document.querySelector('button')as HTMLButtonElement).disabled=true;
 try{
 if(location.search.includes('blocked-storage')){
   Object.defineProperty(indexedDB,'open',{configurable:true,value:()=>{throw new DOMException('Simulated unavailable browser storage','QuotaExceededError');}});
   for(const [url,name,type] of [['/__test/photo.jpg','ordinary.jpg','image/jpeg'],['/__test/example.heic','live-still.heic','image/heic']]){
     const raw=await(await fetch(url)).blob();const id=await enqueue({kind:'photo',file:new File([raw],name,{type})});
     assert((await jobs()).find(j=>j.id===id)?.state==='sent','server not confirmed');
     log({case:name,browserStorage:'unavailable',serverConfirmed:true});
   }
   log({result:'PASS',productionCloudTouched:false});return;
 }
 const raw=await(await fetch('/__test/example.heic')).blob();
 for(const [name,type] of [['example.heic','image/heic'],['unnamed','']]){
   const file=new File([raw],name,{type}),photo=await preparePhoto(file),bitmap=await createImageBitmap(photo.main);
   assert(photo.main.type==='image/jpeg','not JPEG');assert(Math.max(bitmap.width,bitmap.height)<=2200,'oversize');
   log({case:name,original:raw.size,jpeg:photo.main.size,thumbnail:photo.thumbnail.size,width:bitmap.width,height:bitmap.height});bitmap.close();
   const image=document.createElement('img');image.src=URL.createObjectURL(photo.main);image.style.maxWidth='320px';document.body.append(image);
   await fetch('/__test/control',{method:'POST',body:JSON.stringify({failWrites:true})});
   const id=await enqueue({kind:'photo',file});const saved=(await jobs()).find(j=>j.id===id)!;
   assert(!saved.file&&saved.main?.size===photo.main.size,'raw persisted instead of JPEG');
   await fetch('/__test/control',{method:'POST',body:JSON.stringify({failWrites:false,loseAcknowledgement:true})});
   await finishJob(id);log({case:name,sent:true,originalNotPersisted:true});
 }
 // A JPEG provided under a HEIC filename must take the native path successfully.
 const jpeg=await(await fetch('/__test/photo.jpg')).blob();await preparePhoto(new File([jpeg],'picker.HEIC',{type:'image/heic'}));log({case:'jpeg-named-heic',passed:true});
 let rejected=false;try{await preparePhoto(new File(['not an image'],'corrupt.heic',{type:'image/heic'}));}catch{rejected=true;}assert(rejected,'corrupt file accepted');
 log({case:'corrupt',rejected});log({result:'PASS'});
 }catch(error){log({result:'FAIL',error:String(error)});}finally{(document.querySelector('button')as HTMLButtonElement).disabled=false;}
};

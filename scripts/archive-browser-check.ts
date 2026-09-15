// Local-only screenshot check; does not invoke any production/delete API.
import {captureWorkshop} from '../app/workshop-capture';
import {archiveAndDelete,type ArchiveSnapshot} from '../app/workshop-archive';
import {writeLocal,type Dir} from '../app/local-archive';
const save=document.createElement('button');save.textContent='Save local test backup (mock cloud only)';document.querySelector('pre')!.before(save);
const run=async(privateFolder=false)=>{
 const status=document.querySelector('pre')!;
 try{
  const parent=privateFolder?await navigator.storage.getDirectory() as unknown as Dir:await (window as unknown as {showDirectoryPicker:(options:{mode:string})=>Promise<Dir>}).showDirectoryPicker({mode:'readwrite'});
  const directory=await parent.getDirectoryHandle('Loopntale-local-archive-test',{create:true});
  const state=await(await fetch('/__test/control')).json();
  const snapshot:ArchiveSnapshot={...state.rows,state:state.rows.exhibit_state[0],storage:state.rows.photos.flatMap((p:any)=>['storage_path','thumbnail_path'].map(k=>({id:p.id+k,name:p[k]})))};
  let finalized=false,removed=0;
  const result=await archiveAndDelete({snapshot:async()=>snapshot,download:async name=>(await fetch('/storage/v1/object/public/workshop-photos/'+name)).blob(),capture:(s,f)=>captureWorkshop(document.querySelector('iframe')!.contentDocument!.querySelector('main')!,s,f),write:(n,b)=>writeLocal(directory,n,b),finalize:async s=>{finalized=true;return{storage:s.storage};},remove:async names=>{removed+=names.length;},remaining:async()=>0,progress:m=>{status.textContent=m;}});
  status.textContent=JSON.stringify({result:'PASS',...result,finalized,removed,localReadbackVerified:true,productionCloudTouched:false});
 }catch(error){status.textContent=JSON.stringify({result:'FAIL',error:String(error)});}
};
save.onclick=()=>void run();
const privateTest=document.createElement('button');privateTest.textContent='Test browser filesystem write and readback';save.after(privateTest);privateTest.onclick=()=>void run(true);
document.querySelector('button')!.onclick=async()=>{
 const status=document.querySelector('pre')!;status.textContent='Capturing local fixture…';
 try{
  const frame=document.querySelector('iframe')!;
  const root=frame.contentDocument!.querySelector('main')!;
  const state=await(await fetch('/__test/control')).json();const snapshot:ArchiveSnapshot={...state.rows,state:state.rows.exhibit_state[0],storage:[]};
  const files=new Map<string,Blob>();for(const p of snapshot.photos)for(const key of ['storage_path','thumbnail_path']){const name=String(p[key]);files.set(name,await(await fetch('/storage/v1/object/public/workshop-photos/'+name)).blob());}
  const captures=await captureWorkshop(root,snapshot,files);const png=captures.find(c=>c.name.endsWith('.png'))!;
  const image=document.createElement('img');image.src=URL.createObjectURL(png.blob);await image.decode();image.style.width='700px';image.style.height='auto';document.body.append(image);
  status.textContent=JSON.stringify({result:'PASS',width:image.naturalWidth,height:image.naturalHeight,pageHeight:root.scrollHeight,bytes:png.blob.size,files:captures.map(c=>c.name)});
 }catch(error){status.textContent=JSON.stringify({result:'FAIL',error:String(error)});}
};

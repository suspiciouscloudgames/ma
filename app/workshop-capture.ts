import type {ArchiveFile,ArchiveSnapshot} from './workshop-archive';
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export async function captureWorkshop(root:HTMLElement,snapshot:ArchiveSnapshot,files:Map<string,Blob>):Promise<ArchiveFile[]>{
 await document.fonts.ready;
 const {toSvg}=await import('html-to-image');
 const clone=root.cloneNode(true) as HTMLElement;
 const width=Math.ceil(root.getBoundingClientRect().width),height=Math.ceil(root.scrollHeight);
 clone.querySelectorAll('.archive-exclude,.exhibit-controls,.gallery-qr,.node-delete,.photo-actions,.mobile-photo-list,.admin-notice,.qr-overlay,.gallery-back').forEach(e=>e.remove());
 clone.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;margin:0;pointer-events:none;`;
 document.body.appendChild(clone);
 try{
  for(const image of Array.from(clone.querySelectorAll('img'))){
   const photo=snapshot.photos.find(p=>image.src.includes(String(p.storage_path))||image.src.includes(String(p.thumbnail_path)));
   const name=photo&&(image.src.includes(String(photo.thumbnail_path))?photo.thumbnail_path:photo.storage_path);
   if(typeof name!=='string'||!files.has(name))throw Error('capture_photo_missing');
   image.src=await dataUrl(files.get(name)!);await image.decode();
  }
  clone.querySelectorAll<HTMLElement|SVGElement>('*').forEach(e=>{e.style.animation='none';e.style.transition='none';});
  // SVG presentation can be lost when serialized inside foreignObject. Keep
  // the actual connector appearance explicit (otherwise open curves fill black).
  const sourcePaths=Array.from(root.querySelectorAll('.gallery-connections path'));
  clone.querySelectorAll('.gallery-connections path').forEach((path,index)=>{
   const style=root.ownerDocument.defaultView!.getComputedStyle(sourcePaths[index]);
   for(const property of ['fill','stroke','stroke-width','stroke-linecap','stroke-dasharray','vector-effect'])
    path.setAttribute(property,style.getPropertyValue(property));
  });
  const svg=await toSvg(clone,{width,height,style:{position:'static',left:'0',top:'0',margin:'0'},backgroundColor:'#faf7f5',cacheBust:true});
  // Preserve a full-detail SVG too; scale only the PNG when a page exceeds safe
  // browser canvas bounds. Never crop the bottom of a long workshop.
  const scale=Math.min(1,16000/width,16000/height,Math.sqrt(40000000/(width*height)));
  const image=new Image();image.src=svg;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));
  try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('capture_canvas_failed');ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?.size?resolve(b):reject(Error('capture_failed')),'image/png'));
   return[{name:'기척의-놀이-전체.png',blob:png},{name:'기척의-놀이-전체.svg',blob:await(await fetch(svg)).blob()}];
  }finally{canvas.width=1;canvas.height=1;image.src='';}
 }finally{clone.remove();}
}

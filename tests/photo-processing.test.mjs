import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/photo-processing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function boot({native=true,conversionFails=false}={}){
 const exports={},blobs=new Map(),canvases=[];let fallback=0,active=0,maximum=0,revoked=0;
 class Image{naturalWidth=8064;naturalHeight=6048;set src(value){this.blob=blobs.get(value);}async decode(){active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;if(!native&&this.blob?.type!=='image/jpeg')throw Error('unsupported');}}
 const context={exports,require:()=>({heicTo:async()=>{fallback++;if(conversionFails)throw Error('bad HEIC');return new Blob(['jpeg'],{type:'image/jpeg'});}}),Image,Uint8Array,Blob,File,URL:{createObjectURL:b=>{const id=String(blobs.size);blobs.set(id,b);return id;},revokeObjectURL:()=>revoked++},document:{createElement:()=>{const c={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(cb,type){c.rendered=[c.width,c.height];cb(new Blob(['jpeg'],{type}));}};canvases.push(c);return c;}}};
 vm.runInNewContext(code,context);return{api:exports,canvases,get fallback(){return fallback;},get maximum(){return maximum;},get revoked(){return revoked;}};
}
test('native HEIC and JPEG mislabeled as HEIC skip the fallback decoder; 48 MP is reduced',async()=>{
 const s=boot();const result=await s.api.preparePhoto(new File(['native'],'IMG.HEIC',{type:'image/heic'}));
 assert.equal(s.fallback,0);assert.equal(result.main.type,'image/jpeg');assert.deepEqual(s.canvases[0].rendered,[2200,1650]);assert.deepEqual(s.canvases[1].rendered,[640,480]);assert.ok(s.canvases.every(c=>c.width===1&&c.height===1));assert.equal(s.revoked,1);
});
test('HEIF signature with missing type and extension uses fallback after native failure',async()=>{
 const s=boot({native:false});const bytes=new Uint8Array([0,0,0,24,...Buffer.from('ftypheic'),0,0,0,0,...Buffer.from('mif1heic')]);
 await s.api.preparePhoto(new File([bytes],'image'));assert.equal(s.fallback,1);
});
test('repeated requests share conversion; distinct photos decode serially',async()=>{
 const s=boot(),a=new File(['a'],'a.jpg'),b=new File(['b'],'b.jpg');const first=s.api.preparePhoto(a);assert.equal(first,s.api.preparePhoto(a));await Promise.all([first,s.api.preparePhoto(b)]);assert.equal(s.maximum,1);assert.equal(s.canvases.length,4);
});
test('corrupt photos can be retried and do not block later conversions',async()=>{
 const s=boot({native:false,conversionFails:true}),bad=new File(['bad'],'bad.heic');await assert.rejects(s.api.preparePhoto(bad));await assert.rejects(s.api.preparePhoto(bad));assert.equal(s.fallback,2);await s.api.preparePhoto(new File(['ok'],'ok.jpg',{type:'image/jpeg'}));
});

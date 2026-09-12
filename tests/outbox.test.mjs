// Run with MA_INDEXEDDB_MODULE pointing to fake-indexeddb's ESM entry, or install it locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const {IDBFactory}=await import(process.env.MA_INDEXEDDB_MODULE??'fake-indexeddb');
const source=ts.transpileModule(await readFile(new URL('../app/outbox.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function scenario(){
 const indexedDB=new IDBFactory(),records=new Map(),files=new Map(),navigation={onLine:false};let clock=0,fail=false,ackLost=false,fatal=false,conversions=0,writes=0;
 const supabase={from:table=>({insert:async row=>{if(fail)return{error:{message:'offline'}};if(fatal)return{error:{code:'23503',message:'missing question'}};const key=table+row.id;if(records.has(key))return{error:{code:'23505'}};records.set(key,row);writes++;if(ackLost){ackLost=false;return{error:{message:'response lost'}};}return{error:null};},select:()=>({eq:(_key,id)=>({single:async()=>fail?{error:{message:'offline'}}:{error:null,data:records.get(table+id)}})})}),storage:{from:()=>({upload:async(path,blob)=>{if(fail)return{error:{message:'offline'}};if(files.has(path))return{error:{statusCode:'409',message:'already exists'}};files.set(path,blob);return{error:null};}})}};
 function boot(){const exports={};const context=vm.createContext({exports,require:name=>name==='./supabase'?{supabase}:{preparePhoto:async()=>{conversions++;return{main:new Blob(['main']),thumbnail:new Blob(['thumb'])};}},indexedDB,navigator:navigation,window:new EventTarget(),Event,Blob,File,crypto,Date:class extends Date{static now(){return clock;}},setTimeout,clearTimeout,setInterval,clearInterval,console});vm.runInContext(source,context);return exports;}
 return{boot,navigation,records,files,get writes(){return writes;},get conversions(){return conversions;},fail(value){fail=value;},loseAck(){ackLost=true;},fatal(value){fatal=value;},advance(){clock+=60000;}};
}
test('offline text survives a new page and a lost acknowledgement registers once',async()=>{
 const s=scenario();let queue=s.boot();const id=await queue.enqueue({kind:'question',row:{text:'preserve me',participant_id:'participant'}});
 assert.equal((await queue.jobs())[0].state,'pending');assert.equal(s.writes,0);
 queue=s.boot();assert.equal((await queue.jobs())[0].row.text,'preserve me');s.navigation.onLine=true;s.loseAck();await queue.flush();assert.equal(s.writes,1);assert.equal((await queue.jobs())[0].state,'pending');s.advance();await queue.flush();assert.equal((await queue.jobs())[0].state,'sent');assert.equal(s.writes,1);assert.equal((await queue.jobs())[0].id,id);
});
test('photo original and prepared blobs survive failed upload; retries do not duplicate files',async()=>{
 const s=scenario();let queue=s.boot();const original=new File(['original bytes'],'phone.jpg',{type:'image/jpeg'});await queue.enqueue({kind:'photo',file:original});
 assert.equal(await (await queue.jobs())[0].file.text(),'original bytes');s.navigation.onLine=true;s.fail(true);await queue.flush();assert.equal(s.conversions,1);assert.equal((await queue.jobs())[0].main.size,4);
 queue=s.boot();s.fail(false);s.advance();s.loseAck();await queue.flush();s.advance();await queue.flush();assert.equal(s.conversions,1);assert.equal(s.files.size,2);assert.equal(s.writes,1);const saved=(await queue.jobs())[0];assert.equal(saved.state,'sent');assert.equal(saved.file,undefined);
});
test('two tabs retry one durable response without duplicate registration',async()=>{
 const s=scenario(),a=s.boot(),b=s.boot();await a.enqueue({kind:'response',row:{text:'response',question_id:'q',photo_id:'p',participant_id:'participant'}});s.navigation.onLine=true;await Promise.all([a.flush(),b.flush()]);assert.equal(s.writes,1);assert.equal((await a.jobs())[0].state,'sent');
});
test('permanent validation errors retain the original instead of claiming success',async()=>{
 const s=scenario(),queue=s.boot();await queue.enqueue({kind:'response',row:{text:'retained',question_id:'deleted',photo_id:'p',participant_id:'participant'}});s.navigation.onLine=true;s.fatal(true);await queue.flush();assert.equal((await queue.jobs())[0].state,'blocked');assert.equal((await queue.jobs())[0].row.text,'retained');assert.equal(s.writes,0);
});
test('30 queued submissions recover exactly once and reconnect bypasses retry delay',async()=>{
 const s=scenario(),queue=s.boot();await Promise.all(Array.from({length:30},(_,i)=>queue.enqueue({kind:'question',row:{text:`question ${i}`,participant_id:`participant ${i}`}})));
 s.navigation.onLine=true;s.fail(true);await queue.flush();assert.equal(s.writes,0);s.fail(false);await queue.flush(true);assert.equal(s.writes,30);assert.ok((await queue.jobs()).every(j=>j.state==='sent'));await queue.flush(true);assert.equal(s.writes,30);
});

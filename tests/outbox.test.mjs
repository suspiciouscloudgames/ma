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
 function boot(overrides={}){const exports={};const context=vm.createContext({exports,require:name=>name==='./supabase'?{supabase,readState:async()=>({workshop_closed:false})}:{preparePhoto:async()=>{conversions++;return{main:new Blob(['main']),thumbnail:new Blob(['thumb'])};}},indexedDB,navigator:navigation,window:new EventTarget(),Event,Blob,File,crypto,Date:class extends Date{static now(){return clock;}},setTimeout,clearTimeout,setInterval,clearInterval,console,...overrides});vm.runInContext(source,context);return exports;}
 return{boot,navigation,records,files,get writes(){return writes;},get conversions(){return conversions;},fail(value){fail=value;},loseAck(){ackLost=true;},fatal(value){fatal=value;},advance(){clock+=60000;}};
}
test('offline text survives a new page and a lost acknowledgement registers once',async()=>{
 const s=scenario();let queue=s.boot();const id=await queue.enqueue({kind:'question',row:{text:'preserve me',participant_id:'participant'}});
 assert.equal((await queue.jobs())[0].state,'pending');assert.equal(s.writes,0);
 queue=s.boot();assert.equal((await queue.jobs())[0].row.text,'preserve me');s.navigation.onLine=true;s.loseAck();await queue.flush();assert.equal(s.writes,1);assert.equal((await queue.jobs())[0].state,'pending');s.advance();await queue.flush();assert.equal((await queue.jobs())[0].state,'sent');assert.equal(s.writes,1);assert.equal((await queue.jobs())[0].id,id);
});
test('only compressed photos are persisted; failed upload survives reload without duplicate files',async()=>{
 const s=scenario();let queue=s.boot();const original=new File(['original bytes'],'phone.jpg',{type:'image/jpeg'});await queue.enqueue({kind:'photo',file:original});
 assert.equal((await queue.jobs())[0].file,undefined);assert.equal((await queue.jobs())[0].main.size,4);assert.equal(s.conversions,1);s.navigation.onLine=true;s.fail(true);await queue.flush();assert.equal(s.conversions,1);assert.equal((await queue.jobs())[0].main.size,4);
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
test('blocked cross-tab notifications cannot turn a committed job into a failed save',async()=>{
 const s=scenario(),queue=s.boot({BroadcastChannel:class{constructor(){throw Error('Browser policy denied broadcast');}}});
 const id=await queue.enqueue({kind:'question',row:{text:'saved once',participant_id:'p'}});assert.ok(id);assert.equal((await queue.jobs()).length,1);s.navigation.onLine=true;await queue.flush();assert.equal(s.writes,1);assert.equal((await queue.jobs())[0].state,'sent');
});
test('a transient device database open failure is recoverable without reloading',async()=>{
 const factory=new IDBFactory();let unavailable=true;const queue=scenario().boot({indexedDB:{open(...args){if(unavailable)throw Error('Device storage temporarily unavailable');return factory.open(...args);}}});
 await assert.rejects(queue.jobs());unavailable=false;const id=await queue.enqueue({kind:'question',row:{text:'retained',participant_id:'p'}});assert.equal((await queue.jobs())[0].id,id);
});
test('old pending originals migrate to compressed blobs before retry',async()=>{
 const s=scenario();
 // Access the same database through the injected factory, as an older app would.
 const factory=new IDBFactory(),legacy=scenario().boot({indexedDB:factory});await legacy.jobs();
 await new Promise((resolve,reject)=>{const request=factory.open('ma-workshop-outbox',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('jobs','readwrite');tx.objectStore('jobs').put({id:'legacy',kind:'photo',state:'pending',created:0,attempts:0,next:0,file:new File(['old original'],'old.heic')});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
 const retry=s.boot({indexedDB:factory});s.navigation.onLine=true;s.fail(true);await retry.flush();const saved=(await retry.jobs())[0];assert.equal(saved.file,undefined);assert.ok(saved.main);s.fail(false);s.advance();await retry.flush();assert.equal((await retry.jobs())[0].state,'sent');
});
test('large input is compressed before a storage failure; retry stores no original',async()=>{
 const s=scenario(),factory=new IDBFactory();let denied=true;
 const queue=s.boot({indexedDB:{open(...args){if(denied)throw Error('QuotaExceededError');return factory.open(...args);}}});
 const original=new File([new Uint8Array(12*1024*1024)],'live.heic',{type:'image/heic'});
 await assert.rejects(queue.enqueue({kind:'photo',file:original}));assert.equal(s.conversions,1);assert.equal(s.writes,0);assert.equal(original.size,12*1024*1024);
 denied=false;await queue.enqueue({kind:'photo',file:original});const saved=(await queue.jobs())[0];assert.equal(saved.file,undefined);assert.equal(saved.main.size+saved.thumbnail.size,9);
});

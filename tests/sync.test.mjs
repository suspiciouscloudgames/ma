import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('../app/supabase.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function boot(){const exports={},events=[];let statusCallback,reply={data:{version:10,locale:'en'},error:null};const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const client={from:()=>({select:()=>({single:async()=>reply})}),channel:()=>({on(_type,_filter,callback){events.push(callback);return this;},subscribe(callback){statusCallback=callback;}}),removeChannel:async()=>{}};
 const context=vm.createContext({exports,require:()=>({createClient:()=>client}),window:win,document:doc,crypto,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,fetch});vm.runInContext(source,context);
 return{api:exports,win,doc,events,reply(value){reply=value;},subscribe(){statusCallback('SUBSCRIBED');}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('an older state response cannot revert the latest workshop language',async()=>{const s=boot();assert.equal((await s.api.readState()).locale,'en');s.reply({data:{version:9,locale:'ko'},error:null});assert.equal((await s.api.readState()).locale,'en');s.reply({data:null,error:{message:'offline'}});await assert.rejects(s.api.readState());s.reply({data:{version:11,locale:'ko'},error:null});assert.equal((await s.api.readState()).locale,'ko');});
test('bursts coalesce; online, resume, and realtime reconnect refresh; cleanup stops work',async()=>{
 const s=boot();let calls=0,active=0,maxActive=0,release;
 const off=s.api.subscribeTables(async()=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1)await new Promise(resolve=>release=resolve);active--;},['photos']);
 try{for(let i=0;i<30;i++)void s.events[0]();release();await tick();assert.equal(calls,2);assert.equal(maxActive,1);
 s.win.dispatchEvent(new Event('online'));await tick();assert.equal(calls,3);s.doc.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(calls,4);s.subscribe();await tick();assert.equal(calls,5);
 off();s.win.dispatchEvent(new Event('online'));s.events[0]();await tick();assert.equal(calls,5);
 }finally{off();}
});

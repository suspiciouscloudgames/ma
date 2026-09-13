import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
const source=ts.transpileModule(await readFile(new URL('../app/supabase.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function boot(){const exports={},events=[];let statusCallback,reply={data:{version:10,locale:'en'},error:null};const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const client={from:()=>({select:()=>({single:async()=>reply})}),channel:()=>({on(_type,_filter,callback){events.push(callback);return this;},subscribe(callback){statusCallback=callback;}}),removeChannel:async()=>{}};
 const context=vm.createContext({exports,require:()=>({createClient:()=>client}),window:win,document:doc,crypto,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,fetch});vm.runInContext(source,context);
 return{api:exports,win,doc,events,reply(value){reply=value;},subscribe(){statusCallback('SUBSCRIBED');}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('submission notices stay silent while saving or pending; completion and genuine failures remain visible',async()=>{
 const text=await readFile(new URL('../app/workshop-client.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,require:name=>name==='react/jsx-runtime'?jsxRuntime:{}});
 for(const en of [false,true])for(const state of ['idle','saving','pending'])assert.equal(exports.SubmissionStatus({state,en}),null);
 assert.equal(exports.SubmissionStatus({state:'sent',en:false}).props.children,'전송 완료');
 assert.equal(exports.SubmissionStatus({state:'sent',en:true}).props.children,'Sent successfully.');
 for(const state of ['storage','blocked'])assert.ok(exports.SubmissionStatus({state,en:false}).props.children);
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 for(const source of [text,page])assert.doesNotMatch(source,/전송 대기|Waiting to send|waiting to send/);
 assert.match(page,/disabled=\{!file\|\|submission.busy\}/);
});
test('an older state response cannot revert the latest workshop language',async()=>{const s=boot();assert.equal((await s.api.readState()).locale,'en');s.reply({data:{version:9,locale:'ko'},error:null});assert.equal((await s.api.readState()).locale,'en');s.reply({data:null,error:{message:'offline'}});await assert.rejects(s.api.readState());s.reply({data:{version:11,locale:'ko'},error:null});assert.equal((await s.api.readState()).locale,'ko');});
test('bursts coalesce; online, resume, and realtime reconnect refresh; cleanup stops work',async()=>{
 const s=boot();let calls=0,active=0,maxActive=0,release;
 const off=s.api.subscribeTables(async()=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1)await new Promise(resolve=>release=resolve);active--;},['photos']);
 try{for(let i=0;i<30;i++)void s.events[0]();release();await tick();assert.equal(calls,2);assert.equal(maxActive,1);
 s.win.dispatchEvent(new Event('online'));await tick();assert.equal(calls,3);s.doc.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(calls,4);s.subscribe();await tick();assert.equal(calls,5);
 off();s.win.dispatchEvent(new Event('online'));s.events[0]();await tick();assert.equal(calls,5);
 }finally{off();}
});

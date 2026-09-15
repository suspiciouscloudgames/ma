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
 let blockedRetries=0;
 const exports={};vm.runInNewContext(compiled,{exports,require:name=>name==='react/jsx-runtime'?jsxRuntime:name==='react'?{useState:initial=>[typeof initial==='number'?1:initial,()=>{}],useEffect:()=>{}}:name==='./outbox'?{retryBlocked:()=>{blockedRetries++;}}:{}});
 for(const en of [false,true])for(const state of ['idle','saving','pending'])assert.equal(exports.SubmissionStatus({state,en}),null);
 assert.equal(exports.SubmissionStatus({state:'sent',en:false}).props.children,'전송 완료');
 assert.equal(exports.SubmissionStatus({state:'sent',en:true}).props.children,'Sent successfully.');
 let storageRetries=0;
 const failure=exports.SubmissionStatus({state:'storage',en:false,onRetry:()=>{storageRetries++;}});
 assert.equal(failure.props.children[0],'전송하지 못했습니다. 다시 보내주세요.');
 assert.equal(failure.props.children[1].props.children,'다시 보내기');
 failure.props.children[1].props.onClick();assert.equal(storageRetries,1);
 assert.equal(exports.SubmissionStatus({state:'blocked',en:false}),null,'no duplicate blocked notice in the form');
 const banner=exports.default();const children=banner.props.children.props.children;
 assert.equal(children[0],'전송하지 못했습니다. 다시 보내주세요.');
 children.at(-1).props.onClick();assert.equal(blockedRetries,1);
 assert.equal(exports.SubmissionStatus({state:'storage',en:true}).props.children[0],'Could not send. Please try again.');
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 for(const source of [text,page])assert.doesNotMatch(source,/전송 대기|Waiting to send|waiting to send/);
 assert.match(page,/disabled=\{!file\|\|submission.busy\}/);
 for(const file of ['page.tsx','question/page.tsx','respond/page.tsx']){
   const source=await readFile(new URL(`../app/${file}`,import.meta.url),'utf8');
   assert.match(source,/onRetry=\{(?:send|submit)\}/);
   assert.doesNotMatch(source,/지금은 질문|not open right now/);
 }
 assert.doesNotMatch(text,/저장 공간|기기 보관|진행자|free some storage|facilitator|saved items need attention/);
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

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
async function submissionHarness(kind,oldState){
 const compiled=ts.transpileModule(await readFile(new URL('../app/workshop-client.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const slots=[],effects=[],storage=new Map([[`ma-current-${kind}`,'old']]);let cursor=0,observer,rows=[{id:'old',kind,state:oldState}],read=async()=>rows;
 const exports={};vm.runInNewContext(compiled,{exports,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},require:name=>name==='react/jsx-runtime'?jsxRuntime:name==='react'?{
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{slots[i]=v;}];},
 useRef(initial){const i=cursor++;return slots[i]??= {current:initial};},
 useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn);}}
 }:name==='./outbox'?{jobs:()=>read(),observeJobs:fn=>{observer=fn;return()=>{};},enqueue:async()=>{rows.push({id:'new',kind,state:'sent'});return 'new';}}:{}});
 const render=()=>{cursor=0;return exports.useSubmission(kind);};render();effects.forEach(fn=>fn());
 return{render,storage,refresh:()=>observer(),setRows:v=>{rows=v;},setRead:fn=>{read=fn;},notice:exports.SubmissionStatus};
}
test('reopening every mobile form hides old success receipts in all three languages',async()=>{
 for(const kind of ['photo','question','response']){
  const h=await submissionHarness(kind,'sent');await tick();assert.equal(h.render().state,'idle');assert.equal(h.storage.has(`ma-current-${kind}`),false);
  for(const locale of ['ko','en','tr'])assert.equal(h.notice({state:h.render().state,en:locale==='en',tr:locale==='tr'}),null);
  await h.refresh();assert.equal(h.render().state,'idle');
  assert.equal(await h.render().submit({}),true);assert.equal(h.render().state,'sent','a new real completion still appears');
  h.render().reset();await h.refresh();assert.equal(h.render().state,'idle');
 }
});
test('unfinished uploads restore and show completion only when they actually finish',async()=>{
 for(const state of ['pending','blocked']){
  const h=await submissionHarness('photo',state);await tick();assert.equal(h.render().state,state);
  h.setRows([{id:'old',state:'sent'}]);await h.refresh();assert.equal(h.render().state,'sent');
 }
});
test('a delayed receipt read cannot override reset or a newer submission',async()=>{
 const h=await submissionHarness('photo','pending');await tick();let release;
 h.setRead(()=>new Promise(resolve=>{release=resolve;}));const stale=h.refresh();h.render().reset();
 h.setRead(async()=>[{id:'new',state:'sent'}]);await h.render().submit({});release([{id:'old',state:'blocked'}]);await stale;
 assert.equal(h.render().state,'sent');
});
test('submission notices stay silent while saving or pending; completion and genuine failures remain visible',async()=>{
 const text=await readFile(new URL('../app/workshop-client.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 let blockedRetries=0;
 const exports={};vm.runInNewContext(compiled,{exports,require:name=>name==='react/jsx-runtime'?jsxRuntime:name==='react'?{useState:initial=>[typeof initial==='number'?1:initial,()=>{}],useEffect:()=>{}}:name==='./outbox'?{retryBlocked:()=>{blockedRetries++;}}:{}});
 for(const en of [false,true])for(const state of ['idle','saving','pending'])assert.equal(exports.SubmissionStatus({state,en}),null);
 assert.equal(exports.SubmissionStatus({state:'sent',en:false}).props.children,'전송 완료');
 assert.equal(exports.SubmissionStatus({state:'sent',en:true}).props.children,'Sent successfully.');
 assert.equal(exports.SubmissionStatus({state:'sent',en:false,tr:true}).props.children,'Gönderildi.');
 assert.equal(exports.SubmissionStatus({state:'storage',en:false,tr:true}).props.children[0],'Gönderilemedi. Lütfen tekrar deneyin.');
 for(const state of ['idle','saving','pending'])assert.equal(exports.SubmissionStatus({state,en:false,tr:true}),null);
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
 assert.match(page,/disabled=\{!file\|\|submission.busy\|\|state.workshop_closed\}/);
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

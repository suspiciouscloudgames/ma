import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
import * as jsx from 'react/jsx-runtime';
async function load(file,extra={}){const source=await readFile(new URL(file,import.meta.url),'utf8');const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:()=>jsx,AbortSignal,fetch,Response,console,...extra});return exports;}
const edge=await load('../supabase/functions/translate-workshop/index.ts');
test('Turkish translation sends only the original text, never photos; disables response storage',async()=>{
 let payload;const original='Bu fotoğraf sana hangi anıyı hatırlatıyor?';
 const result=await edge.translate(original,'test-only',async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(init.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({turkish:true,english:'What memory does this photo remind you of?',korean:'이 사진은 어떤 기억을 떠올리게 하나요?'})}]}]});});
 assert.equal(payload.store,false);assert.equal(payload.input[0].content.length,1);assert.equal(payload.input[0].content[0].type,'input_text');assert.equal(payload.input[0].content[0].text,original);assert.equal(result.turkish,true);assert.ok(result.korean);
});
test('incomplete/refused/malformed translations never appear as successful',()=>{
 for(const body of [{status:'incomplete'},{status:'completed',output:[]},{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"turkish":true,"english":"","korean":""}'}]}]}])assert.throws(()=>edge.parseTranslation(body));
});
test('provider errors redact request text and credential',async()=>{
 await assert.rejects(edge.translate('secret original','secret key',async()=>Response.json({error:{code:'insufficient_quota',message:'private provider details'}},{status:429})),/^Error: insufficient_quota$/);
});
test('translation renders English then Korean; unfinished results render nothing',async()=>{
 const {default:Translation}=await load('../app/translation.tsx');
 assert.equal(Translation({item:{}}),null);assert.equal(Translation({item:{translation_en:'half'}}),null);
 const result=Translation({item:{translation_en:'English',translation_ko:'한국어'}});assert.equal(result.props.children[0].props.lang,'en');assert.equal(result.props.children[1].props.lang,'ko');
});
test('translation writes are server-only, lease protected, budgeted and paused for archiving',async()=>{
 const sql=await readFile(new URL('../supabase/translations.sql',import.meta.url),'utf8');
 for(const text of ['from public,anon,authenticated','to service_role','lease=lease_id','not workshop_closed for share','budget.calls>=1000','500000','on delete cascade'])assert.ok(sql.includes(text),text);
 const page=await readFile(new URL('../app/gallery/page.tsx',import.meta.url),'utf8');assert.ok(page.includes('<Translation item={q}/>'));assert.ok(page.includes('<Translation item={r}/>'));
});
test('browser worker caps in-flight calls, preserves UI on failures, pauses for archive and stops cleanly',async()=>{
 let tick,completed=0,paused=false,calls=0;const pending=[];
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const worker=await load('../app/translation-worker.ts',{window:win,document:doc,setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}});
 const stop=worker.startTranslationWorker(()=>paused,()=>completed++,()=>{calls++;return new Promise(resolve=>pending.push(resolve));});
 assert.equal(calls,3);tick();win.dispatchEvent(new Event('online'));assert.equal(calls,3);
 paused=true;pending.splice(0).forEach(resolve=>resolve(Response.json({processed:1})));await new Promise(setImmediate);assert.equal(completed,0);
 tick();assert.equal(calls,3);paused=false;tick();assert.equal(calls,6);
 stop();pending.splice(0).forEach(resolve=>resolve(Response.json({error:'offline'},{status:503})));await new Promise(setImmediate);
 tick();win.dispatchEvent(new Event('online'));assert.equal(calls,6);assert.equal(completed,0);
});
test('edge handler stores a completed translation via server lease and exposes no source',async()=>{
 const calls=[];const env={SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'public-test'}),SUPABASE_SERVICE_ROLE_KEY:'server-test',SUPABASE_URL:'https://database.test',OPENAI_API_KEY:'private-test'};
 const api=await load('../supabase/functions/translate-workshop/index.ts',{Deno:{env:{get:name=>env[name]},serve:()=>{}},fetch:async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  if(url.endsWith('claim_workshop_translation'))return Response.json({id:'job',lease:'token',text:'Bu bir soru mu?'});
  if(url==='https://api.openai.com/v1/responses')return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({turkish:true,english:'Is this a question?',korean:'이것은 질문인가요?'})}]}]});
  if(url.endsWith('finish_workshop_translation'))return Response.json(true);
  throw Error('unexpected call');
 }});
 const result=await api.handler(new Request('https://edge.test',{method:'POST',headers:{apikey:'public-test'}}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{processed:1});
 assert.equal(calls.length,3);assert.equal(calls[2].body.lease_id,'token');assert.equal(calls[2].body.korean,'이것은 질문인가요?');
});

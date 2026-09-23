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

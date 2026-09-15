import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const exports={};vm.runInNewContext(ts.transpileModule(await readFile(new URL('../app/workshop-archive.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,Blob});
function fixture(){const calls=[],saved=new Map();const snapshot={photos:[{id:'p',storage_path:'photos/p.jpg',thumbnail_path:'thumbnails/p.jpg'}],questions:[],responses:[],state:{workshop_closed:true},storage:[{id:'s1',name:'photos/p.jpg'},{id:'s2',name:'thumbnails/p.jpg'}]};
 const ports={snapshot:async()=>snapshot,download:async name=>new Blob([name]),capture:async()=>[{name:'full.png',blob:new Blob(['PNG'])}],write:async(name,blob)=>{calls.push('write:'+name);saved.set(name,blob);return blob;},finalize:async()=>{calls.push('finalize');return{storage:snapshot.storage};},remove:async names=>{calls.push('remove');},remaining:async()=>0,progress:()=>{}};return{ports,calls,saved};}
test('local screenshot, all photos, metadata and manifest verified before any cloud deletion',async()=>{const s=fixture();const result=await exports.archiveAndDelete(s.ports);assert.equal(result.photos,1);assert.ok(s.calls.indexOf('write:manifest.json')<s.calls.indexOf('finalize'));assert.ok(s.calls.indexOf('finalize')<s.calls.indexOf('remove'));assert.ok(s.saved.has('completed.json'));});
for(const issue of ['download','capture','write','corruption'])test(`${issue} failure prevents all cloud deletion`,async()=>{const s=fixture();if(issue==='download')s.ports.download=async()=>{throw Error('offline');};if(issue==='capture')s.ports.capture=async()=>[];if(issue==='write')s.ports.write=async()=>{throw Error('disk full');};if(issue==='corruption')s.ports.write=async()=>new Blob(['corrupted']);await assert.rejects(exports.archiveAndDelete(s.ports));assert.ok(!s.calls.includes('finalize'));assert.ok(!s.calls.includes('remove'));});
test('server detects a changed snapshot; no storage files are removed',async()=>{const s=fixture();s.ports.finalize=async()=>{throw Error('backup_changed');};await assert.rejects(exports.archiveAndDelete(s.ports));assert.ok(!s.calls.includes('remove'));assert.ok(s.saved.has('manifest.json'));});
test('failed storage removal never reports completed; local archive remains',async()=>{const s=fixture();s.ports.remove=async()=>{throw Error('offline');};await assert.rejects(exports.archiveAndDelete(s.ports));assert.ok(s.saved.has('manifest.json'));assert.ok(!s.saved.has('completed.json'));});
test('end requires fresh password, supported local folder writes and protected server finalization',async()=>{
 const ui=await readFile(new URL('../app/end-workshop.tsx',import.meta.url),'utf8'),sql=await readFile(new URL('../supabase/workshop-end.sql',import.meta.url),'utf8');
 const local=await readFile(new URL('../app/local-archive.ts',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/sessionStorage|0000/);assert.match(ui,/type="password"/);assert.match(ui,/showDirectoryPicker/);assert.match(local,/handle.getFile\(\)/);assert.match(sql,/backup_changed/);assert.match(sql,/share row exclusive/);assert.match(sql,/private.is_admin\(admin_key\)/);assert.match(sql,/workshop_accepts_uploads/);
});

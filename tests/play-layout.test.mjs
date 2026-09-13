import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/play-layout.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {playLayout}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const card=id=>({id,x:null,y:null,z:null});
for(const width of [761,1024,1400,1920])test(`30 responses, long text, no overlaps at ${width}px`,()=>{
 const questions=Array.from({length:7},(_,i)=>card(`q${i}`));const responses=Array.from({length:30},(_,i)=>({...card(`r${i}`),question_id:`q${i%7}`}));const heights=Object.fromEntries([...questions,...responses].map((c,i)=>[c.id,i%5===0?730:140+i*7]));
 const result=playLayout(questions,responses,width,heights),boxes=Object.values(result.boxes);
 for(let i=0;i<boxes.length;i++){const a=boxes[i];assert.ok(a.x>=0&&a.x+a.width<=width);for(let j=i+1;j<boxes.length;j++){const b=boxes[j];assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`overlap ${i},${j}`);}}
 assert.deepEqual(result,playLayout(questions,responses,width,heights),'random offsets must not reshuffle');
 for(let i=1;i<questions.length;i++)assert.ok(result.boxes[questions[i].id].y>result.boxes[questions[i-1].id].y);
 const added=playLayout(questions,[...responses,{...card('new'),question_id:'q6'}],width,heights);for(const id of ['q0','r0','r7'])assert.deepEqual(result.boxes[id],added.boxes[id],'unrelated earlier groups stay put');
});
for(const width of [761,1400,1920])test(`drag changes only the selected card at ${width}px, including reload`,()=>{
 const questions=Array.from({length:4},(_,i)=>card(`q${i}`)),responses=Array.from({length:12},(_,i)=>({...card(`r${i}`),question_id:`q${i%4}`}));
 const heights={q1:420,r2:730},before=playLayout(questions,responses,width,heights);
 for(const id of ['r0','r2','q0','q2'])for(const y of [0,350,3000]){
   const move=items=>items.map(c=>c.id===id?{...c,x:40,y,z:999}:c),q=move(questions),r=move(responses);
   const after=playLayout(q,r,width,heights);
   assert.ok(Math.abs(after.boxes[id].x-width*.4)<0.001);assert.equal(after.boxes[id].y,y);
   for(const other of Object.keys(before.boxes))if(other!==id)assert.deepEqual(after.boxes[other],before.boxes[other],`${other} moved when dragging ${id}`);
   assert.deepEqual(after,playLayout(JSON.parse(JSON.stringify(q)),JSON.parse(JSON.stringify(r)),width,heights));
 }
});

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
test('manual drag survives recalculation; new cards avoid it',()=>{const q=card('q'),r={...card('r'),question_id:'q',x:45,y:90};const {boxes}=playLayout([q],[r,{...card('new'),question_id:'q'}],1400,{});assert.equal(boxes.r.x,630);assert.equal(boxes.r.y,90);assert.ok(boxes.new.x>=boxes.r.x+boxes.r.width||boxes.new.y>=boxes.r.y+boxes.r.height);});

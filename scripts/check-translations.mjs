// Fixed synthetic samples only; never inserts participant data.
import assert from 'node:assert/strict';
const url='https://lhpfrkumzpinzgkkmgmd.supabase.co/functions/v1/translate-workshop';
const key='sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL';
const admin=process.env.MA_TRANSLATION_ADMIN;
assert.ok(admin,'Set MA_TRANSLATION_ADMIN for protected synthetic diagnostics');
for(let sample=0;sample<6;sample++){
 const r=await fetch(url,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({diagnostic:true,admin_key:admin,sample}),signal:AbortSignal.timeout(120000)});
 const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
 assert.equal(body.turkish,![3,4].includes(sample),`language detection ${sample}`);
 if(body.turkish){assert.ok(body.english.length>8);assert.match(body.korean,/[가-힣]/);}
 else{assert.equal(body.english,'');assert.equal(body.korean,'');}
 if(sample===5)assert.notEqual(body.english.trim(),'MERHABA');
 console.log(JSON.stringify({sample,...body}));
}
const forbidden=await fetch(url,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({diagnostic:true,admin_key:'incorrect'})});assert.equal(forbidden.status,401);
const crossOrigin=await fetch(url,{method:'POST',headers:{apikey:key,Origin:'https://example.com'}});assert.equal(crossOrigin.status,403);
console.log('PASS: 6 real translation/language-safety checks; unauthorized diagnostic and cross-origin blocked.');

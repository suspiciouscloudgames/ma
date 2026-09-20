import assert from 'node:assert/strict';
const origin='https://suspiciouscloudgames.github.io';
const assets=new Set(),routes=[];
for(const route of ['/ma/','/ma/gallery/','/ma/question/','/ma/respond/']){
 const response=await fetch(`${origin}${route}?verify=${process.argv[2]??Date.now()}`,{signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,route);const html=await response.text();assert.ok(html.includes('Loopntale Workshop'),`Unexpected page: ${route}`);
 for(const match of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)){const url=new URL(match[1].replaceAll('&amp;','&'),origin);if(url.origin===origin)assets.add(url.href);}
 routes.push({route,status:response.status});
}
let scripts='';
for(const url of assets){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,`Missing asset: ${url}`);scripts+=await response.text();}
assert.ok(scripts.includes('Device storage is busy'),'Latest recovery code is not published yet');
const decodedScripts=scripts.replace(/\\x([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
assert.ok(decodedScripts.includes('Türkçe')&&decodedScripts.includes('Fotoğraf arşivinden seç')&&decodedScripts.includes('Gönderildi.'),'Turkish menus are not published yet');
assert.ok(scripts.includes('admin_begin_workshop_end')&&scripts.includes('admin_finalize_workshop_end')&&scripts.includes('showDirectoryPicker'),'Verified local workshop shutdown is not published yet');
assert.ok(scripts.includes('전송하지 못했습니다. 다시 보내주세요.'),'Latest simplified submission notice is not published yet');
for(const removed of ['기기에 임시 저장하지 못했습니다.','기기 보관 중 · 진행자 확인 필요','이 항목은 확인이 필요합니다.','지금은 질문을 받고 있지 않아요.','지금은 질문 선택이 열려 있지 않아요.','전송 대기 중'])assert.ok(!scripts.includes(removed),`Removed participant notice is still published: ${removed}`);
assert.ok(scripts.includes('object-fit:contain'),'Photo fitting style missing');
const font=await fetch(`${origin}/ma/fonts/NanumMyeongjo-Regular.ttf`,{signal:AbortSignal.timeout(20000)});assert.equal(font.status,200);await font.arrayBuffer();
console.log(JSON.stringify({routes,assetsChecked:assets.size,fontStatus:font.status,latestRecoveryCode:true},null,2));

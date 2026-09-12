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
assert.ok(scripts.includes('object-fit:contain'),'Photo fitting style missing');
const font=await fetch(`${origin}/ma/fonts/NanumMyeongjo-Regular.ttf`,{signal:AbortSignal.timeout(20000)});assert.equal(font.status,200);await font.arrayBuffer();
console.log(JSON.stringify({routes,assetsChecked:assets.size,fontStatus:font.status,latestRecoveryCode:true},null,2));

const url="https://lhpfrkumzpinzgkkmgmd.supabase.co",key="sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL";
const auth={apikey:key,Authorization:`Bearer ${key}`};
const jpeg=Uint8Array.from([255,216,255,219,0,67,...Array(64).fill(8),255,217]);
const batch=Array.from({length:20},(_,i)=>({id:crypto.randomUUID(),i}));
const started=Date.now();
const results=await Promise.all(batch.map(async({id})=>{
 const paths=[`photos/load-test-${id}.jpg`,`thumbnails/load-test-${id}.jpg`];
 const uploads=await Promise.all(paths.map(path=>fetch(`${url}/storage/v1/object/workshop-photos/${path}`,{method:"POST",headers:{...auth,"Content-Type":"image/jpeg","x-upsert":"false"},body:jpeg})));
 if(uploads.some(r=>!r.ok))return{ok:false,paths};
 const row=await fetch(`${url}/rest/v1/photos`,{method:"POST",headers:{...auth,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({storage_path:paths[0],thumbnail_path:paths[1]})});
 const data=await row.json();return{ok:row.ok,id:data[0]?.id,paths};
}));
const cleanupRows=await Promise.all(results.filter(r=>r.id).map(r=>fetch(`${url}/rest/v1/rpc/admin_delete_item`,{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({admin_key:"0000",item_kind:"photo",item_id:r.id})})));
const cleanupFiles=await Promise.all(results.flatMap(r=>r.paths).map(path=>fetch(`${url}/storage/v1/object/workshop-photos/${path}`,{method:"DELETE",headers:auth})));
console.log(JSON.stringify({uploads:`${results.filter(r=>r.ok).length}/20`,metadataCleanup:`${cleanupRows.filter(r=>r.ok).length}/${cleanupRows.length}`,fileCleanup:`${cleanupFiles.filter(r=>r.ok).length}/${cleanupFiles.length}`,elapsedMs:Date.now()-started},null,2));
if(results.some(r=>!r.ok)||cleanupRows.some(r=>!r.ok)||cleanupFiles.some(r=>!r.ok))process.exitCode=1;

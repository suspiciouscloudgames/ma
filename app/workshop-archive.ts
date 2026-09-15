export type ArchiveRow={id:string;[key:string]:unknown};
export type ArchiveSnapshot={photos:ArchiveRow[];questions:ArchiveRow[];responses:ArchiveRow[];state:unknown;storage:{id:string;name:string}[]};
export type ArchiveFile={name:string;blob:Blob};
export type ArchivePorts={
 snapshot:()=>Promise<ArchiveSnapshot>;
 download:(name:string)=>Promise<Blob>;
 capture:(snapshot:ArchiveSnapshot,files:Map<string,Blob>)=>Promise<ArchiveFile[]>;
 write:(name:string,blob:Blob)=>Promise<Blob>;
 finalize:(snapshot:ArchiveSnapshot)=>Promise<{storage:{id:string;name:string}[]}>;
 remove:(names:string[])=>Promise<void>;
 remaining:()=>Promise<number>;
 progress:(message:string)=>void;
};
export async function sha256(blob:Blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function archiveAndDelete(ports:ArchivePorts){
 const manifest:{name:string;bytes:number;sha256:string}[]=[];
 const write=async(name:string,blob:Blob)=>{const hash=await sha256(blob),saved=await ports.write(name,blob);if(saved.size!==blob.size||await sha256(saved)!==hash)throw Error('local_verification_failed');manifest.push({name,bytes:blob.size,sha256:hash});};
 const snapshot=await ports.snapshot(),files=new Map<string,Blob>();
 const names=new Set(snapshot.storage.map(s=>s.name));
 for(const photo of snapshot.photos)for(const key of ['storage_path','thumbnail_path']){const name=photo[key];if(typeof name!=='string'||!names.has(name))throw Error('missing_photo_file');}
 for(const name of names){ports.progress(`사진 확인 ${files.size+1}/${names.size}`);const blob=await ports.download(name);if(!blob.size)throw Error('empty_photo_file');files.set(name,blob);}
 ports.progress('기척의 놀이 전체 이미지 저장 중');
 const captures=await ports.capture(snapshot,files);
 if(!captures.some(f=>f.name.endsWith('.png')&&f.blob.size>0))throw Error('capture_failed');
 for(const file of captures)await write(file.name,file.blob);
 for(const [name,blob] of files){ports.progress(`사진 저장·검증 ${name}`);await write(`files/${name}`,blob);}
 await write('workshop.json',new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
 await write('manifest.json',new Blob([JSON.stringify({created:new Date().toISOString(),files:manifest},null,2)],{type:'application/json'}));
 ports.progress('로컬 백업 검증 완료 · 클라우드 정리 중');
 // Only the server can atomically compare the backup and delete those rows.
 const result=await ports.finalize(snapshot);
 if(JSON.stringify([...result.storage].sort((a,b)=>a.name.localeCompare(b.name)))!==JSON.stringify([...snapshot.storage].sort((a,b)=>a.name.localeCompare(b.name))))throw Error('unexpected_delete_targets');
 for(let i=0;i<result.storage.length;i+=50)await ports.remove(result.storage.slice(i,i+50).map(s=>s.name));
 const remaining=await ports.remaining();if(remaining!==0)throw Error('cloud_not_empty');
 await write('completed.json',new Blob([JSON.stringify({completed:new Date().toISOString(),cloudRemaining:0})],{type:'application/json'}));
 return {photos:snapshot.photos.length,questions:snapshot.questions.length,responses:snapshot.responses.length,files:files.size};
}

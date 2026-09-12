// Local-only browser QA. Never forwards requests to the workshop database.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{WebSocketServer}=require('next/dist/compiled/ws');
const sharp=require('sharp');
const port=4277,origin=`http://127.0.0.1:${port}`;
const jpeg=await sharp({create:{width:320,height:480,channels:3,background:'#d5d0c4'}}).jpeg().toBuffer();
const now=new Date().toISOString(),card={x:null,y:null,z:null,created_at:now};
const tables={exhibit_state:[{id:true,display_mode:'play',questions_enabled:true,locale:'ko',version:1}],photos:Array.from({length:12},(_,i)=>({...card,id:`p${i}`,storage_path:`photos/p${i}.jpg`,thumbnail_path:`thumbnails/p${i}.jpg`,created_at:new Date(1700000000000+i*1000).toISOString()})),questions:Array.from({length:4},(_,i)=>({...card,id:`q${i}`,text:`질문 ${i+1} · ${'어떤 기척을 기억하나요? '.repeat(i===1?12:1)}`})),responses:[]};
for(let i=0;i<12;i++)tables.responses.push({...card,id:`r${i}`,question_id:`q${i%4}`,photo_id:`p${i}`,text:`답변 ${i+1} · ${'기억에 남은 순간입니다. '.repeat(i===2?40:2)}`});
let failReads=false,failWrites=false,loseAcknowledgement=false,inserts=0,uploadCalls=0;
const storage=new Map(),peers=new Map();
function notify(table,record,type='INSERT'){for(const [ws,subscriptions] of peers)for(const sub of subscriptions)if(sub.table===table)ws.send(JSON.stringify({topic:sub.topic,event:'postgres_changes',payload:{ids:[sub.id],data:{schema:'public',table,type,record,old_record:{},commit_timestamp:new Date().toISOString(),errors:null}},ref:null}));}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean);let body=Buffer.alloc(0);for await(const chunk of req)body=Buffer.concat([body,chunk]);
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'*'});return res.end();}
 if(url.pathname==='/__test/control'){const options=body.length?JSON.parse(body):{};if('failReads'in options)failReads=options.failReads;if('failWrites'in options)failWrites=options.failWrites;if('loseAcknowledgement'in options)loseAcknowledgement=options.loseAcknowledgement;return json(res,200,{failReads,failWrites,loseAcknowledgement,inserts,uploadCalls,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),rows:tables});}
 if(parts[0]==='rest'){
   if(req.method==='GET'){
     if(failReads)return json(res,503,{message:'Test connection interrupted'});
     const table=parts[2];let rows=tables[table]??[];if(url.searchParams.has('id'))rows=rows.filter(r=>String(r.id)===url.searchParams.get('id').replace('eq.',''));
     return json(res,200,(req.headers.accept??'').includes('vnd.pgrst.object')?rows[0]:rows);
   }
   if(failWrites)return json(res,503,{message:'Test offline'});
   const data=body.length?JSON.parse(body):{};
   if(parts[2]==='rpc'){
     if(data.admin_key!=='0000')return json(res,403,{code:'42501',message:'forbidden'});
     if(parts[3]==='admin_set_state'){Object.assign(tables.exhibit_state[0],{display_mode:data.next_display_mode,questions_enabled:data.next_questions_enabled,locale:data.next_locale,version:Date.now()});notify('exhibit_state',tables.exhibit_state[0],'UPDATE');return json(res,200,tables.exhibit_state[0]);}
     if(parts[3]==='admin_move_item'){const table=data.item_kind==='question'?'questions':data.item_kind==='response'?'responses':'photos';const row=tables[table].find(r=>r.id===data.item_id);Object.assign(row,{x:data.next_x,y:data.next_y,z:data.next_z});notify(table,row,'UPDATE');return json(res,200,row);}
   }
   const table=parts[2];if(tables[table].some(r=>r.id===data.id))return json(res,409,{code:'23505',message:'duplicate key'});
   const record={...card,...data};tables[table].push(record);inserts++;notify(table,record);
   if(loseAcknowledgement){loseAcknowledgement=false;return json(res,503,{message:'Lost response after commit'});}
   return json(res,201,null);
 }
 if(parts[0]==='storage'){
   if(req.method==='POST'){uploadCalls++;if(failWrites)return json(res,503,{message:'Test offline'});if(storage.has(url.pathname))return json(res,400,{statusCode:'409',message:'The resource already exists'});storage.set(url.pathname,body);return json(res,200,{Key:url.pathname});}
   const match=/p(\d+)\.jpg/.exec(url.pathname);const i=Number(match?.[1]??0),w=260,h=i%3===0?620:i%3===1?160:300;
   if(match){res.writeHead(200,{'content-type':'image/svg+xml'});return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${i%2?'#c9d6ce':'#e6cbb8'}"/><text x="30" y="60" font-size="30">Photo ${i+1}</text></svg>`);}
   res.writeHead(200,{'content-type':'image/jpeg'});return res.end(jpeg);
 }
 if(url.pathname==='/__test/photo.jpg'){res.writeHead(200,{'content-type':'image/jpeg'});return res.end(jpeg);}
 let local=decodeURIComponent(url.pathname.replace(/^\/ma\/?/,''));if(!local||local.endsWith('/'))local+='index.html';
 const file=path.resolve('out',local);if(!file.startsWith(path.resolve('out')+path.sep))return json(res,403,{});
 let bytes=await readFile(file);const ext=path.extname(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.svg':'image/svg+xml','.txt':'text/plain'}[ext]??'application/octet-stream';
 if(['.html','.js','.css','.txt'].includes(ext))bytes=Buffer.from(bytes.toString().replaceAll('https://lhpfrkumzpinzgkkmgmd.supabase.co',origin));
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(bytes);
 }catch(error){json(res,404,{message:String(error)});}});
const wss=new WebSocketServer({server});
wss.on('connection',ws=>{peers.set(ws,[]);ws.on('close',()=>peers.delete(ws));ws.on('message',message=>{
 const packet=JSON.parse(message.toString());if(packet.event==='phx_join'){
   const changes=(packet.payload.config?.postgres_changes??[]).map((item,i)=>({...item,id:i+1}));peers.set(ws,[...(peers.get(ws)??[]).filter(item=>item.topic!==packet.topic),...changes.map(item=>({...item,topic:packet.topic}))]);
   ws.send(JSON.stringify({topic:packet.topic,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:changes}},ref:packet.ref,join_ref:packet.join_ref}));
 }else if(packet.event==='heartbeat')ws.send(JSON.stringify({topic:'phoenix',event:'phx_reply',payload:{status:'ok',response:{}},ref:packet.ref}));
 });});
server.listen(port,'127.0.0.1',()=>console.log(`Local workshop fixture: ${origin}/ma/gallery/`));

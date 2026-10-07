// Loopback-only, in-memory provider substitute. No real credentials or R2 calls.
import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';import tailwind from '@tailwindcss/postcss';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const sessions=new Map();const attempts={};let failPart=true;
const json=(res,value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
async function body(req){let text='';for await(const chunk of req)text+=chunk;return JSON.parse(text);}
const snapshot=s=>({...s,parts:s.parts.map(p=>({...p}))});
const server=await createServer({configFile:false,root:path.join(project,'tests/fixtures/multipart-browser'),plugins:[react(),{name:'multipart-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4192');
  if(url.pathname==='/fixture/stats')return json(res,{attempts,sessions:[...sessions.values()].map(snapshot)});
  if(url.pathname==='/fixture/reset-failure'){failPart=true;return json(res,{ok:true});}
  if(url.pathname==='/api/files/multipart'){
   if(req.method==='GET')return json(res,[...sessions.values()].filter(s=>!['uploaded','aborted'].includes(s.status)).map(snapshot));
   if(req.method==='DELETE'){const s=sessions.get(url.searchParams.get('sessionId'));s.status='aborted';s.parts=[];return json(res,{ok:true});}
   const input=await body(req);
   if(req.method==='POST'){
    let s=[...sessions.values()].find(s=>s.checksum===input.checksum&&s.filename===input.filename&&s.status!=='aborted');
    if(!s){const id=randomUUID();s={sessionId:id,documentId:randomUUID(),status:'uploading',filename:input.filename,contentType:input.contentType,size:input.size,checksum:input.checksum,folderId:null,partSize:8*1024*1024,expiresAt:'2099-01-01',parts:[],file:{}};sessions.set(id,s);}
    return json(res,snapshot(s));
   }
   const s=sessions.get(input.sessionId);
   if(input.action==='sign')return json(res,{uploadUrl:`http://127.0.0.1:4192/part/${s.sessionId}/${input.partNumber}`,size:Math.min(s.partSize,s.size-(input.partNumber-1)*s.partSize)});
   if(s.parts.length!==Math.ceil(s.size/s.partSize))return json(res,{error:'missing parts'},409);s.status='uploaded';return json(res,snapshot(s));
  }
  if(url.pathname.startsWith('/part/')){
   const [, ,id,n]=url.pathname.split('/'),number=Number(n),s=sessions.get(id);attempts[`${s.filename}:${number}`]=(attempts[`${s.filename}:${number}`]??0)+1;
   let size=0;for await(const chunk of req)size+=chunk.length;
   if(number===2&&failPart){failPart=false;await new Promise(r=>setTimeout(r,150));return json(res,{error:'synthetic interruption'},503);}
   s.parts=s.parts.filter(p=>p.partNumber!==number);s.parts.push({partNumber:number,size});return json(res,{ok:true});
  }
  next();
 }catch{if(!res.writableEnded)res.destroy();}
});}}],resolve:{alias:[{find:'@',replacement:path.join(project,'src')}],dedupe:['react','react-dom']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:4192,strictPort:true,fs:{allow:[project]}}});
await server.listen();server.printUrls();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});

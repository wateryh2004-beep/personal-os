import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only",()=>({}));
import { continuousFixtureState } from "@/features/testing/continuous-fixture-state";
import { syntheticUploadHttp } from "@/features/testing/continuous-upload-fixture";
import { startFileUpload } from "@/features/files/upload-runner";
import { getBackgroundOperations } from "@/features/workflow-continuity/background-operations";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
const fresh=()=>continuousFixtureState(`personal-os-fixture-session=${crypto.randomUUID()}`);
const data=new TextEncoder().encode("%PDF-1.7\nSynthetic original bytes\n%%EOF"),id="ef200000-0000-4000-8000-000000000001";
const input={filename:"synthetic.pdf",title:"原合成文件",requestId:id,folderId:null,contentType:"application/pdf",size:data.length,checksum:createHash("sha256").update(data).digest("hex")};
const json=(method:string,value:unknown)=>new Request("http://127.0.0.1:3000/api/continuous-workflows-fixture/api/files/upload-url",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
it("keeps synthetic bytes on the browser origin even when Next normalizes its internal request URL or receives forwarded hosts",async()=>{
 const state=fresh();
 const request=new Request("http://localhost:3000/api/continuous-workflows-fixture/api/files/upload-url",{method:"POST",headers:{"Content-Type":"application/json",host:"127.0.0.1:3000","x-forwarded-host":"external.invalid","x-forwarded-proto":"https"},body:JSON.stringify(input)});
 const result=await syntheticUploadHttp(state,"api/files/upload-url",request);
 const plan=z.object({uploadUrl:z.string()}).passthrough().parse(result?.data);
 expect(plan.uploadUrl).toBe(`/api/continuous-workflows-fixture/upload-bytes/${id}`);
 expect(new URL(plan.uploadUrl,"http://127.0.0.1:3000/files").origin).toBe("http://127.0.0.1:3000");
 const reread=await syntheticUploadHttp(state,"api/files/upload-url",new Request(`http://localhost:3000/api/files/upload-url?documentId=${id}`));
 expect(reread?.data).toMatchObject({uploadUrl:plan.uploadUrl});
 expect(state.writes["upload-plan"]).toBe(1);expect(state.writes["upload-bytes"]).toBeUndefined();
});
it("runs the real upload consumer through relative synthetic I/O and preserves the exact bytes and same-origin boundary",async()=>{
 const state=fresh(),origin="http://127.0.0.1:3000",calls:{method:string;url:string;headers:Record<string,string>}[]=[],boundary=new EventTarget();
 clearWorkspaceResources();vi.stubGlobal("window",boundary);
 const publication=vi.fn();boundary.addEventListener("personal-os:file-upload-published",publication);
 vi.stubGlobal("fetch",vi.fn(async(path:string,init?:RequestInit)=>{
  const url=new URL(path,origin);expect(url.origin).toBe(origin);
  calls.push({method:init?.method??"GET",url:url.href,headers:Object.fromEntries(new Headers(init?.headers))});
  // Match the real Next route's normalized internal URL while retaining the
  // browser's same-origin boundary; only synthetic HTTP replaces network I/O.
  const request=new Request(`http://localhost:3000${url.pathname}${url.search}`,init);
  const result=await syntheticUploadHttp(state,url.pathname.slice(1),request);
  expect(result).not.toBeNull();return Response.json(result?.data??{}, {status:result!.status});
 }));
 class SyntheticXhr {
  status=0;timeout=0;url="";method="";headers:Record<string,string>={};
  upload:{onprogress?: (event:{lengthComputable:boolean;loaded:number;total:number})=>void}={};
  onload?:()=>void;onloadend?:()=>void;onerror?:()=>void;onabort?:()=>void;
  open(method:string,url:string){this.method=method;this.url=new URL(url,origin).href;}
  setRequestHeader(name:string,value:string){this.headers[name]=value;}
  abort(){this.onabort?.();this.onloadend?.();}
  send(file:File){void(async()=>{
   const url=new URL(this.url);expect(url.origin).toBe(origin);expect(this.method).toBe("PUT");
   calls.push({method:this.method,url:this.url,headers:this.headers});
   const result=await syntheticUploadHttp(state,`upload-bytes/${url.pathname.split("/").at(-1)}`,new Request(url,{method:this.method,headers:this.headers,body:await file.arrayBuffer()}));
   this.status=result!.status;this.upload.onprogress?.({lengthComputable:true,loaded:file.size,total:file.size});this.onload?.();this.onloadend?.();
  })().catch(()=>{this.onerror?.();this.onloadend?.();});}
 }
 vi.stubGlobal("XMLHttpRequest",SyntheticXhr);
 try{
  const file=new File([data],input.filename,{type:input.contentType});
  const operation=startFileUpload({id,file,title:input.title,folderId:null,checksum:input.checksum});await operation.completion;
  expect(getBackgroundOperations().find(row=>row.id===operation.id)?.status).toBe("succeeded");
  expect(state.uploads.get(id)?.bytes).toEqual(data);expect(state.uploads.get(id)?.available).toBe(true);
  expect(state.writes).toMatchObject({"upload-plan":1,"upload-bytes":1,"upload-complete":1});
  expect(calls.map(row=>row.method)).toEqual(["POST","PUT","PATCH"]);expect(calls[1].headers["Content-Type"]).toBe(input.contentType);
  expect(publication).toHaveBeenCalledOnce();
 }finally{clearWorkspaceResources();vi.unstubAllGlobals();}
});
it("allocates no upload before confirmation, then preserves exact original bytes and commits only once after lost replies",async()=>{const state=fresh();expect(state.uploads.size).toBe(0);await syntheticUploadHttp(state,"api/files/upload-url",json("POST",input));await syntheticUploadHttp(state,"api/files/upload-url",json("POST",input));expect(state.writes["upload-plan"]).toBe(1);expect((await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:data})))?.status).toBe(200);expect(state.uploads.get(id)?.bytes).toEqual(data);state.mode="save-unknown";expect((await syntheticUploadHttp(state,"api/files/upload-url",json("PATCH",{documentId:id})))?.status).toBe(503);expect((await syntheticUploadHttp(state,"api/files/upload-url",json("PATCH",{documentId:id})))?.status).toBe(503);expect(state.writes["upload-complete"]).toBe(1);state.mode="normal";expect((await syntheticUploadHttp(state,"api/files/upload-url",new Request(`http://127.0.0.1:3000/?documentId=${id}`)))?.data).toMatchObject({documentId:id});expect(state.writes["upload-complete"]).toBe(1);});
it("rejects changed plan payload and bytes whose checksum does not match the selected original",async()=>{const state=fresh();await syntheticUploadHttp(state,"api/files/upload-url",json("POST",input));expect((await syntheticUploadHttp(state,"api/files/upload-url",json("POST",{...input,title:"另一提交"})))?.status).toBe(409);expect((await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:new Uint8Array(data.length)})))?.status).toBe(409);expect(state.uploads.get(id)?.bytes).toBeNull();expect(state.writes["upload-complete"]).toBeUndefined();});
it("rechecks duplicate bytes through the existing candidate HTTP boundary without any new document write",async()=>{const state=fresh();await syntheticUploadHttp(state,"api/files/upload-url",json("POST",input));await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:data}));await syntheticUploadHttp(state,"api/files/upload-url",json("PATCH",{documentId:id}));const result=await syntheticUploadHttp(state,"api/files/upload-candidates",json("POST",{files:[{id:"next-plan",name:"other-name.pdf",size:data.length,checksum:input.checksum}]}));expect(result?.data).toMatchObject({matches:[{id:"next-plan",candidates:[{id,match:"content"}]}]});expect(state.writes["upload-plan"]).toBe(1);expect(state.writes["upload-complete"]).toBe(1);});
it("allows only the failed original to retry while already-stored bytes remain idempotent",async()=>{const state=fresh();await syntheticUploadHttp(state,"api/files/upload-url",json("POST",input));state.uploadFailures.add(input.filename);expect((await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:data})))?.status).toBe(503);expect(state.writes["upload-bytes"]).toBeUndefined();expect((await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:data})))?.status).toBe(200);await syntheticUploadHttp(state,`upload-bytes/${id}`,new Request("http://127.0.0.1:3000/bytes",{method:"PUT",body:data}));expect(state.writes["upload-bytes"]).toBe(1);expect(state.uploads.get(id)?.bytes).toEqual(data);});

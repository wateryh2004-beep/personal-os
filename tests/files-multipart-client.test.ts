import { beforeEach, describe, expect, it, vi } from "vitest";
import { checksumFile } from "@/features/files/file-checksum";
import { uploadMultipartFile } from "@/features/files/multipart-client";
import { multipartPartSize as partSize, type MultipartSnapshot } from "@/features/files/multipart-upload";
const file=new File([new Uint8Array(partSize*2+10)],"fixture.pdf",{type:"application/pdf"});
let snapshot:MultipartSnapshot;let calls:{url:string;init?:RequestInit}[];
const response=(value:unknown,status=200)=>Response.json(value,{status});
beforeEach(async()=>{
 calls=[];snapshot={sessionId:crypto.randomUUID(),documentId:crypto.randomUUID(),status:"uploading",filename:file.name,contentType:file.type,size:file.size,checksum:await checksumFile(file),folderId:null,partSize,expiresAt:"2099-01-01",parts:[{partNumber:1,size:partSize}],file:{id:"doc",title:file.name,originalFilename:file.name,mimeType:file.type,fileSize:file.size,folderId:null,textExtractionStatus:"pending"}};
});
const handler=async(url:RequestInfo|URL,init?:RequestInit)=>{
 calls.push({url:String(url),init});
 if(init?.method==="PUT")return new Response(null,{status:200});
 const body=JSON.parse(String(init?.body));
 if(init?.method==="POST")return response(snapshot);
 if(body.action==="sign")return response({uploadUrl:`https://r2.example/part/${body.partNumber}`,size:body.partNumber===3?10:partSize});
 return response({...snapshot,status:"uploaded"});
};
describe("resumable upload browser transport",()=>{
 it("reselects/hash-verifies, skips server-confirmed parts, and limits concurrent Blob PUTs",async()=>{
  let active=0,max=0;const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT"){active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;expect((init.body as Blob).size).toBeLessThanOrEqual(partSize);}
   return handler(url,init);
  });
  const progress=vi.fn();await uploadMultipartFile(file,{folderId:"current-folder",resume:snapshot,signal:new AbortController().signal,onProgress:progress},fetcher);
  expect(calls.filter(call=>call.init?.method==="PUT").map(call=>call.url)).toEqual(["https://r2.example/part/2","https://r2.example/part/3"]);
  expect(JSON.parse(String(calls[0].init?.body)).folderId).toBeNull();
  expect(max).toBe(2);expect(progress).toHaveBeenLastCalledWith(100);
  expect(JSON.parse(String(calls.at(-1)?.init?.body))).toEqual({action:"complete",sessionId:snapshot.sessionId});
 });
 it("fails wrong-file reselection before any provider or session operation",async()=>{
  const fetcher=vi.fn();await expect(uploadMultipartFile(new File(["wrong"],file.name,{type:file.type}),{folderId:null,resume:snapshot,signal:new AbortController().signal,onProgress:vi.fn()},fetcher)).rejects.toThrow("不一致");
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("stops other pending PUTs after interruption without cancel/delete or completion",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==="PUT")throw new Error("network lost");return handler(url,init);
  });
  await expect(uploadMultipartFile(file,{folderId:null,signal:new AbortController().signal,onProgress:vi.fn()},fetcher)).rejects.toThrow("分片已保留");
  expect(fetcher.mock.calls.some(([,init])=>init?.method==="DELETE")).toBe(false);
  expect(calls.some(call=>String(call.init?.body).includes('"complete"'))).toBe(false);
 });
 it("pauses before hashing or session creation",async()=>{
  const controller=new AbortController();controller.abort();const fetcher=vi.fn();
  await expect(uploadMultipartFile(file,{folderId:null,signal:controller.signal,onProgress:vi.fn()},fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
 it("does not PUT again after provider completion or lost final reply",async()=>{
  snapshot.status="uploaded";
  await uploadMultipartFile(file,{folderId:null,resume:snapshot,signal:new AbortController().signal,onProgress:vi.fn()},handler);
  expect(calls).toHaveLength(1);
 });
});

"use client";
import { startBackgroundOperation, type BackgroundOperationContext } from "@/features/workflow-continuity/background-operations";
import { uploadMultipartFile } from "./multipart-client";
import { multipartThreshold, type MultipartSnapshot } from "./multipart-upload";
import { checksumFile } from "./file-checksum";
import { canUpload } from "./schemas";
import { publishFileRecordChange } from "./publication";
import { completeFileUpload } from "./complete-upload";
import type { FileRecord } from "./queries";

let slots = 0;
const waiters = new Set<() => void>();
async function acquire(signal: AbortSignal) {
 while (slots >= 2) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => { const wake = () => { signal.removeEventListener("abort", abort); waiters.delete(wake); resolve(); }; const abort = () => { waiters.delete(wake); reject(new Error("upload_cancelled")); }; waiters.add(wake); signal.addEventListener("abort", abort, { once: true }); });
 }
 signal.throwIfAborted(); slots++;
 return () => { slots--; const wake = waiters.values().next().value; if (wake) wake(); };
}
export type UploadPlan = { id: string; file: File; title: string; folderId: string | null; checksum?: string; resume?: MultipartSnapshot };
type Payload = { documentId: string; uploadUrl?: string; file: { id: string; title: string; originalFilename: string; mimeType: string; fileSize: number; folderId: string | null; textExtractionStatus: FileRecord["text_extraction_status"] } };
async function read(response: Response): Promise<Payload> {
 const payload = await response.json();
 if (!response.ok || typeof payload?.documentId !== "string" || !payload.file) throw new Error(payload?.error || "上传状态暂不可用。");
 return payload;
}
async function put(url: string,file: File,context: BackgroundOperationContext) {
 await new Promise<void>((resolve,reject)=>{
  const request=new XMLHttpRequest();request.open("PUT",url);request.timeout=300_000;request.setRequestHeader("Content-Type",file.type||"application/octet-stream");
  const cancel=()=>request.abort();context.signal.addEventListener("abort",cancel,{once:true});
  request.onloadend=()=>context.signal.removeEventListener("abort",cancel);
  request.upload.onprogress=(event)=>{if(event.lengthComputable)context.report({phase:"正在上传原件",completed:event.loaded,total:event.total,unit:"bytes"});};
  request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error("原件上传未确认，请检查网络后重试。"));
  request.onerror=request.ontimeout=()=>reject(new Error("上传连接中断，原件尚未确认入库。"));request.onabort=()=>reject(new Error("上传已暂停。"));
  if(context.signal.aborted){cancel();reject(new Error("上传已暂停。"));return;}request.send(file);
 });
}
/** The closure is owned by the shell registry, not by the Files page lifecycle. */
export function startFileUpload(plan: UploadPlan) {
 let documentId: string|undefined;
 let resume=plan.resume;
 const run=async(context:BackgroundOperationContext)=>{
  context.report({phase:"等待上传空位"});
  const release=await acquire(context.signal);
  try {
  const {file}=plan;
  if(!canUpload(file.name,file.type||"application/octet-stream",file.size))throw new Error("文件类型或大小不受支持。");
  context.signal.throwIfAborted();
  context.report({phase:"正在校验原件"});
  let payload:Payload;
  if(documentId){
   // Reconcile a lost completion response against this exact record before any retry.
   payload=await read(await fetch(`/api/files/upload-url?documentId=${encodeURIComponent(documentId)}`,{cache:"no-store",signal:context.signal}));
  }else if(file.size>=multipartThreshold||resume){
   payload=await uploadMultipartFile(file,{folderId:plan.folderId,title:resume?undefined:plan.title,requestId:plan.id,resume,onSession:snapshot=>{resume=snapshot;},signal:context.signal,onProgress:value=>context.report({phase:"正在上传分片",completed:Math.round(file.size*value/100),total:file.size,unit:"bytes"})});
  }else{
   const checksum=plan.checksum??await checksumFile(file,context.signal);
   payload=await read(await fetch("/api/files/upload-url",{method:"POST",headers:{"Content-Type":"application/json"},signal:context.signal,body:JSON.stringify({filename:file.name,title:plan.title,requestId:plan.id,folderId:plan.folderId,contentType:file.type||"application/octet-stream",size:file.size,checksum})}));
  }
  documentId=payload.documentId;
  if(payload.uploadUrl)await put(payload.uploadUrl,file,context);
  context.report({phase:"正在核验并封存原件"});
  const response=await completeFileUpload(payload.documentId);
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"原件尚未确认入库。");
  if(!context.current())return {status:"interrupted" as const};
  publishFileRecordChange(payload.documentId, context.current);
  return {status:result.warning?"needs-check" as const:"succeeded" as const,phase:result.warning?"原件已入库，操作记录待核对":"原件已入库；文本索引按需处理"};
  } finally { release(); }
 };
 return startBackgroundOperation({kind:"upload",label:plan.title,href:"/files",run,retry:run});
}

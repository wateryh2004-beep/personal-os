import { checksumFile } from "./file-checksum";
import { safeFilename } from "./schemas";
import { expectedPartSize, multipartPartSize, type MultipartSnapshot } from "./multipart-upload";
const endpoint="/api/files/multipart";
async function read<T>(response:Response):Promise<T> {
  const value=await response.json().catch(()=>null);
  if(!response.ok || !value) throw new Error(value?.error??"续传服务暂不可用；已完成的分片已保留。");
  return value as T;
}
export async function getPendingMultipartUploads(signal?:AbortSignal) {
  const sessions=await read<MultipartSnapshot[]>(await fetch(endpoint,{cache:"no-store",signal}));
  if(!Array.isArray(sessions))throw new Error("续传列表无效。");
  return sessions;
}
export async function cancelMultipartUpload(sessionId:string) {
  return read<{ok:boolean}>(await fetch(`${endpoint}?sessionId=${encodeURIComponent(sessionId)}`,{method:"DELETE",signal:AbortSignal.timeout(40_000)}));
}
export async function completeMultipartSession(sessionId:string,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
  return read<MultipartSnapshot>(await fetcher(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete",sessionId}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(290_000)]):AbortSignal.timeout(290_000)}));
}
/** Browser files are deliberately not retained across refresh: reselect verifies SHA-256. */
export async function uploadMultipartFile(file:File, options:{
  folderId:string|null; resume?:MultipartSnapshot; signal:AbortSignal; onProgress:(percent:number)=>void;
}, fetcher:typeof fetch=fetch) {
  const checksum=await checksumFile(file,options.signal);
  const contentType=file.type||"application/octet-stream";
  if(options.resume && (checksum!==options.resume.checksum || file.size!==options.resume.size || safeFilename(file.name)!==options.resume.filename || contentType!==options.resume.contentType))
    throw new Error("所选文件与未完成上传不一致，请重新选择同一份原文件。");
  const snapshot=await read<MultipartSnapshot>(await fetcher(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({filename:file.name,contentType,size:file.size,folderId:options.resume?options.resume.folderId:options.folderId,checksum}),
    signal:AbortSignal.any([options.signal,AbortSignal.timeout(60_000)])}));
  if(options.resume && snapshot.sessionId!==options.resume.sessionId) throw new Error("续传记录已变化，请刷新列表后重试。");
  if(snapshot.status==="completed" || snapshot.status==="uploaded") return snapshot;
  if(snapshot.status==="completing") return completeMultipartSession(snapshot.sessionId,options.signal,fetcher);
  if(snapshot.status!=="uploading" || snapshot.partSize!==multipartPartSize || snapshot.checksum!==checksum || snapshot.size!==file.size) throw new Error("续传已暂停或过期，请在未完成上传中检查。");
  const completed=new Set<number>();let confirmed=0;
  for(const part of snapshot.parts) {
    if(completed.has(part.partNumber)||part.size!==expectedPartSize(file.size,part.partNumber))throw new Error("续传分片信息无效，请刷新检查。");
    completed.add(part.partNumber);confirmed+=part.size;
  }
  options.onProgress(Math.round(confirmed/file.size*100));
  const missing=Array.from({length:Math.ceil(file.size/multipartPartSize)},(_,i)=>i+1).filter(n=>!completed.has(n));
  let next=0;const stopped=new AbortController();const signal=AbortSignal.any([options.signal,stopped.signal]);
  let failure:unknown;
  async function worker() {
    try {
      while(next<missing.length) {
        signal.throwIfAborted();const partNumber=missing[next++];
        const part=await read<{uploadUrl:string;size:number}>(await fetcher(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sign",sessionId:snapshot.sessionId,partNumber}),signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)])}));
        const size=expectedPartSize(file.size,partNumber);
        if(part.size!==size || typeof part.uploadUrl!=="string")throw new Error("上传分片信息无效。");
        const response=await fetcher(part.uploadUrl,{method:"PUT",body:file.slice((partNumber-1)*multipartPartSize,(partNumber-1)*multipartPartSize+size),signal:AbortSignal.any([signal,AbortSignal.timeout(180_000)])});
        if(!response.ok)throw new Error("分片上传中断；已完成的分片会保留，重新选择原文件即可继续。");
        confirmed+=size;options.onProgress(Math.round(confirmed/file.size*100));
      }
    } catch(error) { if(!failure)failure=error;stopped.abort(); }
  }
  // At most two 8 MiB Blob requests. SHA-256 already used bounded 1 MiB slices.
  await Promise.all(Array.from({length:Math.min(2,missing.length)},worker));
  if(failure)throw new Error(options.signal.aborted?"上传已暂停；重新选择原文件可继续。":"分片上传中断；已完成的分片已保留，可重新选择原文件继续。");
  options.signal.throwIfAborted();
  return completeMultipartSession(snapshot.sessionId,options.signal,fetcher);
}

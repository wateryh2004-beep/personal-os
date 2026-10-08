"use client";
import { useEffect, useRef, useState } from "react";
import { cancelMultipartUpload, getPendingMultipartUploads } from "@/features/files/multipart-client";
import type { MultipartSnapshot } from "@/features/files/multipart-upload";

export function FileResumableUploads({busy,refresh,onResume,onFinish}:{busy:boolean;refresh:string;onResume:(file:File,session:MultipartSnapshot)=>void;onFinish:(session:MultipartSnapshot)=>void}) {
  const [sessions,setSessions]=useState<MultipartSnapshot[]>([]);
  const [error,setError]=useState("");const [reload,setReload]=useState(0);const [canceling,setCanceling]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null);const selected=useRef<MultipartSnapshot|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void getPendingMultipartUploads(controller.signal).then(rows=>{if(!controller.signal.aborted){setSessions(rows);setError("");}})
      .catch(()=>{if(!controller.signal.aborted)setError("未完成上传暂时无法读取，可稍后刷新。");});
    return()=>controller.abort();
  },[refresh,reload]);
  async function cancel(session:MultipartSnapshot) {
    if(canceling||busy)return;setCanceling(session.sessionId);setError("");
    try{await cancelMultipartUpload(session.sessionId);setSessions(rows=>rows.filter(row=>row.sessionId!==session.sessionId));}
    catch(error){setError(error instanceof Error?error.message:"取消状态未确认，请刷新检查。");}
    finally{setCanceling(null);}
  }
  if(!sessions.length&&!error)return null;
  return <section aria-label="未完成上传" className="mb-3 rounded-[10px] border border-[var(--separator)] p-3 text-[12px]">
    <div className="flex items-center justify-between"><p className="font-medium">未完成上传</p><button type="button" disabled={busy||!!canceling} onClick={()=>setReload(value=>value+1)} className="min-h-9 px-2 text-[var(--accent)]">刷新状态</button></div>
    <p className="text-[11px] text-[var(--text-secondary)]">刷新或断网后重新选择同一份文件，只上传缺失分片；最多保留 6 天。选择窗口取消不会取消上传。</p>
    <input ref={input} type="file" className="hidden" aria-label="重新选择续传文件" onChange={event=>{
      const file=event.target.files?.[0],session=selected.current;
      event.target.value="";selected.current=null;if(file&&session)onResume(file,session);
    }}/>
    {sessions.map(session=><div key={session.sessionId} className="mt-2 flex flex-wrap items-center gap-x-3 border-t border-[var(--separator)] pt-2">
      <span className="min-w-0 flex-1 break-all">{session.filename} · {(session.size/1024/1024).toFixed(1)} MiB</span>
      {session.status==="uploaded"||session.status==="completing" ? <button disabled={busy||!!canceling} type="button" className="min-h-9 text-[var(--accent)]" onClick={()=>onFinish(session)}>完成保存</button> :
        session.status==="uploading"||session.status==="initializing" ? <button disabled={busy||!!canceling} type="button" className="min-h-9 text-[var(--accent)]" onClick={()=>{selected.current=session;input.current?.click();}}>选择原文件继续</button> : <span className="text-[var(--text-secondary)]">{session.status==="aborting"?"正在取消":session.status==="failed"?"校验未通过，请取消后重试":"已过期"}</span>}
      <button disabled={busy||!!canceling||session.status==="uploaded"||session.status==="completing"} type="button" className="min-h-9 text-[var(--text-secondary)]" onClick={()=>void cancel(session)}>{canceling===session.sessionId?"正在取消…":"取消上传"}</button>
    </div>)}
    {error?<p role="status" className="mt-2 text-[var(--danger)]">{error}</p>:null}
  </section>;
}

"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { z } from "zod";
import { beginFileStaging, discardFileStaging, updateFileStaging, type FileStagingSession, type StagingPlan } from "@/features/files/staging-runtime";
import { checksumFile } from "@/features/files/file-checksum";
import { canUpload } from "@/features/files/schemas";
import type { UploadPlan } from "@/features/files/upload-runner";
import type { FileFolder } from "@/features/files/queries";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { draftResumeKey } from "@/features/workflow-continuity/draft-resume";

const candidateSchema=z.object({id:z.string().uuid(),title:z.string().max(240),match:z.enum(["content","possible"])});
const candidatesSchema=z.object({matches:z.array(z.object({id:z.string(),candidates:z.array(candidateSchema).max(4)})).max(1)});
export function UploadStaging({files,folderId,folders,onConfirm,onCancel,session}:{files:File[];folderId:string|null;folders:FileFolder[];onConfirm:(plans:UploadPlan[])=>void;onCancel:()=>void;session?:FileStagingSession}){
 const [staging]=useState(()=>session??beginFileStaging(files,folderId).session);
 const [originalPlans]=useState(staging.plans);
 const [plans,setLocalPlans]=useState(originalPlans);
 const livePlans=useRef(plans);
 const [currentScope]=useState(captureWorkspaceScope);
 const [recoveryUnavailable,setRecoveryUnavailable]=useState(!staging.recoverable);
 const setPlans=useCallback((next:SetStateAction<StagingPlan[]>)=>{if(!currentScope())return;const value=typeof next==="function"?next(livePlans.current):next;livePlans.current=value;setLocalPlans(value);if(!updateFileStaging(staging.id,value))setRecoveryUnavailable(true);},[currentScope,staging.id]);
 const [message,setMessage]=useState("");
 useEffect(()=>{
  const controller=new AbortController(),current=captureWorkspaceScope();
  void(async()=>{
   // Hash one original at a time with existing bounded 1 MiB slices.
   const seen=new Map<string,string>();
   for(const plan of originalPlans){
    if(plan.checksum && !plan.checking && !plan.checkFailed){seen.set(`${plan.checksum}:${plan.file.size}`,plan.file.name);continue;}
    if(!canUpload(plan.file.name,plan.file.type||"application/octet-stream",plan.file.size)){
     if(current()&&!controller.signal.aborted)setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,checking:false,excluded:true}:row));continue;
    }
    try{
     const checksum=await checksumFile(plan.file,controller.signal);
     const response=await fetch("/api/files/upload-candidates",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({files:[{id:plan.id,name:plan.file.name,size:plan.file.size,checksum}]})});
     const raw=await response.json();if(!response.ok)throw new Error("lookup_failed");
     const result=candidatesSchema.parse(raw);const match=result.matches.find(row=>row.id===plan.id);if(!match)throw new Error("lookup_invalid");
     const duplicate=seen.get(`${checksum}:${plan.file.size}`);seen.set(`${checksum}:${plan.file.size}`,plan.file.name);
     if(current()&&!controller.signal.aborted)setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,checksum,checking:false,candidates:match.candidates}:row));
     if(duplicate&&current()&&!controller.signal.aborted)setMessage("本批中有相同内容的文件。可保留两份，或取消其中一项。");
    }catch{
     if(current()&&!controller.signal.aborted){setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,checking:false,checkFailed:true}:row));setMessage("部分重复检查未完成。确认上传后仍会校验原件，不会覆盖已有文件。");}
    }
   }
  })();return()=>controller.abort();
 },[originalPlans,setPlans]);
 const selected=plans.filter(plan=>!plan.excluded);
 return <section data-workflow-draft-key={draftResumeKey({kind:"file.staging",id:staging.id})} aria-label="上传前整理" className="space-y-4">
  <p className="text-sm text-[var(--text-secondary)]">先整理，再上传。显示名可修改，原始文件名与原件保持不变。</p>
  <p className="text-xs leading-5 text-[var(--text-secondary)]">原文件在本标签页暂留 15 分钟。刷新或关闭标签页后需重新选择原文件。</p>
  {recoveryUnavailable?<p role="status" className="text-xs leading-5 text-[var(--warning)]">当前整理仍在此处，暂时无法保证离开后的恢复，请保留原文件。</p>:null}
  {staging.overflow>0?<p role="alert">一次最多整理 50 个文件，本次保留前 50 个。</p>:null}
  <label className="block text-xs">批量目标文件夹<select className="ui-field ml-2 min-h-11" defaultValue={folderId??""} onChange={event=>setPlans(rows=>rows.map(row=>({...row,folderId:event.target.value||null})))}><option value="">根目录</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
  <div className="max-h-[50dvh] space-y-3 overflow-auto">{plans.map(plan=><article key={plan.id} className="rounded-[var(--radius-md)] border border-[var(--separator)] p-3">
   <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={!plan.excluded} disabled={!canUpload(plan.file.name,plan.file.type||"application/octet-stream",plan.file.size)} onChange={event=>setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,excluded:!event.target.checked}:row))}/><span className="min-w-0 break-all text-xs">原名：{plan.file.name} · {(plan.file.size/1024/1024).toFixed(2)} MiB</span></label>
   <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">显示名称<input aria-label={`显示名称 ${plan.file.name}`} required maxLength={240} value={plan.title} onChange={event=>setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,title:event.target.value}:row))} className="ui-field mt-1 min-h-11 w-full"/></label><label className="text-xs">目标文件夹<select value={plan.folderId??""} onChange={event=>setPlans(rows=>rows.map(row=>row.id===plan.id?{...row,folderId:event.target.value||null}:row))} className="ui-field mt-1 min-h-11 w-full"><option value="">根目录</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></div>
   <p className="pt-2 text-xs text-[var(--text-secondary)]">{plan.checking?"正在检查相同内容…":!canUpload(plan.file.name,plan.file.type||"application/octet-stream",plan.file.size)?"类型或大小不受支持，已排除。":plan.checkFailed?"暂未完成重复检查。":plan.candidates.length?"找到相同内容，可单独入库或取消本项。":"本次检查未发现相同内容。"}</p>
   {plan.candidates.map(candidate=><a key={candidate.id} href={`/files?file=${candidate.id}`} target="_blank" rel="noopener noreferrer" className="mr-3 inline-flex min-h-11 items-center text-xs text-[var(--accent)]">查看已有：{candidate.title}</a>)}
  </article>)}</div>
  {message?<p role="status" className="text-xs">{message}</p>:null}
  <div className="flex gap-2"><button type="button" disabled={!selected.length||selected.some(plan=>!plan.title.trim())} onClick={()=>{const confirmed=selected.map(({id,file,title,folderId,checksum})=>({id,file,title:title.trim(),folderId,checksum}));onConfirm(confirmed);discardFileStaging(staging.id);}} className="min-h-11 rounded-md bg-[var(--accent)] px-4 text-sm text-white disabled:opacity-40">确认上传 {selected.length} 个文件</button><button type="button" onClick={onCancel} className="min-h-11 px-4 text-sm">稍后继续</button><button type="button" onClick={()=>{discardFileStaging(staging.id);onCancel();}} className="min-h-11 px-4 text-sm text-[var(--danger)]">放弃本次整理</button></div>
 </section>;
}

"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { listWorkbenchOperations, previewWorkbenchUndo, undoWorkbenchOperation } from "@/features/workbench/operation-actions";
import { operationLabels, operationStatusLabels, operationNoticeEvent } from "@/features/workbench/operation-contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { readWorkbenchTimezone } from "@/features/workbench/operation-command-actions";
const LinkDialog=dynamic(()=>import("./operation-links").then(module=>module.OperationLinkDialog));
const ScheduleDialog=dynamic(()=>import("./operation-schedule-dialog").then(module=>module.OperationScheduleDialog));
const CommandTasks=dynamic(()=>import("./operation-command-tasks").then(module=>module.OperationCommandTasks));
export function OperationHistory(){
 const [open,setOpen]=useState(false);
 const [rows,setRows]=useState<Awaited<ReturnType<typeof listWorkbenchOperations>>>([]);
 const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewWorkbenchUndo>>|null>(null);
 const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [timezone,setTimezone]=useState<string|null>(null);
 const [linkIntent,setLinkIntent]=useState<Event|null>(null);const [scheduleIntent,setScheduleIntent]=useState<Event|null>(null);const [taskIntent,setTaskIntent]=useState<Event|null>(null);
 const busyRef=useRef(false);const epoch=useRef(0);const scope=useRef(captureWorkspaceScope());const {show}=useActionFeedback();
 const read=useCallback(()=>{const current=captureWorkspaceScope();void Promise.all([listWorkbenchOperations(),readWorkbenchTimezone()]).then(([value,zone])=>{if(current()){setRows(value);setTimezone(zone);}}).catch(()=>{if(current())setMessage("最近操作暂时无法读取。");});},[]);
 const review=useCallback((receiptId:string)=>{if(busyRef.current)return;const ticket=++epoch.current;const current=captureWorkspaceScope();setOpen(true);setLoading(true);setPreview(null);setMessage("");void previewWorkbenchUndo(receiptId).then(value=>{if(current()&&ticket===epoch.current)setPreview(value);}).catch(()=>{if(current()&&ticket===epoch.current)setMessage("该操作暂不可读取，请重试。");}).finally(()=>{if(current()&&ticket===epoch.current)setLoading(false);});},[]);
 useEffect(()=>{
  const currentEpoch=epoch;
  const notice=(event:Event)=>{const value=(event as CustomEvent<{receiptId:string;message:string}>).detail;if(!value?.receiptId||!scope.current())return;show({message:value.message,tone:"success",undo:()=>review(value.receiptId)});};
  const history=()=>{setPreview(null);setOpen(true);read();};
  const intent=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type==="personal-os:calendar-command-preview"||detail?.kind==="schedule")setScheduleIntent(event);else if(event.type==="personal-os:todo-command-preview")setTaskIntent(event);else if(event.type==="personal-os:link-preview"||detail?.kind==="link")setLinkIntent(event);};
  window.addEventListener(operationNoticeEvent,notice);window.addEventListener("personal-os:workbench-history-open",history);
  for(const name of ["personal-os:workbench-operation","personal-os:calendar-command-preview","personal-os:todo-command-preview","personal-os:link-preview"])window.addEventListener(name,intent);
  return()=>{currentEpoch.current++;window.removeEventListener(operationNoticeEvent,notice);window.removeEventListener("personal-os:workbench-history-open",history);for(const name of ["personal-os:workbench-operation","personal-os:calendar-command-preview","personal-os:todo-command-preview","personal-os:link-preview"])window.removeEventListener(name,intent);};
 },[read,review,show]);
 return <><Dialog open={open} onOpenChange={value=>{if(busy)return false;epoch.current++;setOpen(value);setPreview(null);}}><DialogContent><DialogHeader><DialogTitle>{preview?"核对撤销内容":"最近操作"}</DialogTitle><DialogDescription>{preview?"确认后恢复下列字段。发现后续修改时会停止，请以重新读取的内容为准。":"选择一项操作，先核对影响，再确认撤销。"}</DialogDescription></DialogHeader>
 {loading?<p role="status">正在读取操作…</p>:preview?<><p className="font-medium">{preview.title}{preview.count>1?` 等${preview.count}项`:""}</p><dl className="max-h-60 overflow-auto">{preview.changes.map((change,index)=><div key={index} className="border-b py-2 text-sm"><dt>{change.label}</dt><dd>{change.before} → {change.after}</dd></div>)}</dl>{preview.provider?<p className="text-sm text-[var(--text-secondary)]">这将向Microsoft提交新的修改；其他客户端同时编辑时仍可能影响结果。</p>:null}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>{setPreview(null);read();}}>返回</Button><Button disabled={busy||preview.status!=="available"} onClick={async()=>{const current=captureWorkspaceScope();setBusy(true);busyRef.current=true;try{const result=await undoWorkbenchOperation(preview.receiptId);if(!current())return;setMessage(result.message);if(result.status==="success"){window.dispatchEvent(new CustomEvent("personal-os:operation-undone",{detail:{receiptId:preview.receiptId}}));show({message:result.message,tone:"success"});setPreview(null);read();}}catch{if(current())setMessage("撤销结果尚未确认，请重新读取核对。");}finally{busyRef.current=false;if(current())setBusy(false);}}}>{busy?"核对并撤销中…":"确认撤销"}</Button></div></>:<div className="max-h-[55dvh] overflow-auto">{rows.map(row=><div key={row.id} className="flex items-center justify-between gap-3 border-b py-3 text-sm"><span>{operationLabels[row.operation]??"操作"} · {row.title}{row.count>1?` 等${row.count}项`:""}<small className="block text-[var(--text-tertiary)]">{timezone?new Intl.DateTimeFormat("zh-CN",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(row.created_at)):"时间读取中"} · {operationStatusLabels[row.status]??"状态暂不可读"}</small></span><Button variant="outline" size="sm" disabled={row.status!=="available"} onClick={()=>review(row.id)}>核对撤销</Button></div>)}{!rows.length?<p className="py-4">暂无操作记录。</p>:null}</div>}{message?<p role="status">{message}</p>:null}</DialogContent></Dialog>
 {linkIntent?<LinkDialog initialIntent={linkIntent}/>:null}{scheduleIntent?<ScheduleDialog initialIntent={scheduleIntent}/>:null}{taskIntent?<CommandTasks initialIntent={taskIntent}/>:null}</>;
}

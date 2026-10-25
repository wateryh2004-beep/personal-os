"use client";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useRef, useState } from "react";

import { useOperationTimezone } from "@/features/workbench/use-operation-timezone";
import { useWorkbench } from "./workbench-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TodoTask } from "@/features/tasks/types";
import { taskDueInputToIso } from "@/features/tasks/due-time";
import { applyTodoBatch } from "@/features/tasks/microsoft-todo";
import { publishOperationReceipt as publishReceipt } from "@/features/workbench/operation-contracts";
export function OperationTaskBatch({ tasks }: { tasks: TodoTask[] }) {
  const operationScope=useRef(captureWorkspaceScope());
  const publishOperationReceipt=(notice:Parameters<typeof publishReceipt>[0])=>{if(operationScope.current())publishReceipt(notice);};
 const timezone=useOperationTimezone();
 const workbench=useWorkbench();
 const selected=(workbench?.selected??[]).filter(ref=>ref.kind==="task");
 const [open,setOpen]=useState(false);const [rows,setRows]=useState<TodoTask[]>([]);const [date,setDate]=useState("");const [importance,setImportance]=useState("");const [busy,setBusy]=useState(false);const [results,setResults]=useState<Awaited<ReturnType<typeof applyTodoBatch>>>([]);const [message,setMessage]=useState("");
 const request=useRef({id:"",items:new Map<string,string>()});
 const renew=()=>{request.current={id:crypto.randomUUID(),items:new Map(rows.map(row=>[row.id,crypto.randomUUID()]))};setResults([]);};
 if(!selected.length) return null;
 return <div className="my-3 flex flex-wrap items-center gap-2 border-y border-[var(--separator)] py-2"><span className="text-sm">已选择{selected.length}项</span><Button variant="outline" size="sm" disabled={selected.length>20} onClick={()=>{const chosen=tasks.filter(task=>selected.some(ref=>ref.id===task.id));setRows(chosen);request.current={id:crypto.randomUUID(),items:new Map(chosen.map(row=>[row.id,crypto.randomUUID()]))};setResults([]);setMessage("");setOpen(true);}}>批量改期/重要性…</Button><Button variant="ghost" size="sm" onClick={()=>workbench?.clearSelection()}>清除选择</Button>
 <Dialog open={open} onOpenChange={next=>{if(busy)return false;setOpen(next);}}><DialogContent><DialogHeader><DialogTitle>预览任务批量修改</DialogTitle><DialogDescription>逐项核对Microsoft真实状态后保存。成功项不重发；冲突或未知项保留。</DialogDescription></DialogHeader><label>截止日期<input type="date" className="ui-field block w-full text-base" value={date} onChange={e=>{setDate(e.target.value);renew();}} /></label><label>重要性<select className="ui-field block w-full text-base" value={importance} onChange={e=>{setImportance(e.target.value);renew();}}><option value="">保持不变</option><option value="normal">普通</option><option value="high">高</option><option value="low">低</option></select></label><ul className="max-h-48 overflow-auto text-sm">{rows.map(row=><li key={row.id} className="py-1">{row.title} · {results.find(result=>result.taskId===row.id)?.message??"待确认"}</li>)}</ul>{message?<p role="status">{message}</p>:null}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>关闭</Button><Button disabled={busy||(!date&&!importance)||(Boolean(date)&&!timezone)} onClick={async()=>{setBusy(true);try{const patch={...(date?{dueAt:taskDueInputToIso(`${date}T23:59`,timezone!)}:{}),...(importance?{importance:importance as "low"|"normal"|"high"}:{})};const result=await applyTodoBatch({requestId:request.current.id,items:rows.filter(row=>!results.some(result=>result.taskId===row.id&&result.status==="success")).map(row=>({requestId:request.current.items.get(row.id),taskId:row.id,expected:{title:row.title,status:row.status,lastModifiedAt:row.lastModifiedAt},patch}))});setResults(current=>[...current.filter(old=>!result.some(next=>next.taskId===old.taskId)),...result]);for(const item of result)if(item.status==="success"&&item.receiptId)publishOperationReceipt({receiptId:item.receiptId,message:item.message});}catch{setMessage("结果尚未确认，请保留输入并重新读取。");}finally{setBusy(false);}}}>{busy?"逐项保存中…":"确认写入Microsoft"}</Button></div></DialogContent></Dialog></div>;
}

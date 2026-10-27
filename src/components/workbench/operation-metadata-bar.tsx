"use client";
import { useMetadataVerificationTransport } from "./workbench-provider";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkbench } from "./workbench-context";
import { applyMetadataOperation, readMetadataOperationTargets } from "@/features/workbench/operation-actions";
import { publishOperationReceipt as publishReceipt } from "@/features/workbench/operation-contracts";
export function OperationMetadataBar({ kind, folders }: { kind: "note" | "document"; folders: { id: string; name: string }[] }) {
  const transport=useMetadataVerificationTransport();
  const operationScope=useRef(captureWorkspaceScope());
  const publishOperationReceipt=(notice:Parameters<typeof publishReceipt>[0])=>{if(operationScope.current())publishReceipt(notice);};
  const workbench = useWorkbench();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readMetadataOperationTargets>>>([]);
  const [open, setOpen] = useState(false); const [folder, setFolder] = useState("");
  const [operation, setOperation] = useState<"move" | "archive">("move"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const request = useRef(""); const selected = workbench?.selected.filter(ref => ref.kind === kind) ?? [];
  if (!selected.length) return null;
  return <div className="my-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--separator)] bg-[var(--surface)] p-2" aria-label="选中记录批量操作"><span className="text-sm">已选择 {selected.length} 项</span><Button size="sm" variant="outline" disabled={busy || selected.length > 20} onClick={async () => { setBusy(true); setMessage(""); try { setRows(await (transport?.readTargets??readMetadataOperationTargets)(kind, selected.map(ref => ref.id))); request.current = crypto.randomUUID(); setOpen(true); } catch { setMessage("选中记录暂不可读，请重新选择。"); } finally { setBusy(false); } }}>批量修改…</Button><Button size="sm" variant="ghost" onClick={() => workbench?.clearSelection()}>清除选择</Button>{message && !open ? <p role="status">{message}</p> : null}
  <Dialog open={open} onOpenChange={next => { if (busy) return false; setOpen(next); }}><DialogContent><DialogHeader><DialogTitle>预览批量修改</DialogTitle><DialogDescription>以下 {rows.length} 项会在同一事务保存。发现后续修改时整批拒绝。</DialogDescription></DialogHeader><ul className="max-h-40 overflow-auto text-sm">{rows.map(row => <li key={row.id}>{row.title}</li>)}</ul><label>操作<select className="ui-field block w-full text-base" value={operation} onChange={event => { setOperation(event.target.value as "move" | "archive"); request.current = crypto.randomUUID(); }}><option value="move">移动归属</option><option value="archive">归档</option></select></label>{operation === "move" ? <label>目标文件夹<select className="ui-field block w-full text-base" value={folder} onChange={event => { setFolder(event.target.value); request.current = crypto.randomUUID(); }}><option value="">根目录</option>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}{message ? <p role="status">{message}</p> : null}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button disabled={busy} onClick={async () => { setBusy(true); try { const result = await (transport?.apply??applyMetadataOperation)({ requestId: request.current, operation: `${kind === "note" ? "note" : "file"}_${operation}`, items: rows.map(row => ({ id: row.id, expectedRevision: row.mutation_revision, ...(operation === "move" ? { folderId: folder || null } : {}) })) }); setMessage(result.message); if (result.status === "success") { if (result.receiptId) publishOperationReceipt({ receiptId: result.receiptId, message: result.message }); workbench?.clearSelection(); setOpen(false);  } } catch { setMessage("结果尚未确认，请保留输入并重新读取。"); } finally { setBusy(false); } }}>{busy ? "保存中…" : "确认保存"}</Button></div></DialogContent></Dialog></div>;
}

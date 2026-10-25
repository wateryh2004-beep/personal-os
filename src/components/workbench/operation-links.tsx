"use client";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { workbenchDragMime, workbenchRefSchema, type WorkbenchRef } from "@/features/workbench/contracts";
import type { GraphEntityRef } from "@/features/graph/types";
import { linkWorkbenchRecords, readWorkbenchLinkTargets } from "@/features/workbench/operation-links";
import { publishOperationReceipt as publishReceipt } from "@/features/workbench/operation-contracts";
const graphRef = (ref: WorkbenchRef): GraphEntityRef | null => ref.kind === "note" || ref.kind === "document" || ref.kind === "project" ? { type: ref.kind, id: ref.id } : ref.kind === "opportunity" ? { type: "career_opportunity", id: ref.id } : null;
export function OperationLinkTarget({ target, title, children }: { target: GraphEntityRef; title: string; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return <div className={over ? "rounded-lg outline-2 outline-[var(--accent)]" : ""} onDragOver={event => { if (event.dataTransfer.types.includes(workbenchDragMime)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setOver(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false); }} onDrop={event => {
    if (!event.dataTransfer.types.includes(workbenchDragMime)) return;
    event.preventDefault(); event.stopPropagation(); setOver(false);
    try { const ref = workbenchRefSchema.parse(JSON.parse(event.dataTransfer.getData(workbenchDragMime))); const source = graphRef(ref); if (source && (ref.kind === "note" || ref.kind === "document")) window.dispatchEvent(new CustomEvent("personal-os:link-preview", { detail: { source, target, title } })); } catch { /* Foreign drag data never becomes a command. */ }
  }}><p className="text-[12px] text-[var(--text-tertiary)]">拖入笔记或文件建立关联</p>{children}</div>;
}
export function OperationLinkDialog({initialIntent}:{initialIntent?:Event}) {
  const operationScope=useRef(captureWorkspaceScope());
  const publishOperationReceipt=(notice:Parameters<typeof publishReceipt>[0])=>{if(operationScope.current())publishReceipt(notice);};
  const [preview, setPreview] = useState<{ source: GraphEntityRef; target?: GraphEntityRef; title?: string } | null>(null);
  const [targets, setTargets] = useState<Awaited<ReturnType<typeof readWorkbenchLinkTargets>>>([]);
  const [targetId, setTargetId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef("");
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (event.type === "personal-os:workbench-operation") {
        const parsed = workbenchRefSchema.safeParse(detail?.ref);
        if (detail?.kind !== "link" || !parsed.success || !["note", "document"].includes(parsed.data.kind)) return;
        const source = graphRef(parsed.data); if (!source) return;
        setPreview({ source });
      } else { if (!detail?.source || !detail?.target) return; setPreview(detail); }
      requestId.current = crypto.randomUUID(); setMessage(""); setTargetId(""); setQuery("");
      void readWorkbenchLinkTargets().then(setTargets).catch(() => setMessage("关联对象暂时无法读取，请关闭后重试。"));
    };
    if(initialIntent)open(initialIntent);
  }, [initialIntent]);
  const chosen = preview?.target ?? targets.find(target => `${target.type}:${target.id}` === targetId);
  return <Dialog open={Boolean(preview)} onOpenChange={open => { if (busy) return false; if (!open) setPreview(null); }}><DialogContent><DialogHeader><DialogTitle>建立关联</DialogTitle><DialogDescription>确认关联已有记录。笔记、文件原件保持原位，不改写职业事实。</DialogDescription></DialogHeader>
    {preview?.target ? <p>{preview.title}</p> : <><label className="text-sm">筛选目标<input className="ui-field mt-1 w-full text-base" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="text-sm">项目或职业记录<select className="ui-field mt-1 w-full text-base" value={targetId} onChange={event => { setTargetId(event.target.value); requestId.current = crypto.randomUUID(); }}><option value="">选择已有对象…</option>{targets.filter(target => target.title.includes(query)).map(target => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.title}</option>)}</select></label></>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>取消</Button><Button disabled={!chosen || busy} onClick={async () => { if (!preview || !chosen || busy) return; setBusy(true); try { const result = await linkWorkbenchRecords({ requestId: requestId.current, source: preview.source, target: { type: chosen.type, id: chosen.id } }); setMessage(result.message); if (result.status === "success" && result.receiptId) { publishOperationReceipt({ receiptId: result.receiptId, message: result.message }); setPreview(null); } } catch { setMessage("关联尚未保存，请重试。"); } finally { setBusy(false); } }}>{busy ? "保存中…" : "确认建立关联"}</Button></div>
  </DialogContent></Dialog>;
}

"use client";
import dynamic from "next/dynamic";
import { useOptionalWorkbenchHost } from "./workbench-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { SourceLink as Link } from "@/components/workflow-continuity/source-link";
import { OperationLinkTarget } from "./operation-links";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { workbenchEntityResource } from "@/features/workbench/resource";
import { workbenchRefKey, type WorkbenchEntity, type WorkbenchPosition, type WorkbenchRef } from "@/features/workbench/contracts";
import { WorkbenchActivityContext } from "./workbench-activity";
import { NoteMotionScopeContext } from "@/components/notes/notes-motion";
import { WorkbenchTimestamp } from "./workbench-timestamp";
const FilePdfPreview = dynamic(() => import("@/components/files/file-pdf-preview").then((m) => m.FilePdfPreview), { ssr: false });
const NoteEditor = dynamic(() => import("@/components/notes/note-editor").then((m) => m.NoteEditor), { ssr: false });
export function useWorkbenchEntity(ref: WorkbenchRef) {
  const { kind, id, investmentType } = ref;
  const resource = useMemo(() => workbenchEntityResource({ kind, id, ...(investmentType ? { investmentType } : {}) }), [kind, id, investmentType]);
  useEffect(() => {
    const reconcile = () => { resource.invalidate(); void resource.revalidate({ force: true }).catch(() => {}); };
    window.addEventListener("personal-os:operation-undone", reconcile);
    window.addEventListener("personal-os:operation-completed", reconcile);
    return () => { window.removeEventListener("personal-os:operation-undone", reconcile); window.removeEventListener("personal-os:operation-completed", reconcile); };
  }, [resource]);
  return { ...useWorkspaceResource(resource, null), retry: () => void resource.revalidate({ force: true }).catch(() => {}) };
}
export function WorkbenchEntityView({ entityRef, active = true, editing = false, sameAsMain = false, position, onPosition, onNavigate }: { entityRef: WorkbenchRef; active?: boolean; editing?: boolean; sameAsMain?: boolean; position?: WorkbenchPosition; onPosition?: (position: WorkbenchPosition) => void; onNavigate?: (event: { preventDefault(): void }) => void }) {
  const snapshot = useWorkbenchEntity(entityRef);
  if (snapshot.error && !snapshot.data) return <div role="alert" className="workbench-read-state">暂时无法读取记录。<button type="button" onClick={snapshot.retry}>重试读取</button></div>;
  const result = snapshot.data;
  if (!result) return <p role="status" className="workbench-read-state">正在读取记录…</p>;
  if (result.status !== "ready") return <div role="status" className="workbench-read-state">{result.status === "missing" ? "记录已不可用、已归档或无权访问。" : "记录暂时无法读取。"}<button type="button" onClick={snapshot.retry}>重试读取</button></div>;
  return <>{snapshot.error ? <p role="status" className="workbench-read-state">暂时无法核对最新记录，当前内容已保留。<button type="button" onClick={snapshot.retry}>重试读取</button></p> : null}<WorkbenchDocument key={workbenchRefKey(entityRef)} entity={result.entity} active={active} editing={editing} sameAsMain={sameAsMain} position={position} onPosition={onPosition} onNavigate={onNavigate} /></>;
}
function WorkbenchDocument({ entity, active, editing, sameAsMain, position, onPosition, onNavigate }: { entity: WorkbenchEntity; active: boolean; editing: boolean; sameAsMain: boolean; position?: WorkbenchPosition; onPosition?: (position: WorkbenchPosition) => void; onNavigate?: (event: { preventDefault(): void }) => void }) {
  const host = useOptionalWorkbenchHost();
  const body = entity.bodyMarkdown ?? entity.note?.body_markdown;
  const [pdfVisible, setPdfVisible] = useState(Boolean(entity.pdf));
  const scroll = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(position?.scrollTop ?? 0);
  useEffect(() => { if (active && scroll.current) { scroll.current.scrollTop = initialScroll.current; initialScroll.current = scroll.current.scrollTop; } }, [active]);
  return <NoteMotionScopeContext.Provider value="reference"><WorkbenchActivityContext.Provider value={active}><div ref={scroll} className="workbench-document" onScroll={(event) => { initialScroll.current = event.currentTarget.scrollTop; onPosition?.({ scrollTop: initialScroll.current }); }}>
    {(entity.ref.kind === "opportunity" || entity.ref.kind === "project") ? <OperationLinkTarget target={{ type: entity.ref.kind === "project" ? "project" : "career_opportunity", id: entity.ref.id }} title={entity.title}><header className="workbench-document-header"><h2>{entity.title}</h2>{entity.subtitle ? <p>{entity.subtitle}</p> : null}<Link href={entity.href} onNavigate={onNavigate}>在主区打开 ↗</Link></header></OperationLinkTarget> : <header className="workbench-document-header"><h2>{entity.title}</h2>{entity.subtitle ? <p>{entity.subtitle}</p> : null}<Link href={entity.href} onNavigate={onNavigate}>在主区打开 ↗</Link></header>}
    {entity.currency || entity.mode ? <p className="workbench-record-scope">{entity.currency ? `原币 ${entity.currency}` : ""}{entity.mode ? ` · ${entity.mode === "paper" ? "模拟" : "实盘"}` : ""}</p> : null}
    <dl className="workbench-fields">{entity.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{entity.ref.kind === "note" && field.key === "updated" && field.value ? <WorkbenchTimestamp value={field.value} /> : field.value ?? "未记录"}</dd></div>)}</dl>
    {entity.note && editing && sameAsMain ? <p role="status">这篇笔记已在主区编辑。可在主区继续，避免同一篇笔记同时保存。</p> : null}
    {entity.note && editing && !sameAsMain ? <div className="workbench-note-editor"><NoteEditor verificationTransport={host?.verificationTransport?.note} note={entity.note} insertionRole="reference" noteAiDefaultModel="deepseek-v4-flash" /></div> : <>
      {entity.pdf && body ? <div className="workbench-view-tabs"><button type="button" aria-pressed={pdfVisible} onClick={() => setPdfVisible(true)}>PDF</button><button type="button" aria-pressed={!pdfVisible} onClick={() => setPdfVisible(false)}>笔记正文</button></div> : null}
      {entity.pdf && pdfVisible ? <FilePdfPreview documentId={entity.pdf.documentId} title={entity.pdf.title} active={active} persistProgress={false} initialPage={position?.pdfPage} initialSourceVersion={position?.pdfSourceVersion} onPageChange={(pdfPage, pdfSourceVersion) => onPosition?.({ pdfPage, ...(pdfSourceVersion ? { pdfSourceVersion } : {}) })} /> : body ? <EntityMarkdown sourcePositions body={body} className="workbench-markdown" /> : null}
      {entity.ref.kind === "document" && !entity.pdf ? <a className="ui-link" href={`/api/files/${entity.ref.id}/download`}>下载原件</a> : null}
    </>}
    {entity.sourceUrls.length ? <div className="workbench-sources"><span>记录来源</span>{entity.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">来源 {index + 1} ↗</a>)}</div> : null}
    {entity.asOf ? <p className="workbench-asof">{entity.ref.kind === "task" || entity.ref.kind === "event" ? "缓存同步" : "记录截至"} <WorkbenchTimestamp value={entity.asOf} /></p> : null}
  </div></WorkbenchActivityContext.Provider></NoteMotionScopeContext.Provider>;
}

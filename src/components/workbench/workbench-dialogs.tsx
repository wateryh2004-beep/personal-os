"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { workbenchEntityResource, workspaceScenesResource } from "@/features/workbench/resource";
import { saveWorkspaceScene } from "@/features/workbench/scenes";
import { workbenchReadInputSchema, workbenchRefKey, type WorkbenchEntity, type WorkbenchReadResult, type WorkbenchRef, type WorkspaceScene, type WorkspaceSceneSnapshot } from "@/features/workbench/contracts";
import { useWorkbenchHost } from "./workbench-provider";
import { useWorkbench } from "./workbench-context";
const WorkbenchEntityView = dynamic(() => import("./workbench-entity-view").then((m) => m.WorkbenchEntityView));
export function WorkbenchDialogs() {
  return <><QuickLook /><Comparison /><Scenes /></>;
}
function QuickLook() {
  const host = useWorkbenchHost(); const context = useWorkbench()!;
  const preview = host.preview;
  const launcher = useRef<HTMLElement | null>(null);
  useEffect(() => { if (preview) launcher.current = preview.trigger; }, [preview]);
  const close = () => host.setPreview(null);
  const move = (direction: number) => host.setPreview((current) => current ? { ...current, index: Math.max(0, Math.min(current.queue.length - 1, current.index + direction)) } : null);
  return <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="workbench-preview-dialog" onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); close(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (launcher.current?.isConnected) launcher.current.focus({ preventScroll: true }); }} onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); move(event.key === "ArrowDown" ? 1 : -1); }
  }}><DialogHeader><DialogTitle>速览</DialogTitle><DialogDescription>按 ↑ ↓ 连续浏览，Esc 返回列表。</DialogDescription></DialogHeader>
    {preview ? <><div className="workbench-preview-controls"><button type="button" disabled={preview.index === 0} onClick={() => move(-1)}>上一条</button><span>{preview.index + 1} / {preview.queue.length}</span><button type="button" disabled={preview.index === preview.queue.length - 1} onClick={() => move(1)}>下一条</button><button type="button" onClick={() => { context.openReference(preview.queue[preview.index]); close(); }}>放到参考区</button></div><div className="workbench-preview-body"><WorkbenchEntityView key={workbenchRefKey(preview.queue[preview.index])} entityRef={preview.queue[preview.index]} onNavigate={() => { releaseMobileBackLayerForNavigation("dialog"); launcher.current = null; close(); }} /></div></> : null}
  </DialogContent></Dialog>;
}
function Comparison() {
  const host = useWorkbenchHost(); const refs = host.comparison;
  return <Dialog open={Boolean(refs)} onOpenChange={(open) => { if (!open) host.setComparison(null); }}><DialogContent className="workbench-comparison-dialog" onEscapeKeyDown={(event) => { event.stopPropagation(); }}><DialogHeader><DialogTitle>并排比较</DialogTitle><DialogDescription>只比较已记录的事实，未记录的字段保留为空。</DialogDescription></DialogHeader>{refs ? <ComparisonTable refs={refs} /> : null}</DialogContent></Dialog>;
}
function ComparisonTable({ refs }: { refs: WorkbenchRef[] }) {
  const [result, setResult] = useState<{ key: string; results?: WorkbenchReadResult[]; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(refs);
  const host = useWorkbenchHost();
  useEffect(() => {
    const scope = captureWorkspaceScope(); let current = true;
    const resources = workbenchReadInputSchema.parse({ refs: JSON.parse(key) }).refs.map(workbenchEntityResource);
    const release = resources.map((resource) => resource.subscribe(() => {}));
    const refresh = (force: boolean) => { void Promise.all(resources.map((resource) => resource.revalidate({ force }))).then((results) => { if (current && scope()) setResult({ key, results }); }).catch(() => { if (current && scope()) setResult({ key, failed: true }); }); };
    const reconcile = () => refresh(true);
    refresh(retry > 0);
    window.addEventListener("personal-os:operation-completed", reconcile); window.addEventListener("personal-os:operation-undone", reconcile);
    return () => { current = false; release.forEach((unsubscribe) => unsubscribe()); window.removeEventListener("personal-os:operation-completed", reconcile); window.removeEventListener("personal-os:operation-undone", reconcile); };
  }, [key, retry]);
  if (!result || result.key !== key) return <p role="status">正在读取比较记录…</p>;
  if (result.failed || result.results?.some((item) => item.status !== "ready")) return <div role="alert">部分记录不可用，请移除失效对象或重试。<button type="button" onClick={() => setRetry((value) => value + 1)}>重试读取</button><div>{refs.map((ref, index) => <button key={workbenchRefKey(ref)} type="button" disabled={refs.length <= 2} onClick={() => host.setComparison(refs.filter((_, i) => i !== index))}>移除第 {index + 1} 项</button>)}</div></div>;
  const entities: WorkbenchEntity[] = result.results?.flatMap((item) => item.status === "ready" ? [item.entity] : []) ?? [];
  if (entities.length !== refs.length) return <p role="alert">比较记录暂时无法完整读取。</p>;
  const currencies = new Set(entities.map((entity) => entity.currency ?? "未记录"));
  const modes = new Set(entities.map((entity) => entity.mode ?? "未记录"));
  if (refs[0].kind === "investment" && (currencies.size > 1 || modes.size > 1)) return <p role="alert">请选择同币种、同为实盘或模拟、同类型的投资记录。当前选择的口径不同，无法并排比较金额。</p>;
  const fields = new Map(entities.flatMap((entity) => entity.fields).map((field) => [field.key, field.label]));
  return <div className="workbench-comparison-scroll"><table className="workbench-comparison-table"><thead><tr><th scope="col">字段</th>{entities.map((entity) => <th scope="col" key={workbenchRefKey(entity.ref)}><h3>{entity.title}</h3><Link href={entity.href} onNavigate={() => { releaseMobileBackLayerForNavigation("dialog"); host.setComparison(null); }}>打开记录 ↗</Link><button type="button" disabled={refs.length <= 2} onClick={() => host.setComparison(refs.filter((ref) => workbenchRefKey(ref) !== workbenchRefKey(entity.ref)))}>移除</button></th>)}</tr></thead><tbody>
    {entities[0].currency ? <tr><th scope="row">币种 / 模式</th>{entities.map((entity) => <td key={workbenchRefKey(entity.ref)}>{entity.currency} {entity.mode ? entity.mode === "paper" ? "模拟" : "实盘" : ""}</td>)}</tr> : null}
    {[...fields].map(([fieldKey, label]) => { const values = entities.map((entity) => entity.fields.find((field) => field.key === fieldKey)?.value ?? null); const different = new Set(values).size > 1; return <tr key={fieldKey} data-different={different || undefined}><th scope="row">{label}{different ? <span className="workbench-difference-label">有差异</span> : null}</th>{values.map((value, index) => <td key={index} data-missing={value === null || undefined}>{value ?? "未记录"}</td>)}</tr>; })}
    {entities.some((entity) => entity.bodyMarkdown) ? <tr data-different={new Set(entities.map((entity) => entity.bodyMarkdown ?? null)).size > 1 || undefined}><th scope="row">记录正文</th>{entities.map((entity) => <td key={workbenchRefKey(entity.ref)}>{entity.bodyMarkdown ?? "未记录"}</td>)}</tr> : null}
    <tr><th scope="row">记录截至</th>{entities.map((entity) => <td key={workbenchRefKey(entity.ref)}>{entity.asOf ?? "未记录"}</td>)}</tr>
    <tr><th scope="row">来源</th>{entities.map((entity) => <td key={workbenchRefKey(entity.ref)}>{entity.sourceUrls.length ? entity.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">来源 {index + 1} ↗ </a>) : "未记录"}</td>)}</tr>
  </tbody></table></div>;
}
type SceneSaveInput = { id: string; requestId: string; expectedRevision: number; name: string; snapshot: WorkspaceSceneSnapshot; archive: boolean };
function Scenes() {
  const host = useWorkbenchHost(); const context = useWorkbench()!;
  const [scenes, setScenes] = useState<WorkspaceScene[] | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [name, setName] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const attempt = useRef<SceneSaveInput | null>(null);
  const load = useCallback(() => setLoadVersion((value) => value + 1), []);
  useEffect(() => {
    if (!host.scenesOpen) return;
    const scope = captureWorkspaceScope(); let current = true;
    const release = workspaceScenesResource.subscribe(() => {});
    void workspaceScenesResource.revalidate({ force: loadVersion > 0 }).then((value) => { if (current && scope()) { setScenes(value.scenes); setError(""); } }).catch(() => { if (current && scope()) setError("现场暂时无法读取，请重试。"); });
    return () => { current = false; release(); };
  }, [host.scenesOpen, loadVersion]);
  const persist = async (archive = false) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice(""); const scope = captureWorkspaceScope();
    try {
      const scene = selected ? scenes?.find((item) => item.id === selected) : null;
      if (archive && !scene) return;
      if (!attempt.current || attempt.current.archive !== archive) attempt.current = { id: scene?.id ?? crypto.randomUUID(), requestId: crypto.randomUUID(), expectedRevision: scene?.revision ?? 0, name: archive ? scene!.name : name.trim(), snapshot: archive ? scene!.snapshot : await host.capture(), archive };
      const result = await saveWorkspaceScene(attempt.current);
      if (!scope()) return;
      if (result.status === "saved") {
        attempt.current = null; setSelected(result.scene.archived_at ? null : result.scene.id); setName(result.scene.archived_at ? "" : result.scene.name);
        setNotice(archive ? "现场已归档" : "现场已保存"); load();
      } else setError(result.status === "conflict" ? "另一设备已修改此现场。当前输入保留，请读取最新现场后再决定。" : result.status === "limit" ? "最多保存 20 份现场，请先归档旧现场。" : result.status === "invalid" ? "请填写名称并检查现场地址。" : "现场暂未确认保存，可重试同一次操作。");
    } catch (cause) { if (scope()) setError(cause instanceof Error ? cause.message : "现场保存失败，请重试。"); }
    finally { inFlight.current = false; if (scope()) setBusy(false); }
  };
  return <Dialog open={host.scenesOpen} onOpenChange={(open) => { if (busy || inFlight.current) return false; host.setScenesOpen(open); }}><DialogContent className="workbench-scenes-dialog" onEscapeKeyDown={(event) => { event.stopPropagation(); if (busy || inFlight.current) event.preventDefault(); }}><DialogHeader><DialogTitle>工作台</DialogTitle><DialogDescription>保存布局、筛选和阅读位置。正文保留在各自的记录中。</DialogDescription></DialogHeader>
    <div className="workbench-scenes-body"><button type="button" disabled={busy} onClick={() => { host.setScenesOpen(false); window.dispatchEvent(new Event("personal-os:workbench-history-open")); }}>最近操作</button><div className="workbench-reference-help"><p>{host.reference ? "参考区已打开，可从任意记录的操作菜单切换内容。" : "在记录的操作菜单选择“放到参考区”，即可并排阅读或编辑另一篇笔记。"}</p>{context.selected.length ? <button type="button" onClick={() => { host.setScenesOpen(false); context.compare(); }}>比较已选 {context.selected.length} 项</button> : null}</div>
    <form onSubmit={(event) => { event.preventDefault(); void persist(); }}><label htmlFor="workbench-scene-name">现场名称</label><input id="workbench-scene-name" value={name} maxLength={80} required placeholder="例如：阅读论文与实验笔记" disabled={busy} onChange={(event) => { setName(event.target.value); attempt.current = null; }}/><div className="workbench-scene-actions"><button type="submit" disabled={busy || !name.trim()}>{busy ? "保存中…" : selected ? "用当前布局更新" : "保存当前现场"}</button>{selected ? <button type="button" disabled={busy} onClick={() => { setSelected(null); setName(""); attempt.current = null; }}>另存新现场</button> : null}</div></form>
    {error ? <p role="alert">{error}<button type="button" onClick={() => { attempt.current = null; load(); }}>读取最新现场</button></p> : null}{notice ? <p role="status">{notice}</p> : null}
    <h3>已保存现场</h3>{scenes ? scenes.length ? <ul className="workbench-scene-list">{scenes.map((scene) => <li key={scene.id} data-selected={selected === scene.id || undefined}><div><strong>{scene.name}</strong><p>{scene.updated_at}</p></div><div><button type="button" disabled={busy} onClick={() => host.restore(scene.snapshot)}>恢复</button><button type="button" disabled={busy} onClick={() => { setSelected(scene.id); setName(scene.name); attempt.current = null; setError(""); }}>选择更新</button><button type="button" disabled={busy} onClick={async () => {
      if (inFlight.current) return; inFlight.current = true; setBusy(true); const scope = captureWorkspaceScope();
      try { const result = await saveWorkspaceScene({ id: scene.id, requestId: crypto.randomUUID(), expectedRevision: scene.revision, name: scene.name, snapshot: scene.snapshot, archive: true }); if (!scope()) return; if (result.status === "saved") { setNotice("现场已归档"); load(); } else setError("归档未完成，请读取最新现场后重试。"); } catch { if (scope()) setError("归档未确认，请读取最新现场核对。"); } finally { inFlight.current = false; if (scope()) setBusy(false); }
    }}>归档</button></div></li>)}</ul> : <p>还没有保存现场。</p> : <p role="status">正在读取现场…</p>}
    </div>
  </DialogContent></Dialog>;
}

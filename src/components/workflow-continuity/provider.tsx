"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Files, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useOptionalWorkbenchHost, useWorkbenchHost } from "@/components/workbench/workbench-provider";
import { navigationItemForPath } from "@/lib/navigation-registry";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
import { cancelBackgroundOperation, dismissBackgroundOperation, getBackgroundOperations, getBackgroundOperationsServerSnapshot, retryBackgroundOperation, subscribeBackgroundOperations } from "@/features/workflow-continuity/background-operations";
import { discardWorkflowDraft, expireWorkflowDrafts, getWorkflowDrafts, getWorkflowDraftsServerSnapshot, subscribeWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { beginSourceNavigation, cancelSourceNavigation, captureSourceNavigation, consumeSourceTrailEntry, getSourceTrail, getSourceTrailServerSnapshot, requestSourceSearchRestore, subscribeSourceTrail, type SourceSearchState } from "@/features/workflow-continuity/source-trail";
import { SourceNavigationContext } from "./source-link";
export { SourceLink, useSourceNavigation } from "./source-link";

export function WorkflowContinuityControls() {
  const jobs = useSyncExternalStore(subscribeBackgroundOperations, getBackgroundOperations, getBackgroundOperationsServerSnapshot);
  const drafts = useSyncExternalStore(subscribeWorkflowDrafts, getWorkflowDrafts, getWorkflowDraftsServerSnapshot);
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => expireWorkflowDrafts(), 30_000); return () => clearInterval(timer); }, []);
  const active = jobs.filter(job => job.status === "running").length;
  return <>
    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label={`继续工作：${active} 项进行中，${drafts.length} 份未保存草稿`} className="relative">
      {active ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Files className="size-4" aria-hidden="true" />}
      {jobs.length + drafts.length ? <span className="absolute -right-0.5 -top-0.5 min-h-5 min-w-5 rounded-full bg-[var(--accent)] px-1 text-center text-xs leading-5 text-primary-foreground">{active || drafts.length || jobs.length}</span> : null}
    </Button>
    <Sheet open={open} onOpenChange={value => { setOpen(value); if (!value) setConfirmDiscard(null); }}><SheetContent className="overflow-y-auto">
      <SheetTitle>继续工作</SheetTitle><SheetDescription>进行中的任务与本标签页未保存草稿。</SheetDescription>
      <section className="mt-5 space-y-3"><h2 className="text-sm font-semibold">后台任务</h2>
        {!jobs.length ? <p className="text-sm text-[var(--text-secondary)]">没有后台任务。</p> : jobs.map(job => <div key={job.id} className="border-b border-[var(--separator)] pb-3 text-sm">
          <div className="flex items-start gap-2">{job.status === "running" ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" /> : job.status === "succeeded" ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}<div className="min-w-0 flex-1"><p className="break-words font-medium">{job.label}</p><p role="status" className="mt-1 text-[var(--text-secondary)]">{job.phase}</p></div>{job.status !== "running" ? <Button variant="ghost" size="icon-sm" aria-label={`移除任务记录 ${job.label}`} onClick={() => dismissBackgroundOperation(job.id)}><X className="size-4" aria-hidden="true" /></Button> : null}</div>
          {job.total && job.completed !== undefined ? <progress className="mt-2 w-full accent-[var(--accent)]" aria-label={job.phase} value={job.completed} max={job.total} /> : null}
          <div className="mt-2 flex flex-wrap gap-3"><Link href={job.href} onNavigate={() => setOpen(false)} className="ui-link">返回查看</Link>{job.canCancel ? <button type="button" className="ui-link min-h-11 md:min-h-8" onClick={() => cancelBackgroundOperation(job.id)}>取消任务</button> : null}{job.canRetry ? <button type="button" className="ui-link min-h-11 md:min-h-8" onClick={() => retryBackgroundOperation(job.id)}>重试失败项</button> : null}</div>
        </div>)}
      </section>
      <section className="mt-7 space-y-3"><h2 className="text-sm font-semibold">未保存草稿</h2><p className="text-xs leading-5 text-[var(--text-secondary)]">普通草稿暂留本标签页 15 分钟。关闭标签页会结束恢复；笔记仍按原有自动保存规则处理。</p>
        {!drafts.length ? <p className="text-sm text-[var(--text-secondary)]">没有未保存草稿。</p> : drafts.map(draft => <div key={draft.key} className="flex items-start gap-3 border-b border-[var(--separator)] pb-3 text-sm"><div className="min-w-0 flex-1"><Link href={draft.resumeHref} onClick={event => { if (draft.createKind && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setOpen(false); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: { kind: draft.createKind } }))); } }} onNavigate={() => setOpen(false)} className="ui-link break-words">{draft.label}</Link><p className="mt-1 text-xs text-[var(--text-secondary)]">本标签页 · 未保存</p></div>{draft.kind === "note" ? null : confirmDiscard === draft.key ? <div className="flex flex-wrap gap-2"><button type="button" className="ui-link min-h-11" onClick={() => { discardWorkflowDraft(draft.key); setConfirmDiscard(null); }}>确认丢弃</button><button type="button" className="ui-link min-h-11" onClick={() => setConfirmDiscard(null)}>保留</button></div> : <button type="button" className="ui-link min-h-11" onClick={() => setConfirmDiscard(draft.key)}>丢弃</button>}</div>)}
      </section>
    </SheetContent></Sheet>
  </>;
}

export function WorkflowSourceTrail() {
  const host = useWorkbenchHost(); const pathname = usePathname();
  const entries = useSyncExternalStore(subscribeSourceTrail, getSourceTrail, getSourceTrailServerSnapshot);
  const relevant = entries.filter(entry => entry.destination.split(/[?#]/)[0] === pathname || entries.at(-1)?.destination.split(/[?#]/)[0] === pathname);
  if (!relevant.length) return null;
  return <nav aria-label="来时路径" className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--separator)] px-4 py-1 text-xs text-[var(--text-secondary)]">
    {relevant.map(entry => <button key={entry.id} type="button" className="ui-link inline-flex min-h-9 items-center gap-1" onClick={() => { cancelSourceNavigation(); const source = consumeSourceTrailEntry(entry.id); if (source) { host.restore(source.scene); if (source.search) requestSourceSearchRestore(source.search); } }}><ArrowLeft className="size-3" aria-hidden="true" />返回{entry.label}</button>)}
  </nav>;
}

export function WorkflowNavigationBoundary({ children }: { children: ReactNode }) {
  const host = useOptionalWorkbenchHost(); const router = useRouter();
  const capture = host?.capture;
  useEffect(() => {
    const linkIntent = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.composedPath().find((node): node is Element => node instanceof Element && node.localName === "a" && node.hasAttribute("href"));
      const target = anchor?.getAttribute("target");
      if (!anchor || (target && target.toLowerCase() !== "_self") || anchor.hasAttribute("download")) return;
      let destination: URL;
      try { destination = new URL(anchor.getAttribute("href")!, document.baseURI); } catch { return; }
      if (destination.origin !== window.location.origin || !["http:", "https:"].includes(destination.protocol)) return;
      // Observe intent before Next's bubbling onClick/onNavigate. Never block a
      // normal link or its save guard; SourceLink starts its fresh epoch later.
      cancelSourceNavigation();
    };
    document.addEventListener("click", linkIntent, true);
    window.addEventListener("popstate", cancelSourceNavigation);
    window.addEventListener("personal-os:navigation-start", cancelSourceNavigation);
    return () => {
      document.removeEventListener("click", linkIntent, true);
      window.removeEventListener("popstate", cancelSourceNavigation);
      window.removeEventListener("personal-os:navigation-start", cancelSourceNavigation);
      cancelSourceNavigation();
    };
  }, []);
  const navigate = useCallback((destination: string, label?: string, search?: SourceSearchState) => {
    const href = safeWorkbenchHref(destination); if (!href) return false;
    const current = beginSourceNavigation();
    if (!capture) return false;
    void captureSourceNavigation({ capture, destination: href, label: label ?? navigationItemForPath(window.location.pathname)?.name ?? "来源页面", current, search, navigate: target => router.push(target) });
    return true;
  }, [router, capture]);
  return <SourceNavigationContext.Provider value={navigate}>{children}</SourceNavigationContext.Provider>;
}

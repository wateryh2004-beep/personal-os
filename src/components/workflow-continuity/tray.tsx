"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Files, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
import { cancelBackgroundOperation, dismissBackgroundOperation, getBackgroundOperations, getBackgroundOperationsServerSnapshot, retryBackgroundOperation, subscribeBackgroundOperations } from "@/features/workflow-continuity/background-operations";
import { discardWorkflowDraft, expireWorkflowDrafts, getWorkflowDrafts, getWorkflowDraftsServerSnapshot, subscribeWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { draftResumeHref, getDraftResumeServerStatus, getDraftResumeStatus, parseDraftResumeTarget, requestDraftResume, subscribeDraftResumeStatus } from "@/features/workflow-continuity/draft-resume";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { prepareWorkflowNavigation } from "@/features/workflow-continuity/navigation-protection";
import { aiResumeAcknowledgedEvent, aiResumeHref, getAiContinuityServerSnapshot, getAiContinuitySnapshot, resumeAiResult, subscribeAiContinuity, type AiResumeTarget } from "@/features/assistant/ai-continuity";
import { aiResumeTargetSchema } from "@/features/assistant/client-chat-contracts";
import { continuitySummarySchema, type ContinuitySummary } from "@/features/assistant/continuity-summary-contracts";
import { captureWorkspaceScope, clearWorkspaceResources, readWorkspaceResponse, registerWorkspaceScopeCleanup, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";

type ResumeResult = { status: "accepted" } | { status: "pending"; requestId: string } | { status: "missing" | "invalid"; message: string };
export function WorkflowContinuityControls() {
  const router = useRouter();
  const jobs = useSyncExternalStore(subscribeBackgroundOperations, getBackgroundOperations, getBackgroundOperationsServerSnapshot);
  const drafts = useSyncExternalStore(subscribeWorkflowDrafts, getWorkflowDrafts, getWorkflowDraftsServerSnapshot);
  const ai = useSyncExternalStore(subscribeAiContinuity, getAiContinuitySnapshot, getAiContinuityServerSnapshot);
  const draftResume = useSyncExternalStore(subscribeDraftResumeStatus, getDraftResumeStatus, getDraftResumeServerStatus);
  const [open, setOpen] = useState(false), [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [notice, setNotice] = useState(""), [resuming, setResuming] = useState(false);
  const [summary, setSummary] = useState<ContinuitySummary | null>(null), [summaryBusy, setSummaryBusy] = useState(false), [summaryError, setSummaryError] = useState("");
  const summaryRead = useRef<AbortController | null>(null), sequence = useRef(0);
  const pendingResume = useRef<string | null>(null);
  const resumeBusy = useRef(false);
  const focusRelease = useRef<{ settle: (value: boolean) => void; current: () => boolean } | null>(null);
  useEffect(() => { const timer = setInterval(() => expireWorkflowDrafts(), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => registerWorkspaceScopeCleanup(() => { sequence.current += 1; summaryRead.current?.abort(); summaryRead.current = null; setSummary(null); setSummaryBusy(false); setSummaryError(""); setNotice(""); resumeBusy.current = false; setResuming(false); pendingResume.current = null; focusRelease.current?.settle(false); focusRelease.current = null; }), []);
  useEffect(() => () => { summaryRead.current?.abort(); focusRelease.current?.settle(false); }, []);
  useEffect(() => {
    if (!pendingResume.current || pendingResume.current !== draftResume.requestId || draftResume.status === "pending") return;
    setNotice(draftResume.status === "accepted" ? "已打开原表单。" : draftResume.message ?? "原表单暂未就绪，未保存内容仍保留。");
    pendingResume.current = null;
  }, [draftResume]);
  useEffect(() => {
    const acknowledge = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail?.requestId !== "string" || event.detail.requestId !== pendingResume.current) return;
      setNotice(event.detail.status === "accepted" ? "已打开原位置。" : "原位置暂未就绪，结果仍保留。 "); pendingResume.current = null;
    };
    window.addEventListener(aiResumeAcknowledgedEvent, acknowledge); return () => window.removeEventListener(aiResumeAcknowledgedEvent, acknowledge);
  }, []);
  const readSummary = useCallback(async () => {
    summaryRead.current?.abort(); const controller = new AbortController(); summaryRead.current = controller;
    const request = ++sequence.current, scope = captureWorkspaceScope();
    const current = () => scope() && request === sequence.current && !controller.signal.aborted;
    setSummaryBusy(true); setSummaryError("");
    try {
      const value = continuitySummarySchema.parse(await readWorkspaceResponse<unknown>("/api/workflow-continuity/summary", controller.signal));
      if (current()) setSummary(value);
    } catch (error) {
      if (!current()) return;
      if (error instanceof WorkspaceAuthenticationError) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); }
      else setSummaryError("上次任务状态暂未读全，已有结果仍保留。可稍后重新核对。");
    } finally { if (current()) setSummaryBusy(false); }
  }, []);
  const closeForResume = () => new Promise<boolean>(resolve => {
    const scope = captureWorkspaceScope();
    const timer = setTimeout(() => { if (focusRelease.current?.settle === settle) { focusRelease.current = null; resolve(false); } }, 1_500);
    const settle = (value: boolean) => { clearTimeout(timer); resolve(value && scope()); };
    focusRelease.current = { settle, current: scope }; setOpen(false);
  });
  async function navigate(href: string, resume?: () => Promise<ResumeResult>) {
    if (resumeBusy.current) return;
    const target = safeWorkbenchHref(href); if (!target) { setNotice("原位置不受支持，内容仍保留。"); return; }
    const scope = captureWorkspaceScope(); resumeBusy.current = true; setResuming(true); setNotice("正在确认未保存的修改…");
    try {
      if (!await prepareWorkflowNavigation(target) || !scope()) { if (scope()) setNotice("未离开当前页面，请先处理未保存的修改或版本冲突。"); return; }
      const intentCurrent = captureNavigationIntent();
      if (!await closeForResume() || !scope() || !intentCurrent()) { if (scope()) setNotice("恢复已停止，内容仍保留。"); return; }
      const location = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (target !== location) router.push(target, { scroll: false });
      if (!resume) { setNotice(""); return; }
      const outcome = await resume();
      if (!scope()) return;
      pendingResume.current = outcome.status === "pending" ? outcome.requestId : null;
      setNotice(outcome.status === "accepted" ? "已打开原位置。" : outcome.status === "pending" ? "正在打开原位置…" : outcome.message);
    } finally { if (scope()) { resumeBusy.current = false; setResuming(false); } }
  }
  async function discardDraft(key: string) {
    const draft = drafts.find(item => item.key === key);
    if (!draft) return;
    const target = parseDraftResumeTarget(draft.resumeTarget), current = captureWorkspaceScope();
    if (target?.kind === "file.staging") {
      const { discardFileStaging } = await import("@/features/files/staging-runtime");
      if (!current()) return;
      discardFileStaging(target.id);
    }
    if (current()) { discardWorkflowDraft(key); setConfirmDiscard(null); }
  }
  const resumeAi = (target: AiResumeTarget) => { const href = aiResumeHref(target); if (href) void navigate(href, () => resumeAiResult(target)); };
  const active = jobs.filter(job => job.status === "running").length;
  const liveAi = ai.filter(item => !item.backgroundOperationId || !jobs.some(job => job.id === item.backgroundOperationId));
  const activeTargets = new Set(ai.map(item => JSON.stringify(item.target)));
  const remote = (summary?.entries ?? []).filter(entry => !entry.target || !activeTargets.has(JSON.stringify(entry.target)));
  const count = jobs.length + drafts.length + liveAi.length;
  return <>
    <Button variant="ghost" size="icon-sm" aria-busy={resuming || undefined} onClick={() => { setOpen(true); void readSummary(); }} aria-label={`继续工作：${active} 项进行中，${drafts.length} 份未保存草稿`} className="relative">
      {active ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Files className="size-4" aria-hidden="true" />}
      {count ? <span className="absolute -right-0.5 -top-0.5 min-h-5 min-w-5 rounded-full bg-[var(--accent)] px-1 text-center text-xs leading-5 text-primary-foreground">{active || drafts.length || count}</span> : null}
    </Button>
    {notice ? <p role="status" className="sr-only">{notice}</p> : null}
    <Sheet open={open} onOpenChange={value => { setOpen(value); if (!value) setConfirmDiscard(null); }}><SheetContent className="overflow-y-auto" onCloseAutoFocus={event => { const pending = focusRelease.current; if (!pending) return; event.preventDefault(); focusRelease.current = null; pending.settle(pending.current()); }}>
      <SheetTitle>继续工作</SheetTitle><SheetDescription>进行中的任务与本标签页未保存草稿。</SheetDescription>
      {notice ? <p className="text-sm" role="status">{notice}</p> : null}
      <section className="mt-3 space-y-3"><h2 className="text-sm font-semibold">后台任务</h2>
        {!jobs.length && !liveAi.length ? <p className="text-sm text-[var(--text-secondary)]">没有后台任务。</p> : null}
        {jobs.map(job => <div key={job.id} className="border-b border-[var(--separator)] pb-3 text-sm"><div className="flex items-start gap-2">{job.status === "running" ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" /> : job.status === "succeeded" ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}<div className="min-w-0 flex-1"><p className="break-words font-medium">{job.label}</p><p className="mt-1 text-[var(--text-secondary)]" role="status">{job.phase}</p></div>{job.status !== "running" ? <Button variant="ghost" size="icon-sm" aria-label={`移除任务记录 ${job.label}`} onClick={() => dismissBackgroundOperation(job.id)}><X className="size-4" aria-hidden="true" /></Button> : null}</div>
          {job.total && job.completed !== undefined ? <progress className="mt-2 w-full accent-[var(--accent)]" aria-label={job.phase} value={job.completed} max={job.total} /> : null}
          <div className="mt-2 flex flex-wrap gap-3"><Link href={job.href} onNavigate={event => { event.preventDefault(); const target = ai.find(item => item.backgroundOperationId === job.id)?.target; if (target) resumeAi(target); else void navigate(job.href); }} className="ui-link min-h-11">返回查看</Link>{job.canCancel ? <button type="button" className="ui-link min-h-11" onClick={() => cancelBackgroundOperation(job.id)}>取消任务</button> : null}{job.canRetry ? <button type="button" className="ui-link min-h-11" onClick={() => retryBackgroundOperation(job.id)}>重试失败项</button> : null}</div></div>)}
        {liveAi.map(item => <div key={item.id} className="border-b border-[var(--separator)] pb-3 text-sm"><p className="font-medium">{item.label}</p><p className="mt-1 text-[var(--text-secondary)]">{item.phase}</p><Link className="ui-link inline-flex min-h-11 items-center" href={item.href} onNavigate={event => { event.preventDefault(); resumeAi(item.target); }}>返回查看</Link></div>)}
      </section>
      <section className="mt-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">上次任务</h2><Button variant="ghost" size="sm" disabled={summaryBusy} onClick={() => void readSummary()}><RefreshCw className={summaryBusy ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />核对状态</Button></div>
        <p className="text-xs leading-5 text-[var(--text-secondary)]">刷新或关闭标签页后，任务可能已中断；返回原位置核对结果。</p>
        {summaryBusy ? <p role="status" className="text-sm">正在核对已保存状态…</p> : null}
        {summaryError ? <p role="alert" className="text-sm text-[var(--warning)]">{summaryError}</p> : null}
        {summary?.partial || summary?.truncated ? <p role="status" className="text-xs text-[var(--warning)]">{summary.partial ? "部分来源暂未读全。" : ""}{summary.truncated ? "仅显示最近一批任务，可在原模块继续查看。" : ""}</p> : null}
        {!summaryBusy && summary && !remote.length ? <p className="text-sm text-[var(--text-secondary)]">没有其他可核对的任务。</p> : null}
        {remote.map(item => { const href = safeWorkbenchHref(item.href); return <div key={item.id} className="border-b border-[var(--separator)] pb-3 text-sm"><p className="font-medium">{item.label}</p><p className="mt-1 text-[var(--text-secondary)]">{item.phase}</p>{href ? <Link className="ui-link inline-flex min-h-11 items-center" href={href} onNavigate={event => { event.preventDefault(); if (item.target) resumeAi(item.target); else void navigate(href); }}>返回核对</Link> : <p>原位置暂不可用。</p>}</div>; })}
      </section>
      <section className="mt-5 space-y-3"><h2 className="text-sm font-semibold">未保存草稿</h2><p className="text-xs leading-5 text-[var(--text-secondary)]">普通草稿暂留本标签页 15 分钟。关闭标签页会结束恢复；笔记仍按原有自动保存规则处理。</p>
        {!drafts.length ? <p className="text-sm text-[var(--text-secondary)]">没有未保存草稿。</p> : drafts.map(draft => <div key={draft.key} className="flex items-start gap-3 border-b border-[var(--separator)] pb-3 text-sm"><div className="min-w-0 flex-1"><Link href={draft.resumeHref} onNavigate={event => {
          event.preventDefault(); const target = parseDraftResumeTarget(draft.resumeTarget), aiTarget = aiResumeTargetSchema.safeParse(draft.resumeAiTarget);
          if (aiTarget.success) { resumeAi(aiTarget.data); return; }
          if (target) { const href = draftResumeHref(target); if (href) void navigate(href, () => requestDraftResume(target)); return; }
          void navigate(draft.resumeHref, draft.createKind ? async () => { window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: { kind: draft.createKind } })); return { status: "missing", message: "已返回原位置，请打开新建表单继续。" }; } : undefined);
        }} className="ui-link inline-flex min-h-11 items-center break-words">{draft.label}</Link><p className="mt-1 text-xs text-[var(--text-secondary)]">本标签页 · 未保存</p></div>{draft.kind === "note" ? null : confirmDiscard === draft.key ? <div className="flex flex-wrap gap-2"><button type="button" className="ui-link min-h-11" onClick={() => { void discardDraft(draft.key); }}>确认丢弃</button><button type="button" className="ui-link min-h-11" onClick={() => setConfirmDiscard(null)}>保留</button></div> : <button type="button" className="ui-link min-h-11" onClick={() => setConfirmDiscard(draft.key)}>丢弃</button>}</div>)}
      </section>
    </SheetContent></Sheet>
  </>;
}

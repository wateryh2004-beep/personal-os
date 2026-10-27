"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import { getCaptureRecovery, reconcileCapture, type CaptureOutcome } from "@/features/assistant/ai-capture";
import type { CaptureFixtureTransport } from "@/features/assistant/capture-fixtures";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import { registerAiResumeConsumer } from "@/features/assistant/ai-continuity";
import { getAiActionRecords, getAiActionServerRecords, subscribeAiActionRecords, startAiAction, reconcileAiAction, type AiActionRecord } from "@/features/assistant/ai-action-runtime";

/** Same real reclassification action, owned by a tab-scoped runtime through route unmount. */
export function InboxReclassifyControl({ inboxId, fixtureTransport }: { inboxId: string; fixtureTransport?: AiActionFixtureTransport }) {
  assertContinuousFixtureTransport(fixtureTransport);
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true), refreshed = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const operations = useSyncExternalStore(subscribeAiActionRecords, getAiActionRecords, getAiActionServerRecords);
  const operation = [...operations].reverse().find(record => record.input.kind === "inbox-classification" && record.input.inboxId === inboxId && record.current()) as AiActionRecord<"inbox-classification"> | undefined;
  const pending = operation?.status === "running";
  useEffect(() => {
    if (operation?.result?.status !== "success" || refreshed.current === operation.id || !operation.current()) return;
    refreshed.current = operation.id; router.refresh();
  }, [operation, router]);
  const dispatch = () => {
    setNotice(null);
    try { startAiAction({ kind: "inbox-classification", id: crypto.randomUUID(), inboxId }, fixtureTransport); }
    catch (error) { setNotice(error instanceof Error ? error.message : "尚未开始识别，原记录保留。"); }
  };
  const reconcile = () => {
    if (!operation) return;
    const current = captureWorkspaceScope();
    void reconcileAiAction(operation.id).then(ok => { if (current() && mounted.current) setNotice(ok ? "当前识别状态已读取，请在原记录确认去向。" : "识别结果仍待核对，不会重复生成。"); }).catch(() => { if (current() && mounted.current) setNotice("状态尚未读到，原记录与输入保留。"); });
  };
  return <div className="inline-flex flex-wrap items-center gap-2">
    <button type="button" disabled={pending || operation?.status === "needs-check"} onClick={dispatch} className="pressable inline-flex min-h-8 items-center gap-1 rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"><Sparkles size={13}/>{pending ? "识别中…" : "智能整理"}</button>
    {operation?.status === "needs-check" ? <button type="button" className="ui-link min-h-11 text-xs" onClick={reconcile}>核对识别结果</button> : null}
    {notice || operation?.error || operation?.result?.message ? <span role="status" className="text-[12px] text-[var(--text-secondary)]">{notice || operation?.error || operation?.result?.message}</span> : null}
  </div>;
}

/** A resume is acknowledged only after focusing that actual Inbox row or its exact unresolved capture. */
export function InboxAiResumeBoundary({ rootRef, visibleIds, captureTransport }: { rootRef: RefObject<HTMLElement | null>; visibleIds: string[]; captureTransport?: CaptureFixtureTransport }) {
  assertContinuousFixtureTransport(captureTransport);
  const [selected, setSelected] = useState<string | null>(null), [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const panel = useRef<HTMLElement>(null), mounted = useRef(true);
  const selectedLease = useRef<{ id: string; requestId: string | symbol } | null>(null);
  const readLease = useRef<symbol | null>(null);
  const router = useRouter();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selectedLease.current = null; readLease.current = null; }; }, []);
  useEffect(() => registerWorkspaceScopeCleanup(() => { selectedLease.current = null; readLease.current = null; setSelected(null); setOutcome(null); }), []);
  const recovery = selected ? getCaptureRecovery(selected) : null;
  useEffect(() => registerAiResumeConsumer(target => (target.kind === "inbox-classification" && visibleIds.includes(target.inboxId)) || (target.kind === "inbox-capture" && (visibleIds.includes(target.intentId) || Boolean(getCaptureRecovery(target.intentId)))), async (target, context) => {
    if (target.kind !== "inbox-capture" && target.kind !== "inbox-classification") return false;
    const current = captureWorkspaceScope(), navigation = captureNavigationIntent();
    const id = target.kind === "inbox-capture" ? target.intentId : target.inboxId;
    if (selectedLease.current?.id !== id || selectedLease.current.requestId !== context?.requestId) { selectedLease.current = { id, requestId: context?.requestId ?? Symbol(id) }; readLease.current = null; }
    const selection = selectedLease.current;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-inbox-ai-id="${id}"]`);
    if (row) {
      const details = row.closest("details"); if (details) details.open = true;
      row.scrollIntoView?.({ block: "center" }); row.focus(); return current() && document.activeElement === row;
    }
    if (target.kind !== "inbox-capture" || !getCaptureRecovery(id)) return false;
    setSelected(id); setOutcome(null);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!current() || !navigation() || !mounted.current || selectedLease.current !== selection || (context && !context.current()) || panel.current?.dataset.captureIntentId !== id) return false;
    panel.current.focus(); return document.activeElement === panel.current;
  }), [rootRef, visibleIds, selected]);
  if (!selected || (!recovery && !outcome)) return null;
  return <section ref={panel} data-capture-intent-id={selected} tabIndex={-1} className="mb-4 rounded-[var(--radius-md)] border p-3 text-sm">
    <h2 className="font-medium">原捕捉记录</h2>
    {recovery ? <p className="mt-2 whitespace-pre-wrap text-xs">{recovery.intent.content}</p> : null}
    <p role="status" className="mt-2 text-xs">{outcome?.status === "saved" ? "原记录已保存至 Inbox，分类状态已核对。" : outcome?.message || "保存结果仍待核对，原输入和提交标识保留，不会重复保存。"}</p>
    {recovery ? <button type="button" className="ui-link min-h-11 text-xs" onClick={() => {
      const frozen = recovery.intent, current = captureWorkspaceScope(), navigation = captureNavigationIntent();
      const selection = selectedLease.current, token = Symbol(frozen.intentId); readLease.current = token;
      void reconcileCapture(frozen, captureTransport).then(result => {
        if (!current() || !navigation() || !mounted.current || readLease.current !== token || selectedLease.current !== selection || selection?.id !== frozen.intentId || panel.current?.dataset.captureIntentId !== frozen.intentId || result.intentId !== frozen.intentId) return;
        setOutcome(result); if (result.status === "saved") router.refresh();
      });
    }}>只核对原提交结果</button> : null}
  </section>;
}

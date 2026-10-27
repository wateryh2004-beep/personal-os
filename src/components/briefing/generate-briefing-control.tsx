"use client";

import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initialBriefingGenerationState } from "@/features/briefing/feedback";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import { startAiAction, getAiActionRecords, getAiActionServerRecords, subscribeAiActionRecords, reconcileAiAction, type AiActionRecord } from "@/features/assistant/ai-action-runtime";
import { registerAiResumeConsumer } from "@/features/assistant/ai-continuity";

export function GenerateBriefingControl({ hasBriefing, localDate, fixtureTransport }: { hasBriefing: boolean; localDate?: string; fixtureTransport?: AiActionFixtureTransport }) {
  assertContinuousFixtureTransport(fixtureTransport);
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const ensured = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const panel = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operations = useSyncExternalStore(subscribeAiActionRecords, getAiActionRecords, getAiActionServerRecords);
  const operation = [...operations].reverse().find(value => value.kind === "briefing-generation" && value.input.kind === "briefing-generation" && value.input.localDate === localDate && value.current()) as AiActionRecord<"briefing-generation"> | undefined;
  const state = operation?.result && "status" in operation.result ? operation.result : initialBriefingGenerationState;
  const skippedDate = operation?.result && "started" in operation.result && !operation.result.started && operation.result.reason === "date-changed";
  const pending = operation?.status === "running";
  function start(mode: "manual" | "ensure") {
    if (!scopeIsCurrent()) { setNotice("工作区已变化，请重新打开简报页面。"); return; }
    if (!localDate) { setNotice("日期尚未就绪，现有简报保留。"); return; }
    setNotice(null);
    try { startAiAction({ kind: "briefing-generation", id: crypto.randomUUID(), localDate, mode }, fixtureTransport); }
    catch (error) { setNotice(error instanceof Error ? error.message : "简报请求暂未开始。"); }
  }
  useEffect(() => {
    if (!scopeIsCurrent() || hasBriefing || !localDate || ensured.current === localDate || operation) return;
    ensured.current = localDate;
    try { startAiAction({ kind: "briefing-generation", id: crypto.randomUUID(), localDate, mode: "ensure" }, fixtureTransport); }
    catch { /* The explicit generation button remains available; no automatic retry. */ }
  }, [hasBriefing, localDate, operation, fixtureTransport, scopeIsCurrent]);
  useEffect(() => registerAiResumeConsumer(target => scopeIsCurrent() && target.kind === "briefing-generation" && target.localDate === localDate, async () => { if (!scopeIsCurrent()) return false; panel.current?.focus(); return document.activeElement === panel.current; }), [localDate, scopeIsCurrent]);
  const tone = state.status === "error" ? "text-[var(--danger)]" : state.status === "warning" ? "text-amber-700" : "text-[var(--success)]";
  return <div ref={panel} tabIndex={-1} className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
    <form onSubmit={event => { event.preventDefault(); start("manual"); }}>
      <Button className="w-full sm:w-auto" disabled={pending || !localDate || operation?.status === "needs-check"} type="submit">
        {pending ? <RefreshCw aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
        {pending ? "正在抓取并生成…" : hasBriefing ? "重新生成" : "生成今日简报"}
      </Button>
    </form>
    {state.status !== "idle" || notice || operation?.error || skippedDate ? <p aria-live="polite" className={`max-w-md text-xs leading-5 sm:text-right ${tone}`} role={state.status === "error" ? "alert" : "status"}>{notice || operation?.error || (skippedDate ? "日期已变化，请重新读取今日简报。" : state.message)}</p> : null}
    {operation?.status === "needs-check" ? <div><p className="max-w-md text-xs text-[var(--text-secondary)]">上次生成结果待核对，当前不会自动再次生成。</p><button type="button" className="ui-link min-h-11" onClick={() => { if (!scopeIsCurrent()) { setNotice("工作区已变化，请重新打开简报页面。"); return; } const current = captureWorkspaceScope(); void reconcileAiAction(operation.id).then(ok => { if (mounted.current && current()) setNotice(ok ? "已核对本日记录，可返回简报查看。" : "本日生成结果仍待核对，不会重复生成。"); }).catch(() => { if (mounted.current && current()) setNotice("状态尚未读取，原记录保留。"); }); }}>核对本日简报</button></div> : null}
  </div>;
}

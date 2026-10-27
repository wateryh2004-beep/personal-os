"use client";

import Link from "next/link";
import { requestAssistantSubmission } from "@/features/assistant/pending-submission";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import { startAiAction, getAiActionRecords, getAiActionServerRecords, subscribeAiActionRecords, type AiActionRecord } from "@/features/assistant/ai-action-runtime";
import { registerAiResumeConsumer } from "@/features/assistant/ai-continuity";
import type { TodayBriefItem } from "@/features/today/types";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";

export function askTodayAgent(prompt: string) { requestAssistantSubmission(prompt); }

export function TodayBrief({ items, localDate, sourceFingerprint, fixtureTransport }: { items: TodayBriefItem[]; localDate?: string; sourceFingerprint?: string; fixtureTransport?: AiActionFixtureTransport }) {
  assertContinuousFixtureTransport(fixtureTransport);
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const operations = useSyncExternalStore(subscribeAiActionRecords, getAiActionRecords, getAiActionServerRecords);
  const operation = [...operations].reverse().find(value => value.kind === "today-summary" && value.input.kind === "today-summary" && value.input.localDate === localDate && value.input.sourceFingerprint === sourceFingerprint && value.current()) as AiActionRecord<"today-summary"> | undefined;
  const summary = operation?.result?.summary;
  const summarizing = operation?.status === "running";
  useEffect(() => registerAiResumeConsumer(target => scopeIsCurrent() && target.kind === "today-summary" && target.localDate === localDate && target.sourceFingerprint === sourceFingerprint, async () => { if (!scopeIsCurrent()) return false; section.current?.focus(); return document.activeElement === section.current; }), [localDate, sourceFingerprint, scopeIsCurrent]);
  function summarize() {
    if (!scopeIsCurrent()) { setSummaryError("工作区已变化，请重新打开今日页面。"); return; }
    if (!localDate || !sourceFingerprint) { setSummaryError("日期和来源尚未就绪，现有内容保留。"); return; }
    setSummaryError(null);
    try { startAiAction({ kind: "today-summary", id: crypto.randomUUID(), localDate, sourceFingerprint }, fixtureTransport); }
    catch (error) { setSummaryError(error instanceof Error ? error.message : "AI 总结暂时不可用。"); }
  }
  if (!items.length) return null;

  return (
    <section ref={section} tabIndex={-1} aria-labelledby="today-brief-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="today-brief-heading" className="text-[12px] font-medium text-[var(--text-tertiary)]">
          今日上下文
        </h3>
        <button
          type="button"
          onClick={() => void summarize()}
          disabled={summarizing}
          className="pressable inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {summarizing ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3" aria-hidden="true" />}
          {summary ? "重新总结" : "AI 总结"}
        </button>
      </div>

      {summary ? (
        <p className="mt-2 max-w-[60ch] text-[13px] leading-5.5 text-[var(--text-secondary)]">{summary}</p>
      ) : null}
      {summaryError || operation?.error ? (
        <p role="status" className="mt-2 text-[12px] text-[var(--danger)]">{summaryError || operation?.error}</p>
      ) : null}

      <ol className="mt-1 divide-y divide-[var(--separator)]">
        {items.slice(0, 2).map((item) => (
          <li key={item.id} className="grid gap-2.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-6 text-[var(--text-primary)]">{item.title}</p>
              <p className="mt-0.5 text-[13px] leading-6 text-[var(--text-secondary)]">{item.reason}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {item.sourceRefs.map((source) => (
                  <Link
                    key={`${source.domain}-${source.id}`}
                    href={source.href}
                    className="inline-flex items-center gap-0.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                  >
                    {source.title}
                    <ArrowRight className="size-2.5" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
            {item.suggestedAction ? (
              <button
                type="button"
                onClick={() => { if (!scopeIsCurrent()) { setSummaryError("工作区已变化，请重新打开今日页面。"); return; } askTodayAgent(item.suggestedAction!.agentPrompt); }}
                className="min-h-11 justify-self-start rounded-[var(--radius-sm)] px-2 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                {item.suggestedAction.label}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TodayBriefAction({ item }: { item: TodayBriefItem }) {
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const [notice, setNotice] = useState<string | null>(null);
  return item.suggestedAction ? <>
    <button type="button" onClick={() => { if (!scopeIsCurrent()) { setNotice("工作区已变化，请重新打开今日页面。"); return; } askTodayAgent(item.suggestedAction!.agentPrompt); }} className="min-h-11 text-[13px] text-[var(--accent)]">{item.suggestedAction.label}</button>
    {notice ? <p role="status" className="text-xs text-[var(--danger)]">{notice}</p> : null}
  </> : null;
}

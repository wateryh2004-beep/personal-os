"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import type { TodayBriefItem } from "@/features/today/types";

function askAgent(prompt: string) {
  window.dispatchEvent(new CustomEvent("personal-os:agent-open"));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("personal-os:agent-submit", { detail: { query: prompt } }));
  }, 0);
}

export function TodayBrief({ items }: { items: TodayBriefItem[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  if (!items.length) return null;

  async function summarize() {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const response = await fetch("/api/today/brief-synthesis", { method: "POST" });
      const payload = (await response.json()) as { summary?: string; error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || "AI 总结暂时不可用。");
      setSummary(payload.summary);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "AI 总结暂时不可用。");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <section aria-labelledby="today-brief-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="today-brief-heading" className="text-[10px] font-medium text-[var(--text-tertiary)]">
          今日上下文
        </h3>
        <button
          type="button"
          onClick={() => void summarize()}
          disabled={summarizing}
          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-[10px] font-medium text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {summarizing ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3" aria-hidden="true" />}
          {summary ? "重新总结" : "AI 总结"}
        </button>
      </div>

      {summary ? (
        <p className="mt-2 max-w-[60ch] text-[12px] leading-6 text-[var(--text-secondary)]">{summary}</p>
      ) : null}
      {summaryError ? (
        <p role="status" className="mt-2 text-[11px] text-[var(--danger)]">{summaryError}</p>
      ) : null}

      <ol className="mt-1 divide-y divide-[var(--separator)]">
        {items.slice(0, 2).map((item) => (
          <li key={item.id} className="grid gap-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-medium leading-5 text-[var(--text-primary)]">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">{item.reason}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {item.sourceRefs.map((source) => (
                  <Link
                    key={`${source.domain}-${source.id}`}
                    href={source.href}
                    className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
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
                onClick={() => askAgent(item.suggestedAction!.agentPrompt)}
                className="h-7 self-center rounded-[var(--radius-sm)] px-2 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
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

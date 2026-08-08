"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import type { TodayBriefItem } from "@/features/today/types";

function askAgent(prompt: string) {
  window.dispatchEvent(new CustomEvent("personal-os:agent-open"));
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("personal-os:agent-submit", { detail: { query: prompt } }),
    );
  }, 0);
}

export function TodayBrief({ items }: { items: TodayBriefItem[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  if (!items.length) return null;

  async function summarize() {
    setSummarizing(true); setSummaryError(null);
    try {
      const response = await fetch("/api/today/brief-synthesis", { method: "POST" });
      const payload = await response.json() as { summary?: string; error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || "AI 总结暂时不可用。");
      setSummary(payload.summary);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "AI 总结暂时不可用。");
    } finally { setSummarizing(false); }
  }

  return (
    <section aria-labelledby="today-brief-heading">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <p className="text-xs font-medium text-[var(--accent)]">Today Brief</p>
          <h2 id="today-brief-heading" className="mt-1 text-[15px] font-semibold">
            今天值得处理
          </h2>
        </div>
        <button type="button" onClick={() => void summarize()} disabled={summarizing} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-60">
          {summarizing ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
          {summary ? "重新总结" : "AI 总结"}
        </button>
      </div>
      {summary ? <p className="border-b py-3 text-sm leading-6 text-[var(--text-secondary)]">{summary}</p> : null}
      {summaryError ? <p role="status" className="border-b py-3 text-xs text-[var(--danger)]">{summaryError}</p> : null}
      <ol className="divide-y">
        {items.map((item, index) => (
          <li key={item.id} className="grid gap-3 py-4 sm:grid-cols-[28px_minmax(0,1fr)_auto]">
            <span className="font-mono text-xs text-[var(--text-tertiary)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.reason}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {item.sourceRefs.map((source) => (
                  <Link
                    key={`${source.domain}-${source.id}`}
                    href={source.href}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                  >
                    {source.title}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
            {item.suggestedAction ? (
              <button
                type="button"
                onClick={() => askAgent(item.suggestedAction!.agentPrompt)}
                className="h-8 self-center rounded-[var(--radius-md)] px-3 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
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

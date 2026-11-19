"use client";

import { useState } from "react";
import type { AiReviewDecision, AiSegmentReview } from "@/features/notes/editor/ai-segment-review";
import { countAiReviewDecisions } from "@/features/notes/editor/ai-segment-review";

export function NoteAiSegmentReview({
  plan, busy, refining, onChoose, onChooseAll, onRefine,
}: {
  plan: AiSegmentReview;
  busy: boolean;
  refining: string | null;
  onChoose: (id: string, decision: AiReviewDecision) => void;
  onChooseAll: (decision: "accept" | "reject") => void;
  onRefine: (id: string, instruction: string) => void;
}) {
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const { accepted, rejected, pending } = countAiReviewDecisions(plan);
  return (
    <section className="mt-3 space-y-3" aria-label="AI 逐段修改审阅">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--separator)] pb-2">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">逐段检查 · {plan.hunks.length} 处改动</p>
          <p role="status" className="text-[12px] text-[var(--text-secondary)]">
            {accepted} 处接受，{rejected} 处保留原文，{pending} 处待决定
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={busy} onClick={() => onChooseAll("accept")}
            className="pressable min-h-10 rounded-[8px] px-2.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">
            全部接受
          </button>
          <button type="button" disabled={busy} onClick={() => onChooseAll("reject")}
            className="pressable min-h-10 rounded-[8px] px-2.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50">
            全部保留原文
          </button>
        </div>
      </div>
      {plan.hunks.map((hunk, index) => (
        <article key={hunk.id} className="overflow-hidden rounded-[12px] border border-[var(--separator)] bg-[var(--surface-canvas)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--separator)] px-3 py-2.5">
            <span className="text-[12px] font-medium text-[var(--text-primary)]">修改 {index + 1} · 原文第 {hunk.line} 行附近</span>
            <span className="text-[12px] text-[var(--text-secondary)]">
              {hunk.decision === "accept" ? "已暂存 AI 版本" : hunk.decision === "reject" ? "已选择保留原文" : "等待决定"}
            </span>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            <div className="min-w-0 border-b border-[var(--separator)] p-3 md:border-b-0 md:border-r">
              <p className="mb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">原文</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.65] text-[var(--text-primary)]">{hunk.original || "（此处为新增内容）"}</pre>
            </div>
            <div className="min-w-0 bg-[var(--accent-soft)]/35 p-3">
              <p className="mb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">AI 建议</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.65] text-[var(--text-primary)]">{hunk.suggested || "（建议删除此处）"}</pre>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t border-[var(--separator)] px-2 py-2">
            <button type="button" disabled={busy} aria-pressed={hunk.decision === "accept"}
              onClick={() => onChoose(hunk.id, "accept")}
              className={"pressable min-h-10 rounded-[8px] px-3 text-[12px] font-medium disabled:opacity-50 " + (hunk.decision === "accept" ? "bg-[var(--accent)] text-white" : "text-[var(--accent)] hover:bg-[var(--accent-soft)]")}>
              接受这处修改
            </button>
            <button type="button" disabled={busy} aria-pressed={hunk.decision === "reject"}
              onClick={() => onChoose(hunk.id, "reject")}
              className={"pressable min-h-10 rounded-[8px] px-3 text-[12px] disabled:opacity-50 " + (hunk.decision === "reject" ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]")}>
              保留原文
            </button>
            {hunk.suggested && (
              <details className="w-full rounded-[8px] px-1 pb-1">
                <summary className="pressable cursor-pointer py-2 text-[12px] text-[var(--text-secondary)]">再次修改这一处</summary>
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label={"进一步修改第" + (index + 1) + "处"}
                    value={instructions[hunk.id] ?? ""}
                    onChange={event => setInstructions(previous => ({ ...previous, [hunk.id]: event.target.value }))}
                    placeholder="补充要求（可选），保持原意…"
                    maxLength={240}
                    className="ui-field min-h-11 min-w-0 flex-1 rounded-[8px] border border-[var(--control-border)] bg-[var(--surface-canvas)] px-3 text-[16px] text-[var(--text-primary)] md:text-[13px]" />
                  <button type="button" disabled={busy || Boolean(refining)} onClick={() => onRefine(hunk.id, instructions[hunk.id] ?? "")}
                    className="pressable min-h-11 rounded-[8px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white disabled:opacity-50">
                    {refining === hunk.id ? "正在生成…" : "重新生成此处"}
                  </button>
                </div>
              </details>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

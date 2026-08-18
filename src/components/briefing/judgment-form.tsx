"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, LoaderCircle, PenLine } from "lucide-react";
import { saveBriefingJudgmentAction } from "@/features/briefing/actions";
import { judgmentReviewPeriods, type BriefingJudgment } from "@/features/briefing/judgments";

function SubmitButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  if (pending)
    return (
      <button type="submit" disabled className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-60">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        保存中…
      </button>
    );
  return (
    <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white">
      {saved ? <Check className="size-3.5" aria-hidden="true" /> : <PenLine className="size-3.5" aria-hidden="true" />}
      {saved ? "已保存" : "保存判断"}
    </button>
  );
}

/**
 * 每个值得深思的 Briefing 条目下的低干扰判断区。
 * 判断、置信度、反证条件、回看日期全部由用户手写，AI 不得自动生成或代写。
 */
export function JudgmentForm({ entryId, existing }: { entryId: string; existing: BriefingJudgment | null }) {
  const [open, setOpen] = useState(Boolean(existing));
  const [saved, setSaved] = useState(Boolean(existing));
  const [confidence, setConfidence] = useState(existing?.confidence ?? 60);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
      >
        <PenLine className="size-3.5" aria-hidden="true" />
        写下判断
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-app)] p-3">
      <form
        action={saveBriefingJudgmentAction}
        onSubmit={() => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 4000);
        }}
        className="space-y-3"
      >
        <input type="hidden" name="entry_id" value={entryId} />
        <label className="block">
          <span className="text-xs font-medium text-[var(--text-secondary)]">我的判断</span>
          <textarea
            name="judgment"
            required
            defaultValue={existing?.decisionText ?? ""}
            placeholder="你认为这件事说明了什么？它会怎样发展？"
            rows={3}
            className="mt-1 w-full resize-y rounded-[var(--radius-sm)] border bg-white px-3 py-2 text-sm leading-6"
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
            <span>置信度</span>
            <span className="tabular-nums">{confidence}%</span>
          </span>
          <input
            type="range"
            name="confidence"
            min={0}
            max={100}
            step={5}
            value={confidence}
            onChange={(event) => setConfidence(Number(event.target.value))}
            className="mt-1.5 w-full"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--text-secondary)]">什么会证明我错了？（可选）</span>
          <textarea
            name="falsification"
            defaultValue={existing?.falsificationCondition ?? ""}
            placeholder="写出一个可观察的条件，满足时你的判断需要修正。"
            rows={2}
            className="mt-1 w-full resize-y rounded-[var(--radius-sm)] border bg-white px-3 py-2 text-sm leading-6"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--text-secondary)]">回看日期</span>
          <select name="review_period" defaultValue="3_months" className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border bg-white px-2 text-sm">
            {judgmentReviewPeriods.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-end gap-2">
          {existing ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 rounded-[var(--radius-sm)] px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              收起
            </button>
          ) : null}
          <SubmitButton saved={saved} />
        </div>
      </form>
      {existing ? (
        <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
          {existing.confidence != null ? `置信度 ${existing.confidence}%` : ""}
          {existing.reviewAt ? ` · 回看 ${new Date(existing.reviewAt).toLocaleDateString("zh-CN")}` : ""}
        </p>
      ) : null}
    </div>
  );
}

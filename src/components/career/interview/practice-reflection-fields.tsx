"use client";

import { useFormStatus } from "react-dom";
import { issueLabels, issueRegistry } from "@/features/interview/constants";

export function PracticeReflectionFields({ submitPending = false, submitFailed = false }: { submitPending?: boolean; submitFailed?: boolean } = {}) {
  const { pending: formPending } = useFormStatus();
  const pending = submitPending || formPending;

  return (
    <fieldset disabled={pending} className="mt-8 space-y-6">
      <legend className="text-[15px] font-medium text-[var(--text-primary)]">记录与复盘</legend>

      <label className="block">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">实际用时（秒，可选）</span>
        <input
          name="duration_seconds"
          type="number"
          min={1}
          max={7200}
          step={1}
          inputMode="numeric"
          aria-describedby="practice-duration-help"
          placeholder="如 90"
          className="mt-2 block h-9 w-32 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        <span id="practice-duration-help" className="mt-1.5 block text-[11px] text-[var(--text-tertiary)]">按实际回答时长填写，60 秒 = 1 分钟；没计时可留空</span>
      </label>

      <fieldset>
        <legend className="text-[13px] font-medium text-[var(--text-secondary)]">这次卡在哪里？（可多选，也可跳过）</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {issueRegistry.map((issue) => (
            <label key={issue} className="flex cursor-pointer items-center gap-1.5 rounded-[8px] bg-[var(--surface-control)] px-2.5 py-2 text-[12px] text-[var(--text-secondary)] has-checked:bg-[var(--surface-selected)] has-checked:text-[var(--text-primary)]">
              <input
                type="checkbox"
                name="issue_tags"
                value={issue}
                className="size-3.5 accent-[var(--accent)]"
              />
              {issueLabels[issue]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">补充复盘（可选）</span>
        <textarea
          name="self_review_markdown"
          rows={3}
          maxLength={50_000}
          placeholder="哪里卡住了？哪里可以更直接？"
          className="mt-2 w-full resize-y rounded-[9px] bg-[var(--surface-control)] px-3 py-2 text-[14px] leading-6 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>

      <label className="block">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">下次只改一件事（可选）</span>
        <textarea
          name="next_focus"
          rows={2}
          maxLength={5000}
          aria-describedby="practice-focus-help"
          placeholder="写下下次练习最想改进的一个具体点"
          className="mt-2 w-full resize-y rounded-[9px] bg-[var(--surface-control)] px-3 py-2 text-[14px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        <span id="practice-focus-help" className="mt-1.5 block text-[11px] text-[var(--text-tertiary)]">填写后会更新这道题的练习重点；留空则保留原重点</span>
      </label>

      <div>
        <button type="submit" disabled={pending} aria-busy={pending} className="pressable rounded-[9px] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-60">
          {pending ? "保存中…" : submitFailed ? "核对后重试保存" : "保存这次练习"}
        </button>
        <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">保存后，下次复习安排在 3 天后</p>
      </div>
    </fieldset>
  );
}

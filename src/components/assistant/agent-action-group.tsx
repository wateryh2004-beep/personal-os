"use client";

import { CheckCheck, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { approveAgentActions } from "@/features/assistant/actions";
import type { AgentAction } from "@/features/assistant/types";

export function AgentActionGroup({
  actions,
  onChanged,
}: {
  actions: AgentAction[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const proposed = actions.filter((action) => action.status === "proposed");
  // 移动类操作要求逐条确认（每篇文件都要单独看过目标位置和理由再批），
  // 不提供"全部确认"，避免用户没细看就批量移动多篇文件。
  const hasPerItemOnly = proposed.some((action) => action.actionType === "notes.move");

  if (proposed.length < 2 || hasPerItemOnly) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2">
      <div>
        <p className="text-xs font-medium">计划包含 {proposed.length} 项冻结操作</p>
        {message ? <p role="status" className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{message}</p> : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const results = await approveAgentActions(proposed.map((action) => action.id));
          const succeeded = results.filter((result) => result.status === "success").length;
          const conflicts = results.filter((result) => result.status === "conflict").length;
          setMessage(
            conflicts
              ? `${succeeded} 项已完成，${conflicts} 项因内容变化未执行。`
              : `${succeeded}/${results.length} 项已完成。`,
          );
          onChanged();
        })}
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-3.5" aria-hidden="true" />}
        全部确认
      </button>
    </div>
  );
}

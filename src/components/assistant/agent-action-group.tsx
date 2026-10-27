"use client";

import { CheckCheck, LoaderCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
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
  const [selection, setSelection] = useState<string[]>([]);
  const inFlight = useRef(false);
  const proposed = actions.filter((action) => action.status === "proposed");
  const selected = proposed.filter(action => selection.includes(action.id));
  // 移动类操作要求逐条确认（每篇文件都要单独看过目标位置和理由再批），
  // 不提供"全部确认"，避免用户没细看就批量移动多篇文件。
  const hasPerItemOnly = proposed.some((action) => action.actionType === "notes.move");

  if (proposed.length < 2 || hasPerItemOnly) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">计划包含 {proposed.length} 项冻结操作</p>
        <fieldset disabled={pending} className="mt-2 space-y-1"><legend className="sr-only">选择要确认的操作</legend>{proposed.map((action, index) => <label key={action.id} className="flex min-h-11 items-start gap-2 py-1 text-xs md:min-h-8"><input type="checkbox" checked={selection.includes(action.id)} onChange={event => setSelection(previous => event.target.checked ? [...previous, action.id] : previous.filter(id => id !== action.id))} className="mt-0.5" /><span className="break-words">{index + 1}. {String(action.preview.title ?? action.preview.subject ?? action.preview.currentTitle ?? "待确认操作").slice(0, 160)}</span></label>)}</fieldset>
        <div className="mt-1 flex gap-3 text-xs"><button type="button" disabled={pending} className="ui-link min-h-11 md:min-h-8" onClick={() => setSelection(proposed.map(action => action.id))}>全选</button><button type="button" disabled={pending} className="ui-link min-h-11 md:min-h-8" onClick={() => setSelection([])}>清除选择</button></div>
        {message ? <p role="status" className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{message}</p> : null}
      </div>
      <button
        type="button"
        disabled={pending || !selected.length}
        onClick={() => startTransition(async () => {
          if (inFlight.current) return;
          inFlight.current = true;
          const submittedIds = selected.map(action => action.id);
          try {
          const results = await approveAgentActions(submittedIds);
          const succeeded = results.filter((result) => result.status === "success").length;
          const conflicts = results.filter((result) => result.status === "conflict").length;
          const unfinished = results.length - succeeded - conflicts;
          setMessage(`${succeeded} 项已完成${conflicts ? `，${conflicts} 项因内容变化未执行` : ""}${unfinished ? `，${unfinished} 项未完成，请查看各项结果` : ""}。`);
          onChanged();
          setSelection(previous => previous.filter(id => !submittedIds.includes(id)));
          } catch { setMessage("确认未完成，选择已保留。请核对各项结果后重试。"); }
          finally { inFlight.current = false; }
        })}
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-3.5" aria-hidden="true" />}
        确认所选 {selected.length} 项
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import {
  approveAgentAction,
  rejectAgentAction,
  type AgentActionResult,
} from "@/features/assistant/actions";
import type { AgentAction } from "@/features/assistant/types";

const labels: Record<string, string> = {
  "calendar.create": "创建日程",
  "calendar.update": "修改日程",
  "calendar.delete": "删除日程",
  "tasks.create": "创建任务",
  "tasks.update": "修改任务",
  "tasks.delete": "删除任务",
  "tasks.complete": "完成任务",
  "tasks.reopen": "恢复任务",
  "notes.create": "创建笔记",
  "notes.update": "修改笔记",
  "notes.move": "移动笔记",
  "career.milestone.create": "创建职业节点",
  "career.fact.create": "添加经历事实",
  "memory.create": "保存 Memory / Decision",
  "memory.update": "更新 Memory",
  "projects.create": "创建项目",
};

function primary(preview: Record<string, unknown>) {
  return String(
    preview.subject ??
      preview.title ??
      preview.newTitle ??
      preview.currentTitle ??
      "待确认操作",
  );
}

function details(action: AgentAction) {
  const preview = action.preview;
  if (action.domain === "calendar") {
    const startsAt = preview.startsAt;
    const endsAt = preview.endsAt;
    if (typeof startsAt === "string" && typeof endsAt === "string")
      return `${new Date(startsAt).toLocaleString("zh-CN")} — ${new Date(endsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (action.domain === "tasks") {
    const patch = preview.patch as Record<string, unknown> | undefined;
    const titleChange = patch?.title ? `标题：${preview.title ?? ""} → ${patch.title}` : null;
    return [titleChange, preview.listName, preview.dueAt ? `截止 ${new Date(String(preview.dueAt)).toLocaleString("zh-CN")}` : null, preview.reason].filter(Boolean).join(" · ");
  }
  if (action.domain === "notes" && action.actionType === "notes.move") {
    const target =
      typeof preview.newFolderName === "string" && preview.newFolderName
        ? `新建文件夹「${preview.newFolderName}」`
        : typeof preview.folderName === "string" && preview.folderName
          ? `文件夹「${preview.folderName}」`
          : "";
    const reason = typeof preview.reason === "string" && preview.reason ? preview.reason : "";
    return `移入${target}${reason ? ` · ${reason}` : ""}`;
  }
  return String(preview.summaryOfChanges ?? preview.bodyPreview ?? preview.contentPreview ?? preview.reason ?? "").slice(0, 220);
}

export function AgentActionCard({ action, onChanged }: { action: AgentAction; onChanged: (result: AgentActionResult) => void }) {
  const [result, setResult] = useState<AgentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const currentStatus = result?.status === "success" ? "succeeded" : result?.status === "conflict" ? "conflict" : result?.status === "rejected" ? "rejected" : action.status;
  const run = (kind: "approve" | "reject") => startTransition(async () => {
    const next = kind === "approve" ? await approveAgentAction(action.id) : await rejectAgentAction(action.id);
    setResult(next);
    onChanged(next);
  });
  return <article className="rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] p-3">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{labels[action.actionType] ?? action.actionType}</p><h4 className="mt-1 truncate text-sm font-medium">{primary(action.preview)}</h4>{details(action) ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{details(action)}</p> : null}</div><span className="shrink-0 rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">{action.riskLevel === "high" ? "高风险" : action.riskLevel === "medium" ? "需确认" : "低风险"}</span></div>
    {currentStatus === "proposed" ? <div className="mt-3 flex items-center gap-2"><button type="button" disabled={pending} onClick={() => run("approve")} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}确认</button><button type="button" disabled={pending} onClick={() => run("reject")} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><X className="size-3.5" aria-hidden="true" />取消</button></div> : null}
    {currentStatus !== "proposed" ? <p role="status" className={`mt-3 text-xs ${currentStatus === "succeeded" ? "text-[var(--success)]" : currentStatus === "conflict" || currentStatus === "failed" ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>{result?.message ?? (currentStatus === "succeeded" ? "已完成" : currentStatus === "rejected" ? "已取消" : currentStatus === "conflict" ? "内容已变化，未覆盖" : currentStatus === "executing" ? "正在执行…" : "执行失败")}{result?.href ? <Link href={result.href} className="ml-2 underline">打开</Link> : null}</p> : null}
  </article>;
}

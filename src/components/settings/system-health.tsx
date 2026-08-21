import Link from "next/link";
import type { SystemHealthRow } from "@/features/system-status/queries";

const labels = { tasks: "Tasks", calendar: "Calendar", notes: "Notes", files: "Files", briefing: "Briefing", ai: "AI" } as const;
const links = { tasks: "/tasks", calendar: "/calendar", notes: "/notes", files: "/files", briefing: "/briefing", ai: "/settings" } as const;
const stateLabels = { fresh: "正常", stale: "需要刷新", syncing: "同步中", failed: "失败", conflict: "需要处理冲突", unavailable: "暂不可用" } as const;
const stateClass = { fresh: "text-[var(--success)]", stale: "text-[var(--warning)]", syncing: "text-[var(--accent)]", failed: "text-[var(--danger)]", conflict: "text-[var(--danger)]", unavailable: "text-[var(--warning)]" } as const;

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "暂无记录";
}

export function SystemHealth({ rows }: { rows: SystemHealthRow[] }) {
  return <section className="border-t pt-5"><div className="flex items-baseline justify-between gap-4"><div><h2 className="font-medium">系统状态</h2><p className="mt-1 text-[var(--text-secondary)]">权威源、最近同步与可恢复的异常；不展示内容、密钥或第三方响应。</p></div></div><ul className="mt-3 divide-y border-y">{rows.map((row) => <li key={row.domain} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{labels[row.domain]} <span className={`ml-1 text-xs ${stateClass[row.state]}`}>{stateLabels[row.state]}</span></p><p className="mt-0.5 text-xs text-[var(--text-secondary)]">权威：{row.authoritySource} · 副本：{row.replicaRole} · 最近成功：{when(row.lastSuccessAt)}</p></div><Link href={links[row.domain]} className="text-xs text-[var(--accent)] hover:underline">查看详情 / 重试 →</Link></div>{row.errorSummary || row.conflictSummary || row.nextStep ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{row.conflictSummary || row.errorSummary}{row.nextStep ? ` · 下一步：${row.nextStep}` : ""}{row.retryAfter ? ` · 第 ${row.retryAttempt} 次退避后可重试：${when(row.retryAfter)}` : ""}</p> : null}</li>)}</ul></section>;
}

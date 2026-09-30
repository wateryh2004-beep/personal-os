import Link from "next/link";
import type { SystemHealthRow } from "@/features/system-status/queries";
import type { SystemControlPlane } from "@/features/system-status/control-plane";

const labels = { tasks: "任务", calendar: "日历", notes: "笔记", files: "文件", briefing: "简报", ai: "AI" } as const;
const links = { tasks: "/tasks", calendar: "/calendar", notes: "/notes", files: "/files", briefing: "/briefing", ai: "/settings" } as const;
const stateLabels = { fresh: "正常", stale: "需要刷新", syncing: "同步中", failed: "失败", conflict: "需要处理冲突", unavailable: "暂不可用" } as const;
const stateClass = { fresh: "text-[var(--success)]", stale: "text-[var(--warning)]", syncing: "text-[var(--accent)]", failed: "text-[var(--danger)]", conflict: "text-[var(--danger)]", unavailable: "text-[var(--warning)]" } as const;

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "暂无记录";
}

function ControlState({ state }: { state: "fresh" | "stale" | "unavailable" }) {
  return <span className={`text-[10.5px] ${stateClass[state]}`}>{stateLabels[state]}</span>;
}

export function SystemHealth({ rows, controlPlane }: { rows: SystemHealthRow[]; controlPlane: SystemControlPlane }) {
  const runtimeLabel = controlPlane.deployment.environment === "production" ? "生产" : controlPlane.deployment.environment === "preview" ? "预览" : "本地开发";
  return <section className="border-t border-[var(--separator)] pt-4"><div><h2 className="text-[13px] font-semibold text-[var(--text-primary)]">系统状态</h2><p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">部署、调度和同步证据；不展示内容、密钥或第三方响应。</p></div>
    <div className="mt-2.5 grid gap-2 md:grid-cols-3">
      <div className="rounded-[10px] bg-[var(--surface-control)] p-2.5"><p className="text-[10px] font-medium text-[var(--text-tertiary)]">运行版本</p><p className="mt-1 text-[12px] font-medium text-[var(--text-primary)]">{runtimeLabel}</p><p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">提交：{controlPlane.deployment.commit ?? "本地 / 未报告"}</p><p className="text-[10.5px] leading-4.5 text-[var(--text-secondary)]">遥测：{controlPlane.telemetry.available ? "可读取" : "不可读取"}</p></div>
      <div className="rounded-[10px] bg-[var(--surface-control)] p-2.5"><p className="text-[10px] font-medium text-[var(--text-tertiary)]">日历调度</p><p className="mt-1 text-[12px] font-medium text-[var(--text-primary)]">最近执行：{when(controlPlane.scheduler.lastRunAt)}</p><p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">下次兜底：{when(controlPlane.scheduler.nextScheduledAt)}</p><p className={`text-xs ${controlPlane.scheduler.lastRunFailed ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>{controlPlane.scheduler.lastRunFailed ? "最近一次存在失败" : "最近一次未报告失败"}</p></div>
      <div className="rounded-[10px] bg-[var(--surface-control)] p-2.5"><p className="text-[10px] font-medium text-[var(--text-tertiary)]">实时同步链路</p><p className="mt-1 text-[12px] font-medium text-[var(--text-primary)]">小时 delta：<ControlState state={controlPlane.scheduler.hourlyDeltaState} /></p><p className="mt-1 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">最近执行：{when(controlPlane.scheduler.hourlyDeltaLastRunAt)}</p><p className="text-[10.5px] leading-4.5 text-[var(--text-secondary)]">Webhook：<ControlState state={controlPlane.webhook.state} /> · 最近通知：{when(controlPlane.webhook.lastReceivedAt)}</p></div>
    </div>
    <p className="mt-1.5 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">{controlPlane.scheduler.detail} {controlPlane.webhook.detail}</p>
    <ul className="mt-2.5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{rows.map((row) => <li key={row.domain} className="py-2><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[12.5px] font-medium text-[var(--text-primary)]">{labels[row.domain]} <span className={`ml-1 text-[10px] ${stateClass[row.state]}`}>{stateLabels[row.state]}</span></p><p className="mt-0.5 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">权威：{row.authoritySource} · 副本：{row.replicaRole} · 最近成功：{when(row.lastSuccessAt)}</p></div><Link href={links[row.domain]} className="text-[10.5px] font-medium text-[var(--accent)] hover:underline">查看详情 / 重试 →</Link></div>{row.errorSummary || row.conflictSummary || row.nextStep ? <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">{row.conflictSummary || row.errorSummary}{row.nextStep ? ` · 下一步：${row.nextStep}` : ""}{row.retryAfter ? ` · 第 ${row.retryAttempt} 次退避后可重试：${when(row.retryAfter)}` : ""}</p> : null}</li>)}</ul>
  </section>;
}

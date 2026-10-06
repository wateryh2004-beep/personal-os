import Link from "next/link";
import { ArrowUpRight, Clock3, Server, ChevronDown } from "lucide-react";
import type { SystemHealthRow } from "@/features/system-status/queries";
import type { SystemControlPlane } from "@/features/system-status/control-plane";

const labels = { tasks: "任务", calendar: "日历", notes: "笔记", files: "文件", briefing: "简报", ai: "AI" } as const;
const links = { tasks: "/tasks", calendar: "/calendar", notes: "/notes", files: "/files", briefing: "/briefing", ai: "/settings#ai" } as const;
const stateLabels = { fresh: "有可用记录", stale: "需要刷新", syncing: "同步中", failed: "失败", conflict: "需要处理冲突", unavailable: "暂不可用" } as const;
const stateClass = { fresh: "text-[var(--success)] bg-[var(--success-soft)]", stale: "text-[var(--warning)] bg-[var(--warning-soft)]", syncing: "text-[var(--accent)] bg-[var(--accent-soft)]", failed: "text-[var(--danger)] bg-[var(--danger-soft)]", conflict: "text-[var(--danger)] bg-[var(--danger-soft)]", unavailable: "text-[var(--text-tertiary)] bg-[var(--surface-control)]" } as const;
function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "暂无记录";
}
export function SystemHealth({ rows, controlPlane }: { rows: SystemHealthRow[]; controlPlane: SystemControlPlane }) {
  const runtimeLabel = controlPlane.deployment.environment === "production" ? "生产环境" : controlPlane.deployment.environment === "preview" ? "预览环境" : "本地开发";
  return <section>
    <header><p className="text-xs font-medium tracking-wide text-[var(--accent)]">CONNECTIONS</p><h2 className="mt-2 text-xl font-semibold tracking-tight">连接与同步</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">外部服务、同步进度与需要你处理的事项。</p></header>
    <div className="mt-6 rounded-xl border border-[var(--separator)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={17} aria-hidden="true" />每日后台同步</h3><p className={"mt-3 text-lg font-semibold " + (controlPlane.scheduler.lastRunFailed ? "text-[var(--danger)]" : "text-[var(--text-primary)]")}>{!controlPlane.scheduler.lastRunAt ? "尚未验证自动同步" : controlPlane.scheduler.lastRunFailed ? "最近一次存在失败" : "已取得运行记录"}</p></div><Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">打开日历<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{controlPlane.scheduler.detail}</p>
      <dl className="mt-4 grid gap-3 border-t border-[var(--separator)] pt-4 sm:grid-cols-2"><div><dt className="text-[11px] text-[var(--text-tertiary)]">最近执行</dt><dd className="mt-1 text-xs">{when(controlPlane.scheduler.lastRunAt)}</dd></div><div><dt className="text-[11px] text-[var(--text-tertiary)]">下次预计</dt><dd className="mt-1 text-xs">{when(controlPlane.scheduler.nextScheduledAt)}</dd></div></dl>
    </div>
    <div className="mt-7"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">服务记录</h3><span className="text-[11px] text-[var(--text-tertiary)]">{rows.length} 个模块</span></div><p className="mt-2 text-xs text-[var(--text-tertiary)]">记录状态不代表实时连接健康；展开查看来源与下一步。</p>
      <div className="mt-3 divide-y divide-[var(--separator)]">{rows.map(row => <details key={row.domain} className="group py-1">
        <summary className="flex cursor-pointer list-none items-center gap-3 py-3 marker:hidden"><span className="flex-1 text-sm font-medium">{labels[row.domain]}</span><span className={"rounded-full px-2 py-1 text-[11px] " + stateClass[row.state]}>{stateLabels[row.state]}</span><ChevronDown size={14} aria-hidden="true" className="text-[var(--text-tertiary)] transition-transform group-open:rotate-180" /></summary>
        <div className="mb-3 rounded-lg bg-[var(--surface-control)] p-4"><dl className="grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-[var(--text-tertiary)]">权威来源</dt><dd className="mt-1">{row.authoritySource}</dd></div><div><dt className="text-[var(--text-tertiary)]">副本用途</dt><dd className="mt-1">{row.replicaRole}</dd></div><div><dt className="text-[var(--text-tertiary)]">最近记录时间</dt><dd className="mt-1">{when(row.lastSuccessAt)}</dd></div><div><dt className="text-[var(--text-tertiary)]">同步方向</dt><dd className="mt-1">{row.syncDirection}</dd></div></dl>
          {row.errorSummary || row.conflictSummary ? <p className="mt-3 text-xs leading-5 text-[var(--danger)]">{row.conflictSummary || row.errorSummary}</p> : null}
          {row.nextStep ? <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{row.nextStep}</p> : null}
          {row.retryAfter ? <p className="mt-2 text-xs text-[var(--text-secondary)]">第 {row.retryAttempt} 次退避后可重试：{when(row.retryAfter)}</p> : null}
          <Link href={links[row.domain]} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">查看详情 / 重试<ArrowUpRight size={13} aria-hidden="true" /></Link>
        </div>
      </details>)}</div>
    </div>
    <details className="mt-6 border-t border-[var(--separator)] pt-4"><summary className="cursor-pointer text-xs font-medium">运行环境与可选增强</summary><div className="mt-4 space-y-4 text-xs leading-5 text-[var(--text-secondary)]"><p className="flex items-center gap-2 font-medium"><Server size={15} aria-hidden="true" />运行版本：{runtimeLabel} · {controlPlane.deployment.commit ?? "版本未报告"}</p><p>遥测：{controlPlane.telemetry.available ? "可读取" : "不可读取"} · {controlPlane.telemetry.detail}</p><p>小时 delta：{controlPlane.scheduler.hourlyDeltaLastRunAt ? stateLabels[controlPlane.scheduler.hourlyDeltaState] : "未观察到运行记录"}<br />最近执行：{when(controlPlane.scheduler.hourlyDeltaLastRunAt)}</p><p>Webhook：{controlPlane.webhook.subscriptionExpiresAt ? stateLabels[controlPlane.webhook.state] : "未观察到有效订阅"} · 最近通知：{when(controlPlane.webhook.lastReceivedAt)}<br />{controlPlane.webhook.detail}</p><p className="text-[var(--text-tertiary)]">小时同步和 Webhook 是可选增强；每日同步不依赖它们。此页不展示内容、密钥或第三方响应。</p></div></details>
  </section>;
}

import Link from "next/link";
import type { NowWorkspace } from "@/features/today/types";
import { buildTodayComposition } from "@/features/today/composition";
import { CompleteTaskControl } from "./complete-task-control";
import { TodayTaskActions } from "./today-task-actions";
import { CommitmentActions } from "./today-commitments";
import { TodayDisclosure, TodayReflow } from "./today-motion";

export function TodayLedger({ workspace, composition }: { workspace: NowWorkspace; composition: ReturnType<typeof buildTodayComposition> }) {
  const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: workspace.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const deadline = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: workspace.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const partial = workspace.availability.tasks !== "ready" || workspace.availability.calendar !== "ready";
  if (!composition.ledger.length && !partial) return null;
  return <section className="today-section" aria-labelledby="today-ledger-heading">
    <div className="today-section-heading"><h2 id="today-ledger-heading">今日安排</h2><Link href="/calendar" className="today-quiet-link">日历 ↗</Link></div>
    {partial ? <p className="today-ledger-note" role="status">{workspace.availability.tasks !== "ready" ? "任务" : ""}{workspace.availability.tasks !== "ready" && workspace.availability.calendar !== "ready" ? "和" : ""}{workspace.availability.calendar !== "ready" ? "日程" : ""}暂未更新，已知事项仍保留。</p> : null}
    <TodayReflow signature={composition.ledger.map(row => row.id).join("|")}>
      {composition.ledger.map(row => {
        if (row.kind === "task") return <li key={row.id} data-today-row={row.id} className="today-ledger-row today-task-row">
          <div className="today-ledger-time"><span className={row.dueState === "overdue" ? "today-urgent" : ""}>{row.dueState === "overdue" ? "逾期" : "到期"}</span><TodayTaskActions task={row.task} timezone={workspace.timezone} /></div>
          <Link href={row.href} className="today-ledger-link"><span className="today-ledger-title">{row.task.title || "未命名任务"}</span><span className="today-ledger-meta">{row.task.due_at ? `${row.dueState === "overdue" ? "原截止" : "截止"} ${deadline(row.task.due_at)}` : ""}</span></Link>
          <div className="today-ledger-controls"><CompleteTaskControl taskId={row.task.id} title={row.task.title} status={row.task.status} calm compact /></div>
        </li>;
        if (row.kind === "event") {
          const reminder = workspace.commitments.find(item => item.kind === "event" && item.source.entityId === row.event.id);
          return <li key={row.id} data-today-row={row.id} className="today-ledger-row"><span className="today-ledger-time">{row.event.is_all_day ? "全天" : time(row.event.starts_at)}</span><div className="today-ledger-main"><Link href={row.href} className="today-ledger-link"><span className="today-ledger-title">{row.event.subject || "未命名日程"}</span><span className="today-ledger-meta">{row.event.is_all_day ? "" : `至 ${time(row.event.ends_at)}`}{row.event.location_name ? `${row.event.is_all_day ? "" : " · "}${row.event.location_name}` : ""}</span></Link>{reminder ? <TodayDisclosure label="日程操作"><CommitmentActions item={reminder} timezone={workspace.timezone} /></TodayDisclosure> : null}</div></li>;
        }
        if (row.kind === "commitment") return <li key={row.id} data-today-row={row.id} className="today-ledger-row"><span className="today-ledger-time">留意</span><div className="today-ledger-main"><Link href={row.href} className="today-ledger-link"><span className="today-ledger-title">{row.commitment.title}</span><span className="today-ledger-meta">{row.commitment.whyNow} · {row.commitment.constraint}</span></Link><TodayDisclosure label="更多操作"><CommitmentActions item={row.commitment} timezone={workspace.timezone} /><p className="today-ledger-meta">{row.commitment.source.label}</p></TodayDisclosure></div></li>;
        return <li key={row.id} data-today-row={row.id} className="today-ledger-row"><span className={`today-ledger-time ${row.attention.priority === "critical" ? "today-urgent" : ""}`}>关注</span><Link href={row.href} className="today-ledger-link"><span className="today-ledger-title">{row.attention.title}</span>{row.attention.description ? <span className="today-ledger-meta">{row.attention.description}</span> : null}</Link></li>;
      })}
    </TodayReflow>
  </section>;
}

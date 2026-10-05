import Link from "next/link";
import type { NowWorkspace, NowUpcomingItem, NowCalendarEvent } from "@/features/today/types";
import { addDateKeyDays, getDateKeyInTimeZone } from "@/lib/date-keys";
import { eventRecordHref } from "@/features/today/record-links";
import { TodayBrief, TodayBriefAction } from "./today-brief";
import { TodayDisclosure } from "./today-motion";

export function TodaySecondary({ workspace, future = workspace.upcoming, pastEvents = [], isEvening = false }: { workspace: NowWorkspace; future?: NowUpcomingItem[]; pastEvents?: NowCalendarEvent[]; isEvening?: boolean }) {
  const today = workspace.focus?.date ?? (workspace.generatedAt ? getDateKeyInTimeZone(workspace.generatedAt, workspace.timezone) : null);
  const formatDate = (value: string) => {
    const key = getDateKeyInTimeZone(value, workspace.timezone);
    return today && key === addDateKeyDays(today, 1) ? "明天" : key?.slice(5).replace("-", "/") ?? "待定";
  };
  const futureLimit = isEvening ? 2 : 3;
  const contextItems = workspace.todayBrief.filter(item => item.sourceRefs.every(source => !["tasks", "calendar", "inbox"].includes(source.domain)));
  const inboxContext = workspace.todayBrief.find(item => item.sourceRefs.some(source => source.domain === "inbox"));
  function list(items: NowUpcomingItem[]) {
    return <ul className="today-future-list">{items.map(item => <li key={item.id} className="today-future-row"><span className="today-future-date">{formatDate(item.at)}</span><Link href={item.href} className="ui-record-link today-future-link">{item.title}{item.detail ? <span className="today-future-detail">{item.detail}</span> : null}</Link></li>)}</ul>;
  }
  return <>
    {future.length ? <section className="today-section" aria-labelledby="today-future-heading"><div className="today-section-heading"><h2 id="today-future-heading">{isEvening ? "之后" : "接下来"}</h2><span>未来 7 天</span></div>{list(future.slice(0, futureLimit))}{future.length > futureLimit ? <TodayDisclosure label={`其余 ${future.length - futureLimit} 项`} className="today-more-future" testId="today-future-more">{list(future.slice(futureLimit))}</TodayDisclosure> : null}</section> : null}
    <section className="today-background" aria-label="背景与整理">
      {pastEvents.length ? <TodayDisclosure label={`已结束 ${pastEvents.length} 项`} testId="today-past">{<ul>{pastEvents.map(event => <li key={event.id}><Link href={eventRecordHref(event.id)} className="ui-record-link today-future-link"><span className="today-ledger-meta">{new Intl.DateTimeFormat("zh-CN", { timeZone: workspace.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.starts_at))}</span>{event.subject}</Link></li>)}</ul>}</TodayDisclosure> : null}
      {workspace.inboxCount > 0 ? <Link href="/inbox" className="today-inbox-link"><span>待整理 {workspace.inboxCount} 条</span><span aria-hidden="true">→</span></Link> : workspace.availability.inbox === "unavailable" ? <p className="today-ledger-note">收集箱暂未更新</p> : null}
      <TodayDisclosure label="背景与简报" testId="today-background">
        {inboxContext ? <TodayBriefAction item={inboxContext} /> : null}<TodayBrief items={contextItems} />
        {workspace.briefing.entries.length ? <ul>{workspace.briefing.entries.map(entry => <li key={entry.id}><a href={entry.url || "/briefing"} target={entry.url ? "_blank" : undefined} rel={entry.url ? "noreferrer" : undefined} className="ui-record-link today-future-link">{entry.title}{entry.reason ? <span className="today-future-detail">{entry.reason}</span> : null}</a></li>)}</ul> : null}
        {workspace.availability.briefing === "unavailable" ? <p className="today-ledger-note">简报暂未更新</p> : !contextItems.length && !workspace.briefing.entries.length ? <p className="today-ledger-note">暂无额外背景</p> : null}
        <Link href="/briefing" className="ui-link today-quiet-link">查看简报 ↗</Link>
      </TodayDisclosure>
    </section>
  </>;
}

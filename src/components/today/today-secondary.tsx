import Link from "next/link";
import type { NowWorkspace } from "@/features/today/types";
import { TodayBrief, TodayBriefAction } from "./today-brief";
import { TodaySectionHeader } from "./section-header";

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", weekday: "short" }).format(new Date(value));
}

export function TodaySecondary({ workspace }: { workspace: NowWorkspace }) {
  const contextItems = workspace.todayBrief.filter((item) => item.sourceRefs.every((source) => !["tasks", "calendar", "inbox"].includes(source.domain)));
  const inboxContext = workspace.todayBrief.find((item) => item.sourceRefs.some((source) => source.domain === "inbox"));
  function upcomingList(items: NowWorkspace["upcoming"]) {
    return <ul className="divide-y divide-[var(--separator)]">{items.map((item, index) => {
      const date = formatDate(item.at, workspace.timezone);
      const previous = index > 0 ? formatDate(items[index - 1].at, workspace.timezone) : null;
      return <li key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-3">
        <span className="pt-0.5 text-[13px] tabular-nums text-[var(--text-secondary)]">{date !== previous ? date : <span className="sr-only">{date}</span>}</span>
        <Link href={item.href} className="min-w-0 hover:text-[var(--accent)]"><span className="line-clamp-2 text-[15px] font-medium leading-6">{item.title}</span>{item.detail ? <span className="mt-1 line-clamp-1 block text-[13px] leading-5 text-[var(--text-secondary)]">{item.detail}</span> : null}</Link>
      </li>;
    })}</ul>;
  }
  return <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-12">
    <section aria-labelledby="today-future-heading" className="min-w-0">
      <TodaySectionHeader href="/calendar" label="日历"><span id="today-future-heading">接下来 7 天</span></TodaySectionHeader>
      {workspace.upcoming.length ? <>{upcomingList(workspace.upcoming.slice(0, 3))}{workspace.upcoming.length > 3 ? <details><summary className="min-h-11 cursor-pointer py-2.5 text-[13px] text-[var(--accent)]">查看其余 {workspace.upcoming.length - 3} 项</summary>{upcomingList(workspace.upcoming.slice(3))}</details> : null}</> : <p className="py-3 text-[14px] leading-6 text-[var(--text-secondary)]">{[workspace.availability.calendar, workspace.availability.tasks, workspace.availability.career].includes("unavailable") ? "部分来源暂不可用，未来安排尚不完整" : "未来一周暂无已安排事项"}</p>}
    </section>
    <section aria-label="背景与整理" className="min-w-0 border-t border-[var(--separator)] pt-4 lg:border-t-0 lg:pt-0">
      {workspace.inboxCount > 0 ? <Link href="/inbox" className="flex min-h-12 items-center justify-between gap-3 text-[14px] hover:text-[var(--accent)]"><span>待整理 <span className="ml-1 text-[var(--text-secondary)]">{workspace.inboxCount} 条</span></span><span aria-hidden="true" className="text-[var(--text-secondary)]">→</span></Link> : workspace.availability.inbox === "unavailable" ? <p className="py-3 text-[13px] text-[var(--text-secondary)]">收集箱暂不可用</p> : null}
      <details className="group" data-testid="today-background">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium"><span>背景与简报</span><span className="text-[13px] font-normal text-[var(--text-secondary)] group-open:hidden">展开</span><span className="hidden text-[13px] font-normal text-[var(--text-secondary)] group-open:inline">收起</span></summary>
        <div className="pt-2">{inboxContext ? <TodayBriefAction item={inboxContext} /> : null}<TodayBrief items={contextItems} />
          {workspace.briefing.entries.length ? <ul className="mt-3 divide-y divide-[var(--separator)]">{workspace.briefing.entries.map((entry) => <li key={entry.id}><a href={entry.url || "/briefing"} target={entry.url ? "_blank" : undefined} rel={entry.url ? "noreferrer" : undefined} className="block py-3 hover:text-[var(--accent)]"><span className="block text-[15px] leading-6">{entry.title}</span>{entry.reason ? <span className="mt-1 block text-[13px] leading-5 text-[var(--text-secondary)]">{entry.reason}</span> : null}</a></li>)}</ul> : null}
          {workspace.availability.briefing === "unavailable" ? <p className="py-3 text-[13px] text-[var(--text-secondary)]">简报暂不可用</p> : !contextItems.length && !workspace.briefing.entries.length ? <p className="py-3 text-[13px] text-[var(--text-secondary)]">暂无额外背景</p> : null}
          <Link href="/briefing" className="inline-flex min-h-11 items-center text-[13px] text-[var(--accent)]">查看简报 →</Link>
        </div>
      </details>
    </section>
  </div>;
}

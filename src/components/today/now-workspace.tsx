import Link from "next/link";
import { addDateKeyDays, getDateKeyInTimeZone } from "@/lib/date-keys";
import { ArrowUpRight } from "lucide-react";
import { TodayPriorities } from "./today-priorities";
import type { NowWorkspace } from "@/features/today/types";
import { buildTodayComposition } from "@/features/today/composition";
import { NowHeader } from "./now-header";
import { TodayLedger } from "./today-ledger";
import { TodaySecondary } from "./today-secondary";
import { TodayContinue } from "./today-continue";
import { TodayMotion } from "./today-motion";
import { CommitmentActions } from "./today-commitments";
import { TodayDisclosure } from "./today-motion";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  const composition = buildTodayComposition(workspace);
  const lead = composition.lead;
  const eventDay = lead?.kind === "event" ? getDateKeyInTimeZone(lead.event.starts_at, workspace.timezone) : null;
  const eventDayLabel = composition.todayKey && eventDay === addDateKeyDays(composition.todayKey, 1) ? "明天" : eventDay?.slice(5).replace("-", "/");
  const eventLead = lead?.kind === "event" ? <>
    {lead.isEvening ? <p className="today-evening-note">{composition.pastEvents.length ? "今天的日程已结束" : "今天没有固定日程"}</p> : null}
    <section className="today-lead" aria-label="接下来的安排">
      <p className="today-lead-label">{lead.state === "ongoing" ? "正在进行" : lead.state === "starting_soon" ? "即将开始" : "接下来"}{lead.isEvening ? ` / ${eventDayLabel}` : ""}</p>
      <h2 className="today-lead-title">{lead.event.subject || "未命名日程"}</h2>
      <p className="today-lead-meta">{new Intl.DateTimeFormat("zh-CN", { timeZone: workspace.timezone, month: "long", day: "numeric", ...(lead.event.is_all_day ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) }).format(new Date(lead.event.starts_at))}{lead.event.is_all_day ? " · 全天" : ""}{lead.event.location_name ? ` · ${lead.event.location_name}` : ""}</p>
      <div className="today-lead-actions"><Link href={lead.href} className="today-primary-action">查看安排<ArrowUpRight className="size-4" aria-hidden="true" /></Link></div>
      {workspace.commitments.some(item => item.kind === "event" && item.source.entityId === lead.event.id) ? <TodayDisclosure label="日程操作"><CommitmentActions item={workspace.commitments.find(item => item.kind === "event" && item.source.entityId === lead.event.id)!} timezone={workspace.timezone} /></TodayDisclosure> : null}
    </section>
  </> : null;
  return <TodayMotion date={composition.todayKey ?? "today"}>
    <div data-motion-group="lead">
      {workspace.focus ? <TodayPriorities key={workspace.focus.date} focus={workspace.focus} timezone={workspace.timezone} header={<NowHeader workspace={workspace} />} leadBefore={eventLead} compactAll={lead?.kind !== "focus"} primaryTaskId={lead?.kind === "focus" ? lead.task.id : undefined} /> : <><NowHeader workspace={workspace} />{eventLead}</>}
    </div>
    <div data-motion-group="ledger"><TodayLedger workspace={workspace} composition={composition} /><TodayContinue /></div>
    <div data-motion-group="future"><TodaySecondary workspace={workspace} future={composition.future} pastEvents={composition.pastEvents} isEvening={composition.isEvening} /></div>
  </TodayMotion>;
}

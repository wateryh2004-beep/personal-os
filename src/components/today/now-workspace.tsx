import Link from "next/link";
import { TodayPriorities } from "./today-priorities";
import type { NowWorkspace } from "@/features/today/types";
import { NowHeader } from "./now-header";
import { TodayCommitments } from "./today-commitments";
import { TodayFocusStack } from "./today-focus-stack";
import { TodaySchedule } from "./today-schedule";
import { TodaySecondary } from "./today-secondary";
import { todayPresentation } from "@/features/today/presentation";
import { TodayContinue } from "./today-continue";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  const presentation = todayPresentation(workspace);
  const remaining = presentation.remainingWorkspace;
  const hasAdditionalWork = Boolean(presentation.commitments.length || remaining.tasks.overdue.length || remaining.tasks.today.length || remaining.attention.length || remaining.availability.tasks === "unavailable");
  const imminent = workspace.nextAction.kind === "event" && workspace.nextAction.state !== "upcoming" ? workspace.nextAction : null;
  return <div className="now-workspace mx-auto w-full max-w-[1040px] px-5 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
    <NowHeader workspace={workspace} />
    {imminent ? <Link href={imminent.href} className="mt-6 flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-[var(--accent)]">
      <span className="mt-0.5 shrink-0 text-[12px] font-semibold">{imminent.state === "ongoing" ? "正在进行" : "即将开始"}</span>
      <span className="min-w-0"><span className="block text-[15px] font-semibold leading-6">{imminent.event.subject}</span><span className="block text-[13px] leading-5">{new Intl.DateTimeFormat("zh-CN", { timeZone: workspace.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(imminent.event.starts_at))} · {imminent.reason}</span></span>
    </Link> : null}
    <div className="mt-7 sm:mt-8">
      {workspace.focus ? <TodayPriorities key={workspace.focus.date} focus={workspace.focus} timezone={workspace.timezone} /> : null}
    </div>
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-12">
      <TodaySchedule workspace={workspace} />
      {hasAdditionalWork ? <div className="space-y-7">
        <TodayCommitments commitments={presentation.commitments} timezone={workspace.timezone} priorityReminderCount={presentation.priorityReminderCount} scheduleReminderCount={presentation.scheduleReminderCount} />
        <TodayFocusStack workspace={presentation.remainingWorkspace} />
      </div> : null}
    </div>
    <TodayContinue />
    <div className="mt-8 border-t border-[var(--separator)] pt-7 sm:mt-10 sm:pt-8"><TodaySecondary workspace={workspace} /></div>
  </div>;
}

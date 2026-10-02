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
  return (
    <div className="now-workspace mx-auto w-full max-w-[1080px] px-4 py-[30px] sm:px-6 sm:py-[38px] lg:px-8 lg:py-[46px]">
      <NowHeader workspace={workspace} />

      <div className="today-primary-grid mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-12">
        {workspace.focus ? <TodayPriorities key={workspace.focus.date} focus={workspace.focus} timezone={workspace.timezone} /> : null}
        <TodaySchedule workspace={workspace} />
      </div>

      <TodayContinue />

      <div className="today-reminders-grid mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-12">
        <TodayCommitments commitments={presentation.commitments} timezone={workspace.timezone} priorityReminderCount={presentation.priorityReminderCount} scheduleReminderCount={presentation.scheduleReminderCount} />
        <TodayFocusStack workspace={presentation.remainingWorkspace} />
      </div>

      <div className="mt-8 border-t border-[var(--separator)] pt-6 sm:mt-12 sm:pt-8">
        <TodaySecondary workspace={workspace} />
      </div>
    </div>
  );
}

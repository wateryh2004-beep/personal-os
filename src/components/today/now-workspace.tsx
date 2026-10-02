import { TodayPriorities } from "./today-priorities";
import type { NowWorkspace } from "@/features/today/types";
import { NowHeader } from "./now-header";
import { TodayCommitments } from "./today-commitments";
import { TodayFocusStack } from "./today-focus-stack";
import { TodaySchedule } from "./today-schedule";
import { TodaySecondary } from "./today-secondary";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  return (
    <div className="now-workspace mx-auto w-full max-w-[1080px] px-4 py-[30px] sm:px-6 sm:py-[38px] lg:px-8 lg:py-[46px]">
      <NowHeader workspace={workspace} />

      <div className="mt-8 sm:mt-10">
        {workspace.focus ? <TodayPriorities key={workspace.focus.date} focus={workspace.focus} /> : null}
        <div className="mt-6 sm:mt-8"><TodayCommitments commitments={workspace.commitments} timezone={workspace.timezone} /></div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-12">
        <TodaySchedule workspace={workspace} />
        <TodayFocusStack workspace={workspace} />
      </div>

      <div className="mt-8 border-t border-[var(--separator)] pt-6 sm:mt-12 sm:pt-8">
        <TodaySecondary workspace={workspace} />
      </div>
    </div>
  );
}

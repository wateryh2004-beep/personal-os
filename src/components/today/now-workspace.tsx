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

      <div className="mt-9 sm:mt-11">
        <TodayCommitments commitments={workspace.commitments} />
      </div>

      <div className="mt-11 grid gap-11 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-[60px]">
        <TodaySchedule workspace={workspace} />
        <TodayFocusStack workspace={workspace} />
      </div>

      <div className="mt-[60px] border-t border-[var(--separator)] pt-11 sm:mt-[76px] sm:pt-[52px]">
        <TodaySecondary workspace={workspace} />
      </div>
    </div>
  );
}

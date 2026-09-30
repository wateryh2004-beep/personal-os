import type { NowWorkspace } from "@/features/today/types";
import { NowHeader } from "./now-header";
import { TodayCommitments } from "./today-commitments";
import { TodayFocusStack } from "./today-focus-stack";
import { TodaySchedule } from "./today-schedule";
import { TodaySecondary } from "./today-secondary";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  return (
    <div className="now-workspace mx-auto w-full max-w-[1068px] px-4 py-[28px] sm:px-6 sm:py-[36px] lg:px-8 lg:py-[44px]">
      <NowHeader workspace={workspace} />

      <div className="mt-8 sm:mt-10">
        <TodayCommitments commitments={workspace.commitments} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.32fr)_minmax(296px,.82fr)] lg:gap-[56px]">
        <TodaySchedule workspace={workspace} />
        <TodayFocusStack workspace={workspace} />
      </div>

      <div className="mt-[56px] border-t border-[var(--separator)] pt-10 sm:mt-[72px] sm:pt-[48px]">
        <TodaySecondary workspace={workspace} />
      </div>
    </div>
  );
}

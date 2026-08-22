import type { NowWorkspace } from "@/features/today/types";
import { NowHeader } from "./now-header";
import { TodayCommitments } from "./today-commitments";
import { TodayFocusStack } from "./today-focus-stack";
import { TodaySchedule } from "./today-schedule";
import { TodaySecondary } from "./today-secondary";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <NowHeader workspace={workspace} />

      <div className="mt-10 sm:mt-12">
        <TodayCommitments commitments={workspace.commitments} />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-16">
        <TodaySchedule workspace={workspace} />
        <TodayFocusStack workspace={workspace} />
      </div>

      <div className="mt-16 border-t border-[var(--separator)] pt-12 sm:mt-20 sm:pt-14">
        <TodaySecondary workspace={workspace} />
      </div>
    </div>
  );
}

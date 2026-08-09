import type { NowWorkspace } from "@/features/today/types";
import { NextActionCard } from "./next-action-card";
import { NowAutoRefresh } from "./now-auto-refresh";
import { NowHeader } from "./now-header";
import { TodayFocusStack } from "./today-focus-stack";
import { TodaySchedule } from "./today-schedule";
import { TodaySecondary } from "./today-secondary";

export function NowWorkspaceView({ workspace }: { workspace: NowWorkspace }) {
  return (
    <div className="mx-auto max-w-[var(--content-dashboard-width)] space-y-6 px-4 py-5 sm:px-6 sm:py-6">
      <NowAutoRefresh />
      <NowHeader workspace={workspace} />
      <NextActionCard next={workspace.nextAction} timezone={workspace.timezone} />
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.38fr)_minmax(320px,1fr)]">
        <TodaySchedule workspace={workspace} />
        <TodayFocusStack workspace={workspace} />
      </div>
      <TodaySecondary workspace={workspace} />
    </div>
  );
}

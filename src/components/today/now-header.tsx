import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";
import { NowClock } from "./now-clock";
import { QuickCapture } from "./quick-capture";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  return (
    <header className="pb-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--accent)]">
            {formatTodayDate(new Date(), workspace.timezone)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            现在
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            {workspace.summary.todayEventCount} 项日程 · {workspace.summary.todayTaskCount} 项今日待办
            {workspace.summary.attentionCount
              ? ` · ${workspace.summary.attentionCount} 项关注`
              : ""}
          </p>
        </div>
        <NowClock timezone={workspace.timezone} />
      </div>
      <div className="mt-5">
        <QuickCapture />
      </div>
    </header>
  );
}

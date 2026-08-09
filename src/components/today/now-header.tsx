import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";
import { NowClock } from "./now-clock";
import { QuickCapture } from "./quick-capture";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  return (
    <header className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)] lg:items-end">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">
              {formatTodayDate(new Date(), workspace.timezone)}
            </p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.025em]">
              现在
            </h1>
          </div>
          <div className="text-right">
            <NowClock timezone={workspace.timezone} />
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              {workspace.timezone}
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {workspace.summary.todayEventCount} 项日程 · {workspace.summary.todayTaskCount} 项今日待办
          {workspace.summary.attentionCount
            ? ` · ${workspace.summary.attentionCount} 项关注`
            : ""}
        </p>
      </div>
      <QuickCapture />
    </header>
  );
}

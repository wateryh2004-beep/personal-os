import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";
import { NowClock } from "./now-clock";
import { QuickCapture } from "./quick-capture";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  return (
    <header>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-5 text-[var(--text-tertiary)]">
            {formatTodayDate(new Date(), workspace.timezone)}
          </p>
          <h1 className="mt-1 text-[30px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--text-primary)] sm:text-[34px]">
            现在
          </h1>
          <p className="mt-2 text-[13px] leading-[22px] text-[var(--text-secondary)]">
            {workspace.summary.todayEventCount} 项日程 · {workspace.summary.todayTaskCount} 项今日待办
            {workspace.summary.attentionCount ? ` · ${workspace.summary.attentionCount} 项需关注` : ""}
          </p>
        </div>
        <div className="pt-px text-[var(--text-secondary)]">
          <NowClock timezone={workspace.timezone} />
        </div>
      </div>

      <div className="mt-6 max-w-[680px]">
        <QuickCapture />
      </div>
    </header>
  );
}

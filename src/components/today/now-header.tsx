import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";
import { NowClock } from "./now-clock";
import { QuickCapture } from "./quick-capture";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  return (
    <header>
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium tracking-[-0.008em] text-[var(--text-tertiary)]">
            {formatTodayDate(new Date(), workspace.timezone)}
          </p>
          <h1 className="mt-[7px] text-[31px] font-semibold leading-none tracking-[-0.035em] text-[var(--text-primary)] sm:text-[35px]">
            现在
          </h1>
          <p className="mt-2.5 text-[12.5px] leading-5 text-[var(--text-secondary)]">
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

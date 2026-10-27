"use client";

import { DayCapacity } from "@/components/planning/day-capacity";
import { getDateKeyInTimeZone } from "@/features/today/utils";
import { NowWorkspaceView } from "@/components/today/now-workspace";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { WorkspaceReadError } from "@/components/shared/workspace-read-error";
import { WorkspaceSyncStatus } from "@/components/shared/workspace-sync-status";

export function TodayShell() {
  return <div className="today-desk-container"><div aria-busy="true" aria-label="正在载入今天" className="today-calm now-workspace" data-testid="today-loading">
    <div className="today-desk-main" aria-hidden="true">
      <div className="today-heading-row"><header className="today-header">
        <div className="today-calendar-mark"><div className="today-calendar-day"><span className="ui-skeleton-shimmer block h-[1em] w-[1.8ch] rounded-md" /></div><div className="today-calendar-caption"><span className="ui-skeleton-shimmer block h-[1.45em] w-[3em] rounded" /><span className="ui-skeleton-shimmer block h-[1.45em] w-[3em] rounded" /></div></div>
        <div className="today-header-copy"><div className="today-date"><span className="ui-skeleton-shimmer block h-[1.6em] w-28 rounded" /></div><div className="today-title"><span className="ui-skeleton-shimmer block h-[1.25em] w-[2em] rounded" /></div></div>
      </header></div>
      <div className="today-focus-lead"><div className="ui-skeleton-shimmer h-3 w-20 rounded" /><div className="ui-skeleton-shimmer mt-4 h-8 w-4/5 rounded" /><div className="ui-skeleton-shimmer mt-3 h-8 w-3/5 rounded" /><div className="ui-skeleton-shimmer mt-6 h-11 w-28 rounded-xl" /></div>
    </div>
    <div className="today-desk-agenda" aria-hidden="true"><div className="today-section"><div className="today-section-heading"><div className="ui-skeleton-shimmer h-4 w-24 rounded" /></div><ul className="today-ledger-list">{[0,1,2].map(row => <li key={row} className="today-ledger-row"><span className="ui-skeleton-shimmer mt-1 h-3 rounded" /><div className="min-w-0 py-1"><div className="ui-skeleton-shimmer h-4 w-4/5 rounded" /><div className="ui-skeleton-shimmer mt-3 h-3 w-2/3 rounded" /></div><span className="ui-skeleton-shimmer size-5 rounded-full" /></li>)}</ul></div></div>
    <div className="today-desk-context" aria-hidden="true"><div className="today-section"><div className="today-section-heading"><div className="ui-skeleton-shimmer h-4 w-20 rounded" /></div>{[0,1].map(row => <div key={row} className="today-future-row"><span className="ui-skeleton-shimmer mt-3 h-3 rounded" /><span className="ui-skeleton-shimmer my-3 h-4 w-4/5 rounded" /></div>)}</div><div className="today-background"><span className="ui-skeleton-shimmer my-4 block h-4 w-28 rounded" /></div></div>
  </div></div>;
}

export function TodayWorkspaceLoader() {
  const snapshot = useWorkspaceResource(todayWorkspaceResource, "today");

  const data = snapshot.data;
  if (!data && snapshot.error) return <WorkspaceReadError resource={todayWorkspaceResource} />;
  return data ? <>
    <WorkspaceSyncStatus error={snapshot.error} resource={todayWorkspaceResource} />
    <NowWorkspaceView workspace={data} />
    <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-6"><DayCapacity date={getDateKeyInTimeZone(new Date(),data.timezone??"Asia/Shanghai")!} /></div>
  </> : <TodayShell />;
}

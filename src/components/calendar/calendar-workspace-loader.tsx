"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { calendarWorkspaceResource, type CalendarWorkspaceData } from "@/features/calendar/workspace-resource";
import { perfMark, perfMeasure } from "@/lib/perf";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function CalendarShell() {
  return (
    <section aria-busy="true" className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] bg-[var(--surface-canvas)]">
      <div className="flex w-full flex-col">
        <div className="flex min-h-[52px] items-center justify-between border-b border-[var(--separator)] px-4">
          <div className="flex items-center gap-2">
            <div className="ui-skeleton-shimmer size-7 rounded-full" />
            <div className="ui-skeleton-shimmer h-4 w-44 rounded-full" />
          </div>
          <div className="flex gap-2">
            <div className="ui-skeleton-shimmer h-5 w-12 rounded-full" />
            <div className="ui-skeleton-shimmer h-8 w-16 rounded-[8px]" />
          </div>
        </div>
        <div className="flex h-9 items-center gap-3 border-b border-[var(--separator)] px-4">
          <div className="ui-skeleton-shimmer h-3 w-14 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-16 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-12 rounded-full" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[52px_repeat(7,minmax(0,1fr))] opacity-70">
          <div className="border-r border-[var(--separator)]" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="relative border-r border-[color-mix(in_srgb,var(--separator)_62%,transparent)] last:border-r-0">
              <div className="ui-skeleton-shimmer mx-3 mt-5 h-2.5 w-12 rounded-full" />
              <div className="ui-skeleton-shimmer mx-3 mt-8 h-11 rounded-[6px] opacity-70" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalendarMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-7">
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">日历</h1>
      <p className="mt-5 border-t border-[var(--separator)] pt-5 text-[13px] leading-6 text-[var(--text-secondary)]">{children}</p>
    </section>
  );
}

export function CalendarWorkspaceLoader({ initialWorkspace, initialCreateOpen = false, initialEventId }: { initialWorkspace: CalendarWorkspaceData; initialCreateOpen?: boolean; initialEventId?: string }) {
  const snapshot = useSyncExternalStore(calendarWorkspaceResource.subscribe, calendarWorkspaceResource.get, calendarWorkspaceResource.get);
  useWorkspaceResourceLifecycle(calendarWorkspaceResource);
  useEffect(() => {
    const hadCachedData = calendarWorkspaceResource.get().data !== undefined;
    calendarWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "calendar", cached: hadCachedData, source: "rsc" });
    void calendarWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "calendar" })).catch(() => {});
  }, [initialWorkspace]);
  const data = snapshot.data ?? initialWorkspace;
  if (!data) return <CalendarShell />;
  if (data.unavailable) return <CalendarMessage>日历数据库尚未连接。请先应用 Calendar migration。</CalendarMessage>;
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  return <CalendarWorkspace events={[]} categories={data.categories} timezone={data.timezone} syncStatus={data.sync} scopeReady={(data.connection.oauth_scope_version ?? 1) >= 2} initialCreateOpen={initialCreateOpen} initialEventId={initialEventId} />;
}

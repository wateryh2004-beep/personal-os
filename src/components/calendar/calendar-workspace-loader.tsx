"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { calendarWorkspaceResource } from "@/features/calendar/workspace-resource";
import { perfMark, perfMeasure } from "@/lib/perf";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function CalendarShell() { return <section aria-busy="true" className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] bg-white"><div className="w-full"><div className="h-14 border-b px-3 py-4"><div className="h-5 w-48 rounded bg-[var(--surface-hover)]" /></div><div className="h-full bg-[var(--surface-hover)]/30" /></div></section>; }

export function CalendarWorkspaceLoader({ initialCreateOpen = false, initialEventId }: { initialCreateOpen?: boolean; initialEventId?: string }) {
  const snapshot = useSyncExternalStore(calendarWorkspaceResource.subscribe, calendarWorkspaceResource.get, calendarWorkspaceResource.get);
  useWorkspaceResourceLifecycle(calendarWorkspaceResource);
  useEffect(() => { perfMark("workspace-visible", { workspace: "calendar", cached: Boolean(snapshot.data) }); void calendarWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "calendar" })).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const data = snapshot.data;
  if (!data) return <CalendarShell />;
  if (data.unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  return <CalendarWorkspace events={[]} categories={data.categories} timezone={data.timezone} scopeReady={(data.connection.oauth_scope_version ?? 1) >= 2} initialCreateOpen={initialCreateOpen} initialEventId={initialEventId} />;
}

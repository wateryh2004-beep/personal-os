"use client";

import { createWorkspaceResource } from "@/lib/workspace-resource-cache";
import type { CalendarCategory } from "./categories/types";
import type { CalendarEventRecord } from "./types";

export type CalendarWorkspaceData = {
  connection: { id: string; last_error_code: string | null; oauth_scope_version: number | null } | null;
  categories: CalendarCategory[];
  timezone: string;
  unavailable: boolean;
  sync: { state: "fresh" | "syncing" | "stale" | "failed" | "unavailable"; lastSyncAt: string | null; nextHourlyAt: string | null; nextFullAt: string | null; subscriptionExpiresAt: string | null; webhookLastReceivedAt: string | null; errorCode: string | null; subscriptionExpiring: boolean } | null;
};

async function readCalendarWorkspace(): Promise<CalendarWorkspaceData> {
  const response = await fetch("/api/calendar/workspace", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as CalendarWorkspaceData & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "calendar_workspace_unavailable");
  return body;
}

export const calendarWorkspaceResource = createWorkspaceResource("calendar:workspace-data", readCalendarWorkspace, 5 * 60_000);

type CalendarRangeData = { events: CalendarEventRecord[]; truncated: boolean };
const rangeResources = new Map<string, ReturnType<typeof createWorkspaceResource<CalendarRangeData>>>();

/** Range resources outlive a Calendar component mount, but remain tab-memory only. */
export function calendarRangeResource(key: string, start: string, end: string) {
  const current = rangeResources.get(key);
  if (current) return current;
  const resource = createWorkspaceResource(key, async () => {
    const response = await fetch(`/api/calendar/events?${new URLSearchParams({ start, end })}`, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json() as Partial<CalendarRangeData> & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "calendar_range_failed");
    return { events: body.events ?? [], truncated: Boolean(body.truncated) };
  }, 2 * 60_000);
  rangeResources.set(key, resource);
  return resource;
}

export function invalidateCalendarRangeResources() {
  rangeResources.forEach((resource) => resource.invalidate());
}

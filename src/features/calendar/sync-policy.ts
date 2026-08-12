export type CalendarSyncTrigger = "manual" | "scheduled";

/**
 * Delta sync is ideal for routine background reconciliation. A manual sync
 * is an explicit request to rebuild the local Outlook mirror and therefore
 * must include unchanged historical events as well.
 */
export function calendarSyncOptions(trigger: CalendarSyncTrigger) {
  return { forceFull: trigger === "manual" };
}

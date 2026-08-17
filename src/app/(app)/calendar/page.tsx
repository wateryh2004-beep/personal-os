import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ create?: string; event?: string }> }) {
  const [{ connection, events, categories, timezone, unavailable }, params] = await Promise.all([getCalendarWorkspace(), searchParams]);
  if (unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  if (!connection || connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(connection)} />;
  return <CalendarWorkspace events={events} categories={categories} timezone={timezone} scopeReady={(connection.oauth_scope_version ?? 1) >= 2} initialCreateOpen={params.create === "1"} initialEventId={params.event} />;
}

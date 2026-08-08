import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export default async function CalendarPage() {
  const { connection, events, timezone, unavailable } = await getCalendarWorkspace();
  if (unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  if (!connection || connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(connection)} />;
  return <div className="[&>section]:rounded-lg [&>section]:border-[#deddd8] [&>section]:shadow-[0_1px_2px_rgb(24_24_27/0.04)] [&>section>div:first-child]:bg-[#fbfbfa] [&>section>div:first-child]:px-5"><CalendarWorkspace events={events} timezone={timezone} /></div>;
}

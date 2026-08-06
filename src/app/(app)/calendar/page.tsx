import { RefreshCw } from "lucide-react";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { queueCalendarSync } from "@/features/calendar/actions";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export default async function CalendarPage() {
  const { connection, events, unavailable } = await getCalendarWorkspace();
  if (unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  return <section className="max-w-none"><header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"><div><p className="text-xs font-medium tracking-wide text-zinc-500">PLANNING</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Calendar</h1><p className="mt-1 text-sm text-zinc-500">Outlook 是权威来源；日历数据由云端同步缓存提供。</p></div>{connection ? <form action={queueCalendarSync}><button className="inline-flex items-center gap-1.5 border px-3 py-2 text-sm text-[#365F78]"><RefreshCw size={16} />刷新</button></form> : null}</header>{!connection || connection.last_error_code === "calendar_not_connected" ? <MicrosoftDeviceConnect reconnect={Boolean(connection)} /> : <><CalendarWorkspace events={events} /><p className="mt-3 text-xs text-zinc-500">显示当前前后数月的已同步 Outlook 日程。刷新后可获得最新数据。</p></>}</section>;
}

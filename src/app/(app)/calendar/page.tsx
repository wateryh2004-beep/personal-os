import { RefreshCw } from "lucide-react";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { syncAndBackupMicrosoftAction } from "@/features/calendar/actions";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export default async function CalendarPage() {
  const { connection, events, unavailable } = await getCalendarWorkspace();
  if (unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  return <section className="max-w-none"><header className="flex justify-end border-b pb-4">{connection ? <form action={syncAndBackupMicrosoftAction}><button className="inline-flex items-center gap-1.5 border px-3 py-2 text-sm text-[#365F78]"><RefreshCw size={16} />立即对齐并备份</button></form> : null}</header>{!connection || connection.last_error_code === "calendar_not_connected" ? <MicrosoftDeviceConnect reconnect={Boolean(connection)} /> : <CalendarWorkspace events={events} />}</section>;
}

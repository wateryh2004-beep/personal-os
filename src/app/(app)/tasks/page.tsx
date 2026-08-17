import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ create?: string; task?: string }> }) {
  const [{ connection, lists, tasks, unavailable, schemaMissing }, params] = await Promise.all([getMicrosoftTodoWorkspace(), searchParams]);
  if (unavailable) return <section><h1 className="text-2xl font-semibold">Tasks</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">无法读取 Microsoft To Do 缓存。请检查数据库连接。</p></section>;
  if (schemaMissing) return <section><p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">Microsoft To Do 数据库尚未升级。部署后请应用本次 migration，才能同步任务。</p></section>;
  if (!connection || connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(connection)} />;
  return <TaskWorkspace lists={lists} tasks={tasks} initialCreateOpen={params.create === "1"} initialTaskId={params.task} />;
}

import type { requireOwner } from "@/lib/auth/require-owner";
import { getDateKeyInTimeZone } from "@/lib/date-keys";
import type { NowTask, TodayFocus } from "./types";

type Owner = Awaited<ReturnType<typeof requireOwner>>;
const fields = "id,title,due_at,importance,status";

export async function getTodayFocus(owner: Owner, now: Date, timezone: string): Promise<TodayFocus> {
  const date = getDateKeyInTimeZone(now, timezone)!;
  try {
  const [priorities, candidates] = await Promise.all([
    owner.supabase.from("today_task_priorities").select("task_id,position")
      .eq("user_id", owner.userId).eq("focus_date", date).is("archived_at", null).order("position"),
    owner.supabase.from("microsoft_todo_tasks").select(fields).eq("user_id", owner.userId)
      .is("archived_at", null).neq("status", "completed").order("updated_at", { ascending: false }).limit(200),
  ]);
  const selectedIds = (priorities.data ?? []).map((row) => row.task_id as string);
  const tasks = (candidates.data ?? []) as NowTask[];
  const missing = selectedIds.filter((id) => !tasks.some((task) => task.id === id));
  const selected = missing.length ? await owner.supabase.from("microsoft_todo_tasks").select(fields)
    .eq("user_id", owner.userId).is("archived_at", null).in("id", missing) : { data: [], error: null };
  const all = [...tasks, ...((selected.data ?? []) as NowTask[])];
  return {
    date,
    selectedIds,
    selectedTasks: selectedIds.flatMap((id) => all.find((task) => task.id === id) ?? []),
    candidates: tasks,
    available: !priorities.error && !candidates.error && !selected.error,
  };
  } catch {
    return { date, selectedIds: [], selectedTasks: [], candidates: [], available: false };
  }
}

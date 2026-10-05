import type { requireOwner } from "@/lib/auth/require-owner";
import { addDateKeyDays, getDateKeyInTimeZone } from "@/lib/date-keys";
import type { NowTask, TodayFocus } from "./types";

type Owner = Awaited<ReturnType<typeof requireOwner>>;
const fields = "id,title,due_at,importance,status";

export async function getTodayFocusCandidates(owner: Owner) {
  try {
    return await owner.supabase.from("microsoft_todo_tasks").select(fields).eq("user_id", owner.userId)
      .is("archived_at", null).neq("status", "completed").order("updated_at", { ascending: false }).limit(200);
  } catch {
    // This read can start before the workspace timezone is known. Settle early
    // failures here so preloading cannot leave an unhandled rejection.
    return null;
  }
}

/** Every current timezone falls within UTC's adjacent dates. Start this bounded
 * owner-scoped read with the workspace RPC, then select its exact local date.
 * Settle transport failures now so a failed source read cannot orphan rejection.
 */
export async function getTodayFocusPriorities(owner: Owner, now: Date) {
  const utcDate = now.toISOString().slice(0, 10);
  try {
    return await owner.supabase.from("today_task_priorities").select("task_id,position,focus_date")
      .eq("user_id", owner.userId).gte("focus_date", addDateKeyDays(utcDate, -1))
      .lte("focus_date", addDateKeyDays(utcDate, 1)).is("archived_at", null).order("position");
  } catch {
    return null;
  }
}

export async function getTodayFocus(
  owner: Owner,
  now: Date,
  timezone: string,
  candidatesRead?: ReturnType<typeof getTodayFocusCandidates>,
  prioritiesRead?: ReturnType<typeof getTodayFocusPriorities>,
): Promise<TodayFocus> {
  const date = getDateKeyInTimeZone(now, timezone)!;
  const unavailable: TodayFocus = { date, selectedIds: [], selectedTasks: [], candidates: [], available: false };
  try {
    const [priorities, candidates] = await Promise.all([
      prioritiesRead ? prioritiesRead.then((priorities) => {
        if (!priorities) throw new Error("today_focus_priorities_unavailable");
        return { ...priorities, data: priorities.data?.filter((row) => row.focus_date === date) ?? null };
      }) : owner.supabase.from("today_task_priorities").select("task_id,position")
        .eq("user_id", owner.userId).eq("focus_date", date).is("archived_at", null).order("position"),
      (candidatesRead ?? getTodayFocusCandidates(owner)).then((candidates) => {
        // Preserve the existing fail-fast focus result on transport failure,
        // even if the priorities read is still pending.
        if (!candidates) throw new Error("today_focus_candidates_unavailable");
        return candidates;
      }),
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
    return unavailable;
  }
}

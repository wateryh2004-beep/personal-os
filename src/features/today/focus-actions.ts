"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { focusSaveError, todayFocusSchema } from "./focus";

export async function saveTodayFocusAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = todayFocusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "请选择最多 3 个不同的任务。" };
  const { supabase } = await requireOwner();
  try {
    const { error } = await supabase.rpc("set_today_task_priorities", {
      p_date: parsed.data.date,
      p_task_ids: parsed.data.taskIds,
      p_previous_ids: parsed.data.previousIds,
    });
    if (error) return { ok: false, message: focusSaveError(error.message) };
    revalidatePath("/today");
    return { ok: true, message: "今日重点已保存，可在其他设备继续查看。" };
  } catch {
    return { ok: false, message: focusSaveError("") };
  }
}

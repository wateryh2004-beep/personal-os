import { z } from "zod";
import type { NowTask } from "./types";

export const todayFocusSchema = z.object({
  date: z.iso.date(),
  taskIds: z.array(z.string().uuid()).max(3),
  previousIds: z.array(z.string().uuid()).max(3),
}).refine((value) => new Set(value.taskIds).size === value.taskIds.length, { message: "不能重复选择任务" });

export function selectFocusCandidates(tasks: NowTask[], query: string, selectedIds: string[]) {
  const search = query.trim().toLocaleLowerCase();
  return tasks.filter((task) => task.status !== "completed" && !selectedIds.includes(task.id)
    && (!search || task.title.toLocaleLowerCase().includes(search)));
}

export function focusSaveError(message: string) {
  if (message.includes("focus_conflict")) return "今日重点已在其他窗口更新。请刷新后重新选择。";
  if (message.includes("focus_date_changed")) return "日期已变化，请刷新后选择新一天的重点。";
  if (message.includes("focus_task_unavailable")) return "有任务已归档或不可用。请刷新后重新选择。";
  return "未能确认今日重点的保存结果。你的选择仍保留，请先载入最新重点核对。";
}

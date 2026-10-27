"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
const taskSchema = z
  .object({
    taskId: z.string().uuid(),
    revision: z.number().int().min(0),
    minutes: z.number().int().min(1).max(10080).nullable(),
    plannedOn: z.string().date().nullable(),
  })
  .strict();
export async function saveTaskPlanning(input: unknown) {
  const value = taskSchema.parse(input);
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_task_planning", {
    p_task_id: value.taskId,
    p_expected_revision: value.revision,
    p_minutes: value.minutes,
    p_planned_on: value.plannedOn,
  });
  if (error || !data)
    throw new Error(
      "计划未能保存，可能已被其他页面修改。输入已保留，请读取最新计划核对。",
    );
  return data;
}
const availabilitySchema = z
  .object({
    date: z.string().date(),
    timezone: z.string().max(100),
    revision: z.number().int().min(0),
    periods: z
      .array(
        z
          .object({
            start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export async function saveAvailability(input: unknown) {
  const value = availabilitySchema.parse(input);
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_planning_availability", {
    p_date: value.date,
    p_timezone: value.timezone,
    p_expected_revision: value.revision,
    p_periods: value.periods,
  });
  if (error || !data)
    throw new Error(
      "可用时段未能保存，请核对时段顺序、重叠和最新版本。输入已保留。",
    );
  return data;
}

export async function readTaskPlanning(taskId: string) {
  const id = z.string().uuid().parse(taskId),
    { supabase, userId } = await requireOwner();
  const task = await supabase
    .from("microsoft_todo_tasks")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (task.error || !task.data)
    throw new Error("任务暂时不可用，当前估时输入保留。");
  const { data, error } = await supabase
    .from("task_planning")
    .select("estimated_minutes,planned_on,revision")
    .eq("task_id", id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("任务计划暂时无法读取，当前输入保留。");
  return {
    minutes: data?.estimated_minutes?.toString() ?? "",
    plannedOn: data?.planned_on ?? "",
    revision: data?.revision ?? 0,
  };
}

export async function readAvailability(date: string, timezone: string) {
  const day = z.string().date().parse(date),
    { supabase, userId } = await requireOwner();
  const { data, error } = await supabase
    .from("planning_availability")
    .select("periods,revision,timezone")
    .eq("user_id", userId)
    .eq("local_date", day)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("可用时段暂时无法读取，当前输入保留。");
  const periods = availabilitySchema.shape.periods.parse(data?.periods ?? []);
  return {
    periods,
    revision: data?.revision ?? 0,
    timezone: data?.timezone ?? timezone,
  };
}

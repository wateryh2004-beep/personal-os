import "server-only";
import { tool } from "ai";
import { z } from "zod";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  updateCalendarEventSchema,
} from "@/features/calendar/schemas";
import { todoProposalSchema } from "@/features/tasks/schemas";
import { inboxProposalSchema } from "@/features/inbox/schemas";
import type { AssistantPolicy } from "./policy";
import type { createClient } from "@/lib/supabase/server";
type Supabase = Awaited<ReturnType<typeof createClient>>;
export function buildAssistantTools({
  supabase,
  policy,
  timezone = "Asia/Shanghai",
}: {
  supabase: Supabase;
  policy: AssistantPolicy;
  timezone?: string;
}) {
  const groups = new Set(policy.tools);
  return {
    ...(groups.has("calendar_read")
      ? {
          searchCalendar: tool({
            description:
              "查询当前用户日历缓存中的安排，用于准确回答已有日程、冲突或空闲时间。",
            inputSchema: z
              .object({
                startsAt: z.string().datetime({ offset: true }),
                endsAt: z.string().datetime({ offset: true }),
              })
              .refine(
                (v) => new Date(v.endsAt) > new Date(v.startsAt),
                "结束时间必须晚于开始时间",
              ),
            execute: async ({ startsAt, endsAt }) => {
              const { data, error } = await supabase
                .from("calendar_events")
                .select(
                  "provider_event_id,subject,starts_at,ends_at,is_all_day,location_name",
                )
                .lt("starts_at", endsAt)
                .gt("ends_at", startsAt)
                .is("archived_at", null)
                .order("starts_at")
                .limit(100);
              return error
                ? { events: [], unavailable: true }
                : { events: data ?? [], unavailable: false };
            },
          }),
        }
      : {}),
    ...(groups.has("calendar_proposal")
      ? {
          proposeCalendarEvent: tool({
            description: `生成待用户点击按钮确认的日程提案。时间必须表达为用户时区 ${timezone} 的带 offset ISO 值；不得把用户说的本地钟点直接标为 Z/UTC。`,
            inputSchema: createCalendarEventSchema,
            execute: async (proposal) => ({ proposal }),
          }),
          proposeCalendarDelete: tool({
            description:
              "只为 searchCalendar 返回的唯一明确日程生成删除提案；必须原样传递 is_all_day 到 isAllDay，以便全天日程正确显示。不会删除数据。",
            inputSchema: deleteCalendarEventSchema,
            execute: async (proposal) => ({ proposal }),
          }),
          proposeCalendarUpdate: tool({
            description: `修改 searchCalendar 唯一匹配的已有日程。改期必须使用此工具，不要删除后重建。新时间必须是 ${timezone} 的带 offset ISO 值。`,
            inputSchema: updateCalendarEventSchema,
            execute: async (proposal) => ({ proposal }),
          }),
        }
      : {}),
    ...(groups.has("todo_read")
      ? {
          listTodoLists: tool({
            description:
              "读取已同步的 Microsoft To Do 清单；创建任务前必须调用。",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("microsoft_todo_lists")
                .select("id,display_name,is_default")
                .is("archived_at", null)
                .order("display_name")
                .limit(50);
              return error
                ? { lists: [], unavailable: true }
                : { lists: data ?? [], unavailable: false };
            },
          }),
          searchTodoTasks: tool({
            description: "查询当前用户已同步的 Microsoft To Do 任务。",
            inputSchema: z.object({
              status: z
                .enum([
                  "notStarted",
                  "inProgress",
                  "waitingOnOthers",
                  "deferred",
                  "completed",
                  "all",
                ])
                .default("all"),
              limit: z.number().int().min(1).max(50).default(20),
            }),
            execute: async ({ status, limit }) => {
              let query = supabase
                .from("microsoft_todo_tasks")
                .select(
                  "title,body_text,status,due_at,importance,completed_at,microsoft_todo_lists(display_name)",
                )
                .is("archived_at", null)
                .order("due_at", { ascending: true, nullsFirst: false })
                .limit(limit);
              if (status !== "all") query = query.eq("status", status);
              const { data, error } = await query;
              return error
                ? { tasks: [], unavailable: true }
                : { tasks: data ?? [], unavailable: false };
            },
          }),
        }
      : {}),
    ...(groups.has("todo_proposal")
      ? {
          proposeTodoTask: tool({
            description:
              "生成一个待用户确认的 Microsoft To Do 任务提案，不会创建任务。",
            inputSchema: todoProposalSchema,
            execute: async (proposal) => {
              const { data } = await supabase
                .from("microsoft_todo_lists")
                .select("id")
                .eq("id", proposal.todoListId)
                .is("archived_at", null)
                .maybeSingle();
              return data
                ? { proposal }
                : { proposal: null, error: "目标清单不存在或尚未同步。" };
            },
          }),
        }
      : {}),
    ...(groups.has("inbox_proposal")
      ? {
          proposeInboxDestination: tool({
            description:
              "为一条 Inbox 记录生成明确去向提案，不会直接写入数据。",
            inputSchema: inboxProposalSchema,
            execute: async (proposal) => ({ proposal }),
          }),
        }
      : {}),
  };
}

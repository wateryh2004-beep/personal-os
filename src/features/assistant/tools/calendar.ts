import "server-only";
import { tool } from "ai";
import { z } from "zod";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  updateCalendarEventSchema,
} from "@/features/calendar/schemas";
import { findFreeTimeSlots } from "../free-time";
import { recordAgentStep, storeAgentAction } from "../persistence";
import type { AssistantToolModule } from "./types";

const rangeSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "结束时间必须晚于开始时间",
  });

export const calendarTools: AssistantToolModule = {
  definitions: [
    { name: "searchCalendar", group: "calendar_read", risk: "read", description: "查询日历" },
    { name: "findFreeTime", group: "calendar_read", risk: "read", description: "确定性计算空闲时间" },
    { name: "proposeCalendarEvent", group: "calendar_proposal", risk: "proposal", description: "创建日程提案" },
    { name: "proposeCalendarUpdate", group: "calendar_proposal", risk: "proposal", description: "修改日程提案" },
    { name: "proposeCalendarDelete", group: "calendar_proposal", risk: "proposal", description: "删除日程提案" },
  ],
  build: (context) => ({
    searchCalendar: tool({
      description: "查询当前用户日历缓存。返回可追溯的日程，不计算空闲时间。",
      inputSchema: rangeSchema,
      execute: async ({ startsAt, endsAt }) => {
        const { data, error } = await context.supabase
          .from("calendar_events")
          .select("id,provider_event_id,subject,starts_at,ends_at,is_all_day,location_name")
          .lt("starts_at", endsAt)
          .gt("ends_at", startsAt)
          .is("archived_at", null)
          .order("starts_at")
          .limit(100);
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "searchCalendar",
          title: "已检查日历",
          summary: error ? "日历暂时不可用" : `找到 ${(data ?? []).length} 条日程`,
          input: { startsAt, endsAt },
          output: { count: (data ?? []).length, unavailable: Boolean(error) },
          status: error ? "failed" : "succeeded",
        });
        return { events: data ?? [], unavailable: Boolean(error), timezone: context.timezone };
      },
    }),
    findFreeTime: tool({
      description: "按用户时区、忙碌日程和工作时段确定性计算空闲时间。不要自行用模型心算。",
      inputSchema: rangeSchema.extend({
        durationMinutes: z.number().int().min(15).max(720),
        preferredTimeRanges: z.array(rangeSchema).max(14).optional(),
        excludeAllDay: z.boolean().default(false),
        workingHours: z
          .object({
            startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          })
          .optional(),
      }),
      execute: async (value) => {
        const { data, error } = await context.supabase
          .from("calendar_events")
          .select("starts_at,ends_at,is_all_day")
          .lt("starts_at", value.endsAt)
          .gt("ends_at", value.startsAt)
          .is("archived_at", null)
          .order("starts_at")
          .limit(500);
        const slots = error
          ? []
          : findFreeTimeSlots({
              ...value,
              timezone: context.timezone,
              busy: (data ?? []).map((event) => ({
                startsAt: event.starts_at,
                endsAt: event.ends_at,
                isAllDay: event.is_all_day,
              })),
            });
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "findFreeTime",
          title: "已计算空闲时间",
          summary: error ? "日历暂时不可用" : `找到 ${slots.length} 个候选时段`,
          input: {
            startsAt: value.startsAt,
            endsAt: value.endsAt,
            durationMinutes: value.durationMinutes,
          },
          output: { count: slots.length, unavailable: Boolean(error) },
          status: error ? "failed" : "succeeded",
        });
        return { slots, timezone: context.timezone, unavailable: Boolean(error) };
      },
    }),
    proposeCalendarEvent: tool({
      description: `冻结一个待用户确认的日程创建提案。时间必须是与 ${context.timezone} 相符的带 offset ISO 值。不会直接写 Outlook。`,
      inputSchema: createCalendarEventSchema,
      execute: async (proposal) => ({
        proposal,
        actionId: await storeAgentAction({
          ...context,
          domain: "calendar",
          actionType: "calendar.create",
          payload: proposal,
          preview: proposal,
          riskLevel: "medium",
        }),
      }),
    }),
    proposeCalendarUpdate: tool({
      description: `冻结已有日程修改提案。改期必须使用 update；时间按 ${context.timezone} 解释。`,
      inputSchema: updateCalendarEventSchema,
      execute: async (proposal) => ({
        proposal,
        actionId: await storeAgentAction({
          ...context,
          domain: "calendar",
          actionType: "calendar.update",
          payload: proposal,
          preview: proposal,
          riskLevel: "medium",
        }),
      }),
    }),
    proposeCalendarDelete: tool({
      description: "只对 searchCalendar 唯一明确匹配的日程冻结删除提案，不会直接删除。",
      inputSchema: deleteCalendarEventSchema,
      execute: async (proposal) => ({
        proposal,
        actionId: await storeAgentAction({
          ...context,
          domain: "calendar",
          actionType: "calendar.delete",
          payload: proposal,
          preview: proposal,
          riskLevel: "high",
        }),
      }),
    }),
  }),
};

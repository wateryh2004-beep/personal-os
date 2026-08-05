import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

export const createCalendarEventSchema = z.object({
  subject: z.string().trim().min(1, "请输入日程标题。").max(500),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  locationName: z.string().trim().max(500).optional().transform((value) => value || null),
  isAllDay: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
  }
});

export const confirmOperationSchema = z.object({ operationId: z.string().uuid() });
export const cancelOperationSchema = z.object({ operationId: z.string().uuid() });

export const companionOperationSchema = z.object({
  id: z.string().uuid(),
  operation_type: z.enum(["sync", "create", "update", "delete"]),
  provider_event_id: z.string().max(1024).nullable(),
  calendar_id: z.string().max(1024).nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export const companionResultSchema = z.object({
  operationId: z.string().uuid(),
  outcome: z.enum(["succeeded", "failed"]),
  errorCode: z.string().trim().max(120).optional(),
  event: z.object({
    providerEventId: z.string().min(1).max(1024),
    calendarId: z.string().max(1024).nullable().optional(),
    subject: z.string().max(500),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    isAllDay: z.boolean().default(false),
    locationName: z.string().max(500).nullable().optional(),
    providerChangeKey: z.string().max(1024).nullable().optional(),
    deleted: z.boolean().optional(),
  }).optional(),
});

export const companionSyncSchema = z.object({
  events: z.array(z.object({
    providerEventId: z.string().min(1).max(1024),
    calendarId: z.string().max(1024).nullable().optional(),
    subject: z.string().max(500),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    isAllDay: z.boolean().default(false),
    locationName: z.string().max(500).nullable().optional(),
    providerChangeKey: z.string().max(1024).nullable().optional(),
    deleted: z.boolean().optional(),
  })).max(500),
});

export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;

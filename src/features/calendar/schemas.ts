import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

export const createCalendarEventSchema = z.object({
  subject: z.string().trim().min(1, "请输入日程标题。").max(500),
  description: z.string().trim().max(10_000).optional().transform((value) => value || null),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  locationName: z.string().trim().max(500).optional().transform((value) => value || null),
  isAllDay: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
  }
});

export const deleteCalendarEventSchema = z.object({
  providerEventId: z.string().trim().min(1).max(1024),
  subject: z.string().trim().min(1).max(500),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  isAllDay: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
  }
});

export const updateCalendarEventSchema = createCalendarEventSchema.extend({
  providerEventId: z.string().trim().min(1).max(1024),
  originalSubject: z.string().trim().min(1).max(500),
  originalStartsAt: isoDateTime,
  originalEndsAt: isoDateTime,
});

export const confirmOperationSchema = z.object({ operationId: z.string().uuid() });
export const cancelOperationSchema = z.object({ operationId: z.string().uuid() });

export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
export type DeleteCalendarEvent = z.infer<typeof deleteCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;

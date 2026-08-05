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

export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;

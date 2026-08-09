import { z } from "zod";
import { contextCategoryKeys, primaryCategoryKeys } from "./classification/taxonomy";

const isoDateTime = z.string().datetime({ offset: true });

const calendarEventFields = z.object({
  subject: z.string().trim().min(1, "请输入日程标题。").max(500),
  description: z.string().trim().max(10_000).optional().transform((value) => value || null),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  locationName: z.string().trim().max(500).optional().transform((value) => value || null),
  isAllDay: z.boolean().default(false),
  importance: z.enum(["low", "normal", "high"]).default("normal"),
  showAs: z.enum(["free", "tentative", "busy", "oof", "workingElsewhere"]).default("busy"),
});

const editableCalendarEventFields = z.object({
  subject: z.string().trim().min(1, "请输入日程标题。").max(500),
  description: z.string().trim().max(10_000).optional().transform((value) => value === undefined ? undefined : value || null),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  locationName: z.string().trim().max(500).optional().transform((value) => value === undefined ? undefined : value || null),
  isAllDay: z.boolean().optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  showAs: z.enum(["free", "tentative", "busy", "oof", "workingElsewhere"]).optional(),
});

const classificationFields = z.object({
  classificationMode: z.enum(["auto", "manual", "none"]).default("auto"),
  primaryCategoryKey: z.enum(primaryCategoryKeys).nullable().default(null),
  contextCategoryKeys: z.array(z.enum(contextCategoryKeys)).max(4).default([]),
  classificationConfidence: z.number().min(0).max(1).nullable().default(null),
  classificationReason: z.string().trim().max(500).nullable().default(null),
});

export const createCalendarEventSchema = calendarEventFields.extend(classificationFields.shape).superRefine((value, ctx) => {
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

export const updateCalendarEventSchema = editableCalendarEventFields.extend({
  classificationMode: z.enum(["auto", "manual", "none"]).optional(),
  primaryCategoryKey: z.enum(primaryCategoryKeys).nullable().optional(),
  contextCategoryKeys: z.array(z.enum(contextCategoryKeys)).max(4).optional(),
  classificationConfidence: z.number().min(0).max(1).nullable().optional(),
  classificationReason: z.string().trim().max(500).nullable().optional(),
  preserveCategories: z.boolean().default(true),
  providerEventId: z.string().trim().min(1).max(1024),
  originalSubject: z.string().trim().min(1).max(500),
  originalStartsAt: isoDateTime,
  originalEndsAt: isoDateTime,
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
});

export const confirmOperationSchema = z.object({ operationId: z.string().uuid() });
export const cancelOperationSchema = z.object({ operationId: z.string().uuid() });

export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
export type DeleteCalendarEvent = z.infer<typeof deleteCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;

import { z } from "zod";
import { operationTimezoneSchema } from "@/features/workbench/operation-read-contracts";
export const planningDaySchema = z.object({
  date: z.string().date(),
  timezone: operationTimezoneSchema.shape.timezone,
  availability: z
    .object({
      revision: z.number(),
      timezone: z.string(),
      periods: z.array(z.object({ start: z.string(), end: z.string() })),
    })
    .passthrough()
    .nullable(),
  plans: z.array(
    z
      .object({
        task_id: z.string().uuid(),
        estimated_minutes: z.number().nullable(),
        planned_on: z.string().nullable(),
        revision: z.number(),
      })
      .passthrough(),
  ),
  tasks: z.array(
    z
      .object({ id: z.string().uuid(), title: z.string(), status: z.string() })
      .passthrough(),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      subject: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      show_as: z.string().nullable(),
    }),
  ),
  calendarComplete: z.boolean(),
  truncated: z.boolean(),
  lastSyncAt: z.string().nullable(),
});
export type PlanningDay = z.infer<typeof planningDaySchema>;

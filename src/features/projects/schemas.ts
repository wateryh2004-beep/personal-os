import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(8_000).optional().transform((value) => value || null),
  due_date: z.string().trim().optional().transform((value) => value || null).pipe(z.string().date().nullable()),
});

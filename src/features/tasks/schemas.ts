import { z } from "zod";

export const todoProposalSchema = z.object({
  todoListId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().max(10_000).nullable(),
  importance: z.enum(["low", "normal", "high"]),
  dueAt: z.string().datetime({ offset: true }).nullable(),
});

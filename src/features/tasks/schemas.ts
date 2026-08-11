import { z } from "zod";
import { todoImportances } from "./types";

export const todoProposalSchema = z.object({
  todoListId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().max(10_000).nullable(),
  importance: z.enum(["low", "normal", "high"]),
  dueAt: z.string().datetime({ offset: true }).nullable(),
});

export const todoUpdatePatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  bodyText: z.string().max(10_000).nullable().optional(),
  importance: z.enum(todoImportances).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((patch) => Object.values(patch).some((value) => value !== undefined), { message: "至少修改一个字段" });

import { z } from "zod";
export const memorySchema = z
  .object({
    memoryType: z.enum(["profile", "working"]),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(10000),
    aiVisibility: z.enum(["normal", "sensitive", "never"]).default("normal"),
    validUntil: z.string().min(1).nullable().optional(),
    reviewAt: z.string().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.memoryType !== "working" ||
      Boolean(value.validUntil || value.reviewAt),
    "Working Memory 必须设置有效期或复核时间。",
  );
export const decisionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  decisionText: z.string().trim().min(1).max(5000),
  rationaleMarkdown: z.string().max(20000).default(""),
  contextMarkdown: z.string().max(20000).default(""),
  importance: z.enum(["low", "normal", "high"]).default("normal"),
  aiVisibility: z.enum(["normal", "sensitive", "never"]).default("normal"),
  decidedAt: z.string().datetime().optional(),
  reviewAt: z.string().datetime().nullable().optional(),
});
export const replaceMemorySchema = memorySchema.extend({ memoryId: z.string().uuid() });
export const reverseDecisionSchema = z.object({ decisionId: z.string().uuid(), title: z.string().trim().min(1).max(200), decisionText: z.string().trim().min(1).max(5000), rationaleMarkdown: z.string().max(20000).default(""), reviewAt: z.string().min(1).nullable().optional() });

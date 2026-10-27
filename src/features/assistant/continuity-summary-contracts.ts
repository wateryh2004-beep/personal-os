import { z } from "zod";
import { aiResumeTargetSchema } from "./client-chat-contracts";

export const continuitySummaryDomains = ["agent-runs", "agent-actions", "ocr", "uploads", "single-uploads", "briefing", "inbox", "review-proposals"] as const;
export type ContinuitySummaryDomain = (typeof continuitySummaryDomains)[number];
const entry = z.object({
  id: z.string().max(100), kind: z.enum(continuitySummaryDomains), sourceId: z.string().uuid(),
  target: aiResumeTargetSchema.nullable(), label: z.string().max(100), href: z.string().max(1000),
  status: z.enum(["succeeded", "failed", "interrupted", "needs-check"]), phase: z.string().max(160), updatedAt: z.string().datetime({ offset: true }),
}).strict();
export const continuitySummarySchema = z.object({
  entries: z.array(entry).max(40),
  coverage: z.array(z.object({ kind: z.enum(continuitySummaryDomains), checked: z.boolean(), count: z.number().int().min(0).max(20), truncated: z.boolean(), error: z.enum(["unavailable", "dependency-unavailable"]).nullable() }).strict()).length(continuitySummaryDomains.length),
  checkedAt: z.string().datetime({ offset: true }), partial: z.boolean(), truncated: z.boolean(),
}).strict();
export type ContinuitySummary = z.infer<typeof continuitySummarySchema>;
export type ContinuitySummaryEntry = z.infer<typeof entry>;

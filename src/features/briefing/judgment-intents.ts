import { z } from "zod";

export const briefingJudgmentIntentSchema = z.object({
  intentId: z.string().uuid(), entryId: z.string().uuid(),
  expectedDecisionId: z.string().uuid().nullable(), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  judgment: z.string().trim().min(1).max(5000), confidence: z.string().trim().min(1).transform(Number).pipe(z.number().int().min(0).max(100)),
  falsification: z.string().trim().max(2000).transform(value => value || null),
  reviewPeriod: z.enum(["1_month", "3_months", "6_months", "1_year"]),
}).strict().refine(value => Boolean(value.expectedDecisionId) === Boolean(value.expectedUpdatedAt), "需要原判断的完整版本信息。");
export type BriefingJudgmentIntent = {
  intentId: string; entryId: string; expectedDecisionId: string | null; expectedUpdatedAt: string | null;
  judgment: string; confidence: string; falsification: string; reviewPeriod: "1_month" | "3_months" | "6_months" | "1_year";
};
export type BriefingJudgmentOutcome =
  | { status: "saved"; entryId: string; decisionId: string; updatedAt: string; superseded: boolean }
  | { status: "needs-check"; message: string }
  | { status: "rejected"; code: "invalid" | "conflict" | "unavailable"; message: string };

import { z } from "zod";

const shortList = z
  .array(z.string().trim().min(1).max(500))
  .max(12)
  .default([]);

export const reviewStructuredDataSchema = z.object({
  wins: shortList,
  friction: shortList,
  openLoops: shortList,
  changes: shortList,
  lessons: shortList,
  nextFocus: shortList,
  freeReflection: z.string().max(10000).default(""),
});

export const completeReviewSchema = z.object({
  period: z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string().max(100) }).strict().optional(),
  type: z.enum(["daily", "weekly"]),
  structuredData: reviewStructuredDataSchema,
  generatedWithAi: z.boolean().default(false),
  aiContextSources: z
    .array(
      z
        .object({ sourceType: z.string().max(80), sourceId: z.string().uuid() })
        .strict(),
    )
    .max(200)
    .default([]),
  selectedSources: z
    .array(
      z
        .object({ sourceType: z.string().max(80), sourceId: z.string().uuid() })
        .strict(),
    )
    .max(200)
    .default([]),
});

export const reviewProposalTypes = [
  "profile_memory",
  "working_memory",
  "decision_keep",
  "decision_supersede",
  "decision_reverse",
] as const;

export const reviewProposalSchema = z
  .object({
    type: z.enum(reviewProposalTypes),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(10000),
    rationale: z.string().trim().min(1).max(2000),
    evidenceSourceIds: z.array(z.string().uuid()).max(30).default([]),
    decisionId: z.string().uuid().nullable().optional(),
    reviewAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "working_memory" && !value.reviewAt) {
      context.addIssue({
        code: "custom",
        path: ["reviewAt"],
        message: "Working Memory proposal 必须设置复核时间。",
      });
    }
    if (value.type.startsWith("decision_") && !value.decisionId) {
      context.addIssue({
        code: "custom",
        path: ["decisionId"],
        message: "Decision proposal 必须引用现有决定。",
      });
    }
  });

export const reviewProposalEnvelopeSchema = z.object({
  proposals: z.array(reviewProposalSchema).max(8),
});

export type ReviewProposal = z.infer<typeof reviewProposalSchema>;

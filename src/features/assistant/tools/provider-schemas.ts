import { z } from "zod";
import { memoryCreateProposalSchema } from "./schemas";

const optionalIso = z.string().datetime({ offset: true }).nullable().optional();

/**
 * Provider-facing schemas must have a top-level JSON Schema object.
 * DeepSeek/OpenAI-compatible function calling rejects discriminated unions at
 * the root because they serialize as oneOf without `type: object`.
 *
 * Keep this permissive at the transport boundary, then validate the exact
 * variant with memoryCreateProposalSchema before persisting a proposal.
 */
export const memoryCreateToolInputSchema = z.object({
  type: z.enum(["profile", "working", "decision"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  reason: z.string().trim().min(1).max(500),
  aiVisibility: z.enum(["normal", "sensitive", "never"]).optional(),
  validUntil: optionalIso,
  reviewAt: optionalIso,
  rationaleMarkdown: z.string().max(20_000).optional(),
  importance: z.enum(["low", "normal", "high"]).optional(),
  decidedAt: z.string().datetime({ offset: true }).optional(),
});

export function parseMemoryCreateToolInput(input: unknown) {
  return memoryCreateProposalSchema.safeParse(input);
}

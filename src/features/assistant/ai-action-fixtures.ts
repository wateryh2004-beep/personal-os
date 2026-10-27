import type { readBriefingGenerationAction } from "@/features/briefing/actions";
import type { readReviewProposalGeneration } from "@/features/reviews/actions";
import type { readInboxClassificationState } from "@/features/inbox/actions";
import type { AiActionInput, AiActionResult } from "./ai-action-runtime";

/** Synthetic transport only; the caller must pass the compile/runtime fixture gate. */
export type AiActionFixtureTransport = { execute: (input: AiActionInput) => Promise<AiActionResult>; readBriefing?: typeof readBriefingGenerationAction; readReviewProposals?: typeof readReviewProposalGeneration; readInboxClassification?: typeof readInboxClassificationState };

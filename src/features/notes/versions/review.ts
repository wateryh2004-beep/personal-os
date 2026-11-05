import { z } from "zod";

const content = z.object({ title: z.string().max(240), body: z.string().max(200_000) });
export const versionReviewPayloadSchema = z.object({
  current: content.extend({ revision: z.number().int().min(0) }),
  historical: content.extend({
    id: z.string().uuid(), versionNumber: z.number().int().nonnegative(), createdAt: z.string(),
  }),
});

export function canApplyReviewedNoteVersion(input: {
  expectedRevision: number;
  actualRevision: number;
  selectedVersionNoteId: string;
  currentNoteId: string;
}): boolean {
  return Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0 &&
    input.expectedRevision === input.actualRevision &&
    input.selectedVersionNoteId === input.currentNoteId;
}

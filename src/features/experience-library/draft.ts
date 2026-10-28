import { z } from "zod";
import { experienceCaptureTypes } from "./types";

/** Same-tab, short-lived recovery; never includes image bytes or API credentials. */
export const experienceDraftSchema = z.object({
  title: z.string().max(240),
  sourceUrl: z.string().max(8192),
  content: z.string().max(200_000),
  captureType: z.enum(experienceCaptureTypes),
  pendingImages: z.number().int().min(0).max(200),
  savedTarget: z.object({ entryId: z.uuid(), captureId: z.uuid().nullable(), title: z.string().max(240) }).nullable(),
  requestId: z.uuid().nullable(),
});
export type ExperienceDraft = z.infer<typeof experienceDraftSchema>;

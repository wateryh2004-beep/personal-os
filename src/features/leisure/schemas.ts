import { z } from "zod";
import { leisureKinds, leisureReactions, leisureStatuses } from "./types";

const timestamp = z.iso.datetime({ offset: true });
const httpUrl = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use a public HTTP(S) source URL without credentials.");
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();
const revision = z.number().int().min(1).max(2147483647);

export const leisureSourceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: httpUrl,
  kind: z.enum(["official", "rating", "reference"]),
  verification: z.enum(["verified", "unverified", "stale"]),
  checked_at: timestamp.nullable(),
}).strict().refine((source) => source.verification !== "verified" || source.checked_at !== null, {
  message: "A verified source needs a check timestamp.",
  path: ["checked_at"],
});

export const leisureRatingSchema = z.object({
  platform: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(80),
  scale: optionalText(80),
  checked_at: timestamp,
  source_url: httpUrl,
}).strict();

/** Editorial input has an explicit allowlist; personal feedback is never accepted. */
export const leisureContentSchema = z.object({
  title: z.string().trim().min(1).max(240),
  kind: z.enum(leisureKinds),
  why: z.string().trim().min(1).max(2000),
  body_markdown: z.string().max(60000),
  how_to_start: optionalText(2000),
  duration_minutes: z.number().int().min(1).max(525600).nullable(),
  platform: optionalText(240),
  location: optionalText(500),
  starts_at: timestamp.nullable(),
  cost_text: optionalText(240),
  setting: z.enum(["home", "out", "either"]).nullable(),
  company: z.enum(["solo", "together", "either"]).nullable(),
  budget: z.enum(["free", "paid", "unknown"]),
  sources: z.array(leisureSourceSchema).max(20),
  ratings: z.array(leisureRatingSchema).max(10),
}).strict().refine((content) => content.ratings.every((rating) =>
  content.sources.some((source) => source.kind === "rating" && source.url === rating.source_url)
), { message: "Each platform rating needs its original source.", path: ["ratings"] });

export const leisureFeedbackInputSchema = z.object({
  experience_id: z.uuid(),
  expected_revision: z.number().int().min(0).max(2147483646),
  status: z.enum(leisureStatuses).nullable(),
  reaction: z.enum(leisureReactions),
  personal_note: z.string().max(10000),
  linked_note_id: z.uuid().nullable(),
}).strict();

// Database responses are projected, not forwarded: ownership/audit columns stay server-side.
export const leisureFeedbackSchema = z.object({
  status: z.enum(leisureStatuses).nullable(),
  reaction: z.enum(leisureReactions),
  personal_note: z.string().max(10000),
  linked_note_id: z.uuid().nullable(),
  linked_note_title: z.string().nullable().default(null),
  linked_note_available: z.boolean().default(false),
  revision,
  updated_at: timestamp,
});

export const leisureExperienceSchema = z.object({
  ...leisureContentSchema.shape,
  id: z.uuid(),
  content_revision: revision,
  created_at: timestamp,
  updated_at: timestamp,
});

export const leisureSummarySchema = leisureExperienceSchema.omit({ body_markdown: true, sources: true, ratings: true });

export const leisureContentWriteSchema = z.object({
  experience_id: z.uuid(),
  expected_revision: z.number().int().min(0).max(2147483646),
  content: leisureContentSchema,
}).strict();

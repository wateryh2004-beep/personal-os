import { z } from "zod";
import { formObject, interviewAttemptSchema, interviewSessionAttemptSchema } from "./schemas";

export type PracticeMode = "solo" | "session";
export const practicePayloadSchema = z.object({
  mode: z.enum(["solo", "session"]),
  preparation_id: z.string().uuid().nullable(), session_id: z.string().uuid().nullable(), parent_attempt_id: z.string().uuid().nullable(), answer_version_id: z.string().uuid().nullable(), story_id: z.string().uuid().nullable(),
  input_mode: z.enum(["text", "voice", "transcript_import"]), language: z.enum(["zh", "en", "bilingual"]), prompt_snapshot: z.string().max(10000).nullable(),
  response_transcript_markdown: z.string().max(100000), duration_seconds: z.number().int().min(1).max(7200).nullable(), self_review_markdown: z.string().max(50000),
  strength_tags: z.array(z.string().max(4000)).max(32), issue_tags: z.array(z.string().max(4000)).max(32), next_focus: z.string().max(5000),
  confidence_before: z.number().int().min(1).max(5).nullable(), confidence_after: z.number().int().min(1).max(5).nullable(),
}).strict();
export type PracticePayload = z.infer<typeof practicePayloadSchema>;
export function normalizePracticeIntent(mode: PracticeMode, form: FormData): PracticePayload {
  const raw = { ...formObject(form), issue_tags: form.getAll("issue_tags").map(String).join(",") };
  if (mode === "solo") {
    const value = interviewAttemptSchema.parse(raw);
    return practicePayloadSchema.parse({ ...value, mode, session_id: null });
  }
  const value = interviewSessionAttemptSchema.parse(raw);
  return practicePayloadSchema.parse({ ...value, mode, answer_version_id: null });
}
export const practiceReceiptSchema = z.object({ attempt_id: z.string().uuid(), preparation_id: z.string().uuid().nullable(), session_id: z.string().uuid().nullable(), sequence_no: z.number().int().positive().nullable(), created: z.boolean().optional(), archived: z.boolean(), question_id: z.string().uuid().nullable().optional() }).strict();
export type PracticeReceipt = z.infer<typeof practiceReceiptSchema>;
export type PracticeIntentOutcome =
  | { status: "saved"; receipt: PracticeReceipt; warning?: string }
  | { status: "missing" }
  | { status: "needs-check" | "rejected" | "conflict"; message: string };

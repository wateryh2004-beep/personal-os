import { z } from "zod";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(0).max(2_147_483_646);
const timestamp = z.iso.datetime({ offset: true });
const sourceUrl = z.string().max(2_000).url().refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) source URL").nullable().optional().default(null);
const common = {
  operationId: uuid,
  source: z.enum(["codex", "claude", "external_agent"]),
  sourceUrl,
};
const noteFields = {
  title: z.string().min(1).max(240).refine((value) => Boolean(value.trim()), "A title is required"),
  // Preserve the exact supplied Markdown; never trim, reformat, or append provenance.
  bodyMarkdown: z.string().max(200_000),
};

export const contentWriteSchema = z.discriminatedUnion("operation", [
  z.object({
    ...common,
    ...noteFields,
    operation: z.literal("note.create"),
    folderId: uuid.nullable().optional().default(null),
  }).strict(),
  z.object({
    ...common,
    ...noteFields,
    operation: z.literal("note.update"),
    noteId: uuid,
    expectedRevision: revision,
    // Existing rename/archive actions do not increment revision. Check the full row clock too.
    expectedUpdatedAt: timestamp,
  }).strict(),
  z.object({
    ...common,
    operation: z.literal("interview.answer.append"),
    preparationId: uuid,
    // The pilot has a verified read-after-write surface for spoken answers only.
    answerMode: z.literal("spoken"),
    language: z.enum(["zh", "en", "bilingual"]),
    targetSeconds: z.number().int().min(10).max(1_800).nullable(),
    // This is the maximum version in the exact variant, including archived versions.
    expectedVersion: revision,
    expectedAnswerId: uuid.nullable(),
    expectedUpdatedAt: timestamp.nullable(),
    bodyMarkdown: z.string().max(50_000).refine((value) => Boolean(value.trim()), "An answer is required"),
    changeNote: z.string().max(4_000).nullable().optional().default(null),
  }).strict().superRefine((value, context) => {
    const hasBase = value.expectedAnswerId !== null;
    if (hasBase !== (value.expectedUpdatedAt !== null) || (value.expectedVersion === 0 && hasBase)) {
      context.addIssue({ code: "custom", message: "A selected base requires both answer ID and updatedAt; a new variant cannot have a base" });
    }
    // A variant containing only archived answers can start a fresh draft with
    // no base, while expectedVersion still protects its complete history.
  }),
]);

export type ContentWriteCommand = z.infer<typeof contentWriteSchema>;
export const contentWriteResultSchema = z.object({
  operationId: uuid,
  entityType: z.enum(["note", "interview_preparation"]),
  entityId: uuid,
  answerId: uuid.optional(),
  revision: z.number().int().positive(),
  updatedAt: timestamp,
  href: z.string().startsWith("/"),
  replayed: z.boolean(),
}).strict();
export type ContentWriteResult = z.infer<typeof contentWriteResultSchema>;

export type ContentWriteErrorCode = "invalid_input" | "conflict" | "not_found" | "idempotency_conflict" | "migration_required" | "forbidden" | "write_failed";

export class ContentWriteError extends Error {
  constructor(public readonly code: ContentWriteErrorCode) {
    super({
      invalid_input: "The content command is invalid.",
      conflict: "The content changed. Read it again and review before retrying with a new operation ID.",
      not_found: "The selected content is unavailable for this operation.",
      idempotency_conflict: "This operation ID was already used for a different command.",
      migration_required: "The reviewed content transaction has not been installed.",
      forbidden: "An authenticated owner session is required.",
      write_failed: "The content transaction could not be completed.",
    }[code]);
    this.name = "ContentWriteError";
  }
}

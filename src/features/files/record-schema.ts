import { z } from "zod";

/** The private Files list projection, with no content or storage credentials. */
export const fileRecordSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(240), original_filename: z.string().max(255), mime_type: z.string().max(255),
  file_size: z.number().int().nonnegative(), folder_id: z.string().max(80).nullable(),
  uploaded_at: z.string().max(80), created_at: z.string().max(80), archived_at: z.string().max(80).nullable(),
  ai_visibility: z.enum(["normal", "sensitive", "never"]),
  text_extraction_status: z.enum(["not_requested", "pending", "processing", "completed", "unsupported", "too_large", "failed"]),
  extracted_character_count: z.number().int().nonnegative(), mutation_revision: z.number().int().nonnegative(),
});

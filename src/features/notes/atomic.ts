import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

const resultSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), duplicate: z.boolean() });
export async function mutateNoteAtomic(supabase: Awaited<ReturnType<typeof createClient>>, input: {
  operation: "create" | "update" | "restore" | "move";
  noteId?: string;
  expectedRevision?: number;
  title?: string | null;
  body?: string;
  folderId?: string | null;
  versionId?: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("mutate_note_atomic", {
    p_operation: input.operation, p_note_id: input.noteId ?? randomUUID(),
    p_expected_revision: input.expectedRevision ?? null, p_title: input.title ?? null,
    p_body: input.body ?? null, p_folder_id: input.folderId ?? null,
    p_version_id: input.versionId ?? null, p_reason: input.reason,
  });
  if (error) throw new Error(error.message.includes("note_revision_conflict") ? "note_revision_conflict" : "note_transaction_failed");
  return resultSchema.parse(data);
}

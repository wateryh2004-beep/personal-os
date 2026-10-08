"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { supportsPdfPreview } from "./pdf-preview";
import { readingProgressSchema, type ReadingSnapshot, type ReadingSaveResult } from "./reading-progress";

async function readableDocument(documentId: string) {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents")
    .select("id,reading_source_version,mime_type,original_filename,file_size,storage_path")
    .eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
    .eq("storage_bucket", r2BucketName()).eq("storage_state", "available").is("archived_at", null).maybeSingle();
  if (error || !data || !supportsPdfPreview(data.mime_type, data.original_filename) ||
      Number(data.file_size) > 25 * 1024 * 1024 || !data.storage_path.startsWith(`${userId}/files/${documentId}/`))
    throw new Error("reading_unavailable");
  return { supabase, userId, document: data };
}

export async function getReadingProgress(documentId: string): Promise<ReadingSnapshot | null> {
  if (!z.string().uuid().safeParse(documentId).success) return null;
  try {
    const { supabase, userId, document } = await readableDocument(documentId);
    const { data, error } = await supabase.from("document_reading_progress")
      .select("page,total_pages,revision,updated_at").eq("document_id", documentId).eq("user_id", userId)
      .eq("source_version", document.reading_source_version).maybeSingle();
    if (error) return null;
    return { sourceVersion: document.reading_source_version, progress: data ? {
      page: data.page, totalPages: data.total_pages, revision: Number(data.revision), updatedAt: data.updated_at,
    } : null };
  } catch { return null; }
}

export async function saveReadingProgress(input: unknown): Promise<ReadingSaveResult> {
  const parsed = readingProgressSchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable" };
  try {
    const { supabase, document } = await readableDocument(parsed.data.documentId);
    if (document.reading_source_version !== parsed.data.sourceVersion) return { status: "source_changed" };
    const { data, error } = await supabase.rpc("save_document_reading_progress", {
      p_document_id: parsed.data.documentId, p_source_version: parsed.data.sourceVersion,
      p_page: parsed.data.page, p_total_pages: parsed.data.totalPages,
      p_expected_revision: parsed.data.expectedRevision, p_mutation_id: parsed.data.mutationId,
    });
    if (error || !data) return { status: "unavailable" };
    return data as ReadingSaveResult;
  } catch { return { status: "unavailable" }; }
}

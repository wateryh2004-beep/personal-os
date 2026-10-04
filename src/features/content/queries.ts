import { z } from "zod";
import type { requireOwnerApi } from "@/lib/auth/require-owner";

type Owner = Awaited<ReturnType<typeof requireOwnerApi>>;

export const contentReadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("find"), kind: z.enum(["note", "interview"]), q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(30).default(20) }).strict(),
  z.object({ action: z.literal("read"), kind: z.enum(["note", "interview"]), id: z.string().uuid(), answerId: z.string().uuid().optional() }).strict(),
]);

export type ContentReadCommand = z.infer<typeof contentReadSchema>;
const literalPattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const noteFields = "id,title,body_markdown,revision,updated_at,folder_id,content_origin";
const answerFields = "id,preparation_id,answer_mode,language,target_seconds,version_number,body_markdown,status,source,confirmed_at,updated_at,archived_at";

/** Bounded authoring context, using the caller's verified owner session and RLS.
 * This is deliberately not a bulk export or an alternate privacy bypass. */
export async function readContent(owner: Owner, command: ContentReadCommand) {
  const { supabase, userId } = owner;
  if (command.kind === "note") {
    if (command.action === "find") {
      const { data, error } = await supabase.from("notes")
        .select("id,title,revision,updated_at,content_origin")
        .eq("user_id", userId).eq("status", "active").eq("ai_visibility", "normal")
        .is("deleted_at", null).is("archived_at", null)
        .ilike("title", literalPattern(command.q)).order("updated_at", { ascending: false }).limit(command.limit);
      if (error) throw new Error("content_read_unavailable");
      return { results: (data ?? []).map((row) => ({ ...row, href: `/notes/${row.id}/read` })) };
    }
    const { data, error } = await supabase.from("notes").select(noteFields)
      .eq("user_id", userId).eq("status", "active").eq("ai_visibility", "normal")
      .is("deleted_at", null).is("archived_at", null).eq("id", command.id).maybeSingle();
    if (error) throw new Error("content_read_unavailable");
    if (!data) return null;
    const { data: sources, error: sourceError } = await supabase.from("audit_logs")
      .select("after_data,created_at").eq("user_id", userId).eq("entity_id", command.id)
      .eq("action", "content.write").order("created_at", { ascending: false }).limit(10);
    if (sourceError) throw new Error("content_read_unavailable");
    return { ...data, href: `/notes/${data.id}/read`, sources: (sources ?? []).map((row) => ({ source: row.after_data?.source ?? null, sourceUrl: row.after_data?.sourceUrl ?? null, captureMode: row.after_data?.captureMode ?? null, contentOrigin: row.after_data?.contentOrigin ?? null, savedAt: row.created_at })) };
  }

  if (command.action === "find") {
    const { data, error } = await supabase.from("interview_question_preparations")
      .select("id,question_id,context_id,updated_at,interview_questions!inner(id,canonical_prompt,short_title)")
      .eq("user_id", userId).eq("interview_questions.user_id", userId)
      .is("archived_at", null).is("interview_questions.archived_at", null)
      .ilike("interview_questions.canonical_prompt", literalPattern(command.q))
      .order("updated_at", { ascending: false }).limit(command.limit);
    if (error) throw new Error("content_read_unavailable");
    return { results: (data ?? []).map((row) => ({ ...row, href: interviewHref(row.question_id, row.context_id) })) };
  }

  const { data: preparation, error } = await supabase.from("interview_question_preparations")
    .select("id,question_id,context_id,target_language,working_thoughts_markdown,updated_at,interview_questions!inner(id,canonical_prompt,short_title)")
    .eq("id", command.id).eq("user_id", userId).eq("interview_questions.user_id", userId)
    .is("archived_at", null).is("interview_questions.archived_at", null).maybeSingle();
  if (error) throw new Error("content_read_unavailable");
  if (!preparation) return null;
  // Include stream heads separately: an explicitly selected older answer can be
  // a valid base, but expectedVersion must still cover newer unseen versions.
  const { data: versions, error: versionError } = await supabase.from("interview_answer_versions")
    .select("id,preparation_id,answer_mode,language,target_seconds,version_number,status,source,confirmed_at,updated_at,archived_at")
    .eq("preparation_id", command.id).eq("user_id", userId)
    .order("version_number", { ascending: false }).limit(201);
  if (versionError) throw new Error("content_read_unavailable");
  if ((versions?.length ?? 0) > 200) throw new Error("content_version_scope_too_large");
  let selected = null;
  const defaultAnswer = (versions ?? []).filter((row) => !row.archived_at && ["current", "draft"].includes(row.status))
    .sort((a, b) => Number(b.status === "current") - Number(a.status === "current")
      || Number(b.language === preparation.target_language) - Number(a.language === preparation.target_language)
      || b.updated_at.localeCompare(a.updated_at))[0];
  const selectedAnswerId = command.answerId ?? defaultAnswer?.id;
  if (selectedAnswerId) {
    const response = await supabase.from("interview_answer_versions").select(answerFields)
      .eq("id", selectedAnswerId).eq("preparation_id", command.id).eq("user_id", userId)
      .is("archived_at", null).maybeSingle();
    if (response.error) throw new Error("content_read_unavailable");
    if (!response.data) return null;
    selected = response.data;
  }
  return { ...preparation, versions: versions ?? [], selectedAnswer: selected, href: interviewHref(preparation.question_id, preparation.context_id, command.answerId) };
}

function interviewHref(questionId: string, contextId: string | null, answerId?: string) {
  const params = new URLSearchParams({ question: questionId });
  if (contextId) params.set("context", contextId);
  if (answerId) params.set("answer", answerId);
  return `/career/interview?${params}`;
}

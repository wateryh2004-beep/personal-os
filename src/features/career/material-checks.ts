"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { materialObjectRevisionsMatch } from "@/features/career/material-verification";
const schema = z
  .object({
    id: z.string().uuid(),
    opportunityId: z.string().uuid(),
    revision: z.number().int().min(0),
    label: z.string().trim().min(1).max(240),
    required: z.boolean(),
    documentId: z.string().uuid().nullable(),
    resumeId: z.string().uuid().nullable(),
    note: z.string().max(4000),
    verificationIntent: z.enum(["keep", "clear", "verify"]),
    verificationObjectRevision: z.string().max(2000).nullable(),
    verificationDocumentRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1)
      .nullable(),
    verificationResumeUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .nullable(),
  })
  .strict();
export async function saveCareerMaterialCheck(input: unknown) {
  const value = schema.parse(input),
    { supabase } = await requireOwner();
  if (value.verificationIntent === "verify") {
    const expectedToken =
      (value.documentId
        ? `document:${value.documentId}:${value.verificationDocumentRevision}`
        : "manual") +
      (value.resumeId
        ? `|resume:${value.resumeId}:${value.verificationResumeUpdatedAt}`
        : "");
    if (
      !materialObjectRevisionsMatch(
        value.verificationObjectRevision,
        expectedToken,
      )
    )
      throw new Error("核验意图与所见资料版本不一致，请读取后重新勾选。");
  }
  const { data, error } = await supabase.rpc("save_career_material_check", {
    p_id: value.id,
    p_opportunity_id: value.opportunityId,
    p_expected_revision: value.revision,
    p_label: value.label,
    p_required: value.required,
    p_document_id: value.documentId,
    p_resume_id: value.resumeId,
    p_note: value.note,
    p_verification_intent: value.verificationIntent,
    p_expected_object_revision: value.verificationObjectRevision,
    p_expected_document_revision: value.verificationDocumentRevision,
    p_expected_resume_updated_at: value.verificationResumeUpdatedAt,
  });
  if (error || !data)
    throw new Error(
      error?.message.includes("workflow_material_source_conflict")
        ? "源资料已变化，请读取最新内容，并重新明确核验；输入已保留。"
        : "核对单未能保存，可能已有新版本或资料不可用。输入保留，请读取最新内容核对。",
    );
  return data;
}
export async function readCareerMaterialCheck(input: unknown) {
  const value = z
      .object({
        id: z.string().uuid(),
        opportunityId: z.string().uuid(),
        documentId: z.string().uuid().nullable(),
        resumeId: z.string().uuid().nullable(),
        expectedExists: z.boolean(),
      })
      .strict()
      .parse(input),
    { supabase, userId } = await requireOwner();
  const { data: row, error } = await supabase
    .from("career_material_checks")
    .select("*")
    .eq("id", value.id)
    .eq("opportunity_id", value.opportunityId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || (!row && value.expectedExists))
    throw new Error("核对项最新内容暂时不可用，当前输入保留。");
  const documentIds = [
      ...new Set(
        [value.documentId, row?.document_id].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ],
    resumeIds = [
      ...new Set(
        [value.resumeId, row?.resume_version_id].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ];
  const [documents, resumes] = await Promise.all([
    documentIds.length
      ? supabase
          .from("documents")
          .select("id,title,mutation_revision,storage_state")
          .eq("user_id", userId)
          .in("id", documentIds)
          .is("vault_group_id", null)
          .is("archived_at", null)
          .eq("storage_state", "available")
      : { data: [], error: null },
    resumeIds.length
      ? supabase
          .from("resume_versions")
          .select("id,title,status,updated_at")
          .eq("user_id", userId)
          .in("id", resumeIds)
          .is("archived_at", null)
      : { data: [], error: null },
  ]);
  if (documents.error || resumes.error)
    throw new Error("源资料最新版本暂时无法读取，当前输入保留。");
  return {
    row,
    documents: documents.data ?? [],
    resumes: resumes.data ?? [],
    documentIds,
    resumeIds,
  };
}

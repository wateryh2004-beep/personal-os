"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { leisureFeedbackInputSchema, leisureFeedbackSchema } from "./schemas";
import type { LeisureFeedbackResult } from "./types";

/** An explicit user feedback snapshot, never an editorial/AI content write. */
export async function saveLeisureFeedback(input: unknown): Promise<LeisureFeedbackResult> {
  const parsed = leisureFeedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { supabase } = await requireOwner();
  const value = parsed.data;
  try {
    // The database derives auth.uid(), locks the record, verifies note ownership,
    // compares the revision and commits feedback + audit in one transaction.
    const { data, error } = await supabase.rpc("save_leisure_feedback", {
      p_experience_id: value.experience_id,
      p_expected_revision: value.expected_revision,
      p_status: value.status,
      p_reaction: value.reaction,
      p_personal_note: value.personal_note,
      p_linked_note_id: value.linked_note_id,
    });
    if (error) {
      if (error.message?.includes("leisure_conflict")) return { ok: false, error: "conflict" };
      if (error.message?.includes("leisure_note_unavailable")) return { ok: false, error: "note_unavailable" };
      if (error.message?.includes("leisure_invalid")) return { ok: false, error: "invalid" };
      return { ok: false, error: "unavailable" };
    }
    const feedback = leisureFeedbackSchema.safeParse(data);
    if (!feedback.success) return { ok: false, error: "unavailable" };
    // A cache refresh failure cannot undo an already committed transaction.
    try {
      revalidatePath("/leisure");
      revalidatePath(`/leisure/${value.experience_id}`);
    } catch { /* The returned revision remains authoritative for the current UI. */ }
    return { ok: true, feedback: feedback.data };
  } catch {
    // A dropped response may have committed; the UI should reload before retrying.
    return { ok: false, error: "unavailable" };
  }
}

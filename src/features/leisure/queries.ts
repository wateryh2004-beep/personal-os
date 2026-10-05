import "server-only";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { leisureExperienceSchema, leisureFeedbackSchema, leisureSummarySchema } from "./schemas";
import type { LeisureExperience, LeisureFeedback, LeisureSummary } from "./types";

const summaryColumns = "id,title,kind,why,how_to_start,duration_minutes,platform,location,starts_at,cost_text,setting,company,budget,content_revision,created_at,updated_at";
const contentColumns = "id,title,kind,why,body_markdown,how_to_start,duration_minutes,platform,location,starts_at,cost_text,setting,company,budget,sources,ratings,content_revision,created_at,updated_at";
const feedbackColumns = "experience_id,status,reaction,personal_note,linked_note_id,revision,updated_at";
const feedbackRowSchema = leisureFeedbackSchema.extend({ experience_id: z.uuid() });
type OwnerContext = Awaited<ReturnType<typeof requireOwner>>;

async function attachFeedback<T extends { id: string }>(
  context: OwnerContext,
  rows: T[],
): Promise<{ experiences: (T & { feedback: LeisureFeedback | null })[]; unavailable: boolean }> {
  if (!rows.length) return { experiences: [], unavailable: false };
  const { supabase, userId } = context;
  const { data, error } = await supabase.from("leisure_feedback")
    .select(feedbackColumns)
    .eq("user_id", userId)
    .in("experience_id", rows.map((row) => row.id))
    .is("archived_at", null);
  // Never show missing feedback as an empty state when the feedback read failed.
  const feedbackRows = z.array(feedbackRowSchema).safeParse(data);
  if (error || !feedbackRows.success) return { experiences: [], unavailable: true };

  const linkedIds = [...new Set(feedbackRows.data.flatMap((row) => row.linked_note_id ? [row.linked_note_id] : []))];
  const noteTitles = new Map<string, string>();
  if (linkedIds.length) {
    const notes = await supabase.from("notes").select("id,title")
      .eq("user_id", userId).in("id", linkedIds).is("archived_at", null).eq("status", "active");
    if (notes.error) return { experiences: [], unavailable: true };
    for (const note of notes.data ?? []) noteTitles.set(note.id, note.title);
  }
  const feedbackById = new Map<string, LeisureFeedback>();
  for (const row of feedbackRows.data) {
    const { experience_id, ...feedback } = row;
    // Preserve the stored reference during unrelated feedback edits, but only
    // expose a navigable link after confirming the note is owned and active.
    const visibleNoteId = feedback.linked_note_id && noteTitles.has(feedback.linked_note_id)
      ? feedback.linked_note_id : null;
    feedbackById.set(experience_id, {
      ...feedback,
      linked_note_id: feedback.linked_note_id,
      linked_note_available: visibleNoteId !== null,
      linked_note_title: visibleNoteId ? noteTitles.get(visibleNoteId)! : null,
    });
  }
  return {
    experiences: rows.map((row) => ({ ...row, feedback: feedbackById.get(row.id) ?? null })),
    unavailable: false,
  };
}

/** One canonical read model powers both home and detail. No fabricated seed data. */
export async function getLeisureExperiences(): Promise<{ experiences: LeisureSummary[]; unavailable: boolean; hasMore: boolean }> {
  const context = await requireOwner();
  try {
    const { data, error } = await context.supabase.from("leisure_experiences")
      .select(summaryColumns).eq("user_id", context.userId).is("archived_at", null)
      .order("updated_at", { ascending: false }).order("id", { ascending: true }).limit(101);
    if (error) return { experiences: [], unavailable: true, hasMore: false };
    const parsed = z.array(leisureSummarySchema).safeParse(data ?? []);
    if (!parsed.success) return { experiences: [], unavailable: true, hasMore: false };
    return { ...await attachFeedback(context, parsed.data.slice(0, 100)), hasMore: parsed.data.length > 100 };
  } catch {
    return { experiences: [], unavailable: true, hasMore: false };
  }
}

export async function getLeisureExperience(id: string): Promise<{ experience: LeisureExperience | null; unavailable: boolean }> {
  const context = await requireOwner();
  if (!z.uuid().safeParse(id).success) return { experience: null, unavailable: false };
  try {
    const { data, error } = await context.supabase.from("leisure_experiences")
      .select(contentColumns).eq("user_id", context.userId).eq("id", id)
      .is("archived_at", null).maybeSingle();
    if (error) return { experience: null, unavailable: true };
    if (!data) return { experience: null, unavailable: false };
    const parsed = leisureExperienceSchema.safeParse(data);
    if (!parsed.success) return { experience: null, unavailable: true };
    const result = await attachFeedback(context, [parsed.data]);
    return { experience: result.experiences[0] ?? null, unavailable: result.unavailable };
  } catch {
    return { experience: null, unavailable: true };
  }
}

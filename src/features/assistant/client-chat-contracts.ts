import { z } from "zod";
import type { BackgroundOperationStatus } from "@/features/workflow-continuity/background-operations";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const chatIdentitySchema = z.union([
  z.object({ surface: z.enum(["global", "notes-library", "tasks", "calendar"]) }).strict(),
  z.object({ surface: z.literal("career"), experienceId: uuid }).strict(),
]);
export type ChatIdentity = z.infer<typeof chatIdentitySchema>;
export const aiResumeTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note-history"), noteId: uuid, runId: uuid }).strict(),
  z.object({ kind: z.literal("note-input"), noteId: uuid, role: z.enum(["main", "reference"]) }).strict(),
  z.object({ kind: z.literal("review-input"), reviewType: z.enum(["daily", "weekly"]), periodStart: date }).strict(),
  z.object({ kind: z.literal("chat"), identity: chatIdentitySchema, runId: uuid.optional() }).strict(),
  z.object({ kind: z.literal("note-suggestion"), noteId: uuid, proposalId: uuid }).strict(),
  z.object({ kind: z.literal("review-draft"), reviewType: z.enum(["daily", "weekly"]), periodStart: date, proposalId: uuid }).strict(),
  z.object({ kind: z.literal("review-proposals"), reviewId: uuid }).strict(),
  z.object({ kind: z.literal("inbox-capture"), intentId: uuid }).strict(),
  z.object({ kind: z.literal("inbox-classification"), inboxId: uuid }).strict(),
  z.object({ kind: z.literal("today-summary"), localDate: date, sourceFingerprint: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal("briefing-generation"), localDate: date }).strict(),
]);
export type AiResumeTarget = z.infer<typeof aiResumeTargetSchema>;
export type AiContinuitySnapshot = {
  id: string; backgroundOperationId?: string; target: AiResumeTarget;
  label: string; href: string; status: BackgroundOperationStatus;
  phase: string; updatedAt: number; expiresAt: number;
};
export type AiResumeOutcome = { status: "accepted" } | { status: "pending"; requestId: string } | { status: "missing" | "invalid"; message: string };
export function aiResumeHref(target: AiResumeTarget): string | null {
  const parsed = aiResumeTargetSchema.safeParse(target);
  if (!parsed.success) return null;
  const value = parsed.data;
  switch (value.kind) {
    case "chat": return value.identity.surface === "career" ? `/career/experiences/${value.identity.experienceId}` : value.identity.surface === "global" ? "/today" : value.identity.surface === "notes-library" ? "/notes/ask" : `/${value.identity.surface}`;
    case "note-history":
    case "note-input":
    case "note-suggestion": return `/notes/${value.noteId}`;
    case "review-input":
    case "review-draft": return `/reviews/${value.reviewType}`;
    case "review-proposals": return `/reviews/${value.reviewId}`;
    case "inbox-capture": case "inbox-classification": return "/inbox";
    case "today-summary": return "/today";
    case "briefing-generation": return "/briefing";
  }
}
export function chatIdentityKey(identity: ChatIdentity) { return identity.surface === "career" ? `career:${identity.experienceId}` : identity.surface; }

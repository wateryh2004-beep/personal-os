"use client";
import { z } from "zod";
import { lifeRequestOutcomeSchema, lifeFieldRowSchema } from "@/features/life/contracts";
import { assertContinuousFixtureTransport } from "./continuous-fixture-gate";
import type { NoteEditorVerificationTransport } from "@/components/notes/note-editor";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import type { WorkbenchVerificationTransport } from "@/components/workbench/workbench-provider";
import { noteSourceLocatorSchema } from "@/features/links/source-locator";
import { workspaceSceneSchema } from "@/features/workbench/contracts";
import { reviewStructuredDataSchema } from "@/features/reviews/schemas";
export async function postFixture(operation: string, input: unknown): Promise<unknown> {
  assertContinuousFixtureTransport({ operation, input });
  const response = await fetch(`/api/continuous-workflows-fixture/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error("synthetic_transport_unavailable");
  return response.json();
}
const noteResult = z.object({ status: z.enum(["idle", "success", "error"]), message: z.string(), suggestion: z.string(), operation: z.string().optional(), scope: z.enum(["note", "selection"]).optional() }).strict();
export const fixtureAi: AiActionFixtureTransport = { execute: async input => {
  const result = await postFixture("ai-action", input);
  if (input.kind === "note-suggestion") return noteResult.parse(result);
  if (input.kind === "review-draft") return z.object({ ok: z.literal(true), draft: reviewStructuredDataSchema, period: z.object({ periodStart: z.string(), periodEnd: z.string(), timezone: z.string() }).strict(), coverage: z.number(), sources: z.array(z.object({ sourceType: z.string(), sourceId: z.uuid() }).strict()) }).strict().parse(result);
  if (input.kind === "today-summary") return z.object({ summary: z.string(), localDate: z.string(), sourceFingerprint: z.string() }).strict().parse(result);
  if (input.kind === "briefing-generation") return z.union([z.object({ started: z.boolean(), reason: z.literal("date-changed").optional() }).strict(), z.object({ status: z.enum(["idle", "success", "warning", "error"]), message: z.string(), selected: z.number().nullable(), candidateCount: z.number().nullable(), feedsRefreshed: z.number().nullable(), feedsFailed: z.number().nullable(), needsCheck: z.boolean().optional() }).strict()]).parse(result);
  if (input.kind === "inbox-classification") return z.object({ status: z.enum(["idle", "success", "error"]), message: z.string(), needsCheck: z.boolean().optional() }).strict().parse(result);
  throw new Error("unhandled_synthetic_action");
} };
export const fixtureNote: NoteEditorVerificationTransport = {
  ai: fixtureAi,
  saveNote: async input => z.discriminatedUnion("status", [z.object({ status: z.literal("saved"), revision: z.number().int(), lastSavedAt: z.string() }).strict(), z.object({ status: z.literal("conflict") }).strict()]).parse(await postFixture("note-save", input)),
  captureSource: async input => z.discriminatedUnion("status", [z.object({ status: z.literal("ready"), locator: noteSourceLocatorSchema, href: z.string() }).strict(), z.object({ status: z.literal("conflict"), message: z.string() }).strict()]).parse(await postFixture("note-source", input)),
};
export const fixtureWorkbench: WorkbenchVerificationTransport = {
  note: fixtureNote,
  saveScene: async input => z.discriminatedUnion("status", [z.object({ status: z.literal("saved"), scene: workspaceSceneSchema }).strict(), z.object({ status: z.enum(["invalid", "conflict", "missing", "limit", "unavailable"]) }).strict()]).parse(await postFixture("scene-save", input)),
};

const captureOutcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), intentId: z.uuid(), inboxId: z.uuid(), classification: z.enum(["ready", "failed", "unclassified", "needs-check"]) }).strict(),
  z.object({ status: z.literal("needs-check"), intentId: z.uuid(), message: z.string() }).strict(),
  z.object({ status: z.literal("rejected"), intentId: z.uuid(), code: z.enum(["invalid", "conflict", "unavailable"]), message: z.string() }).strict(),
]);
export const fixtureCapture: import("@/features/assistant/capture-fixtures").CaptureFixtureTransport = {
  submit: async input => captureOutcome.parse(await postFixture("capture-submit", input)),
  reconcile: async input => captureOutcome.parse(await postFixture("capture-read", input)),
};
const actionResult = z.object({ status: z.enum(["success", "error", "conflict", "rejected"]), message: z.string(), actionId: z.string(), href: z.string().optional() }).strict();
export const fixtureAgentActions: import("@/features/assistant/action-fixtures").AgentActionFixtureTransport = {
  approve: async id => actionResult.parse(await postFixture("agent-approve", [id])),
  reject: async id => actionResult.parse(await postFixture("agent-reject", [id])),
  approveMany: async ids => z.array(actionResult).max(20).parse(await postFixture("agent-approve-many", ids)),
  readMany: async ids => z.array(z.object({ actionId: z.uuid(), status: z.string(), href: z.string().optional() }).strict()).max(20).parse(await postFixture("agent-read", ids)),
};
const syntheticLifeResult = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), rows: z.array(lifeFieldRowSchema).min(1).max(20), receiptId: z.uuid(), replayed: z.boolean().optional() }).strict(), z.object({ ok: z.literal(false), error: z.enum(["invalid", "conflict", "unavailable", "not_ready"]), message: z.string() }).strict()]);
export const fixtureLife: import("@/features/life/verification-context").LifeVerificationTransport = {
  apply: async input => syntheticLifeResult.parse(await postFixture("life-apply", input)),
  readRequest: async input => lifeRequestOutcomeSchema.parse(await postFixture("life-request-read", input)),
  read: async id => z.object({ operation: z.string(), rows: z.array(lifeFieldRowSchema).max(20) }).strict().nullable().parse(await postFixture("life-read", id)),
};
export const fixtureOperations: import("@/components/workbench/operation-history").OperationHistoryVerificationTransport = {
  list: async () => z.array(z.object({ id: z.uuid(), operation: z.string(), status: z.string(), target_id: z.uuid(), created_at: z.string(), expires_at: z.string(), title: z.string(), count: z.number().int() }).strict()).max(100).parse(await postFixture("operations-list", null)),
  preview: async id => z.object({ receiptId: z.uuid(), title: z.string(), count: z.number().int(), operation: z.string(), status: z.string(), expiresAt: z.string(), timezone: z.string(), provider: z.boolean(), changes: z.array(z.object({ label: z.string(), before: z.string(), after: z.string() }).strict()).max(400) }).strict().parse(await postFixture("operations-preview", id)),
  undo: async id => z.object({ status: z.enum(["success", "error", "conflict", "unknown"]), message: z.string(), receiptId: z.uuid().optional() }).strict().parse(await postFixture("operations-undo", id)),
};
export const fixtureShell: import("@/components/layout/app-shell").AppShellVerificationTransport = { ...fixtureWorkbench, capture: fixtureCapture, agentActions: fixtureAgentActions, operations: fixtureOperations };
export const fixtureMetadata: import("@/components/workbench/workbench-provider").MetadataVerificationTransport = {
  readTargets: async (kind, ids) => z.array(z.object({ id: z.uuid(), title: z.string(), folder_id: z.uuid().nullable(), mutation_revision: z.number().int() }).strict()).max(20).parse(await postFixture("metadata-targets", { kind, ids })),
  apply: async input => z.object({ status: z.enum(["success", "error", "conflict", "unknown"]), message: z.string(), receiptId: z.uuid().optional(), rows: z.array(z.record(z.string(), z.unknown())).optional(), requestId: z.uuid().optional() }).strict().parse(await postFixture("metadata-apply", input)),
  readReceipt: async id => { const { fileRecordSchema } = await import("@/features/files/record-schema"); return z.discriminatedUnion("kind", [z.object({ kind: z.literal("document"), rows: z.array(fileRecordSchema).max(20) }).strict(), z.object({ kind: z.literal("other"), rows: z.array(z.never()).max(0) }).strict()]).parse(await postFixture("metadata-receipt-read", id)); },
};
// This composition is consumed only inside the gated browser-only fixture layout.
fixtureWorkbench.metadata = fixtureMetadata;
fixtureShell.metadata = fixtureMetadata;
const readingProgressWire=z.object({page:z.number().int(),totalPages:z.number().int(),revision:z.number().int(),updatedAt:z.string()}).strict();
export const fixtureReading:import("@/features/files/reading-verification-context").ReadingVerificationTransport={
 read:async id=>z.object({sourceVersion:z.uuid(),progress:readingProgressWire.nullable()}).strict().nullable().parse(await postFixture("reading-read",id)),
 save:async input=>z.discriminatedUnion("status",[z.object({status:z.enum(["saved","conflict"]),progress:readingProgressWire}).strict(),z.object({status:z.enum(["unavailable","source_changed"])}).strict()]).parse(await postFixture("reading-save",input)),
};

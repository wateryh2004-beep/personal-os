"use client";
import { z } from "zod";
import type { WorkbenchPosition } from "./contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";

export type PositionRestoreStatus = "applied" | "changed-source" | "missing" | "unavailable" | "cancelled" | "timeout";
export type NotePositionRequest = { requestId?: string; instanceId?: string; noteId: string; position: WorkbenchPosition };
export type PdfPositionRequest = { requestId?: string; documentId: string; page: number; sourceVersion?: string };
type PositionAcknowledgement = { requestId: string; entityId: string; status: Exclude<PositionRestoreStatus, "timeout"> };
const acknowledgementSchema = z.object({ requestId: z.uuid(), entityId: z.uuid(), status: z.enum(["applied", "changed-source", "missing", "unavailable", "cancelled"]) }).strict();
const ackEvent = "personal-os:position-restored";
export function acknowledgePositionRestore(request: NotePositionRequest | PdfPositionRequest, status: Exclude<PositionRestoreStatus, "timeout">) {
  if (!request.requestId) return; // Legacy local continuity callers have no awaiting host.
  const entityId = "noteId" in request ? request.noteId : request.documentId;
  const acknowledgement = acknowledgementSchema.safeParse({ requestId: request.requestId, entityId, status });
  if (acknowledgement.success) window.dispatchEvent(new CustomEvent<PositionAcknowledgement>(ackEvent, { detail: acknowledgement.data }));
}
/** Events are requests, never proof. Only the matching live renderer can acknowledge. */
export function requestPositionRestore(kind: "note", detail: Omit<NotePositionRequest, "requestId">, signal: AbortSignal): Promise<PositionRestoreStatus>;
export function requestPositionRestore(kind: "pdf", detail: Omit<PdfPositionRequest, "requestId">, signal: AbortSignal): Promise<PositionRestoreStatus>;
export function requestPositionRestore(kind: "note" | "pdf", detail: Omit<NotePositionRequest, "requestId"> | Omit<PdfPositionRequest, "requestId">, signal: AbortSignal): Promise<PositionRestoreStatus> {
  const current = captureWorkspaceScope();
  if (signal.aborted || !current()) return Promise.resolve("cancelled");
  const entityId = "noteId" in detail ? detail.noteId : detail.documentId;
  if (!z.uuid().safeParse(entityId).success) return Promise.resolve("missing");
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (status: PositionRestoreStatus) => {
      if (settled) return;
      settled = true; clearTimeout(timer); window.removeEventListener(ackEvent, listener); signal.removeEventListener("abort", abort);
      resolve(current() && !signal.aborted ? status : "cancelled");
    };
    const listener = (event: Event) => {
      const value = acknowledgementSchema.safeParse(event instanceof CustomEvent ? event.detail : null);
      if (value.success && value.data.requestId === requestId && value.data.entityId === entityId) finish(value.data.status);
    };
    const abort = () => finish("cancelled");
    const timer = setTimeout(() => finish("timeout"), 9_000);
    window.addEventListener(ackEvent, listener); signal.addEventListener("abort", abort, { once: true });
    window.dispatchEvent(new CustomEvent(`personal-os:restore-${kind}-position`, { detail: { ...detail, requestId } }));
  });
}

"use client";

import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { WORKSPACE_SESSION_TTL_MS } from "@/lib/workspace-session";
import { registerFileStagingWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { safeFilename } from "./schemas";
export type StagingCandidate = { id: string; title: string; match: "content" | "possible" };
export type StagingPlan = { id: string; file: File; title: string; folderId: string | null; excluded: boolean; checksum?: string; candidates: StagingCandidate[]; checking: boolean; checkFailed: boolean };
export type FileStagingSession = { id: string; plans: StagingPlan[]; overflow: number; expiresAt: number; recoverable: boolean };
type OwnedSession = { value: FileStagingSession; current: () => boolean; clearDraft: (() => void) | null; timer: ReturnType<typeof setTimeout> };
let active: OwnedSession | null = null;
let snapshot: { id: string; count: number; expiresAt: number } | null = null;
const listeners = new Set<() => void>();
function emit() { snapshot = active && active.current() ? { id: active.value.id, count: active.value.plans.length, expiresAt: active.value.expiresAt } : null; listeners.forEach(listener => listener()); }
export const subscribeFileStaging = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getFileStagingSnapshot = () => snapshot;
export const getFileStagingServerSnapshot = () => null;
export function readFileStaging(id?: string): FileStagingSession | null { return active?.current() && active.value.expiresAt > Date.now() && (!id || id === active.value.id) ? active.value : null; }
export function discardFileStaging(id: string) {
  if (!active || active.value.id !== id) return;
  clearTimeout(active.timer); active.clearDraft?.(); active = null; emit();
}
function arm(session: OwnedSession) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => { if (active === session && session.value.expiresAt <= Date.now()) discardFileStaging(session.value.id); }, WORKSPACE_SESSION_TTL_MS);
}
export function beginFileStaging(files: readonly File[], folderId: string | null): { status: "created" | "existing"; session: FileStagingSession } {
  const existing = readFileStaging();
  if (existing) return { status: "existing", session: existing };
  if (active) discardFileStaging(active.value.id);
  const id = crypto.randomUUID(), clearDraft = registerFileStagingWorkflowDraft(id);
  const value: FileStagingSession = { id, plans: files.slice(0, 50).map(file => ({ id: crypto.randomUUID(), file, title: safeFilename(file.name), folderId, excluded: false, candidates: [], checking: true, checkFailed: false })), overflow: Math.max(0, files.length - 50), expiresAt: Date.now() + WORKSPACE_SESSION_TTL_MS, recoverable: Boolean(clearDraft) };
  const owned: OwnedSession = { value, current: captureWorkspaceScope(), clearDraft, timer: setTimeout(() => {}, 0) };
  active = owned; arm(owned); emit(); return { status: "created", session: value };
}
/** The original File identity cannot be replaced by metadata or a same-name file. */
export function updateFileStaging(id: string, plans: StagingPlan[]): boolean {
  const session = active;
  if (!session || !session.current() || session.value.id !== id || session.value.expiresAt <= Date.now() || plans.length !== session.value.plans.length || plans.length > 50) return false;
  const originals = new Map(session.value.plans.map(plan => [plan.id, plan.file]));
  if (new Set(plans.map(plan => plan.id)).size !== plans.length || plans.some(plan => originals.get(plan.id) !== plan.file || plan.title.length > 240 || plan.candidates.length > 4 || (plan.checksum && !/^[a-f0-9]{64}$/.test(plan.checksum)))) return false;
  session.value = { ...session.value, plans, expiresAt: Date.now() + WORKSPACE_SESSION_TTL_MS };
  session.clearDraft?.(); session.clearDraft = registerFileStagingWorkflowDraft(id); session.value.recoverable = Boolean(session.clearDraft);
  arm(session); emit(); return true;
}
registerWorkspaceScopeCleanup(() => { if (active) clearTimeout(active.timer); active = null; emit(); });

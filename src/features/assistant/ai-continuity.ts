"use client";

import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { aiResumeHref, aiResumeTargetSchema, type AiContinuitySnapshot, type AiResumeOutcome, type AiResumeTarget } from "./client-chat-contracts";
export { aiResumeHref } from "./client-chat-contracts";
export type { AiContinuitySnapshot, AiResumeOutcome, AiResumeTarget } from "./client-chat-contracts";

const entries = new Map<string, AiContinuitySnapshot>();
const listeners = new Set<() => void>();
const empty: readonly AiContinuitySnapshot[] = [];
let snapshot = empty;
function emit() { snapshot = [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt); for (const listener of listeners) listener(); }
export const subscribeAiContinuity = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAiContinuitySnapshot = () => snapshot;
export const getAiContinuityServerSnapshot = () => empty;
export function publishAiContinuity(value: AiContinuitySnapshot, current: () => boolean) {
  if (!current() || !aiResumeHref(value.target)) return;
  for (const [id, item] of entries) if (item.status !== "running" && item.expiresAt <= Date.now()) entries.delete(id);
  if (!entries.has(value.id) && entries.size >= 40) {
    const idle = [...entries.values()].reverse().find(item => item.status !== "running");
    if (!idle) return;
    entries.delete(idle.id);
  }
  entries.set(value.id, { ...value, label: value.label.slice(0, 100), phase: value.phase.slice(0, 160) }); emit();
}
export function removeAiContinuity(id: string, current: () => boolean) { if (current() && entries.delete(id)) emit(); }
export type AiResumeContext = { requestId: string; current: () => boolean };
type Consumer = { current: () => boolean; accepts: (target: AiResumeTarget) => boolean; resume: (target: AiResumeTarget, context: AiResumeContext) => Promise<boolean> };
const consumers = new Set<Consumer>();
type Pending = { id: string; target: AiResumeTarget; current: () => boolean; timer: ReturnType<typeof setTimeout>; inFlight: Promise<boolean> | null; wake: boolean; accepted: boolean };
let pending: Pending | null = null;
export const aiResumeAcknowledgedEvent = "personal-os:ai-resume-ack";
function finishPending(request: Pending, status: "accepted" | "missing") {
  if (pending !== request) return;
  clearTimeout(request.timer); pending = null;
  if (!request.current()) return;
  request.accepted = status === "accepted";
  window.dispatchEvent(new CustomEvent(aiResumeAcknowledgedEvent, { detail: { requestId: request.id, status } }));
}
function attemptResume(request: Pending): Promise<boolean> {
  if (pending !== request || !request.current()) return Promise.resolve(false);
  if (request.inFlight) return request.inFlight;
  const candidates = [...consumers].filter(consumer => consumer.current() && consumer.accepts(request.target));
  // A request owns one in-flight consumer. A readiness registration may wake it
  // after completion, but can never dispatch a concurrent read for the same ID.
  if (candidates.length !== 1) return Promise.resolve(false);
  const consumer = candidates[0];
  const current = () => pending === request && request.current() && consumer.current() && consumers.has(consumer);
  const operation = Promise.resolve().then(async () => {
    try {
      const ok = await consumer.resume(request.target, { requestId: request.id, current });
      if (!ok || !current()) return false;
      finishPending(request, "accepted"); return true;
    } catch { return false; }
  }).finally(() => {
    request.inFlight = null;
    if (request.wake && pending === request && request.current()) { request.wake = false; void attemptResume(request); }
  });
  request.inFlight = operation;
  return operation;
}
/** A mounted target reports layout readiness without replacing its registration. */
export function notifyAiResumeReady(accepts?: (target: AiResumeTarget) => boolean) {
  const request = pending;
  if (!request?.current() || (accepts && !accepts(request.target))) return;
  if (request.inFlight) request.wake = true;
  else void attemptResume(request);
}
export function registerAiResumeConsumer(accepts: Consumer["accepts"], resume: Consumer["resume"]) {
  const consumer = { current: captureWorkspaceScope(), accepts, resume };
  consumers.add(consumer);
  const request = pending;
  if (request?.current() && accepts(request.target)) {
    if (request.inFlight) request.wake = true;
    else void attemptResume(request);
  }
  return () => { consumers.delete(consumer); };
}
export async function resumeAiResult(input: AiResumeTarget): Promise<AiResumeOutcome> {
  const parsed = aiResumeTargetSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: "恢复目标无效，结果仍保留。" };
  const scope = captureWorkspaceScope(), navigation = captureNavigationIntent();
  const current = () => scope() && navigation();
  if (pending) clearTimeout(pending.timer);
  const request: Pending = { id: crypto.randomUUID(), target: parsed.data, current, timer: setTimeout(() => finishPending(request, "missing"), 10_000), inFlight: null, wake: false, accepted: false };
  pending = request;
  if (await attemptResume(request) || request.accepted) return { status: "accepted" };
  if (!current() || pending !== request) return { status: "missing", message: "恢复意图或工作区已变化，原结果保留。" };
  if (parsed.data.kind === "note-suggestion" || parsed.data.kind === "note-input" || parsed.data.kind === "note-history") window.dispatchEvent(new CustomEvent("personal-os:note-ai-open", { detail: { noteId: parsed.data.noteId } }));
  if (parsed.data.kind === "chat") {
    const identity = parsed.data.identity;
    if (identity.surface === "global") window.dispatchEvent(new Event("personal-os:agent-open"));
    else window.dispatchEvent(new CustomEvent("personal-os:assistant-open", { detail: { surface: identity.surface, ...(identity.surface === "career" ? { entityId: identity.experienceId } : {}) } }));
  }
  return { status: "pending", requestId: request.id };
}
registerWorkspaceScopeCleanup(() => { if (pending) clearTimeout(pending.timer); pending = null; consumers.clear(); entries.clear(); emit(); });

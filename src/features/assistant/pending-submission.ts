"use client";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
const eventName = "personal-os:agent-submit";
let queued: { id: string; query: string; expiresAt: number; current: () => boolean } | null = null;
/** An explicit Today action can precede the first lazy GlobalAgent mount. */
export function requestAssistantSubmission(query: string) {
  if (!query.trim() || query.length > 10_000) return;
  const scope = captureWorkspaceScope(), navigation = captureNavigationIntent();
  queued = { id: crypto.randomUUID(), query, expiresAt: Date.now() + 900_000, current: () => scope() && navigation() };
  window.dispatchEvent(new Event("personal-os:agent-open"));
  window.dispatchEvent(new CustomEvent(eventName, { detail: { requestId: queued.id } }));
}
export function takeAssistantSubmission() {
  const value = queued;
  if (!value) return null;
  queued = null;
  return value.current() && value.expiresAt > Date.now() ? value.query : null;
}
registerWorkspaceScopeCleanup(() => { queued = null; });

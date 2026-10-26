"use client";
import { workbenchViewStateSchema, type WorkbenchViewState } from "./contracts";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
type Kind = WorkbenchViewState["kind"];
type Adapter = { capture: () => WorkbenchViewState; restore: (state: WorkbenchViewState) => void };
type Registration = { token: symbol; current: () => boolean; adapter: Adapter };
const adapters = new Map<Kind, Registration>();
let pending: { token: symbol; current: () => boolean; state: WorkbenchViewState } | undefined;
registerWorkspaceScopeCleanup(() => { adapters.clear(); pending = undefined; });
const routeKind = (pathname: string): Kind | undefined => pathname === "/tasks" ? "tasks" : pathname === "/calendar" ? "calendar" : undefined;
function consume() {
  if (!pending) return;
  if (!pending.current()) { pending = undefined; return; }
  if (typeof window === "undefined" || routeKind(window.location.pathname) !== pending.state.kind) return;
  const registration = adapters.get(pending.state.kind);
  if (!registration?.current()) return;
  const state = pending.state;
  pending = undefined; // Consume before invoking React setters; later edits cannot replay it.
  registration.adapter.restore(state);
}
export function registerWorkbenchViewState(kind: Kind, adapter: Adapter): () => void {
  const token = Symbol(kind);
  adapters.set(kind, { token, current: captureWorkspaceScope(), adapter });
  consume();
  return () => { if (adapters.get(kind)?.token === token) adapters.delete(kind); };
}
export function captureWorkbenchViewState(pathname: string): WorkbenchViewState | undefined {
  const kind = routeKind(pathname);
  if (!kind || typeof window === "undefined" || routeKind(window.location.pathname) !== kind) return;
  const registration = adapters.get(kind);
  if (!registration?.current()) { adapters.delete(kind); return; }
  const parsed = workbenchViewStateSchema.safeParse(registration.adapter.capture());
  return parsed.success && parsed.data.kind === kind ? parsed.data : undefined;
}
/** Cancel the previous wait before navigation/replacement; only a matching mounted view consumes once. */
export function restoreWorkbenchViewState(state: WorkbenchViewState): () => void {
  const parsed = workbenchViewStateSchema.safeParse(state);
  pending = undefined;
  if (!parsed.success) return () => {};
  const token = Symbol("view-restore");
  pending = { token, state: parsed.data, current: captureWorkspaceScope() };
  consume();
  return () => { if (pending?.token === token) pending = undefined; };
}

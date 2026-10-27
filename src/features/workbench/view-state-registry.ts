"use client";
import { workbenchViewStateSchema, viewStateIdentity, viewStateMatchesHref, type WorkbenchViewState, type ViewStateOf } from "./view-state-contracts";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";

export type RestoreAck = { status: "applied" } | { status: "partial"; reason: "missing-record" | "changed-source" | "unavailable" } | { status: "cancelled" | "timeout" };
export type ApplyContext = { signal: AbortSignal; current: () => boolean };
type Kind = WorkbenchViewState["kind"];
type Adapter<K extends Kind> = {
  capture: () => ViewStateOf<K>;
  restore: (state: ViewStateOf<K>, context: ApplyContext) => void | RestoreAck | Promise<void | RestoreAck>;
  ready?: () => boolean;
};
type Registration = { token: symbol; current: () => boolean; capture: () => WorkbenchViewState; ready: () => boolean; apply: (state: WorkbenchViewState, context: ApplyContext) => Promise<RestoreAck> };
type Pending = { token: symbol; current: () => boolean; href: string; state: WorkbenchViewState; controller: AbortController; deadline: number; consumed: boolean; registrationToken?: symbol; complete: (ack: RestoreAck) => void };
const adapters = new Map<Kind, Registration>();
let pending: Pending | undefined;
const pathname = () => typeof window === "undefined" ? "" : window.location.pathname;
function cancelPending(ack: RestoreAck = { status: "cancelled" }) {
  const previous = pending; pending = undefined;
  if (previous) { previous.controller.abort(); previous.complete(ack); }
}
registerWorkspaceScopeCleanup(() => { cancelPending(); adapters.clear(); });
function consume() {
  const request = pending;
  if (!request || request.consumed) return;
  if (!request.current()) { cancelPending(); return; }
  if (Date.now() > request.deadline) { cancelPending({ status: "timeout" }); return; }
  if (pathname() !== request.href.split(/[?#]/)[0]) return;
  const registration = adapters.get(request.state.kind);
  if (!registration?.current() || !registration.ready()) return;
  const live = workbenchViewStateSchema.safeParse(registration.capture());
  if (!live.success || !viewStateMatchesHref(live.data, request.href) || viewStateIdentity(live.data) !== viewStateIdentity(request.state)) return;
  request.registrationToken = registration.token;
  request.consumed = true; // Claim before React setters; never replay after later input.
  const current = () => pending === request && request.current() && registration.current() && adapters.get(request.state.kind)?.token === registration.token && !request.controller.signal.aborted;
  void registration.apply(request.state, { signal: request.controller.signal, current }).then(ack => {
    if (!current()) return;
    pending = undefined; request.complete(ack);
  }).catch(() => { if (current()) { pending = undefined; request.complete({ status: "partial", reason: "unavailable" }); } });
}
export function registerWorkbenchViewState<K extends Kind>(kind: K, adapter: Adapter<K>): () => void {
  const token = Symbol(kind);
  const registration: Registration = {
    token, current: captureWorkspaceScope(), capture: adapter.capture, ready: adapter.ready ?? (() => true),
    apply: async (input, context) => {
      const parsed = workbenchViewStateSchema.safeParse(input);
      if (!parsed.success || parsed.data.kind !== kind || !context.current()) return { status: "cancelled" };
      // The checked runtime discriminant establishes the same member as Adapter<K>.
      const result = await adapter.restore(parsed.data as ViewStateOf<K>, context);
      return context.current() ? result ?? { status: "applied" } : { status: "cancelled" };
    },
  };
  const previous = adapters.get(kind);
  if (previous && pending?.registrationToken === previous.token) cancelPending();
  adapters.set(kind, registration); consume();
  return () => {
    if (adapters.get(kind)?.token === token) adapters.delete(kind);
    if (pending?.registrationToken === token) cancelPending();
  };
}
export function notifyWorkbenchViewReady() { consume(); }
export function captureWorkbenchViewState(path: string): WorkbenchViewState | undefined {
  if (path !== pathname()) return;
  for (const [kind, registration] of adapters) {
    if (!registration.current()) { adapters.delete(kind); continue; }
    if (!registration.ready()) continue;
    const value = workbenchViewStateSchema.safeParse(registration.capture());
    if (value.success && viewStateMatchesHref(value.data, path)) return value.data;
  }
}
/** Exact identity, one apply and a bounded acknowledgement; callers await before positions. */
export function restoreWorkbenchViewState(state: WorkbenchViewState, options: { href?: string; onSettled?: (ack: RestoreAck) => void } = {}): () => void {
  cancelPending();
  const parsed = workbenchViewStateSchema.safeParse(state);
  if (!parsed.success) { options.onSettled?.({ status: "partial", reason: "unavailable" }); return () => {}; }
  const href = options.href ?? ("pathname" in parsed.data ? parsed.data.pathname : parsed.data.kind === "travel" ? `/travel/${parsed.data.tripId}` : parsed.data.kind === "shopping" ? parsed.data.itemId ? `/shopping/${parsed.data.itemId}` : "/shopping" : parsed.data.kind === "investment" ? "/investments" : `/${parsed.data.kind}`);
  if (!viewStateMatchesHref(parsed.data, href)) { options.onSettled?.({ status: "partial", reason: "unavailable" }); return () => {}; }
  const token = Symbol("view-restore");
  const complete = (ack: RestoreAck) => { clearInterval(timer); options.onSettled?.(ack); };
  const timer = setInterval(() => {
    if (pending?.token !== token) { if (timer) clearInterval(timer); return; }
    if (!pending.current()) cancelPending();
    else if (Date.now() > pending.deadline) cancelPending({ status: "timeout" });
    else consume();
  }, 50);
  pending = { token, href, state: parsed.data, current: captureWorkspaceScope(), controller: new AbortController(), consumed: false, deadline: Date.now() + 10_000, complete };
  consume();
  return () => { if (pending?.token === token) cancelPending(); else if (timer) clearInterval(timer); };
}

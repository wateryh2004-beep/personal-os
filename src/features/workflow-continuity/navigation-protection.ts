"use client";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
import { beginNavigationIntent } from "./navigation-intent";
type Protection = { current: () => boolean; beforeLeave: () => Promise<boolean>; lease: AbortController };
const protections = new Set<Protection>();
let request = 0;
let active: AbortController | null = null;
registerWorkspaceScopeCleanup(() => { request += 1; active?.abort(); active = null; protections.clear(); });
/** A mounted editor owns its real save/conflict decision; no body enters this registry. */
export function registerWorkflowNavigationProtection(beforeLeave: () => Promise<boolean>) {
  const registration = { current: captureWorkspaceScope(), beforeLeave, lease: new AbortController() };
  protections.add(registration);
  return () => { protections.delete(registration); registration.lease.abort(); };
}
/** New tray/scene navigation may not race a dirty or conflicting editor. */
export async function prepareWorkflowNavigation(href: string): Promise<boolean> {
  const destination = safeWorkbenchHref(href);
  if (!destination) return false;
  active?.abort();
  const controller = new AbortController(); active = controller;
  const timer = setTimeout(() => controller.abort(), 10_000);
  const currentScope = captureWorkspaceScope(), generation = ++request;
  const source = window.location.href;
  let intentCurrent = () => true;
  const current = () => !controller.signal.aborted && currentScope() && intentCurrent() && request === generation && source === window.location.href;
  // This is the caller's preflight, not a request for the shell to push a route.
  // Listeners may still veto it; only the caller commits after every save guard.
  const event = new CustomEvent("personal-os:navigation-start", { cancelable: true, detail: { href: destination, phase: "prepare" } });
  if (!window.dispatchEvent(event)) { clearTimeout(timer); return false; }
  intentCurrent = beginNavigationIntent();
  const stopped = new Promise<false>(resolve => { if (controller.signal.aborted) resolve(false); else controller.signal.addEventListener("abort", () => resolve(false), { once: true }); });
  try {
    for (const registration of [...protections]) {
      if (!registration.current() || !protections.has(registration)) continue;
      const unmounted = new Promise<false>(resolve => {
        if (registration.lease.signal.aborted) resolve(false);
        else registration.lease.signal.addEventListener("abort", () => resolve(false), { once: true });
      });
      try { if (!await Promise.race([registration.beforeLeave(), stopped, unmounted])) return false; } catch { return false; }
      if (!current() || !registration.current() || !protections.has(registration)) return false;
    }
    return current();
  } finally { clearTimeout(timer); if (active === controller) active = null; }
}

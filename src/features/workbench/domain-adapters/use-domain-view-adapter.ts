"use client";
import { useLayoutEffect, useRef } from "react";
import { registerWorkbenchViewState, notifyWorkbenchViewReady, type ApplyContext, type RestoreAck } from "../view-state-registry";
import type { ViewStateOf, WorkbenchViewState } from "../view-state-contracts";
export type { ApplyContext, RestoreAck } from "../view-state-registry";

/** Mounted controller callbacks only; no private body or stale UI closure is cached. */
export function useDomainViewAdapter<K extends WorkbenchViewState["kind"]>(options: {
  kind: K; pathname: string; ready: boolean;
  capture: () => ViewStateOf<K>;
  restore: (state: ViewStateOf<K>, context: ApplyContext) => RestoreAck | Promise<RestoreAck>;
}) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; notifyWorkbenchViewReady(); });
  useLayoutEffect(() => registerWorkbenchViewState(options.kind, {
    ready: () => latest.current.ready && typeof window !== "undefined" && window.location.pathname === latest.current.pathname,
    capture: () => latest.current.capture(),
    restore: (state, context) => latest.current.restore(state, context),
  }), [options.kind, options.pathname]);
}
/** Wait for the setters' DOM commit, while preserving the one restore lease. */
export function waitForViewLayout(context: ApplyContext): Promise<boolean> {
  return new Promise(resolve => {
    if (!context.current() || context.signal.aborted) { resolve(false); return; }
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); context.signal.removeEventListener("abort", abort); resolve(context.current() && !context.signal.aborted); };
    const abort = () => { cancelAnimationFrame(frame); resolve(false); };
    context.signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
}

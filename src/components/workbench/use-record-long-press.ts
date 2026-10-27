"use client";

import { useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";

export const recordInteractiveTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("a,button,input,textarea,select,summary,label,[role=button],[role=menuitem],[contenteditable=true],[draggable=true],.cm-editor,[data-drag-handle]"));
/** Touch selection lives only on row whitespace; native scrolling keeps ownership. */
export function useRecordLongPress(enabled: boolean, select: () => void, selectionActive: boolean) {
  const callback = useRef(select);
  useLayoutEffect(() => { callback.current = select; }, [select]);
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    const cancel = () => { cleanup.current?.(); cleanup.current = null; suppressClickUntil.current = 0; };
    const unregister = registerWorkspaceScopeCleanup(cancel);
    return () => { cancel(); unregister(); };
  }, []);
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      cleanup.current?.();
      suppressClickUntil.current = 0;
      if (!enabled || !event.isPrimary || event.button !== 0 || !["touch", "pen"].includes(event.pointerType) || recordInteractiveTarget(event.target)) return;
      const { clientX, clientY, pointerId } = event;
      let held = false;
      const timer = window.setTimeout(() => { held = true; suppressClickUntil.current = Date.now() + 1_000; callback.current(); }, 450);
      const finish = () => { clearTimeout(timer); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", cancel); window.removeEventListener("scroll", cancel, true); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", keydown); cleanup.current = null; };
      const cancel = () => { suppressClickUntil.current = 0; finish(); };
      const move = (next: PointerEvent) => { if (next.pointerId === pointerId && Math.hypot(next.clientX - clientX, next.clientY - clientY) > 8) cancel(); };
      const end = (next: PointerEvent) => { if (next.pointerId === pointerId) { if (held) suppressClickUntil.current = Date.now() + 700; finish(); } };
      const keydown = (next: KeyboardEvent) => { if (next.key === "Escape") cancel(); };
      cleanup.current = cancel;
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", cancel); window.addEventListener("scroll", cancel, true); window.addEventListener("blur", cancel); window.addEventListener("keydown", keydown);
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (recordInteractiveTarget(event.target)) return;
      if (suppressClickUntil.current > Date.now()) { suppressClickUntil.current = 0; event.preventDefault(); event.stopPropagation(); return; }
      if (enabled && selectionActive) { event.preventDefault(); event.stopPropagation(); callback.current(); }
    },
  };
}

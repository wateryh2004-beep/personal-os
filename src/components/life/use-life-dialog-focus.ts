"use client";
import { useRef } from "react";

/** Manual field dialogs keep their launcher; a removed row returns to its list. */
export function useLifeDialogFocus() {
  const source = useRef<{ element: HTMLElement | null; href: string } | null>(null);
  return {
    onOpenAutoFocus() {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      source.current = { element: active?.closest('[role="dialog"]') ? null : active, href: window.location.href };
    },
    onCloseAutoFocus(event: Event) {
      event.preventDefault();
      if (!source.current || source.current.href !== window.location.href) return;
      const target = source.current.element?.isConnected ? source.current.element : document.querySelector<HTMLElement>("[data-life-return-focus]");
      target?.focus({ preventScroll: true });
    },
  };
}

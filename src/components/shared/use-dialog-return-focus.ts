"use client";

import { useEffect, useRef } from "react";

/** Manual dialogs return to their actual launcher, never a stale route/control. */
export function useDialogReturnFocus() {
  const launcher = useRef<{ element: HTMLElement; href: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const abandon = () => { launcher.current = null; };
    const onNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && !anchor.hasAttribute("download") && (!anchor.target || anchor.target === "_self") && anchor.href !== window.location.href) abandon();
    };
    window.addEventListener("personal-os:navigation-start", abandon);
    document.addEventListener("click", onNavigation);
    return () => {
      mounted.current = false;
      abandon();
      window.removeEventListener("personal-os:navigation-start", abandon);
      document.removeEventListener("click", onNavigation);
    };
  }, []);

  const rememberTrigger = (element: HTMLElement) => {
    launcher.current = { element, href: window.location.href };
  };
  const restoreFocus = (event: Event) => {
    // Radix has no trigger ref for these manually controlled dialogs.
    event.preventDefault();
    const target = launcher.current;
    launcher.current = null;
    if (!mounted.current || !target?.element.isConnected || target.href !== window.location.href) return;
    const active = document.activeElement;
    // Respect newer focus established outside the closing dialog.
    if (active && active !== document.body && !(event.target instanceof Element && event.target.contains(active))) return;
    target.element.focus({ preventScroll: true });
  };
  return { rememberTrigger, restoreFocus };
}

"use client";

import { useEffect, useRef } from "react";

const historyMarkerKey = "__personalOsMobileLayer";

function isPhoneViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

/** A route-changing dismissal owns its navigation; cleanup must not also Back. */
export function releaseMobileBackLayerForNavigation(layerName: string) {
  const state = window.history.state as Record<string, unknown> | null;
  const marker = state?.[historyMarkerKey];
  if (typeof marker !== "string" || !marker.startsWith(`${layerName}:`)) return;
  const nextState = { ...state };
  delete nextState[historyMarkerKey];
  window.history.replaceState(nextState, "", window.location.href);
}

/**
 * Makes Android/browser Back dismiss the top mobile overlay before leaving the route.
 * Each open layer owns one same-URL history entry, so nested overlays unwind in order.
 * Return false from onDismiss to keep a busy layer open and restore its Back entry.
 */
export function useMobileBackLayer(open: boolean, onDismiss: () => void | boolean, layerName: string) {
  const dismissRef = useRef(onDismiss);
  const activeRef = useRef(false);
  const markerRef = useRef<string | null>(null);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!open || !isPhoneViewport()) return;

    const marker = `${layerName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};

    const openedAtUrl = window.location.href;
    markerRef.current = marker;
    activeRef.current = true;
    window.history.pushState({ ...currentState, [historyMarkerKey]: marker }, "", window.location.href);

    const onPopState = (event: PopStateEvent) => {
      if (!activeRef.current) return;
      const nextMarker = event.state && typeof event.state === "object"
        ? (event.state as Record<string, unknown>)[historyMarkerKey]
        : undefined;
      if (nextMarker === marker) return;

      if (dismissRef.current() === false) {
        // Back has already consumed our entry. Restore that same layer over the
        // current route so another Back cannot escape an in-flight operation.
        const restoredState = window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
        window.history.pushState({ ...restoredState, [historyMarkerKey]: marker }, "", window.location.href);
        return;
      }
      activeRef.current = false;
      markerRef.current = null;
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!activeRef.current || markerRef.current !== marker) return;

      const state = window.history.state as Record<string, unknown> | null;
      const currentMarker = state?.[historyMarkerKey];
      activeRef.current = false;
      markerRef.current = null;
      if (currentMarker === marker) {
        if (window.location.href === openedAtUrl) window.history.back();
        else {
          // A same-route record change may replace the overlay entry's URL.
          // It no longer owns a same-URL Back step: retain the current route
          // and Next's history state, removing only this layer's marker.
          const nextState = { ...state };
          delete nextState[historyMarkerKey];
          window.history.replaceState(nextState, "", window.location.href);
        }
      }
    };
  }, [layerName, open]);
}

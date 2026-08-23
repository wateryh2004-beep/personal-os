"use client";

import { useEffect, useRef } from "react";

const historyMarkerKey = "__personalOsMobileLayer";

function isPhoneViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

/**
 * Makes Android/browser Back dismiss the top mobile overlay before leaving the route.
 * Each open layer owns one same-URL history entry, so nested overlays unwind in order.
 */
export function useMobileBackLayer(open: boolean, onDismiss: () => void, layerName: string) {
  const dismissRef = useRef(onDismiss);
  const activeRef = useRef(false);
  const markerRef = useRef<string | null>(null);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open || !isPhoneViewport()) return;

    const marker = `${layerName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};

    markerRef.current = marker;
    activeRef.current = true;
    window.history.pushState({ ...currentState, [historyMarkerKey]: marker }, "", window.location.href);

    const onPopState = (event: PopStateEvent) => {
      if (!activeRef.current) return;
      const nextMarker = event.state && typeof event.state === "object"
        ? (event.state as Record<string, unknown>)[historyMarkerKey]
        : undefined;
      if (nextMarker === marker) return;

      activeRef.current = false;
      markerRef.current = null;
      dismissRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!activeRef.current || markerRef.current !== marker) return;

      const state = window.history.state as Record<string, unknown> | null;
      const currentMarker = state?.[historyMarkerKey];
      activeRef.current = false;
      markerRef.current = null;
      if (currentMarker === marker) window.history.back();
    };
  }, [layerName, open]);
}

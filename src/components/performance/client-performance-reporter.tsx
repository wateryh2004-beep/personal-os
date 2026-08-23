"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import {
  isClientMetricName,
  normalizeMetricRoute,
  viewportBucket,
  type ClientMetricName,
  type ClientMetricRoute,
} from "@/lib/performance/client-metrics";

type MetricPayload = {
  kind: "web-vital" | "navigation";
  name: ClientMetricName;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  route: ClientMetricRoute;
  displayMode: "standalone" | "browser";
  viewport: ReturnType<typeof viewportBucket>;
};

function deliver(payload: MetricPayload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const accepted = navigator.sendBeacon("/api/perf", new Blob([body], { type: "application/json" }));
    if (accepted) return;
  }
  void fetch("/api/perf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

function commonFields(route: ClientMetricRoute) {
  return {
    route,
    displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" as const : "browser" as const,
    viewport: viewportBucket(window.innerWidth),
  };
}

export function ClientPerformanceReporter() {
  const pathname = usePathname();
  const routeRef = useRef<ClientMetricRoute | null>(normalizeMetricRoute(pathname));
  routeRef.current = normalizeMetricRoute(pathname);

  useReportWebVitals((metric) => {
    const route = routeRef.current;
    if (!route || !isClientMetricName(metric.name)) return;
    const rating = metric.rating === "good" || metric.rating === "needs-improvement" || metric.rating === "poor"
      ? metric.rating
      : undefined;
    deliver({
      kind: "web-vital",
      name: metric.name,
      value: Math.round(metric.value * 100) / 100,
      rating,
      ...commonFields(route),
    });
  });

  useEffect(() => {
    const onNavigationMetric = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; durationMs?: number; href?: string }>).detail;
      if (!detail || !detail.name || !isClientMetricName(detail.name) || typeof detail.durationMs !== "number") return;
      const route = normalizeMetricRoute(detail.href ?? pathname);
      if (!route) return;
      deliver({
        kind: "navigation",
        name: detail.name,
        value: Math.max(0, Math.round(detail.durationMs * 100) / 100),
        ...commonFields(route),
      });
    };
    window.addEventListener("personal-os:perf-measure", onNavigationMetric);
    return () => window.removeEventListener("personal-os:perf-measure", onNavigationMetric);
  }, [pathname]);

  return null;
}

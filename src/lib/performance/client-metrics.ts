export const clientMetricNames = [
  "CLS",
  "FCP",
  "INP",
  "LCP",
  "TTFB",
  "navigation-ready",
  "route-commit",
] as const;

export type ClientMetricName = (typeof clientMetricNames)[number];
export type ClientMetricRoute = "/today" | "/calendar" | "/tasks" | "/notes" | "/notes/[id]" | "/briefing";
export type ViewportBucket = "360" | "390" | "412" | "430" | "wide";

export function normalizeMetricRoute(pathname: string): ClientMetricRoute | null {
  if (pathname === "/today" || pathname === "/calendar" || pathname === "/tasks" || pathname === "/notes" || pathname === "/briefing") {
    return pathname;
  }
  if (/^\/notes\/[0-9a-f-]{36}$/i.test(pathname)) return "/notes/[id]";
  return null;
}

export function viewportBucket(width: number): ViewportBucket {
  if (width <= 360) return "360";
  if (width <= 390) return "390";
  if (width <= 412) return "412";
  if (width <= 430) return "430";
  return "wide";
}

export function isClientMetricName(value: string): value is ClientMetricName {
  return (clientMetricNames as readonly string[]).includes(value);
}

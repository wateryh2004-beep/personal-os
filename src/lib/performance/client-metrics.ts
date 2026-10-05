export const clientMetricNames = [
  "CLS",
  "FCP",
  "INP",
  "LCP",
  "TTFB",
  "route-commit",
  "workspace-data-ready",
  "initial-workspace-ready",
] as const;

export type ClientMetricName = (typeof clientMetricNames)[number];
export const clientMetricRoutes = ["/today", "/calendar", "/tasks", "/notes", "/notes/[id]", "/briefing", "/career", "/career/interview"] as const;
export type ClientMetricRoute = (typeof clientMetricRoutes)[number];
export type ViewportBucket = "360" | "390" | "412" | "430" | "wide";

export function normalizeMetricRoute(pathname: string): ClientMetricRoute | null {
  const route = pathname.split(/[?#]/, 1)[0];
  if (route === "/today" || route === "/calendar" || route === "/tasks" || route === "/notes" || route === "/briefing") {
    return route;
  }
  if (/^\/notes\/[0-9a-f-]{36}$/i.test(route)) return "/notes/[id]";
  if (route === "/career/interview" || route.startsWith("/career/interview/")) return "/career/interview";
  if (route === "/career" || route.startsWith("/career/")) return "/career";
  return null;
}

/** A resource can finish before the shell's pathname effect; use its own identity. */
export function workspaceMetricRoute(workspace?: string): ClientMetricRoute | null {
  if (workspace === "today" || workspace === "calendar" || workspace === "tasks" || workspace === "notes") return `/${workspace}`;
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

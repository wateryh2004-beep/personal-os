export type WorkspacePrefetchHref = "/today" | "/calendar" | "/tasks" | "/notes";

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

/**
 * Background warming is deliberately narrow. Intent-driven hover/focus
 * prefetch remains broader and can refresh stale data immediately before a
 * navigation.
 */
export function backgroundWorkspacePrefetchTargets(pathname: string): WorkspacePrefetchHref[] {
  if (pathname === "/today") return ["/calendar", "/tasks"];
  if (pathname === "/calendar") return ["/today", "/tasks"];
  if (pathname === "/tasks") return ["/today", "/calendar"];
  if (pathname === "/notes" || pathname.startsWith("/notes/")) return ["/today"];
  return ["/today"];
}

export function shouldSkipBackgroundPrefetch(connection?: NetworkInformationLike | null) {
  return Boolean(
    connection?.saveData
      || connection?.effectiveType === "slow-2g"
      || connection?.effectiveType === "2g",
  );
}

/** Background work should fill an empty cache, not refresh unrelated stale data. */
export function shouldBackgroundWarmData(data: unknown) {
  return data === undefined;
}

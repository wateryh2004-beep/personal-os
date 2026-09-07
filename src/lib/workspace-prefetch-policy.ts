export type WorkspacePrefetchHref = "/today" | "/calendar" | "/tasks" | "/notes";

const workspacePrefetchHrefs: readonly WorkspacePrefetchHref[] = [
  "/today",
  "/calendar",
  "/tasks",
  "/notes",
];

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

export function isWorkspacePrefetchHref(href: string): href is WorkspacePrefetchHref {
  return workspacePrefetchHrefs.includes(href as WorkspacePrefetchHref);
}

/**
 * Idle warming keeps the four primary workspaces ready while avoiding a
 * redundant fetch for the workspace that is already visible.
 */
export function backgroundWorkspacePrefetchTargets(pathname: string): WorkspacePrefetchHref[] {
  return workspacePrefetchHrefs.filter(
    (href) => pathname !== href && !pathname.startsWith(`${href}/`),
  );
}

/**
 * All speculative work, including intent-driven route prefetch, yields to an
 * explicit data-saver preference or a clearly constrained connection.
 */
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

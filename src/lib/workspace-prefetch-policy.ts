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

/** CPU-idle does not mean the active workspace's network request has finished. */
export function afterActiveWorkspaceRead(
  resource: {
    get: () => { data?: unknown; promise?: Promise<unknown>; error?: Error };
    subscribe: (listener: () => void) => () => void;
  },
  ready: () => void,
) {
  let finished = false;
  let unsubscribe = () => {};
  const inspect = () => {
    const snapshot = resource.get();
    if (finished || snapshot.promise || (snapshot.data === undefined && !snapshot.error)) return;
    finished = true;
    unsubscribe();
    ready();
  };
  unsubscribe = resource.subscribe(inspect);
  inspect();
  return () => { finished = true; unsubscribe(); };
}

export function activeWorkspacePrefetchHref(pathname: string): WorkspacePrefetchHref | undefined {
  return workspacePrefetchHrefs.find((href) => pathname === href || pathname.startsWith(`${href}/`));
}

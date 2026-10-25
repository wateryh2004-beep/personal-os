import "server-only";

// These two RPCs have audited SELECT-only bodies. POST is otherwise never
// replayed: a failed mutation may already have committed at the provider.
const readRpcPaths = new Set([
  "/rest/v1/rpc/list_notes_workspace",
  "/rest/v1/rpc/search_personal_os",
]);

/** One recovery per request-scoped client, shared by concurrent failed reads. */
export function withSupabaseReadRecovery(
  baseFetch: typeof fetch,
  supabaseUrl: string,
  revalidateToken: (token: string) => Promise<boolean>,
): typeof fetch {
  const origin = new URL(supabaseUrl).origin;
  let recovery: { token: string; verified: Promise<boolean> } | undefined;

  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status !== 401) return response;
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const readRpc = method === "POST" && readRpcPaths.has(url.pathname)
      && !(input instanceof Request) && typeof init?.body === "string";
    if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/")
      || (url.pathname.startsWith("/rest/v1/rpc/") && !readRpcPaths.has(url.pathname))
      || (method !== "GET" && !readRpc)) return response;
    const requestHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => requestHeaders.set(name, value));
    const authorization = requestHeaders.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return response;
    try {
      const error: unknown = await response.clone().json();
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "PGRST303") return response;
    } catch { return response; }

    // Never retry a permission failure, generic 401, unknown RPC, network
    // error, or failed recovery. No privileged client or unverified JWT fallback.
    const token = authorization.slice("Bearer ".length);
    recovery ??= { token, verified: revalidateToken(token).catch(() => false) };
    if (recovery.token !== token || !await recovery.verified) return response;
    // Replay the same credentials and exact read. Refresh-token rotation is
    // owned by Proxy, where new cookies can actually reach the browser.
    return baseFetch(input, init);
  };
}

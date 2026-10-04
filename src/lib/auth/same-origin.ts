/** Next may reconstruct request.url with its internal listening hostname. Match
 * the browser's Origin against the configured public origin, or the real Host
 * header when no canonical origin is configured. Never trust forwarded-host.
 * Host is supplied by the browser and cannot be overridden by cross-site JS. */
export function hasSameOrigin(request: Request, configuredOrigin?: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const source = new URL(origin);
    if (source.origin !== origin || !["http:", "https:"].includes(source.protocol)) return false;
    if (configuredOrigin) return source.origin === new URL(configuredOrigin).origin;
    const internal = new URL(request.url);
    const host = request.headers.get("host");
    // A single exact authority only; reject malformed/forwarded lists and paths.
    if (host && /[\s,/@\\?#]/.test(host)) return false;
    const expected = host ? new URL(`${internal.protocol}//${host}`) : internal;
    return source.origin === expected.origin;
  } catch { return false; }
}

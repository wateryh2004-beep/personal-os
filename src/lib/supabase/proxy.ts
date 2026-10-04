import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner";
import { env, isSupabaseConfigured } from "@/lib/env";

/** Request-only identity bridge. These headers are always removed from the
 * browser-supplied request, then set again only after this proxy validates the
 * Supabase JWT. They never become response headers or client-visible state. */
export const verifiedOwnerIdHeader = "x-personal-os-verified-owner-id";
export const verifiedOwnerEmailHeader = "x-personal-os-verified-owner-email";

// The manifest is fetched by Chrome's installability check outside the signed-in
// application flow. Password recovery must also be reachable without a session.
const publicPaths = new Set(["/login", "/forgot-password", "/manifest.webmanifest"]);
const independentGatewayPaths = new Set([
  "/.well-known/oauth-protected-resource/api/mcp",
  "/.well-known/oauth-authorization-server",
  "/api/oauth/authorize",
  "/api/oauth/token",
  "/api/oauth/revoke",
  "/api/mcp",
]);
const authCallbackPaths = ["/api/auth/callback", "/api/integrations/microsoft/callback"];

export function isIndependentGatewayPath(pathname: string) {
  return independentGatewayPaths.has(pathname);
}

export function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname === "/.well-known/oauth-protected-resource/api/mcp" || pathname === "/.well-known/oauth-authorization-server";
}

export function isAuthCallbackPath(pathname: string) {
  return authCallbackPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * App routes are private by default. API routes authenticate in their route
 * handlers so fetch callers receive JSON 401/403 instead of an HTML redirect.
 */
export function isPrivateAppPath(pathname: string) {
  return !isPublicPath(pathname) && !pathname.startsWith("/api/");
}

// Backwards-compatible name for existing callers while paths migrate.
export const isProtectedApplicationPath = isPrivateAppPath;

export function safeRedirectPath(value: string | null | undefined, fallback = "/today") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\\\u0000-\u001f\u007f]|%5c/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://personal-os.local");
    // An already-authenticated login page redirects to this destination; a
    // return to login itself would loop, including its normalized variants.
    if (decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase() === "/login") return fallback;
    return url.origin === "https://personal-os.local" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function copySessionCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().filter((cookie) => cookie.name.startsWith("sb-")).forEach((cookie) => {
    response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  });
  return response;
}

function loginRedirect(request: NextRequest, error?: "configuration" | "not-authorized") {
  const url = new URL("/login", request.url);
  if (error) url.searchParams.set("error", error);
  url.searchParams.set("next", safeRedirectPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

function attachPrivateProxyTiming(
  response: NextResponse,
  startedAt: number,
  authMs?: number,
) {
  const totalMs = performance.now() - startedAt;
  const timing = [
    authMs === undefined ? null : `proxy_auth;dur=${authMs.toFixed(1)}`,
    `proxy_total;dur=${totalMs.toFixed(1)}`,
  ].filter(Boolean).join(", ");
  response.headers.set("Server-Timing", timing);
  if (process.env.VERCEL_ENV || process.env.PERF_DEBUG === "true") {
    console.info(JSON.stringify({
      type: "proxy_latency",
      status: response.status,
      authMs: authMs === undefined ? undefined : Math.round(authMs),
      totalMs: Math.round(totalMs),
      region: process.env.VERCEL_REGION ?? null,
    }));
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  const proxyStartedAt = performance.now();
  const pathname = request.nextUrl.pathname;
  const privateAppPath = isPrivateAppPath(pathname);
  // Do not let a client forge the fast-path identity consumed by Server
  // Components and API handlers later in this same proxied request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(verifiedOwnerIdHeader);
  requestHeaders.delete(verifiedOwnerEmailHeader);

  // These exact protocol endpoints authenticate in their own handlers. A
  // browser session must neither be required nor injected into Codex OAuth/MCP.
  // Consent decisions remain on the normal authenticated-owner path.
  if (isIndependentGatewayPath(pathname)) return NextResponse.next({ request: { headers: requestHeaders } });

  if (!isSupabaseConfigured) {
    if (privateAppPath) return attachPrivateProxyTiming(loginRedirect(request, "configuration"), proxyStartedAt);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        // Keep the refreshed request cookies while retaining the sanitized
        // header set. Reusing the original request would restore forged owner
        // headers on refreshed non-owner API requests.
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
        else requestHeaders.delete("cookie");
        response = copySessionCookies(response, NextResponse.next({ request: { headers: requestHeaders } }));
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const authStartedAt = performance.now();
  const { data, error } = await supabase.auth.getClaims();
  const authMs = performance.now() - authStartedAt;
  const email = data?.claims.email as string | undefined;
  const isOwner = !error && Boolean(data?.claims.sub) && isOwnerEmail(email);

  if (privateAppPath && !isOwner) {
    const redirectResponse = loginRedirect(request, data?.claims.sub ? "not-authorized" : undefined);
    copySessionCookies(response, redirectResponse);
    const cleared = clearSupabaseCookies(request, redirectResponse);
    return attachPrivateProxyTiming(cleared, proxyStartedAt, authMs);
  }

  if (isOwner && data?.claims.sub && email) {
    // Preserve any refreshed auth cookies generated above while passing the
    // verified identity to the downstream route. This removes duplicate
    // remote getClaims() calls without weakening the authorization boundary.
    requestHeaders.set(verifiedOwnerIdHeader, data.claims.sub);
    requestHeaders.set(verifiedOwnerEmailHeader, email);
    response = copySessionCookies(response, NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (isPublicPath(pathname) && data?.claims.sub) {
    if (isOwner) {
      const next = pathname === "/login" ? safeRedirectPath(request.nextUrl.searchParams.get("next")) : "/today";
      const redirectResponse = NextResponse.redirect(new URL(next, request.url));
      return copySessionCookies(response, redirectResponse);
    }
    // A non-owner never gets an authenticated login response. The response
    // clears stale session cookies; the next request is fully anonymous. A
    // request-only header lets the Login Server Component show a safe notice
    // without exposing configuration or persisting authorization in storage.
    const headers = new Headers(requestHeaders);
    headers.set("x-personal-os-auth-notice", "not-authorized");
    const unauthorizedLoginResponse = NextResponse.next({ request: { headers } });
    copySessionCookies(response, unauthorizedLoginResponse);
    return clearSupabaseCookies(request, unauthorizedLoginResponse);
  }

  if (privateAppPath || isPublicPath(pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return privateAppPath
    ? attachPrivateProxyTiming(response, proxyStartedAt, authMs)
    : response;
}

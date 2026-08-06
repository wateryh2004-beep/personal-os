import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner";
import { env, isSupabaseConfigured } from "@/lib/env";

const publicPaths = new Set(["/login"]);
const authCallbackPaths = ["/api/auth/callback", "/api/integrations/microsoft/callback"];

export function isPublicPath(pathname: string) {
  return publicPaths.has(pathname);
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
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\\\")) return fallback;
  try {
    const url = new URL(value, "https://personal-os.local");
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
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const privateAppPath = isPrivateAppPath(pathname);

  if (!isSupabaseConfigured) {
    if (privateAppPath) return loginRedirect(request, "configuration");
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;
  const isOwner = !error && Boolean(data?.claims.sub) && isOwnerEmail(email);

  if (privateAppPath && !isOwner) {
    const redirectResponse = loginRedirect(request, data?.claims.sub ? "not-authorized" : undefined);
    copySessionCookies(response, redirectResponse);
    return clearSupabaseCookies(request, redirectResponse);
  }

  if (isPublicPath(pathname) && data?.claims.sub) {
    if (isOwner) {
      const redirectResponse = NextResponse.redirect(new URL("/today", request.url));
      return copySessionCookies(response, redirectResponse);
    }
    // A non-owner never gets an authenticated login response. The response
    // clears stale session cookies; the next request is fully anonymous. A
    // request-only header lets the Login Server Component show a safe notice
    // without exposing configuration or persisting authorization in storage.
    const headers = new Headers(request.headers);
    headers.set("x-personal-os-auth-notice", "not-authorized");
    const unauthorizedLoginResponse = NextResponse.next({ request: { headers } });
    copySessionCookies(response, unauthorizedLoginResponse);
    return clearSupabaseCookies(request, unauthorizedLoginResponse);
  }

  if (privateAppPath || isPublicPath(pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}

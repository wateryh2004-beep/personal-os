import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner";
import { env, isSupabaseConfigured } from "@/lib/env";

export function isProtectedApplicationPath(pathname: string) {
  return pathname !== "/login" && !pathname.startsWith("/api/");
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured) {
    if (isProtectedApplicationPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=configuration";
      return NextResponse.redirect(url);
    }
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

  if (isProtectedApplicationPath(request.nextUrl.pathname)) {
    const email = data?.claims.email as string | undefined;
    if (error || !data?.claims.sub || !isOwnerEmail(email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = data?.claims.sub ? "?error=not-authorized" : "";
      const redirectResponse = NextResponse.redirect(url);
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}

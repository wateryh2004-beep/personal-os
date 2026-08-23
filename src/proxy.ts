import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// `src/app` is the application's route root, so Next.js 16 discovers this
// convention file from `src/` rather than the repository root.
export async function proxy(request: NextRequest) {
  // The browser E2E harness is fixture-only and compiled behind an explicit CI
  // environment flag. Production does not set it, and the route itself also
  // returns notFound() without the flag.
  if (process.env.E2E_MOBILE_HARNESS === "1" && request.nextUrl.pathname === "/mobile-native-e2e") {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  // Service worker and generic offline fallback contain no user data and must be
  // fetchable before an authenticated app page can be controlled offline.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

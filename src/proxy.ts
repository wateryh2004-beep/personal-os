import { NextResponse, type NextRequest } from "next/server";
import { isContinuousFixtureRequest } from "@/features/testing/continuous-fixture-gate";
import { isContinuousFixturePath, isContinuousFixtureApi } from "@/features/testing/continuous-fixture-routes";
import { updateSession } from "@/lib/supabase/proxy";

// `src/app` is the application's route root, so Next.js 16 discovers this
// convention file from `src/` rather than the repository root.
export async function proxy(request: NextRequest) {
  if (isContinuousFixtureRequest(request.url, request.headers.get("cookie"))) {
    const path = request.nextUrl.pathname;
    // Never reach a real Next Action/provider/DB boundary in this realm.
    if (request.headers.has("next-action")) return NextResponse.json({ error: "fixture_next_action_forbidden" }, { status: 403 });
    if (path.startsWith("/api/continuous-workflows-fixture/")) return NextResponse.next();
    if (path.startsWith("/api/")) {
      if (!isContinuousFixtureApi(path)) return NextResponse.json({ error: "fixture_api_forbidden" }, { status: 403 });
      const destination = new URL(request.url); destination.pathname = `/api/continuous-workflows-fixture${path}`;
      return NextResponse.rewrite(destination);
    }
    if (!["GET", "HEAD"].includes(request.method)) return NextResponse.json({ error: "fixture_write_forbidden" }, { status: 403 });
    if (isContinuousFixturePath(path)) {
      const destination = new URL(request.url); destination.pathname = `/continuous-workflows-e2e${path}`;
      return NextResponse.rewrite(destination);
    }
    if (path.startsWith("/continuous-workflows-e2e/") && isContinuousFixturePath(path.slice("/continuous-workflows-e2e".length))) return NextResponse.next();
    if (path.startsWith("/_next/") || path.startsWith("/ocr/v1/") || ["/sw.js", "/offline.html", "/manifest.webmanifest"].includes(path)) return NextResponse.next();
    return NextResponse.json({ error: "fixture_route_unavailable" }, { status: 404 });
  }
  // The browser E2E harness is fixture-only and compiled behind an explicit CI
  // environment flag. Production does not set it, and the route itself also
  // returns notFound() without the flag.
  if (process.env.E2E_MOBILE_HARNESS === "1" && request.nextUrl.pathname === "/mobile-native-e2e") {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  // Versioned OCR runtime assets contain only public engine/model/license files.
  // Service worker and generic offline fallback contain no user data and must be
  // fetchable before an authenticated app page can be controlled offline.
  matcher: [
    // Dynamic route parameters may themselves end with an image extension.
    // Keep every API and controlled app subtree inside the request boundary;
    // the final matcher still excludes ordinary public image/runtime assets.
    "/api/:path*",
    "/today/:path*", "/notes/:path*", "/tasks/:path*", "/calendar/:path*",
    "/files/:path*", "/projects/:path*", "/inbox/:path*", "/briefing/:path*",
    "/investments/:path*", "/shopping/:path*", "/travel/:path*", "/leisure/:path*",
    "/memory/:path*", "/reviews/:path*", "/career/:path*",
    "/continuous-workflows-e2e/:path*",
    "/((?!_next/static|_next/image|ocr/v1/|favicon.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

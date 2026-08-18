import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// `src/app` is the application's route root, so Next.js 16 discovers this
// convention file from `src/` rather than the repository root.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/supabase/proxy";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/update-password");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=recovery", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=recovery", request.url));
  }

  const { data, error: claimsError } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;

  if (claimsError || !data?.claims.sub || !isOwnerEmail(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not-authorized", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwnerEmailHeader, verifiedOwnerIdHeader } from "@/lib/supabase/proxy";
import { withPerfSpan } from "@/lib/performance/server-perf";

export class OwnerAuthenticationError extends Error {
  constructor(public readonly code: "configuration" | "unauthenticated" | "not-authorized") {
    super(code);
  }
}

async function resolveOwner() {
  return withPerfSpan("auth.require-owner", async () => {
    if (!isSupabaseConfigured) throw new OwnerAuthenticationError("configuration");
    const supabase = await createClient();
    // Proxy validates the token for every matched request and removes these
    // header names before it adds its own values. Reusing that verified result
    // avoids an extra network round-trip in the layout and private APIs.
    const requestHeaders = await headers();
    const proxiedUserId = requestHeaders.get(verifiedOwnerIdHeader);
    const proxiedEmail = requestHeaders.get(verifiedOwnerEmailHeader);
    if (proxiedUserId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(proxiedUserId) && proxiedEmail && isOwnerEmail(proxiedEmail)) {
      return { supabase, userId: proxiedUserId, email: proxiedEmail };
    }
    const { data, error } = await withPerfSpan("auth.get-claims", () => supabase.auth.getClaims());
    const email = data?.claims.email as string | undefined;
    if (error || !data?.claims.sub) throw new OwnerAuthenticationError("unauthenticated");
    if (!isOwnerEmail(email)) throw new OwnerAuthenticationError("not-authorized");
    return { supabase, userId: data.claims.sub, email: email! };
  });
}

/** Route Handlers must return protocol responses instead of rendering redirects. */
export async function requireOwnerApi() {
  return resolveOwner();
}

export function apiAuthenticationFailure(error: unknown) {
  if (error instanceof OwnerAuthenticationError) {
    const status = error.code === "not-authorized" ? 403 : 401;
    return Response.json({ error: error.code === "not-authorized" ? "无权访问此资源。" : "需要登录。" }, {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  return null;
}

/**
 * A Server Component tree can ask for the current owner from both a layout and
 * a data query. Memoizing this request avoids validating the same JWT twice in
 * one render while keeping every request and Server Action independently
 * authenticated.
 */
export const requireOwner = cache(async function requireOwner() {
  try {
    return await resolveOwner();
  } catch (error) {
    if (!(error instanceof OwnerAuthenticationError)) throw error;
    if (error.code === "configuration") redirect("/login?error=configuration");
    if (error.code === "not-authorized") {
      // Proxy clears the cookie before this layout renders. This defensive
      // sign-out also covers deployments where Proxy is accidentally absent.
      if (isSupabaseConfigured) {
        try { await (await createClient()).auth.signOut(); } catch {}
      }
      redirect("/login?error=not-authorized");
    }
    redirect("/login");
  }
});

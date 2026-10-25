import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env, isSupabaseConfigured } from "@/lib/env";
import { isOwnerEmail } from "@/lib/auth/owner";
import { verifiedOwnerEmailHeader, verifiedOwnerIdHeader } from "@/lib/supabase/proxy";
import { withSupabaseReadRecovery } from "@/lib/adapters/supabase-read-recovery";

export async function createClient() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const verifiedId = requestHeaders.get(verifiedOwnerIdHeader);
  const verifiedEmail = requestHeaders.get(verifiedOwnerEmailHeader);
  const recovery: { auth?: ReturnType<typeof createServerClient>["auth"] } = {};
  const client = createServerClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    global: { fetch: withSupabaseReadRecovery(fetch, env.supabaseUrl!, async (token) => {
      const auth = recovery.auth;
      // The Proxy removes browser-supplied identity headers before verifying
      // them. Without that verified boundary, leave the original refusal intact.
      if (!auth || !verifiedId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(verifiedId) || !verifiedEmail || !isOwnerEmail(verifiedEmail)) return false;
      const validated = await auth.getClaims(token);
      if (validated.error || validated.data?.claims.sub !== verifiedId || !isOwnerEmail(validated.data?.claims.email)) return false;
      // Confirm this exact JWT against Auth as well: a locally valid signature
      // alone does not prove a session is still active. This does not rotate a
      // refresh token from a Server Component that cannot write response cookies.
      const current = await auth.getUser(token);
      return !current.error && current.data.user?.id === verifiedId && isOwnerEmail(current.data.user?.email);
    }) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
      },
    },
  });
  recovery.auth = client.auth;
  return client;
}

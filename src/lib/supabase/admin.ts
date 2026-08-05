import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Server-only integration code uses this client after an authenticated owner
 * request. Regular application reads and mutations always use the user's SSR
 * client and therefore RLS.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error("Server integration configuration is incomplete.");
  }
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

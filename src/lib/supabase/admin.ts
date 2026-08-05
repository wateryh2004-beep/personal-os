import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Only HTTP handlers authenticated as the local Calendar Companion use this
 * client. Regular application reads and mutations always use the user's SSR
 * client and therefore RLS.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error("Calendar Companion server configuration is incomplete.");
  }
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

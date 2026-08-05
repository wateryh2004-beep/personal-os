import { cache } from "react";
import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * A Server Component tree can ask for the current owner from both a layout and
 * a data query. Memoizing this request avoids validating the same JWT twice in
 * one render while keeping every request and Server Action independently
 * authenticated.
 */
export const requireOwner = cache(async function requireOwner() {
  if (!isSupabaseConfigured) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;
  if (error || !data?.claims.sub) redirect("/login");
  if (!isOwnerEmail(email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not-authorized");
  }
  return { supabase, userId: data.claims.sub, email: email! };
});

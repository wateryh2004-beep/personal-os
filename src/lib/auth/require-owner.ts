import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function requireOwner() {
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
}

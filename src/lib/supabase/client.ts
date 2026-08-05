"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

export function createClient() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured");
  return createBrowserClient(env.supabaseUrl!, env.supabasePublishableKey!);
}

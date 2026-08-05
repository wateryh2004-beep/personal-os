import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const leaseDurationMs = 45_000;

export async function acquireCalendarRequestLock(supabase: Supabase) {
  const requestId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  const { data, error } = await supabase.from("ai_provider_settings")
    .update({ calendar_request_id: requestId, calendar_request_started_at: now.toISOString(), calendar_request_expires_at: expiresAt })
    .or(`calendar_request_expires_at.is.null,calendar_request_expires_at.lt.${now.toISOString()}`)
    .is("archived_at", null)
    .select("calendar_request_id")
    .maybeSingle();
  if (error) throw new Error("calendar_ai_lock_failed");
  if (!data) return null;
  return requestId;
}

export async function releaseCalendarRequestLock(supabase: Supabase, requestId: string) {
  await supabase.from("ai_provider_settings")
    .update({ calendar_request_id: null, calendar_request_started_at: null, calendar_request_expires_at: null })
    .eq("calendar_request_id", requestId)
    .is("archived_at", null);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";

const querySchema = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).refine((value) => Date.parse(value.end) > Date.parse(value.start) && Date.parse(value.end) - Date.parse(value.start) <= 62 * 86_400_000, { message: "calendar_range_invalid" });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "calendar_range_invalid" }, { status: 400 });
  const { supabase, userId } = await requireOwner();
  // Fetch one extra row so the UI can disclose a bounded result instead of
  // silently pretending a very dense range has no further events.
  const { data, error } = await supabase.from("calendar_events").select("id,provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as,last_synced_at").eq("user_id", userId).lt("starts_at", parsed.data.end).gt("ends_at", parsed.data.start).is("archived_at", null).order("starts_at").limit(1001);
  if (error) return NextResponse.json({ error: "calendar_events_unavailable" }, { status: 503 });
  const rows = data ?? [];
  return NextResponse.json({ events: rows.slice(0, 1000), truncated: rows.length > 1000 });
}

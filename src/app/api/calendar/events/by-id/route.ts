import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";

const querySchema = z.object({ id: z.string().uuid() });

// 跨实体内链跳转用：/calendar?event={本地 id}。范围查询拿不到远期的单条日程时，
// 前端按本地 id 拉取这条日程（与 /api/calendar/events 同一字段集合）。
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "calendar_event_id_invalid" }, { status: 400 });
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("calendar_events").select("id,provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as,last_synced_at").eq("id", parsed.data.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: "calendar_events_unavailable" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "calendar_event_not_found" }, { status: 404 });
  return NextResponse.json({ event: data });
}

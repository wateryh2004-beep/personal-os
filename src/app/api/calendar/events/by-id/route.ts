import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { calendarEventReadSchema } from "@/features/calendar/event-read-schema";

const querySchema = z.union([z.object({ id: z.string().uuid() }).strict(), z.object({ providerId: z.string().regex(/^[A-Za-z0-9_+=.\/-]{1,512}$/) }).strict()]);
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

// 跨实体内链跳转用：/calendar?event={本地 id}。范围查询拿不到远期的单条日程时，
// 前端按本地 id 拉取这条日程（与 /api/calendar/events 同一字段集合）。
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success || new Set(params.keys()).size !== [...params.keys()].length) return NextResponse.json({ error: "calendar_event_id_invalid" }, { status: 400, headers });
    let query = supabase.from("calendar_events").select("id,provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as,last_synced_at").eq("user_id", userId).is("archived_at", null);
    query = "id" in parsed.data ? query.eq("id", parsed.data.id) : query.eq("provider_event_id", parsed.data.providerId);
    const { data, error } = await query.maybeSingle();
    if (error) return NextResponse.json({ error: "calendar_events_unavailable" }, { status: 503, headers });
    if (!data) return NextResponse.json({ error: "calendar_event_not_found" }, { status: 404, headers });
    return NextResponse.json({ event: calendarEventReadSchema.parse(data) }, { headers });
  } catch (error) {
    const failure = apiAuthenticationFailure(error);
    if (failure) { for (const [key, value] of Object.entries(headers)) failure.headers.set(key, value); return failure; }
    return NextResponse.json({ error: "calendar_events_unavailable" }, { status: 503, headers });
  }
}

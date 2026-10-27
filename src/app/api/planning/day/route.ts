import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import {
  calendarCapacityComplete,
  hasCanonicalAllDayAnchors,
} from "@/features/planning/capacity";
import { CALENDAR_NEAR_SYNC_INTERVAL_SECONDS } from "@/features/calendar/sync-policy";
import { wallTimeToIso } from "@/features/calendar/timezone";
import { addLocalDays } from "@/features/reviews/periods";
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerApi();
    const { supabase, userId } = owner;
    const date = z
      .string()
      .date()
      .safeParse(new URL(request.url).searchParams.get("date"));
    if (!date.success)
      return NextResponse.json(
        { error: "planning_invalid" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const [profile, availability, plans, connection] = await Promise.all([
      supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("planning_availability")
        .select("*")
        .eq("user_id", userId)
        .eq("local_date", date.data)
        .is("archived_at", null)
        .maybeSingle(),
      supabase
        .from("task_planning")
        .select("*")
        .is("archived_at", null)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(501),
      supabase
        .from("calendar_connections")
        .select(
          "status,last_sync_at,last_error_code,calendar_sync_window_start,calendar_sync_window_end",
        )
        .eq("user_id", userId)
        .is("archived_at", null)
        .maybeSingle(),
    ]);
    if (profile.error || availability.error || plans.error || connection.error)
      return NextResponse.json(
        { error: "planning_unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    const timezone = profile.data?.timezone || "Asia/Shanghai",
      start = wallTimeToIso(`${date.data}T00:00`, timezone),
      end = wallTimeToIso(`${addLocalDays(date.data, 1)}T00:00`, timezone);
    const [events, tasks] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id,subject,starts_at,ends_at,show_as,is_all_day")
        .eq("user_id", userId)
        .is("archived_at", null)
        .lt("starts_at", new Date(Date.parse(end) + 86400000).toISOString())
        .gt("ends_at", new Date(Date.parse(start) - 86400000).toISOString())
        .order("starts_at")
        .limit(1001),
      supabase
        .from("microsoft_todo_tasks")
        .select("id,title,status,archived_at")
        .eq("user_id", userId)
        .is("archived_at", null)
        .neq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(501),
    ]);
    if (tasks.error || events.error)
      return NextResponse.json(
        { error: "planning_unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    const c = connection.data;
    const calendarComplete = calendarCapacityComplete(
      c,
      start,
      end,
      events.data?.length ?? 0,
      hasCanonicalAllDayAnchors(events.data ?? [], timezone),
      Date.now(),
      CALENDAR_NEAR_SYNC_INTERVAL_SECONDS * 1000,
    );
    return NextResponse.json(
      {
        date: date.data,
        timezone,
        availability: availability.data,
        plans: (plans.data ?? []).slice(0, 500),
        tasks: (tasks.data ?? []).slice(0, 500),
        events: (events.data ?? [])
          .slice(0, 1000)
          .filter(
            (event) =>
              Date.parse(event.starts_at) < Date.parse(end) &&
              Date.parse(event.ends_at) > Date.parse(start),
          ),
        calendarComplete,
        truncated:
          (plans.data?.length ?? 0) > 500 || (tasks.data?.length ?? 0) > 500,
        lastSyncAt: c?.last_sync_at ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const failure = apiAuthenticationFailure(error);
    if (failure) return failure;
    return NextResponse.json(
      { error: "planning_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

import { requireOwner } from "@/lib/auth/require-owner";
import {
  eventIsToday,
  getDateKeyInTimeZone,
  groupNowTasks,
  selectNextAction,
} from "./utils";
import { buildProactiveInsights } from "@/features/proactive/engine";
import type {
  NowCalendarEvent,
  NowCareerMilestone,
  NowTask,
  NowWorkspace,
} from "./types";

type QueryError = { code?: string; message?: string } | null;
const missing = (error: QueryError) =>
  Boolean(error?.code && ["42P01", "PGRST205"].includes(error.code));

export async function getTodayWorkspace(
  now = new Date(),
): Promise<NowWorkspace> {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const today = getDateKeyInTimeZone(now, timezone)!;
  const future30 = getDateKeyInTimeZone(
    new Date(now.getTime() + 30 * 86_400_000),
    timezone,
  )!;
  const from = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const until = new Date(now.getTime() + 9 * 86_400_000).toISOString();
  const [
    tasksResult,
    eventsResult,
    connectionResult,
    milestonesResult,
    inboxResult,
  ] = await Promise.all([
    supabase
      .from("microsoft_todo_tasks")
      .select("id,title,due_at,importance,status")
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(80),
    supabase
      .from("calendar_events")
      .select("id,subject,starts_at,ends_at,is_all_day,location_name")
      .is("archived_at", null)
      .lt("starts_at", until)
      .gt("ends_at", from)
      .order("starts_at")
      .limit(60),
    supabase
      .from("calendar_connections")
      .select("status,last_sync_at,last_error_code")
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("career_milestones")
      .select(
        "id,track_id,career_direction_id,title,starts_on,target_date,status,importance",
      )
      .is("archived_at", null)
      .in("status", ["planned", "in_progress"])
      .lte("target_date", future30)
      .order("target_date")
      .limit(20),
    supabase
      .from("inbox_items")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
  ]);
  const tasks = groupNowTasks(
    tasksResult.error ? [] : ((tasksResult.data ?? []) as NowTask[]),
    now,
    timezone,
  );
  const events = eventsResult.error
    ? []
    : ((eventsResult.data ?? []) as NowCalendarEvent[]);
  const todayEvents = events.filter((event) =>
    eventIsToday(event, now, timezone),
  );
  const milestones = milestonesResult.error
    ? []
    : ((milestonesResult.data ?? []) as NowCareerMilestone[]);
  const inboxCount = inboxResult.error ? 0 : (inboxResult.count ?? 0);
  const connection = connectionResult.error ? null : connectionResult.data;
  const attention = buildProactiveInsights({
    now,
    timeZone: timezone,
    tasks: [...tasks.overdue, ...tasks.today, ...tasks.upcoming],
    events,
    milestones,
  });
  return {
    timezone,
    calendar: {
      today: todayEvents,
      upcoming: events.filter(
        (event) =>
          !todayEvents.some((todayEvent) => todayEvent.id === event.id),
      ),
      connection,
    },
    tasks,
    career: { upcomingMilestones: milestones },
    inboxCount,
    nextAction: selectNextAction({
      now,
      events,
      tasks,
      milestones,
      inboxCount,
    }),
    attention,
    upcoming: [
      ...events
        .filter(
          (event) => getDateKeyInTimeZone(event.starts_at, timezone)! > today,
        )
        .map((event) => ({
          id: `event-${event.id}`,
          kind: "event" as const,
          title: event.subject || "未命名日程",
          at: event.starts_at,
          href: "/calendar",
          detail: event.location_name ?? undefined,
        })),
      ...tasks.upcoming.map((task) => ({
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title || "未命名任务",
        at: task.due_at!,
        href: "/tasks",
      })),
      ...milestones
        .filter((item) => item.target_date > today)
        .map((item) => ({
          id: `milestone-${item.id}`,
          kind: "milestone" as const,
          title: item.title,
          at: `${item.target_date}T00:00:00`,
          href: "/career/roadmap",
        })),
    ]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, 7),
    availability: {
      calendar:
        eventsResult.error && !missing(eventsResult.error)
          ? "unavailable"
          : "ready",
      tasks:
        tasksResult.error && !missing(tasksResult.error)
          ? "unavailable"
          : "ready",
      career:
        milestonesResult.error && !missing(milestonesResult.error)
          ? "unavailable"
          : "ready",
      inbox:
        inboxResult.error && !missing(inboxResult.error)
          ? "unavailable"
          : "ready",
    },
    summary: {
      todayEventCount: todayEvents.length,
      todayTaskCount: tasks.today.length,
      attentionCount: attention.length,
    },
  };
}

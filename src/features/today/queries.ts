import { after } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { withPerfSpan } from "@/lib/performance/server-perf";
import {
  eventIsToday,
  getDateKeyInTimeZone,
  groupNowTasks,
  runTodaySideEffectSafely,
  selectNextAction,
  todayAvailabilityForError,
} from "./utils";
import { buildProactiveInsights } from "@/features/proactive/engine";
import { reconcileProactiveInsights } from "@/features/proactive/service";
import { getReviewPeriod } from "@/features/reviews/periods";
import {
  daysUntilCareerMilestone,
  selectOpenCareerMilestones,
} from "@/features/career/milestone-temporal";
import { addDateKeyDays } from "@/lib/date-keys";
import { buildTodayBrief } from "./brief";
import type {
  NowCalendarEvent,
  NowCareerMilestone,
  NowTask,
  NowWorkspace,
} from "./types";

type Owner = Awaited<ReturnType<typeof requireOwner>>;

export async function getTodayWorkspace(
  now = new Date(),
  owner?: Owner,
): Promise<NowWorkspace> {
  const { supabase, userId } = owner ?? await withPerfSpan("today.workspace.auth", () => requireOwner());
  const { data: profile } = await withPerfSpan("today.workspace.profile", () => supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle());
  const timezone = profile?.timezone || "Asia/Shanghai";
  const today = getDateKeyInTimeZone(now, timezone)!;
  const future30 = addDateKeyDays(today, 30);
  const from = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const until = new Date(now.getTime() + 9 * 86_400_000).toISOString();
  const [
    tasksResult,
    eventsResult,
    connectionResult,
    milestonesResult,
    inboxResult,
    weeklyReviewResult,
    dueDecisionsResult,
    briefingResult,
  ] = await Promise.all([
    withPerfSpan("today.workspace.tasks", () => supabase
      .from("microsoft_todo_tasks")
      .select("id,title,due_at,importance,status")
      .is("archived_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(80)),
    withPerfSpan("today.workspace.calendar-events", () => supabase
      .from("calendar_events")
      .select("id,subject,starts_at,ends_at,is_all_day,location_name")
      .is("archived_at", null)
      .lt("starts_at", until)
      .gt("ends_at", from)
      .order("starts_at")
      .limit(60)),
    withPerfSpan("today.workspace.calendar-connection", () => supabase
      .from("calendar_connections")
      .select("status,last_sync_at,last_error_code")
      .is("archived_at", null)
      .maybeSingle()),
    withPerfSpan("today.workspace.milestones", () => supabase
      .from("career_milestones")
      .select(
        "id,track_id,career_direction_id,title,starts_on,target_date,status,importance",
      )
      .is("archived_at", null)
      .in("status", ["planned", "in_progress"])
      .gte("target_date", today)
      .lte("target_date", future30)
      .order("target_date")
      .limit(20)),
    withPerfSpan("today.workspace.inbox", () => supabase
      .from("inbox_items")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)),
    withPerfSpan("today.workspace.weekly-review", () => supabase
      .from("reviews")
      .select("id")
      .eq("review_key", getReviewPeriod("weekly", now, timezone).key)
      .eq("status", "completed")
      .is("archived_at", null)
      .maybeSingle()),
    withPerfSpan("today.workspace.decisions", () => supabase
      .from("decisions")
      .select("id,title,review_at")
      .eq("status", "active")
      .is("archived_at", null)
      .not("review_at", "is", null)
      .lte("review_at", now.toISOString())
      .order("review_at")
      .limit(2)),
    withPerfSpan("today.workspace.briefing-index", () => supabase
      .from("briefings")
      .select("id,briefing_date")
      .eq("status", "completed")
      .order("generated_at", { ascending: false, nullsFirst: false })
      .limit(20)),
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
  const queriedMilestones = milestonesResult.error
    ? []
    : ((milestonesResult.data ?? []) as NowCareerMilestone[]);
  const milestones = selectOpenCareerMilestones(queriedMilestones, today, 30);
  const inboxCount = inboxResult.error ? 0 : (inboxResult.count ?? 0);
  const connection = connectionResult.error ? null : connectionResult.data;
  const attention = buildProactiveInsights({
    now,
    timeZone: timezone,
    tasks: [...tasks.overdue, ...tasks.today, ...tasks.upcoming],
    events,
    milestones,
    weeklyReviewCompleted: Boolean(weeklyReviewResult.data),
    dueDecisions: dueDecisionsResult.error
      ? []
      : (dueDecisionsResult.data as Array<{
          id: string;
          title: string;
          review_at: string;
        }>),
  });
  const todayBrief = buildTodayBrief({
    now,
    timezone,
    overdueTasks: tasks.overdue,
    todayTasks: tasks.today,
    todayEvents,
    milestones,
    inboxCount,
  });
  after(() =>
    runTodaySideEffectSafely(() =>
      reconcileProactiveInsights(supabase, userId, attention, now),
    ),
  );

  let briefingEntries: Array<{
    id: string;
    title: string;
    url: string | null;
    section: string;
    reason: string | null;
  }> = [];
  let briefingError = briefingResult.error;
  const completedBriefings = briefingResult.data ?? [];
  const displayedBriefing =
    completedBriefings.find((briefing) => briefing.briefing_date === today) ??
    completedBriefings[0];
  if (displayedBriefing) {
    const result = await withPerfSpan("today.workspace.briefing-entries", () => supabase
      .from("briefing_entries")
      .select(
        "id,section,relevance_reason,feed_items(title,url,canonical_url)",
      )
      .eq("briefing_id", displayedBriefing.id)
      .in("section", ["must_know", "worth_reading"])
      .order("position")
      .limit(2));
    briefingError = result.error;
    briefingEntries = (result.data ?? []).flatMap((entry) => {
      const item = Array.isArray(entry.feed_items)
        ? entry.feed_items[0]
        : entry.feed_items;
      return item
        ? [
            {
              id: entry.id,
              title: item.title,
              url: item.canonical_url || item.url,
              section: entry.section,
              reason: entry.relevance_reason,
            },
          ]
        : [];
    });
  }
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
    briefing: { entries: briefingEntries, date: displayedBriefing?.briefing_date ?? null },
    inboxCount,
    nextAction: selectNextAction({
      now,
      timeZone: timezone,
      events,
      tasks,
      milestones,
      inboxCount,
    }),
    todayBrief,
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
        .filter((item) => {
          const days = daysUntilCareerMilestone(item.target_date, today);
          return days > 0 && days <= 7;
        })
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
      calendar: todayAvailabilityForError(eventsResult.error),
      tasks: todayAvailabilityForError(tasksResult.error),
      career: todayAvailabilityForError(milestonesResult.error),
      inbox: todayAvailabilityForError(inboxResult.error),
      briefing: todayAvailabilityForError(briefingError),
    },
    summary: {
      todayEventCount: todayEvents.length,
      todayTaskCount: tasks.today.length,
      attentionCount: attention.length,
    },
  };
}

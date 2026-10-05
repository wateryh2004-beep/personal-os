import { addDateKeyDays, getDateKeyInTimeZone } from "@/lib/date-keys";
import { isOpenCareerMilestone } from "@/features/career/milestone-temporal";
import { eventRecordHref, milestoneRecordHref, taskRecordHref } from "./record-links";
import type {
  NowAttentionItem,
  NowCalendarEvent,
  NowCommitment,
  NowTask,
  NowUpcomingItem,
  NowWorkspace,
} from "./types";

export type TodayCompositionLead =
  | { kind: "focus"; task: NowTask }
  | {
      kind: "event";
      event: NowCalendarEvent;
      state: "ongoing" | "starting_soon" | "upcoming";
      isEvening: boolean;
      href: string;
    }
  | null;

export type TodayLedgerItem =
  | { kind: "task"; id: string; task: NowTask; dueState: "overdue" | "today"; href: string }
  | { kind: "event"; id: string; event: NowCalendarEvent; href: string }
  | { kind: "commitment"; id: string; commitment: NowCommitment; href: string }
  | { kind: "attention"; id: string; attention: NowAttentionItem; href: string };

export type TodayComposition = {
  todayKey: string | null;
  lead: TodayCompositionLead;
  /** The user's complete selection, in explicit selection order, including completed tasks. */
  focusTasks: NowTask[];
  /** Uncapped current obligations. A source record appears on only one primary surface. */
  ledger: TodayLedgerItem[];
  future: NowUpcomingItem[];
  pastEvents: NowCalendarEvent[];
  availability: NowWorkspace["availability"];
  focusAvailable: boolean;
  isEvening: boolean;
  /** Known unresolved work; false never implies all-clear when a source is unavailable. */
  hasUnresolvedToday: boolean;
};

const STARTING_SOON_MS = 45 * 60_000;
const taskKey = (id: string) => `task:${id}`;
const eventKey = (id: string) => `event:${id}`;
const milestoneKey = (id: string) => `milestone:${id}`;

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

function sortEvents(left: NowCalendarEvent, right: NowCalendarEvent) {
  const leftAt = Date.parse(left.starts_at);
  const rightAt = Date.parse(right.starts_at);
  return (Number.isFinite(leftAt) ? leftAt : Infinity) - (Number.isFinite(rightAt) ? rightAt : Infinity)
    || left.id.localeCompare(right.id);
}

function hasKnownEventTimes(event: NowCalendarEvent) {
  const starts = Date.parse(event.starts_at);
  const ends = Date.parse(event.ends_at);
  return Number.isFinite(starts) && Number.isFinite(ends) && ends > starts;
}

function overlapsDay(event: NowCalendarEvent, today: string, timezone: string) {
  if (!hasKnownEventTimes(event)) return false;
  const firstDay = getDateKeyInTimeZone(event.starts_at, timezone)!;
  // Calendar ends are exclusive, including midnight and all-day endpoints.
  const lastDay = getDateKeyInTimeZone(new Date(Date.parse(event.ends_at) - 1), timezone)!;
  return firstDay <= today && lastDay >= today;
}

/** Read record identities from canonical links, never from titles or shared overview links. */
function hrefKey(href: string): string | null {
  try {
    const url = new URL(href, "https://personal-os.invalid");
    const record = url.pathname === "/tasks" ? ["task", url.searchParams.get("task")]
      : url.pathname === "/calendar" ? ["event", url.searchParams.get("event")]
      : url.pathname === "/career/roadmap" ? ["milestone", url.searchParams.get("milestone")]
      : null;
    return record?.[1] ? `${record[0]}:${record[1]}` : null;
  } catch {
    return null;
  }
}

function commitmentKey(item: NowCommitment) {
  const id = item.task?.id ?? item.source.entityId;
  if (id) {
    if (item.source.domain === "tasks") return taskKey(id);
    if (item.source.domain === "calendar") return eventKey(id);
    if (item.source.domain === "career") return milestoneKey(id);
  }
  return hrefKey(item.href) ?? `commitment:${item.id}`;
}

function attentionKey(item: NowAttentionItem) {
  const linked = hrefKey(item.href);
  if (linked) return linked;
  if (item.kind === "calendar_upcoming" && item.id.startsWith("event-")) return eventKey(item.id.slice(6));
  if (item.kind === "career_milestone_approaching" && item.id.startsWith("milestone-")) return milestoneKey(item.id.slice(10));
  // Several decision reviews may intentionally share /reviews. Keep each one.
  return `attention:${item.kind}:${item.id}`;
}

function upcomingKey(item: NowUpcomingItem) {
  const linked = hrefKey(item.href);
  if (linked) return linked;
  const prefix = `${item.kind}-`;
  return item.id.startsWith(prefix) ? `${item.kind}:${item.id.slice(prefix.length)}` : `upcoming:${item.kind}:${item.id}`;
}

/**
 * A pure, deterministic composition of persisted facts and explicit focus choices.
 * It never uses the render clock, AI suggestions, task importance, or writes.
 */
export function buildTodayComposition(workspace: NowWorkspace): TodayComposition {
  const parsedSnapshot = workspace.generatedAt ? Date.parse(workspace.generatedAt) : NaN;
  const snapshot = Number.isFinite(parsedSnapshot) ? parsedSnapshot : null;
  const todayKey = snapshot !== null
    ? getDateKeyInTimeZone(new Date(snapshot), workspace.timezone)
    : workspace.focus?.date ?? null;
  const focusAvailable = workspace.focus?.available ?? false;
  const selectedIds = [...new Set(workspace.focus?.selectedIds ?? [])];
  const taskRecords = uniqueById([
    ...(workspace.focus?.selectedTasks ?? []),
    ...workspace.tasks.overdue,
    ...workspace.tasks.today,
    ...workspace.tasks.upcoming,
    ...workspace.commitments.flatMap((item) => item.task ? [item.task] : []),
  ]);
  const tasksById = new Map(taskRecords.map((task) => [task.id, task]));
  const focusTasks = selectedIds.flatMap((id) => {
    const task = tasksById.get(id);
    return task ? [task] : [];
  });
  const allEvents = uniqueById([...workspace.calendar.today, ...workspace.calendar.upcoming]).sort(sortEvents);
  const suppliedTodayIds = new Set(workspace.calendar.today.map((event) => event.id));
  const todayEvents = snapshot !== null && todayKey
    ? allEvents.filter((event) => overlapsDay(event, todayKey, workspace.timezone)
      || (!hasKnownEventTimes(event) && suppliedTodayIds.has(event.id)))
    : uniqueById(workspace.calendar.today).sort(sortEvents);
  const pastEvents = snapshot === null ? [] : todayEvents.filter((event) =>
    !event.is_all_day && hasKnownEventTimes(event) && Date.parse(event.ends_at) <= snapshot);
  const pastIds = new Set(pastEvents.map((event) => event.id));
  const liveTodayEvents = todayEvents.filter((event) => !pastIds.has(event.id));
  const timedEvents = allEvents.filter((event) => !event.is_all_day && hasKnownEventTimes(event));
  const ongoing = snapshot === null ? undefined : timedEvents.find((event) =>
    Date.parse(event.starts_at) <= snapshot && Date.parse(event.ends_at) > snapshot);
  const soon = snapshot === null ? undefined : timedEvents.find((event) =>
    Date.parse(event.starts_at) > snapshot && Date.parse(event.starts_at) - snapshot <= STARTING_SOON_MS);
  const urgentEvent = ongoing ?? soon;
  const activeFocus = focusAvailable ? focusTasks.find((task) => task.status !== "completed") : undefined;
  let lead: TodayCompositionLead = urgentEvent
    ? { kind: "event", event: urgentEvent, state: ongoing ? "ongoing" : "starting_soon", isEvening: false, href: eventRecordHref(urgentEvent.id) }
    : activeFocus ? { kind: "focus", task: activeFocus } : null;

  const represented = new Set(focusTasks.map((task) => taskKey(task.id)));
  for (const event of pastEvents) represented.add(eventKey(event.id));
  if (lead?.kind === "event") represented.add(eventKey(lead.event.id));
  const ledger: TodayLedgerItem[] = [];
  const unresolvedTaskIds = new Set<string>();
  for (const [dueState, tasks] of [["overdue", workspace.tasks.overdue], ["today", workspace.tasks.today]] as const) {
    for (const task of tasks) {
      if (task.status === "completed") continue;
      unresolvedTaskIds.add(task.id);
      const key = taskKey(task.id);
      if (represented.has(key)) continue;
      represented.add(key);
      ledger.push({ kind: "task", id: `task-${task.id}`, task, dueState, href: taskRecordHref(task.id) });
    }
  }
  // All-day entries have no invented clock time; timed rows keep actual instant order.
  const orderedTodayEvents = [
    ...liveTodayEvents.filter((event) => event.is_all_day),
    ...liveTodayEvents.filter((event) => !event.is_all_day),
  ];
  for (const event of orderedTodayEvents) {
    const key = eventKey(event.id);
    if (represented.has(key)) continue;
    represented.add(key);
    ledger.push({ kind: "event", id: `event-${event.id}`, event, href: eventRecordHref(event.id) });
  }

  const obligations = [...workspace.commitments];
  // The old recommendation cap may omit real career obligations. Recover the same
  // seven-day horizon from source records without assigning any new priority.
  if (todayKey) {
    const horizon = addDateKeyDays(todayKey, 7);
    for (const milestone of workspace.career.upcomingMilestones) {
      if (!isOpenCareerMilestone(milestone) || milestone.target_date > horizon) continue;
      obligations.push({
        id: `milestone-${milestone.id}`, kind: "milestone", title: milestone.title,
        whyNow: milestone.target_date < todayKey ? "职业节点目标日已过" : milestone.target_date === todayKey ? "职业节点计划在今天" : "职业节点临近",
        constraint: `目标日：${milestone.target_date}`, href: milestoneRecordHref(milestone.id),
        source: { domain: "career", entityId: milestone.id, label: "Career Roadmap" },
      });
    }
  }
  for (const commitment of obligations) {
    if (commitment.kind === "inbox" || commitment.task?.status === "completed") continue;
    const key = commitmentKey(commitment);
    if (represented.has(key)) continue;
    represented.add(key);
    ledger.push({ kind: "commitment", id: commitment.id, commitment, href: commitment.href });
  }
  for (const attention of workspace.attention) {
    // The aggregate overdue reminder adds no obligation when the real tasks are present.
    if (attention.kind === "task_overdue" && workspace.tasks.overdue.some((task) => task.status !== "completed")) continue;
    const key = attentionKey(attention);
    if (represented.has(key)) continue;
    represented.add(key);
    ledger.push({ kind: "attention", id: attention.id, attention, href: attention.href });
  }

  const hasUnresolvedToday = unresolvedTaskIds.size > 0 || focusTasks.some((task) => task.status !== "completed") || Boolean(urgentEvent)
    || liveTodayEvents.length > 0 || ledger.some((item) => item.kind === "commitment" || item.kind === "attention");
  const sourcesReady = workspace.availability.calendar === "ready"
    && workspace.availability.tasks === "ready" && workspace.availability.career === "ready"
    && focusAvailable;
  // A completed timeline alone is insufficient evidence for a reassuring next-day lead.
  // Unknown selections, missing sources, or any known obligation keep it suppressed.
  if (!lead && snapshot !== null && todayKey && sourcesReady && selectedIds.length === 0 && !hasUnresolvedToday) {
    const next = allEvents.find((event) => hasKnownEventTimes(event)
      && Date.parse(event.starts_at) > snapshot
      && getDateKeyInTimeZone(event.starts_at, workspace.timezone)! > todayKey);
    if (next) {
      lead = { kind: "event", event: next, state: "upcoming", isEvening: true, href: eventRecordHref(next.id) };
      represented.add(eventKey(next.id));
    }
  }

  const futureSeen = new Set<string>();
  const future = workspace.upcoming.filter((item) => {
    const key = upcomingKey(item);
    if (represented.has(key) || futureSeen.has(key)) return false;
    futureSeen.add(key);
    return true;
  });
  return {
    todayKey, lead, focusTasks, ledger, future, pastEvents,
    availability: workspace.availability, focusAvailable,
    isEvening: lead?.kind === "event" && lead.isEvening,
    hasUnresolvedToday,
  };
}

import "server-only";

import { wallTimeToIso } from "@/features/calendar/timezone";
import { requireOwner } from "@/lib/auth/require-owner";
import { addLocalDays, getReviewPeriod } from "./periods";
import type { ReviewPeriod, ReviewSourceInput } from "./types";

export type ReviewEvidenceType =
  | "calendar_event"
  | "todo_task"
  | "note"
  | "inbox_item"
  | "career_milestone"
  | "career_opportunity"
  | "career_application"
  | "project"
  | "decision";

export type ReviewEvidenceItem = {
  type: ReviewEvidenceType;
  id: string;
  title: string;
  summary?: string | null;
  occurredAt: string;
  href: string;
  state?: string | null;
};

export type ReviewEvidence = {
  reviewType: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  calendar: ReviewEvidenceItem[];
  tasksCompleted: ReviewEvidenceItem[];
  tasksOpen: ReviewEvidenceItem[];
  notes: ReviewEvidenceItem[];
  inbox: ReviewEvidenceItem[];
  career: ReviewEvidenceItem[];
  projects: ReviewEvidenceItem[];
  decisions: ReviewEvidenceItem[];
};

export type ReviewPeriodBounds = {
  startIso: string;
  endExclusiveIso: string;
};

const LIMITS = {
  calendar: 30,
  tasksCompleted: 40,
  tasksOpen: 15,
  notes: 20,
  inbox: 20,
  career: 20,
  projects: 15,
  decisions: 10,
} as const;

function cleanExcerpt(value: string | null | undefined, maxLength = 220) {
  const cleaned = (value ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*+-]+\s*/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

export function getReviewPeriodBounds(period: ReviewPeriod): ReviewPeriodBounds {
  return {
    startIso: wallTimeToIso(`${period.startDate}T00:00`, period.timezone),
    endExclusiveIso: wallTimeToIso(
      `${addLocalDays(period.endDate, 1)}T00:00`,
      period.timezone,
    ),
  };
}

export function instantFallsInReviewPeriod(
  value: string | null | undefined,
  bounds: ReviewPeriodBounds,
) {
  if (!value) return false;
  const instant = Date.parse(value);
  return (
    Number.isFinite(instant) &&
    instant >= Date.parse(bounds.startIso) &&
    instant < Date.parse(bounds.endExclusiveIso)
  );
}

export function calendarEventOverlapsReviewPeriod(
  event: { starts_at: string; ends_at: string },
  bounds: ReviewPeriodBounds,
) {
  return (
    Date.parse(event.starts_at) < Date.parse(bounds.endExclusiveIso) &&
    Date.parse(event.ends_at) > Date.parse(bounds.startIso)
  );
}

export function completedTaskFallsInReviewPeriod(
  task: { status: string; completed_at: string | null },
  bounds: ReviewPeriodBounds,
) {
  return task.status === "completed" && instantFallsInReviewPeriod(task.completed_at, bounds);
}

export function openTaskIsRelevantToReview(
  task: { status: string; due_at: string | null; updated_at: string },
  bounds: ReviewPeriodBounds,
) {
  return (
    task.status !== "completed" &&
    (instantFallsInReviewPeriod(task.due_at, bounds) ||
      instantFallsInReviewPeriod(task.updated_at, bounds))
  );
}

export function noteChangedInReviewPeriod(
  note: { created_at: string; updated_at: string },
  bounds: ReviewPeriodBounds,
) {
  return (
    instantFallsInReviewPeriod(note.created_at, bounds) ||
    instantFallsInReviewPeriod(note.updated_at, bounds)
  );
}

function newestFirst(items: ReviewEvidenceItem[], limit: number) {
  return items
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, limit);
}

export function emptyReviewEvidence(input: {
  type: "daily" | "weekly";
  period: ReviewPeriod;
  generatedAt: string;
}): ReviewEvidence {
  return {
    reviewType: input.type,
    periodStart: input.period.startDate,
    periodEnd: input.period.endDate,
    generatedAt: input.generatedAt,
    calendar: [],
    tasksCompleted: [],
    tasksOpen: [],
    notes: [],
    inbox: [],
    career: [],
    projects: [],
    decisions: [],
  };
}

export function countReviewEvidence(evidence: ReviewEvidence) {
  return [
    evidence.calendar,
    evidence.tasksCompleted,
    evidence.tasksOpen,
    evidence.notes,
    evidence.inbox,
    evidence.career,
    evidence.projects,
    evidence.decisions,
  ].reduce((total, items) => total + items.length, 0);
}

export function reviewEvidenceSources(evidence: ReviewEvidence): ReviewSourceInput[] {
  const items = [
    ...evidence.calendar,
    ...evidence.tasksCompleted,
    ...evidence.tasksOpen,
    ...evidence.notes,
    ...evidence.inbox,
    ...evidence.career,
    ...evidence.projects,
    ...evidence.decisions,
  ];
  const unique = new Map<string, ReviewSourceInput>();
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    unique.set(key, {
      sourceType: item.type,
      sourceId: item.id,
      sourceRole: "context",
    });
  }
  return [...unique.values()];
}

export function serializeReviewEvidence(evidence: ReviewEvidence) {
  const groups: Array<[string, ReviewEvidenceItem[]]> = [
    ["Calendar", evidence.calendar],
    ["Completed tasks", evidence.tasksCompleted],
    ["Open tasks", evidence.tasksOpen],
    ["Notes", evidence.notes],
    ["Inbox", evidence.inbox],
    ["Career", evidence.career],
    ["Projects", evidence.projects],
    ["Decisions", evidence.decisions],
  ];
  const lines = [
    `Review type: ${evidence.reviewType}`,
    `Period: ${evidence.periodStart} — ${evidence.periodEnd}`,
    `Evidence count: ${countReviewEvidence(evidence)}`,
  ];
  for (const [label, items] of groups) {
    lines.push(`\n## ${label}`);
    if (!items.length) {
      lines.push("- 无可验证记录");
      continue;
    }
    for (const item of items) {
      lines.push(
        `- 来源标题：「${item.title}」 | 时间：${item.occurredAt}${item.state ? ` | 状态：${item.state}` : ""}${item.summary ? ` | 摘要：${item.summary}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

export async function getReviewEvidence(input: {
  type: "daily" | "weekly";
  now?: Date;
}): Promise<ReviewEvidence> {
  const { supabase, userId } = await requireOwner();
  const now = input.now ?? new Date();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const period = getReviewPeriod(input.type, now, timezone);
  const bounds = getReviewPeriodBounds(period);
  const timestampFilter = `and(created_at.gte.${bounds.startIso},created_at.lt.${bounds.endExclusiveIso}),and(updated_at.gte.${bounds.startIso},updated_at.lt.${bounds.endExclusiveIso})`;

  const [calendar, completedTasks, openTasks, notes, inbox, milestones, opportunities, applications, projects, decisions] =
    await Promise.all([
      supabase
        .from("calendar_events")
        .select("id,subject,starts_at,ends_at,is_all_day,location_name")
        .is("archived_at", null)
        .lt("starts_at", bounds.endExclusiveIso)
        .gt("ends_at", bounds.startIso)
        .order("starts_at", { ascending: false })
        .limit(LIMITS.calendar),
      supabase
        .from("microsoft_todo_tasks")
        .select("id,title,body_text,status,completed_at")
        .eq("status", "completed")
        .is("archived_at", null)
        .gte("completed_at", bounds.startIso)
        .lt("completed_at", bounds.endExclusiveIso)
        .order("completed_at", { ascending: false })
        .limit(LIMITS.tasksCompleted),
      supabase
        .from("microsoft_todo_tasks")
        .select("id,title,body_text,status,due_at,updated_at")
        .neq("status", "completed")
        .is("archived_at", null)
        .or(
          `and(due_at.gte.${bounds.startIso},due_at.lt.${bounds.endExclusiveIso}),and(updated_at.gte.${bounds.startIso},updated_at.lt.${bounds.endExclusiveIso})`,
        )
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(LIMITS.tasksOpen),
      supabase
        .from("notes")
        .select("id,title,body_markdown,created_at,updated_at")
        .eq("status", "active")
        .is("deleted_at", null)
        .is("archived_at", null)
        .or(timestampFilter)
        .order("updated_at", { ascending: false })
        .limit(LIMITS.notes),
      supabase
        .from("inbox_items")
        .select("id,content_markdown,created_at,updated_at,processed_at")
        .is("archived_at", null)
        .or(
          `${timestampFilter},and(processed_at.gte.${bounds.startIso},processed_at.lt.${bounds.endExclusiveIso})`,
        )
        .order("updated_at", { ascending: false })
        .limit(LIMITS.inbox),
      supabase
        .from("career_milestones")
        .select("id,title,description,starts_on,target_date,status,updated_at")
        .is("archived_at", null)
        .or(
          `and(starts_on.gte.${period.startDate},starts_on.lte.${period.endDate}),and(target_date.gte.${period.startDate},target_date.lte.${period.endDate}),and(updated_at.gte.${bounds.startIso},updated_at.lt.${bounds.endExclusiveIso})`,
        )
        .order("updated_at", { ascending: false })
        .limit(LIMITS.career),
      supabase
        .from("career_opportunities")
        .select("id,organization,role_title,status,updated_at")
        .is("archived_at", null)
        .gte("updated_at", bounds.startIso)
        .lt("updated_at", bounds.endExclusiveIso)
        .order("updated_at", { ascending: false })
        .limit(LIMITS.career),
      supabase
        .from("career_applications")
        .select("id,status,updated_at,career_opportunities(organization,role_title)")
        .is("archived_at", null)
        .gte("updated_at", bounds.startIso)
        .lt("updated_at", bounds.endExclusiveIso)
        .order("updated_at", { ascending: false })
        .limit(LIMITS.career),
      supabase
        .from("projects")
        .select("id,name,description,status,updated_at")
        .is("archived_at", null)
        .gte("updated_at", bounds.startIso)
        .lt("updated_at", bounds.endExclusiveIso)
        .order("updated_at", { ascending: false })
        .limit(LIMITS.projects),
      supabase
        .from("decisions")
        .select("id,title,decision_text,status,decided_at,last_reviewed_at,updated_at")
        .is("archived_at", null)
        .or(
          `and(decided_at.gte.${bounds.startIso},decided_at.lt.${bounds.endExclusiveIso}),and(updated_at.gte.${bounds.startIso},updated_at.lt.${bounds.endExclusiveIso}),and(last_reviewed_at.gte.${bounds.startIso},last_reviewed_at.lt.${bounds.endExclusiveIso})`,
        )
        .order("updated_at", { ascending: false })
        .limit(LIMITS.decisions),
    ]);

  const evidence = emptyReviewEvidence({
    type: input.type,
    period,
    generatedAt: now.toISOString(),
  });
  evidence.calendar = (calendar.data ?? [])
    .filter((row) => calendarEventOverlapsReviewPeriod(row, bounds))
    .map((row) => ({
      type: "calendar_event" as const,
      id: row.id,
      title: row.subject || "无标题日程",
      summary: row.location_name,
      occurredAt: row.starts_at,
      href: "/calendar",
      state: row.is_all_day ? "全天" : null,
    }));
  evidence.tasksCompleted = (completedTasks.data ?? [])
    .filter((row) => completedTaskFallsInReviewPeriod(row, bounds))
    .map((row) => ({
      type: "todo_task" as const,
      id: row.id,
      title: row.title,
      summary: cleanExcerpt(row.body_text),
      occurredAt: row.completed_at!,
      href: "/tasks",
      state: "已完成",
    }));
  evidence.tasksOpen = (openTasks.data ?? [])
    .filter((row) => openTaskIsRelevantToReview(row, bounds))
    .map((row) => ({
    type: "todo_task" as const,
    id: row.id,
    title: row.title,
    summary: cleanExcerpt(row.body_text),
    occurredAt: row.due_at || row.updated_at,
    href: "/tasks",
    state: row.due_at ? "到期但未完成" : "本周期有更新",
    }));
  evidence.notes = (notes.data ?? [])
    .filter((row) => noteChangedInReviewPeriod(row, bounds))
    .map((row) => ({
    type: "note" as const,
    id: row.id,
    title: row.title || "无标题笔记",
    summary: cleanExcerpt(row.body_markdown),
    occurredAt: row.updated_at,
    href: `/notes/${row.id}`,
    state: row.created_at === row.updated_at ? "新建" : "已更新",
    }));
  evidence.inbox = (inbox.data ?? []).map((row) => ({
    type: "inbox_item" as const,
    id: row.id,
    title: cleanExcerpt(row.content_markdown, 90) || "Inbox 记录",
    summary: null,
    occurredAt: row.processed_at || row.updated_at || row.created_at,
    href: "/inbox",
    state: row.processed_at ? "已处理" : "待整理",
  }));
  evidence.career = newestFirst(
    [
      ...(milestones.data ?? []).map((row) => ({
        type: "career_milestone" as const,
        id: row.id,
        title: row.title,
        summary: cleanExcerpt(row.description),
        occurredAt: row.updated_at,
        href: "/career/roadmap",
        state: row.status,
      })),
      ...(opportunities.data ?? []).map((row) => ({
        type: "career_opportunity" as const,
        id: row.id,
        title: `${row.organization} · ${row.role_title}`,
        occurredAt: row.updated_at,
        href: "/career/opportunities",
        state: row.status,
      })),
      ...(applications.data ?? []).map((row) => {
        const opportunity = Array.isArray(row.career_opportunities)
          ? row.career_opportunities[0]
          : row.career_opportunities;
        return {
          type: "career_application" as const,
          id: row.id,
          title: opportunity
            ? `${opportunity.organization} · ${opportunity.role_title}`
            : "求职申请",
          occurredAt: row.updated_at,
          href: "/career/applications",
          state: row.status,
        };
      }),
    ],
    LIMITS.career,
  );
  evidence.projects = (projects.data ?? []).map((row) => ({
    type: "project" as const,
    id: row.id,
    title: row.name,
    summary: cleanExcerpt(row.description),
    occurredAt: row.updated_at,
    href: "/projects",
    state: row.status,
  }));
  evidence.decisions = (decisions.data ?? []).map((row) => ({
    type: "decision" as const,
    id: row.id,
    title: row.title,
    summary: cleanExcerpt(row.decision_text),
    occurredAt: row.last_reviewed_at || row.updated_at || row.decided_at,
    href: "/memory",
    state: row.status,
  }));
  return evidence;
}

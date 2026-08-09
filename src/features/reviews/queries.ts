import "server-only";

import { requireOwner } from "@/lib/auth/require-owner";
import { normalizeStoredStructuredData } from "./formatting";
import { getReviewPeriod } from "./periods";

type CompletedReview = {
  id: string;
  review_type: "daily" | "weekly" | "decision";
  title: string;
  period_start: string;
  period_end: string;
  content_markdown: string;
  completed_at: string | null;
};

type RawReviewSource = {
  id: string;
  source_type: string;
  source_id: string;
  source_role: "origin" | "context" | "cited";
  created_at: string;
};

export type ReviewSourceDetail = RawReviewSource & {
  title: string;
  href: string;
};

export async function getReviews() {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id,review_type,review_key,title,period_start,period_end,status,content_markdown,generated_with_ai,source_snapshot_at,completed_at,updated_at,review_sources(count)",
    )
    .is("archived_at", null)
    .order("period_end", { ascending: false })
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function getReviewsDashboard() {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const [daily, weekly] = [
    getReviewPeriod("daily", new Date(), timezone),
    getReviewPeriod("weekly", new Date(), timezone),
  ];
  const [reviews, dueDecisions] = await Promise.all([
    getReviews(),
    supabase
      .from("decisions")
      .select("id,title,importance,review_at,decided_at")
      .eq("status", "active")
      .is("archived_at", null)
      .not("review_at", "is", null)
      .lte("review_at", new Date().toISOString())
      .order("importance", { ascending: false })
      .order("review_at", { ascending: true })
      .limit(8),
  ]);
  return {
    timezone,
    daily,
    weekly,
    reviews,
    dueDecisions: dueDecisions.data ?? [],
  };
}

export async function getCurrentReview(type: "daily" | "weekly", now = new Date()) {
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const period = getReviewPeriod(type, now, profile?.timezone || "Asia/Shanghai");
  const { data } = await supabase
    .from("reviews")
    .select(
      "id,title,status,content_markdown,structured_data,generated_with_ai,completed_at",
    )
    .eq("review_key", period.key)
    .is("archived_at", null)
    .maybeSingle();
  return {
    period,
    review: data
      ? { ...data, structured_data: normalizeStoredStructuredData(data.structured_data) }
      : null,
  };
}

function sourceHref(type: string, id: string) {
  if (type === "note") return `/notes/${id}`;
  if (type === "calendar_event") return "/calendar";
  if (type === "todo_task") return "/tasks";
  if (type === "inbox_item") return "/inbox";
  if (type === "career_milestone") return "/career/roadmap";
  if (type === "career_opportunity") return "/career/opportunities";
  if (type === "career_application") return "/career/applications";
  if (type === "project") return "/projects";
  if (type === "decision") return "/memory";
  return "/reviews";
}

async function hydrateReviewSources(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  sources: RawReviewSource[],
): Promise<ReviewSourceDetail[]> {
  const ids = (type: string) =>
    sources.filter((source) => source.source_type === type).map((source) => source.source_id);
  const query = <T,>(type: string, table: string, columns: string) => {
    const sourceIds = ids(type);
    if (!sourceIds.length) return Promise.resolve({ data: [] as T[], error: null });
    return supabase.from(table).select(columns).in("id", sourceIds) as unknown as Promise<{
      data: T[] | null;
      error: unknown;
    }>;
  };
  const [calendar, tasks, notes, inbox, milestones, opportunities, applications, projects, decisions] =
    await Promise.all([
      query<{ id: string; subject: string }>("calendar_event", "calendar_events", "id,subject"),
      query<{ id: string; title: string }>("todo_task", "microsoft_todo_tasks", "id,title"),
      query<{ id: string; title: string }>("note", "notes", "id,title"),
      query<{ id: string; content_markdown: string }>("inbox_item", "inbox_items", "id,content_markdown"),
      query<{ id: string; title: string }>("career_milestone", "career_milestones", "id,title"),
      query<{ id: string; organization: string; role_title: string }>("career_opportunity", "career_opportunities", "id,organization,role_title"),
      query<{ id: string; status: string }>("career_application", "career_applications", "id,status"),
      query<{ id: string; name: string }>("project", "projects", "id,name"),
      query<{ id: string; title: string }>("decision", "decisions", "id,title"),
    ]);
  const titles = new Map<string, string>();
  for (const row of calendar.data ?? []) titles.set(`calendar_event:${row.id}`, row.subject || "无标题日程");
  for (const row of tasks.data ?? []) titles.set(`todo_task:${row.id}`, row.title);
  for (const row of notes.data ?? []) titles.set(`note:${row.id}`, row.title || "无标题笔记");
  for (const row of inbox.data ?? []) titles.set(`inbox_item:${row.id}`, row.content_markdown.slice(0, 70));
  for (const row of milestones.data ?? []) titles.set(`career_milestone:${row.id}`, row.title);
  for (const row of opportunities.data ?? []) titles.set(`career_opportunity:${row.id}`, `${row.organization} · ${row.role_title}`);
  for (const row of applications.data ?? []) titles.set(`career_application:${row.id}`, `求职申请 · ${row.status}`);
  for (const row of projects.data ?? []) titles.set(`project:${row.id}`, row.name);
  for (const row of decisions.data ?? []) titles.set(`decision:${row.id}`, row.title);
  return sources.map((source) => ({
    ...source,
    title: titles.get(`${source.source_type}:${source.source_id}`) ?? "来源已不可用",
    href: sourceHref(source.source_type, source.source_id),
  }));
}

export async function getReviewDetail(reviewId: string) {
  const { supabase } = await requireOwner();
  const { data: review } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", reviewId)
    .is("archived_at", null)
    .maybeSingle();
  if (!review) return null;
  const [versionsResult, sourcesResult, proposalsResult] = await Promise.all([
    supabase
      .from("review_versions")
      .select("id,version_number,reason,created_at")
      .eq("review_id", reviewId)
      .order("version_number", { ascending: false }),
    supabase
      .from("review_sources")
      .select("id,source_type,source_id,source_role,created_at")
      .eq("review_id", reviewId)
      .order("created_at"),
    supabase
      .from("review_proposals")
      .select(
        "id,proposal_type,payload,status,resulting_entity_type,resulting_entity_id,resolved_at,created_at",
      )
      .eq("review_id", reviewId)
      .order("created_at", { ascending: false }),
  ]);
  const sources = await hydrateReviewSources(
    supabase,
    (sourcesResult.data ?? []) as RawReviewSource[],
  );
  return {
    review: {
      ...review,
      structured_data: normalizeStoredStructuredData(review.structured_data),
    },
    versions: versionsResult.data ?? [],
    sources,
    proposals: proposalsResult.data ?? [],
  };
}

export async function getReviewsForContext(input: {
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<CompletedReview[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("reviews")
    .select("id,review_type,title,period_start,period_end,content_markdown,completed_at")
    .eq("status", "completed")
    .is("archived_at", null)
    .lte("period_start", input.endDate)
    .gte("period_end", input.startDate)
    .order("period_end", { ascending: false })
    .limit(input.limit ?? 6);
  if (error) return [];
  const rows = (data ?? []) as CompletedReview[];
  const longRange = daysBetween(input.startDate, input.endDate) > 7;
  return rows
    .sort((a, b) => rank(b, longRange) - rank(a, longRange))
    .slice(0, input.limit ?? 6);
}

function daysBetween(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function rank(review: CompletedReview, longRange: boolean) {
  const typeScore = review.review_type === "decision" ? 30 : review.review_type === "weekly" ? 20 : 10;
  return typeScore + (longRange && review.review_type === "daily" ? -8 : 0);
}

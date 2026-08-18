import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { searchPersonalOs } from "@/features/search/queries";
import { getExperienceGraph } from "@/features/graph/queries";
import { getMemoriesForContext } from "@/features/memory/queries";
import { getReviewsForContext } from "@/features/reviews/queries";
import { addLocalDays, getDateKeyInTimeZone } from "@/features/reviews/periods";
import { excludeAiGeneratedNoteResults, listRecentNotes, type RetrievedNote } from "@/features/assistant/retrieval/notes";
import { classifyTopicTrends, findRecurringTopics, recurrenceScoreForDocument } from "@/features/assistant/retrieval/topics";
import { getSemanticRetriever } from "@/features/assistant/retrieval/semantic";
import { buildFallbackContextPlan } from "./planner";
import { rankContextCandidates } from "./ranking";
import type {
  ContextCandidate,
  PersonalContextPack,
  PersonalContextRequest,
} from "./types";

// 个人上下文的预算上限。Hang Yu 明确要求"AI 想了解多少就了解多少、不要写死"，
// 因此上限放宽到足以覆盖几万字级别的人工笔记；实际塞进上下文的量仍由检索命中
// 和排名决定，候选不足时不会硬凑。
const limits = { total: 64_000, item: 4_000, surface: 12_000, items: 64 };
const clip = (value: unknown, max = limits.item) => {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
const candidate = (
  value: Partial<ContextCandidate> &
    Pick<ContextCandidate, "key" | "domain" | "title" | "content">,
): ContextCandidate => ({
  entityType: null,
  entityId: null,
  href: null,
  timestamp: null,
  origins: [],
  reasons: [],
  score: 0,
  priority: 0,
  ...value,
});
function dedupe(items: ContextCandidate[]) {
  const map = new Map<string, ContextCandidate>();
  for (const item of items) {
    const prior = map.get(item.key);
    if (!prior) {
      map.set(item.key, item);
      continue;
    }
    map.set(item.key, {
      ...prior,
      content: prior.origins.includes("surface")
        ? prior.content
        : item.content.length > prior.content.length
          ? item.content
          : prior.content,
      origins: [...new Set([...prior.origins, ...item.origins])],
      reasons: [...new Set([...prior.reasons, ...item.reasons])],
      score: Math.max(prior.score, item.score),
    });
  }
  return [...map.values()];
}
export async function buildPersonalContext(
  request: PersonalContextRequest,
): Promise<PersonalContextPack> {
  const now = request.now ?? new Date();
  const { supabase, userId } = await requireOwner();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";
  const today = getDateKeyInTimeZone(now, timezone);
  const plan = buildFallbackContextPlan(request);
  const surface = request.currentSurface
    ? [
        candidate({
          key: request.currentEntity
            ? `${request.currentEntity.type}:${request.currentEntity.id}`
            : "surface:current",
          entityType: request.currentEntity?.type,
          entityId: request.currentEntity?.id,
          domain: "notes",
          title: request.currentSurface.title || "当前内容",
          content: clip(request.currentSurface.content, limits.surface),
          href:
            request.currentEntity?.type === "note"
              ? `/notes/${request.currentEntity.id}`
              : null,
          origins: ["surface"],
          reasons: ["当前正在编辑的内容"],
          score: 1000,
          priority: 1000,
        }),
      ]
    : [];
  const tasks: Promise<ContextCandidate[]>[] = [];
  let recentNotes: RetrievedNote[] = [];
  let recentNotesUnavailable = false;
  if (plan.recentNotes.enabled)
    tasks.push(
      (async () => {
        let result = await listRecentNotes(supabase, {
          days: plan.recentNotes.days,
          limit: plan.recentNotes.limit,
          includeDailyNotes: plan.recentNotes.includeDailyNotes,
          concepts: plan.queryConcepts,
          now,
        });
        if (
          !result.unavailable &&
          result.notes.length < plan.recentNotes.minimumNotes &&
          plan.recentNotes.expandedDays > plan.recentNotes.days
        )
          result = await listRecentNotes(supabase, {
            days: plan.recentNotes.expandedDays,
            limit: plan.recentNotes.limit,
            includeDailyNotes: plan.recentNotes.includeDailyNotes,
            concepts: plan.queryConcepts,
            now,
          });
        recentNotes = result.notes;
        recentNotesUnavailable = result.unavailable;
        return result.notes.map((note) =>
          candidate({
            key: `note:${note.id}`,
            entityType: "note",
            entityId: note.id,
            domain: "notes",
            title: note.title,
            content: clip(
              `${note.tags.length ? `标签：${note.tags.join("、")}\n` : ""}${note.excerpt}`,
            ),
            href: note.href,
            timestamp: note.updatedAt,
            origins: ["recent_notes"],
            reasons: [`最近 ${plan.recentNotes.days} 天更新的笔记`],
            score: 142,
          }),
        );
      })().catch(() => {
        recentNotesUnavailable = true;
        return [];
      }),
    );
  if (plan.includeWorkingMemory)
    tasks.push(
      (async () => {
        const [career, experiences, directions, tracks, milestones] =
          await Promise.all([
            supabase
              .from("career_profiles")
              .select(
                "current_stage,professional_headline,career_summary,target_graduation_date,target_recruitment_cycle,preferred_locations,preferred_work_types,risk_preferences,constraints_markdown,goals_markdown",
              )
              .maybeSingle(),
            supabase
              .from("experiences")
              .select(
                "id,organization,role,experience_type,start_date,location,background_markdown",
              )
              .eq("is_current", true)
              .is("archived_at", null)
              .limit(4),
            supabase
              .from("career_directions")
              .select(
                "id,name,status,priority,hypothesis_markdown,current_decision,review_date",
              )
              .in("status", ["active", "exploring"])
              .is("archived_at", null)
              .limit(6),
            supabase
              .from("career_tracks")
              .select("id,name,status,description,start_date,end_date")
              .eq("status", "active")
              .is("archived_at", null)
              .limit(4),
            supabase
              .from("career_milestones")
              .select("id,title,target_date,importance,status")
              .in("status", ["planned", "in_progress"])
              .gte("target_date", today)
              .is("archived_at", null)
              .order("target_date")
              .limit(8),
          ]);
        const out: ContextCandidate[] = [];
        if (career.data)
          out.push(
            candidate({
              key: "working:career_profile",
              domain: "profile",
              title: "当前职业状态",
              content: clip(JSON.stringify(career.data), 6000),
              origins: ["working_memory"],
              reasons: ["当前职业状态"],
              score: 180,
            }),
          );
        for (const row of [
          ...(experiences.data ?? []),
          ...(directions.data ?? []),
          ...(tracks.data ?? []),
          ...(milestones.data ?? []),
        ] as Array<Record<string, unknown>>)
          out.push(
            candidate({
              key: `working:${row.id}`,
              entityId: String(row.id),
              domain: "career",
              title: String(row.organization ?? row.name ?? row.title),
              content: clip(JSON.stringify(row)),
              origins: ["working_memory"],
              reasons: ["当前职业状态"],
              score: 175,
            }),
          );
        return out;
      })().catch(() => []),
    );
  if (plan.includeRecentHistory)
    tasks.push(
      (async () => {
        const endDate = getDateKeyInTimeZone(now, timezone);
        const lookback = /最近一个月|过去一个月|一个月|近一个月/.test(request.message)
          ? 30
          : /上周|这周|本周|最近几天/.test(request.message)
            ? 10
            : 21;
        const reviews = await getReviewsForContext({
          startDate: addLocalDays(endDate, -lookback),
          endDate,
          limit: lookback > 14 ? 6 : 5,
        });
        return reviews.map((review) =>
          candidate({
            key: `review:${review.id}`,
            entityType: "review",
            entityId: review.id,
            domain: "reviews",
            title: review.title,
            content: clip(
              `${review.review_type === "decision" ? "决定复核" : review.review_type === "weekly" ? "每周复盘" : "每日复盘"}\n周期：${review.period_start} — ${review.period_end}\n完成：${review.completed_at ?? "未记录"}\n\n${review.content_markdown}`,
              4000,
            ),
            href: "/reviews",
            timestamp: review.completed_at,
            origins: ["review"],
            reasons: ["已完成的历史复盘"],
            score: review.review_type === "decision" ? 170 : review.review_type === "weekly" ? 165 : 150,
          }),
        );
      })().catch(() => []),
    );
  if (plan.includeWorkingMemory)
    tasks.push(
      getMemoriesForContext(now)
        .then((memory) => [
          ...memory.profile.map((row) =>
            candidate({
              key: `profile_memory:${row.id}`,
              entityType: "profile_memory",
              entityId: row.id,
              domain: "memory",
              title: `Profile · ${row.title}`,
              content: clip(
                `长期个人事实\n${row.content}\n确认时间：${row.confirmed_at}`,
              ),
              origins: ["memory"],
              reasons: ["已确认的长期个人事实"],
              score: 178,
            }),
          ),
          ...memory.working.map((row) =>
            candidate({
              key: `working_memory:${row.id}`,
              entityType: "working_memory",
              entityId: row.id,
              domain: "memory",
              title: `Working · ${row.title}`,
              content: clip(
                `当前状态\n${row.content}\n有效至：${row.valid_until ?? "未设"}\n复核：${row.review_at ?? "未设"}`,
              ),
              origins: ["memory"],
              reasons: ["当前有效的 Working Memory"],
              score: 179,
            }),
          ),
          ...memory.decisions.map((row) =>
            candidate({
              key: `decision:${row.id}`,
              entityType: "decision",
              entityId: row.id,
              domain: "memory",
              title: `Decision · ${row.title}`,
              content: clip(
                `重要决定\n决定：${row.decision_text}\n理由：${row.rationale_markdown}\n状态：${row.status}\n决定时间：${row.decided_at}`,
              ),
              origins: ["memory"],
              reasons: ["当前有效的重要决定"],
              score: 177,
            }),
          ),
        ])
        .catch(() => []),
    );
  if (plan.includeTimeContext)
    tasks.push(
      (async () => {
        const from = new Date(now.getTime() - 7 * 864e5).toISOString();
        const until = new Date(now.getTime() + 14 * 864e5).toISOString();
        const milestoneUntil = addLocalDays(today, 14);
        const [events, todos, milestones] = await Promise.all([
          supabase
            .from("calendar_events")
            .select("id,subject,starts_at,ends_at,is_all_day,location_name")
            .lt("starts_at", until)
            .gt("ends_at", from)
            .is("archived_at", null)
            .limit(20),
          supabase
            .from("microsoft_todo_tasks")
            .select("id,title,body_text,status,importance,due_at,completed_at")
            .or(`due_at.lte.${until},completed_at.gte.${from}`)
            .is("archived_at", null)
            .limit(20),
          supabase
            .from("career_milestones")
            .select("id,title,target_date,importance,status")
            .in("status", ["planned", "in_progress"])
            .gte("target_date", today)
            .lte("target_date", milestoneUntil)
            .is("archived_at", null)
            .limit(8),
        ]);
        return [
          ...(events.data ?? []).map((row) =>
            candidate({
              key: `calendar_event:${row.id}`,
              entityType: "calendar_event",
              entityId: row.id,
              domain: "calendar",
              title: row.subject,
              content: clip(JSON.stringify(row)),
              href: "/calendar",
              origins: ["time"],
              reasons: ["近期日程"],
              score: 160,
            }),
          ),
          ...(todos.data ?? []).map((row) =>
            candidate({
              key: `todo_task:${row.id}`,
              entityType: "todo_task",
              entityId: row.id,
              domain: "tasks",
              title: row.title,
              content: clip(JSON.stringify(row)),
              href: "/tasks",
              origins: ["time"],
              reasons: ["近期任务"],
              score: 160,
            }),
          ),
          ...(milestones.data ?? []).map((row) =>
            candidate({
              key: `career_milestone:${row.id}`,
              entityType: "career_milestone",
              entityId: row.id,
              domain: "career",
              title: row.title,
              content: clip(JSON.stringify(row)),
              href: "/career/roadmap",
              origins: ["time"],
              reasons: ["近期职业节点"],
              score: 160,
            }),
          ),
        ];
      })().catch(() => []),
    );
  const collected = await Promise.all(tasks);
  const searchResults = await Promise.all(
    plan.searchQueries.map((query) =>
      searchPersonalOs({
        query: query.query,
        domains: query.domains,
        limit: 8,
      }).catch(() => []),
    ),
  );
  const humanSearchResults = await excludeAiGeneratedNoteResults(supabase, searchResults.flat());
  const search = humanSearchResults
    .slice(0, 12)
    .map((row) =>
      candidate({
        key: `${row.entityType}:${row.entityId}`,
        entityType: row.entityType,
        entityId: row.entityId,
        domain: row.domain,
        title: row.title,
        content: clip([row.subtitle, row.snippet].filter(Boolean).join("\n")),
        href: row.href,
        timestamp: row.sourceUpdatedAt,
        origins: ["search"],
        reasons: ["搜索匹配"],
        score: 120 + row.score,
      }),
    );
  let semantic: ContextCandidate[] = [];
  let semanticAvailable = false;
  const semanticRetriever = plan.useSemantic ? getSemanticRetriever() : null;
  if (semanticRetriever && (await semanticRetriever.isAvailable().catch(() => false))) {
    semanticAvailable = true;
    const semanticQuery = plan.queryConcepts.join(" ") || request.message;
    const semanticDomains = plan.searchQueries[0]?.domains ?? ["notes"];
    semantic = await semanticRetriever
      .search({ query: semanticQuery, domains: semanticDomains, limit: 10 })
      .then((rows) => excludeAiGeneratedNoteResults(supabase, rows))
      .then((rows) =>
        rows.map((row) =>
          candidate({
            key: `${row.entityType}:${row.entityId}`,
            entityType: row.entityType,
            entityId: row.entityId,
            domain: row.entityType === "note" ? "notes" : "search",
            title: row.title,
            content: clip(row.excerpt),
            href: row.href,
            origins: ["search"],
            reasons: ["语义检索匹配"],
            score: 130 + row.score,
          }),
        ),
      )
      .catch(() => []);
  }
  let graph: ContextCandidate[] = [];
  if (plan.expandGraph && request.currentEntity?.type === "experience") {
    try {
      const resolved = await getExperienceGraph(
        request.currentEntity.id,
        request.currentSurface?.title || request.message,
      );
      graph = resolved.related.slice(0, 5).map((row) =>
        candidate({
          key: `${row.type}:${row.id}`,
          entityType: row.type,
          entityId: row.id,
          domain:
            row.type === "note"
              ? "notes"
              : row.type === "document"
                ? "files"
                : row.type === "todo_task"
                  ? "tasks"
                  : row.type === "calendar_event"
                    ? "calendar"
                    : "career",
          title: row.title,
          content: row.title,
          href: row.href,
          origins: ["graph"],
          reasons: ["与当前经历存在直接关联"],
          score: 90,
        }),
      );
    } catch {
      graph = [];
    }
  }
  const recurringTopics = findRecurringTopics(
    recentNotes.map((note) => ({ id: note.id, title: note.title, content: note.bodyMarkdown })),
  );
  const topicTrends = classifyTopicTrends(
    recentNotes.map((note) => ({
      id: note.id,
      title: note.title,
      content: note.bodyMarkdown,
      updatedAt: note.updatedAt,
    })),
    now,
  );
  const withRecurrence = dedupe([
    ...surface,
    ...collected.flat(),
    ...search,
    ...semantic,
    ...graph,
  ]).map((item) => ({
    ...item,
    recurrence:
      item.entityType === "note" && item.entityId
        ? recurrenceScoreForDocument(item.entityId, recurringTopics)
        : 0,
  }));
  const ranked = rankContextCandidates(withRecurrence, now, plan.recipe);
  let used = 0;
  const selected = ranked
    .filter((item) => {
      if (used + item.content.length > limits.total || used >= limits.items)
        return false;
      used += item.content.length;
      return true;
    })
    .map((item, index) => ({ ...item, id: `S${index + 1}` }));
  return {
    version: "personal-context/v1",
    generatedAt: now.toISOString(),
    timezone,
    request: { surface: request.surface, intent: plan.intent },
    plan,
    sources: selected,
    diagnostics: {
      candidateCount: ranked.length,
      selectedCount: selected.length,
      totalChars: used,
      truncated: selected.length < ranked.length,
      available: {
        workingMemory:
          !plan.includeWorkingMemory ||
          collected.some((group) =>
            group.some(
              (item) =>
                item.origins.includes("working_memory") ||
                item.origins.includes("memory"),
            ),
          ),
        reviews: !plan.includeRecentHistory || collected.some((group) => group.some((item) => item.domain === "reviews")),
        timeContext:
          !plan.includeTimeContext ||
          collected.some((group) =>
            group.some((item) => item.origins.includes("time")),
          ),
        search: Boolean(
          plan.searchQueries.length === 0 || searchResults.length,
        ),
        graph: !plan.expandGraph || Boolean(graph),
        recentNotes: !plan.recentNotes.enabled || !recentNotesUnavailable,
        semantic: !plan.useSemantic || semanticAvailable,
      },
      recipe: plan.recipe,
      retrievalWindowDays:
        recentNotes.length < plan.recentNotes.minimumNotes
          ? plan.recentNotes.expandedDays
          : plan.recentNotes.days,
      recurringTopics: recurringTopics.map((topic) => ({
        topic: topic.topic,
        occurrences: topic.occurrences,
        sourceIds: topic.documentIds,
      })),
      topicTrends: topicTrends.map((topic) => ({
        topic: topic.topic,
        trend: topic.trend,
        recentCount: topic.recentCount,
        previousCount: topic.previousCount,
        sourceIds: topic.documentIds,
      })),
    },
  };
}

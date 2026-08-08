import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { searchPersonalOs } from "@/features/search/queries";
import { getExperienceGraph } from "@/features/graph/queries";
import { buildFallbackContextPlan } from "./planner";
import type {
  ContextCandidate,
  PersonalContextPack,
  PersonalContextRequest,
} from "./types";

const limits = { total: 22_000, item: 2_400, surface: 6_000, items: 22 };
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
          origins: ["surface"],
          reasons: ["当前正在编辑的内容"],
          score: 1000,
          priority: 1000,
        }),
      ]
    : [];
  const tasks: Promise<ContextCandidate[]>[] = [];
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
              .gte("target_date", now.toISOString().slice(0, 10))
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
  if (plan.includeTimeContext)
    tasks.push(
      (async () => {
        const from = new Date(now.getTime() - 7 * 864e5).toISOString();
        const until = new Date(now.getTime() + 14 * 864e5).toISOString();
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
            .gte("target_date", now.toISOString().slice(0, 10))
            .lte("target_date", until.slice(0, 10))
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
  const search = searchResults
    .flat()
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
  let graph: ContextCandidate[] = [];
  if (plan.expandGraph && request.currentEntity?.type === "experience") {
    try {
      const resolved = await getExperienceGraph(
        request.currentEntity.id,
        request.currentSurface?.title || request.message,
      );
      graph = resolved.related
        .slice(0, 5)
        .map((row) =>
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
  const ranked = dedupe([
    ...surface,
    ...collected.flat(),
    ...search,
    ...graph,
  ]).sort((a, b) => b.score - a.score);
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
        workingMemory: !plan.includeWorkingMemory || Boolean(collected[0]),
        timeContext: !plan.includeTimeContext || Boolean(collected.at(-1)),
        search: Boolean(
          plan.searchQueries.length === 0 || searchResults.length,
        ),
        graph: !plan.expandGraph || Boolean(graph),
      },
    },
  };
}

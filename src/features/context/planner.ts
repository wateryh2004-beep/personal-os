import type { ContextPlan, PersonalContextRequest } from "./types";
import type { SearchDomain } from "@/features/search/types";
import { routeCognitiveTask, type CognitiveRoute } from "@/features/assistant/cognitive-router";

function legacyIntent(route: CognitiveRoute): ContextPlan["intent"] {
  if (route.signals.includes("identity_context")) return "personal_analysis";
  if (route.recipe === "career_strategy") return "career_analysis";
  if (route.recipe === "time_planning" || route.recipe === "mutation_request") return "time_planning";
  if (route.recipe === "current_document") return "current_document";
  if (["semantic_recall", "factual_lookup"].includes(route.recipe)) return "knowledge";
  return "personal_analysis";
}

export function buildFallbackContextPlan(
  request: PersonalContextRequest,
): ContextPlan {
  const route = request.cognitiveRoute ?? routeCognitiveTask({
    message: request.message,
    surface: request.surface === "global" ? "global" : request.surface,
    hasCurrentDocument: Boolean(request.currentSurface),
  });
  // 助手对话（笔记库 surface 映射为 notes，以及全局助手 global，均无当前编辑文档）：
  // Hang Yu 希望 AI 想了解多少就了解多少，因此强制开启最近笔记 + 复盘，扩大时间窗
  // 与条数，不再依赖认知路由恰好命中某个 recipe。
  const openConversation =
    (request.surface === "notes" || request.surface === "global") &&
    !request.currentSurface;
  const analytical = route.complexity === "analytical";
  // 兜底语义：openConversation 只在该路由自己没带 recent_notes 时（如默认的
  // factual_lookup）才强制全量开放；路由已正确命中（如 retrospective_thinking）
  // 时保留它自己的时间窗。
  const forceWideWindow = openConversation && !route.capabilities.includes("recent_notes");
  const recentNotes =
    route.capabilities.includes("recent_notes") || openConversation;
  const workingMemory =
    route.capabilities.includes("working_memory") || analytical;
  const timeContext = route.capabilities.includes("time_context");
  const recentHistory =
    route.capabilities.includes("reviews") || recentNotes || openConversation;
  const domains: SearchDomain[] = route.recipe === "career_strategy"
    ? ["career", "notes", "reviews", "tasks", "calendar", "files"]
    : route.preferredDomains.filter((domain): domain is SearchDomain =>
        ["notes", "career", "files", "tasks", "calendar", "reviews"].includes(domain),
      );
  const shouldSearch =
    route.recipe !== "retrospective_thinking" &&
    route.capabilities.includes("lexical_search") &&
    route.queryConcepts.length > 0;
  return {
    intent: legacyIntent(route),
    recipe: route.recipe,
    complexity: route.complexity,
    requiresReasoning: route.requiresReasoning,
    includeWorkingMemory: workingMemory,
    includeTimeContext: timeContext,
    includeRecentHistory: recentHistory,
    recentNotes: {
      enabled: recentNotes,
      days: forceWideWindow
        ? Math.max(route.timeWindow.days, 90)
        : route.timeWindow.days,
      expandedDays: forceWideWindow
        ? Math.max(route.timeWindow.expandedDays, 365)
        : route.timeWindow.expandedDays,
      minimumNotes: route.timeWindow.minimumRecentNotes,
      limit: analytical ? 24 : forceWideWindow ? 50 : 12,
      includeDailyNotes: true,
    },
    retrievalOrder: route.capabilities,
    useSemantic: route.capabilities.includes("semantic_search"),
    queryConcepts: route.queryConcepts,
    expandGraph: Boolean(request.currentEntity) || route.capabilities.includes("graph"),
    searchQueries: shouldSearch
      ? route.queryConcepts.slice(0, 4).map((query) => ({ query, domains, reason: "认知路由提取的主题" }))
      : [],
  };
}

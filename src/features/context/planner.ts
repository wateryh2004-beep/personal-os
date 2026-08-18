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
  // 笔记库对话（notes-library，surface 映射为 notes 且无当前文档）：Hang Yu 希望
  // AI 想了解多少就了解多少，因此强制开启最近笔记 + 复盘，扩大时间窗与条数，
  // 不再依赖认知路由恰好命中某个 recipe。
  const notesLibraryConversation =
    request.surface === "notes" && !request.currentSurface;
  const analytical = route.complexity === "analytical";
  const recentNotes =
    route.capabilities.includes("recent_notes") || notesLibraryConversation;
  const workingMemory =
    route.capabilities.includes("working_memory") || analytical;
  const timeContext = route.capabilities.includes("time_context");
  const recentHistory =
    route.capabilities.includes("reviews") ||
    recentNotes ||
    notesLibraryConversation;
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
      days: notesLibraryConversation
        ? Math.max(route.timeWindow.days, 90)
        : route.timeWindow.days,
      expandedDays: notesLibraryConversation
        ? Math.max(route.timeWindow.expandedDays, 365)
        : route.timeWindow.expandedDays,
      minimumNotes: route.timeWindow.minimumRecentNotes,
      limit: analytical ? 24 : notesLibraryConversation ? 50 : 12,
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

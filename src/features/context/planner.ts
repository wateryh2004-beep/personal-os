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
  const analytical = route.complexity === "analytical";
  // Default to the current surface and direct entities. Historical material is
  // eligible only when the deterministic route explicitly requests it.
  const recentNotes = route.capabilities.includes("recent_notes");
  const workingMemory =
    route.capabilities.includes("working_memory") || analytical;
  const timeContext = route.capabilities.includes("time_context");
  const recentHistory = route.capabilities.includes("reviews");
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
      days: route.timeWindow.days,
      expandedDays: route.timeWindow.expandedDays,
      minimumNotes: route.timeWindow.minimumRecentNotes,
      limit: analytical ? 16 : 8,
      includeDailyNotes: true,
    },
    retrievalOrder: route.capabilities,
    // Semantic retrieval requires a separate explicit user opt-in.
    useSemantic: false,
    queryConcepts: route.queryConcepts,
    expandGraph: Boolean(request.currentEntity) || route.capabilities.includes("graph"),
    expansionReason: recentNotes || recentHistory || shouldSearch || route.capabilities.includes("graph")
      ? `认知路由 ${route.recipe} 明确要求跨实体检索。`
      : null,
    searchQueries: shouldSearch
      ? route.queryConcepts.slice(0, 4).map((query) => ({ query, domains, reason: "认知路由提取的主题" }))
      : [],
  };
}

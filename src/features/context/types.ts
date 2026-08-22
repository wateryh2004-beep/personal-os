import type { GraphEntityRef } from "@/features/graph/types";
import type { SearchDomain } from "@/features/search/types";
import type { CognitiveComplexity, CognitiveRecipe, RetrievalCapability } from "@/features/assistant/recipes/types";
import type { CognitiveRoute } from "@/features/assistant/cognitive-router";

export type ContextSurface =
  | "global"
  | "notes"
  | "career"
  | "calendar"
  | "tasks"
  | "now";
export type ContextIntent =
  | "personal_analysis"
  | "career_analysis"
  | "time_planning"
  | "recall"
  | "knowledge"
  | "current_document"
  | "general";
export type PersonalContextRequest = {
  message: string;
  surface: ContextSurface;
  currentEntity?: GraphEntityRef | null;
  currentSurface?: {
    type: "note_draft" | "text";
    title?: string | null;
    content: string;
  } | null;
  now?: Date;
  cognitiveRoute?: CognitiveRoute;
};
export type ContextPlan = {
  intent: ContextIntent;
  recipe: CognitiveRecipe;
  complexity: CognitiveComplexity;
  requiresReasoning: boolean;
  includeWorkingMemory: boolean;
  includeTimeContext: boolean;
  includeRecentHistory: boolean;
  recentNotes: {
    enabled: boolean;
    days: number;
    expandedDays: number;
    minimumNotes: number;
    limit: number;
    includeDailyNotes: boolean;
  };
  retrievalOrder: RetrievalCapability[];
  useSemantic: boolean;
  queryConcepts: string[];
  searchQueries: Array<{
    query: string;
    domains: SearchDomain[];
    reason: string;
  }>;
  expandGraph: boolean;
  /** Why this request is allowed to leave the current surface/direct entity. */
  expansionReason: string | null;
};
export type ContextOrigin =
  | "surface"
  | "working_memory"
  | "memory"
  | "review"
  | "recent_notes"
  | "time"
  | "search"
  | "graph";
export type ContextCandidate = {
  key: string;
  entityType?: string | null;
  entityId?: string | null;
  domain: string;
  title: string;
  content: string;
  href?: string | null;
  timestamp?: string | null;
  origins: ContextOrigin[];
  reasons: string[];
  score: number;
  priority: number;
  relevance?: number;
  authority?: number;
  stability?: number;
  recency?: number;
  recurrence?: number;
  finalScore?: number;
};
export type PersonalContextSource = Omit<
  ContextCandidate,
  "key" | "score" | "priority"
> & { id: string };
export type PersonalContextPack = {
  version: "personal-context/v1";
  generatedAt: string;
  timezone: string;
  request: { surface: ContextSurface; intent: ContextIntent };
  plan: ContextPlan;
  sources: PersonalContextSource[];
  diagnostics: {
    candidateCount: number;
    selectedCount: number;
    totalChars: number;
    truncated: boolean;
    available: {
      workingMemory: boolean;
      reviews: boolean;
      timeContext: boolean;
      search: boolean;
      graph: boolean;
      recentNotes: boolean;
      semantic: boolean;
    };
    recipe: CognitiveRecipe;
    retrievalWindowDays: number;
    recurringTopics: Array<{ topic: string; occurrences: number; sourceIds: string[] }>;
    topicTrends: Array<{
      topic: string;
      trend: "emerging" | "warming" | "recurring" | "fading";
      recentCount: number;
      previousCount: number;
      sourceIds: string[];
    }>;
  };
};

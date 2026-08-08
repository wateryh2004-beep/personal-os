import type { GraphEntityRef } from "@/features/graph/types";
import type { SearchDomain } from "@/features/search/types";

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
};
export type ContextPlan = {
  intent: ContextIntent;
  includeWorkingMemory: boolean;
  includeTimeContext: boolean;
  includeRecentHistory: boolean;
  searchQueries: Array<{
    query: string;
    domains: SearchDomain[];
    reason: string;
  }>;
  expandGraph: boolean;
};
export type ContextOrigin =
  | "surface"
  | "working_memory"
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
      timeContext: boolean;
      search: boolean;
      graph: boolean;
    };
  };
};

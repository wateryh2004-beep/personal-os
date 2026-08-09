import type { AssistantToolGroup } from "../types";

export type CognitiveRecipe =
  | "factual_lookup"
  | "semantic_recall"
  | "retrospective_thinking"
  | "belief_change"
  | "contradiction_detection"
  | "decision_support"
  | "open_loops"
  | "trajectory_analysis"
  | "next_best_action"
  | "career_strategy"
  | "time_planning"
  | "current_document"
  | "mutation_request";

export type CognitiveComplexity = "simple" | "moderate" | "analytical";

export type RetrievalCapability =
  | "working_memory"
  | "recent_notes"
  | "lexical_search"
  | "semantic_search"
  | "reviews"
  | "time_context"
  | "graph"
  | "current_document";

export type CognitiveRecipeDefinition = {
  recipe: CognitiveRecipe;
  objective: string;
  complexity: CognitiveComplexity;
  defaultTimeWindowDays: number;
  expandedTimeWindowDays: number;
  minimumRecentNotes: number;
  retrievalOrder: RetrievalCapability[];
  requiredSources: string[];
  synthesisRules: string[];
  uncertaintyRules: string[];
  answerContract: string[];
  toolGroups: AssistantToolGroup[];
};

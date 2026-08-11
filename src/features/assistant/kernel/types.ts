import type { AssistantSurface } from "../types";

export const personalOsModuleIds = ["notes", "career", "memory", "calendar", "tasks", "reviews", "files", "briefing", "projects", "inbox", "shopping", "travel"] as const;
export type PersonalOsModuleId = (typeof personalOsModuleIds)[number];
export type ContextMode = "none" | "local" | "targeted" | "cross_module" | "action";
export type RequestComplexity = "simple" | "moderate" | "deep";
export type ContextGateDecision = {
  mode: ContextMode;
  complexity: RequestComplexity;
  likelyModules: PersonalOsModuleId[];
  suggestedSkills: string[];
  needsPersonalData: boolean;
  needsTools: boolean;
  needsCurrentSurface: boolean;
  reasonCode: "general_knowledge" | "conversation_only" | "current_surface" | "personal_fact" | "personal_analysis" | "retrieval" | "time_context" | "mutation" | "cross_domain";
};
export type AgentSessionState = {
  activeGoal?: string;
  activeTopic?: string;
  referencedEntities: Array<{ module: PersonalOsModuleId; entityType: string; entityId: string; label: string }>;
  activeConstraints: string[];
  activeSkills: string[];
  loadedModules: PersonalOsModuleId[];
  loadedSourceIds: string[];
  discoveredToolNames: string[];
  pendingActionIds: string[];
  lastContextMode?: ContextMode;
  updatedAt: string;
};
export type KernelRequestContext = { message: string; surface: AssistantSurface; currentPath?: string | null; hasCurrentSurface: boolean; requiresCurrentSurface?: boolean; usePersonalContext?: boolean; };

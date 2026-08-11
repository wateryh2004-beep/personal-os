import type { UIMessage } from "ai";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import type { GraphEntityRef } from "@/features/graph/types";

export const assistantSurfaces = [
  "notes",
  "calendar",
  "tasks",
  "inbox",
  "career",
  "reviews",
  "global",
] as const;
export type AssistantSurface = (typeof assistantSurfaces)[number];
export type AssistantMode = "chat" | "transform" | "triage";
export type AssistantRequest = {
  surface: AssistantSurface;
  mode: AssistantMode;
  messages?: UIMessage[];
  instruction?: string | null;
  model?: DeepSeekModelId | null;
  currentEntity?: GraphEntityRef | null;
  currentSurface?: {
    type:
      | "note_draft"
      | "calendar_view"
      | "task_workspace"
      | "inbox_item"
      | "career_entity"
      | "review_evidence"
      | "global_page";
    title?: string | null;
    content?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  operation?: string | null;
  /** A transform must fail before model invocation when its edited surface is absent. */
  requiresCurrentSurface?: boolean;
  usePersonalContext?: boolean;
  runId?: string | null;
  currentPath?: string | null;
};
export type AssistantToolGroup =
  | "meta"
  | "context_read"
  | "reviews_read"
  | "briefing_read"
  | "search"
  | "calendar_read"
  | "calendar_proposal"
  | "todo_read"
  | "todo_proposal"
  | "inbox_proposal"
  | "notes_read"
  | "notes_proposal"
  | "career_read"
  | "career_proposal"
  | "memory_read"
  | "memory_proposal"
  | "projects_read"
  | "projects_proposal"
  | "files_read"
  | "shopping_read"
  | "shopping_proposal"
  | "travel_read"
  | "travel_proposal";
export type AssistantToolRisk = "read" | "proposal" | "execute";
export type AgentRiskLevel = "read" | "low" | "medium" | "high";
export type AgentRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type AgentActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "conflict";
export type AgentSource = {
  id: string;
  domain: string;
  title: string;
  href?: string | null;
  updatedAt?: string | null;
};
export type AgentAction = {
  id: string;
  runId: string;
  domain: "calendar" | "tasks" | "notes" | "career" | "memory" | "projects" | "shopping" | "travel";
  actionType: string;
  status: AgentActionStatus;
  preview: Record<string, unknown>;
  riskLevel: Exclude<AgentRiskLevel, "read">;
  errorCode?: string | null;
  result?: Record<string, unknown>;
};
export type AssistantResult = {
  status: "success" | "error";
  text: string;
  modelId?: DeepSeekModelId;
  contextSources: Array<{
    id: string;
    title: string;
    domain: string;
    href?: string | null;
    reasons: string[];
  }>;
};

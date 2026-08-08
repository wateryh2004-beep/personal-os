import type { UIMessage } from "ai";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import type { GraphEntityRef } from "@/features/graph/types";

export const assistantSurfaces = [
  "notes",
  "calendar",
  "tasks",
  "inbox",
  "career",
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
      | "career_entity";
    title?: string | null;
    content?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  operation?: string | null;
  usePersonalContext?: boolean;
};
export type AssistantToolGroup =
  | "calendar_read"
  | "calendar_proposal"
  | "todo_read"
  | "todo_proposal"
  | "inbox_proposal";
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

import type { GraphEntityRef } from "@/features/graph/types";

export const assistantContextEvent = "personal-os:assistant-context";

export type AssistantLiveContext = {
  surface: "calendar" | "tasks";
  entity: GraphEntityRef | null;
  title?: string | null;
  content?: string | null;
};

export function publishAssistantContext(context: AssistantLiveContext) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AssistantLiveContext>(assistantContextEvent, { detail: context }));
}

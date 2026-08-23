import type { GraphEntityRef } from "@/features/graph/types";

export const assistantContextEvent = "personal-os:assistant-context";

export type AssistantLiveContext = {
  surface: "calendar" | "tasks";
  entity: GraphEntityRef | null;
  title?: string | null;
  content?: string | null;
};

let activeContext: AssistantLiveContext | null = null;

export function publishAssistantContext(context: AssistantLiveContext) {
  activeContext = context.entity ? context : null;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AssistantLiveContext>(assistantContextEvent, { detail: context }));
}

export function getAssistantContext() {
  return activeContext;
}

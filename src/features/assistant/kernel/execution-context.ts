import type { AssistantRequest } from "../types";

export type CurrentSurfaceContext = {
  title: string | null | undefined;
  content: string;
};

export type AiExecutionContext = {
  currentSurface: CurrentSurfaceContext | null;
  personalContextEnabled: boolean;
  requiresCurrentSurface: boolean;
};

export const MAX_CURRENT_SURFACE_CHARS = 20_000;

/**
 * Canonical context contract: direct surface input is never selected through
 * RAG and personal context can only be additive.
 */
export function buildAiExecutionContext(input: Pick<AssistantRequest, "requiresCurrentSurface" | "usePersonalContext"> & { currentSurface: CurrentSurfaceContext | null }) : AiExecutionContext {
  if (input.requiresCurrentSurface && !input.currentSurface?.content.trim()) throw new Error("current_surface_required");
  if (input.currentSurface && input.currentSurface.content.length > MAX_CURRENT_SURFACE_CHARS) throw new Error("current_surface_too_long");
  return {
    currentSurface: input.currentSurface,
    personalContextEnabled: Boolean(input.usePersonalContext),
    requiresCurrentSurface: Boolean(input.requiresCurrentSurface),
  };
}

export function formatCurrentSurfaceForModel(context: AiExecutionContext) {
  if (!context.currentSurface) return null;
  return `${context.currentSurface.title ?? "当前内容"}\n${context.currentSurface.content}`;
}

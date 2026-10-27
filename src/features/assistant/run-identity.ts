import { z } from "zod";
import { assistantSurfaces, type AssistantSurface } from "./types";
import { graphEntityRefSchema, type GraphEntityRef } from "@/features/graph/types";
import { personalOsModuleIds, type AgentSessionState } from "./kernel/types";

export type RunExpectation = { surface: AssistantSurface; currentEntity?: GraphEntityRef | null };
export type RunBinding = { surface: AssistantSurface; currentEntity: GraphEntityRef | null };
const bindingSchema = z.object({ surface: z.enum(assistantSurfaces), currentEntity: graphEntityRefSchema.nullable() }).strict();
const list = z.array(z.string().max(300)).max(100);
const kernelSchema = z.object({
  binding: bindingSchema.optional(), activeGoal: z.string().max(300).optional(), activeTopic: z.string().max(300).optional(),
  referencedEntities: z.array(z.object({ module: z.enum(personalOsModuleIds), entityType: z.string().max(100), entityId: z.string().uuid(), label: z.string().max(240) })).max(100).optional(),
  activeConstraints: list.optional(), activeSkills: list.optional(), loadedModules: z.array(z.enum(personalOsModuleIds)).max(100).optional(), loadedSourceIds: list.optional(), discoveredToolNames: list.optional(), pendingActionIds: z.array(z.string().uuid()).max(100).optional(),
  lastContextMode: z.enum(["none", "local", "targeted", "cross_module", "action"]).optional(), updatedAt: z.string().datetime().optional(),
});
export class AgentRunBusyError extends Error { constructor() { super("agent_run_busy"); } }
export class AgentRunIdentityError extends Error { constructor() { super("agent_run_identity_conflict"); } }
export function validateRunBinding(binding: RunBinding) {
  const parsed = bindingSchema.safeParse(binding);
  if (!parsed.success) throw new AgentRunIdentityError();
  const { surface, currentEntity: entity } = parsed.data;
  if ((surface === "tasks" && entity && entity.type !== "todo_task") || (surface === "calendar" && entity && entity.type !== "calendar_event") || (surface === "career" && entity?.type !== "experience") || (surface === "notes" && entity?.type !== "note") || (surface === "notes-library" && entity)) throw new AgentRunIdentityError();
  return parsed.data;
}
export function assertRunIdentity(row: { surface: string; current_entity_type: string | null; current_entity_id: string | null; kernel_state?: unknown }, expected?: RunExpectation) {
  if (Boolean(row.current_entity_type) !== Boolean(row.current_entity_id)) throw new AgentRunIdentityError();
  const binding = validateRunBinding({ surface: row.surface as AssistantSurface, currentEntity: row.current_entity_id ? { type: row.current_entity_type, id: row.current_entity_id } as GraphEntityRef : null });
  if (expected && (expected.surface !== binding.surface || ("currentEntity" in expected && JSON.stringify(validateRunBinding({ surface: expected.surface, currentEntity: expected.currentEntity ?? null })) !== JSON.stringify(binding)))) throw new AgentRunIdentityError();
  if (row.kernel_state == null) return { binding, kernel: null };
  const parsed = kernelSchema.safeParse(row.kernel_state);
  if (!parsed.success || (parsed.data.binding && JSON.stringify(parsed.data.binding) !== JSON.stringify(binding))) throw new AgentRunIdentityError();
  // Legacy kernels have no proven binding: keep their recorded history read-only,
  // but do not carry their inferred goals/tools into a newly resumed generation.
  return { binding, kernel: parsed.data.binding ? parsed.data as Partial<AgentSessionState> : null };
}

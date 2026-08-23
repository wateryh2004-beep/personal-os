import type { AssistantToolGroup } from "../types";
import { assistantToolRegistry } from "../tools/registry";
import type { ContextGateDecision, PersonalOsModuleId } from "./types";

type ModuleToolGroups = { read: AssistantToolGroup[]; proposal: AssistantToolGroup[] };

const toolGroupsByModule: Record<PersonalOsModuleId, ModuleToolGroups> = {
  notes: { read: ["notes_read"], proposal: ["notes_proposal"] },
  career: { read: ["career_read"], proposal: ["career_proposal"] },
  memory: { read: ["memory_read"], proposal: ["memory_proposal"] },
  calendar: { read: ["calendar_read"], proposal: ["calendar_proposal"] },
  tasks: { read: ["todo_read"], proposal: ["todo_proposal"] },
  reviews: { read: ["reviews_read"], proposal: [] },
  files: { read: ["files_read"], proposal: [] },
  briefing: { read: ["briefing_read"], proposal: [] },
  projects: { read: ["projects_read"], proposal: ["projects_proposal"] },
  inbox: { read: ["inbox_read"], proposal: ["inbox_proposal"] },
  shopping: { read: ["shopping_read"], proposal: ["shopping_proposal"] },
  travel: { read: ["travel_read"], proposal: ["travel_proposal"] },
};

const modelVisibleLegacyAliases = new Set(["proposeTodoTask"]);

/**
 * Select the provider-visible tools before creating ToolLoopAgent.
 *
 * Providers receive the schema for every tool passed at construction time, so
 * unrelated tools must be removed here rather than merely hidden per step.
 * Action requests get a slightly larger budget so linked modules retain their
 * proposal tools instead of being truncated by global registry order.
 */
export function initialToolNames(decision: ContextGateDecision) {
  if (!decision.needsTools) return [];

  const groups = new Set<AssistantToolGroup>();
  for (const moduleId of decision.likelyModules) {
    const moduleGroups = toolGroupsByModule[moduleId];
    moduleGroups.read.forEach((group) => groups.add(group));
    if (decision.mode === "action") moduleGroups.proposal.forEach((group) => groups.add(group));
  }

  // Deep cross-module synthesis benefits from compact global search. Operational
  // requests should use their dedicated module readers instead of adding a meta
  // retrieval layer that cannot discover new runtime tools anyway.
  if (decision.mode === "cross_module") groups.add("search");

  const maxTools = decision.mode === "action" ? 18 : 12;
  return assistantToolRegistry
    .filter(
      (definition) =>
        groups.has(definition.group) &&
        definition.risk !== "execute" &&
        !modelVisibleLegacyAliases.has(definition.name),
    )
    .map((definition) => definition.name)
    .slice(0, maxTools);
}

/** Keep every agent step on the exact capability set selected at request start. */
export function createPrepareStep(input: { initialToolNames: string[] }) {
  const activeTools = [...new Set(input.initialToolNames)];
  return async () => ({ activeTools });
}

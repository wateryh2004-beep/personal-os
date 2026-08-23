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

/**
 * Select the provider-visible tools before creating ToolLoopAgent.
 *
 * This is intentionally stricter than prepareStep.activeTools: providers receive
 * the schema for every tool passed to the agent at construction time, so hiding
 * an unrelated tool later cannot protect a request from a malformed schema.
 */
export function initialToolNames(decision: ContextGateDecision) {
  if (!decision.needsTools) return [];

  const groups = new Set<AssistantToolGroup>();
  for (const moduleId of decision.likelyModules) {
    const moduleGroups = toolGroupsByModule[moduleId];
    moduleGroups.read.forEach((group) => groups.add(group));
    if (decision.mode === "action") moduleGroups.proposal.forEach((group) => groups.add(group));
  }

  // Cross-module retrieval benefits from one compact search tool. Single-module
  // requests should use that module's purpose-built readers instead.
  if (decision.mode === "cross_module" || decision.likelyModules.length > 1) groups.add("search");

  return assistantToolRegistry
    .filter((definition) => groups.has(definition.group) && definition.risk !== "execute")
    .map((definition) => definition.name)
    .slice(0, 12);
}

/** Keep every agent step on the exact capability set selected at request start. */
export function createPrepareStep(input: { initialToolNames: string[] }) {
  const activeTools = [...new Set(input.initialToolNames)];
  return async () => ({ activeTools });
}

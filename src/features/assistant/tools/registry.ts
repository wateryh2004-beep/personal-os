import type { AssistantToolGroup } from "../types";
import type {
  AssistantToolDefinition,
  AssistantToolModule,
} from "./types";
import { calendarTools } from "./calendar";
import { taskTools } from "./tasks";
import { noteTools } from "./notes";
import { careerTools } from "./career";
import { memoryTools } from "./memory";
import { projectTools } from "./projects";
import { fileTools } from "./files";
import { searchTools } from "./search";
import { inboxTools } from "./inbox";
import { metaTools } from "./meta";
import { contextTools } from "./context";
import { briefingTools } from "./briefing";
import { reviewTools } from "./reviews";
import { lifeTools } from "./life";
import type { PersonalOsModuleId } from "../kernel/types";

export const assistantToolModules: AssistantToolModule[] = [
  metaTools,
  contextTools,
  briefingTools,
  reviewTools,
  searchTools,
  calendarTools,
  taskTools,
  noteTools,
  careerTools,
  memoryTools,
  projectTools,
  fileTools,
  inboxTools,
  lifeTools,
];

const moduleForGroup: Partial<Record<AssistantToolGroup, PersonalOsModuleId | "meta">> = { meta:"meta", context_read:"memory", reviews_read:"reviews", briefing_read:"briefing", search:"notes", calendar_read:"calendar", calendar_proposal:"calendar", todo_read:"tasks", todo_proposal:"tasks", inbox_proposal:"inbox", notes_read:"notes", notes_proposal:"notes", career_read:"career", career_proposal:"career", memory_read:"memory", memory_proposal:"memory", projects_read:"projects", projects_proposal:"projects", files_read:"files", shopping_read:"shopping", shopping_proposal:"shopping", travel_read:"travel", travel_proposal:"travel" };
function normalized(definition: AssistantToolDefinition): AssistantToolDefinition { const moduleId=definition.module ?? moduleForGroup[definition.group] ?? "meta"; return { ...definition, module:moduleId, tags:definition.tags ?? [definition.name, moduleId, definition.group, ...definition.description.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) ?? []], relatedTools:definition.relatedTools ?? [], alwaysActive:definition.alwaysActive ?? definition.group === "meta", defaultActive:definition.defaultActive ?? definition.group === "meta" }; }
export const assistantToolRegistry: AssistantToolDefinition[] = assistantToolModules.flatMap((module) => module.definitions.map(normalized));

export function definitionsForGroups(groups: AssistantToolGroup[]) {
  const allowed = new Set(groups);
  return assistantToolRegistry.filter((definition) => allowed.has(definition.group));
}
export function definitionsForNames(names: string[]) { const wanted=new Set(names); return assistantToolRegistry.filter((definition)=>wanted.has(definition.name)); }

/** The registry is the sole model-visible capability source. */
export function capabilityManifest() {
  return Object.values(assistantToolRegistry.reduce<Record<string, AssistantToolDefinition[]>>((all, tool) => {
    (all[tool.module ?? "meta"] ??= []).push(tool); return all;
  }, {})).map((tools) => ({ module: tools[0].module ?? "meta", tools: tools.map(({ name, description, risk }) => ({ name, description, operation: risk })) }));
}

export function assertNoExecuteToolsExposed(groups: AssistantToolGroup[]) {
  const unsafe = definitionsForGroups(groups).filter(
    (definition) => definition.risk === "execute",
  );
  if (unsafe.length)
    throw new Error(`execute_tools_exposed:${unsafe.map((item) => item.name).join(",")}`);
}

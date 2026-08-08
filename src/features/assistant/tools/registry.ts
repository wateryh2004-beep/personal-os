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

export const assistantToolModules: AssistantToolModule[] = [
  searchTools,
  calendarTools,
  taskTools,
  noteTools,
  careerTools,
  memoryTools,
  projectTools,
  fileTools,
  inboxTools,
];

export const assistantToolRegistry: AssistantToolDefinition[] =
  assistantToolModules.flatMap((module) => module.definitions);

export function definitionsForGroups(groups: AssistantToolGroup[]) {
  const allowed = new Set(groups);
  return assistantToolRegistry.filter((definition) => allowed.has(definition.group));
}

export function assertNoExecuteToolsExposed(groups: AssistantToolGroup[]) {
  const unsafe = definitionsForGroups(groups).filter(
    (definition) => definition.risk === "execute",
  );
  if (unsafe.length)
    throw new Error(`execute_tools_exposed:${unsafe.map((item) => item.name).join(",")}`);
}

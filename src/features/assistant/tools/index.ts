import "server-only";
import type { AssistantPolicy } from "../policy";
import { assertNoExecuteToolsExposed, assistantToolModules } from "./registry";
import type { AssistantSupabase } from "./types";

export function buildAssistantTools(input: {
  supabase: AssistantSupabase;
  userId?: string;
  policy: AssistantPolicy;
  timezone?: string;
  runId?: string | null;
  toolNames?: string[];
  onToolsDiscovered?: (toolNames: string[]) => void;
}) {
  assertNoExecuteToolsExposed(input.policy.tools);
  const groups = new Set(input.policy.tools);
  const names = input.toolNames ? new Set(input.toolNames) : null;
  return Object.assign(
    {},
    ...assistantToolModules
      .filter((module) => module.definitions.some((definition) => groups.has(definition.group)))
      .map((module) => {
        const built = module.build({
          supabase: input.supabase,
          userId: input.userId ?? "",
          timezone: input.timezone ?? "Asia/Shanghai",
          runId: input.runId,
          onToolsDiscovered: input.onToolsDiscovered,
        });
        const allowed = new Set(
          module.definitions
            .filter((definition) => groups.has(definition.group) && (!names || names.has(definition.name)))
            .map((definition) => definition.name),
        );
        return Object.fromEntries(Object.entries(built).filter(([name]) => allowed.has(name)));
      }),
  );
}

export { assistantToolRegistry, definitionsForGroups } from "./registry";
export * from "./schemas";

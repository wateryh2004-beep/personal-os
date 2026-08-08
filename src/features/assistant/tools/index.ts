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
}) {
  assertNoExecuteToolsExposed(input.policy.tools);
  const groups = new Set(input.policy.tools);
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
        });
        const allowed = new Set(
          module.definitions
            .filter((definition) => groups.has(definition.group))
            .map((definition) => definition.name),
        );
        return Object.fromEntries(Object.entries(built).filter(([name]) => allowed.has(name)));
      }),
  );
}

export { assistantToolRegistry, definitionsForGroups } from "./registry";
export * from "./schemas";

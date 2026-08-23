import "server-only";
import type { ToolSet } from "ai";
import type { AssistantPolicy } from "../policy";
import {
  assertNoExecuteToolsExposed,
  assistantToolModules,
  definitionsForNames,
} from "./registry";
import type { AssistantSupabase } from "./types";
import type { AssistantStreamSource } from "../stream-metadata";

const moduleHref: Record<string, string> = {
  notes: "/notes",
  calendar: "/calendar",
  tasks: "/tasks",
  career: "/career",
  memory: "/memory",
  projects: "/projects",
  files: "/files",
  reviews: "/reviews",
  briefing: "/briefing",
  inbox: "/inbox",
  shopping: "/shopping",
  travel: "/travel",
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function memoKey(name: string, input: unknown) {
  try {
    return `${name}:${JSON.stringify(stableValue(input))}`;
  } catch {
    return `${name}:${String(input)}`;
  }
}

function sourceTitle(row: Record<string, unknown>) {
  for (const key of ["title", "subject", "name", "displayName", "display_name", "organization", "label"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function collectResultSources(
  result: unknown,
  moduleId: string,
): AssistantStreamSource[] {
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const rows: Record<string, unknown>[] = [];
  for (const key of [
    "sources",
    "results",
    "events",
    "tasks",
    "notes",
    "files",
    "memories",
    "projects",
    "experiences",
    "milestones",
    "opportunities",
    "items",
    "lists",
  ]) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) if (item && typeof item === "object") rows.push(item as Record<string, unknown>);
  }
  if (!rows.length && sourceTitle(record)) rows.push(record);

  const defaultHref = moduleHref[moduleId] ?? null;
  return rows.flatMap((row) => {
    const title = sourceTitle(row);
    if (!title) return [];
    return [{
      title,
      domain: typeof row.domain === "string" ? row.domain : moduleId,
      href: typeof row.href === "string" ? row.href : defaultHref,
    }];
  });
}

type GenericExecute = (input: unknown, options: unknown) => unknown;

export function buildAssistantTools(input: {
  supabase: AssistantSupabase;
  userId?: string;
  policy: AssistantPolicy;
  timezone?: string;
  runId?: string | null;
  toolNames?: string[];
  onToolsDiscovered?: (toolNames: string[]) => void;
  onSources?: (sources: AssistantStreamSource[]) => void;
  onDuplicateRead?: (toolName: string) => void;
}) {
  assertNoExecuteToolsExposed(input.policy.tools);
  const groups = new Set(input.policy.tools);
  const names = input.toolNames ? new Set(input.toolNames) : null;
  const definitions = new Map(
    definitionsForNames(input.toolNames ?? []).map((definition) => [definition.name, definition]),
  );
  const readMemo = new Map<string, Promise<unknown>>();

  const tools = Object.assign(
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
  ) as ToolSet;

  return Object.fromEntries(
    Object.entries(tools).map(([name, toolDefinition]) => {
      const definition = definitions.get(name);
      const executable = toolDefinition as unknown as { execute?: GenericExecute };
      if (!definition || definition.risk !== "read" || typeof executable.execute !== "function") {
        return [name, toolDefinition];
      }

      const originalExecute = executable.execute.bind(toolDefinition);
      return [
        name,
        {
          ...toolDefinition,
          execute: (toolInput: unknown, options: unknown) => {
            const key = memoKey(name, toolInput);
            const existing = readMemo.get(key);
            if (existing) {
              input.onDuplicateRead?.(name);
              return existing;
            }
            const pending = Promise.resolve(originalExecute(toolInput, options)).then((result) => {
              const sources = collectResultSources(result, definition.module ?? "meta");
              if (sources.length) input.onSources?.(sources);
              return result;
            });
            readMemo.set(key, pending);
            return pending;
          },
        },
      ];
    }),
  ) as ToolSet;
}

export { assistantToolRegistry, definitionsForGroups } from "./registry";
export * from "./schemas";

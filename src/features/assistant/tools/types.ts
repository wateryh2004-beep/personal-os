import type { ToolSet } from "ai";
import type { createClient } from "@/lib/supabase/server";
import type { AssistantToolGroup, AssistantToolRisk } from "../types";
import type { PersonalOsModuleId } from "../kernel/types";

export type AssistantSupabase = Awaited<ReturnType<typeof createClient>>;

export type AssistantToolContext = {
  supabase: AssistantSupabase;
  userId: string;
  timezone: string;
  runId?: string | null;
  onToolsDiscovered?: (toolNames: string[]) => void;
};

export type AssistantToolDefinition = {
  name: string;
  group: AssistantToolGroup;
  risk: AssistantToolRisk;
  description: string;
  module?: PersonalOsModuleId | "meta";
  tags?: string[];
  relatedTools?: string[];
  alwaysActive?: boolean;
  defaultActive?: boolean;
};

export type AssistantToolModule = {
  definitions: AssistantToolDefinition[];
  build: (context: AssistantToolContext) => ToolSet;
};
